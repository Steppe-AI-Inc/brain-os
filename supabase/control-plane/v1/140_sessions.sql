-- FACTORY CONTROL PLANE V1 - PART 140: session exchange and credential rotation (WO-2, WO-7; S-2, S-3, S-13).
--
-- WHERE THE SIGNATURE IS CHECKED. PostgreSQL has no Ed25519. The Edge handler verifies the node's signature with the PUBLIC KEY
-- THE REQUEST PRESENTS, and passes this front door that key's sha256 thumbprint. The front door accepts only a thumbprint that is
-- an ACTIVE credential's (thumbprint = sha256(stored public key), a table constraint): a signature valid under the presented key
-- is therefore a signature valid under the stored key. One front door per route; the credential re-checked inside it (S-3).

set local role factory_owner;

-- POST /v1/session: a key-signed assertion (<= 60 s, audience factory-node-api, a fresh jti) exchanged for an opaque session token
-- the Edge generated; only its sha256 is stored. The token never carries authority by itself: every call re-reads the credential.
create function factory.node_session_open(p_thumbprint text, p_jti text, p_iat timestamptz, p_exp timestamptz, p_audience text,
                                          p_token_hash bytea) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare cred factory.node_credentials; comp factory.computers; inserted integer; until timestamptz := now() + interval '600 seconds';
  begin
    perform factory._refuse_superuser();
    if factory._hex64(p_thumbprint) is null or p_token_hash is null or octet_length(p_token_hash) <> 32
       or p_jti is null or p_jti !~ '^[A-Za-z0-9_-]{16,128}$' or p_iat is null or p_exp is null then
      return factory._refusal('bad_assertion', 400, 'a session assertion carries a key, a jti (16..128 base64url characters), iat and exp');
    end if;
    select c.* into cred from factory.node_credentials c where c.key_thumbprint = p_thumbprint for share;
    if cred.credential_id is null then
      return factory._refusal('unknown_key', 401, 'no node credential has this key');
    end if;
    if cred.status <> 'active' then
      perform factory._audit(cred.tenant_id, 'node', cred.principal_id::text, 'node.session', 'credential', cred.credential_id::text,
                             'refused', 'credential_' || cred.status);
      return factory._refusal('credential_' || cred.status, 401, 'this node credential is ' || cred.status || '; no session is issued (S-3)');
    end if;
    select m.* into comp from factory.computers m where m.computer_id = cred.computer_id;
    if comp.archived_at is not null then
      return factory._refusal('computer_archived', 403, 'this computer is archived');
    end if;
    if p_audience is distinct from 'factory-node-api' then
      return factory._refusal('bad_assertion', 401, 'the assertion''s audience is not factory-node-api');
    end if;
    if p_exp <= now() or p_exp - p_iat > interval '60 seconds' or p_exp <= p_iat or p_iat > now() + interval '120 seconds' then
      return factory._refusal('assertion_expired', 401, 'the assertion is expired, longer than 60 s, or from the future (correct the clock from GET /v1/time)');
    end if;
    delete from factory.node_assertion_jtis where credential_id = cred.credential_id and expires_at < now();
    insert into factory.node_assertion_jtis (tenant_id, credential_id, jti, expires_at)
    values (cred.tenant_id, cred.credential_id, p_jti, p_exp + interval '120 seconds')
    on conflict (credential_id, jti) do nothing;
    get diagnostics inserted = row_count;
    if inserted = 0 then
      perform factory._audit(cred.tenant_id, 'node', cred.principal_id::text, 'node.session', 'credential', cred.credential_id::text,
                             'refused', 'assertion_replayed');
      return factory._refusal('assertion_replayed', 401, 'this assertion (jti) was already used');
    end if;
    delete from factory.node_sessions where credential_id = cred.credential_id and expires_at < now() - interval '1 hour';
    insert into factory.node_sessions (tenant_id, credential_id, token_hash, expires_at)
    values (cred.tenant_id, cred.credential_id, p_token_hash, until);
    return jsonb_build_object('ok', true, 'session_expires_at', until, 'server_time', now(),
      'node_id', (select p.node_id from factory.agent_principals p where p.principal_id = cred.principal_id),
      'principal_id', cred.principal_id, 'computer_id', cred.computer_id);
  end $$;

-- CREDENTIAL ROTATE (node-initiated; contract §8 "rotate -> the old credential is superseded"). The session proves the OLD key;
-- the Edge verified the NEW key's signature over the rotate message. The new credential is bound to the SAME principal (S-13: a
-- node can never mint a principal), the old one is superseded and its sessions end. The credential row is locked EXCLUSIVELY, so
-- a rotate and a revoke of the same credential serialize: whichever commits second sees the first.
create function factory.node_credential_rotate(p_token_hash bytea, p_new_thumbprint text, p_new_public_key bytea) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; newc uuid := gen_random_uuid();
  begin
    select * into a from factory._node_session(p_token_hash, true, 'rotate');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    if p_new_public_key is null or octet_length(p_new_public_key) <> 32 or factory._hex64(p_new_thumbprint) is null
       or encode(pg_catalog.sha256(p_new_public_key), 'hex') <> p_new_thumbprint then
      return factory._refusal('bad_request', 400, 'the new public key (32 bytes) and its sha256 thumbprint are required');
    end if;
    if exists (select 1 from factory.node_credentials c where c.key_thumbprint = p_new_thumbprint) then
      return factory._refusal('key_reused', 409, 'this key was registered before; a rotation always brings a new key');
    end if;
    update factory.node_credentials set status = 'superseded', superseded_at = now() where credential_id = ctx.credential_id;
    insert into factory.node_credentials (credential_id, tenant_id, computer_id, principal_id, public_key, key_thumbprint, issued_via,
                                          replaces_credential_id)
    values (newc, ctx.tenant_id, ctx.computer_id, ctx.principal_id, p_new_public_key, p_new_thumbprint, 'rotate', ctx.credential_id);
    update factory.node_sessions set revoked_at = now() where credential_id = ctx.credential_id and revoked_at is null;
    perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.credential_rotate', 'credential', newc::text, 'ok', null,
                           jsonb_build_object('replaces', ctx.credential_id));
    return jsonb_build_object('ok', true, 'credential_id', newc, 'principal_id', ctx.principal_id, 'replaces', ctx.credential_id,
                              'server_time', now());
  end $$;

reset role;

-- FACTORY CONTROL PLANE V1 - PART 100: what every Node API front door shares (WO-2; S-3, S-4, S-7, S-10).
--
-- THE SHAPE OF A NODE CALL. The Edge handler authenticates the transport (it hashes the opaque session token, or verifies an
-- Ed25519 signature against the public key the request presents) and calls EXACTLY ONE front door. The front door, in one
-- transaction:
--   1. resolves the session to its credential and takes a SHARE lock on the credential row, so the call and a revocation are
--      serialized on that row (S-3): a revoke (an UPDATE, which needs the row exclusively) waits for this call to commit, or this
--      call waits for the revoke and then sees `revoked` and is refused. No effect of a revoked credential commits after its
--      revocation;
--   2. derives tenant, computer, principal, node id and the CURRENT envelope from that credential - never from the request body;
--   3. does its one operation.
-- A refusal is a jsonb result {ok:false, refused:<name>, http:<status>, message}; the handler turns it into that HTTP status,
-- naming the cause (P-9). A refusal found before any write commits nothing but its audit row, if it has one.

set local role factory_owner;

create type factory.node_ctx as (
  tenant_id                uuid,
  computer_id              uuid,
  principal_id             uuid,
  credential_id            uuid,
  node_id                  text,
  envelope_version         integer,
  authorized_roles         text[],
  authorized_capabilities  text[],
  allowed_work_types       text[],
  company_ids              uuid[],
  max_concurrent_runs      integer,
  max_heavy                integer,
  preferred_work_class     text,
  draining                 boolean,
  s16a_bound               boolean
);

create function factory._refusal(code text, http integer, message text, extra jsonb default '{}'::jsonb) returns jsonb
  language sql immutable parallel safe set search_path = ''
  as $$ select jsonb_build_object('ok', false, 'refused', code, 'http', http, 'message', message) || coalesce(extra, '{}'::jsonb) $$;

create function factory._audit(p_tenant uuid, p_actor_kind text, p_actor_id text, p_action text, p_target_kind text, p_target_id text,
                               p_outcome text, p_reason text default null, p_detail jsonb default '{}'::jsonb) returns void
  language sql volatile set search_path = ''
  as $$
    insert into factory.audit_events (tenant_id, actor_kind, actor_id, action, target_kind, target_id, outcome, reason, detail)
    values (p_tenant, p_actor_kind, p_actor_id, p_action, p_target_kind, p_target_id, p_outcome, left(p_reason, 300), coalesce(p_detail, '{}'::jsonb))
  $$;

-- superusers are refused (S-10): a front door serves the API logins, never an administrator's session
create function factory._refuse_superuser() returns void
  language plpgsql stable set search_path = ''
  as $$
  begin
    if exists (select 1 from pg_catalog.pg_roles r where r.rolname = session_user and r.rolsuper) then
      raise exception using errcode = '42501', message = 'factory_superuser_refused: the Factory front doors never run for a superuser session (S-10)';
    end if;
  end $$;

-- the credential behind a node call, locked (SHARE per call; EXCLUSIVE for the calls that change the credential itself), and
-- the context derived from it. Refusal names: session_invalid, session_expired, credential_superseded, credential_revoked,
-- computer_archived.
create function factory._node_ctx_for_credential(p_credential_id uuid, p_exclusive boolean, p_op text,
                                                 out ctx factory.node_ctx, out refusal jsonb)
  language plpgsql volatile set search_path = ''
  as $$
  declare cred record; comp record; env record;
  begin
    if p_exclusive then
      select c.* into cred from factory.node_credentials c where c.credential_id = p_credential_id for update;
    else
      select c.* into cred from factory.node_credentials c where c.credential_id = p_credential_id for share;
    end if;
    if not found then
      refusal := factory._refusal('session_invalid', 401, 'no such node credential'); return;
    end if;
    if cred.status <> 'active' then
      perform factory._audit(cred.tenant_id, 'node', cred.principal_id::text, 'node.' || p_op, 'credential', cred.credential_id::text,
                             'refused', 'credential_' || cred.status);
      refusal := factory._refusal('credential_' || cred.status, 401,
        'this node credential is ' || cred.status || '; every node operation is refused (S-3)'); return;
    end if;
    select c.* into comp from factory.computers c where c.computer_id = cred.computer_id;
    if comp.archived_at is not null then
      refusal := factory._refusal('computer_archived', 403, 'this computer is archived: it takes and does no work'); return;
    end if;
    select e.* into env from factory.authorization_envelopes e
     where e.computer_id = comp.computer_id and e.version = comp.current_envelope_version;
    ctx := row(cred.tenant_id, cred.computer_id, cred.principal_id, cred.credential_id,
               (select p.node_id from factory.agent_principals p where p.principal_id = cred.principal_id),
               env.version, env.authorized_roles, env.authorized_capabilities, env.allowed_work_types, env.company_ids,
               env.max_concurrent_runs, env.max_heavy, env.preferred_work_class,
               comp.drain_requested_at is not null, comp.s16a_bound_at is not null)::factory.node_ctx;
  end $$;

create function factory._node_session(p_token_hash bytea, p_exclusive boolean, p_op text, out ctx factory.node_ctx, out refusal jsonb)
  language plpgsql volatile set search_path = ''
  as $$
  declare s record; r record;
  begin
    perform factory._refuse_superuser();
    if p_token_hash is null or octet_length(p_token_hash) <> 32 then
      refusal := factory._refusal('session_invalid', 401, 'a node session token is required'); return;
    end if;
    select x.* into s from factory.node_sessions x where x.token_hash = p_token_hash;
    if not found or s.revoked_at is not null then
      refusal := factory._refusal('session_invalid', 401, 'unknown or ended node session'); return;
    end if;
    if s.expires_at <= now() then
      refusal := factory._refusal('session_expired', 401, 'the node session expired; exchange a new key-signed assertion'); return;
    end if;
    select * into r from factory._node_ctx_for_credential(s.credential_id, p_exclusive, p_op);
    ctx := r.ctx; refusal := r.refusal;
  end $$;

-- GET /v1/time: server time and protocol version only (S-7)
create function factory.node_time() returns jsonb
  language sql stable security definer set search_path = ''
  as $$ select jsonb_build_object('ok', true, 'server_time', now(), 'protocol', 1) $$;

-- revocations the API may deliver to a node (S-5: revocations only - never a key): revoked release ids and digests, revoked key ids
create function factory._revocations(p_tenant uuid) returns jsonb
  language sql stable set search_path = ''
  as $$
    select jsonb_build_object(
      'releases', coalesce((select jsonb_agg(jsonb_build_object('release_id', r.release_id, 'digest', r.digest) order by r.revoked_at)
                              from factory.releases r where r.tenant_id = p_tenant and r.state = 'revoked'), '[]'::jsonb),
      'key_ids', coalesce((select jsonb_agg(v.key_id order by v.revoked_at) from factory.release_revocations v
                            where v.tenant_id = p_tenant and v.kind = 'key'), '[]'::jsonb))
  $$;

-- a size- and shape-checked object from a request body (the Edge also rejects unknown fields; this is the server's own bound)
create function factory._obj(p jsonb, key text) returns jsonb
  language sql immutable parallel safe set search_path = ''
  as $$ select case when jsonb_typeof(p -> key) = 'object' and octet_length((p -> key)::text) <= 8192 then p -> key end $$;

create function factory._hex64(p text) returns text
  language sql immutable parallel safe set search_path = ''
  as $$ select case when p ~ '^[0-9a-f]{64}$' then p end $$;

reset role;

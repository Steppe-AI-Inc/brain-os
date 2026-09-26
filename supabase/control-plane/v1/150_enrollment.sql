-- FACTORY CONTROL PLANE V1 - PART 150: enrollment - the two session-less steps (WO-3; contract §2 Enrollment; S-6, S-12, S-13).
--
-- WHAT SQL SEES. Never the code, never the pepper: the Edge normalizes the code the installer typed, computes
-- HMAC-SHA256(FACTORY_PAIRING_PEPPER, normalized_code) and passes the LOCATOR and that MAC. The MAC is compared in constant time
-- (both sides hashed again under a random per-call key, so the comparison's timing reveals nothing about the stored value).
--
-- LIMITS (S-6), counted server-side from factory.pairing_attempts, every attempt recorded (refused ones included):
--   <= 20 attempts per source IP per hour (the connecting peer as the Edge platform sees it; never a client header),
--   <= 60 per tenant per hour, unknown locators included (an unknown locator counts against the operator tenant),
--   <= 5 failed attempts per locator: the 5th failure revokes that code (PAIRING_REVOKED, attempts_exceeded).
-- A code is one-time and atomically consumed; revoked, expired and consumed codes fail closed, by name. The code is never a
-- credential: enrollment issues a credential only for a key the installer proves it holds.

set local role factory_owner;

create function factory._pairing_limits(p_ip inet, p_tenant uuid) returns text
  language sql stable set search_path = ''
  as $$
    select case
      when (select count(*) from factory.pairing_attempts a where a.peer_ip = p_ip and a.at > now() - interval '1 hour') >= 20 then 'rate_limited_ip'
      when (select count(*) from factory.pairing_attempts a where a.tenant_id = p_tenant and a.at > now() - interval '1 hour') >= 60 then 'rate_limited_tenant'
    end
  $$;

create function factory._attempt(p_tenant uuid, p_ip inet, p_phase text, p_locator text, p_code uuid, p_outcome text) returns void
  language sql volatile set search_path = ''
  as $$ insert into factory.pairing_attempts (tenant_id, peer_ip, phase, locator, code_id, outcome)
        values (p_tenant, p_ip, p_phase, case when p_locator ~ '^[0-9A-HJKMNP-TV-Z]{4,10}$' then p_locator end, p_code, p_outcome) $$;

-- constant-time-equivalent comparison of two 32-byte MACs
create function factory._mac_equal(a bytea, b bytea) returns boolean
  language sql volatile set search_path = ''
  as $$
    with k as (select pg_catalog.uuid_send(gen_random_uuid()) || pg_catalog.uuid_send(gen_random_uuid()) as key)
    select a is not null and b is not null and pg_catalog.sha256(k.key || a) = pg_catalog.sha256(k.key || b) from k
  $$;

-- POST /v1/enroll/start: the installer presents the code and its public key.
-- p_locator / p_mac are null when the Edge could not normalize the code (the attempt still counts).
create function factory.node_enroll_start(p_locator text, p_mac bytea, p_pepper_version integer, p_public_key bytea, p_peer inet, p_meta jsonb)
  returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare
    op uuid := factory._operator_tenant();
    code factory.pairing_codes;
    past factory.pairing_codes;
    limited text;
    enr uuid := gen_random_uuid();
    challenge bytea := pg_catalog.uuid_send(gen_random_uuid()) || pg_catalog.uuid_send(gen_random_uuid());
    thumb text;
  begin
    perform factory._refuse_superuser();
    if p_peer is null then
      return factory._refusal('bad_request', 400, 'the connecting peer address is unknown');
    end if;
    -- the live code for this locator, locked (two installers presenting the same code serialize here)
    if p_locator is not null then
      select c.* into code from factory.pairing_codes c
       where c.locator = p_locator and c.state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED') for update;
    end if;
    limited := factory._pairing_limits(p_peer, coalesce(code.tenant_id, op));
    if limited is not null then
      perform factory._attempt(coalesce(code.tenant_id, op), p_peer, 'start', p_locator, code.code_id, limited);
      return factory._refusal(limited, 429, case limited when 'rate_limited_ip' then 'too many pairing attempts from this address in the last hour (20)'
                                                    else 'too many pairing attempts for this tenant in the last hour (60)' end);
    end if;
    if p_locator is null or p_mac is null or octet_length(p_mac) <> 32 then
      perform factory._attempt(op, p_peer, 'start', null, null, 'malformed');
      return factory._refusal('invalid_code', 401, 'the pairing code is not valid');
    end if;
    if code.code_id is null then
      -- no live code: a consumed / expired / revoked one whose MAC matches is refused by name; anything else is just invalid
      select c.* into past from factory.pairing_codes c
       where c.locator = p_locator and c.pepper_version = p_pepper_version and factory._mac_equal(c.code_mac, p_mac)
       order by c.issued_at desc limit 1;
      perform factory._attempt(coalesce(past.tenant_id, op), p_peer, 'start', p_locator, past.code_id,
                               coalesce(lower(replace(past.state, 'PAIRING_', 'code_')), 'unknown_locator'));
      if past.code_id is not null then
        return factory._refusal(lower(replace(past.state, 'PAIRING_', 'code_')), 401,
          'this pairing code is ' || lower(replace(past.state, 'PAIRING_', '')) || '; ask a Factory admin for a new one');
      end if;
      return factory._refusal('invalid_code', 401, 'the pairing code is not valid');
    end if;
    if code.expires_at <= now() then
      update factory.pairing_codes set state = 'PAIRING_EXPIRED', expired_at = now() where code_id = code.code_id;
      update factory.enrollments set state = 'PAIRING_EXPIRED', state_at = now() where code_id = code.code_id and state = 'PAIRING_STARTED';
      perform factory._attempt(code.tenant_id, p_peer, 'start', p_locator, code.code_id, 'code_expired');
      return factory._refusal('code_expired', 401, 'this pairing code expired; ask a Factory admin for a new one');
    end if;
    if code.pepper_version <> p_pepper_version or not factory._mac_equal(code.code_mac, p_mac) then
      update factory.pairing_codes
         set failed_attempts = failed_attempts + 1,
             state = case when failed_attempts + 1 >= 5 then 'PAIRING_REVOKED' else state end,
             revoked_at = case when failed_attempts + 1 >= 5 then now() else revoked_at end,
             revoke_reason = case when failed_attempts + 1 >= 5 then 'attempts_exceeded' else revoke_reason end
       where code_id = code.code_id;
      if code.failed_attempts + 1 >= 5 then
        update factory.enrollments set state = 'PAIRING_REVOKED', state_at = now() where code_id = code.code_id and state = 'PAIRING_STARTED';
        perform factory._audit(code.tenant_id, 'server', null, 'pairing.revoked', 'pairing_code', code.code_id::text, 'ok', 'attempts_exceeded');
      end if;
      perform factory._attempt(code.tenant_id, p_peer, 'start', p_locator, code.code_id, 'bad_code');
      return factory._refusal('invalid_code', 401, 'the pairing code is not valid');
    end if;
    if p_public_key is null or octet_length(p_public_key) <> 32 then
      perform factory._attempt(code.tenant_id, p_peer, 'start', p_locator, code.code_id, 'bad_key');
      return factory._refusal('bad_request', 400, 'the installer presents its Ed25519 public key (32 bytes)');
    end if;
    thumb := encode(pg_catalog.sha256(p_public_key), 'hex');
    if exists (select 1 from factory.node_credentials c where c.key_thumbprint = thumb) then
      perform factory._attempt(code.tenant_id, p_peer, 'start', p_locator, code.code_id, 'key_reused');
      return factory._refusal('key_reused', 409, 'this key was registered before; enrollment always brings a new key');
    end if;
    -- PAIRING_CODE_ISSUED -> PAIRING_STARTED (nothing issued yet)
    update factory.pairing_codes set state = 'PAIRING_STARTED', started_at = coalesce(started_at, now()) where code_id = code.code_id;
    insert into factory.enrollments (enrollment_id, tenant_id, code_id, computer_id, principal_id, public_key, key_thumbprint, challenge,
                                     challenge_expires_at, reported_fingerprint, reported_hostname)
    values (enr, code.tenant_id, code.code_id, code.computer_id, code.principal_id, p_public_key, thumb, challenge,
            least(code.expires_at, now() + interval '10 minutes'),
            factory._hex64(p_meta ->> 'fingerprint'), left(p_meta ->> 'hostname', 255));
    insert into factory.enrollment_transitions (tenant_id, enrollment_id, from_state, to_state, actor_kind, reason)
    values (code.tenant_id, enr, null, 'PAIRING_STARTED', 'installer', 'code presented');
    perform factory._attempt(code.tenant_id, p_peer, 'start', p_locator, code.code_id, 'ok');
    perform factory._audit(code.tenant_id, 'installer', null, 'pairing.started', 'pairing_code', code.code_id::text, 'ok', null,
                           jsonb_build_object('enrollment_id', enr));
    return jsonb_build_object('ok', true, 'enrollment_id', enr, 'challenge', encode(challenge, 'hex'),
      'computer', (select m.display_name from factory.computers m where m.computer_id = code.computer_id),
      'tenant', (select t.name from factory.tenants t where t.tenant_id = code.tenant_id),
      'expires_at', least(code.expires_at, now() + interval '10 minutes'), 'server_time', now());
  end $$;

-- POST /v1/enroll/complete: the installer proves possession of the key (the Edge verified its signature over
-- "brain-factory-enroll-v1|<enrollment_id>|<challenge hex>|<key thumbprint>"). In ONE transaction: the code is consumed (the first
-- consume stands), PAIRING_VERIFIED -> NODE_ID_ISSUED (the principal's node record) -> NODE_CREDENTIAL_ISSUED (exactly one credential,
-- bound to the presented key and to the principal the code was issued for).
create function factory.node_enroll_complete(p_enrollment uuid, p_thumbprint text, p_challenge bytea, p_peer inet) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare
    e factory.enrollments; code factory.pairing_codes; comp factory.computers; prin factory.agent_principals;
    cred uuid := gen_random_uuid(); limited text;
  begin
    perform factory._refuse_superuser();
    select x.* into e from factory.enrollments x where x.enrollment_id = p_enrollment for update;
    if e.enrollment_id is null then
      if p_peer is not null then perform factory._attempt(factory._operator_tenant(), p_peer, 'complete', null, null, 'unknown_enrollment'); end if;
      return factory._refusal('invalid_enrollment', 401, 'no such enrollment');
    end if;
    limited := factory._pairing_limits(p_peer, e.tenant_id);
    if limited is not null then
      perform factory._attempt(e.tenant_id, p_peer, 'complete', null, e.code_id, limited);
      return factory._refusal(limited, 429, 'too many pairing attempts in the last hour');
    end if;
    select x.* into code from factory.pairing_codes x where x.code_id = e.code_id for update;
    if e.state <> 'PAIRING_STARTED' then
      perform factory._attempt(e.tenant_id, p_peer, 'complete', code.locator, code.code_id, 'enrollment_' || lower(e.state));
      if e.credential_id is not null then
        return factory._refusal('already_enrolled', 409, 'this enrollment already issued its credential', jsonb_build_object('enrollment_state', e.state));
      end if;
      return factory._refusal(lower(replace(e.state, 'PAIRING_', 'code_')), 409, 'this enrollment ended: ' || e.state);
    end if;
    if p_thumbprint is distinct from e.key_thumbprint or p_challenge is distinct from e.challenge then
      perform factory._attempt(e.tenant_id, p_peer, 'complete', code.locator, code.code_id, 'bad_proof');
      return factory._refusal('bad_proof', 401, 'the proof does not bind this enrollment''s key and challenge');
    end if;
    if code.state = 'PAIRING_CONSUMED' then
      perform factory._enrollment_step(e.enrollment_id, 'PAIRING_CONSUMED', 'server', 'another enrollment consumed the code first');
      perform factory._attempt(e.tenant_id, p_peer, 'complete', code.locator, code.code_id, 'code_consumed');
      return factory._refusal('code_consumed', 409, 'the pairing code was already consumed; the first consume stands');
    end if;
    if code.state = 'PAIRING_REVOKED' or code.state = 'PAIRING_EXPIRED' or code.expires_at <= now() or e.challenge_expires_at <= now() then
      if code.state = 'PAIRING_STARTED' then
        update factory.pairing_codes set state = 'PAIRING_EXPIRED', expired_at = now() where code_id = code.code_id;
      end if;
      perform factory._enrollment_step(e.enrollment_id, case when code.state = 'PAIRING_REVOKED' then 'PAIRING_REVOKED' else 'PAIRING_EXPIRED' end, 'server', null);
      perform factory._attempt(e.tenant_id, p_peer, 'complete', code.locator, code.code_id, case when code.state = 'PAIRING_REVOKED' then 'code_revoked' else 'code_expired' end);
      return factory._refusal(case when code.state = 'PAIRING_REVOKED' then 'code_revoked' else 'code_expired' end, 401,
                              'this pairing code is no longer valid; ask a Factory admin for a new one');
    end if;
    select x.* into comp from factory.computers x where x.computer_id = e.computer_id for update;
    if comp.archived_at is not null or comp.current_envelope_version <> code.envelope_version then
      update factory.pairing_codes set state = 'PAIRING_REVOKED', revoked_at = now(),
             revoke_reason = case when comp.archived_at is not null then 'computer_archived' else 'envelope_amended' end
       where code_id = code.code_id;
      perform factory._enrollment_step(e.enrollment_id, 'PAIRING_REVOKED', 'server', 'the computer or its envelope changed');
      return factory._refusal('code_revoked', 401, 'the computer was archived or its envelope amended after the code was issued');
    end if;
    select x.* into prin from factory.agent_principals x where x.principal_id = e.principal_id;
    if exists (select 1 from factory.node_credentials c where c.principal_id = prin.principal_id and c.status = 'active') then
      return factory._refusal('principal_has_active_credential', 409, 'this identity already holds an active credential; revoke it (re-pair) first');
    end if;
    -- one transaction: consume, verify, issue the node id, issue exactly one credential
    update factory.pairing_codes set state = 'PAIRING_CONSUMED', consumed_at = now(), consumed_by_enrollment_id = e.enrollment_id
     where code_id = code.code_id;
    perform factory._enrollment_step(e.enrollment_id, 'PAIRING_VERIFIED', 'server', 'HMAC matched at start; proof of possession verified');
    insert into factory.nodes (node_id, tenant_id, principal_id, computer_id, last_heartbeat_at, machine_fingerprint, reported_hostname)
    values (prin.node_id, e.tenant_id, prin.principal_id, prin.computer_id, to_timestamp(0), e.reported_fingerprint, e.reported_hostname)
    on conflict (node_id) do nothing;
    perform factory._enrollment_step(e.enrollment_id, 'NODE_ID_ISSUED', 'server', prin.node_id);
    insert into factory.node_credentials (credential_id, tenant_id, computer_id, principal_id, public_key, key_thumbprint, issued_via, enrollment_id)
    values (cred, e.tenant_id, e.computer_id, e.principal_id, e.public_key, e.key_thumbprint, 'enrollment', e.enrollment_id);
    update factory.enrollments set state = 'NODE_CREDENTIAL_ISSUED', credential_id = cred, state_at = now() where enrollment_id = e.enrollment_id;
    insert into factory.enrollment_transitions (tenant_id, enrollment_id, from_state, to_state, actor_kind, reason)
    values (e.tenant_id, e.enrollment_id, 'NODE_ID_ISSUED', 'NODE_CREDENTIAL_ISSUED', 'server', 'credential ' || cred);
    if e.reported_fingerprint is not null then
      insert into factory.computer_fingerprints (tenant_id, computer_id, fingerprint) values (e.tenant_id, e.computer_id, e.reported_fingerprint)
        on conflict (computer_id, fingerprint) do update set last_reported_at = now();
    end if;
    perform factory._attempt(e.tenant_id, p_peer, 'complete', code.locator, code.code_id, 'ok');
    perform factory._audit(e.tenant_id, 'installer', null, 'enrollment.credential_issued', 'credential', cred::text, 'ok', null,
                           jsonb_build_object('enrollment_id', e.enrollment_id, 'principal_id', prin.principal_id, 'computer_id', e.computer_id));
    return jsonb_build_object('ok', true, 'credential_id', cred, 'node_id', prin.node_id, 'principal_id', prin.principal_id,
      'computer_id', e.computer_id, 'enrollment_state', 'NODE_CREDENTIAL_ISSUED', 'server_time', now());
  end $$;

reset role;

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
--
-- EVERY REQUEST IS ONE ATTEMPT. The Edge calls these front doors for every request to its two routes - with the name of the refusal
-- it found (a body its schema refuses, a proof that does not verify, the pepper unset) or with no peer address when the platform
-- reported none - so each request writes exactly one pairing_attempts row with its named outcome, counted by the caps.
--
-- ONE ORDER OF LOCKS (contract §9 "conflicting update": one wins, the other gets its named state, never a deadlock). Every writer of
-- these rows takes them in the plane's order: the computer row, then the pairing code, then its enrollments (the admin code actions
-- take the same order: part 200 _admin_computer, _revoke_codes, _end_enrollments; start takes the code, then its enrollments). The
-- S-6 serialization keys (_pairing_serialize) come LAST, after every row lock of the call, so a call that holds a key never waits
-- for a row: an admin action slow on one computer never stalls the pairing of the tenant. The code and the computer are locked FOR NO
-- KEY UPDATE, so the foreign-key checks of an attempt row (FOR KEY SHARE on the code) never wait on them.
-- TIME. Every expiry is judged at the server's clock read AFTER the call's last lock was granted (clock_timestamp()), never at the
-- transaction's start: a consume that waited on a lock past its code's TTL is refused, and consumed_at is the consume's instant.

set local role factory_owner;

-- the S-6 caps. p_ip null: the platform reported no usable peer address - only the tenant cap applies (the attempt still counts there)
create function factory._pairing_limits(p_ip inet, p_tenant uuid) returns text
  language sql volatile set search_path = pg_catalog, pg_temp
  as $$
    select case
      when p_ip is not null and (select count(*) from factory.pairing_attempts a where a.peer_ip = p_ip and a.at > now() - interval '1 hour') >= 20 then 'rate_limited_ip'
      when (select count(*) from factory.pairing_attempts a where a.tenant_id = p_tenant and a.at > now() - interval '1 hour') >= 60 then 'rate_limited_tenant'
    end
  $$;

-- THE S-6 SERIALIZATION POINT: a transaction-scoped lock per peer and per tenant, always in that order (peer, then tenant), taken after
-- every row lock of the call and before the caps are counted. Two attempts of one peer (or one tenant) therefore count one after the
-- other: the second counts once the first has committed its attempt row (each statement of these volatile front doors reads what was
-- committed before it began - PostgreSQL's READ COMMITTED, which neither the Edge nor the migration changes - the primitive and the
-- dependence of the certified claim's plane-wide lock, part 120). No setting is read. Admin actions take none of these keys.
create function factory._pairing_serialize(p_peer inet, p_tenant uuid) returns void
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  begin
    if p_peer is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('factory.pairing.peer'), pg_catalog.hashtext(pg_catalog.host(p_peer)));
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('factory.pairing.tenant'), pg_catalog.hashtext(p_tenant::text));
  end $$;

create function factory._attempt(p_tenant uuid, p_ip inet, p_phase text, p_locator text, p_code uuid, p_outcome text) returns void
  language sql volatile set search_path = pg_catalog, pg_temp
  as $$ insert into factory.pairing_attempts (tenant_id, peer_ip, phase, locator, code_id, outcome)
        values (p_tenant, p_ip, p_phase, case when p_locator ~ '^[0-9A-HJKMNP-TV-Z]{4,10}$' then p_locator end, p_code, p_outcome) $$;

-- a request the Edge refused before calling (its body, its proof): the name it passes, through this list (anything else is bad_request)
create function factory._edge_refusal(p_name text, p_phase text) returns jsonb
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$
    select case
      when p_name = 'identity_from_body_refused' then factory._refusal('identity_from_body_refused', 400,
             'the body may not name identity, tenant or authority: they come from the credential (S-4)')
      when p_name = 'body_too_large' then factory._refusal('body_too_large', 413, 'the body is larger than 65536 bytes')
      when p_name = 'bad_proof' and p_phase = 'complete' then factory._refusal('bad_proof', 401, 'the key did not sign this enrollment''s challenge')
      else factory._refusal('bad_request', 400, 'the request is malformed')
    end
  $$;

-- constant-time-equivalent comparison of two 32-byte MACs
create function factory._mac_equal(a bytea, b bytea) returns boolean
  language sql volatile set search_path = pg_catalog, pg_temp
  as $$
    with k as (select pg_catalog.uuid_send(gen_random_uuid()) || pg_catalog.uuid_send(gen_random_uuid()) as key)
    select a is not null and b is not null and pg_catalog.sha256(k.key || a) = pg_catalog.sha256(k.key || b) from k
  $$;

-- POST /v1/enroll/start: the installer presents the code and its public key.
-- p_locator / p_mac are null when the Edge could not normalize the code (the attempt still counts). p_peer is null when the platform
-- reported no usable peer address. p_refusal names what the Edge refused (then p_mac is null and the request is only recorded).
create function factory.node_enroll_start(p_locator text, p_mac bytea, p_pepper_version integer, p_public_key bytea, p_peer inet, p_meta jsonb,
                                          p_refusal text)
  returns jsonb
  language plpgsql volatile security definer set search_path = pg_catalog, pg_temp set lock_timeout = '15s'
  as $$
  declare
    op uuid := factory._operator_tenant();
    code factory.pairing_codes;
    past factory.pairing_codes;
    latest factory.pairing_codes;
    ten uuid;
    seen uuid;
    limited text;
    shown jsonb;
    enr uuid := gen_random_uuid();
    challenge bytea := pg_catalog.uuid_send(gen_random_uuid()) || pg_catalog.uuid_send(gen_random_uuid());
    thumb text;
    start_at timestamptz;
  begin
    perform factory._refuse_superuser();   -- S-10 (enroll/start)
    -- 1. the live code for this locator, locked (two installers presenting the same code serialize here); only for a request that
    --    will be judged - a refused request or a platform condition locks no row
    if p_locator is not null and p_mac is not null and p_peer is not null and p_refusal is null then
      select c.* into code from factory.pairing_codes c
       where c.locator = p_locator and c.state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED') for no key update;
    end if;
    -- 2. ATTRIBUTION (read, never locked): the live code; else a no-longer-live code of this locator whose MAC matches; else the latest
    --    code issued on this locator; else the operator tenant. An attempt on a revoked locator stays linked to its code and tenant.
    if code.code_id is null and p_locator is not null then
      if p_mac is not null and p_refusal is null then
        select c.* into past from factory.pairing_codes c
         where c.locator = p_locator and c.pepper_version = p_pepper_version and factory._mac_equal(c.code_mac, p_mac)
         order by c.issued_at desc limit 1;
      end if;
      select c.* into latest from factory.pairing_codes c where c.locator = p_locator order by c.issued_at desc, c.code_id limit 1;
    end if;
    ten := coalesce(code.tenant_id, past.tenant_id, latest.tenant_id, op);
    seen := coalesce(code.code_id, past.code_id, latest.code_id);
    -- 3. the S-6 serialization point, after the row lock
    perform factory._pairing_serialize(p_peer, ten);
    -- 4. platform conditions, named before the caps (the cause, never a 429 in its place), recorded and counted on the tenant
    if p_peer is null then
      perform factory._attempt(ten, null, 'start', p_locator, seen, 'peer_unavailable');
      return factory._refusal('peer_unavailable', 503,
        'the platform did not report the connecting peer address: pairing is refused (the per-address limit could not be kept); nothing else is affected');
    end if;
    if p_refusal = 'pepper_unavailable' then
      perform factory._attempt(ten, p_peer, 'start', p_locator, seen, 'pepper_unavailable');
      return factory._refusal('pepper_unavailable', 503, 'pairing is unavailable: the pairing pepper is not configured');
    end if;
    -- 5. the caps
    limited := factory._pairing_limits(p_peer, ten);
    if limited is not null then
      perform factory._attempt(ten, p_peer, 'start', p_locator, seen, limited);
      return factory._refusal(limited, 429, case limited when 'rate_limited_ip' then 'too many pairing attempts from this address in the last hour (20)'
                                                    else 'too many pairing attempts for this tenant in the last hour (60)' end);
    end if;
    -- 6. a request the Edge refused: recorded under its own name
    if p_refusal is not null then
      shown := factory._edge_refusal(p_refusal, 'start');
      perform factory._attempt(ten, p_peer, 'start', p_locator, seen, shown ->> 'refused');
      return shown;
    end if;
    if p_locator is null or p_mac is null or octet_length(p_mac) <> 32 then
      perform factory._attempt(ten, p_peer, 'start', p_locator, seen, 'malformed');
      return factory._refusal('invalid_code', 401, 'the pairing code is not valid');
    end if;
    if code.code_id is null then
      -- no live code: a consumed / expired / revoked one whose MAC matches is refused by name; anything else is just invalid (the answer
      -- never says whether the locator exists), and is recorded against the locator's latest code when it has one
      perform factory._attempt(ten, p_peer, 'start', p_locator, seen,
                               case when past.code_id is not null then lower(replace(past.state, 'PAIRING_', 'code_'))
                                    when latest.code_id is not null then 'bad_code_not_live' else 'unknown_locator' end);
      if past.code_id is not null then
        return factory._refusal(lower(replace(past.state, 'PAIRING_', 'code_')), 401,
          'this pairing code is ' || lower(replace(past.state, 'PAIRING_', '')) || '; ask a Factory admin for a new one');
      end if;
      return factory._refusal('invalid_code', 401, 'the pairing code is not valid');
    end if;
    -- 7. the live code, judged at the server's clock after the lock waits
    start_at := pg_catalog.clock_timestamp();
    if code.expires_at <= start_at then
      update factory.pairing_codes set state = 'PAIRING_EXPIRED', expired_at = start_at where code_id = code.code_id;
      perform factory._end_enrollments(array[code.code_id], 'PAIRING_EXPIRED', 'server', 'pairing code expired (its TTL elapsed)');
      perform factory._attempt(ten, p_peer, 'start', p_locator, code.code_id, 'code_expired');
      return factory._refusal('code_expired', 401, 'this pairing code expired; ask a Factory admin for a new one');
    end if;
    if code.pepper_version <> p_pepper_version or not factory._mac_equal(code.code_mac, p_mac) then
      update factory.pairing_codes
         set failed_attempts = failed_attempts + 1,
             state = case when failed_attempts + 1 >= 5 then 'PAIRING_REVOKED' else state end,
             revoked_at = case when failed_attempts + 1 >= 5 then start_at else revoked_at end,
             revoke_reason = case when failed_attempts + 1 >= 5 then 'attempts_exceeded' else revoke_reason end
       where code_id = code.code_id;
      if code.failed_attempts + 1 >= 5 then
        perform factory._end_enrollments(array[code.code_id], 'PAIRING_REVOKED', 'server', 'pairing code revoked: attempts_exceeded');
        perform factory._audit(code.tenant_id, 'server', null, 'pairing.revoked', 'pairing_code', code.code_id::text, 'ok', 'attempts_exceeded');
      end if;
      perform factory._attempt(ten, p_peer, 'start', p_locator, code.code_id, 'bad_code');
      return factory._refusal('invalid_code', 401, 'the pairing code is not valid');
    end if;
    if p_public_key is null or octet_length(p_public_key) <> 32 then
      perform factory._attempt(ten, p_peer, 'start', p_locator, code.code_id, 'bad_key');
      return factory._refusal('bad_request', 400, 'the installer presents its Ed25519 public key (32 bytes)');
    end if;
    thumb := encode(pg_catalog.sha256(p_public_key), 'hex');
    if exists (select 1 from factory.node_credentials c where c.key_thumbprint = thumb) then
      perform factory._attempt(ten, p_peer, 'start', p_locator, code.code_id, 'key_reused');
      return factory._refusal('key_reused', 409, 'this key was registered before; enrollment always brings a new key');
    end if;
    -- PAIRING_CODE_ISSUED -> PAIRING_STARTED (nothing issued yet); the enrollment's first transition is written by the log (part 080)
    update factory.pairing_codes set state = 'PAIRING_STARTED', started_at = coalesce(started_at, start_at) where code_id = code.code_id;
    insert into factory.enrollments (enrollment_id, tenant_id, code_id, computer_id, principal_id, public_key, key_thumbprint, challenge,
                                     challenge_expires_at, reported_fingerprint, reported_hostname, state_actor, state_reason)
    values (enr, code.tenant_id, code.code_id, code.computer_id, code.principal_id, p_public_key, thumb, challenge,
            least(code.expires_at, start_at + interval '10 minutes'),
            factory._hex64(p_meta ->> 'fingerprint'), left(p_meta ->> 'hostname', 255), 'installer', 'code presented');
    perform factory._attempt(ten, p_peer, 'start', p_locator, code.code_id, 'ok');
    perform factory._audit(code.tenant_id, 'installer', null, 'pairing.started', 'pairing_code', code.code_id::text, 'ok', null,
                           jsonb_build_object('enrollment_id', enr));
    return jsonb_build_object('ok', true, 'enrollment_id', enr, 'challenge', encode(challenge, 'hex'),
      'computer', (select m.display_name from factory.computers m where m.computer_id = code.computer_id),
      'tenant', (select t.name from factory.tenants t where t.tenant_id = code.tenant_id),
      'expires_at', least(code.expires_at, start_at + interval '10 minutes'), 'server_time', now());
  end $$;

-- POST /v1/enroll/complete: the installer proves possession of the key (the Edge verified its signature over
-- "brain-factory-enroll-v1|<enrollment_id>|<challenge hex>|<key thumbprint>"). In ONE transaction: the code is consumed (the first
-- consume stands), PAIRING_VERIFIED -> NODE_ID_ISSUED (the principal's node record) -> NODE_CREDENTIAL_ISSUED (exactly one credential,
-- bound to the presented key and to the principal the code was issued for). p_peer and p_refusal as for start.
create function factory.node_enroll_complete(p_enrollment uuid, p_thumbprint text, p_challenge bytea, p_peer inet, p_refusal text) returns jsonb
  language plpgsql volatile security definer set search_path = pg_catalog, pg_temp set lock_timeout = '15s'
  as $$
  declare
    e0 factory.enrollments; e factory.enrollments; code factory.pairing_codes; comp factory.computers; prin factory.agent_principals;
    cred uuid := gen_random_uuid(); limited text; ctenant uuid; shown jsonb; consume_at timestamptz; why text;
  begin
    perform factory._refuse_superuser();   -- S-10 (enroll/complete)
    -- the enrollment as it stands (read, never locked): its tenant and code attribute the attempt; its computer names the first lock
    if p_enrollment is not null then
      select x.* into e0 from factory.enrollments x where x.enrollment_id = p_enrollment;
    end if;
    ctenant := coalesce(e0.tenant_id, factory._operator_tenant());
    -- THE PLANE'S LOCK ORDER - the computer row, then the pairing code, then the enrollment - taken only by a request that will be
    -- judged; then the computer's row for the fingerprint this enrollment reported, which the consume writes (so the consume waits on
    -- nothing after the clock is read below, save a first insert of that fingerprint racing it)
    if e0.enrollment_id is not null and p_peer is not null and p_refusal is null then
      select x.* into comp from factory.computers x where x.computer_id = e0.computer_id for no key update;
      select x.* into code from factory.pairing_codes x where x.code_id = e0.code_id for no key update;
      select x.* into e from factory.enrollments x where x.enrollment_id = e0.enrollment_id for update;
      if e.reported_fingerprint is not null then
        perform 1 from factory.computer_fingerprints f where f.computer_id = e.computer_id and f.fingerprint = e.reported_fingerprint for update;
      end if;
    end if;
    -- the S-6 serialization point, after every row lock
    perform factory._pairing_serialize(p_peer, ctenant);
    if p_peer is null then
      perform factory._attempt(ctenant, null, 'complete', null, e0.code_id, 'peer_unavailable');
      return factory._refusal('peer_unavailable', 503,
        'the platform did not report the connecting peer address: pairing is refused (the per-address limit could not be kept); nothing else is affected');
    end if;
    limited := factory._pairing_limits(p_peer, ctenant);
    if limited is not null then
      perform factory._attempt(ctenant, p_peer, 'complete', null, e0.code_id, limited);
      return factory._refusal(limited, 429, 'too many pairing attempts in the last hour');
    end if;
    if p_refusal is not null then
      shown := factory._edge_refusal(p_refusal, 'complete');
      perform factory._attempt(ctenant, p_peer, 'complete', null, e0.code_id, shown ->> 'refused');
      return shown;
    end if;
    if e0.enrollment_id is null then
      perform factory._attempt(ctenant, p_peer, 'complete', null, null, 'unknown_enrollment');
      return factory._refusal('invalid_enrollment', 401, 'no such enrollment');
    end if;
    -- the consume's instant: the server's clock after the last lock was granted
    consume_at := pg_catalog.clock_timestamp();
    if e.state <> 'PAIRING_STARTED' then
      perform factory._attempt(ctenant, p_peer, 'complete', code.locator, code.code_id, 'enrollment_' || lower(e.state));
      if e.credential_id is not null then
        return factory._refusal('already_enrolled', 409, 'this enrollment already issued its credential', jsonb_build_object('enrollment_state', e.state));
      end if;
      return factory._refusal(lower(replace(e.state, 'PAIRING_', 'code_')), 409, 'this enrollment ended: ' || e.state);
    end if;
    if p_thumbprint is distinct from e.key_thumbprint or p_challenge is distinct from e.challenge then
      perform factory._attempt(ctenant, p_peer, 'complete', code.locator, code.code_id, 'bad_proof');
      return factory._refusal('bad_proof', 401, 'the proof does not bind this enrollment''s key and challenge');
    end if;
    if code.state = 'PAIRING_CONSUMED' then
      perform factory._enrollment_step(e.enrollment_id, 'PAIRING_CONSUMED', 'server', 'another enrollment consumed the code first');
      perform factory._attempt(ctenant, p_peer, 'complete', code.locator, code.code_id, 'code_consumed');
      return factory._refusal('code_consumed', 409, 'the pairing code was already consumed; the first consume stands');
    end if;
    -- the CODE ends only when it is revoked or its TTL has elapsed (contract §2): then every enrollment started from it ends with it
    if code.state = 'PAIRING_REVOKED' or code.state = 'PAIRING_EXPIRED' or code.expires_at <= consume_at then
      if code.state = 'PAIRING_STARTED' then
        update factory.pairing_codes set state = 'PAIRING_EXPIRED', expired_at = consume_at where code_id = code.code_id;
        perform factory._end_enrollments(array[code.code_id], 'PAIRING_EXPIRED', 'server', 'pairing code expired (its TTL elapsed)');
      end if;
      perform factory._enrollment_step(e.enrollment_id, case when code.state = 'PAIRING_REVOKED' then 'PAIRING_REVOKED' else 'PAIRING_EXPIRED' end, 'server', null);
      perform factory._attempt(ctenant, p_peer, 'complete', code.locator, code.code_id, case when code.state = 'PAIRING_REVOKED' then 'code_revoked' else 'code_expired' end);
      return factory._refusal(case when code.state = 'PAIRING_REVOKED' then 'code_revoked' else 'code_expired' end, 401,
                              'this pairing code is no longer valid; ask a Factory admin for a new one');
    end if;
    -- only THIS enrollment's challenge window elapsed: the enrollment ends, the code stays live for a new start
    if e.challenge_expires_at <= consume_at then
      perform factory._enrollment_step(e.enrollment_id, 'PAIRING_EXPIRED', 'server', 'the enrollment''s challenge expired');
      perform factory._attempt(ctenant, p_peer, 'complete', code.locator, code.code_id, 'enrollment_expired');
      return factory._refusal('enrollment_expired', 401,
        'this enrollment''s challenge expired before it was completed; start again with the same pairing code, which is still valid');
    end if;
    if comp.archived_at is not null or comp.current_envelope_version <> code.envelope_version then
      why := case when comp.archived_at is not null then 'computer_archived' else 'envelope_amended' end;
      update factory.pairing_codes set state = 'PAIRING_REVOKED', revoked_at = consume_at, revoke_reason = why where code_id = code.code_id;
      perform factory._end_enrollments(array[code.code_id], 'PAIRING_REVOKED', 'server', 'pairing code revoked: ' || why);
      perform factory._attempt(ctenant, p_peer, 'complete', code.locator, code.code_id, 'code_revoked');
      perform factory._audit(ctenant, 'server', null, 'pairing.revoked', 'pairing_code', code.code_id::text, 'ok', why,
                             jsonb_build_object('enrollment_id', e.enrollment_id, 'computer_id', e.computer_id));
      return factory._refusal('code_revoked', 401, 'the computer was archived or its envelope amended after the code was issued');
    end if;
    select x.* into prin from factory.agent_principals x where x.principal_id = e.principal_id;
    if exists (select 1 from factory.node_credentials c where c.principal_id = prin.principal_id and c.status = 'active') then
      perform factory._attempt(ctenant, p_peer, 'complete', code.locator, code.code_id, 'principal_has_active_credential');
      return factory._refusal('principal_has_active_credential', 409, 'this identity already holds an active credential; revoke it (re-pair) first');
    end if;
    -- the principal's node row is its own: an existing factory.nodes row under its node id (re-pair, restore) must already be this
    -- principal's. Any other row is never adopted (contract §1): the call fails and nothing of it commits.
    if exists (select 1 from factory.nodes n where n.node_id = prin.node_id and n.principal_id is distinct from prin.principal_id) then
      raise exception using errcode = 'P0001', message =
        'factory_node_identity_conflict: a node row under this principal''s node id belongs to no principal or another one; it is never adopted';
    end if;
    -- one transaction: consume, verify, issue the node id, issue exactly one credential
    update factory.pairing_codes set state = 'PAIRING_CONSUMED', consumed_at = consume_at, consumed_by_enrollment_id = e.enrollment_id
     where code_id = code.code_id;
    perform factory._enrollment_step(e.enrollment_id, 'PAIRING_VERIFIED', 'server', 'HMAC matched at start; proof of possession verified');
    insert into factory.nodes (node_id, tenant_id, principal_id, computer_id, last_heartbeat_at, machine_fingerprint, reported_hostname)
    values (prin.node_id, e.tenant_id, prin.principal_id, prin.computer_id, to_timestamp(0), e.reported_fingerprint, e.reported_hostname)
    on conflict (node_id) do nothing;
    perform factory._enrollment_step(e.enrollment_id, 'NODE_ID_ISSUED', 'server', prin.node_id);
    insert into factory.node_credentials (credential_id, tenant_id, computer_id, principal_id, public_key, key_thumbprint, issued_via, enrollment_id)
    values (cred, e.tenant_id, e.computer_id, e.principal_id, e.public_key, e.key_thumbprint, 'enrollment', e.enrollment_id);
    update factory.enrollments set state = 'NODE_CREDENTIAL_ISSUED', credential_id = cred, state_actor = 'server', state_reason = 'credential ' || cred,
                                   state_at = now()
     where enrollment_id = e.enrollment_id;
    if e.reported_fingerprint is not null then
      insert into factory.computer_fingerprints (tenant_id, computer_id, fingerprint) values (e.tenant_id, e.computer_id, e.reported_fingerprint)
        on conflict (computer_id, fingerprint) do update set last_reported_at = now();
    end if;
    perform factory._attempt(ctenant, p_peer, 'complete', code.locator, code.code_id, 'ok');
    perform factory._audit(e.tenant_id, 'installer', null, 'enrollment.credential_issued', 'credential', cred::text, 'ok', null,
                           jsonb_build_object('enrollment_id', e.enrollment_id, 'principal_id', prin.principal_id, 'computer_id', e.computer_id));
    return jsonb_build_object('ok', true, 'credential_id', cred, 'node_id', prin.node_id, 'principal_id', prin.principal_id,
      'computer_id', e.computer_id, 'enrollment_state', 'NODE_CREDENTIAL_ISSUED', 'server_time', now());
  end $$;

reset role;

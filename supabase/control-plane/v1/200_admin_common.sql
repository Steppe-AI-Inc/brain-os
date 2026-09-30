-- FACTORY CONTROL PLANE V1 - PART 200: what every Admin API front door shares (WO-7, WO-8; S-8, S-9, S-14; contract §4, §9).
--
-- WHO IS A FACTORY ADMIN (S-8; CR-001, CR-003 ratified). Both, on every call:
--   (a) the live Brain OS role founder | holding_admin - the Admin API re-derives it from the caller's OWN Brain OS token on this call
--       and passes it in; nothing here trusts a role stored on the plane or sent in a body;
--   (b) a row in factory.tenant_admins for that caller - which also gives the tenant and the TIER.
-- Founder-only actions (granting release_broker; publishing, superseding or revoking a release; revoking a release key) need tier
-- `founder` AND live role founder: a self-updated profiles.role (side finding S1) never reaches them, and a tier-founder row whose
-- live role is no longer founder is refused. Every refusal is audited and returns no data (no existence leak).
-- ONE DEFINITION of that rule, factory._founder_only. An action that is founder-only by what it IS (publish, revoke a release or a
-- key) or by what its body asks (Add Computer with release_broker) is decided in factory._admin. An action whose founder-only status
-- depends on PLANE STATE (an envelope amendment that adds release_broker to the envelope in force) is decided by its front door
-- AFTER that front door's tenant-filtered row lock, on the locked row: never from a read taken before the lock, before the caller is
-- authorized, or outside the caller's tenant (B-4).
-- Every action is one transaction, audited, and answers "already" when its target is already in the requested state.

set local role factory_owner;

create type factory.admin_ctx as (tenant_id uuid, actor uuid, tier text, live_role text);

-- FOUNDER-ONLY (S-8, CR-003): null when the caller holds tier founder AND the live role founder; otherwise the audited refusal.
-- Fails closed: a missing tier or live role is not founder.
create function factory._founder_only(p_ctx factory.admin_ctx, p_op text, p_computer uuid default null) returns jsonb
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  begin
    if p_ctx.tier = 'founder' and p_ctx.live_role = 'founder' then return null; end if;
    perform factory._audit(p_ctx.tenant_id, 'admin', p_ctx.actor::text, 'admin.' || p_op, case when p_computer is not null then 'computer' end,
                           p_computer::text, 'refused', 'founder_only', jsonb_build_object('tier', p_ctx.tier, 'live_role', p_ctx.live_role));
    return factory._refusal('founder_only', 403,
      'founder-only: it needs tier founder in tenant_admins AND the live Brain OS role founder (S-8, CR-003)');
  end $$;

create function factory._admin(p_actor uuid, p_live_role text, p_body jsonb, p_op text, p_founder_only boolean,
                               out ctx factory.admin_ctx, out refusal jsonb)
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  declare n integer; t uuid; tr text; want uuid := case when factory._is_uuid(p_body ->> 'tenant_id') then (p_body ->> 'tenant_id')::uuid end;
  begin
    perform factory._refuse_superuser();
    if p_actor is null then
      refusal := factory._refusal('not_authenticated', 401, 'a Brain OS session is required'); return;
    end if;
    if p_live_role is null or p_live_role not in ('founder', 'holding_admin') then
      perform factory._audit(factory._operator_tenant(), 'admin', p_actor::text, 'admin.' || p_op, null, null, 'refused', 'live_role',
                             jsonb_build_object('live_role', left(p_live_role, 40)));
      refusal := factory._refusal('not_authorized', 403, 'not authorized for Factory administration'); return;
    end if;
    select count(*) into n from factory.tenant_admins a where a.auth_user_id = p_actor and (want is null or a.tenant_id = want);
    if n = 0 then
      perform factory._audit(factory._operator_tenant(), 'admin', p_actor::text, 'admin.' || p_op, null, null, 'refused', 'not_in_tenant_admins');
      refusal := factory._refusal('not_authorized', 403, 'not authorized for Factory administration'); return;
    end if;
    if n > 1 then
      refusal := factory._refusal('tenant_required', 400, 'you administer several tenants: name tenant_id'); return;
    end if;
    select a.tenant_id, a.tier into t, tr from factory.tenant_admins a where a.auth_user_id = p_actor and (want is null or a.tenant_id = want);
    ctx := row(t, p_actor, tr, p_live_role)::factory.admin_ctx;
    -- founder-only by what the action is or asks (p_founder_only is a constant or derived from the body, never from plane state)
    if p_founder_only then
      refusal := factory._founder_only(ctx, p_op);
      if refusal is not null then ctx := null; return; end if;
    end if;
  end $$;

-- a uuid from a body field, or null
create function factory._uuid(p jsonb, key text) returns uuid
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select case when p ->> key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (p ->> key)::uuid end $$;

-- an envelope from an Admin API body: validated here so a bad value is refused by name, not by a constraint
create function factory._envelope_input(p jsonb, out problem text, out roles text[], out caps text[], out types text[], out companies uuid[],
                                        out max_runs integer, out max_heavy integer, out pref text)
  language plpgsql immutable set search_path = pg_catalog, pg_temp
  as $$
  begin
    if p is null or jsonb_typeof(p) <> 'object' then problem := 'envelope is an object'; return; end if;
    if exists (select 1 from jsonb_object_keys(p) k where k not in ('roles', 'capabilities', 'work_types', 'company_ids',
                 'max_concurrent_runs', 'max_heavy', 'preferred_work_class')) then
      problem := 'envelope has an unknown field'; return;
    end if;
    if jsonb_typeof(p -> 'roles') <> 'array' then problem := 'envelope.roles is required (generic, verifier, release_broker)'; return; end if;
    roles := array(select distinct x from jsonb_array_elements_text(p -> 'roles') x);
    if cardinality(roles) = 0 or not (roles <@ array['generic', 'verifier', 'release_broker']) then
      problem := 'envelope.roles holds generic, verifier and / or release_broker'; return;
    end if;
    caps := case when jsonb_typeof(p -> 'capabilities') = 'array' then array(select x from jsonb_array_elements_text(p -> 'capabilities') x) else '{}' end;
    if not factory._envelope_capabilities_ok(caps) then
      problem := 'envelope.capabilities: well-formed names, no duplicates, never the reserved factory-enrolled-v1'; return;
    end if;
    types := case when jsonb_typeof(p -> 'work_types') = 'array' then array(select x from jsonb_array_elements_text(p -> 'work_types') x) end;
    if types is not null and not factory._work_names_ok(types) then problem := 'envelope.work_types: 1..32 well-formed names'; return; end if;
    if jsonb_typeof(p -> 'company_ids') = 'array' then
      if exists (select 1 from jsonb_array_elements_text(p -> 'company_ids') x where not factory._is_uuid(x)) then
        problem := 'envelope.company_ids are uuids'; return;
      end if;
      companies := array(select distinct x::uuid from jsonb_array_elements_text(p -> 'company_ids') x);
      if cardinality(companies) = 0 then companies := null; problem := 'envelope.company_ids narrows to at least one company (omit it to not narrow)'; return; end if;
    end if;
    max_runs := coalesce(factory._jint(p, 'max_concurrent_runs'), 1);
    if max_runs not between 1 and 32 then problem := 'envelope.max_concurrent_runs is 1..32'; return; end if;
    max_heavy := coalesce(factory._jint(p, 'max_heavy'), least(1, max_runs));
    if max_heavy < 0 or max_heavy > max_runs then problem := 'envelope.max_heavy is 0..max_concurrent_runs'; return; end if;
    pref := p ->> 'preferred_work_class';
    if pref is not null and pref !~ '^[a-z0-9][a-z0-9_.-]{0,63}$' then problem := 'envelope.preferred_work_class is a work-type name'; return; end if;
  end $$;

create function factory._envelope_json(e factory.authorization_envelopes) returns jsonb
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select jsonb_build_object('version', e.version, 'roles', to_jsonb(e.authorized_roles), 'capabilities', to_jsonb(e.authorized_capabilities),
          'work_types', to_jsonb(e.allowed_work_types), 'company_ids', to_jsonb(e.company_ids), 'max_concurrent_runs', e.max_concurrent_runs,
          'max_heavy', e.max_heavy, 'preferred_work_class', e.preferred_work_class, 'created_at', e.created_at, 'created_by', e.created_by,
          'reason', e.reason) $$;

-- LIVENESS, DERIVED, NEVER STORED (contract §1): ALIVE-and-fresh, STALE after 180 s without a heartbeat, OFFLINE after 30 min
create function factory._liveness(hb timestamptz) returns text
  language sql stable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select case when hb is null or hb <= now() - interval '30 minutes' then 'OFFLINE'
                    when hb <= now() - interval '180 seconds' then 'STALE' else 'FRESH' end $$;

-- THE DERIVED COMPUTER STATE (contract §1 "Derived"), from its principals' states:
--   ARCHIVED when the computer is archived; otherwise ALIVE when any principal is ALIVE (liveness and the runtime state are derived
--   separately and shown with it); otherwise CREDENTIAL_REVOKED when every principal is CREDENTIAL_REVOKED; otherwise the highest state
--   of a principal that is not CREDENTIAL_REVOKED, in the contract's order (lowest first) below.
create function factory._principal_state_rank(s text) returns integer
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select array_position(array['UNENROLLED', 'PAIRING_EXPIRED', 'PAIRING_REVOKED', 'PAIRING_CODE_ISSUED', 'PAIRING_STARTED',
                                     'PAIRING_VERIFIED', 'NODE_ID_ISSUED', 'NODE_CREDENTIAL_ISSUED', 'RUNTIME_INSTALLING', 'INSTALL_FAILED',
                                     'REGISTERING', 'REGISTRATION_FAILED']::text[], s) $$;

create function factory._derived_computer_state(p_archived boolean, p_states text[]) returns text
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$
    select case
      when p_archived then 'ARCHIVED'
      when 'ALIVE' = any (coalesce(p_states, '{}'::text[])) then 'ALIVE'
      when cardinality(coalesce(p_states, '{}'::text[])) > 0 and 'CREDENTIAL_REVOKED' = all (p_states) then 'CREDENTIAL_REVOKED'
      else coalesce((select s from unnest(p_states) s where s is distinct from 'CREDENTIAL_REVOKED'
                      order by factory._principal_state_rank(s) desc nulls last limit 1), 'UNENROLLED')
    end
  $$;

-- ONE PRINCIPAL's state (contract §1): that of its active credential (the credential's enrollment walk - a rotated credential carries
-- the walk it came from - so ALIVE once registered); with none, that of its latest pairing code or credential (a live code past its
-- TTL reads PAIRING_EXPIRED; a revoked credential CREDENTIAL_REVOKED); UNENROLLED with neither. The runtime phase and the liveness
-- derived from the heartbeat (FRESH / STALE after 180 s / OFFLINE after 30 min) are shown with it, never in its place.
create function factory._principal_state(p factory.agent_principals) returns jsonb
  language sql stable set search_path = pg_catalog, pg_temp
  as $$
    with cred as (select c.* from factory.node_credentials c where c.principal_id = p.principal_id order by (c.status = 'active') desc, c.issued_at desc limit 1),
         enr as (select e.* from factory.enrollments e where e.principal_id = p.principal_id order by e.started_at desc limit 1),
         code as (select k.* from factory.pairing_codes k where k.principal_id = p.principal_id order by k.issued_at desc limit 1),
         n as (select x.* from factory.nodes x where x.node_id = p.node_id),
         st as (
           select case
             when (select status from cred) = 'active' then coalesce(factory._credential_walk_state((select credential_id from cred)), 'UNENROLLED')
             when (select code_id from code) is not null
                  and ((select credential_id from cred) is null or (select issued_at from code) >= (select issued_at from cred)) then
               case when (select state from code) in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED') and (select expires_at from code) <= now()
                    then 'PAIRING_EXPIRED' else (select state from code) end
             when (select credential_id from cred) is not null then 'CREDENTIAL_REVOKED'
             else 'UNENROLLED' end as s)
    select jsonb_build_object(
      'principal_id', p.principal_id, 'node_id', p.node_id, 'created_via', p.created_via, 'created_at', p.created_at,
      'state', (select s from st),
      'credential', (select jsonb_build_object('credential_id', credential_id, 'status', status, 'key_thumbprint', key_thumbprint,
                       'issued_at', issued_at, 'issued_via', issued_via, 'revoked_at', revoked_at, 'revoke_reason', revoke_reason,
                       'rotation_requested', rotation_requested_at is not null) from cred),
      'enrollment_state', (select state from enr),
      'code', (select jsonb_build_object('code_id', code_id, 'state', state, 'purpose', purpose, 'expires_at', expires_at,
                 'failed_attempts', failed_attempts) from code),
      'runtime', (select jsonb_build_object('phase', runtime_phase, 'liveness', factory._liveness(last_heartbeat_at),
                    'heartbeat_age_s', case when last_heartbeat_at > to_timestamp(0) then round(extract(epoch from now() - last_heartbeat_at)) end,
                    'runtime_version', runtime_version, 'runtime_digest', runtime_digest, 'release_id', release_id,
                    'reported_hostname', reported_hostname, 'reported_os', reported_os, 'machine_fingerprint', machine_fingerprint,
                    'reported_resources', reported_resources) from n))
  $$;

-- THE COMPUTER as the Computers page shows it: server truth only (P-5). 'state' is contract §1's derived state over EVERY principal;
-- 'liveness' and 'runtime_phase' (null unless a principal is ALIVE) are those of its freshest ALIVE principal; 'draining' is the
-- admin's drain request; 's14_registration_refused_at' is when a registration of the record was refused under S-14 (it then takes no
-- work, gate 1). Each principal carries its own state.
create function factory._computer_view(p_computer uuid) returns jsonb
  language sql stable set search_path = pg_catalog, pg_temp
  as $$
    with c as (select m.* from factory.computers m where m.computer_id = p_computer),
         ps as (select factory._principal_state(p) j, p.node_id from factory.agent_principals p where p.computer_id = p_computer),
         alive as (select n.last_heartbeat_at, n.runtime_phase from ps join factory.nodes n on n.node_id = ps.node_id where ps.j ->> 'state' = 'ALIVE')
    select jsonb_build_object(
      'computer_id', c.computer_id, 'display_name', c.display_name, 'created_at', c.created_at, 'created_by', c.created_by,
      'state', factory._derived_computer_state(c.archived_at is not null, (select array_agg(j ->> 'state') from ps)),
      'liveness', case when c.archived_at is null and exists (select 1 from alive) then factory._liveness((select max(last_heartbeat_at) from alive)) end,
      'runtime_phase', case when c.archived_at is null then (select runtime_phase from alive order by last_heartbeat_at desc nulls last limit 1) end,
      'archived_at', c.archived_at, 'draining', c.drain_requested_at is not null, 'drain_requested_at', c.drain_requested_at,
      's16a_bound', c.s16a_bound_at is not null, 's16a_bound_at', c.s16a_bound_at,
      's14_registration_refused_at', c.s14_registration_refused_at,
      'envelope', (select factory._envelope_json(e) from factory.authorization_envelopes e where e.computer_id = c.computer_id and e.version = c.current_envelope_version),
      'adopted_release_id', c.adopted_release_id, 'registered_fingerprint', c.registered_fingerprint,
      'fingerprints', (select coalesce(jsonb_agg(f.fingerprint order by f.first_reported_at), '[]'::jsonb) from factory.computer_fingerprints f where f.computer_id = c.computer_id),
      'principals', (select coalesce(jsonb_agg(j order by (j ->> 'created_at')), '[]'::jsonb) from ps),
      'runs_in_progress', (select count(*) from factory.agent_runs r where r.computer_id = c.computer_id and r.status = 'in_progress'),
      'server_time', now())
    from c
  $$;

-- a Factory admin may act only on a computer of their own tenant; a foreign or unknown id is simply "not found" (no leak).
-- The lock is the first of the plane's one lock order (the computer row, then its pairing codes, then their enrollments; the computer
-- row, then its credentials), the order enroll/complete and node_register take too. FOR NO KEY UPDATE: admin actions on one computer,
-- and a completing enrollment of it, still queue behind each other, while the foreign-key checks of rows that name the computer (a
-- node call's fingerprint report, a new credential) never wait on it - a node call holding its credential then never waits for a
-- computer row an admin action holds while it waits for that credential.
create function factory._admin_computer(p_ctx factory.admin_ctx, p_computer uuid, p_lock boolean) returns factory.computers
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  declare m factory.computers;
  begin
    if p_lock then
      select x.* into m from factory.computers x where x.computer_id = p_computer and x.tenant_id = p_ctx.tenant_id for no key update;
    else
      select x.* into m from factory.computers x where x.computer_id = p_computer and x.tenant_id = p_ctx.tenant_id;
    end if;
    return m;
  end $$;

-- a per-tenant serialization point for the few admin decisions that read "is there already one?" across rows (the S-16(a) binding,
-- the published release of a channel, a key's revocation): FOR NO KEY UPDATE, so admins of the tenant queue behind each other
-- while the foreign-key inserts every node and admin write makes (FOR KEY SHARE on the tenant) never wait on it
create function factory._lock_tenant(p_tenant uuid) returns void
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  begin
    perform 1 from factory.tenants t where t.tenant_id = p_tenant for no key update;
  end $$;

-- THE PRINCIPAL an action names, on a computer the caller already holds (P-9, contract §9). Absent (or JSON null): no principal
-- named - the action's documented default applies. A principal_id that is not a uuid is refused by name: it never silently widens
-- the action to every principal of the computer, nor retargets it to the computer's first principal. A uuid that is not a principal
-- of this computer is not found (audited, like every not_found).
create function factory._principal_arg(p_ctx factory.admin_ctx, p_op text, m factory.computers, p_body jsonb, out pid uuid, out refusal jsonb)
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  begin
    if p_body is null or not (p_body ? 'principal_id') or p_body -> 'principal_id' = 'null'::jsonb then return; end if;
    pid := factory._uuid(p_body, 'principal_id');
    if pid is null then
      refusal := factory._refusal('bad_request', 400, 'principal_id is the uuid of a principal of this computer'); return;
    end if;
    if not exists (select 1 from factory.agent_principals p where p.principal_id = pid and p.computer_id = m.computer_id) then
      pid := null;
      refusal := factory._not_found(p_ctx, p_op, p_body, 'principal_id'); return;
    end if;
  end $$;

-- THE LIVE CODE TIE-OFF (contract §2 Enrollment): when live pairing codes end, exactly the enrollments started FROM THOSE CODES end
-- with them - selected through the ended codes, never by computer or principal - and each step is recorded (_enrollment_step writes
-- enrollment_transitions). PAIRING_STARTED -> PAIRING_REVOKED (an admin revoked the code, amended the envelope, archived the computer
-- or reissued the code) or -> PAIRING_EXPIRED (the TTL elapsed). Lock order: the caller's computer row, then the codes, then these
-- enrollments (each re-checked under its lock).
create function factory._end_enrollments(p_code_ids uuid[], p_to text, p_actor text, p_reason text) returns integer
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  declare eid uuid; n integer := 0;
  begin
    for eid in select e.enrollment_id from factory.enrollments e where e.code_id = any (p_code_ids) and e.state = 'PAIRING_STARTED' order by e.enrollment_id for update loop
      perform factory._enrollment_step(eid, p_to, p_actor, left(p_reason, 200));
      n := n + 1;
    end loop;
    return n;
  end $$;

-- revoke the LIVE codes of a computer (every principal's, or one principal's), and the enrollments started from exactly those codes
create function factory._revoke_codes(p_computer uuid, p_principal uuid, p_reason text, out codes integer, out enrollments integer, out code_ids uuid[])
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  begin
    with k as (
      update factory.pairing_codes set state = 'PAIRING_REVOKED', revoked_at = now(), revoke_reason = p_reason
       where computer_id = p_computer and state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED') and (p_principal is null or principal_id = p_principal)
      returning code_id)
    select coalesce(array_agg(k.code_id order by k.code_id), '{}'::uuid[]), count(*)::integer into code_ids, codes from k;
    enrollments := factory._end_enrollments(code_ids, 'PAIRING_REVOKED', 'admin', 'pairing code revoked: ' || p_reason);
  end $$;


-- the code inputs the Admin API supplies, checked BEFORE a code-issuing action writes anything (so a bad value is refused by name)
create function factory._code_input_problem(p_body jsonb) returns jsonb
  language plpgsql stable set search_path = pg_catalog, pg_temp
  as $$
  declare ttl integer := coalesce(factory._jint(p_body, 'ttl_seconds'), 900);
  begin
    if coalesce(p_body ->> 'locator', '') !~ '^[0-9A-HJKMNP-TV-Z]{4,10}$' or coalesce(p_body ->> 'code_mac', '') !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(p_body -> 'pepper_version') <> 'number' or (p_body ->> 'pepper_version')::numeric < 1 then
      return factory._refusal('bad_request', 400, 'the Admin API supplies the code''s locator, its HMAC and the pepper version');
    end if;
    if ttl < 60 or ttl > 900 then
      return factory._refusal('bad_request', 400, 'a pairing code lives 60..900 seconds (TTL <= 15 min, S-6)');
    end if;
    if exists (select 1 from factory.pairing_codes k where k.locator = p_body ->> 'locator'
                 and k.state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED') and k.expires_at > now()) then
      return factory._refusal('locator_taken', 409, 'the locator is in use by a live code: draw a new code');
    end if;
    return null;
  end $$;

-- issue a pairing code for a principal (the Edge generated the code from its CSPRNG and computed its HMAC; only the locator and the
-- MAC arrive). An outstanding live code of that principal is revoked (reissued). The envelope in force is fixed into the code.
create function factory._issue_code(p_ctx factory.admin_ctx, m factory.computers, p_principal uuid, p_purpose text, p_body jsonb) returns jsonb
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  declare
    loc text := p_body ->> 'locator';
    mac bytea := case when p_body ->> 'code_mac' ~ '^[0-9a-f]{64}$' then decode(p_body ->> 'code_mac', 'hex') end;
    pv integer := factory._jint(p_body, 'pepper_version');
    ttl integer := coalesce(factory._jint(p_body, 'ttl_seconds'), 900);
    code uuid := gen_random_uuid();
    until timestamptz;
    swept uuid[];
  begin
    if loc is null or loc !~ '^[0-9A-HJKMNP-TV-Z]{4,10}$' or mac is null or pv is null or pv < 1 then
      return factory._refusal('bad_request', 400, 'the Admin API supplies the code''s locator, its HMAC and the pepper version');
    end if;
    if ttl < 60 or ttl > 900 then
      return factory._refusal('bad_request', 400, 'a pairing code lives 60..900 seconds (TTL <= 15 min, S-6)');
    end if;
    until := now() + (ttl || ' seconds')::interval;
    -- a code whose TTL elapsed frees its locator: it expires, and so do the enrollments started from it (recorded)
    with k as (
      update factory.pairing_codes set state = 'PAIRING_EXPIRED', expired_at = now()
       where locator = loc and state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED') and expires_at <= now()
      returning code_id)
    select coalesce(array_agg(k.code_id order by k.code_id), '{}'::uuid[]) into swept from k;
    perform factory._end_enrollments(swept, 'PAIRING_EXPIRED', 'server', 'pairing code expired (its locator was drawn again)');
    if exists (select 1 from factory.pairing_codes k where k.locator = loc and k.state in ('PAIRING_CODE_ISSUED', 'PAIRING_STARTED')) then
      return factory._refusal('locator_taken', 409, 'the locator is in use by a live code: draw a new code');
    end if;
    -- the principal's outstanding live code is reissued: it is revoked, with the enrollments started from it
    perform factory._revoke_codes(m.computer_id, p_principal, 'reissued');
    insert into factory.pairing_codes (code_id, tenant_id, computer_id, principal_id, envelope_version, purpose, locator, code_mac, pepper_version,
                                       issued_by, expires_at)
    values (code, m.tenant_id, m.computer_id, p_principal, m.current_envelope_version, p_purpose, loc, mac, pv, p_ctx.actor, until);
    perform factory._audit(m.tenant_id, 'admin', p_ctx.actor::text, 'pairing.issued', 'pairing_code', code::text, 'ok', p_purpose,
                           jsonb_build_object('computer_id', m.computer_id, 'principal_id', p_principal, 'expires_at', until));
    -- the code's id, expiry and locator: the Admin API shows the code it drew only when they confirm the plane stored THIS code
    return jsonb_build_object('ok', true, 'code_id', code, 'expires_at', until, 'principal_id', p_principal, 'locator', loc);
  end $$;

reset role;

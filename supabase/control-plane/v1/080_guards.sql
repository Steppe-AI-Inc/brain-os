-- FACTORY CONTROL PLANE V1 - PART 080: the server guards (S-10, S-13, S-14; WO-1 "Legacy coexistence").
--
-- WHO IS "THE ENGINE". Inside a SQL front door (SECURITY DEFINER, owned by factory_owner) current_user is 'factory_owner'. That
-- is the only writer the guards trust with authority records and with new-model rows. It is a fact about the executing role,
-- never a GUC, never a session flag, never a value the caller supplies (SECURITY_INVARIANTS #8).
--
-- THREE KINDS OF GUARD
--   1. AUTHORITY RECORDS (every table this migration creates): written only by the engine. Anyone else - the legacy role
--      factory_runner above all, whatever grants a later provisioning run might hand it - is refused by name.
--   2. INVARIANTS that hold for every writer, the engine included: append-only history, immutable envelopes and principals,
--      credential and code state machines, the S-16(a) binding add-only, stricter-only policies through the Admin API, the
--      founder-only tenant_admins table, principal binding (S-13).
--   3. THE LEGACY GUARD on the 69df2f52 tables. For a writer that is not the engine:
--        * an INSERT of a new-model row (a work order holding `factory-enrolled-v1`, a run / checkpoint / lock of an enrolled
--          principal, a dependency or notification naming a new-model work order) is REFUSED;
--        * an UPDATE or DELETE of such a row is SKIPPED: the row is left exactly as it was and the statement goes on. That is what
--          keeps the frozen 69df2f52 claim transaction working when its reaper's `update ... where lease_expires_at < now()`
--          reaches an enrolled run whose lease lapsed: the enrolled row is untouched, the legacy rows are reaped, the claim
--          commits. The front doors own the enrolled rows' expiry and takeover;
--        * a write that sets or changes any column this migration added, or writes the reserved capability, is REFUSED.

set local role factory_owner;

create function factory._operator_tenant() returns uuid
  language sql immutable parallel safe set search_path = ''
  as $$ select 'a1e0f000-0000-4000-8000-000000000001'::uuid $$;

create function factory._is_engine() returns boolean
  language sql stable parallel safe set search_path = ''
  as $$ select current_user::text = 'factory_owner' $$;

-- a call that arrived through an API login (the Node API's or the Admin API's database role)
create function factory._via_api() returns boolean
  language sql stable parallel safe set search_path = ''
  as $$ select session_user::text in ('factory_node_api', 'factory_admin_api') $$;

create function factory._new_model_capabilities(caps text[]) returns boolean
  language sql immutable parallel safe set search_path = ''
  as $$ select exists (select 1 from unnest(coalesce(caps, '{}'::text[])) c where factory._capability_reserved(c)) $$;

create function factory._jsonb_has_reserved(caps jsonb) returns boolean
  language sql immutable parallel safe set search_path = ''
  as $$
    select case when jsonb_typeof(caps) = 'array'
      then exists (select 1 from jsonb_array_elements(caps) e
                    where jsonb_typeof(e) = 'string' and factory._capability_reserved(e #>> '{}'))
      else false end
  $$;

create function factory._refuse(code text, msg text) returns void
  language plpgsql set search_path = ''
  as $$ begin raise exception using errcode = '42501', message = code || ': ' || msg; end $$;

-- ===================================================================================================
-- 1. AUTHORITY RECORDS: the engine only.
-- ===================================================================================================
create function factory._authority_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
  -- SELF-CONTAINED ON PURPOSE (like the legacy guard below): a trigger function runs as the writer, and a function it calls is
  -- checked for EXECUTE against that writer. The legacy role holds EXECUTE on no factory function, so a guard it can reach calls
  -- none; its refusal is then always this message, never a "permission denied for function".
  begin
    if current_user::text <> 'factory_owner' then
      raise exception using errcode = '42501', message = format(
        'factory_authority_refused: %s on factory.%s - authority records are written only through the Factory front doors (S-10)',
        tg_op, tg_table_name);
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end $$;

create function factory._no_truncate() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    raise exception using errcode = '42501', message = format('factory_truncate_refused: factory.%s is never truncated', tg_table_name);
  end $$;

-- ===================================================================================================
-- 2. INVARIANTS FOR EVERY WRITER
-- ===================================================================================================

-- append-only history and immutable records: no UPDATE, no DELETE
create function factory._append_only() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    perform factory._refuse('factory_immutable', format('%s on factory.%s - this record is append-only / immutable', tg_op, tg_table_name));
    return null;
  end $$;

-- rows that are never deleted (their history is evidence)
create function factory._no_delete() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    perform factory._refuse('factory_immutable', format('DELETE on factory.%s - these records are never deleted', tg_table_name));
    return null;
  end $$;

-- the columns of `r_new` and `r_old` other than `mutable` must be equal
create function factory._only_changed(r_new jsonb, r_old jsonb, mutable text[]) returns boolean
  language sql immutable parallel safe set search_path = ''
  as $$ select (r_new - mutable) = (r_old - mutable) $$;

create function factory._tenant_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if tg_op = 'UPDATE' and new.tenant_id <> old.tenant_id then
      perform factory._refuse('factory_immutable', 'a tenant id never changes');
    end if;
    return new;
  end $$;

-- factory.tenant_admins: only the founder's provisioning step writes it (S-8; CR-001, CR-003). No API path does.
create function factory._tenant_admins_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if factory._via_api() then
      perform factory._refuse('factory_tenant_admins_refused',
        'factory.tenant_admins is written only by the founder''s provisioning step, never through an API');
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end $$;

-- computers: never deleted; identity and the S-16(a) binding immutable after Add Computer (S-14: add-only, never unbound or
-- rebound through the Admin API)
create function factory._computers_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if not factory._only_changed(to_jsonb(new), to_jsonb(old), array['display_name', 'archived_at', 'archived_by',
         'drain_requested_at', 'drain_requested_by', 'current_envelope_version', 'adopted_release_id', 'registered_fingerprint']) then
      perform factory._refuse('factory_immutable',
        'a computer''s identity, creation record and S-16(a) binding never change (the binding is add-only, set only at Add Computer)');
    end if;
    if old.registered_fingerprint is not null and new.registered_fingerprint is distinct from old.registered_fingerprint then
      perform factory._refuse('factory_immutable', 'the fingerprint recorded at the computer''s first registration never changes');
    end if;
    if new.current_envelope_version < old.current_envelope_version then
      perform factory._refuse('factory_envelope_refused', 'an envelope amendment adds a version; it never rewinds the pointer');
    end if;
    return new;
  end $$;

-- envelopes: an insert must be the computer's next version
create function factory._envelope_insert_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare last integer;
  begin
    select max(version) into last from factory.authorization_envelopes where computer_id = new.computer_id;
    if new.version <> coalesce(last, 0) + 1 then
      perform factory._refuse('factory_envelope_refused', format('envelope version %s is not the next version (%s)', new.version, coalesce(last, 0) + 1));
    end if;
    return new;
  end $$;

-- credentials (S-2, S-3, S-13): never deleted; identity immutable; active -> superseded | revoked only; terminal states never
-- change; a new credential is bound to the principal its enrollment's code targeted, or to the principal of the credential it
-- rotates.
create function factory._credentials_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
  declare p uuid; c uuid;
  begin
    if tg_op = 'INSERT' then
      if new.status <> 'active' then
        perform factory._refuse('factory_credential_refused', 'a credential is issued active');
      end if;
      if new.issued_via = 'enrollment' then
        select e.principal_id, e.computer_id into p, c from factory.enrollments e where e.enrollment_id = new.enrollment_id;
      else
        select r.principal_id, r.computer_id into p, c from factory.node_credentials r where r.credential_id = new.replaces_credential_id;
      end if;
      if p is null or p <> new.principal_id or c <> new.computer_id then
        perform factory._refuse('factory_principal_refused',
          'a credential is bound to the principal its pairing code targeted, or to the principal of the credential it replaces (S-13)');
      end if;
      return new;
    end if;
    if not factory._only_changed(to_jsonb(new), to_jsonb(old), array['status', 'superseded_at', 'revoked_at', 'revoked_by_kind',
         'revoked_by', 'revoke_reason']) then
      perform factory._refuse('factory_immutable', 'a credential''s key, principal and issue record never change');
    end if;
    if old.status <> 'active' and to_jsonb(new) <> to_jsonb(old) then
      perform factory._refuse('factory_credential_refused', format('a %s credential never changes again (never active again)', old.status));
    end if;
    return new;
  end $$;

-- pairing codes (S-6): never deleted; the code itself never changes; its state only moves forward; terminal states are final;
-- failed attempts only grow
create function factory._pairing_codes_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if tg_op = 'INSERT' then
      if new.state <> 'PAIRING_CODE_ISSUED' or new.failed_attempts <> 0 then
        perform factory._refuse('factory_pairing_refused', 'a pairing code is issued fresh');
      end if;
      return new;
    end if;
    if not factory._only_changed(to_jsonb(new), to_jsonb(old), array['state', 'failed_attempts', 'started_at', 'consumed_at',
         'consumed_by_enrollment_id', 'expired_at', 'revoked_at', 'revoke_reason']) then
      perform factory._refuse('factory_immutable', 'a pairing code''s locator, MAC, binding and expiry never change');
    end if;
    if old.state in ('PAIRING_CONSUMED', 'PAIRING_EXPIRED', 'PAIRING_REVOKED') and to_jsonb(new) <> to_jsonb(old) then
      perform factory._refuse('factory_pairing_refused', format('a code in %s never changes again', old.state));
    end if;
    if new.failed_attempts < old.failed_attempts then
      perform factory._refuse('factory_pairing_refused', 'failed attempts on a locator never decrease');
    end if;
    if not (new.state = old.state
            or (old.state = 'PAIRING_CODE_ISSUED' and new.state in ('PAIRING_STARTED', 'PAIRING_EXPIRED', 'PAIRING_REVOKED'))
            or (old.state = 'PAIRING_STARTED' and new.state in ('PAIRING_CONSUMED', 'PAIRING_EXPIRED', 'PAIRING_REVOKED'))) then
      perform factory._refuse('factory_pairing_refused', format('pairing code %s -> %s is not a transition of contract §2', old.state, new.state));
    end if;
    return new;
  end $$;

-- enrollments: never deleted; identity immutable; the founder's enrollment transitions only (contract §2)
create function factory._enrollment_step_ok(f text, t text) returns boolean
  language sql immutable parallel safe set search_path = ''
  as $$
    select f = t or (f, t) in (
      ('PAIRING_STARTED', 'PAIRING_VERIFIED'), ('PAIRING_STARTED', 'PAIRING_CONSUMED'), ('PAIRING_STARTED', 'PAIRING_EXPIRED'),
      ('PAIRING_STARTED', 'PAIRING_REVOKED'),
      ('PAIRING_VERIFIED', 'NODE_ID_ISSUED'), ('NODE_ID_ISSUED', 'NODE_CREDENTIAL_ISSUED'),
      ('NODE_CREDENTIAL_ISSUED', 'RUNTIME_INSTALLING'),
      ('RUNTIME_INSTALLING', 'REGISTERING'), ('RUNTIME_INSTALLING', 'INSTALL_FAILED'), ('INSTALL_FAILED', 'RUNTIME_INSTALLING'),
      ('REGISTERING', 'ALIVE'), ('REGISTERING', 'REGISTRATION_FAILED'), ('REGISTRATION_FAILED', 'REGISTERING'),
      ('NODE_CREDENTIAL_ISSUED', 'CREDENTIAL_REVOKED'), ('RUNTIME_INSTALLING', 'CREDENTIAL_REVOKED'),
      ('INSTALL_FAILED', 'CREDENTIAL_REVOKED'), ('REGISTERING', 'CREDENTIAL_REVOKED'),
      ('REGISTRATION_FAILED', 'CREDENTIAL_REVOKED'), ('ALIVE', 'CREDENTIAL_REVOKED'))
  $$;

create function factory._enrollments_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if tg_op = 'INSERT' then
      if new.state <> 'PAIRING_STARTED' or new.credential_id is not null then
        perform factory._refuse('factory_enrollment_refused', 'an enrollment starts at PAIRING_STARTED');
      end if;
      return new;
    end if;
    if not factory._only_changed(to_jsonb(new), to_jsonb(old), array['state', 'state_reason', 'state_at', 'credential_id',
         'reported_fingerprint', 'reported_hostname']) then
      perform factory._refuse('factory_immutable', 'an enrollment''s code, principal, key and challenge never change');
    end if;
    if old.credential_id is not null and new.credential_id is distinct from old.credential_id then
      perform factory._refuse('factory_immutable', 'an enrollment issues exactly one credential');
    end if;
    if not factory._enrollment_step_ok(old.state, new.state) then
      perform factory._refuse('factory_enrollment_refused', format('enrollment %s -> %s is not a transition of contract §2', old.state, new.state));
    end if;
    return new;
  end $$;

-- releases: never deleted; content immutable; published -> superseded | revoked, superseded -> revoked; revoked is final
create function factory._releases_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if tg_op = 'INSERT' then
      if new.state <> 'published' then
        perform factory._refuse('factory_release_refused', 'a release enters the plane only by being published');
      end if;
      return new;
    end if;
    if not factory._only_changed(to_jsonb(new), to_jsonb(old), array['state', 'superseded_at', 'superseded_by_release_id',
         'revoked_at', 'revoked_by', 'revoke_reason']) then
      perform factory._refuse('factory_immutable', 'a published release''s manifest, digest, key id and signature never change');
    end if;
    if not (new.state = old.state and to_jsonb(new) = to_jsonb(old)
            or (old.state = 'published' and new.state in ('superseded', 'revoked'))
            or (old.state = 'superseded' and new.state = 'revoked')) then
      perform factory._refuse('factory_release_refused', format('release %s -> %s is not a transition of contract §2', old.state, new.state));
    end if;
    return new;
  end $$;

-- policies (S-14): never deleted. Through the Admin API: no new policy, the frozen campaign rows untouched, and every change
-- STRICTER (a requirement may be added, never removed; the Director-document paths may only shrink). Only a Director revision,
-- carried by a new candidate migration, restores the Director rows (contract §8).
create function factory._policies_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    if tg_op = 'DELETE' then
      perform factory._refuse('factory_policy_refused', 'an independence or campaign policy is never deleted');
    end if;
    if tg_op = 'UPDATE' and new.version <> old.version + 1 then
      perform factory._refuse('factory_policy_refused', 'every policy change is a new version (version + 1)');
    end if;
    if factory._via_api() then
      if tg_op = 'INSERT' then
        perform factory._refuse('factory_policy_refused', 'a policy cannot be created through the Admin API (AC-12(e))');
      end if;
      if old.frozen then
        perform factory._refuse('factory_policy_refused', 'the milestone campaign rows cannot be changed through the Admin API (S-14)');
      end if;
      if (new.policy_id, new.tenant_id, new.scope, new.campaign_key, new.frozen)
         is distinct from (old.policy_id, old.tenant_id, old.scope, old.campaign_key, old.frozen)
         or (old.require_distinct_run and not new.require_distinct_run)
         or (old.require_distinct_identity and not new.require_distinct_identity)
         or (old.require_verifier_authority and not new.require_verifier_authority)
         or (old.require_physical_separation and not new.require_physical_separation)
         or (old.restrict_bound_computer_authoring and not new.restrict_bound_computer_authoring)
         or not (new.director_document_paths <@ old.director_document_paths)
         or (new.restrict_bound_computer_authoring and not old.restrict_bound_computer_authoring
             and cardinality(new.director_document_paths) = 0) then
        perform factory._refuse('factory_policy_refused', 'a policy can only be made stricter through the Admin API (S-14)');
      end if;
    end if;
    return new;
  end $$;

-- every policy version is kept
create function factory._policies_record_version() returns trigger
  language plpgsql set search_path = ''
  as $$
  begin
    insert into factory.verification_policy_versions (policy_id, version, tenant_id, snapshot, recorded_by)
    values (new.policy_id, new.version, new.tenant_id, to_jsonb(new) - 'updated_at', new.updated_by);
    return null;
  end $$;

-- ===================================================================================================
-- 3. THE LEGACY GUARD on the 69df2f52 tables
-- ===================================================================================================
create function factory._legacy_guard() returns trigger
  language plpgsql set search_path = ''
  as $$
  -- SELF-CONTAINED ON PURPOSE: it runs as the writer, and the legacy role holds EXECUTE on no factory function, so it calls none.
  -- It reads only 69df2f52 tables, which the legacy role can read. Its column lists equal factory._baseline_columns(), which part
  -- 000 asserted against the catalog; part 990 asserts the two agree.
  declare
    base    text[];
    r_new   jsonb;
    r_old   jsonb;
    r       jsonb;
    is_nm   boolean;
    old_nm  boolean := false;
    new_nm  boolean := false;
  begin
    if current_user::text = 'factory_owner' then
      return case when tg_op = 'DELETE' then old else new end;
    end if;
    base := case tg_table_name
      when 'nodes' then array['node_id', 'capabilities', 'security_role', 'platform', 'registered_at', 'last_heartbeat_at',
        'agent_version', 'max_heavy']
      when 'work_orders' then array['work_order_id', 'title', 'work_type', 'status', 'priority', 'risk_level', 'owned_surface',
        'branch', 'base_commit', 'latest_commit', 'candidate_sha', 'release_manifest', 'handoff', 'requires_security_role',
        'requires_capabilities', 'created_at', 'updated_at', 'completed_at', 'director_state', 'next_action', 'blocked_reason',
        'last_evidence', 'last_evidence_at', 'director_node_id', 'director_state_at', 'retry_count', 'handler', 'weight']
      when 'work_order_dependencies' then array['work_order_id', 'depends_on']
      when 'agent_runs' then array['run_id', 'work_order_id', 'node_id', 'status', 'execution_provider', 'provider_run_id',
        'requested_provider', 'requested_model', 'actual_provider', 'branch', 'base_commit', 'head_commit', 'source_sha', 'worktree',
        'checkpoint_location', 'last_completed_scenario', 'remaining_scenarios', 'verification_campaign_id', 'attempt_count',
        'retry_after', 'blocked_at', 'blocked_reason', 'summary', 'error', 'verification_status', 'lease_expires_at',
        'last_heartbeat_at', 'authoring_run_id', 'authoring_node_id', 'verification_run_id', 'verification_node_id', 'started_at',
        'finished_at', 'created_at', 'updated_at', 'actual_model', 'fallback_reason', 'reasoning_effort', 'input_tokens',
        'cached_tokens', 'output_tokens', 'estimated_cost_usd', 'termination_reason']
      when 'surface_locks' then array['surface', 'run_id', 'node_id', 'acquired_at', 'lease_expires_at']
      when 'checkpoints' then array['checkpoint_id', 'run_id', 'work_order_id', 'location', 'scenario', 'payload', 'created_at']
      when 'founder_notifications' then array['notification_id', 'work_order_id', 'why_blocked', 'exact_action', 'what_continues',
        'raised_at', 'resolved_at']
      when 'director_lease' then array['only_one', 'node_id', 'acquired_at', 'heartbeat_at', 'lease_seconds']
    end;
    if base is null then
      raise exception using errcode = '42501', message = format('factory_legacy_refused: factory.%s is not a 69df2f52 table', tg_table_name);
    end if;
    if tg_op <> 'INSERT' then r_old := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then r_new := to_jsonb(new); end if;

    -- IS THE ROW (before / after) PART OF THE NEW MODEL? A work order holding factory-enrolled-v1; a node, run, checkpoint or lock
    -- of an enrolled principal; a run, checkpoint, dependency or notification naming a new-model work order.
    for i in 1..2 loop
      r := case i when 1 then r_old else r_new end;
      continue when r is null;
      is_nm := case tg_table_name
        when 'nodes' then r->>'principal_id' is not null
        when 'work_orders' then exists (
          select 1 from jsonb_array_elements_text(coalesce(r->'requires_capabilities', '[]'::jsonb)) c
           where lower(btrim(c)) = 'factory-enrolled-v1')
        when 'agent_runs' then r->>'principal_id' is not null or exists (
          select 1 from factory.work_orders w cross join unnest(w.requires_capabilities) c
           where w.work_order_id = (r->>'work_order_id')::uuid and lower(btrim(c)) = 'factory-enrolled-v1')
        when 'checkpoints' then r->>'principal_id' is not null
          or exists (select 1 from factory.agent_runs x where x.run_id = (r->>'run_id')::uuid and x.principal_id is not null)
          or exists (select 1 from factory.work_orders w cross join unnest(w.requires_capabilities) c
                      where w.work_order_id = (r->>'work_order_id')::uuid and lower(btrim(c)) = 'factory-enrolled-v1')
        when 'surface_locks' then r->>'principal_id' is not null
          or exists (select 1 from factory.agent_runs x where x.run_id = (r->>'run_id')::uuid and x.principal_id is not null)
        when 'work_order_dependencies' then exists (
          select 1 from factory.work_orders w cross join unnest(w.requires_capabilities) c
           where w.work_order_id in ((r->>'work_order_id')::uuid, (r->>'depends_on')::uuid)
             and lower(btrim(c)) = 'factory-enrolled-v1')
        when 'founder_notifications' then exists (
          select 1 from factory.work_orders w cross join unnest(w.requires_capabilities) c
           where w.work_order_id = (r->>'work_order_id')::uuid and lower(btrim(c)) = 'factory-enrolled-v1')
        else false
      end;
      if i = 1 then old_nm := is_nm; else new_nm := is_nm; end if;
    end loop;

    -- an UPDATE or DELETE of a new-model row: left exactly as it was, and the statement goes on (never fails the frozen claim)
    if old_nm then
      return null;
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    -- a legacy write never creates a new-model row, and never moves a row into the new model
    if new_nm then
      raise exception using errcode = '42501', message = format(
        'factory_legacy_refused: %s on factory.%s - a legacy write never creates or touches a new-model row (S-10)', tg_op, tg_table_name);
    end if;
    -- the reserved capability is never written by the legacy path, in any spelling
    if tg_table_name = 'nodes' and exists (
         select 1 from jsonb_array_elements(case when jsonb_typeof(r_new->'capabilities') = 'array'
                                                 then r_new->'capabilities' else '[]'::jsonb end) e
          where jsonb_typeof(e) = 'string' and lower(btrim(e #>> '{}')) = 'factory-enrolled-v1') then
      raise exception using errcode = '42501', message =
        'factory_legacy_refused: the reserved capability factory-enrolled-v1 is never written by the legacy path (S-10)';
    end if;
    -- the columns this migration added: NULL on a legacy insert (tenant_id: the operator tenant), unchanged by a legacy update
    if tg_op = 'INSERT' then
      if exists (select 1 from jsonb_each((r_new - base) - 'tenant_id') e where e.value <> 'null'::jsonb)
         or (r_new->>'tenant_id')::uuid is distinct from 'a1e0f000-0000-4000-8000-000000000001'::uuid then
        raise exception using errcode = '42501', message = format(
          'factory_legacy_refused: INSERT on factory.%s - a legacy write sets no new-model column (S-10)', tg_table_name);
      end if;
    elsif (r_new - base) is distinct from (r_old - base) then
      raise exception using errcode = '42501', message = format(
        'factory_legacy_refused: UPDATE on factory.%s - a legacy write changes no new-model column (S-10)', tg_table_name);
    end if;
    return new;
  end $$;

-- ===================================================================================================
-- ATTACH
-- ===================================================================================================
do $attach$
declare t text;
begin
  -- 1. every authority record: the engine only; never truncated
  foreach t in array array['tenants', 'tenant_admins', 'computers', 'authorization_envelopes', 'agent_principals',
      'node_credentials', 'computer_fingerprints', 'pairing_codes', 'enrollments', 'enrollment_transitions', 'pairing_attempts',
      'node_sessions', 'node_assertion_jtis', 'audit_events', 'verification_policies', 'verification_policy_versions',
      'certifications', 'releases', 'release_revocations'] loop
    execute format('create trigger factory_v1_a_authority before insert or update or delete on factory.%I
                      for each row execute function factory._authority_guard()', t);
    -- and per STATEMENT: a statement that matches no row still never runs for a non-engine writer
    execute format('create trigger factory_v1_a_authority_stmt before insert or update or delete on factory.%I
                      for each statement execute function factory._authority_guard()', t);
    execute format('create trigger factory_v1_no_truncate before truncate on factory.%I
                      for each statement execute function factory._no_truncate()', t);
  end loop;
  -- 2a. append-only / immutable
  foreach t in array array['audit_events', 'enrollment_transitions', 'certifications', 'verification_policy_versions',
      'pairing_attempts', 'authorization_envelopes', 'agent_principals', 'release_revocations'] loop
    execute format('create trigger factory_v1_b_append_only before update or delete on factory.%I
                      for each row execute function factory._append_only()', t);
  end loop;
  -- 2b. never deleted
  foreach t in array array['tenants', 'computers', 'node_credentials', 'pairing_codes', 'enrollments', 'releases',
      'verification_policies', 'computer_fingerprints'] loop
    execute format('create trigger factory_v1_b_no_delete before delete on factory.%I
                      for each row execute function factory._no_delete()', t);
  end loop;
end
$attach$;

create trigger factory_v1_c_invariants before update on factory.tenants for each row execute function factory._tenant_guard();
create trigger factory_v1_c_invariants before insert or update or delete on factory.tenant_admins
  for each row execute function factory._tenant_admins_guard();
create trigger factory_v1_c_invariants before update on factory.computers for each row execute function factory._computers_guard();
create trigger factory_v1_c_invariants before insert on factory.authorization_envelopes
  for each row execute function factory._envelope_insert_guard();
create trigger factory_v1_c_invariants before insert or update on factory.node_credentials
  for each row execute function factory._credentials_guard();
create trigger factory_v1_c_invariants before insert or update on factory.pairing_codes
  for each row execute function factory._pairing_codes_guard();
create trigger factory_v1_c_invariants before insert or update on factory.enrollments
  for each row execute function factory._enrollments_guard();
create trigger factory_v1_c_invariants before insert or update on factory.releases
  for each row execute function factory._releases_guard();
create trigger factory_v1_c_invariants before insert or update or delete on factory.verification_policies
  for each row execute function factory._policies_guard();
create trigger factory_v1_d_record_version after insert or update on factory.verification_policies
  for each row execute function factory._policies_record_version();

-- the 69df2f52 tables belong to the migrating login: it creates their triggers, which needs EXECUTE on the guard for this step
grant execute on function factory._legacy_guard() to session_user;
reset role;

do $legacy$
declare t text;
begin
  foreach t in array array['nodes', 'work_orders', 'work_order_dependencies', 'agent_runs', 'surface_locks', 'checkpoints',
                           'founder_notifications', 'director_lease'] loop
    execute format('create trigger factory_v1_legacy_guard before insert or update or delete on factory.%I
                      for each row execute function factory._legacy_guard()', t);
  end loop;
end
$legacy$;

set local role factory_owner;
revoke execute on function factory._legacy_guard() from session_user;
reset role;

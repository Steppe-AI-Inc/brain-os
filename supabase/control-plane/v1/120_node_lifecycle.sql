-- FACTORY CONTROL PLANE V1 - PART 120: the node lifecycle front doors (WO-2; contract P-2, §2 Runtime / Enrollment; S-3, S-4).
--
-- ONE ENGINE (P-2). These functions ARE the certified lifecycle of 69df2f52 (scripts/factory-runner/claim.mjs, node.mjs), moved
-- behind an authenticated boundary, in the same tables and with the same primitives:
--   claim     = claimInTransaction: the plane-wide advisory lock hashtext('factory.claim') (the SAME key the frozen legacy claim
--               takes, so heavy counts are serialized across both fleets), the lease reaper, the pick with FOR UPDATE SKIP LOCKED,
--               the run insert timed by clock_timestamp(), authoring_run_id = run_id, the surface locks, work order 'claimed';
--   renew     = heartbeat: fenced on (run, node, in_progress), the run's lease and the node's liveness in one statement group;
--   checkpoint= fenced INSIDE the front door (the row is locked), then one idempotent insert and the run's pointer;
--   complete  = completeRun: the terminal reason required, no silent substitution, fenced on live ownership, locks released and
--               the work order moved in the same transaction; a failed run fails its work order;
--   release   = the abort / orphan give-back: the lease expires now.
-- What is NEW is only what the contract adds: identity, tenant and authority from the credential (never the body), the 12 gates
-- and ranking (part 110), and the verification gate (part 130).

set local role factory_owner;

create function factory._lease_seconds(p_body jsonb) returns integer
  language sql immutable parallel safe set search_path = ''
  as $$ select case when jsonb_typeof(p_body -> 'lease_seconds') = 'number'
                     then greatest(5, least(600, (p_body ->> 'lease_seconds')::numeric::integer)) else 120 end $$;

-- one step of an enrollment's walk, recorded (contract §2; the guard checks the transition)
create function factory._enrollment_step(p_enrollment uuid, p_to text, p_actor text, p_reason text default null) returns void
  language plpgsql volatile set search_path = ''
  as $$
  declare e record;
  begin
    select x.* into e from factory.enrollments x where x.enrollment_id = p_enrollment for update;
    if e.state = p_to then return; end if;
    update factory.enrollments set state = p_to, state_reason = left(p_reason, 200), state_at = now() where enrollment_id = p_enrollment;
    insert into factory.enrollment_transitions (tenant_id, enrollment_id, from_state, to_state, actor_kind, reason)
    values (e.tenant_id, p_enrollment, e.state, p_to, p_actor, left(p_reason, 200));
  end $$;

-- the fingerprint a node reports: kept on the node, and in the computer's list (it only ever refuses; S-16b)
create function factory._record_fingerprint(p_ctx factory.node_ctx, p_fp text) returns void
  language plpgsql volatile set search_path = ''
  as $$
  begin
    if p_fp is null then return; end if;
    insert into factory.computer_fingerprints (tenant_id, computer_id, fingerprint) values (p_ctx.tenant_id, p_ctx.computer_id, p_fp)
      on conflict (computer_id, fingerprint) do update set last_reported_at = now();
    update factory.computers set registered_fingerprint = p_fp where computer_id = p_ctx.computer_id and registered_fingerprint is null;
    update factory.nodes set machine_fingerprint = p_fp where node_id = p_ctx.node_id;
  end $$;

-- THE REAPER (claim.mjs:168-182, both fleets, as the frozen claim does it), plus what the new model adds: an enrolled lock dies
-- with its run's lease; a lapsed verification claim returns its work order to WAITING_FOR_INDEPENDENT_VERIFICATION.
-- Its effects commit with the calling front door even when nothing is claimed afterwards, so a lapsed lease is visible as
-- lapsed at once; work becomes claimable again only after a REAL lease expiry, as in 69df2f52.
create function factory._reap() returns integer
  language plpgsql volatile set search_path = ''
  as $$
  declare n integer;
  begin
    with expired as (
      update factory.agent_runs
         set status = 'queued', lease_expires_at = null, attempt_count = attempt_count + 1, updated_at = now()
       where status = 'in_progress' and lease_expires_at is not null and lease_expires_at < now()
      returning run_id, work_order_id, principal_id, run_kind),
    wos as (
      update factory.work_orders w
         set status = 'queued', updated_at = now(),
             queued_at = case when w.queued_at is not null then now() else w.queued_at end
       where w.status = 'claimed' and w.work_order_id in (select e.work_order_id from expired e)
      returning w.work_order_id, w.verifies_work_order_id),
    waiting as (
      update factory.work_orders v
         set verification_state = 'WAITING_FOR_INDEPENDENT_VERIFICATION', verification_state_at = now(),
             verification_reason = 'the verification claim''s lease lapsed'
       where v.work_order_id in (select x.verifies_work_order_id from wos x where x.verifies_work_order_id is not null)
         and v.verification_state = 'VERIFICATION_CLAIMED'
      returning 1)
    select count(*) into n from expired;
    delete from factory.surface_locks where principal_id is null and lease_expires_at < now();
    delete from factory.surface_locks l
     where l.principal_id is not null
       and not exists (select 1 from factory.agent_runs r where r.run_id = l.run_id and r.status = 'in_progress' and r.lease_expires_at > now());
    return n;
  end $$;

-- the work order as a node needs it to do the work (what node.mjs:461 read after a claim)
create function factory._work_order_view(p_wo factory.work_orders) returns jsonb
  language sql stable set search_path = ''
  as $$
    select jsonb_build_object('work_order_id', p_wo.work_order_id, 'title', p_wo.title, 'work_type', p_wo.work_type,
      'owned_surface', to_jsonb(p_wo.owned_surface), 'handoff', p_wo.handoff, 'branch', p_wo.branch, 'base_commit', p_wo.base_commit,
      'requires_security_role', p_wo.requires_security_role, 'requires_capabilities', to_jsonb(p_wo.requires_capabilities),
      'weight', p_wo.weight, 'priority', p_wo.priority_num, 'company_id', p_wo.company_id, 'campaign_key', p_wo.campaign_key,
      'min_resources', p_wo.min_resources, 'requires_verification', p_wo.requires_verification,
      'verifies_work_order_id', p_wo.verifies_work_order_id, 'verifies_run_id', p_wo.verifies_run_id)
  $$;

-- ===================================================================================================
-- REGISTER (node.mjs:351 registerNode). Identity from the credential. Reports the runtime release, fingerprint, hostname, OS and
-- resources; the node starts RECOVERING. For a credential still walking its enrollment: RUNTIME_INSTALLING -> REGISTERING (its
-- first authenticated call) -> ALIVE when the release it runs is certified on this plane, else REGISTRATION_FAILED (the reason is
-- named; a retry reuses the same credential). Never stamps liveness: only heartbeat and renew do.
-- ===================================================================================================
create function factory.node_register(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; rel record; enr record; certified boolean; fp text := factory._hex64(p_body ->> 'fingerprint');
  begin
    select * into a from factory._node_session(p_token_hash, false, 'register');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    select r.* into rel from factory.releases r
     where r.tenant_id = ctx.tenant_id and r.digest = factory._hex64(p_body ->> 'runtime_digest')
     order by r.published_at desc limit 1;
    update factory.nodes
       set runtime_version = left(p_body ->> 'runtime_version', 64), runtime_digest = factory._hex64(p_body ->> 'runtime_digest'),
           release_id = rel.release_id, reported_hostname = left(p_body ->> 'hostname', 255), reported_os = left(p_body ->> 'os', 255),
           reported_resources = coalesce(factory._obj(p_body, 'resources'), reported_resources), reported_at = now(),
           runtime_phase = 'RECOVERING', runtime_phase_at = now()
     where node_id = ctx.node_id;
    perform factory._record_fingerprint(ctx, fp);
    certified := factory._release_current(ctx, rel.release_id);

    select e.* into enr from factory.enrollments e where e.credential_id = ctx.credential_id for update;
    if found and enr.state = 'NODE_CREDENTIAL_ISSUED' then
      return factory._refusal('install_not_reported', 409, 'the installer reports RUNTIME_INSTALLING (report-state) before the runtime registers');
    end if;
    if found and enr.state in ('RUNTIME_INSTALLING', 'REGISTERING', 'REGISTRATION_FAILED', 'INSTALL_FAILED') then
      if enr.state = 'INSTALL_FAILED' then
        return factory._refusal('install_failed', 409, 'the install failed; the installer retries (report-state RUNTIME_INSTALLING) with the same credential');
      end if;
      perform factory._enrollment_step(enr.enrollment_id, 'REGISTERING', 'node', 'first authenticated call');
      if not certified then
        perform factory._enrollment_step(enr.enrollment_id, 'REGISTRATION_FAILED', 'server', 'release_not_certified');
        perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.register', 'enrollment', enr.enrollment_id::text,
                               'refused', 'release_not_certified', jsonb_build_object('runtime_digest', p_body ->> 'runtime_digest'));
        return factory._refusal('registration_failed', 409,
          'registration refused: the runtime release is not a certified release on this plane (release_not_certified); retry with the same credential after installing a certified release',
          jsonb_build_object('reason', 'release_not_certified', 'enrollment_state', 'REGISTRATION_FAILED'));
      end if;
      perform factory._enrollment_step(enr.enrollment_id, 'ALIVE', 'server', 'registration accepted on a certified release');
      perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.register', 'enrollment', enr.enrollment_id::text, 'ok', 'ALIVE');
    end if;
    return jsonb_build_object('ok', true, 'server_time', now(), 'node_id', ctx.node_id, 'principal_id', ctx.principal_id,
      'computer_id', ctx.computer_id, 'tenant_id', ctx.tenant_id, 'phase', 'RECOVERING', 'draining', ctx.draining,
      'enrollment_state', coalesce((select e.state from factory.enrollments e where e.credential_id = ctx.credential_id), 'ALIVE'),
      'release', jsonb_build_object('release_id', rel.release_id, 'state', rel.state, 'current', certified),
      'envelope', jsonb_build_object('version', ctx.envelope_version, 'roles', to_jsonb(ctx.authorized_roles),
        'capabilities', to_jsonb(ctx.authorized_capabilities), 'work_types', to_jsonb(ctx.allowed_work_types),
        'company_ids', to_jsonb(ctx.company_ids), 'max_concurrent_runs', ctx.max_concurrent_runs, 'max_heavy', ctx.max_heavy),
      'revocations', factory._revocations(ctx.tenant_id));
  end $$;

-- ===================================================================================================
-- HEARTBEAT (node.mjs:75 nodeBeat): liveness, the reported phase and the resource profile. It never changes authority: the body
-- carries no role, capability or envelope (the 69df2f52 beat re-asserted the node's own role; this one cannot - N2 inverted).
-- RECOVERING -> AVAILABLE is the end of reconciliation: every run of this node not renewed since it began recovering is given up
-- here, so no resumed work continues without a fresh claim. A drain requested while the node was down shows as DRAINING.
-- ===================================================================================================
create function factory.node_heartbeat(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; cur factory.nodes; phase text := p_body ->> 'phase'; given_up integer := 0;
  begin
    select * into a from factory._node_session(p_token_hash, false, 'heartbeat');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    if phase is null or phase not in ('RECOVERING', 'AVAILABLE', 'CLAIMING', 'BUSY', 'CHECKPOINTING', 'COMPLETING', 'DRAINING') then
      return factory._refusal('bad_request', 400, 'phase must be one of the runtime states of contract §2');
    end if;
    select n.* into cur from factory.nodes n where n.node_id = ctx.node_id for update;
    if cur.runtime_phase = 'RECOVERING' and phase <> 'RECOVERING' then
      update factory.agent_runs set lease_expires_at = now(), updated_at = now()
       where node_id = ctx.node_id and status = 'in_progress'
         and (last_heartbeat_at is null or last_heartbeat_at < cur.runtime_phase_at);
      get diagnostics given_up = row_count;
    end if;
    if ctx.draining and phase in ('AVAILABLE', 'CLAIMING') then phase := 'DRAINING'; end if;
    update factory.nodes
       set last_heartbeat_at = now(),
           runtime_phase_at = case when runtime_phase is distinct from phase then now() else runtime_phase_at end,
           runtime_phase = phase,
           reported_resources = coalesce(factory._obj(p_body, 'resources'), reported_resources),
           reported_at = case when factory._obj(p_body, 'resources') is not null then now() else reported_at end
     where node_id = ctx.node_id;
    perform factory._record_fingerprint(ctx, factory._hex64(p_body ->> 'fingerprint'));
    return jsonb_build_object('ok', true, 'server_time', now(), 'phase', phase, 'draining', ctx.draining, 'given_up', given_up,
      'rotate_required', (select c.rotation_requested_at is not null from factory.node_credentials c where c.credential_id = ctx.credential_id),
      'adopted_release_id', (select m.adopted_release_id from factory.computers m where m.computer_id = ctx.computer_id),
      'release_current', factory._release_current(ctx, cur.release_id), 'revocations', factory._revocations(ctx.tenant_id));
  end $$;

-- ===================================================================================================
-- CLAIM (claim.mjs:121 claimWork -> claimInTransaction), authoring work. The node's resources and fingerprint come with the call
-- (the report the gates read). The 12 gates, then ranking. Returns the claimed run, the work order, and - on a takeover - the
-- latest checkpoint of the work order (the run records it as resumed_from_checkpoint_id). Nothing claimable is an ordinary result,
-- with the first failing gate of each work order considered.
-- ===================================================================================================
create function factory._claim(p_ctx factory.node_ctx, p_body jsonb, p_kind text) returns jsonb
  language plpgsql volatile set search_path = ''
  as $$
  declare
    me factory.nodes;
    w factory.work_orders;
    picked factory.work_orders;
    gate jsonb;
    considered jsonb := '[]'::jsonb;
    lease integer := factory._lease_seconds(p_body);
    only_wo uuid := case when p_body ->> 'only_work_order_id' ~ '^[0-9a-f-]{36}$' then (p_body ->> 'only_work_order_id')::uuid end;
    types text[] := case when jsonb_typeof(p_body -> 'work_types') = 'array'
                         then array(select jsonb_array_elements_text(p_body -> 'work_types')) end;
    v_run uuid;
    resume factory.checkpoints;
    v_surface text;
    started timestamptz;
    lease_until timestamptz;
    fp text := factory._hex64(p_body ->> 'fingerprint');
  begin
    -- claims are serialized plane-wide, with the SAME key as the frozen legacy claim (claim.mjs:157)
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('factory.claim'));
    perform factory._reap();
    -- the report the gates read: this call's resources and fingerprint
    update factory.nodes set reported_resources = coalesce(factory._obj(p_body, 'resources'), reported_resources),
                             reported_at = case when factory._obj(p_body, 'resources') is not null then now() else reported_at end
     where node_id = p_ctx.node_id;
    perform factory._record_fingerprint(p_ctx, fp);
    select n.* into me from factory.nodes n where n.node_id = p_ctx.node_id;

    if only_wo is not null and not exists (select 1 from factory.work_orders x where x.work_order_id = only_wo
                                             and factory._new_model_capabilities(x.requires_capabilities)) then
      return factory._refusal('not_enrolled_work', 403,
        'the claim front door takes only new-model work orders (factory-enrolled-v1); this one is not, or does not exist');
    end if;

    for w in
      select wo.* from factory.work_orders wo
       where wo.tenant_id = p_ctx.tenant_id and wo.status = 'queued'
         and factory._new_model_capabilities(wo.requires_capabilities)
         and (case when p_kind = 'verification'
                   then wo.verifies_work_order_id is not null and exists (
                          select 1 from factory.work_orders pw where pw.work_order_id = wo.verifies_work_order_id
                             and pw.current_candidate_run_id = wo.verifies_run_id
                             and pw.verification_state = 'WAITING_FOR_INDEPENDENT_VERIFICATION')
                   else wo.verifies_work_order_id is null end)
         and (only_wo is null or wo.work_order_id = only_wo)
         and (types is null or wo.work_type = any (types))
         and not exists (select 1 from unnest(wo.owned_surface) s where s is null or btrim(s) = '' or octet_length(s) > 1000)
         and not exists (select 1 from factory.work_order_dependencies d join factory.work_orders dep on dep.work_order_id = d.depends_on
                          where d.work_order_id = wo.work_order_id and dep.status <> 'done')
       order by wo.priority_num desc, wo.queued_at, wo.work_order_id
       for update of wo skip locked
    loop
      gate := factory._first_failing_gate(p_ctx, w, p_kind, me);
      if gate is null and factory._should_defer(p_ctx, w, p_kind, me) then
        gate := jsonb_build_object('deferred', true, 'detail', 'a better-ranked eligible node exists; deferred at most 30 s from queueing');
      end if;
      if gate is null then picked := w; exit; end if;
      if jsonb_array_length(considered) < 20 then
        considered := considered || jsonb_build_array(jsonb_build_object('work_order_id', w.work_order_id) || gate);
      end if;
    end loop;

    if picked.work_order_id is null then
      if only_wo is not null and jsonb_array_length(considered) = 1 and considered -> 0 ? 'gate' then
        return factory._refusal('not_eligible', 409, 'not eligible: gate ' || (considered -> 0 ->> 'gate') || ' ' || (considered -> 0 ->> 'gate_name')
          || ' - ' || (considered -> 0 ->> 'detail'), jsonb_build_object('considered', considered));
      end if;
      return jsonb_build_object('ok', true, 'claimed', null, 'considered', considered, 'server_time', now());
    end if;

    select k.* into resume from factory.checkpoints k where k.work_order_id = picked.work_order_id
     order by k.created_at desc, k.checkpoint_id desc limit 1;
    insert into factory.agent_runs
      (work_order_id, node_id, status, lease_expires_at, last_heartbeat_at, started_at, authoring_node_id,
       requested_provider, requested_model, reasoning_effort, base_commit,
       principal_id, computer_id, credential_id, run_kind, assignment_role, envelope_version,
       release_id, runtime_version, runtime_digest, machine_fingerprint, resumed_from_checkpoint_id, tenant_id)
    values (picked.work_order_id, p_ctx.node_id, 'in_progress', now() + (lease || ' seconds')::interval, now(), clock_timestamp(),
            p_ctx.node_id, left(p_body ->> 'requested_provider', 64), left(p_body ->> 'requested_model', 128),
            left(p_body ->> 'reasoning_effort', 32), left(p_body ->> 'base_commit', 64),
            p_ctx.principal_id, p_ctx.computer_id, p_ctx.credential_id, p_kind, picked.requires_security_role, p_ctx.envelope_version,
            me.release_id, me.runtime_version, me.runtime_digest, coalesce(fp, me.machine_fingerprint), resume.checkpoint_id, p_ctx.tenant_id)
    returning agent_runs.run_id, agent_runs.started_at, agent_runs.lease_expires_at into v_run, started, lease_until;
    update factory.agent_runs set authoring_run_id = agent_runs.run_id where agent_runs.run_id = v_run;
    foreach v_surface in array (select coalesce(array_agg(distinct s), '{}'::text[]) from unnest(picked.owned_surface) s) loop
      insert into factory.surface_locks (surface, run_id, node_id, lease_expires_at, principal_id, tenant_id)
      values (v_surface, v_run, p_ctx.node_id, 'infinity', p_ctx.principal_id, p_ctx.tenant_id);
    end loop;
    if p_kind = 'verification' then
      update factory.work_orders
         set verification_state = 'VERIFICATION_CLAIMED', verification_state_at = now(),
             verification_reason = 'claimed by verification run ' || v_run
       where work_order_id = picked.verifies_work_order_id;
    end if;
    update factory.work_orders set status = 'claimed', updated_at = now() where work_order_id = picked.work_order_id;
    return jsonb_build_object('ok', true, 'server_time', now(), 'claimed', jsonb_build_object(
      'run_id', v_run, 'lease_expires_at', lease_until, 'started_at', started, 'kind', p_kind,
      'assignment_role', picked.requires_security_role, 'work_order', factory._work_order_view(picked),
      'resume_from', case when resume.checkpoint_id is null then null else jsonb_build_object(
         'checkpoint_id', resume.checkpoint_id, 'run_id', resume.run_id, 'location', resume.location,
         'scenario', resume.scenario, 'payload', resume.payload, 'created_at', resume.created_at) end),
      'considered', considered);
  end $$;

create function factory.node_claim(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record;
  begin
    select * into a from factory._node_session(p_token_hash, false, 'claim');
    if a.refusal is not null then return a.refusal; end if;
    return factory._claim(a.ctx, p_body, 'authoring');
  end $$;

-- ===================================================================================================
-- RENEW (claim.mjs:361 heartbeat): FENCED on (run, this node, in_progress). A run that was taken over renews nothing and learns
-- it lost the lease; the attempt is audited. The node's liveness is stamped with the run's lease.
-- ===================================================================================================
create function factory.node_renew(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; run uuid; until timestamptz; lease integer := factory._lease_seconds(p_body);
  begin
    select * into a from factory._node_session(p_token_hash, false, 'renew');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    run := case when p_body ->> 'run_id' ~ '^[0-9a-f-]{36}$' then (p_body ->> 'run_id')::uuid end;
    update factory.agent_runs
       set last_heartbeat_at = now(), lease_expires_at = now() + (lease || ' seconds')::interval, updated_at = now()
     where agent_runs.run_id = run and node_id = ctx.node_id and status = 'in_progress'
    returning lease_expires_at into until;
    if until is null then
      perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.renew', 'run', run::text, 'refused', 'lease_lost');
      return factory._refusal('lease_lost', 409, 'this run is no longer this node''s (its lease was taken over): nothing renewed; stop the work');
    end if;
    update factory.nodes set last_heartbeat_at = now() where node_id = ctx.node_id;
    return jsonb_build_object('ok', true, 'run_id', run, 'lease_expires_at', until, 'server_time', now());
  end $$;

-- ===================================================================================================
-- CHECKPOINT (claim.mjs:387): FENCED INSIDE THE FRONT DOOR - the run row is locked and must be this node's and in progress; then
-- one idempotent insert (the caller's checkpoint id: a retry after a lost reply writes one row) and the run's pointer. The
-- checkpoint is stamped with the principal, computer and release that wrote it.
-- ===================================================================================================
create function factory.node_checkpoint(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; r factory.agent_runs; cp uuid; written integer; me factory.nodes;
  begin
    select * into a from factory._node_session(p_token_hash, false, 'checkpoint');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    select x.* into r from factory.agent_runs x
     where x.run_id = case when p_body ->> 'run_id' ~ '^[0-9a-f-]{36}$' then (p_body ->> 'run_id')::uuid end for update;
    if r.run_id is null or r.node_id is distinct from ctx.node_id or r.status <> 'in_progress' then
      perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.checkpoint', 'run', p_body ->> 'run_id', 'refused', 'lease_lost');
      return factory._refusal('lease_lost', 409, 'this run is no longer this node''s (its lease was taken over): checkpoint not written');
    end if;
    if coalesce(length(p_body ->> 'location'), 0) not between 1 and 1000 then
      return factory._refusal('bad_request', 400, 'a checkpoint needs a location (1..1000 characters)');
    end if;
    select n.* into me from factory.nodes n where n.node_id = ctx.node_id;
    cp := coalesce(case when p_body ->> 'checkpoint_id' ~ '^[0-9a-f-]{36}$' then (p_body ->> 'checkpoint_id')::uuid end, gen_random_uuid());
    insert into factory.checkpoints (checkpoint_id, run_id, work_order_id, location, scenario, payload,
                                     principal_id, computer_id, release_id, runtime_version, runtime_digest, tenant_id)
    values (cp, r.run_id, r.work_order_id, p_body ->> 'location', left(p_body ->> 'scenario', 200),
            coalesce(factory._obj(p_body, 'payload'), '{}'::jsonb), ctx.principal_id, ctx.computer_id,
            me.release_id, me.runtime_version, me.runtime_digest, ctx.tenant_id)
    on conflict (checkpoint_id) do nothing;
    get diagnostics written = row_count;
    update factory.agent_runs
       set checkpoint_location = p_body ->> 'location',
           last_completed_scenario = coalesce(left(p_body ->> 'scenario', 200), last_completed_scenario),
           branch = coalesce(left(p_body ->> 'branch', 200), branch), worktree = coalesce(left(p_body ->> 'worktree', 500), worktree),
           updated_at = now()
     where run_id = r.run_id;
    return jsonb_build_object('ok', true, 'checkpoint_id', cp, 'written', written = 1, 'server_time', now());
  end $$;

-- ===================================================================================================
-- COMPLETE (claim.mjs:420 completeRun). All-or-nothing, FENCED on the run's live ownership. A superseded run changes nothing and
-- is told so, with whether its own earlier completion already landed (the node.mjs:514 landed check). A done run of a work order
-- that requires verification moves it to review / WAITING_FOR_INDEPENDENT_VERIFICATION, records it as the current candidate
-- (voiding every certification of an earlier one), and queues exactly one verification work order - in this transaction. A done
-- run whose content (tree) equals a FAILED candidate's is refused as a resubmission, whoever submits it.
-- ===================================================================================================
create function factory.node_complete(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare
    a record; ctx factory.node_ctx; r factory.agent_runs; w factory.work_orders;
    st text := p_body ->> 'status';
    reason text := left(p_body ->> 'termination_reason', 100);
    tree text := case when p_body ->> 'candidate_tree' ~ '^[0-9a-f]{40}([0-9a-f]{24})?$' then p_body ->> 'candidate_tree' end;
    head text := case when p_body ->> 'head_commit' ~ '^[0-9a-f]{40}$' then p_body ->> 'head_commit' end;
    u jsonb := coalesce(factory._obj(p_body, 'usage'), '{}'::jsonb);
    v uuid;
  begin
    select * into a from factory._node_session(p_token_hash, false, 'complete');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    if st is null or st not in ('done', 'failed') then
      return factory._refusal('bad_request', 400, 'status must be done or failed');
    end if;
    if reason is null or btrim(reason) = '' then
      return factory._refusal('bad_request', 400, 'a terminal outcome needs termination_reason: the terminal condition actually observed');
    end if;
    select x.* into r from factory.agent_runs x
     where x.run_id = case when p_body ->> 'run_id' ~ '^[0-9a-f-]{36}$' then (p_body ->> 'run_id')::uuid end for update;
    if r.run_id is null or r.node_id is distinct from ctx.node_id or r.status <> 'in_progress' or r.run_kind <> 'authoring' then
      perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.complete', 'run', p_body ->> 'run_id', 'refused', 'superseded');
      return factory._refusal('superseded', 409, 'this run no longer holds its work order: nothing completed',
        jsonb_build_object('superseded', true, 'landed', coalesce(r.node_id = ctx.node_id and r.status = st and r.run_kind = 'authoring', false)));
    end if;
    if ((p_body ->> 'actual_provider') is not null and r.requested_provider is not null and p_body ->> 'actual_provider' <> r.requested_provider
        or (p_body ->> 'actual_model') is not null and r.requested_model is not null and p_body ->> 'actual_model' <> r.requested_model)
       and coalesce(btrim(p_body ->> 'fallback_reason'), '') = '' then
      return factory._refusal('bad_request', 400, 'a substitution needs a fallback_reason - NO SILENT MODEL FALLBACK');
    end if;
    select x.* into w from factory.work_orders x where x.work_order_id = r.work_order_id for update;
    if st = 'done' and w.requires_verification and tree is null then
      return factory._refusal('bad_request', 400, 'a candidate for verification states its content digest (candidate_tree) and head_commit');
    end if;
    if st = 'done' and w.requires_verification and exists (
         select 1 from factory.certifications c join factory.agent_runs cr on cr.run_id = c.candidate_run_id
          where c.work_order_id = w.work_order_id and c.verdict = 'FAIL' and cr.candidate_tree = tree) then
      update factory.agent_runs
         set status = 'failed', termination_reason = 'resubmission_refused', head_commit = coalesce(head, head_commit),
             candidate_tree = tree, finished_at = now(), lease_expires_at = null, updated_at = now()
       where run_id = r.run_id;
      delete from factory.surface_locks where run_id = r.run_id;
      update factory.work_orders set status = 'queued', queued_at = now(), updated_at = now(),
             verification_reason = 'a resubmission of a FAILED candidate''s content was refused'
       where work_order_id = w.work_order_id;
      perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.complete', 'work_order', w.work_order_id::text,
                             'refused', 'resubmission_refused', jsonb_build_object('run_id', r.run_id, 'candidate_tree', tree));
      return factory._refusal('resubmission_refused', 409,
        'this content (tree) is identical to a candidate that FAILED verification: refused as a resubmission');
    end if;

    update factory.agent_runs
       set status = st, summary = coalesce(left(p_body ->> 'summary', 4000), summary), head_commit = coalesce(head, head_commit),
           candidate_tree = coalesce(tree, candidate_tree), termination_reason = reason,
           actual_provider = coalesce(left(p_body ->> 'actual_provider', 64), actual_provider),
           actual_model = coalesce(left(p_body ->> 'actual_model', 128), actual_model),
           fallback_reason = coalesce(left(p_body ->> 'fallback_reason', 300), fallback_reason),
           reasoning_effort = coalesce(left(u ->> 'reasoning_effort', 32), reasoning_effort),
           input_tokens = coalesce(case when jsonb_typeof(u -> 'input_tokens') = 'number' then (u ->> 'input_tokens')::bigint end, input_tokens),
           cached_tokens = coalesce(case when jsonb_typeof(u -> 'cached_tokens') = 'number' then (u ->> 'cached_tokens')::bigint end, cached_tokens),
           output_tokens = coalesce(case when jsonb_typeof(u -> 'output_tokens') = 'number' then (u ->> 'output_tokens')::bigint end, output_tokens),
           estimated_cost_usd = coalesce(case when jsonb_typeof(u -> 'estimated_cost_usd') = 'number' then (u ->> 'estimated_cost_usd')::numeric end, estimated_cost_usd),
           finished_at = now(), lease_expires_at = null, updated_at = now()
     where run_id = r.run_id;
    delete from factory.surface_locks where run_id = r.run_id;

    if st = 'failed' then
      update factory.work_orders set status = 'failed', updated_at = now() where work_order_id = w.work_order_id;
    elsif not coalesce(w.requires_verification, false) then
      update factory.work_orders set status = 'done', completed_at = now(), updated_at = now() where work_order_id = w.work_order_id;
    else
      update factory.work_orders
         set status = 'review', current_candidate_run_id = r.run_id, updated_at = now(),
             verification_state = 'WAITING_FOR_INDEPENDENT_VERIFICATION', verification_state_at = now(),
             verification_reason = 'candidate ' || r.run_id || ' implemented; waiting for an independent verifier'
       where work_order_id = w.work_order_id;
      v := gen_random_uuid();
      insert into factory.work_orders (work_order_id, tenant_id, title, work_type, status, owned_surface, requires_security_role,
                                       requires_capabilities, priority_num, requires_verification, queued_at, verifies_work_order_id,
                                       verifies_run_id, campaign_key, company_id, handoff)
      values (v, w.tenant_id, left('verify: ' || w.title, 500), 'verification', 'queued', '{}', 'verifier', array['factory-enrolled-v1'],
              w.priority_num, false, now(), w.work_order_id, r.run_id, w.campaign_key, w.company_id,
              jsonb_build_object('verifies_work_order_id', w.work_order_id, 'candidate_run_id', r.run_id,
                                 'head_commit', coalesce(head, r.head_commit), 'candidate_tree', tree)::text);
      perform factory._audit(ctx.tenant_id, 'server', null, 'verification.waiting', 'work_order', w.work_order_id::text, 'ok',
                             'IMPLEMENTED -> WAITING_FOR_INDEPENDENT_VERIFICATION',
                             jsonb_build_object('candidate_run_id', r.run_id, 'verification_work_order_id', v));
    end if;
    return jsonb_build_object('ok', true, 'superseded', false, 'run_id', r.run_id, 'status', st, 'server_time', now(),
      'verification_work_order_id', v);
  end $$;

-- ===================================================================================================
-- RELEASE (node.mjs:283 abort give-back; node.mjs:244 orphan give-back): the node gives leases back at once - one run, or every
-- run of this node except the ones it names as still held. A released verification claim returns its work order to WAITING.
-- ===================================================================================================
create function factory.node_release(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; one uuid; keep uuid[]; n integer;
  begin
    select * into a from factory._node_session(p_token_hash, false, 'release');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    one := case when p_body ->> 'run_id' ~ '^[0-9a-f-]{36}$' then (p_body ->> 'run_id')::uuid end;
    keep := case when jsonb_typeof(p_body -> 'keep_run_ids') = 'array'
                 then array(select x::uuid from jsonb_array_elements_text(p_body -> 'keep_run_ids') x where x ~ '^[0-9a-f-]{36}$') end;
    if one is null and keep is null then
      return factory._refusal('bad_request', 400, 'name a run_id to give back, or keep_run_ids to give back every other run of this node');
    end if;
    with gone as (
      update factory.agent_runs set lease_expires_at = now(), updated_at = now()
       where node_id = ctx.node_id and status = 'in_progress'
         and (run_id = one or (keep is not null and not (run_id = any (keep))))
      returning run_id, work_order_id, run_kind),
    waiting as (
      update factory.work_orders w
         set verification_state = 'WAITING_FOR_INDEPENDENT_VERIFICATION', verification_state_at = now(),
             verification_reason = 'the verifier released its claim'
       where w.verification_state = 'VERIFICATION_CLAIMED'
         and w.work_order_id in (select v.verifies_work_order_id from factory.work_orders v
                                  where v.work_order_id in (select g.work_order_id from gone g where g.run_kind = 'verification'))
      returning 1)
    select count(*) into n from gone;
    return jsonb_build_object('ok', true, 'released', n, 'server_time', now());
  end $$;

-- ===================================================================================================
-- REPORT-STATE: the installer's and the runtime's own state, never authority. Enrollment steps the installer reports with its new
-- credential: NODE_CREDENTIAL_ISSUED -> RUNTIME_INSTALLING, RUNTIME_INSTALLING -> INSTALL_FAILED (reason named), INSTALL_FAILED ->
-- RUNTIME_INSTALLING (a retry with the same credential, no new code). A runtime phase, without stamping liveness.
-- ===================================================================================================
create function factory.node_report_state(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; enr record; step text := p_body ->> 'enrollment_step'; phase text := p_body ->> 'phase';
  begin
    select * into a from factory._node_session(p_token_hash, false, 'report_state');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    if step is not null then
      if step not in ('RUNTIME_INSTALLING', 'INSTALL_FAILED') then
        return factory._refusal('bad_request', 400, 'enrollment_step is RUNTIME_INSTALLING or INSTALL_FAILED');
      end if;
      select e.* into enr from factory.enrollments e where e.credential_id = ctx.credential_id for update;
      if not found then
        return factory._refusal('not_enrolling', 409, 'this credential has no enrollment walk in progress');
      end if;
      if enr.state = step then
        return jsonb_build_object('ok', true, 'already', true, 'enrollment_state', enr.state);
      end if;
      if not factory._enrollment_step_ok(enr.state, step) then
        return factory._refusal('bad_transition', 409, format('enrollment %s -> %s is not a transition of contract §2', enr.state, step));
      end if;
      perform factory._enrollment_step(enr.enrollment_id, step, 'installer', left(p_body ->> 'reason', 200));
      return jsonb_build_object('ok', true, 'enrollment_state', step);
    end if;
    if phase is not null then
      if phase not in ('RECOVERING', 'AVAILABLE', 'CLAIMING', 'BUSY', 'CHECKPOINTING', 'COMPLETING', 'DRAINING') then
        return factory._refusal('bad_request', 400, 'phase must be one of the runtime states of contract §2');
      end if;
      update factory.nodes set runtime_phase_at = case when runtime_phase is distinct from phase then now() else runtime_phase_at end,
                               runtime_phase = phase
       where node_id = ctx.node_id and not (runtime_phase = 'RECOVERING' and phase <> 'RECOVERING');
      return jsonb_build_object('ok', true, 'phase', (select n.runtime_phase from factory.nodes n where n.node_id = ctx.node_id));
    end if;
    return factory._refusal('bad_request', 400, 'report-state carries an enrollment_step or a phase');
  end $$;

reset role;

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

-- the lease a claim or a renew asks for: 120 s when the body names none (or not as a number: the ported 69df2f52 default,
-- claim.mjs DEFAULT_LEASE_SECONDS), else held to 5..600 s. The default is applied BEFORE the bounds: least() and greatest() skip a
-- null argument, so a null reaching them would come out as the upper bound, never as the default.
create function factory._lease_seconds(p_body jsonb) returns integer
  language sql immutable parallel safe set search_path = pg_catalog, pg_temp
  as $$ select greatest(5, least(600, coalesce(factory._jint(p_body, 'lease_seconds'), 120))) $$;

-- one step of an enrollment's walk (contract §2; the guard checks the transition). The step names its actor and reason on the row;
-- the transition log (part 080) records it.
create function factory._enrollment_step(p_enrollment uuid, p_to text, p_actor text, p_reason text default null) returns void
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  declare e record;
  begin
    select x.* into e from factory.enrollments x where x.enrollment_id = p_enrollment for update;
    if e.state = p_to then return; end if;
    update factory.enrollments set state = p_to, state_actor = p_actor, state_reason = left(p_reason, 200), state_at = now()
     where enrollment_id = p_enrollment;
  end $$;

-- the fingerprint a node reports: kept on the node, and in the computer's list (it only ever refuses; S-16b). It never writes the
-- computers row: a node call holds its credential (SHARE) and must never then wait for the computer row an admin action holds while
-- it waits for that credential (the plane's lock order is computer, then credential). The fingerprint recorded at the first
-- registration is written by node_register, which takes the computer row before its credential.
create function factory._record_fingerprint(p_ctx factory.node_ctx, p_fp text) returns void
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  begin
    if p_fp is null then return; end if;
    insert into factory.computer_fingerprints (tenant_id, computer_id, fingerprint) values (p_ctx.tenant_id, p_ctx.computer_id, p_fp)
      on conflict (computer_id, fingerprint) do update set last_reported_at = now();
    update factory.nodes set machine_fingerprint = p_fp where node_id = p_ctx.node_id;
  end $$;

-- THE REAPER (claim.mjs:168-182, both fleets, as the frozen claim does it), plus what the new model adds: an enrolled lock dies
-- with its run's lease; a lapsed verification claim returns its work order to WAITING_FOR_INDEPENDENT_VERIFICATION.
-- Its effects commit with the calling front door even when nothing is claimed afterwards, so a lapsed lease is visible as
-- lapsed at once; work becomes claimable again only after a REAL lease expiry, as in 69df2f52.
create function factory._reap() returns integer
  language plpgsql volatile set search_path = pg_catalog, pg_temp
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
         set status = 'queued', updated_at = now()  -- queued_at is kept: a taken-over work order keeps its place (claim.mjs:178)
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

-- the work order as a node needs it to do the work (what node.mjs:461 read after a claim). A repair after a FAILED verification is
-- told so: the verification state and reason, and the content digests of every FAILED candidate (a candidate with the same content
-- is refused as a resubmission)
create function factory._work_order_view(p_wo factory.work_orders) returns jsonb
  language sql stable set search_path = pg_catalog, pg_temp
  as $$
    select jsonb_build_object('work_order_id', p_wo.work_order_id, 'title', p_wo.title, 'work_type', p_wo.work_type,
      'owned_surface', to_jsonb(p_wo.owned_surface), 'handoff', p_wo.handoff, 'branch', p_wo.branch, 'base_commit', p_wo.base_commit,
      'requires_security_role', p_wo.requires_security_role, 'requires_capabilities', to_jsonb(p_wo.requires_capabilities),
      'weight', p_wo.weight, 'priority', p_wo.priority_num, 'company_id', p_wo.company_id, 'campaign_key', p_wo.campaign_key,
      'min_resources', p_wo.min_resources, 'requires_verification', p_wo.requires_verification,
      'verifies_work_order_id', p_wo.verifies_work_order_id, 'verifies_run_id', p_wo.verifies_run_id,
      'verification_state', p_wo.verification_state, 'verification_reason', p_wo.verification_reason,
      'failed_candidate_trees', (select coalesce(jsonb_agg(distinct c.candidate_tree), '[]'::jsonb) from factory.certifications c
                                  where c.work_order_id = p_wo.work_order_id and c.verdict = 'FAIL' and c.candidate_tree is not null))
  $$;

-- ===================================================================================================
-- REGISTER (node.mjs:351 registerNode). Identity from the credential. Reports the runtime release, fingerprint, hostname, OS and
-- resources; the node starts RECOVERING. For a credential still walking its enrollment: RUNTIME_INSTALLING -> REGISTERING (its
-- first authenticated call) -> ALIVE when the release it runs is certified on this plane, else REGISTRATION_FAILED (the reason is
-- named; a retry reuses the same credential). Never stamps liveness: only heartbeat and renew do.
-- S-14: EVERY registration of an unbound computer record that has reported - in this call or ever before - a machine fingerprint a
-- record carrying the S-16(a) binding has reported (archived or not) is refused by name (s16a_bound_fingerprint), a retry included
-- and whatever fingerprint the retry reports. A credential still walking its enrollment enters REGISTRATION_FAILED. S-14's "takes no
-- work" holds from the first such refusal on, whatever the enrollment state: the record is marked (computers.
-- s14_registration_refused_at, set once) and gate 1 refuses it every work order. An ALIVE record keeps ALIVE, because contract §2 has
-- no edge from ALIVE (which state it shows is change request CR-013). The refused registration writes: the reported fingerprint
-- (computer_fingerprints, nodes.machine_fingerprint, and computers.registered_fingerprint while that is empty), the mark, the
-- enrollment walk of a credential still in it, and one audit row. It writes no release stamp and no runtime phase.
-- ===================================================================================================
create function factory.node_register(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = pg_catalog, pg_temp set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; rel record; enr record; certified boolean; fp text := factory._hex64(p_body ->> 'fingerprint');
          walk text;
  begin
    perform factory._refuse_superuser();   -- S-10 (register): before any row is read or locked
    if factory._identity_refusal(p_body) is not null then return factory._identity_refusal(p_body); end if;
    -- THE PLANE'S LOCK ORDER: the computer row, then the credential. A registration may write the computer row (the fingerprint of the
    -- first registration; the S-14 mark), so it takes that row BEFORE _node_session takes the credential (SHARE): an admin action
    -- holding the computer row and waiting for this credential can then never wait on a registration that waits for the computer.
    -- Only a LIVE session's computer is locked here: the session unrevoked and unexpired (at now(), the instant _node_session's first
    -- check reads) and its credential active (no credential ever returns to active). Any other token locks nothing and is refused by
    -- _node_session below. (A credential's computer never changes.)
    perform 1 from factory.computers m
     where m.computer_id = (select c.computer_id from factory.node_sessions s join factory.node_credentials c on c.credential_id = s.credential_id
                             where s.token_hash = p_token_hash and s.revoked_at is null and s.expires_at > now() and c.status = 'active')
       for no key update;
    select * into a from factory._node_session(p_token_hash, false, 'register');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    if factory._resources_problem(p_body) is not null then return factory._refusal('bad_request', 400, factory._resources_problem(p_body)); end if;
    perform factory._record_fingerprint(ctx, fp);
    update factory.computers set registered_fingerprint = fp where computer_id = ctx.computer_id and registered_fingerprint is null and fp is not null;
    if not ctx.s16a_bound and factory._computer_fingerprints(ctx.computer_id, fp) && factory._s16a_fingerprints(ctx.tenant_id) then
      select e.* into enr from factory.enrollments e where e.credential_id = ctx.credential_id for update;
      if found and enr.state in ('RUNTIME_INSTALLING', 'REGISTERING', 'REGISTRATION_FAILED') then
        perform factory._enrollment_step(enr.enrollment_id, 'REGISTERING', 'node', 'first authenticated call');
        perform factory._enrollment_step(enr.enrollment_id, 'REGISTRATION_FAILED', 'server', 's16a_bound_fingerprint');
      end if;
      update factory.computers set s14_registration_refused_at = now() where computer_id = ctx.computer_id and s14_registration_refused_at is null;
      walk := factory._credential_walk_state(ctx.credential_id);
      perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.register', 'computer', ctx.computer_id::text,
                             'refused', 's16a_bound_fingerprint', jsonb_build_object('computer_id', ctx.computer_id, 'credential_id', ctx.credential_id,
                                                                                    'enrollment_state', walk));
      return factory._refusal('registration_failed', 409,
        'registration refused: this unbound computer record has reported the machine fingerprint of a computer record carrying the S-16(a) binding (s16a_bound_fingerprint). During this milestone the computer is enrolled again only through Add Computer with the binding (S-14); every retry is refused the same way',
        jsonb_build_object('reason', 's16a_bound_fingerprint', 'enrollment_state', walk));
    end if;
    select r.* into rel from factory.releases r
     where r.tenant_id = ctx.tenant_id and r.digest = factory._hex64(p_body ->> 'runtime_digest')
     order by r.published_at desc limit 1;
    update factory.nodes
       set runtime_version = left(p_body ->> 'runtime_version', 64), runtime_digest = factory._hex64(p_body ->> 'runtime_digest'),
           release_id = rel.release_id, reported_hostname = left(p_body ->> 'hostname', 255), reported_os = left(p_body ->> 'os', 255),
           reported_resources = coalesce(factory._obj(p_body, 'resources'), reported_resources), reported_at = now(),
           runtime_phase = 'RECOVERING', runtime_phase_at = now()
     where node_id = ctx.node_id;
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
      'enrollment_state', factory._credential_walk_state(ctx.credential_id),
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
-- The reply also names the tenant's published release of each channel (published_releases; at most one per channel): with the
-- release adopted for this computer, it is what "current" means to the node's upgrade gate (contract §2 Release; AC-5(m)), which
-- uses it only to REFUSE an offered release that is neither. It adds no key and changes no mode (S-5).
-- ===================================================================================================
create function factory.node_heartbeat(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = pg_catalog, pg_temp set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; cur factory.nodes; phase text := p_body ->> 'phase'; given_up integer := 0;
  begin
    if factory._identity_refusal(p_body) is not null then return factory._identity_refusal(p_body); end if;
    select * into a from factory._node_session(p_token_hash, false, 'heartbeat');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    if factory._resources_problem(p_body) is not null then return factory._refusal('bad_request', 400, factory._resources_problem(p_body)); end if;
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
      'adopted_release', (select jsonb_build_object('release_id', r.release_id, 'version', r.version, 'digest', r.digest, 'state', r.state)
                            from factory.computers m join factory.releases r on r.release_id = m.adopted_release_id where m.computer_id = ctx.computer_id),
      'release_current', factory._release_current(ctx, cur.release_id), 'revocations', factory._revocations(ctx.tenant_id),
      'published_releases', (select coalesce(jsonb_agg(jsonb_build_object('release_id', r.release_id, 'channel', r.channel, 'version', r.version,
                                                                          'digest', r.digest) order by r.channel), '[]'::jsonb)
                               from factory.releases r where r.tenant_id = ctx.tenant_id and r.state = 'published'));
  end $$;

-- the certified candidate a verification work order names, as its verifier needs it (the verified work order and the candidate's
-- provenance: run, commit, content digest)
create function factory._verifies_view(p_v factory.work_orders) returns jsonb
  language sql stable set search_path = pg_catalog, pg_temp
  as $$
    select jsonb_build_object('work_order', factory._work_order_view(w),
      'candidate', jsonb_build_object('run_id', c.run_id, 'head_commit', c.head_commit, 'candidate_tree', c.candidate_tree,
                                      'summary', c.summary, 'finished_at', c.finished_at))
      from factory.work_orders w left join factory.agent_runs c on c.run_id = w.current_candidate_run_id
     where w.work_order_id = p_v.verifies_work_order_id
  $$;

-- ===================================================================================================
-- CLAIM (claim.mjs:121 claimWork -> claimInTransaction). The node's resources and fingerprint come with the call (the report the
-- gates read). The 12 gates, then ranking. Returns the claimed run, the work order, and - on a takeover - the latest checkpoint of
-- the work order (the run records it as resumed_from_checkpoint_id). Nothing claimable is an ordinary result, with the first
-- failing gate of each work order considered.
-- ONE RANKED PICK ACROSS BOTH KINDS (contract §2 "Current assignment role: chosen automatically by the scheduler"; P-7; P-10; as
-- 69df2f52 claim.mjs:229, :248-249 ranked generic and verifier work in one pick). p_door names the front door:
--   'claim'         authoring work of the types the node lists, and - when the node lists the reserved type 'verification' (it has a
--                   verification handler) - verification work too; a node that does not list it is never offered verification work
--   'verification'  verification work only (the S-7 verification-claim operation)
-- Every offered work order, of either kind, is taken in ONE order - numeric priority, then queue age - and the kind of the work
-- order picked decides the run's kind, gate 7's test and the reply's `kind`. The gates read the credential's CURRENT envelope on
-- every claim, so an envelope amendment takes effect at the node's next claim with nobody touching the node (AC-6(e)). An authoring
-- work order is matched against the listed types WITHOUT the reserved one, so an authoring work order whose type is named
-- 'verification' is never taken as verification work.
-- ===================================================================================================
create function factory._claim(p_ctx factory.node_ctx, p_body jsonb, p_door text) returns jsonb
  language plpgsql volatile set search_path = pg_catalog, pg_temp
  as $$
  declare
    me factory.nodes;
    w factory.work_orders;
    picked factory.work_orders;
    gate jsonb;
    considered jsonb := '[]'::jsonb;
    lease integer := factory._lease_seconds(p_body);
    only_wo uuid := case when factory._is_uuid(p_body ->> 'only_work_order_id') then (p_body ->> 'only_work_order_id')::uuid end;
    types text[] := case when jsonb_typeof(p_body -> 'work_types') = 'array'
                         then array(select jsonb_array_elements_text(p_body -> 'work_types')) end;
    -- which kinds this door offers, and the authoring types (the listed types without the reserved one)
    offer_verification boolean := p_door = 'verification' or (types is not null and 'verification' = any (types));
    offer_authoring boolean := p_door is distinct from 'verification';
    authoring_types text[] := case when types is not null then array_remove(types, 'verification') end;
    w_kind text;
    picked_kind text;
    v_run uuid;
    resume factory.checkpoints;
    v_surface text;
    started timestamptz;
    lease_until timestamptz;
    fp text := factory._hex64(p_body ->> 'fingerprint');
    got boolean := false;
  begin
    -- the resource report this call carries is checked before anything else (it is stored below and read by other nodes' claims)
    if factory._resources_problem(p_body) is not null then return factory._refusal('bad_request', 400, factory._resources_problem(p_body)); end if;
    -- claims are serialized plane-wide, with the SAME key as the frozen legacy claim (claim.mjs:157). A claim that cannot get the lock
    -- within a fixed bound of 150 tries 0.1 s apart (about 15 s; a claimer that died holding it) gives up - "nothing claimed this
    -- time" - and never blocks the plane (acceptance.mjs N; claim.mjs:349). The bound is a constant of this function: no error is
    -- caught (VERIFICATION_SPEC §3.4 r3), and the wait depends on no setting.
    for i in 1 .. 150 loop
      got := pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('factory.claim'));
      exit when got or i = 150;
      perform pg_catalog.pg_sleep(0.1);
    end loop;
    if not got then
      return factory._refusal('claim_lock_busy', 503, 'the plane-wide claim lock is busy (another claimer holds it); nothing claimed this time - retry');
    end if;
    perform factory._reap();
    -- the report the gates read: this call's resources and fingerprint
    update factory.nodes set reported_resources = coalesce(factory._obj(p_body, 'resources'), reported_resources),
                             reported_at = case when factory._obj(p_body, 'resources') is not null then now() else reported_at end
     where node_id = p_ctx.node_id;
    perform factory._record_fingerprint(p_ctx, fp);
    select n.* into me from factory.nodes n where n.node_id = p_ctx.node_id;

    -- another tenant's work order answers exactly like one that does not exist (no existence leak, S-9)
    if only_wo is not null and not exists (select 1 from factory.work_orders x where x.work_order_id = only_wo and x.tenant_id = p_ctx.tenant_id
                                             and factory._new_model_capabilities(x.requires_capabilities)) then
      return factory._refusal('not_enrolled_work', 403,
        'the claim front door takes only new-model work orders (factory-enrolled-v1); this one is not, or does not exist');
    end if;

    for w in
      select wo.* from factory.work_orders wo
       where wo.tenant_id = p_ctx.tenant_id and wo.status = 'queued'
         and factory._new_model_capabilities(wo.requires_capabilities)
         and (case when wo.verifies_work_order_id is not null
                   then offer_verification and (types is null or 'verification' = any (types)) and exists (
                          select 1 from factory.work_orders pw where pw.work_order_id = wo.verifies_work_order_id
                             and pw.current_candidate_run_id = wo.verifies_run_id
                             and pw.verification_state = 'WAITING_FOR_INDEPENDENT_VERIFICATION')
                   else offer_authoring and (authoring_types is null or wo.work_type = any (authoring_types)) end)
         and (only_wo is null or wo.work_order_id = only_wo)
         and not exists (select 1 from unnest(wo.owned_surface) s where s is null or btrim(s) = '' or octet_length(s) > 1000)
         and not exists (select 1 from factory.work_order_dependencies d join factory.work_orders dep on dep.work_order_id = d.depends_on
                          where d.work_order_id = wo.work_order_id and dep.status <> 'done')
       order by wo.priority_num desc, wo.queued_at, wo.work_order_id
       for update of wo skip locked
    loop
      w_kind := case when w.verifies_work_order_id is not null then 'verification' else 'authoring' end;
      gate := factory._first_failing_gate(p_ctx, w, w_kind, me);
      if gate is null and factory._should_defer(p_ctx, w, w_kind, me) then
        gate := jsonb_build_object('deferred', true, 'detail', 'a better-ranked eligible node exists; deferred at most 30 s from queueing');
      end if;
      if gate is null then picked := w; picked_kind := w_kind; exit; end if;
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
            p_ctx.principal_id, p_ctx.computer_id, p_ctx.credential_id, picked_kind, picked.requires_security_role, p_ctx.envelope_version,
            me.release_id, me.runtime_version, me.runtime_digest, coalesce(fp, me.machine_fingerprint), resume.checkpoint_id, p_ctx.tenant_id)
    returning agent_runs.run_id, agent_runs.started_at, agent_runs.lease_expires_at into v_run, started, lease_until;
    update factory.agent_runs set authoring_run_id = agent_runs.run_id where agent_runs.run_id = v_run;
    foreach v_surface in array (select coalesce(array_agg(distinct s), '{}'::text[]) from unnest(picked.owned_surface) s) loop
      insert into factory.surface_locks (surface, run_id, node_id, lease_expires_at, principal_id, tenant_id)
      values (v_surface, v_run, p_ctx.node_id, 'infinity', p_ctx.principal_id, p_ctx.tenant_id);
    end loop;
    if picked_kind = 'verification' then
      update factory.work_orders
         set verification_state = 'VERIFICATION_CLAIMED', verification_state_at = now(),
             verification_reason = 'claimed by verification run ' || v_run
       where work_order_id = picked.verifies_work_order_id;
    end if;
    update factory.work_orders set status = 'claimed', updated_at = now() where work_order_id = picked.work_order_id;
    return jsonb_build_object('ok', true, 'server_time', now(), 'claimed', jsonb_build_object(
      'run_id', v_run, 'lease_expires_at', lease_until, 'started_at', started, 'kind', picked_kind,
      'assignment_role', picked.requires_security_role, 'work_order', factory._work_order_view(picked),
      'resume_from', case when resume.checkpoint_id is null then null else jsonb_build_object(
         'checkpoint_id', resume.checkpoint_id, 'run_id', resume.run_id, 'location', resume.location,
         'scenario', resume.scenario, 'payload', resume.payload, 'created_at', resume.created_at) end)
      || case when picked_kind = 'verification' then jsonb_build_object('verifies', factory._verifies_view(picked)) else '{}'::jsonb end,
      'considered', considered);
  end $$;

create function factory.node_claim(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = pg_catalog, pg_temp set lock_timeout = '15s'
  as $$
  declare a record;
  begin
    if factory._identity_refusal(p_body) is not null then return factory._identity_refusal(p_body); end if;
    select * into a from factory._node_session(p_token_hash, false, 'claim');
    if a.refusal is not null then return a.refusal; end if;
    return factory._claim(a.ctx, p_body, 'claim');
  end $$;

-- ===================================================================================================
-- RENEW (claim.mjs:361 heartbeat): FENCED on (run, this node, in_progress). A run that was taken over renews nothing and learns
-- it lost the lease; the attempt is audited. The node's liveness is stamped with the run's lease.
-- ===================================================================================================
create function factory.node_renew(p_token_hash bytea, p_body jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = pg_catalog, pg_temp set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; run uuid; until timestamptz; lease integer := factory._lease_seconds(p_body);
  begin
    if factory._identity_refusal(p_body) is not null then return factory._identity_refusal(p_body); end if;
    select * into a from factory._node_session(p_token_hash, false, 'renew');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    run := case when factory._is_uuid(p_body ->> 'run_id') then (p_body ->> 'run_id')::uuid end;
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
  language plpgsql volatile security definer set search_path = pg_catalog, pg_temp set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; r factory.agent_runs; cp uuid; written integer; me factory.nodes;
  begin
    if factory._identity_refusal(p_body) is not null then return factory._identity_refusal(p_body); end if;
    select * into a from factory._node_session(p_token_hash, false, 'checkpoint');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    select x.* into r from factory.agent_runs x
     where x.run_id = case when factory._is_uuid(p_body ->> 'run_id') then (p_body ->> 'run_id')::uuid end for update;
    if r.run_id is null or r.node_id is distinct from ctx.node_id or r.status <> 'in_progress' then
      perform factory._audit(ctx.tenant_id, 'node', ctx.principal_id::text, 'node.checkpoint', 'run', p_body ->> 'run_id', 'refused', 'lease_lost');
      return factory._refusal('lease_lost', 409, 'this run is no longer this node''s (its lease was taken over): checkpoint not written');
    end if;
    if coalesce(length(p_body ->> 'location'), 0) not between 1 and 1000 then
      return factory._refusal('bad_request', 400, 'a checkpoint needs a location (1..1000 characters)');
    end if;
    select n.* into me from factory.nodes n where n.node_id = ctx.node_id;
    cp := coalesce(case when factory._is_uuid(p_body ->> 'checkpoint_id') then (p_body ->> 'checkpoint_id')::uuid end, gen_random_uuid());
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
  language plpgsql volatile security definer set search_path = pg_catalog, pg_temp set lock_timeout = '15s'
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
    if factory._identity_refusal(p_body) is not null then return factory._identity_refusal(p_body); end if;
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
     where x.run_id = case when factory._is_uuid(p_body ->> 'run_id') then (p_body ->> 'run_id')::uuid end for update;
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
      -- back to the queue at once, its queue age kept (contract §2: VERIFICATION_FAILED -> IMPLEMENTED only through a new candidate;
      -- P-6: only an S-16 restriction excludes, so nothing here withholds the work order). The reason names the refused content, for
      -- admins (the work observation) and for the next repair (its claimed view also lists every FAILED tree). Any limit on how often
      -- such a repair is dispatched is a Director question (change request CR-014); none is applied until it is decided.
      update factory.work_orders set status = 'queued', updated_at = now(),
             verification_reason = 'resubmission refused: its content (tree ' || left(tree, 12) || ') equals a candidate that FAILED verification; queued for a new candidate'
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
           -- usage is descriptive: a count that is not a number within the column's range, or a cost outside numeric(12,6), is ignored
           -- (the column keeps its value), never an unnamed error (factory._num tests the shape before any cast)
           input_tokens = coalesce(case when factory._num(u, 'input_tokens') between 0 and 9e18 then trunc(factory._num(u, 'input_tokens'))::bigint end, input_tokens),
           cached_tokens = coalesce(case when factory._num(u, 'cached_tokens') between 0 and 9e18 then trunc(factory._num(u, 'cached_tokens'))::bigint end, cached_tokens),
           output_tokens = coalesce(case when factory._num(u, 'output_tokens') between 0 and 9e18 then trunc(factory._num(u, 'output_tokens'))::bigint end, output_tokens),
           estimated_cost_usd = coalesce(case when factory._num(u, 'estimated_cost_usd') between 0 and 999999 then round(factory._num(u, 'estimated_cost_usd'), 6) end, estimated_cost_usd),
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
  language plpgsql volatile security definer set search_path = pg_catalog, pg_temp set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; one uuid; keep uuid[]; n integer;
  begin
    if factory._identity_refusal(p_body) is not null then return factory._identity_refusal(p_body); end if;
    select * into a from factory._node_session(p_token_hash, false, 'release');
    if a.refusal is not null then return a.refusal; end if;
    ctx := a.ctx;
    one := case when factory._is_uuid(p_body ->> 'run_id') then (p_body ->> 'run_id')::uuid end;
    keep := case when jsonb_typeof(p_body -> 'keep_run_ids') = 'array'
                 then array(select x::uuid from jsonb_array_elements_text(p_body -> 'keep_run_ids') x where factory._is_uuid(x)) end;
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
  language plpgsql volatile security definer set search_path = pg_catalog, pg_temp set lock_timeout = '15s'
  as $$
  declare a record; ctx factory.node_ctx; enr record; step text := p_body ->> 'enrollment_step'; phase text := p_body ->> 'phase';
  begin
    if factory._identity_refusal(p_body) is not null then return factory._identity_refusal(p_body); end if;
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

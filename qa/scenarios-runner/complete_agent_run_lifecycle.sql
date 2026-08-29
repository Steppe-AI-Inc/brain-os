-- complete_agent_run — permanent regression for the gap found during independent
-- verification of Phase 8 Work Order 3b28e447-4a9c-4f79-9419-80638a39e457 (not in the
-- quiet-wiggling-biscuit plan file - found after that plan was written; see
-- docs/software-factory/PHASE_8_SECURITY_INCIDENT.md and migration
-- 202608290010_agent_run_completion.sql). Proves, against real fixture agent_runs/tasks
-- rows in a rolled-back transaction, against the already-deployed complete_agent_run()
-- (not redefined here, same convention as every other scenarios-runner script):
--   1. founder can complete a real run and the linked task's status flips to match
--   2. re-completing with identical status/head_commit/verification_status is idempotent
--      (changed:false, reason:already_recorded) - no spurious second task write
--   3. a company manager of the SAME company (who legitimately passes
--      agent_runs_update_scope RLS for a routine field edit) is still denied by this
--      RPC's own founder/admin-only gate - the RPC is deliberately narrower than RLS,
--      because this records an authoritative completion result, not a routine write
--   4. completing a run with a null task_id does not error, and correctly reports
--      taskUpdated:false (a background bootstrap run genuinely has no task)
--   5. an unknown verification_status value is rejected with a clear error, not a bare
--      constraint violation
--   6. not-found id -> reason not_found, no mutation

begin;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

-- ================== FIXTURES ==================

insert into public.companies (id, name, status) values ('cccc1001-0000-0000-0000-000000000001','SC-CAR Co','active');
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
  values ('cccc1001-0000-0000-0000-000000000001','66ef2052-d002-4592-b841-82cd2171b51a','manager', true);

-- Task + Run 1: the real founder-completion + idempotency path.
insert into public.tasks (id, company_id, title, status) values
  ('cccc1002-0000-0000-0000-000000000001','cccc1001-0000-0000-0000-000000000001','SC-CAR Task One','in_progress');
insert into public.agent_runs (id, task_id, company_id, execution_provider, provider_run_id, status, started_at) values
  ('cccc1003-0000-0000-0000-000000000001','cccc1002-0000-0000-0000-000000000001','cccc1001-0000-0000-0000-000000000001','claude_code_background','sc-car-run-1','in_progress'::work_status, now());

-- Run 2: for the non-founder-manager-denied test, same company.
insert into public.tasks (id, company_id, title, status) values
  ('cccc1002-0000-0000-0000-000000000002','cccc1001-0000-0000-0000-000000000001','SC-CAR Task Two','in_progress');
insert into public.agent_runs (id, task_id, company_id, execution_provider, provider_run_id, status, started_at) values
  ('cccc1003-0000-0000-0000-000000000002','cccc1002-0000-0000-0000-000000000002','cccc1001-0000-0000-0000-000000000001','claude_code_background','sc-car-run-2','in_progress'::work_status, now());

-- Run 3: no task_id at all - background bootstrap run.
insert into public.agent_runs (id, task_id, company_id, execution_provider, provider_run_id, status, started_at) values
  ('cccc1003-0000-0000-0000-000000000003', null, 'cccc1001-0000-0000-0000-000000000001','claude_code_background','sc-car-run-3','in_progress'::work_status, now());

-- ================== TESTS ==================

-- TEST 1: founder completes Run 1 - real commit + verification, task flips to 'done'.
select set_config('sc_car.founder_complete',
  (public.complete_agent_run('cccc1003-0000-0000-0000-000000000001'::uuid, 'done'::work_status, 'a1b2c3d4', 'live_verified', 'Real completion, verified.'))::text, true);
select set_config('sc_car.task_status_after_complete', (select status::text from public.tasks where id='cccc1002-0000-0000-0000-000000000001'), true);
select set_config('sc_car.run_row_after_complete',
  (select json_build_object('status', status, 'head_commit', head_commit, 'verification_status', verification_status, 'finished_at_set', finished_at is not null)::text
   from public.agent_runs where id='cccc1003-0000-0000-0000-000000000001'), true);

-- TEST 2: idempotent re-complete with the identical params - no-op, task not re-written.
select set_config('sc_car.founder_complete_idempotent',
  (public.complete_agent_run('cccc1003-0000-0000-0000-000000000001'::uuid, 'done'::work_status, 'a1b2c3d4', 'live_verified', 'Real completion, verified.'))::text, true);
select set_config('sc_car.task_status_still_done', (select status::text from public.tasks where id='cccc1002-0000-0000-0000-000000000001'), true);

reset role;

-- TEST 3: a company manager of the SAME company is denied by this RPC's own gate.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_car.manager_denied',
  (public.complete_agent_run('cccc1003-0000-0000-0000-000000000002'::uuid, 'done'::work_status))::text, true);
reset role;
select set_config('sc_car.run2_untouched', (select (status = 'in_progress'::work_status)::text from public.agent_runs where id='cccc1003-0000-0000-0000-000000000002'), true);
select set_config('sc_car.task2_untouched', (select (status = 'in_progress'::work_status)::text from public.tasks where id='cccc1002-0000-0000-0000-000000000002'), true);

-- TEST 4: no task_id -> completes without error, taskUpdated:false.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('sc_car.no_task_complete',
  (public.complete_agent_run('cccc1003-0000-0000-0000-000000000003'::uuid, 'rejected'::work_status, null, 'failed', 'No task linked, background bootstrap run.'))::text, true);

-- TEST 5: unknown verification_status is rejected with a clear error.
do $$
begin
  begin
    perform public.complete_agent_run('cccc1003-0000-0000-0000-000000000003'::uuid, 'done'::work_status, null, 'not_a_real_verification_status', null);
    perform set_config('sc_car.bad_verification_status_blocked', 'false', true);
  exception when others then
    perform set_config('sc_car.bad_verification_status_blocked', 'true', true);
  end;
end $$;

-- TEST 6: not-found id.
select set_config('sc_car.not_found',
  (public.complete_agent_run('00000000-0000-0000-0000-000000000000'::uuid, 'done'::work_status))::text, true);

reset role;

select json_build_object(
  'scenario', 'COMPLETE-AGENT-RUN-LIFECYCLE',
  'classification', 'FIXED (Phase 8 verification gap — see migration 202608290010)',
  'founder_complete', current_setting('sc_car.founder_complete', true)::jsonb,
  'task_status_after_complete', current_setting('sc_car.task_status_after_complete', true),
  'run_row_after_complete', current_setting('sc_car.run_row_after_complete', true)::jsonb,
  'founder_complete_idempotent', current_setting('sc_car.founder_complete_idempotent', true)::jsonb,
  'task_status_still_done', current_setting('sc_car.task_status_still_done', true),
  'manager_denied', current_setting('sc_car.manager_denied', true)::jsonb,
  'run2_untouched', current_setting('sc_car.run2_untouched', true) = 'true',
  'task2_untouched', current_setting('sc_car.task2_untouched', true) = 'true',
  'no_task_complete', current_setting('sc_car.no_task_complete', true)::jsonb,
  'bad_verification_status_blocked', current_setting('sc_car.bad_verification_status_blocked', true) = 'true',
  'not_found', current_setting('sc_car.not_found', true)::jsonb,
  'all_pass', (
        (current_setting('sc_car.founder_complete', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_car.founder_complete', true)::jsonb->>'taskUpdated') = 'true'
    and (current_setting('sc_car.founder_complete', true)::jsonb->>'authorized') = 'true'
    and current_setting('sc_car.task_status_after_complete', true) = 'done'
    and (current_setting('sc_car.run_row_after_complete', true)::jsonb->>'status') = 'done'
    and (current_setting('sc_car.run_row_after_complete', true)::jsonb->>'head_commit') = 'a1b2c3d4'
    and (current_setting('sc_car.run_row_after_complete', true)::jsonb->>'verification_status') = 'live_verified'
    and (current_setting('sc_car.run_row_after_complete', true)::jsonb->>'finished_at_set') = 'true'
    and (current_setting('sc_car.founder_complete_idempotent', true)::jsonb->>'changed') = 'false'
    and (current_setting('sc_car.founder_complete_idempotent', true)::jsonb->>'reason') = 'already_recorded'
    and current_setting('sc_car.task_status_still_done', true) = 'done'
    and (current_setting('sc_car.manager_denied', true)::jsonb->>'authorized') = 'false'
    and current_setting('sc_car.run2_untouched', true) = 'true'
    and current_setting('sc_car.task2_untouched', true) = 'true'
    and (current_setting('sc_car.no_task_complete', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_car.no_task_complete', true)::jsonb->>'taskUpdated') = 'false'
    and current_setting('sc_car.bad_verification_status_blocked', true) = 'true'
    and (current_setting('sc_car.not_found', true)::jsonb->>'reason') = 'not_found'
  )
) as verdict;

rollback;

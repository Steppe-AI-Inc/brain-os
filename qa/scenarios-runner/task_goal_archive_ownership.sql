-- Task/goal archive-restore ownership — permanent regression for
-- KNOWN_FAILURE_MODES.md #20's follow-through (migration 202608290001), the same
-- creator/manager/founder/archive/restore pattern built for companies (#19's sibling,
-- migration 202608280013), extended to the two resources closest to already having it:
-- tasks and goals both already carried 'archived' as a legal status enum value with no
-- lifecycle guard, and both had a created_by_profile_id column that was never reliably
-- populated (tasks: only the AI-creation path set it, never the manual createTask()
-- Server Action; goals: no path set it at all). Proves, against the already-deployed
-- functions (not redefined here, same convention as organization_graph_integrity.sql and
-- company_archive_ownership.sql):
--   1. force_task_creator/force_goal_creator ignore whatever created_by_profile_id the
--      client supplies (tested via a direct spoof attempt on a task insert)
--   2. creator + active membership -> archive/restore allowed, for both tasks and goals
--   3. a task with company_id IS NULL - creator alone suffices, no membership needed
--   4. restore_task returns a task to its EXACT prior status (not a fixed target the way
--      companies/goals restore to 'active' - a task could have been done/in_progress/
--      blocked/etc before archiving, so guessing a fixed target would be wrong more often
--      than not)
--   5. former creator (membership removed) -> denied, for both
--   6. a different, unrelated user -> denied (goals)
--   7. founder -> allowed unconditionally, for both
--   8. idempotency: re-archiving an already-archived task/goal is a no-op, not an error
--   9. not-found id -> reason not_found, no mutation
--   10. the lifecycle-guard trigger blocks a direct UPDATE ... SET status='archived'
--       bypass, for both, even after multiple prior real RPC calls in the same
--       transaction (the exact GUC-flag-leak class 202608280013 found and fixed - applied
--       correctly here from the start since the pattern was already proven).

begin;

-- ================== TEST FIXTURES & ASSERTIONS ==================
-- Fixture company + memberships (as founder).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

insert into public.companies (id, name, status) values ('cccc0003-0000-0000-0000-000000000001','SC-TG Co','active');
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
  values ('cccc0003-0000-0000-0000-000000000001','66ef2052-d002-4592-b841-82cd2171b51a','employee', true);

-- TASK 1: created by employee (creator+membership tier), company-scoped, in a non-default status.
insert into public.tasks (id, company_id, title, status)
  values ('dddd0001-0000-0000-0000-000000000001','cccc0003-0000-0000-0000-000000000001','SC-TG Task Creator', 'in_progress');
update public.tasks set created_by_profile_id = '66ef2052-d002-4592-b841-82cd2171b51a' where id = 'dddd0001-0000-0000-0000-000000000001';

-- TASK 2: company_id NULL, created by employee - creator alone should suffice (no membership to lose).
insert into public.tasks (id, company_id, title, status)
  values ('dddd0001-0000-0000-0000-000000000002', null, 'SC-TG Task No-Company', 'queued');
update public.tasks set created_by_profile_id = '66ef2052-d002-4592-b841-82cd2171b51a' where id = 'dddd0001-0000-0000-0000-000000000002';

-- TASK 3: for founder-override + idempotency + not-found tests, and direct-bypass/status tests.
insert into public.tasks (id, company_id, title, status)
  values ('dddd0001-0000-0000-0000-000000000003','cccc0003-0000-0000-0000-000000000001','SC-TG Task Founder', 'done');

-- TASK 4: created by employee, for the "insert via app never populates created_by" spoof test -
-- explicitly try to supply a different profile id, the trigger must overwrite it.
insert into public.tasks (id, company_id, title, status, created_by_profile_id)
  values ('dddd0001-0000-0000-0000-000000000004','cccc0003-0000-0000-0000-000000000001','SC-TG Task Spoof', 'queued', '66ef2052-d002-4592-b841-82cd2171b51a');
select set_config('sc_tg.task_spoof_creator', (select created_by_profile_id::text from public.tasks where id='dddd0001-0000-0000-0000-000000000004'), true);
select set_config('sc_tg.founder_profile_id', (public.current_profile_id())::text, true);

-- GOAL 1: created by employee (creator+membership tier).
insert into public.goals (id, company_id, title, status)
  values ('eeee0002-0000-0000-0000-000000000001','cccc0003-0000-0000-0000-000000000001','SC-TG Goal Creator', 'active');
update public.goals set created_by_profile_id = '66ef2052-d002-4592-b841-82cd2171b51a' where id = 'eeee0002-0000-0000-0000-000000000001';

-- GOAL 2: for founder-override + idempotency + not-found + direct-bypass/status tests.
insert into public.goals (id, company_id, title, status)
  values ('eeee0002-0000-0000-0000-000000000002','cccc0003-0000-0000-0000-000000000001','SC-TG Goal Founder', 'active');

reset role;

-- ===== TASK TESTS =====

-- TEST T1: creator+membership -> archive/restore allowed, restores to exact prior status.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_tg.task_creator_archive', (public.archive_task('dddd0001-0000-0000-0000-000000000001'))::text, true);
select set_config('sc_tg.task_creator_restore', (public.restore_task('dddd0001-0000-0000-0000-000000000001'))::text, true);
reset role;

-- TEST T2: company_id NULL task, creator alone (no membership needed) -> archive/restore allowed.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_tg.task_nocompany_archive', (public.archive_task('dddd0001-0000-0000-0000-000000000002'))::text, true);
select set_config('sc_tg.task_nocompany_restore', (public.restore_task('dddd0001-0000-0000-0000-000000000002'))::text, true);
reset role;

-- TEST T3: former creator after membership removal -> denied.
update public.company_memberships set active = false where company_id='cccc0003-0000-0000-0000-000000000001' and profile_id='66ef2052-d002-4592-b841-82cd2171b51a';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_tg.task_former_creator_archive', (public.archive_task('dddd0001-0000-0000-0000-000000000001'))::text, true);
reset role;
update public.company_memberships set active = true where company_id='cccc0003-0000-0000-0000-000000000001' and profile_id='66ef2052-d002-4592-b841-82cd2171b51a';

-- TEST T4: founder override + idempotency + not-found.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('sc_tg.task_founder_archive', (public.archive_task('dddd0001-0000-0000-0000-000000000003'))::text, true);
select set_config('sc_tg.task_idempotent_archive', (public.archive_task('dddd0001-0000-0000-0000-000000000003'))::text, true);
select set_config('sc_tg.task_not_found', (public.archive_task('00000000-0000-0000-0000-000000000000'))::text, true);

-- TEST T5: direct bypass blocked by trigger (even after multiple real RPC calls above in this same transaction).
do $$
begin
  begin
    update public.tasks set status = 'archived' where id = 'dddd0001-0000-0000-0000-000000000004';
    perform set_config('sc_tg.task_direct_bypass_blocked', 'false', true);
  exception when others then
    perform set_config('sc_tg.task_direct_bypass_blocked', 'true', true);
  end;
end $$;
reset role;

-- ===== GOAL TESTS =====

-- TEST G1: creator+membership -> archive/restore allowed.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_tg.goal_creator_archive', (public.archive_goal('eeee0002-0000-0000-0000-000000000001'))::text, true);
select set_config('sc_tg.goal_creator_restore', (public.restore_goal('eeee0002-0000-0000-0000-000000000001'))::text, true);
reset role;

-- TEST G2: former creator after membership removal -> denied.
update public.company_memberships set active = false where company_id='cccc0003-0000-0000-0000-000000000001' and profile_id='66ef2052-d002-4592-b841-82cd2171b51a';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_tg.goal_former_creator_archive', (public.archive_goal('eeee0002-0000-0000-0000-000000000001'))::text, true);
reset role;

-- TEST G3: different unrelated user -> denied.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('sc_tg.goal_other_user_archive', (public.archive_goal('eeee0002-0000-0000-0000-000000000002'))::text, true);
reset role;

-- TEST G4: founder override + idempotency + not-found.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select set_config('sc_tg.goal_founder_archive', (public.archive_goal('eeee0002-0000-0000-0000-000000000002'))::text, true);
select set_config('sc_tg.goal_idempotent_archive', (public.archive_goal('eeee0002-0000-0000-0000-000000000002'))::text, true);
select set_config('sc_tg.goal_not_found', (public.archive_goal('00000000-0000-0000-0000-000000000000'))::text, true);

-- TEST G5: direct bypass blocked by trigger.
do $$
begin
  begin
    update public.goals set status = 'archived' where id = 'eeee0002-0000-0000-0000-000000000001';
    perform set_config('sc_tg.goal_direct_bypass_blocked', 'false', true);
  exception when others then
    perform set_config('sc_tg.goal_direct_bypass_blocked', 'true', true);
  end;
end $$;
reset role;

select json_build_object(
  'scenario', 'TASK-GOAL-ARCHIVE-OWNERSHIP',
  'classification', 'FIXED (KNOWN_FAILURE_MODES.md #20 follow-through — see migration 202608290001)',
  'task_spoof_prevented', current_setting('sc_tg.task_spoof_creator', true) = current_setting('sc_tg.founder_profile_id', true),
  'task_creator_archive', current_setting('sc_tg.task_creator_archive', true)::jsonb,
  'task_creator_restore', current_setting('sc_tg.task_creator_restore', true)::jsonb,
  'task_creator_restore_to_prior_status', (current_setting('sc_tg.task_creator_restore', true)::jsonb->>'newStatus') = 'in_progress',
  'task_nocompany_archive', current_setting('sc_tg.task_nocompany_archive', true)::jsonb,
  'task_nocompany_restore', current_setting('sc_tg.task_nocompany_restore', true)::jsonb,
  'task_former_creator_archive', current_setting('sc_tg.task_former_creator_archive', true)::jsonb,
  'task_founder_archive', current_setting('sc_tg.task_founder_archive', true)::jsonb,
  'task_idempotent_archive', current_setting('sc_tg.task_idempotent_archive', true)::jsonb,
  'task_not_found', current_setting('sc_tg.task_not_found', true)::jsonb,
  'task_direct_bypass_blocked', current_setting('sc_tg.task_direct_bypass_blocked', true) = 'true',
  'goal_creator_archive', current_setting('sc_tg.goal_creator_archive', true)::jsonb,
  'goal_creator_restore', current_setting('sc_tg.goal_creator_restore', true)::jsonb,
  'goal_former_creator_archive', current_setting('sc_tg.goal_former_creator_archive', true)::jsonb,
  'goal_other_user_archive', current_setting('sc_tg.goal_other_user_archive', true)::jsonb,
  'goal_founder_archive', current_setting('sc_tg.goal_founder_archive', true)::jsonb,
  'goal_idempotent_archive', current_setting('sc_tg.goal_idempotent_archive', true)::jsonb,
  'goal_not_found', current_setting('sc_tg.goal_not_found', true)::jsonb,
  'goal_direct_bypass_blocked', current_setting('sc_tg.goal_direct_bypass_blocked', true) = 'true',
  'all_pass', (
        current_setting('sc_tg.task_spoof_creator', true) = current_setting('sc_tg.founder_profile_id', true)
    and (current_setting('sc_tg.task_creator_archive', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_tg.task_creator_restore', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_tg.task_creator_restore', true)::jsonb->>'newStatus') = 'in_progress'
    and (current_setting('sc_tg.task_nocompany_archive', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_tg.task_nocompany_restore', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_tg.task_former_creator_archive', true)::jsonb->>'authorized') = 'false'
    and (current_setting('sc_tg.task_founder_archive', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_tg.task_idempotent_archive', true)::jsonb->>'reason') = 'already_archived'
    and (current_setting('sc_tg.task_not_found', true)::jsonb->>'reason') = 'not_found'
    and current_setting('sc_tg.task_direct_bypass_blocked', true) = 'true'
    and (current_setting('sc_tg.goal_creator_archive', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_tg.goal_creator_restore', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_tg.goal_former_creator_archive', true)::jsonb->>'authorized') = 'false'
    and (current_setting('sc_tg.goal_other_user_archive', true)::jsonb->>'authorized') = 'false'
    and (current_setting('sc_tg.goal_founder_archive', true)::jsonb->>'changed') = 'true'
    and (current_setting('sc_tg.goal_idempotent_archive', true)::jsonb->>'reason') = 'already_archived'
    and (current_setting('sc_tg.goal_not_found', true)::jsonb->>'reason') = 'not_found'
    and current_setting('sc_tg.goal_direct_bypass_blocked', true) = 'true'
  )
) as verdict;

rollback;

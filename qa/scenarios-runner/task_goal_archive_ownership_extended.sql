-- INDEPENDENT VERIFIER extension script (not part of the developer's own regression
-- suite) for migration 202608290001_task_goal_archive_restore.sql / commit ecf3ab0.
-- Uses genuinely synthetic profiles (inserted + rolled back in this same transaction,
-- QA-VERIFY prefixed) rather than reusing the developer's fixed real-user ids, so every
-- actor is a real, distinct, controlled identity (per the verification skill's persona
-- rule) instead of the same one or two real people playing multiple roles.
-- NOTE ON ID SHAPE (discovered live, not assumed): public.current_profile_id() resolves
-- via profiles.auth_user_id = auth.uid(), and profiles.id is a SEPARATE generated uuid -
-- request.jwt.claims->>'sub' must be set to auth_user_id, and every FK column
-- (created_by_profile_id, company_memberships.profile_id, people.profile_id,
-- owner_person_id via people.id) must use the resulting profiles.id, not the sub. The
-- developer's own scripts got this right implicitly (reusing real users where
-- auth_user_id happened to be documented); this script makes it explicit with fresh
-- synthetic identities.
--
-- Covers gaps the developer's own qa/scenarios-runner/task_goal_archive_ownership.sql
-- did NOT assert:
--   V1. restore_task denied for former creator (membership removed) - only archive-side
--       denial was tested by the original script.
--   V2. restore_goal denied for former creator and for an unrelated user.
--   V3. task owner_person_id tier (a person who is the task's assigned owner, but NOT its
--       creator and NOT a company manager) can archive/restore.
--   V4. goal owner_person_id tier, same shape.
--   V5. an ordinary unrelated employee of the SAME company (active membership, but not
--       creator/owner/manager) is denied on both tasks and goals.
--   V6. a manager of a DIFFERENT company is denied (cross-tenant isolation).
--   V7. full repeated archive->restore->archive->restore cycle (twice) does not corrupt
--       state or duplicate anything - not just a single already-archived no-op.
--   V8. archived tasks/goals remain SELECTable by an authorized viewer (founder) - RLS
--       select scope wasn't touched by this migration, confirm it still isn't.
--   V9. tasks_delete_scope / goals_delete_manager unchanged: the task/goal creator
--       (non-manager) can archive but CANNOT hard-DELETE - archiving must not have
--       accidentally widened the real destructive-delete gate.
--   V10/V11. the lifecycle-guard trigger blocks the REVERSE direct-bypass direction too
--       (archived -> non-archived via a raw UPDATE, not just non-archived -> archived) -
--       the developer's own script and this script's first pass only ever tested the
--       forward direction; the trigger's WHEN condition is symmetric, confirmed live here.
begin;

-- Synthetic profiles: P_CREATOR, P_OWNER, P_OTHER, P_MGRB - fully fabricated auth
-- identities, inserted directly (bypasses the normal auth.users signup flow, fine for a
-- rolled-back transaction). profiles.auth_user_id FKs to auth.users(id), so a minimal
-- auth.users row is required first (only "id" is NOT NULL on that table - confirmed live
-- via information_schema before writing this). DISCOVERED LIVE: on_auth_user_created
-- (handle_new_auth_user, 202608260011) auto-inserts a matching public.profiles row with
-- its OWN generated id the moment auth.users gets a row - do not also insert profiles
-- explicitly (hits profiles_auth_user_id_key), just read back the generated ids.
insert into auth.users (id, email) values
  ('b0000001-0000-0000-0000-000000000001','qa-verify-creator@example.invalid'),
  ('b0000001-0000-0000-0000-000000000002','qa-verify-owner@example.invalid'),
  ('b0000001-0000-0000-0000-000000000003','qa-verify-other@example.invalid'),
  ('b0000001-0000-0000-0000-000000000004','qa-verify-mgrb@example.invalid');

select set_config('p.creator', (select id::text from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001'), true);
select set_config('p.owner', (select id::text from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000002'), true);
select set_config('p.other', (select id::text from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000003'), true);
select set_config('p.mgrb', (select id::text from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000004'), true);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

insert into public.companies (id, name, status) values
  ('cccc0004-0000-0000-0000-000000000001','QA-VERIFY Co A','active'),
  ('cccc0004-0000-0000-0000-000000000002','QA-VERIFY Co B','active');

insert into public.company_memberships (company_id, profile_id, role_in_company, active) values
  ('cccc0004-0000-0000-0000-000000000001',(select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001'),'employee', true),  -- P_CREATOR in Co A
  ('cccc0004-0000-0000-0000-000000000001',(select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000002'),'employee', true),  -- P_OWNER in Co A
  ('cccc0004-0000-0000-0000-000000000001',(select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000003'),'employee', true),  -- P_OTHER in Co A (no special standing)
  ('cccc0004-0000-0000-0000-000000000002',(select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000004'),'manager', true);   -- P_MGRB manager of Co B ONLY

insert into public.people (id, company_id, full_name, profile_id, active)
  values ('ffff0001-0000-0000-0000-000000000001','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Owner Person',(select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000002'),true);

reset role;

------------------------------------------------------------------------
-- FIXTURES: tasks (all created_by_profile_id = P_CREATOR unless noted)
------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

insert into public.tasks (id, company_id, title, status)
  values ('dddd0002-0000-0000-0000-000000000001','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Task Restore-Denial', 'in_progress');
update public.tasks set created_by_profile_id = (select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001') where id = 'dddd0002-0000-0000-0000-000000000001';

insert into public.tasks (id, company_id, title, status, owner_person_id)
  values ('dddd0002-0000-0000-0000-000000000003','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Task Owner-Tier', 'queued', 'ffff0001-0000-0000-0000-000000000001');
update public.tasks set created_by_profile_id = (select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001') where id = 'dddd0002-0000-0000-0000-000000000003';

insert into public.tasks (id, company_id, title, status)
  values ('dddd0002-0000-0000-0000-000000000005','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Task Unrelated-Employee', 'queued');
update public.tasks set created_by_profile_id = (select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001') where id = 'dddd0002-0000-0000-0000-000000000005';

insert into public.tasks (id, company_id, title, status)
  values ('dddd0002-0000-0000-0000-000000000006','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Task Cross-Tenant', 'queued');

insert into public.tasks (id, company_id, title, status)
  values ('dddd0002-0000-0000-0000-000000000007','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Task Cycle', 'blocked');

insert into public.tasks (id, company_id, title, status)
  values ('dddd0002-0000-0000-0000-000000000008','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Task Select-After-Archive', 'queued');

insert into public.tasks (id, company_id, title, status)
  values ('dddd0002-0000-0000-0000-000000000009','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Task Delete-Gate', 'queued');
update public.tasks set created_by_profile_id = (select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001') where id = 'dddd0002-0000-0000-0000-000000000009';

-- Task/Goal V10/V11: reverse-direction direct-bypass test subjects.
insert into public.tasks (id, company_id, title, status)
  values ('dddd0002-0000-0000-0000-000000000010','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Task Reverse-Bypass', 'queued');

------------------------------------------------------------------------
-- FIXTURES: goals
------------------------------------------------------------------------
insert into public.goals (id, company_id, title, status)
  values ('eeee0003-0000-0000-0000-000000000002','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Goal Restore-Denial', 'active');
update public.goals set created_by_profile_id = (select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001') where id = 'eeee0003-0000-0000-0000-000000000002';

insert into public.goals (id, company_id, title, status, owner_person_id)
  values ('eeee0003-0000-0000-0000-000000000004','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Goal Owner-Tier', 'active', 'ffff0001-0000-0000-0000-000000000001');
update public.goals set created_by_profile_id = (select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001') where id = 'eeee0003-0000-0000-0000-000000000004';

insert into public.goals (id, company_id, title, status)
  values ('eeee0003-0000-0000-0000-000000000005','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Goal Unrelated-Employee', 'active');
update public.goals set created_by_profile_id = (select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001') where id = 'eeee0003-0000-0000-0000-000000000005';

insert into public.goals (id, company_id, title, status)
  values ('eeee0003-0000-0000-0000-000000000006','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Goal Cross-Tenant', 'active');

insert into public.goals (id, company_id, title, status)
  values ('eeee0003-0000-0000-0000-000000000007','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Goal Cycle', 'active');

insert into public.goals (id, company_id, title, status)
  values ('eeee0003-0000-0000-0000-000000000009','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Goal Delete-Gate', 'active');
update public.goals set created_by_profile_id = (select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001') where id = 'eeee0003-0000-0000-0000-000000000009';

insert into public.goals (id, company_id, title, status)
  values ('eeee0003-0000-0000-0000-000000000010','cccc0004-0000-0000-0000-000000000001','QA-VERIFY Goal Reverse-Bypass', 'active');

reset role;

------------------------------------------------------------------------
-- V1: restore_task denied for former creator (P_CREATOR, membership removed).
------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);
select set_config('v.task_restore_setup_archive', (public.archive_task('dddd0002-0000-0000-0000-000000000001'))::text, true);
reset role;
update public.company_memberships set active = false where company_id='cccc0004-0000-0000-0000-000000000001' and profile_id=(select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);
select set_config('v.task_restore_former_creator_denied', (public.restore_task('dddd0002-0000-0000-0000-000000000001'))::text, true);
reset role;
update public.company_memberships set active = true where company_id='cccc0004-0000-0000-0000-000000000001' and profile_id=(select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001');

------------------------------------------------------------------------
-- V2: restore_goal denied for former creator, then for an unrelated employee (P_OTHER).
------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);
select set_config('v.goal_restore_setup_archive', (public.archive_goal('eeee0003-0000-0000-0000-000000000002'))::text, true);
reset role;
update public.company_memberships set active = false where company_id='cccc0004-0000-0000-0000-000000000001' and profile_id=(select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);
select set_config('v.goal_restore_former_creator_denied', (public.restore_goal('eeee0003-0000-0000-0000-000000000002'))::text, true);
reset role;
update public.company_memberships set active = true where company_id='cccc0004-0000-0000-0000-000000000001' and profile_id=(select id from public.profiles where auth_user_id='b0000001-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000003','role','authenticated')::text, true);
select set_config('v.goal_restore_unrelated_denied', (public.restore_goal('eeee0003-0000-0000-0000-000000000002'))::text, true);
reset role;

------------------------------------------------------------------------
-- V3: task owner_person_id tier - P_OWNER (not creator, not manager) can archive/restore.
------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);
select set_config('v.task_owner_archive', (public.archive_task('dddd0002-0000-0000-0000-000000000003'))::text, true);
select set_config('v.task_owner_restore', (public.restore_task('dddd0002-0000-0000-0000-000000000003'))::text, true);
reset role;

------------------------------------------------------------------------
-- V4: goal owner_person_id tier, same shape.
------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000002','role','authenticated')::text, true);
select set_config('v.goal_owner_archive', (public.archive_goal('eeee0003-0000-0000-0000-000000000004'))::text, true);
select set_config('v.goal_owner_restore', (public.restore_goal('eeee0003-0000-0000-0000-000000000004'))::text, true);
reset role;

------------------------------------------------------------------------
-- V5: unrelated same-company employee (P_OTHER, active membership, not creator/owner/
-- manager) denied on task and goal created by P_CREATOR.
------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000003','role','authenticated')::text, true);
select set_config('v.task_unrelated_employee_denied', (public.archive_task('dddd0002-0000-0000-0000-000000000005'))::text, true);
select set_config('v.goal_unrelated_employee_denied', (public.archive_goal('eeee0003-0000-0000-0000-000000000005'))::text, true);
reset role;

------------------------------------------------------------------------
-- V6: P_MGRB is manager of Co B ONLY, plain outsider (zero membership) on Co A - denied
-- on Co A's task/goal.
------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000004','role','authenticated')::text, true);
select set_config('v.task_cross_tenant_denied', (public.archive_task('dddd0002-0000-0000-0000-000000000006'))::text, true);
select set_config('v.goal_cross_tenant_denied', (public.archive_goal('eeee0003-0000-0000-0000-000000000006'))::text, true);
reset role;

------------------------------------------------------------------------
-- V7: repeated full archive->restore->archive->restore cycle (twice) on task+goal - founder.
------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select public.archive_task('dddd0002-0000-0000-0000-000000000007');
select public.restore_task('dddd0002-0000-0000-0000-000000000007');
select public.archive_task('dddd0002-0000-0000-0000-000000000007');
select set_config('v.task_cycle_final', (public.restore_task('dddd0002-0000-0000-0000-000000000007'))::text, true);
select set_config('v.task_cycle_final_status',
  (select status::text from public.tasks where id='dddd0002-0000-0000-0000-000000000007'), true);
select set_config('v.task_cycle_previous_status_cleared',
  (select (previous_status is null)::text from public.tasks where id='dddd0002-0000-0000-0000-000000000007'), true);

select public.archive_goal('eeee0003-0000-0000-0000-000000000007');
select public.restore_goal('eeee0003-0000-0000-0000-000000000007');
select public.archive_goal('eeee0003-0000-0000-0000-000000000007');
select set_config('v.goal_cycle_final', (public.restore_goal('eeee0003-0000-0000-0000-000000000007'))::text, true);
select set_config('v.goal_cycle_final_status',
  (select status::text from public.goals where id='eeee0003-0000-0000-0000-000000000007'), true);
reset role;

------------------------------------------------------------------------
-- V8: archived task/goal remains SELECTable by an authorized viewer (founder) via RLS.
------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select public.archive_task('dddd0002-0000-0000-0000-000000000008');
select set_config('v.task_select_after_archive_visible',
  (select (count(*) = 1)::text from public.tasks where id='dddd0002-0000-0000-0000-000000000008' and status='archived'), true);
reset role;

------------------------------------------------------------------------
-- V9: creator can archive but CANNOT hard-delete (tasks_delete_scope/goals_delete_manager
-- unchanged - manager+/admin only). Test as P_CREATOR (creator, non-manager).
------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','b0000001-0000-0000-0000-000000000001','role','authenticated')::text, true);
select set_config('v.task_creator_can_archive', (public.archive_task('dddd0002-0000-0000-0000-000000000009'))::text, true);
do $$
declare
  v_rows int;
begin
  delete from public.tasks where id = 'dddd0002-0000-0000-0000-000000000009';
  get diagnostics v_rows = row_count;
  perform set_config('v.task_creator_delete_blocked', (v_rows = 0)::text, true);
end $$;

select set_config('v.goal_creator_can_archive', (public.archive_goal('eeee0003-0000-0000-0000-000000000009'))::text, true);
do $$
declare
  v_rows int;
begin
  delete from public.goals where id = 'eeee0003-0000-0000-0000-000000000009';
  get diagnostics v_rows = row_count;
  perform set_config('v.goal_creator_delete_blocked', (v_rows = 0)::text, true);
end $$;
reset role;

------------------------------------------------------------------------
-- V10/V11: lifecycle-guard trigger blocks the REVERSE direct-bypass direction
-- (archived -> non-archived via raw UPDATE, bypassing restore_task()/restore_goal()).
-- Neither the developer's own script nor this script's earlier V-tests checked this
-- direction - the trigger's WHEN condition is symmetric by design, confirmed live here.
------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
select public.archive_task('dddd0002-0000-0000-0000-000000000010');
select public.archive_goal('eeee0003-0000-0000-0000-000000000010');
do $$
begin
  begin
    update public.tasks set status = 'queued' where id = 'dddd0002-0000-0000-0000-000000000010';
    perform set_config('v.task_reverse_bypass_blocked', 'false', true);
  exception when others then
    perform set_config('v.task_reverse_bypass_blocked', 'true', true);
  end;
end $$;
do $$
begin
  begin
    update public.goals set status = 'active' where id = 'eeee0003-0000-0000-0000-000000000010';
    perform set_config('v.goal_reverse_bypass_blocked', 'false', true);
  exception when others then
    perform set_config('v.goal_reverse_bypass_blocked', 'true', true);
  end;
end $$;
reset role;

select json_build_object(
  'scenario', 'VERIFIER-EXTENDED-TASK-GOAL-ARCHIVE',
  'V1_task_restore_former_creator_denied', current_setting('v.task_restore_former_creator_denied', true)::jsonb,
  'V2_goal_restore_former_creator_denied', current_setting('v.goal_restore_former_creator_denied', true)::jsonb,
  'V2_goal_restore_unrelated_denied', current_setting('v.goal_restore_unrelated_denied', true)::jsonb,
  'V3_task_owner_archive', current_setting('v.task_owner_archive', true)::jsonb,
  'V3_task_owner_restore', current_setting('v.task_owner_restore', true)::jsonb,
  'V4_goal_owner_archive', current_setting('v.goal_owner_archive', true)::jsonb,
  'V4_goal_owner_restore', current_setting('v.goal_owner_restore', true)::jsonb,
  'V5_task_unrelated_employee_denied', current_setting('v.task_unrelated_employee_denied', true)::jsonb,
  'V5_goal_unrelated_employee_denied', current_setting('v.goal_unrelated_employee_denied', true)::jsonb,
  'V6_task_cross_tenant_denied', current_setting('v.task_cross_tenant_denied', true)::jsonb,
  'V6_goal_cross_tenant_denied', current_setting('v.goal_cross_tenant_denied', true)::jsonb,
  'V7_task_cycle_final', current_setting('v.task_cycle_final', true)::jsonb,
  'V7_task_cycle_final_status', current_setting('v.task_cycle_final_status', true),
  'V7_task_cycle_previous_status_cleared', current_setting('v.task_cycle_previous_status_cleared', true),
  'V7_goal_cycle_final', current_setting('v.goal_cycle_final', true)::jsonb,
  'V7_goal_cycle_final_status', current_setting('v.goal_cycle_final_status', true),
  'V8_task_select_after_archive_visible', current_setting('v.task_select_after_archive_visible', true),
  'V9_task_creator_can_archive', current_setting('v.task_creator_can_archive', true)::jsonb,
  'V9_task_creator_delete_blocked', current_setting('v.task_creator_delete_blocked', true),
  'V9_goal_creator_can_archive', current_setting('v.goal_creator_can_archive', true)::jsonb,
  'V9_goal_creator_delete_blocked', current_setting('v.goal_creator_delete_blocked', true),
  'V10_task_reverse_bypass_blocked', current_setting('v.task_reverse_bypass_blocked', true),
  'V11_goal_reverse_bypass_blocked', current_setting('v.goal_reverse_bypass_blocked', true),
  'all_pass', (
       (current_setting('v.task_restore_former_creator_denied', true)::jsonb->>'authorized') = 'false'
   and (current_setting('v.goal_restore_former_creator_denied', true)::jsonb->>'authorized') = 'false'
   and (current_setting('v.goal_restore_unrelated_denied', true)::jsonb->>'authorized') = 'false'
   and (current_setting('v.task_owner_archive', true)::jsonb->>'changed') = 'true'
   and (current_setting('v.task_owner_restore', true)::jsonb->>'changed') = 'true'
   and (current_setting('v.goal_owner_archive', true)::jsonb->>'changed') = 'true'
   and (current_setting('v.goal_owner_restore', true)::jsonb->>'changed') = 'true'
   and (current_setting('v.task_unrelated_employee_denied', true)::jsonb->>'authorized') = 'false'
   and (current_setting('v.goal_unrelated_employee_denied', true)::jsonb->>'authorized') = 'false'
   and (current_setting('v.task_cross_tenant_denied', true)::jsonb->>'authorized') = 'false'
   and (current_setting('v.goal_cross_tenant_denied', true)::jsonb->>'authorized') = 'false'
   and (current_setting('v.task_cycle_final', true)::jsonb->>'changed') = 'true'
   and current_setting('v.task_cycle_final_status', true) = 'blocked'
   and current_setting('v.task_cycle_previous_status_cleared', true) = 'true'
   and (current_setting('v.goal_cycle_final', true)::jsonb->>'changed') = 'true'
   and current_setting('v.goal_cycle_final_status', true) = 'active'
   and current_setting('v.task_select_after_archive_visible', true) = 'true'
   and (current_setting('v.task_creator_can_archive', true)::jsonb->>'changed') = 'true'
   and current_setting('v.task_creator_delete_blocked', true) = 'true'
   and (current_setting('v.goal_creator_can_archive', true)::jsonb->>'changed') = 'true'
   and current_setting('v.goal_creator_delete_blocked', true) = 'true'
   and current_setting('v.task_reverse_bypass_blocked', true) = 'true'
   and current_setting('v.goal_reverse_bypass_blocked', true) = 'true'
  )
) as verdict;

rollback;

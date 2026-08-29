-- Independent adversarial RLS regression for NOT-YET-PUSHED migration
-- supabase/migrations/202608290002_canonical_work_order_model.sql (public.canonical_work_orders,
-- public.agent_runs, tasks/work_orders.canonical_work_order_id). Written by an independent
-- verifier pass (2026-08-29), separate from the implementing session and separate from the
-- brain-os-db-security-engineer review that found and fixed the agent_runs_insert_scope
-- created_by_profile_id spoofing defect (re-verified here independently, TEST 12/13).
--
-- This file assumes the migration's own DDL has ALREADY been applied earlier in the SAME
-- transaction (see the runner wrapper). It does not redefine any function/policy -- it only
-- exercises what's already live in this transaction, exactly like the existing
-- task_goal_archive_ownership.sql / company_archive_ownership.sql convention.
--
-- Real profiles used (read-only reuse, never mutated outside this rolled-back transaction):
--   founder   = profile 46bf57d3-33b3-47b4-8302-126726a92775 / auth cbcc41cf-830d-4600-8545-3b9e22c8297f
--   employee1 = profile 66ef2052-d002-4592-b841-82cd2171b51a / auth 9c92a8d5-853c-4ef3-846a-f4fe8c42d97a
--   employee2 = profile 2953fbe7-8760-489f-9f7c-6f4c1a4baa84 / auth 484ece55-4a44-4746-945c-838c6b0bcc94

insert into public.companies (id, name, status) values
  ('caaa0001-0000-0000-0000-000000000001','CWO-Adv Co A (emp1=manager)','active'),
  ('caaa0001-0000-0000-0000-000000000002','CWO-Adv Co B (emp1=plain employee)','active'),
  ('caaa0001-0000-0000-0000-000000000003','CWO-Adv Co C (emp1 NOT a member)','active');

insert into public.company_memberships (company_id, profile_id, role_in_company, active) values
  ('caaa0001-0000-0000-0000-000000000001','66ef2052-d002-4592-b841-82cd2171b51a','manager', true),
  ('caaa0001-0000-0000-0000-000000000002','66ef2052-d002-4592-b841-82cd2171b51a','employee', true),
  ('caaa0001-0000-0000-0000-000000000001','2953fbe7-8760-489f-9f7c-6f4c1a4baa84','employee', true);

select set_config('cwoa.founder_pid', '46bf57d3-33b3-47b4-8302-126726a92775', true);
select set_config('cwoa.emp1_pid', '66ef2052-d002-4592-b841-82cd2171b51a', true);
select set_config('cwoa.emp2_pid', '2953fbe7-8760-489f-9f7c-6f4c1a4baa84', true);

-- TEST 1: founder can insert into ANY company (Co C, no membership).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.canonical_work_orders (id, company_id, title)
      values ('cbbb0001-0000-0000-0000-000000000001','caaa0001-0000-0000-0000-000000000003','CWO founder into Co C');
    perform set_config('cwoa.t1_founder_insert', 'true', true);
  exception when others then
    perform set_config('cwoa.t1_founder_insert', 'false', true);
  end;
end $$;
reset role;

-- TEST 2: company manager (emp1 in Co A) can insert into Co A.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.canonical_work_orders (id, company_id, title)
      values ('cbbb0001-0000-0000-0000-000000000002','caaa0001-0000-0000-0000-000000000001','CWO emp1-manager into Co A');
    perform set_config('cwoa.t2_manager_insert', 'true', true);
  exception when others then
    perform set_config('cwoa.t2_manager_insert', 'false', true);
  end;
end $$;
reset role;

-- TEST 3: plain non-manager active member (emp1 in Co B) can still insert (insert_scope is
-- has_company_access, deliberately broader than manager-only).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.canonical_work_orders (id, company_id, title)
      values ('cbbb0001-0000-0000-0000-000000000003','caaa0001-0000-0000-0000-000000000002','CWO emp1-plain into Co B');
    perform set_config('cwoa.t3_member_insert', 'true', true);
  exception when others then
    perform set_config('cwoa.t3_member_insert', 'false', true);
  end;
end $$;
reset role;

-- TEST 4: outsider (emp2, NOT a member of Co C at all) -> DENIED.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','484ece55-4a44-4746-945c-838c6b0bcc94','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.canonical_work_orders (id, company_id, title)
      values ('cbbb0001-0000-0000-0000-000000000004','caaa0001-0000-0000-0000-000000000003','CWO outsider attempt into Co C');
    perform set_config('cwoa.t4_outsider_insert_blocked', 'false', true);
  exception when others then
    perform set_config('cwoa.t4_outsider_insert_blocked', 'true', true);
  end;
end $$;
reset role;

-- TEST 5: member-of-a-DIFFERENT-company (emp1, NOT Co C) -> DENIED into Co C.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.canonical_work_orders (id, company_id, title)
      values ('cbbb0001-0000-0000-0000-000000000005','caaa0001-0000-0000-0000-000000000003','CWO emp1 wrong-company attempt into Co C');
    perform set_config('cwoa.t5_wrong_company_insert_blocked', 'false', true);
  exception when others then
    perform set_config('cwoa.t5_wrong_company_insert_blocked', 'true', true);
  end;
end $$;
reset role;

-- TEST 6: investor_viewer role explicitly excluded from has_company_access.
update public.profiles set role = 'investor_viewer' where id = '2953fbe7-8760-489f-9f7c-6f4c1a4baa84';
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
  values ('caaa0001-0000-0000-0000-000000000003','2953fbe7-8760-489f-9f7c-6f4c1a4baa84','viewer', true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','484ece55-4a44-4746-945c-838c6b0bcc94','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.canonical_work_orders (id, company_id, title)
      values ('cbbb0001-0000-0000-0000-000000000006','caaa0001-0000-0000-0000-000000000003','CWO investor_viewer attempt');
    perform set_config('cwoa.t6_investor_viewer_insert_blocked', 'false', true);
  exception when others then
    perform set_config('cwoa.t6_investor_viewer_insert_blocked', 'true', true);
  end;
end $$;
reset role;
update public.profiles set role = 'employee' where id = '2953fbe7-8760-489f-9f7c-6f4c1a4baa84';
delete from public.company_memberships where company_id = 'caaa0001-0000-0000-0000-000000000003' and profile_id = '2953fbe7-8760-489f-9f7c-6f4c1a4baa84';

-- TEST 7: created_by_profile_id spoof attempt - force_canonical_work_order_creator trigger
-- must overwrite whatever the client supplies (same class as force_task_creator).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
insert into public.canonical_work_orders (id, company_id, title, created_by_profile_id)
  values ('cbbb0001-0000-0000-0000-000000000007','caaa0001-0000-0000-0000-000000000001','CWO spoof attempt','46bf57d3-33b3-47b4-8302-126726a92775');
reset role;
select set_config('cwoa.t7_spoof_actual_creator', (select created_by_profile_id::text from public.canonical_work_orders where id = 'cbbb0001-0000-0000-0000-000000000007'), true);

-- TEST 8: a plain active member of the SAME company (emp2 in Co A) who is neither creator
-- nor manager nor owner_person CANNOT see another member's WO (matches tasks_select_scope
-- precedent exactly - not a new gap).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','484ece55-4a44-4746-945c-838c6b0bcc94','role','authenticated')::text, true);
select set_config('cwoa.t8_plainmember_select_count',
  (select count(*)::text from public.canonical_work_orders where id = 'cbbb0001-0000-0000-0000-000000000002'), true);
reset role;

-- TEST 8b: the manager who IS is_company_manager(Co A) (emp1) CAN see it.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('cwoa.t8b_manager_select_count',
  (select count(*)::text from public.canonical_work_orders where id = 'cbbb0001-0000-0000-0000-000000000002'), true);
reset role;

-- TEST 9: former creator (membership removed) cannot update own WO (cbbb...0003, Co B).
update public.company_memberships set active = false where company_id='caaa0001-0000-0000-0000-000000000002' and profile_id='66ef2052-d002-4592-b841-82cd2171b51a';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
update public.canonical_work_orders set title = 'CWO former-creator edit attempt' where id = 'cbbb0001-0000-0000-0000-000000000003';
select set_config('cwoa.t9_former_creator_update_rows', (select count(*)::text from public.canonical_work_orders where id='cbbb0001-0000-0000-0000-000000000003' and title = 'CWO former-creator edit attempt'), true);
reset role;
update public.company_memberships set active = true where company_id='caaa0001-0000-0000-0000-000000000002' and profile_id='66ef2052-d002-4592-b841-82cd2171b51a';

-- TEST 10: with-check cannot be used to move a WO into a company the caller doesn't
-- manage/access (emp1/manager of Co A tries reassigning cbbb...0002 into Co C).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  begin
    update public.canonical_work_orders set company_id = 'caaa0001-0000-0000-0000-000000000003' where id = 'cbbb0001-0000-0000-0000-000000000002';
    perform set_config('cwoa.t10_company_reassign_blocked', 'false', true);
  exception when others then
    perform set_config('cwoa.t10_company_reassign_blocked', 'true', true);
  end;
end $$;
reset role;
select set_config('cwoa.t10_company_unchanged', (select (company_id = 'caaa0001-0000-0000-0000-000000000001')::text from public.canonical_work_orders where id='cbbb0001-0000-0000-0000-000000000002'), true);

-- TEST 11: creator-only (non-manager, cbbb...0003 created by emp1 as plain employee of Co B)
-- cannot delete; founder can.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
delete from public.canonical_work_orders where id = 'cbbb0001-0000-0000-0000-000000000003';
select set_config('cwoa.t11_creator_only_delete_blocked', (select (count(*)=1)::text from public.canonical_work_orders where id='cbbb0001-0000-0000-0000-000000000003'), true);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
delete from public.canonical_work_orders where id = 'cbbb0001-0000-0000-0000-000000000003';
select set_config('cwoa.t11_founder_delete_ok', (select (count(*)=0)::text from public.canonical_work_orders where id='cbbb0001-0000-0000-0000-000000000003'), true);
reset role;

-- ================== AGENT_RUNS TESTS ==================

-- TEST 12: the already-found-and-fixed defect, re-verified independently: company_id NULL,
-- spoofed created_by_profile_id (founder's) -> DENIED.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.agent_runs (id, company_id, created_by_profile_id, summary)
      values ('cddd0001-0000-0000-0000-000000000001', null, '46bf57d3-33b3-47b4-8302-126726a92775', 'spoof attempt');
    perform set_config('cwoa.t12_agentrun_spoof_blocked', 'false', true);
  exception when others then
    perform set_config('cwoa.t12_agentrun_spoof_blocked', 'true', true);
  end;
end $$;
reset role;

-- TEST 13: legitimate unattributed bootstrap insert -> ALLOWED.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.agent_runs (id, company_id, created_by_profile_id, summary)
      values ('cddd0001-0000-0000-0000-000000000002', null, null, 'unattributed bootstrap');
    perform set_config('cwoa.t13_agentrun_unattributed_ok', 'true', true);
  exception when others then
    perform set_config('cwoa.t13_agentrun_unattributed_ok', 'false', true);
  end;
end $$;
reset role;

-- TEST 14: legitimate self-attributed insert -> ALLOWED.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.agent_runs (id, company_id, created_by_profile_id, summary)
      values ('cddd0001-0000-0000-0000-000000000003', null, '66ef2052-d002-4592-b841-82cd2171b51a', 'self-attributed');
    perform set_config('cwoa.t14_agentrun_self_ok', 'true', true);
  exception when others then
    perform set_config('cwoa.t14_agentrun_self_ok', 'false', true);
  end;
end $$;
reset role;

-- TEST 15: company_id set to a company the caller has no access to at all -> DENIED, even
-- with created_by_profile_id = self.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.agent_runs (id, company_id, created_by_profile_id, summary)
      values ('cddd0001-0000-0000-0000-000000000004', 'caaa0001-0000-0000-0000-000000000003', '66ef2052-d002-4592-b841-82cd2171b51a', 'wrong company attempt');
    perform set_config('cwoa.t15_agentrun_wrong_company_blocked', 'false', true);
  exception when others then
    perform set_config('cwoa.t15_agentrun_wrong_company_blocked', 'true', true);
  end;
end $$;
reset role;

-- TEST 16: positive control - company_id the caller DOES have access to, self-attributed -> ALLOWED.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  begin
    insert into public.agent_runs (id, company_id, created_by_profile_id, summary)
      values ('cddd0001-0000-0000-0000-000000000005', 'caaa0001-0000-0000-0000-000000000001', '66ef2052-d002-4592-b841-82cd2171b51a', 'legit company-scoped run');
    perform set_config('cwoa.t16_agentrun_legit_company_ok', 'true', true);
  exception when others then
    perform set_config('cwoa.t16_agentrun_legit_company_ok', 'false', true);
  end;
end $$;
reset role;

-- TEST 17: select scope - plain member of Co A (emp2, not manager, not creator) cannot see
-- cddd...0005 (company-scoped, Co A). Manager (emp1) CAN.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','484ece55-4a44-4746-945c-838c6b0bcc94','role','authenticated')::text, true);
select set_config('cwoa.t17_plainmember_agentrun_select_count',
  (select count(*)::text from public.agent_runs where id = 'cddd0001-0000-0000-0000-000000000005'), true);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
select set_config('cwoa.t17b_manager_agentrun_select_count',
  (select count(*)::text from public.agent_runs where id = 'cddd0001-0000-0000-0000-000000000005'), true);
reset role;

-- TEST 18: a manager of a DIFFERENT company (emp2 promoted to manager of Co B only) cannot
-- update cddd...0005 (belongs to Co A).
-- NOTE: outcome must be read back OUTSIDE emp2's own RLS context (reset role first) --
-- emp2 is neither creator nor manager of Co A, so agent_runs_select_scope ALSO hides this
-- row from emp2 even when the update is correctly blocked, which would make a same-persona
-- re-read of `summary` a scalar subquery over zero rows (NULL -> non-'true' text via
-- set_config), not a reliable true/false signal. An earlier draft of this exact test read
-- the outcome under emp2's own session and produced a false-positive FAIL for this reason
-- - a test-construction bug, not a product defect (independently re-verified via an isolated
-- debug transaction proving is_company_manager(Co A) genuinely returns false for emp2 and
-- the row is genuinely untouched).
delete from public.company_memberships where company_id='caaa0001-0000-0000-0000-000000000001' and profile_id='2953fbe7-8760-489f-9f7c-6f4c1a4baa84';
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
  values ('caaa0001-0000-0000-0000-000000000002','2953fbe7-8760-489f-9f7c-6f4c1a4baa84','manager', true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','484ece55-4a44-4746-945c-838c6b0bcc94','role','authenticated')::text, true);
update public.agent_runs set summary = 'cross-company manager edit attempt' where id = 'cddd0001-0000-0000-0000-000000000005';
reset role;
select set_config('cwoa.t18_cross_company_manager_update_blocked',
  (select (summary <> 'cross-company manager edit attempt')::text from public.agent_runs where id='cddd0001-0000-0000-0000-000000000005'), true);

-- TEST 19: even the RIGHT company's manager (emp1, Co A) CANNOT delete - founder/admin only.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
delete from public.agent_runs where id = 'cddd0001-0000-0000-0000-000000000005';
select set_config('cwoa.t19_manager_delete_blocked', (select (count(*)=1)::text from public.agent_runs where id='cddd0001-0000-0000-0000-000000000005'), true);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
delete from public.agent_runs where id = 'cddd0001-0000-0000-0000-000000000005';
select set_config('cwoa.t19_founder_delete_ok', (select (count(*)=0)::text from public.agent_runs where id='cddd0001-0000-0000-0000-000000000005'), true);
reset role;

-- ================== FK ON DELETE SEMANTICS ==================
insert into public.goals (id, company_id, title, status) values
  ('cfff0001-0000-0000-0000-000000000001','caaa0001-0000-0000-0000-000000000001','CWO-Adv goal','active');
insert into public.canonical_work_orders (id, company_id, goal_id, title) values
  ('cbbb0001-0000-0000-0000-000000000020','caaa0001-0000-0000-0000-000000000001','cfff0001-0000-0000-0000-000000000001','CWO for FK tests');
insert into public.tasks (id, company_id, title, canonical_work_order_id) values
  ('cee00001-0000-0000-0000-000000000001','caaa0001-0000-0000-0000-000000000001','CWO-Adv task','cbbb0001-0000-0000-0000-000000000020');
insert into public.work_orders (command, status, company_id, canonical_work_order_id) values
  ('CWO-Adv AI command test','done','caaa0001-0000-0000-0000-000000000001','cbbb0001-0000-0000-0000-000000000020');

delete from public.goals where id = 'cfff0001-0000-0000-0000-000000000001';
select set_config('cwoa.t20_goal_delete_sets_null', (select (goal_id is null)::text from public.canonical_work_orders where id='cbbb0001-0000-0000-0000-000000000020'), true);

delete from public.canonical_work_orders where id = 'cbbb0001-0000-0000-0000-000000000020';
select set_config('cwoa.t21_task_fk_set_null_not_blocked', (select (canonical_work_order_id is null)::text from public.tasks where id='cee00001-0000-0000-0000-000000000001'), true);
select set_config('cwoa.t22_workorder_fk_set_null_not_blocked', (select (canonical_work_order_id is null)::text from public.work_orders where command='CWO-Adv AI command test'), true);

delete from public.tasks where id = 'cee00001-0000-0000-0000-000000000001';
delete from public.work_orders where command = 'CWO-Adv AI command test';

-- ================== VERDICT ==================
select json_build_object(
  'scenario', 'CANONICAL-WORK-ORDER-MODEL-ADVERSARIAL (independent verifier pass)',
  't1_founder_insert_any_company', current_setting('cwoa.t1_founder_insert', true) = 'true',
  't2_manager_insert_own_company', current_setting('cwoa.t2_manager_insert', true) = 'true',
  't3_plain_member_insert_allowed', current_setting('cwoa.t3_member_insert', true) = 'true',
  't4_outsider_insert_blocked', current_setting('cwoa.t4_outsider_insert_blocked', true) = 'true',
  't5_wrong_company_insert_blocked', current_setting('cwoa.t5_wrong_company_insert_blocked', true) = 'true',
  't6_investor_viewer_insert_blocked', current_setting('cwoa.t6_investor_viewer_insert_blocked', true) = 'true',
  't7_spoof_prevented', current_setting('cwoa.t7_spoof_actual_creator', true) = current_setting('cwoa.emp1_pid', true),
  't8_plain_member_select_blocked', current_setting('cwoa.t8_plainmember_select_count', true) = '0',
  't8b_manager_select_allowed', current_setting('cwoa.t8b_manager_select_count', true) = '1',
  't9_former_creator_update_blocked', current_setting('cwoa.t9_former_creator_update_rows', true) = '0',
  't10_company_reassign_blocked', (current_setting('cwoa.t10_company_reassign_blocked', true) = 'true' or current_setting('cwoa.t10_company_unchanged', true) = 'true'),
  't11_creator_only_delete_blocked', current_setting('cwoa.t11_creator_only_delete_blocked', true) = 'true',
  't11_founder_delete_ok', current_setting('cwoa.t11_founder_delete_ok', true) = 'true',
  't12_agentrun_spoof_blocked', current_setting('cwoa.t12_agentrun_spoof_blocked', true) = 'true',
  't13_agentrun_unattributed_ok', current_setting('cwoa.t13_agentrun_unattributed_ok', true) = 'true',
  't14_agentrun_self_ok', current_setting('cwoa.t14_agentrun_self_ok', true) = 'true',
  't15_agentrun_wrong_company_blocked', current_setting('cwoa.t15_agentrun_wrong_company_blocked', true) = 'true',
  't16_agentrun_legit_company_ok', current_setting('cwoa.t16_agentrun_legit_company_ok', true) = 'true',
  't17_plain_member_agentrun_select_blocked', current_setting('cwoa.t17_plainmember_agentrun_select_count', true) = '0',
  't17b_manager_agentrun_select_allowed', current_setting('cwoa.t17b_manager_agentrun_select_count', true) = '1',
  't18_cross_company_manager_update_blocked', current_setting('cwoa.t18_cross_company_manager_update_blocked', true) = 'true',
  't19_manager_delete_blocked', current_setting('cwoa.t19_manager_delete_blocked', true) = 'true',
  't19_founder_delete_ok', current_setting('cwoa.t19_founder_delete_ok', true) = 'true',
  't20_goal_delete_sets_null', current_setting('cwoa.t20_goal_delete_sets_null', true) = 'true',
  't21_task_fk_set_null_not_blocked', current_setting('cwoa.t21_task_fk_set_null_not_blocked', true) = 'true',
  't22_workorder_fk_set_null_not_blocked', current_setting('cwoa.t22_workorder_fk_set_null_not_blocked', true) = 'true'
) as verdict_detail;

select (
      current_setting('cwoa.t1_founder_insert', true) = 'true'
  and current_setting('cwoa.t2_manager_insert', true) = 'true'
  and current_setting('cwoa.t3_member_insert', true) = 'true'
  and current_setting('cwoa.t4_outsider_insert_blocked', true) = 'true'
  and current_setting('cwoa.t5_wrong_company_insert_blocked', true) = 'true'
  and current_setting('cwoa.t6_investor_viewer_insert_blocked', true) = 'true'
  and current_setting('cwoa.t7_spoof_actual_creator', true) = current_setting('cwoa.emp1_pid', true)
  and current_setting('cwoa.t8_plainmember_select_count', true) = '0'
  and current_setting('cwoa.t8b_manager_select_count', true) = '1'
  and current_setting('cwoa.t9_former_creator_update_rows', true) = '0'
  and (current_setting('cwoa.t10_company_reassign_blocked', true) = 'true' or current_setting('cwoa.t10_company_unchanged', true) = 'true')
  and current_setting('cwoa.t11_creator_only_delete_blocked', true) = 'true'
  and current_setting('cwoa.t11_founder_delete_ok', true) = 'true'
  and current_setting('cwoa.t12_agentrun_spoof_blocked', true) = 'true'
  and current_setting('cwoa.t13_agentrun_unattributed_ok', true) = 'true'
  and current_setting('cwoa.t14_agentrun_self_ok', true) = 'true'
  and current_setting('cwoa.t15_agentrun_wrong_company_blocked', true) = 'true'
  and current_setting('cwoa.t16_agentrun_legit_company_ok', true) = 'true'
  and current_setting('cwoa.t17_plainmember_agentrun_select_count', true) = '0'
  and current_setting('cwoa.t17b_manager_agentrun_select_count', true) = '1'
  and current_setting('cwoa.t18_cross_company_manager_update_blocked', true) = 'true'
  and current_setting('cwoa.t19_manager_delete_blocked', true) = 'true'
  and current_setting('cwoa.t19_founder_delete_ok', true) = 'true'
  and current_setting('cwoa.t20_goal_delete_sets_null', true) = 'true'
  and current_setting('cwoa.t21_task_fk_set_null_not_blocked', true) = 'true'
  and current_setting('cwoa.t22_workorder_fk_set_null_not_blocked', true) = 'true'
) as all_pass;

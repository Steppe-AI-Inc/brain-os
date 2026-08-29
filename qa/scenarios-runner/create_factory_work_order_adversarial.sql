-- Permanent regression for the Phase 8 security incident (2026-08-29): a real, live,
-- exploitable cross-company goal_id gap found by independent review of
-- 202608290005_create_factory_work_order_rpc.sql, fixed by
-- 202608290006_factory_work_order_cross_company_fix.sql. Assumes the migration DDL has
-- ALREADY been applied earlier in the SAME transaction (same convention as
-- canonical_work_order_model_adversarial.sql / factory_agent_registry_adversarial.sql).
-- Caller wraps this in BEGIN;...ROLLBACK;.
--
-- Real profiles reused (read-only reuse, never mutated outside this rolled-back
-- transaction), same identities as the other adversarial regressions in this directory:
--   founder = profile 46bf57d3-33b3-47b4-8302-126726a92775 / auth cbcc41cf-830d-4600-8545-3b9e22c8297f
--   employee1 = profile 66ef2052-d002-4592-b841-82cd2171b51a / auth 9c92a8d5-853c-4ef3-846a-f4fe8c42d97a

insert into public.companies (id, name, status) values
  ('cfaa0001-0000-0000-0000-000000000001','CFWO-Adv Co A (emp1=manager)','active'),
  ('cfaa0001-0000-0000-0000-000000000002','CFWO-Adv Co B (emp1 NOT a member)','active');

insert into public.company_memberships (company_id, profile_id, role_in_company, active) values
  ('cfaa0001-0000-0000-0000-000000000001','66ef2052-d002-4592-b841-82cd2171b51a','manager', true);

insert into public.goals (id, company_id, title, status) values
  ('cfbb0001-0000-0000-0000-000000000001','cfaa0001-0000-0000-0000-000000000001','CFWO-Adv Goal A','active'),
  ('cfbb0001-0000-0000-0000-000000000002','cfaa0001-0000-0000-0000-000000000002','CFWO-Adv Goal B','active');

-- TEST 1: same-company goal — founder — must succeed.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
do $$
declare v_id uuid;
begin
  begin
    v_id := public.create_factory_work_order('CFWO-Adv T1', null, 'cfaa0001-0000-0000-0000-000000000001', 'cfbb0001-0000-0000-0000-000000000001');
    perform set_config('cfwo.t1_founder_same_company_ok', (v_id is not null)::text, true);
  exception when others then
    perform set_config('cfwo.t1_founder_same_company_ok', 'false', true);
  end;
end $$;
reset role;

-- TEST 2: cross-company goal injection — employee1 (manager of Co A, has real access to
-- Co A) sets company_id=A, goal_id=<real goal belonging to Co B> — must be REJECTED.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    perform public.create_factory_work_order('CFWO-Adv T2 CROSS-COMPANY', null, 'cfaa0001-0000-0000-0000-000000000001', 'cfbb0001-0000-0000-0000-000000000002');
  exception when others then
    v_blocked := true;
  end;
  perform set_config('cfwo.t2_cross_company_goal_blocked', v_blocked::text, true);
end $$;
reset role;
-- Independently confirm (privileged read, not the actor's own view) no such row exists.
do $$
begin
  perform set_config('cfwo.t2_no_row_created',
    (not exists(select 1 from public.canonical_work_orders where title = 'CFWO-Adv T2 CROSS-COMPANY'))::text, true);
end $$;

-- TEST 3: nonexistent goal — founder — must be rejected (FK violation or explicit check,
-- either way no row created).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    perform public.create_factory_work_order('CFWO-Adv T3 NONEXISTENT GOAL', null, 'cfaa0001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000'::uuid);
  exception when others then
    v_blocked := true;
  end;
  perform set_config('cfwo.t3_nonexistent_goal_blocked', v_blocked::text, true);
end $$;
reset role;

-- TEST 4: unauthorized user — employee1 has NO membership in Co B — must be rejected
-- regardless of whether the goal reference would otherwise be valid.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    perform public.create_factory_work_order('CFWO-Adv T4 UNAUTHORIZED', null, 'cfaa0001-0000-0000-0000-000000000002', 'cfbb0001-0000-0000-0000-000000000002');
  exception when others then
    v_blocked := true;
  end;
  perform set_config('cfwo.t4_unauthorized_blocked', v_blocked::text, true);
end $$;
reset role;

-- TEST 5: valid, no goal (null) — employee1, manager of Co A — must succeed (a Work
-- Order does not have to reference a goal).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
declare v_id uuid;
begin
  begin
    v_id := public.create_factory_work_order('CFWO-Adv T5 NO GOAL', null, 'cfaa0001-0000-0000-0000-000000000001', null);
    perform set_config('cfwo.t5_manager_no_goal_ok', (v_id is not null)::text, true);
  exception when others then
    perform set_config('cfwo.t5_manager_no_goal_ok', 'false', true);
  end;
end $$;
reset role;

-- TEST 6: founder happy path with same-company goal via a DIFFERENT company (proves the
-- fix is company-pair-specific, not hardcoded to Co A).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
do $$
declare v_id uuid;
begin
  begin
    v_id := public.create_factory_work_order('CFWO-Adv T6 FOUNDER CO B', null, 'cfaa0001-0000-0000-0000-000000000002', 'cfbb0001-0000-0000-0000-000000000002');
    perform set_config('cfwo.t6_founder_co_b_ok', (v_id is not null)::text, true);
  exception when others then
    perform set_config('cfwo.t6_founder_co_b_ok', 'false', true);
  end;
end $$;
reset role;

-- TEST 7: table-level trigger protection (not just the RPC) — a direct INSERT
-- bypassing create_factory_work_order entirely, as founder (has RLS access to insert),
-- with a cross-company goal_id, must ALSO be rejected by the trigger itself.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    insert into public.canonical_work_orders (title, company_id, goal_id)
    values ('CFWO-Adv T7 DIRECT INSERT CROSS-COMPANY', 'cfaa0001-0000-0000-0000-000000000001', 'cfbb0001-0000-0000-0000-000000000002');
  exception when others then
    v_blocked := true;
  end;
  perform set_config('cfwo.t7_trigger_blocks_direct_insert', v_blocked::text, true);
end $$;
reset role;

select json_build_object(
  'FACTORY_WORK_ORDER_FOUNDER_SAME_COMPANY_OK', current_setting('cfwo.t1_founder_same_company_ok', true),
  'FACTORY_WORK_ORDER_REJECTS_CROSS_COMPANY_GOAL', current_setting('cfwo.t2_cross_company_goal_blocked', true),
  'FACTORY_WORK_ORDER_CROSS_COMPANY_NO_ROW_CREATED', current_setting('cfwo.t2_no_row_created', true),
  'FACTORY_WORK_ORDER_REJECTS_NONEXISTENT_GOAL', current_setting('cfwo.t3_nonexistent_goal_blocked', true),
  'FACTORY_WORK_ORDER_REJECTS_UNAUTHORIZED_CALLER', current_setting('cfwo.t4_unauthorized_blocked', true),
  'FACTORY_WORK_ORDER_MANAGER_NO_GOAL_OK', current_setting('cfwo.t5_manager_no_goal_ok', true),
  'FACTORY_WORK_ORDER_FOUNDER_CROSS_COMPANY_VALID_GOAL_OK', current_setting('cfwo.t6_founder_co_b_ok', true),
  'FACTORY_WORK_ORDER_TABLE_TRIGGER_BLOCKS_DIRECT_INSERT', current_setting('cfwo.t7_trigger_blocks_direct_insert', true),
  'all_pass', (
    current_setting('cfwo.t1_founder_same_company_ok', true) = 'true'
    and current_setting('cfwo.t2_cross_company_goal_blocked', true) = 'true'
    and current_setting('cfwo.t2_no_row_created', true) = 'true'
    and current_setting('cfwo.t3_nonexistent_goal_blocked', true) = 'true'
    and current_setting('cfwo.t4_unauthorized_blocked', true) = 'true'
    and current_setting('cfwo.t5_manager_no_goal_ok', true) = 'true'
    and current_setting('cfwo.t6_founder_co_b_ok', true) = 'true'
    and current_setting('cfwo.t7_trigger_blocks_direct_insert', true) = 'true'
  )
) as verdict;

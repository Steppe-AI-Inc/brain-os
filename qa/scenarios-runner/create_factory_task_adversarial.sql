-- Permanent regression for create_factory_task (Phase 8 continuation, 202608290007).
-- Built with the company-consistency invariant enforced from the start, per
-- qa/KNOWN_FAILURE_MODES.md #24's PRE-EXPOSURE BLOCKER. Assumes the migration DDL has
-- ALREADY been applied earlier in the SAME transaction. Caller wraps this in
-- BEGIN;...ROLLBACK;.
--
-- Reuses the real Phase 5 canonical Work Order (91f6ac74-f738-4fb5-9d46-01c426a31e12,
-- company SEM Technologies LLC 4e4a0553-4069-4367-960e-d671e0025fcd) as a real,
-- pre-existing fixture rather than inventing synthetic companies for this one.

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
do $$
declare v_id uuid;
begin
  begin
    v_id := public.create_factory_task('91f6ac74-f738-4fb5-9d46-01c426a31e12'::uuid, 'CFT-Adv T1 real task');
    perform set_config('cft.t1_id', v_id::text, true);
    perform set_config('cft.t1_ok', 'true', true);
  exception when others then
    perform set_config('cft.t1_ok', 'false', true);
  end;
end $$;
reset role;

do $$
begin
  perform set_config('cft.t1_company_derived_correctly',
    (exists(select 1 from public.tasks where id = current_setting('cft.t1_id', true)::uuid and company_id = '4e4a0553-4069-4367-960e-d671e0025fcd'::uuid))::text, true);
end $$;

-- Nonexistent work order — must be rejected.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    perform public.create_factory_task('00000000-0000-0000-0000-000000000000'::uuid, 'CFT-Adv T2 nonexistent WO');
  exception when others then
    v_blocked := true;
  end;
  perform set_config('cft.t2_blocked', v_blocked::text, true);
end $$;
reset role;

-- Direct INSERT bypassing the RPC with a mismatched company/work-order pair — the
-- table-level trigger must block it independently of the RPC.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);
do $$
declare v_blocked boolean := false;
begin
  begin
    insert into public.tasks (company_id, title, canonical_work_order_id)
    values ('ed8ae510-ddbc-4be6-9d9e-d1f725b1381d'::uuid, 'CFT-Adv T3 mismatched direct insert', '91f6ac74-f738-4fb5-9d46-01c426a31e12'::uuid);
  exception when others then
    v_blocked := true;
  end;
  perform set_config('cft.t3_trigger_blocked', v_blocked::text, true);
end $$;
reset role;

select json_build_object(
  'CREATE_FACTORY_TASK_FOUNDER_OK', current_setting('cft.t1_ok', true),
  'CREATE_FACTORY_TASK_COMPANY_DERIVED_CORRECTLY', current_setting('cft.t1_company_derived_correctly', true),
  'CREATE_FACTORY_TASK_REJECTS_NONEXISTENT_WORK_ORDER', current_setting('cft.t2_blocked', true),
  'CREATE_FACTORY_TASK_TRIGGER_BLOCKS_DIRECT_MISMATCH', current_setting('cft.t3_trigger_blocked', true),
  'all_pass', (
    current_setting('cft.t1_ok', true) = 'true'
    and current_setting('cft.t1_company_derived_correctly', true) = 'true'
    and current_setting('cft.t2_blocked', true) = 'true'
    and current_setting('cft.t3_trigger_blocked', true) = 'true'
  )
) as verdict;

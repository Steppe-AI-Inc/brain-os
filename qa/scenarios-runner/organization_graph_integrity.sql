-- Organization graph integrity — permanent regression for KNOWN_FAILURE_MODES.md #19
-- (company_relationships had no idempotency, no business_unit/brand/subsidiary
-- distinction, and nothing read it back anywhere in the product). Proves, against real
-- fixture companies in a rolled-back transaction:
--   1. set_company_relationship is idempotent (repeated call = 1 row, not N)
--   2. hierarchy cycles are rejected
--   3. total ownership > 100% is rejected
--   4. a non-founder/admin cannot call it at all
-- This is exactly the regression that would have caught the real bug found live
-- (202608280008 — missing enum cast on p_state) if it had existed before that push;
-- added after the fact per CLAUDE.md's "find one instance, add the permanent test" rule.
begin;

insert into public.companies (id, name, organization_type) values
  ('eeee0001-0000-0000-0000-000000000001', 'SC-ORG Parent Co', 'legal_entity'),
  ('eeee0001-0000-0000-0000-000000000002', 'SC-ORG Child Co', 'business_unit'),
  ('eeee0001-0000-0000-0000-000000000003', 'SC-ORG Owner A', 'legal_entity'),
  ('eeee0001-0000-0000-0000-000000000004', 'SC-ORG Owner B', 'legal_entity'),
  ('eeee0001-0000-0000-0000-000000000005', 'SC-ORG Owned Co', 'legal_entity');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','cbcc41cf-830d-4600-8545-3b9e22c8297f','role','authenticated')::text, true);

-- 1. Idempotency: same "move X under Y" call twice must leave exactly one active row.
do $$
begin
  perform public.set_company_relationship(
    'eeee0001-0000-0000-0000-000000000002'::uuid, 'eeee0001-0000-0000-0000-000000000001'::uuid,
    'business_unit_of'::public.company_relationship_type, null, 'current');
  perform public.set_company_relationship(
    'eeee0001-0000-0000-0000-000000000002'::uuid, 'eeee0001-0000-0000-0000-000000000001'::uuid,
    'business_unit_of'::public.company_relationship_type, null, 'current');
end $$;
select set_config('sc_org.idempotent_row_count',
  (select count(*)::text from public.company_relationships
   where company_id = 'eeee0001-0000-0000-0000-000000000002' and state = 'current'), true);

-- 2. Cycle prevention: Parent already business_unit_of Child would be a cycle (Child is
-- already business_unit_of Parent from step 1) — must be rejected.
do $$
begin
  begin
    perform public.set_company_relationship(
      'eeee0001-0000-0000-0000-000000000001'::uuid, 'eeee0001-0000-0000-0000-000000000002'::uuid,
      'business_unit_of'::public.company_relationship_type, null, 'current');
    perform set_config('sc_org.cycle_blocked', 'false', true);
  exception when others then
    perform set_config('sc_org.cycle_blocked', 'true', true);
  end;
end $$;

-- 3. Ownership > 100%: Owner A takes 60%, Owner B attempts 50% of the same company — the
-- second call must be rejected by the integrity trigger, and the first must still stand.
do $$
begin
  perform public.set_company_relationship(
    'eeee0001-0000-0000-0000-000000000003'::uuid, 'eeee0001-0000-0000-0000-000000000005'::uuid,
    'parent_of'::public.company_relationship_type, 60, 'current');
  begin
    perform public.set_company_relationship(
      'eeee0001-0000-0000-0000-000000000004'::uuid, 'eeee0001-0000-0000-0000-000000000005'::uuid,
      'parent_of'::public.company_relationship_type, 50, 'current');
    perform set_config('sc_org.overownership_blocked', 'false', true);
  exception when others then
    perform set_config('sc_org.overownership_blocked', 'true', true);
  end;
end $$;
select set_config('sc_org.first_owner_intact',
  (exists(select 1 from public.company_relationships
    where company_id = 'eeee0001-0000-0000-0000-000000000003' and related_company_id = 'eeee0001-0000-0000-0000-000000000005'
      and state = 'current' and ownership_pct = 60))::text, true);

reset role;

-- 4. Non-founder/admin cannot call this at all, even though RLS alone would let a
-- company manager write company_relationships in some configs — set_company_relationship
-- re-derives the founder/admin check itself (SECURITY DEFINER, same pattern as
-- decide_approval/propose_salary_change).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','9c92a8d5-853c-4ef3-846a-f4fe8c42d97a','role','authenticated')::text, true);
do $$
begin
  begin
    perform public.set_company_relationship(
      'eeee0001-0000-0000-0000-000000000002'::uuid, 'eeee0001-0000-0000-0000-000000000001'::uuid,
      'brand_of'::public.company_relationship_type, null, 'current');
    perform set_config('sc_org.non_founder_blocked', 'false', true);
  exception when others then
    perform set_config('sc_org.non_founder_blocked', 'true', true);
  end;
end $$;
reset role;

select json_build_object(
  'scenario', 'ORG-GRAPH-INTEGRITY',
  'classification', 'FIXED (KNOWN_FAILURE_MODES.md #19)',
  'idempotent_row_count', current_setting('sc_org.idempotent_row_count', true),
  'cycle_blocked', current_setting('sc_org.cycle_blocked', true) = 'true',
  'overownership_blocked', current_setting('sc_org.overownership_blocked', true) = 'true',
  'first_owner_intact', current_setting('sc_org.first_owner_intact', true) = 'true',
  'non_founder_blocked', current_setting('sc_org.non_founder_blocked', true) = 'true',
  'all_pass', (
        current_setting('sc_org.idempotent_row_count', true) = '1'
    and current_setting('sc_org.cycle_blocked', true) = 'true'
    and current_setting('sc_org.overownership_blocked', true) = 'true'
    and current_setting('sc_org.first_owner_intact', true) = 'true'
    and current_setting('sc_org.non_founder_blocked', true) = 'true'
  )
) as verdict;

rollback;

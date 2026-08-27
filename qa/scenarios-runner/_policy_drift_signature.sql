-- Policy-drift signature guard (REGRESSION_RULE / qa/KNOWN_FAILURE_MODES.md #8, #11).
-- Emits the security-function SIGNATURE of every live public policy (the sorted, distinct
-- set of authorization functions its expression calls) and spot-checks the four policies
-- that were casualties of the 202608230001 migration never fully taking effect. A drift
-- of any of these back to a broader/absent check is the exact class this catches.
-- Read-only. No transaction needed.
with pol as (
  select c.relname as tbl, p.polname as policy,
    lower(coalesce(pg_get_expr(p.polqual,p.polrelid),'') || ' ' || coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')) as expr
  from pg_policy p
  join pg_class c on c.oid=p.polrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
),
sig as (
  select tbl, policy,
    array_to_string(array_remove(array[
      case when expr like '%is_founder_or_admin%' then 'is_founder_or_admin' end,
      case when expr like '%is_company_manager%' then 'is_company_manager' end,
      case when expr like '%is_hr_finance%' then 'is_hr_finance' end,
      case when expr like '%has_company_access%' then 'has_company_access' end,
      case when expr like '%current_profile_id%' then 'current_profile_id' end
    ], null), ',') as signature
  from pol
)
select json_build_object(
  'guard','policy_drift_signature',
  'checked_at','2026-08-27',
  'approvals_update_approver_has_hr_finance', (select signature like '%is_hr_finance%' from sig where policy='approvals_update_approver'),
  'approvals_update_approver_has_manager',    (select signature like '%is_company_manager%' from sig where policy='approvals_update_approver'),
  'memories_select_scope_has_hr_finance',     (select signature like '%is_hr_finance%' from sig where policy='memories_select_scope'),
  'memories_select_scope_has_manager',        (select signature like '%is_company_manager%' from sig where policy='memories_select_scope'),
  'financial_reports_select_has_hr_finance',  (select signature like '%is_hr_finance%' from sig where policy='financial_reports_select_scope'),
  'salary_write_hr_signature',                (select signature from sig where policy='salary_write_hr'),
  'all_signatures', (select json_object_agg(tbl||'::'||policy, signature) from sig)
) as verdict;

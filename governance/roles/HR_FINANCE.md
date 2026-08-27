# HR/Finance (`profiles.role = 'hr_finance'`)

The one `profiles.role` value besides founder/holding_admin with real, distinct RLS
reach — `is_hr_finance()` checks `role in ('founder','holding_admin','hr_finance')` and
is OR'd into every salary/HR/finance-adjacent policy. This is a *global* grant — it does
not require any `company_memberships` row to take effect at all, by design (an
HR/Finance person is expected to work across companies without needing per-company
manager status).

## What this role can see/do
- `salary_private` — read (`salary_select_authorized`) and write (`salary_write_hr`).
- `salary_rules` — read and write.
- `kpi_records` — read and write.
- `financial_reports` — read and write, **once migration `202608270003` is applied to
  production** (written and dry-run-verified 2026-08-27, but the actual push is still
  pending founder authorization at time of writing — see below. Do not assume this is
  live without re-checking `supabase migration list --linked`.)
- `approvals` with `domain in ('salary_hr','finance')` — can both see and decide these,
  same tier as founder for these two domains specifically.

## What this role CANNOT do
- Approve `legal`-domain approvals — that domain has no role-based branch at all, only
  founder/admin or an explicitly assigned approver.
- Approve `general`/`production`/`external_comms`-domain approvals — those require
  `is_company_manager()` (the `role_in_company` axis, see `COMPANY_MANAGER_TIER.md`), not
  `is_hr_finance()`. An hr_finance person with no company membership sees these
  approvals if they exist (read is broader than decide for non-financial domains) but
  cannot decide them.
- See `company_sensitive` (cash position, ownership, investor notes) — that table is
  founder/admin-only with no `is_hr_finance()` exception at all.

## Verified
Tested live 2026-08-27 (`qa/SECURITY_MATRIX.md`): with zero company memberships, an
`hr_finance`-tier test account correctly saw all `finance`/`salary_hr` approvals (21/21)
and all `salary_rules` (3/3), but **zero of 2 real `financial_reports` rows** — a real
gap, since `financial_reports_select_scope` never called `is_hr_finance()` at all. Fix
written same day as migration `202608270003_financial_reports_hr_finance_access.sql`
(adds `is_hr_finance()` to both `financial_reports_select_scope` and
`financial_reports_write_scope`, matching the pattern every other finance-adjacent table
already used) — **PENDING, not yet pushed to production** as of this writing (blocked by
the operating tool's safety classifier as a live security-policy change, same as the
`approvals_update_approver` fix was before the founder explicitly authorized that push).
Needs the same explicit go-ahead before this section of this file is actually true in
production.

## Real-world identity
No production profile currently holds this role.

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
- `financial_reports` — read and write (migration `202608270003`, applied and live-verified
  2026-08-27 — see below).
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
gap, since `financial_reports_select_scope` never called `is_hr_finance()` at all. Fixed
same day via migration `202608270003_financial_reports_hr_finance_access.sql` (adds
`is_hr_finance()` to both `financial_reports_select_scope` and
`financial_reports_write_scope`, matching the pattern every other finance-adjacent table
already used) — applied to production with the founder's explicit authorization, then
re-verified: the same temporary hr_finance-tier test account now sees all 2 real
`financial_reports` rows (was 0 before the fix).

## Real-world identity
No production profile currently holds this role.

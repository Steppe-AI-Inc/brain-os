# Company Manager tier (`company_memberships.role_in_company in ('owner','manager','team_lead')`)

This is the axis that actually grants per-company elevated access — see `README.md` in
this directory for why this is distinct from `profiles.role = 'company_manager'` (which
does nothing). `is_company_manager(cid)` returns true for any active membership row at
company `cid` with `role_in_company` in `owner`/`manager`/`team_lead` (or for
founder/holding_admin unconditionally, since that function always includes
`is_founder_or_admin()` as an OR branch).

## What this tier can see/do, scoped to companies where the person holds this tier
- `people`, `projects`, `boards` — full read/write within the company.
- `documents`/`memories` with `sensitivity = 'confidential'` — readable (alongside
  `hr_finance`).
- `financial_reports`, `product_costs`, `proposal_financials`, `proposal_item_costs` —
  full read/write within the company.
- `kpi_records`, `salary_rules` — full read/write within the company (alongside
  `hr_finance` — this is one of the few places company-manager and hr_finance overlap).
- `approvals` with `domain in ('general','production','external_comms')` — can decide
  these.
- `tasks` — update/delete authority beyond what a plain member has (plain members can
  create but not edit/delete others' tasks).

## What this tier explicitly CANNOT do (the boundary that was broken and fixed)
- Approve `salary_hr`/`finance`-domain approvals — requires `is_hr_finance()`, which
  `role_in_company` alone never satisfies regardless of tier.
- Approve `legal`-domain approvals — requires founder/admin or the explicit assigned
  approver; no company-manager exception exists.
- See `salary_private` rows for people other than themselves, or `company_sensitive` at
  all — those require `is_hr_finance()`/`is_founder_or_admin()` specifically.

**This exact boundary was broken in production** for an unknown period (found and fixed
2026-08-27, see `qa/KNOWN_FAILURE_MODES.md` #8): the live `approvals_update_approver`
policy had no domain check at all, so this tier could approve *everything*, including
salary/finance/legal. Re-verify this boundary after any future change to
`approvals_update_approver` using the exact method in `qa/REGRESSION_CATALOG.md`'s "RLS
policy drift" section — this is the single highest-value regression check in the whole
schema given it already broke once silently.

## Note on `audit_logs`/`work_orders`/`chat_channels`
This tier's intended "review your own company's audit trail" capability
(`is_company_manager(company_id)` branch on those three tables) is currently **inert in
practice** — `company_id` is NULL on 100% of real rows, so visibility for a non-founder
manager on these three tables is effectively zero regardless of tier. Functional gap,
not a leak (`qa/KNOWN_FAILURE_MODES.md` #7).

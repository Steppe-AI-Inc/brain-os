# Employee baseline (`role_in_company` NOT in owner/manager/team_lead; `profiles.role`
one of employee/contractor/investor_viewer/company_manager/team_lead — see note below)

This is the access ceiling for the large majority of people in the system, and —
importantly — for several `profiles.role` values that sound like they should grant more
or different access but currently don't (see `README.md`). "Sales", "engineer",
"technician", and any other job title live only in `people.role_title`, which has zero
RLS relevance — everyone with one of those titles gets exactly this baseline unless
their `company_memberships.role_in_company` happens to be manager-tier.

## What this baseline can see/do, within companies where the person has active membership
- `tasks` — **all** of the company's tasks, not just ones assigned to them (verified
  live 2026-08-27, `qa/ACCEPTANCE_TESTS.md` #4 — company-wide visibility by design, not
  a leak, but worth knowing since the name "employee baseline" might suggest narrower
  scope).
- `documents`/`memories` with `sensitivity in ('public','internal')`.
- `approvals` with `domain not in ('salary_hr','finance','legal')` — can see, cannot
  necessarily decide (deciding also requires being the assigned approver or
  company-manager-tier for those domains).
- `people`, `projects`, `product_lines`, `inventory_items`, `proposals` (customer-facing
  fields, not cost/margin) — company-scoped read.
- Can create tasks, sales leads, and proposals; can edit/delete only ones they own.
- `audit_logs`/`work_orders` — exactly their own rows (verified exact-match, not
  "some"), plus `chat_channels` they created.

## What this baseline explicitly CANNOT see
- `salary_private`, `salary_rules`, `kpi_records`, `financial_reports`,
  `company_sensitive`, `product_costs`/`proposal_financials`/`proposal_item_costs`,
  `documents`/`memories` marked `confidential`, any other company's data at all.

## Verified
Extensively — this is the most-tested tier in the project, see `qa/SECURITY_MATRIX.md`
in full.

## `investor_viewer` specifically
Tested live 2026-08-27: a test account with `profiles.role = 'investor_viewer'` and a
plain `role_in_company = 'employee'` membership saw **exactly** this baseline — not
reduced, not different. If the founder's intent for this role name was "an investor
should see less than a regular employee" (a reasonable reading), that's not built. Real
product decision needed, not silently assumed either way — see
`qa/SECURITY_MATRIX.md`'s investor_viewer section.

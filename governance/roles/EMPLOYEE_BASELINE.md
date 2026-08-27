# Employee baseline (`role_in_company` NOT in owner/manager/team_lead; `profiles.role`
one of employee/contractor/investor_viewer/company_manager/team_lead — see note below)

This is the access ceiling for the large majority of people in the system, and —
importantly — for several `profiles.role` values that sound like they should grant more
or different access but currently don't (see `README.md`). "Sales", "engineer",
"technician", and any other job title live only in `people.role_title`, which has zero
RLS relevance — everyone with one of those titles gets exactly this baseline unless
their `company_memberships.role_in_company` happens to be manager-tier.

## What this baseline can see/do, within companies where the person has active membership
- `tasks` — **only** tasks they created (company managers and above see all of a
  company's tasks; a plain employee does not). **Correction, 2026-08-27:** this file
  previously said "all of the company's tasks... company-wide visibility by design, not
  a leak" — that was wrong. It was a real bug (`tasks_select_scope`'s intended
  narrowing, from migration `202608230001`, had silently never taken effect in
  production — GitHub↔production drift, same class as the `approvals_update_approver`
  bug). Found while reproducing a different issue, fixed via migration `202608270004`,
  re-verified live: the same plain-employee test account that previously saw a
  company's full task total now sees 0 for a company whose tasks it didn't create. See
  `qa/ACCEPTANCE_TESTS.md` #4 and `qa/KNOWN_FAILURE_MODES.md` #11 for the full trace.
  The "assigned owner" branch of this policy is still effectively inert (see
  `COMPANY_MANAGER_TIER.md`'s note on `owner_person_id`/`profile_id` linkage) — so today
  this is "creator or company-manager+," not yet "or assignee."
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
  `documents`/`memories` marked `confidential`, any other company's data at all,
  `safe_companies`/`safe_proposals` data for companies they aren't a member of.
  **`memories` marked `confidential` and the two `safe_*` views were both real, live
  bugs until 2026-08-27** (fixed same migration as the `tasks` fix above,
  `qa/KNOWN_FAILURE_MODES.md` #11) — before that fix, this baseline tier could read
  confidential-tagged memories in full and, via the `safe_*` views, every company's
  basic info regardless of membership.

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

# Data Classification

Brain OS already has a real classification enum — `visibility_level` (public, internal,
confidential, restricted, founder_only), defined in `schema-v0.7-production-core.sql`
line 25. This document maps every classified table to its tier and its actual enforcing
policy, and is honest about which tiers are live-enforced vs. declared-but-unused.

## The five tiers, as actually used

| Tier | Meaning | Actually read by any RLS policy today? |
|---|---|---|
| `public` | Visible to any authenticated user, no company check | ✅ yes (`documents`, `memories`) |
| `internal` | Visible to any active member of the owning company | ✅ yes (`documents`, `memories`) |
| `confidential` | Visible only to company manager+ or hr_finance | ✅ yes (`documents`, `memories`) |
| `restricted` | Declared on `salary_private.visibility` (default) | ❌ **no** — see below |
| `founder_only` | Declared on `company_sensitive.visibility` (default) | ❌ **no** — see below |

**The gap, stated plainly:** `salary_private` and `company_sensitive` both have a
`visibility` column defaulting to `restricted`/`founder_only` respectively — but neither
column is ever referenced by that table's own RLS policy. `salary_select_authorized` and
`salary_write_hr` are hardcoded to `is_hr_finance()` regardless of the row's
`visibility` value; `company_sensitive_select_founder`/`_write_founder` are hardcoded to
`is_founder_or_admin()`. **This is not currently a security hole** — the hardcoded
checks happen to enforce exactly what the tier names promise — but it means the
`visibility` column is decorative today: changing it would have zero effect on who can
read the row. If a future feature needs per-row flexibility within `salary_private`
(e.g. some salary data visible to a broader HR team, not just full `hr_finance`), the
column exists but the policy needs to actually start reading it.

## Table-by-table classification (real tables, real enforcement)

| Table | Tier | Enforcing policy | Live-verified? |
|---|---|---|---|
| `companies` (core fields) | internal | `companies_select_member` — `has_company_access(id)` | not this pass |
| `company_sensitive` (cash, revenue, ownership, investor notes) | founder_only | `company_sensitive_select_founder` — `is_founder_or_admin()` | not this pass (see SECURITY_INVARIANTS.md #4) |
| `financial_reports` | confidential (finance domain) | `financial_reports_select_scope` — manager or hr_finance | ✅ live |
| `product_costs` / `proposal_financials` / `proposal_item_costs` | confidential (finance domain) | manager+ only, physically separated from the public-facing tables | ✅ live |
| `salary_private` | restricted | `salary_select_authorized` — self or hr_finance | ✅ live |
| `salary_rules` | confidential (HR domain) | hr_finance or company manager | not this pass |
| `kpi_records` | confidential (HR domain) | hr_finance, company manager, or the record's own subject | not this pass |
| `documents` (per-row `sensitivity`) | public/internal/confidential, per row | `documents_select_scope` reads the actual column | ✅ live (storage-vs-table sensitivity mismatch found and fixed, `qa/KNOWN_FAILURE_MODES.md` #2) |
| `memories` (per-row `sensitivity`) | public/internal/confidential, per row, **model-assigned at write time** | `memories_select_scope` reads the column | ⚠️ see SECURITY_INVARIANTS.md #7 — the column is trusted from the model's own output with no floor validation against source sensitivity |
| `audit_logs` / `work_orders` / `chat_channels` | internal (creator + company manager) | company-manager branch currently inert — `company_id` is never populated at creation time | ✅ live (`qa/KNOWN_FAILURE_MODES.md` #7) |
| `tasks` | internal, company-wide (not per-assignee) | `tasks_select_scope` — any active company member, not just the task owner | ✅ live, and confirmed this is company-wide-by-design, not per-assignee (`qa/ACCEPTANCE_TESTS.md` #4) |
| `approvals` | domain-gated: general/production/external_comms = internal; salary_hr/finance/legal = confidential | `approvals_select_scope` / `approvals_update_approver` | ✅ live, including the critical drift found and fixed 2026-08-27 (`qa/KNOWN_FAILURE_MODES.md` #8) |
| `boards` / `board_columns` / `board_items` | internal | company-scoped, no sensitive fields | recovered into git 2026-08-27, unused by the app (0 rows), `qa/KNOWN_FAILURE_MODES.md` #9 |

## For every new table going forward

Per `BRAIN_OS_CONSTITUTION.md`'s workflow, a new table must declare, at minimum:
- **company_scope**: does a row belong to one company (`company_id` column, checked via
  `has_company_access`/`is_company_manager`), no company (global, founder-only by
  default), or is it itself the company-membership boundary?
- **sensitivity**: one of the five `visibility_level` tiers, and — critically, given the
  gap documented above — the RLS policy must actually branch on that column's real value
  if the column exists, not just declare it and hardcode a different check.
- **domain**: for anything approval-adjacent, one of the six real `approval_domain`
  values (`general`, `salary_hr`, `finance`, `legal`, `production`, `external_comms`) —
  see `policies/` for what each domain actually gates.
- **owner**: which `profiles.role` / `role_in_company` tier is the natural
  read/write authority — cross-check against `roles/*.md` before inventing a new
  authorization pattern for something an existing role already covers.

There is no CI check enforcing this yet (`BRAIN_OS_CONSTITUTION.md`'s "no CI check
enforcing this yet" caveat applies here too) — this is currently a discipline, not a
gate. Worth building a real migration-linter for this if the project grows past what one
engineer/agent can hold in their head each time — flagged as future work, not done.

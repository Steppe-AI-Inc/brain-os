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
| `confidential` | Visible only to company manager+ or hr_finance | ✅ yes (`documents`; `memories` as of 2026-08-27 — see the correction below, it was live-broken for a period) |
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
| `memories` (per-row `sensitivity`) | public/internal/confidential, per row, **model-assigned at write time** | `memories_select_scope` reads the column | ✅ live as of migration `202608270004` — **was live-broken 2026-08-24 through 2026-08-27**: the `confidential` tier was silently lumped into the same broad `has_company_access()` branch as `public`/`internal` (GitHub↔production drift, migration `202608230001` never fully took effect). Reproduced and fixed the same day it was reproduced — see `qa/KNOWN_FAILURE_MODES.md` #11. The narrower "no floor validation at write time" question (SECURITY_INVARIANTS.md #7) is separate and still open. |
| `audit_logs` / `work_orders` / `chat_channels` | internal (creator + company manager) | company-manager branch currently inert — `company_id` is never populated at creation time | ✅ live (`qa/KNOWN_FAILURE_MODES.md` #7) |
| `chat_channel_state` (PREPARED, 202609020001 — not yet pushed) | internal (channel creator + founder/admin; the company-manager tier was REMOVED in DB review round 3, A-3) | `chat_channel_state_select_scope` / `chat_channel_state_write_scope`; trusted columns (pending_action_*, last_successful_mutation, compacted_*) are server-written only via `chat_channel_state_guard_trusted_columns[_ins]` — flag AND SECURITY DEFINER context required (round 3, A-1) | PGlite personas 34/34 + real-PostgreSQL CI; independent round-3 review FAIL → round 4 re-review pending |
| `channel_transport_bindings` (PREPARED, 202609020003 — sequenced AFTER the Phase 11 gate) | confidential (company manager may create/edit a DISABLED binding; enabling and repointing an enabled binding are founder/admin — `channel_transport_bindings_enable_gate`, round 3 C-2/C-3) | `channel_transport_bindings_manage_scope` + agreement trigger `channel_transport_bindings_enforce_company` | same as above |
| `external_identity_bindings` (PREPARED, 202609020003) | **founder_only — AUTHORITY-CRITICAL**: the only way an external sender acquires a Brain OS identity | `external_identity_bindings_founder_scope` — `is_founder_or_admin()`; revocation is a tombstone, never a delete (R-C5) | same as above |
| `outbound_messages` (PREPARED, 202609020003) | internal (channel creator + founder/admin) | `outbound_messages_channel_write_scope` + `outbound_messages_enforce_binding` (binding must be enabled and on the same channel) | same as above |
| `agent_runs` retry/checkpoint columns incl. `execution_mode` (PREPARED, 202609030001) | confidential (founder/admin, or the supervisor's direct-connection identity) | `guard_agent_run_retry_columns` (SECURITY DEFINER, tests `session_user`, 20 columns incl. execution_mode — round 3 D-3); `claim_blocked_run_for_retry` holds NO EXECUTE grant (direct-connection-only, round 3 D-2) | personas under session_user = qa_authenticator (round 3 D-1); SKIP LOCKED double-claim under two real connections (concurrency.mjs) |
| `tasks` | internal, company-scoped (creator + company manager, NOT company-wide) | `tasks_select_scope` — founder/manager/creator/owner only | ✅ live as of migration `202608270004` — **was live-broken 2026-08-24 through 2026-08-27**: any active company member could see the company's full task list regardless of ownership, the same drift bug as `memories` above (same migration, same root cause). This file and `qa/ACCEPTANCE_TESTS.md` #4 previously described the broad version as "by design" — that was wrong, corrected same day it was found. |
| `safe_companies` / `safe_proposals` (views) | internal, company-scoped — inherits the base table's own tier (`companies`/`proposals`) once RLS actually applies to the caller | `security_invoker = true` (a view-level setting, not a policy) makes the base table's RLS apply to the caller instead of the view owner | ✅ live as of migration `202608270004` — **was live-broken 2026-08-24 through 2026-08-27, the most severe of the three**: `security_invoker` was never actually set, so these views ran with the view owner's privileges (full RLS bypass) — a caller with ZERO company memberships anywhere could read all 7 companies and real proposal data via a direct query. Not used by any app code (grepped `web/`), but directly reachable via PostgREST regardless. |
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

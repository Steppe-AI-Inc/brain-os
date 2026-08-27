# Security Matrix

Real impersonation results only — no entry here is "should be fine per the policy
text" without an actual test. Method: `set local role authenticated; select
set_config('request.jwt.claims', json_build_object('sub','<auth_user_id>','role',
'authenticated')::text, true);` against a real test account (a genuine non-manager
`company_memberships` row, added before the test and removed after), or a real founder
browser session for positive controls.

Personas tested: **founder** (positive control), **non-manager employee**
(`role_in_company='employee'`, no special grants), **holding_admin**, **hr_finance**,
**investor_viewer** — all four added 2026-08-27 by temporarily changing the standing
test profile's global `profiles.role` (reverted after each test; company memberships
added/removed as needed) and comparing impersonated results against real unfiltered
totals.

**First, a structural finding that reframes the whole persona question:** there are two
independent role axes in this schema, not one. `profiles.role` (the `app_role` enum:
founder/holding_admin/hr_finance/company_manager/team_lead/employee/contractor/
investor_viewer/ai_agent) is a *global* tier — but grepping every RLS policy and
function confirms only two of its nine values are ever actually checked anywhere:
`is_founder_or_admin()` (founder, holding_admin) and `is_hr_finance()` (+ hr_finance).
`company_manager`, `team_lead`, `contractor`, and `investor_viewer` as *global*
`profiles.role` values are **never referenced by any policy or function** — they exist
in the enum but carry zero differentiated access. All real per-company authorization
(`is_company_manager`) instead reads a completely separate free-text column,
`company_memberships.role_in_company` (owner/manager/team_lead/employee/contractor/
viewer). "sales"/"engineer"/"technician" from CLAUDE.md's persona list aren't role
values at all — they're `people.role_title` (job titles), with no RLS relevance.
Practical effect: testing `employee`-tier `role_in_company` access (already done) covers
what "sales"/"engineer"/"technician" would also see, since none of them get distinct
treatment.

**`investor_viewer` (global `profiles.role`) — tested live, confirmed to carry zero
special restriction:** given `role='investor_viewer'` + a plain `role_in_company='employee'`
membership, the test account saw exactly what the earlier plain-`employee` test saw
(access matched 1:1, both measured against `tasks` before the `tasks_select_scope` fix
below — the *identical-to-employee* finding still holds after that fix too, just against
a smaller real number now) — identical access, not reduced. If the founder's intent for
this role was "an investor should see less than a regular employee" (a reasonable
reading of the name), that behavior isn't built. Not a leak in the sense of exposing
anything a same-tier employee couldn't already see, but worth the founder's explicit
call on whether investor accounts should actually be more restricted.

**`holding_admin` — tested live, confirmed equivalent to founder:** with no company
memberships at all, saw the real global totals exactly (7/7 companies, 2/2
`financial_reports`, matching `is_founder_or_admin()`'s intent).

**`hr_finance` — tested live, confirmed a real, notable gap:** with no company
memberships, correctly saw all `finance`/`salary_hr` domain approvals (21/21) and all
`salary_rules` (3/3) — but saw **0 of the 2 real `financial_reports` rows**. Root cause:
`financial_reports_select_scope` is `is_founder_or_admin() OR is_company_manager(company_id)`
— it never calls `is_hr_finance()` at all, unlike every other finance-adjacent policy
(`salary_private`, `salary_rules`, `kpi_records` all include `is_hr_finance()`). An
HR/Finance-tier person who isn't also a company manager currently cannot see company
financial reports, which is a plausible expectation gap for that role. Flagging for the
founder rather than unilaterally "fixing" a policy whose intended scope wasn't stated
anywhere.

Not yet tested: `company_manager` and `team_lead` as *global* `profiles.role` values —
lower priority now that the structural finding above shows they're inert no-ops
identical to `employee` at that layer (real elevation only comes from
`role_in_company`, already covered). `contractor` as a global role likewise inert;
not separately tested live given the same reasoning, but flagged if the founder wants
it confirmed directly rather than inferred.

| Resource | Employee (non-manager) SELECT | Employee INSERT | Founder SELECT | Verified |
|---|---|---|---|---|
| `documents` (confidential row) | 0 rows | — | full row | ✅ live impersonation |
| `storage.objects` (confidential file) | 0 rows (signed URL creation would fail upstream of this) | — | fetchable | ✅ live impersonation |
| `proposals` | ❌ not INSERT-tested pre-fix in this exact session, but write-bypass fix confirmed via direct insert attempt | rejected (`42501`) post-fix | full access | ✅ live impersonation |
| `product_costs` | 0 rows | — | real value | ✅ live impersonation |
| `proposal_financials` | 0 rows | — | real value | ✅ live impersonation |
| `proposal_item_costs` | 0 rows | — | real value | ✅ live impersonation |
| `approvals` (salary_hr domain) | 0 rows | — | full access | ✅ live impersonation |
| `approvals` (production domain) | visible (correct — not a sensitive domain) | — | full access | ✅ live impersonation |
| `financial_reports` | 0 rows (verified prior session) | — | real revenue figures | ✅ live impersonation + live chat |
| AI context (`sem-ai-command`) — revenue | absent from context pack for a technician-tier caller | n/a | present, real numbers | ✅ (RLS-scoped client confirmed; not yet re-tested with the exact non-manager persona asking the AI directly) |
| `audit_logs` | exactly own rows only (4/4 exact match — not "some," verified precisely) | — | full access | ✅ live impersonation |
| `work_orders` | exactly own rows only (6/6 exact match) | — | full access | ✅ live impersonation |
| `chat_channels` | 0 rows (none are the test account's own) | — | full access | ✅ live impersonation |
| `integration_queue`, `sales_leads` | **untestable — 0 rows exist in production**, nothing to verify against yet | — | — | ⬜ policy correct on paper, unexercised by real data |
| `memories` (confidential row) | **found broken 2026-08-27, then fixed**: pre-fix, 2/2 real confidential rows fully readable (real revenue/cash figures) despite 0/2 access to their `financial_reports` source; post-fix, 0/2 | — | full access | ✅ live impersonation, both before and after the fix — `qa/KNOWN_FAILURE_MODES.md` #11 |
| `safe_companies` / `safe_proposals` views | **found broken 2026-08-27, then fixed**: pre-fix, a test account with ZERO company memberships anywhere saw all 7 companies / 1 proposal via these views (0 via the real `companies` table); post-fix, 0/0 | — | full access | ✅ live impersonation, both before and after — most severe of the three, exploitable with no company membership at all |
| `tasks` (company-wide vs. narrowed) | **found broken 2026-08-27, then fixed**: pre-fix, a plain employee saw the company's full task total regardless of ownership; post-fix, 0 (real total 7, this account created/owns none of them) | — | full access | ✅ live impersonation, both before and after — `qa/ACCEPTANCE_TESTS.md` #4 |

**Root cause behind all three rows just above:** migration `202608230001_security_hardening_rls.sql`
bundled six security tickets back in an earlier session. One of them
(`approvals_update_approver`, `qa/KNOWN_FAILURE_MODES.md` #8) was found and fixed
2026-08-26/27; reproducing a hypothesized `memories` gap surfaced that the *same
migration's* other tickets had also silently not taken effect — a systematic
signature-based diff of all 108 live `public`-schema policies against
`schema-v0.7-production-core.sql` found the memories/tasks policies and both `safe_*`
views' `security_invoker` setting still didn't match the tracked source, despite the
migration showing as applied. All three fixed the same way as #8: a new migration
re-applying the missing pieces, pushed with the founder's explicit authorization, then
independently re-verified live (not just trusted from the push report). See
`qa/KNOWN_FAILURE_MODES.md` #11 for the full trace.

**Important finding, not a leak but worth knowing:** `company_id` is `NULL` on **100% of
the 243 real rows** across `audit_logs` (141), `work_orders` (99), and `chat_channels`
(3) as of this check. This means the `is_company_manager(company_id)` branch added in
migration `202608260024` is currently **inert in practice** — every real row's
visibility is actually governed entirely by `is_founder_or_admin() OR
actor/creator = self`, since the company-scoped branch never has a non-null company_id
to match against. Not a security regression (the policy is still correctly written for
when company_id *is* populated), but it does mean: **a company_manager who is not the
founder currently cannot see any audit trail, work order, or chat history for their own
company** — the intended "manager can review their team's activity" capability doesn't
actually work yet, because nothing populates `company_id` on these tables at creation
time. Worth fixing at the application/RPC layer (set `company_id` from context when a
work order or chat channel is clearly about one company) as a follow-up — flagged here,
not fixed this pass (functional gap, not a security one, lower priority than the actual
leaks fixed tonight).
- `investor_viewer` and `hr_finance` and `holding_admin` personas now tested live — see
  above. `contractor`/`company_manager`/`team_lead` as global `profiles.role` values
  confirmed inert by code search (not live-tested individually, see reasoning above).
- Mobile and EN/MN acceptance tests (CLAUDE.md §15 #17) now run — see
  ACCEPTANCE_TESTS.md #17 (found a real `/chat` mobile bug, `KNOWN_FAILURE_MODES.md`
  #10).

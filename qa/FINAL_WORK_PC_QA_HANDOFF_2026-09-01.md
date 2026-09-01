# WORK-PC QA START HERE

**Test target:**
- `origin/master`: **`9f270fc90d5c00b2ab6d64a6e5b8bcbeb0d3f4a1`** (short `9f270fc`) — "issue #5: long-context harness (50/100/200 turns) + architecture findings"
- **Production deployed app state:** Vercel auto-deploys from `master`, so the deployed web app == `9f270fc`.
- **Production deployed Edge Function state:** `sem-ai-command` content is as of **`16c9251`** (2026-08-30, "Fix: multi_action_plan Defect C corrector's safe summary was never persisted"). This is the last commit on `master` that touched `supabase/functions/**`. **Neither BUG-002 nor issue #5 Class B is deployed.**
- **Production DB migration state:** applied through **`202609010002_fix_investor_viewer_anon_rls_helper_grant.sql`**. Every migration on disk is live; nothing pending.
- `origin/qa/work-pc`: `13b793a` (before this handoff commit)
- Main-PC working tree at handoff time: **clean**

**Date:** 2026-09-01

**Purpose:** Fresh independent Playwright QA after the latest security, multi-org, organization-context, dashboard, archived-ancestry, Brain Chat execution-truth, and Software Factory changes.

**Independent verifier campaign backing this handoff:** `verify-a905df5-multiorg-milestone-independent-recheck`, completed 2026-09-01, base commit `a905df5`. Full record in `qa/verification/CURRENT_CAMPAIGN.json`. It found and fixed one real defect (Board page org-scoping gap) and expanded one disclosed finding's blast radius from 1 table to 5.

---

## Status vocabulary used in this document

`LIVE VERIFIED` · `DEPLOYED — QA RETEST REQUIRED` · `FIX PREPARED — NOT DEPLOYED` · `PARTIAL` · `BLOCKED` · `NOT IMPLEMENTED` · `QA FAILED` · `CLOSED`

Nothing below is called deployed unless production proves it. Where a fix is committed but not in production, it says so explicitly and asks you **not** to retest it as fixed.

---

## 1. BUG-004 — P1 SECURITY — `DEPLOYED — QA RETEST REQUIRED`

**Migrations live in production:**

| Migration | Covers |
|---|---|
| `202608310008_fix_memories_null_scope_bypass.sql` | `memories` `company_id IS NULL` RLS bypass (read + write), `handle_new_auth_user()` rebind hardening |
| `202608310009_invite_only_signup.sql` | invite-only membership: `company_invitations`, `create_company_invitation()`, `accept_company_invitation()`; new signups created inert (`active=false`) |
| `202608310010_same_defect_sweep_null_scope_bypass.sql` | same-defect sweep: 7 further policies |

**Same-defect sweep — exact coverage.** Fixed: `approvals`, `integration_queue`, `product_specs`, `documents`, `engineering_drawings`, and the `product_specs`/`documents` SELECT paths. **`tasks` INSERT/`tasks_update_scope` was deliberately NOT changed** — it is a genuine creator-owns-unscoped-task design question, not an oversight; tracked as canonical Work Order `b9abe2f2-e379-4206-ab64-a9cf7a2488d1`. Treat any `tasks`-scope finding as *expected current behaviour pending a product decision*, not a missed fix.

**Independent verifier result:** PASS on all 6 campaign items (`qa/KNOWN_FAILURE_MODES.md` #52, #56). The verifier found and fixed one follow-on defect itself: `invitePerson()` did not activate the invited profile, so a legitimate founder/admin invite produced a permanently inert account stuck on `/pending-activation` (fixed, commit `033cfa9`).

**Regressions:** `qa/scenarios-runner/null_tenant_scope_bypass_class_closed.sql`, `memories_null_company_scope_not_a_bypass.sql`, `invited_person_lands_active_not_inert.sql`.

**Known limitations, stated plainly:**
- The real end-to-end **email** invite flow (click link in inbox → set password → land active) has never been exercised outside SQL. Only the DB invariant was proven. **This is a genuine Playwright gap and is one of the most valuable things you can test.**
- Brain Chat memory-poisoning protection was verified at the **data layer** (`match_memories()` is SECURITY INVOKER; `sem-ai-command` uses the caller's own JWT with the anon key, never service-role). It was **not** exercised over HTTP with a real session.

**Work-PC must verify (Playwright, real browser):**
1. Public signup → **cannot** gain workspace authority (lands on `/pending-activation`, sees no company data).
2. New/untrusted account → **cannot** create a global (`company_id IS NULL`) memory.
3. Ordinary employee → company-scoped memory only.
4. Founder/admin → explicit global path still works.
5. Brain Chat → a poisoned NULL-scope memory **cannot** enter authorized context.
6. Founder/admin invites a person on `/people` → invited user completes signup → lands **active**, not inert.

---

## 2. Anon RLS helper `is_investor_viewer_of(uuid)` — `LIVE VERIFIED`

**`202609010002_fix_investor_viewer_anon_rls_helper_grant.sql` is live in production.** Confirmed by direct introspection, not migration bookkeeping: `has_function_privilege('anon','public.is_investor_viewer_of(uuid)','EXECUTE')` → `true`.

**This was NOT a data leak. Do not describe it as one.** It was a fail-crash / RLS-helper `EXECUTE` defect: five tables' SELECT policies are `has_company_access(id) OR is_investor_viewer_of(id)`, and `anon` lacked `EXECUTE` on the helper, so Postgres raised `insufficient_privilege` (42501) instead of the predicate simply evaluating to `false`. No anonymous caller could ever see protected rows, before or after. Pre-existing since `202608280004_investor_viewer_scope.sql` (2026-08-28).

**Affected surfaces (5):** `companies`, `goals`, `financial_reports`, `documents`, `memories`.

**Post-deploy proof already run (all PASS):** all 5 tables queried as real `anon` → clean `0` rows, no error; direct helper calls with 3 real company UUIDs + 2 fake UUIDs → uniformly `false` (no enumeration side channel); `investor_viewer_scope.sql` → valid investor keeps intended access; `sc056_cross_company_isolation.sql` → authenticated non-investor still sees 0 cross-company rows; `factory_rpc_privilege_sweep.sql` → founder/admin path intact; `privileged_rpc_anon_public_grant_sweep.sql` → `unexpected_new_violations: []`, confirming the generic sweep treats this as a legitimate RLS-helper exception and will not revoke it again.

**Regression:** `qa/scenarios-runner/is_investor_viewer_of_anon_grant_fix.sql` (asserts the real persistent grant, so a future revocation fails loudly).

**Work-PC action:** low priority — already live-verified end to end at the DB layer. Optionally confirm no anonymous/logged-out route in the app throws a 500 on these five surfaces.

---

## 3. BUG-003 — P2 Dashboard company count — `DEPLOYED — QA RETEST REQUIRED`

**Fix:** `web/app/(app)/dashboard/page.tsx` now applies `.neq("status","archived")`, byte-matching `getCompanies()`'s own definition. Label changed to **"Active Companies"** so the figure is self-describing. Commit `36526af`.

**Independent verifier result:** PASS (`#57`). A fresh, independently-written live query returned `total=18, non_archived=8, archived=10` — matching the originally-reported split exactly.

**Note:** the Dashboard was later also org-scoped (goals/approvals/runs counts) as part of the multi-org milestone. **"Active Companies" is deliberately NOT org-scoped** — it is a global platform figure; a single org's context cannot meaningfully redefine it. That is intentional, not a scoping miss.

**Work-PC retest:** create company → archive → restore → archive parent → reload → realtime update. Assert `Dashboard count == /companies page semantics == Brain Chat company-state truth`.

---

## 4. BUG-001 — P2 archived ancestry — `PARTIAL`

**Do not treat this as closed.** Precise current state:

- **Fixed surfaces: 3 of ~24 known.** `web/lib/data/departments.ts`, `web/lib/data/people.ts` (both now select `companies(name, status)`), plus their two tables rendering the shared badge.
- **Canonical shared component introduced:** `web/components/archived-company-badge.tsx` — reusable, so the remaining surfaces do not each need bespoke markup.
- **Remaining: ~18 surfaces** still selecting bare `companies(name)` with no status. Independently re-grepped by the verifier: exactly the same 18 files, no more, no fewer.
- **Open Work Order:** `9016651a-b7c7-4dea-be33-06fbd621b8e0` (real canonical row, queued, naming that exact scope).

**Live blast radius at last check:** 2 real tasks and 1 real goal are currently attached to archived companies with **no archived indication** — `tasks.ts` and `goals.ts` are 2 of the unfixed 18. This is real today, not hypothetical.

**Rule to apply while sweeping:** `planning` / `paused` **≠** `archived`. An archived *ancestor* means the descendant must not appear normally active/selectable.

**Work-PC sweep:** People, Departments (both fixed — expect PASS), then Projects, Goals, Tasks, pickers, organization selectors, assignments, dashboard summaries, Brain grounding (all expected to still show the defect).

---

## 5. Multi-org / own company — backend `LIVE VERIFIED`, UI `PARTIAL`

**`202609010001_create_own_company.sql` is live in production** (function body + grants confirmed by direct introspection; `EXECUTE` to `authenticated` only, `anon`/`public` correctly absent).

**Verified model:** one auth identity → multiple organization memberships; employee of Organization A **and** founder/admin of personal Organization B, with no authority leakage in either direction.

**Live isolation acceptance test run against production** (`qa/scenarios-runner/sc081_create_own_company_full_isolation.sql`), 5 personas × 8 surfaces, re-run independently by the verifier with identical results: creator becomes sole owner; employer membership untouched; **no** subsidiary/`company_relationships` row created; **no** manager authority gained at the employer; unrelated coworker, real employer-level manager, unrelated third-company user, and anon all see **0 rows** across company record, memberships, people, projects, tasks, goals, memories, documents.

| Item | Backend | UI | Status |
|---|---|---|---|
| `create_own_company()` | live | "Create organization" (+) in sidebar | `DEPLOYED — QA RETEST REQUIRED` |
| Organization selector | live (httpOnly cookie, server-revalidated) | sidebar switcher | `DEPLOYED — QA RETEST REQUIRED` |
| Active organization context | live | — | `LIVE VERIFIED` |
| Dashboard scoping | live | live | `DEPLOYED — QA RETEST REQUIRED` |
| People / Projects / Tasks / Goals / Documents / Memories / KPI scoping | live | live | `DEPLOYED — QA RETEST REQUIRED` |
| **Board scoping** | live | live | `DEPLOYED — QA RETEST REQUIRED` — **found unscoped by the independent verifier and fixed** (`8ddb0ee`); it was the only one of the 8 surfaces missed |
| Brain Chat org awareness | **not implemented** | — | `NOT IMPLEMENTED` (requires Edge Function change, gated) |
| search / entity resolution scoping | **not implemented** | — | `NOT IMPLEMENTED` (same gate) |

**Backend complete vs UI incomplete — be explicit:** every scoped *page* is real and non-decorative. **Brain Chat and entity resolution are NOT org-aware**; Brain Chat will still resolve entities across all organizations the caller can access. That is a known gap, not a bug to file.

**Work-PC scenarios:**
1. Employee in SEM LLC → create personal QA company → becomes founder there.
2. Switch to employer → employer role unchanged.
3. Switch to personal company → private data visible there.
4. Employer admin → **cannot** inherit access to the personal company.
5. Personal-company founder role → **cannot** escalate SEM LLC permissions.
6. Reload → selector/context persists correctly.

---

## 6. Manager relationships — `PARTIAL`

**Implementation:** `/people` has a **Manager** column, resolved **per organization** from `person_assignments` (matched on `operating_company_id == person.company_id`), deliberately **not** the legacy global `people.manager_person_id` field. Commit `a905df5`.

**Independent verifier result:** PASS, with real fixtures. Production has **0 of 4** `person_assignments` rows with `manager_person_id` set and **0 of 16** people with the legacy field set — so the column has never been exercised against real data and currently renders `—` for everyone. The verifier therefore built `qa/scenarios-runner/sc082_manager_column_cross_company_isolation.sql` and proved a real impersonated employee resolves their own company's manager and **cannot** see another company's assignment row even when queried by exact `person_id` (RLS-enforced, not merely un-asked-for).

**Known limitation:** there is **no UI to set a manager**. The column is read-only. Expect `—` everywhere until manager data exists — that is a data/UX gap, not a defect to file.

**Work-PC should verify:** "Who is X's manager in SEM LLC?" / "Who reports to X in organization B?" — no cross-org manager contamination. Same person may be an employee-with-a-manager in Employer A and top-level in Personal Company B.

---

## 7. BUG-002 — P1 false success — `FIX PREPARED — NOT DEPLOYED`

**Reconciled: still not deployed.** Fix lives on branch `pending/bug-002-edge-function-chat-fabrication-fix` (local to Main-PC; the `.githooks/pre-push` guard correctly blocks pushing `supabase/functions/**` without `ALLOW_FUNCTIONS_DEPLOY=1`, and that authorization has not been given).

**Do NOT retest this as fixed.** Production Brain Chat still exhibits the original defect.

Unit tests: 13/13 PASS (`qa/scenarios-runner/sem_ai_command_past_completion_claim_regex.mjs`, runnable with plain `node`). Behavioural spec ready for the moment it deploys: `qa/scenarios-runner/chat_must_not_fabricate_approval_decision.md`.

**Original defect:** entity resolution succeeds **+** executable operations = 0 → Brain fabricated success. Confirmed on approvals, departments, projects.

**Required invariant:** requested mutation → resolved entities → executable operation → backend execution → postcondition → final response. **If zero operations executed: no success language.**

---

## 8. GitHub issue #5 Class B — `FIX PREPARED — NOT DEPLOYED`

**Reconciled: not deployed.** Fix on branch `pending/issue-5-confirmation-action-type-binding`, queued behind the *same* Edge Function authorization as BUG-002 (both ship in one push). **Do not tell QA it is ready for fixed-behaviour retest — the destructive path is still live in production.**

**Exact founder reproduction (still reproducible today):**
```
"Rename the project ... to QA-RENAMED-PROJECT"      -> renamed
"create new employee 10"                            -> "Which company?"
"what companies do i have?"                         -> lists QA-SWARM-TEST-CO-VIA-CHAT as active
"add employee 10 to qa swarm test"                  -> "Did you mean QA-SWARM-TEST-CO-VIA-CHAT?"
"yes"                                               -> "QA-SWARM-TEST-CO-VIA-CHAT: archived."   <-- WRONG
```

**Root cause (architectural, confirmed by code read):** `pendingAction.actionType` is typed `archive | restore | null`. An *assign* clarification has no representable value, so it is necessarily emitted **absent**. Both deterministic-execution call sites then resolved the field as `actionType || 'archive'` — coercing absence into the most destructive operation available for that entity type. A bare `"yes"` passes the affirmative check and the existing contradiction guard cannot help (it contains neither verb family).

**Class B fix:** single fail-closed `resolveClarificationField()` — both `entityType` and `actionType` must be explicitly present and known, else it returns `undefined` and the turn falls through to the ordinary LLM path instead of mutating. Legitimate archive/restore confirmations set `actionType` explicitly and are unaffected. Unit test 10/10: `qa/scenarios-runner/issue5_confirmation_action_type_binding.mjs` (plain `node`, no deploy/DB/network).

**Work-PC is the final Playwright acceptance authority for this issue.** Please run the exact transcript above against the *current deployed* build to preserve baseline evidence of the destructive behaviour, then again after deployment.

---

## 9. Issue #5 Classes A / C / D / E — `NOT IMPLEMENTED / ARCHITECTURE GAP`

**Class B does not solve these.** Current architecture, verified by code inspection:

| Element | State |
|---|---|
| structured pending action | **last-turn `work_orders.output` only** |
| canonical target IDs | `resolvedEntities`, **last turn only** |
| source turn IDs | **absent** |
| expected confirmation type | **absent** |
| channel/session binding | present (since 2026-08-31) |
| compaction | **none** |
| history retrieval | hard **`limit(8)`** |
| persisted history payload | `{command, summary}` — **no canonical IDs** |

**Long-context harness results** (`qa/scenarios-runner/issue5_long_context_harness.sql`, self-cleaning, run against production):

| Turns | Visible to next turn | % visible | First turn reachable | Canonical IDs in window |
|---|---|---|---|---|
| 50 | 8 | 16% | no | 0 |
| 100 | 8 | 8% | no | 0 |
| 200 | 8 | 4% | no | 0 |

A clarification older than ~2 turns is unreachable; canonical IDs do not survive the window.

**Two honesty notes:**
- 401 of 428 lifetime `work_orders` rows have `channel_id IS NULL`, but these are **legacy** (pre-2026-08-31, before channel binding shipped). Every turn on 8-31 carried a real `channel_id`. These are **not** the cause of current history loss.
- The longest real production channel to date is **7 turns** — just under the `limit(8)` window — so **this truncation has never actually fired in production**. It is guaranteed to at 50+ turns.

**Work-PC should NOT attempt to certify this closed.** Run baseline/adversarial tests and preserve evidence. Failures here are expected architecture limits, **not** Work-PC regressions.

**Required future design (not built):** structured `channel_state` with `source_turn_id`, pending action, action type, canonical target IDs, expected confirmation, expiry, session/channel binding, recent typed focus, last successful mutation, compaction-safe summary. This needs a new migration and has not been designed or authorized.

---

## 10. Software Factory — `LIVE VERIFIED` (milestone), debt open

Milestone **`E2E VERIFIED — CAPABILITY-ROUTED BEEHIVE EXECUTION`** stands, independently confirmed (campaign `verify-0f5ace8-phase5-beehive-dag`): real 4-task branching/fan-in DAG, capability-routed dispatch, genuinely overlapping parallel `agent_runs`, dependency gating, failed-branch blocks fan-in, stale worker detected once with no duplicate notification, scheduler cold-restart produces zero duplicate runs. All 7 specialist agents audited; Product Architect and Release Operator dispatchability bugs fixed (`permissionMode: auto` missing from frontmatter); cross-machine `definition_hash` fragility fixed via `.gitattributes` (`*.md text eol=lf`).

**Disclosed debt — both still OPEN, not fixed:**
- `FACTORY_SCHEDULER_WIRE_PERMANENTLY_BLOCKED_DETECTION` — `isTaskPermanentlyBlocked` is defined and tested but never called from `dispatchReadyTasks`. Dispatch *behaviour* is correct via `isTaskReady`, but `tasks.status` cannot distinguish "waiting" from "permanently blocked".
- `FACTORY_SCHEDULER_STALE_RUN_AUTO_RECOVERY` — no automatic retry/re-queue for a `STALE` Agent Run anywhere; recovery is manual.

---

## 11. Plugin / Worker management — `PARTIAL`

**Infrastructure live:** `plugin_component_versions` (8 rows, real append-only history), `plugin_operation_requests` (0 queued), `factory_workers` (1 registered worker), `workers_with_live_status` view, Plugin Management Console (`/software-factory/plugins`, `/[id]`), Workers Console (`/software-factory/workers`).

**Actual component state — real DB truth, nothing faked:**

| Component | install_status | enabled | Health |
|---|---|---|---|
| `verification-before-completion` (obra/superpowers) | `enabled` | true | attached, real runtime use proven |
| `systematic-debugging` (obra/superpowers) | `enabled` | true | attached, full lifecycle proven |
| `task-observer` (rebelytics) | `enabled` | true | produced a real improvement observation |
| `claude-code-setup` (anthropics) | `enabled` | true | produced a real repo-specific recommendation |
| **Claude-Mem** | — | — | **NOT REGISTERED** — never entered the registry |
| **Headroom** | — | — | **NOT REGISTERED** |
| **OmniRoute** | — | — | **NOT REGISTERED** |

Active attachments: 4. The last three components were named in the plan but **no sandbox/evaluation work reached the registry**; do not treat them as discovered/quarantined — they are simply absent.

**Work-PC action:** verify the Console shows exactly the 4 real components above with truthful status, and that no fake ONLINE/INSTALLED badge appears for the 3 absent ones.

---

## 12. Model reliability — `PARTIAL / ACTIVE INVESTIGATION`

**No model-health registry has been implemented.** Diagnostics only.

Configured in `ai_providers` (6 rows, 1 active):

| Provider | Model ID | Active | Tested? | Result |
|---|---|---|---|---|
| anthropic | `claude-haiku-4-5` | **yes** | in production use | working |
| anthropic | `claude-sonnet-5` | no | **not tested** | key is Edge-Function-only; untestable locally |
| anthropic | `claude-sonnet-4-6` | no | **not tested** | same |
| openai | `gpt-5-mini` | no | **tested** | **`401 invalid_api_key`** |
| openai | `gpt-5.6-sol` | no | **tested** | **`401 invalid_api_key`** |
| openai | `gpt-5.6-luna` | no | **tested** | **`401 invalid_api_key`** |

**Concrete finding:** the `OPENAI_API_KEY` present in the deployment env is rejected outright by OpenAI (`401`, AUTH class) — this is a single credential problem, not three per-model problems. The Anthropic non-Haiku models **could not be tested**: `ANTHROPIC_API_KEY` is an Edge-Function-only secret with no local copy, and testing live would require toggling the production provider row, which was **not** authorized. **No secrets are reproduced in this document.**

**Fallback observability: not implemented.** There is currently no record of requested-vs-actual model. Treat any claim that a non-Haiku model ran as unverified.

**Work-PC action:** test the model selector/UI and observable actual model usage **against already-deployed state only**. **Do not toggle production provider configuration.**

---

## 13. Messaging (Slack / Telegram / WhatsApp / Messenger / Viber) — `NOT IMPLEMENTED / UPCOMING`

No canonical channel schema, no adapters, no identity mapping, no webhook handling, no management UI. **Nothing exists to test — do not spend QA time here.**

Product rule for when it is built: **no new proprietary messenger.** Brain OS is the canonical intelligence/control layer *behind* existing channels; those channels are transports.

---

## 14. Work-PC QA campaign order

**P0 — SECURITY RETEST**
1. BUG-004 · 2. anon RLS helper · 3. signup/invite · 4. global memory poisoning · 5. cross-org isolation

**P1 — DESTRUCTIVE / EXECUTION TRUTH**
6. Issue #5 exact transcript (**baseline evidence — fix NOT deployed**) · 7. BUG-002 **(skip — not deployed)** · 8. pending confirmation · 9. zero-executed-operation false success · 10. archive/restore action binding

**P2 — MULTI-ORG / TEAM READY**
11. own-company creation · 12. organization selector · 13. manager relationships · 14. cross-org RLS · 15. dashboard org scoping · 16. Board/Goals/Projects/Tasks scoping

**P3 — CRUD / UI ↔ AI PARITY**
17–26. Company edit/rename, Business Unit CRUD, Person edit, employment reassignment, Projects, Goals, Tasks, field-by-field edits, archive/restore, cascades

**P4 — EXPLORATORY**
27–36. long-channel conversation, navigation away/back, hard reload, ambiguous entity names, archived+active similar names, `yes`, `do it`, `that company`, `this employee`, multi-action commands

---

## 15. Real Playwright requirement

Use actual browser behaviour, not only RPCs: click, type, select, dialogs, navigation, reload, logout/login, multiple contexts, org switching, Brain Chat, permissions.

Failure evidence must include: screenshot, trace, URL, commit under test (`9f270fc`), persona, canonical IDs where safe, expected, actual.

**Long-context QA:** explicit 50 / 100 / 200-turn tests. Do not burn tokens making every turn expensive — use controlled low-cost turns with periodic important actions. At checkpoints verify `CHAT HISTORY == STRUCTURED CHANNEL STATE == DB TRUTH == UI TRUTH == FRESH BRAIN QUERY`, and record where continuity breaks. Until channel-state/compaction architecture exists, this is **expected** to expose limitations — do not log those as Work-PC regressions.

---

## 16. QA release rule

Work-PC may return **`QA FAILED`** even if unit tests passed, the independent verifier passed, and implementation reported complete.

Release-ready for critical user/team workflows requires **all three**:
`IMPLEMENTATION VERIFIED` **+** `INDEPENDENT VERIFIER PASSED` **+** `WORK-PC HUMAN QA PASSED`.

Bug closure authority remains exclusively Work-PC's. Main-PC has not set any status in `qa/BUG_QUEUE.json`; fix reports are published under `qa/home-pc-handoff/fixes/` per `qa/IMPLEMENTATION_HANDOFF.md`.

---

## 17. FINAL HANDOFF TABLE

| Surface | Severity | Implementation | Production | Independent Verifier | Work-PC Action |
|---|---|---|---|---|---|
| BUG-004 (null-scope security) | P1 | Complete | **Deployed** | PASS (#52/#56) | **Retest first (P0)** |
| BUG-002 (false success) | P1 | Complete, 13/13 unit | **NOT deployed** | not run | **Do not retest** |
| BUG-003 (dashboard count) | P2 | Complete | **Deployed** | PASS (#57) | Retest |
| BUG-001 (archived ancestry) | P2 | **3 of ~24 surfaces** | Deployed (partial) | PASS on the 2 disclosed | Sweep remaining 18 |
| Issue #5 Class B (destructive confirm) | P1 | Complete, 10/10 unit | **NOT deployed** | not run | **Baseline evidence only** |
| Issue #5 A/C/D/E (continuity) | P1 | **Not implemented** | n/a | n/a | Adversarial baseline, do not certify |
| Multi-org backend | — | Complete | **Deployed** | PASS | Retest |
| Own company (`create_own_company`) | — | Complete | **Deployed** | PASS | Retest |
| Organization selector | — | Complete (8 surfaces) | **Deployed** | PASS + fixed Board gap | Retest |
| Manager relationships | — | Read-only, no set-UI | **Deployed** | PASS (fixtures) | Retest, expect `—` |
| Investor RLS helper | — | Complete | **Deployed** | PASS | Low priority |
| Plugin Console | — | Complete | **Deployed** | PASS (Phase 6) | Verify truthful status |
| Worker Registry | — | Complete (1 worker) | **Deployed** | PASS | Verify |
| Factory Beehive | — | Complete, 2 debts open | **Deployed** | PASS | Optional |
| Models | P1 ops | **Diagnostics only** | n/a | not run | UI only, **no toggling** |
| Messaging | — | **Not implemented** | n/a | n/a | **Skip entirely** |

---

## 18. Not ready for retest — explicit list

- **BUG-002** — fix not deployed.
- **Issue #5 Class B** — fix not deployed (baseline evidence welcome).
- **Issue #5 A/C/D/E** — architecture not built.
- **Brain Chat org awareness / org-scoped entity resolution** — not implemented.
- **Model health registry / fallback observability** — not implemented.
- **Messaging adapters** — not implemented.
- **BUG-001's remaining ~18 surfaces** — not fixed (finding them again is expected).
- **Manager set-UI** — does not exist.

Both Edge Function fixes (BUG-002 + Issue #5 Class B) are queued behind a single `ALLOW_FUNCTIONS_DEPLOY=1` authorization and will ship together.

# FACTORY V1 — Work-PC Independent Acceptance

**Authority:** INDEPENDENT FACTORY V1 VERIFICATION AUTHORITY  
**Date:** 2026-09-14  
**Canonical QA branch:** `qa/work-pc`  
**Acceptance state:** **NOT ACCEPTED — multiple Factory V1 exit criteria fail in durable committed infrastructure**  
**Implementation boundary:** verification/evidence only; no product/Factory implementation fixes from this seat.

**Executed-evidence update:** section 13 (2026-09-14, harness `qa/factory-acceptance/`, 55 provenance-bound checks on `origin/master@55a1591…` and `origin/p1/control-plane-phase0@dcc0d9c…`)  
## 0. Scope and provenance

| Item | Value |
|---|---|
| Work-PC durable state recovered from | `qa/work-pc@157174d791c4b80b6605d3b105cf64f023ba3bfe` |
| Factory source independently audited | `p1/control-plane-phase0@dcc0d9c554e8ddbba27b9aabfdc6be94a81c2baf` |
| Historical verifier infrastructure inspected | `p1/execution-truth-governance@26c0f3ea47030c7d245f0ec7091529e8af2f87c2` |
| Home-PC blocker handoff | `qa/home-pc-handoff/HOMEPC-2026-09-14-FACTORY-V1-BLOCKERS.md` |
| Active v99/#99 campaign | **EXCLUDED. Not modified, authored, rerun, merged, certified, or closed by this acceptance.** |

Evidence levels in this report are intentionally explicit. A source/CI proof is not promoted into a machine-runtime or multi-node proof.

---

## 1. Repository / handoff reconciliation

### PASS — Work-PC historical state preserved

Recovered durable Work-PC state still says:

- **BUG-036 = P1 OPEN**
- **BUG-037 = P2 OPEN**
- **BUG-035 = separate**
- supervisor state = **WAITING_FOR_HOME_PC**
- Phase B = **BLOCKED — AUTH_EMAIL_DELIVERY_UNAVAILABLE**
- production invite/signup retest is prohibited until explicit Home-PC handback with known deployed WEB SHA
- production SQL = **PRODUCTION_SQL_PROHIBITED_ON_WORK_PC**

No invitation/signup attempt was made in this Factory V1 acceptance.

### PASS — implementation/verifier independence preserved

This pass did not modify:

- Factory implementation bytes;
- the active Home-PC Edge candidate;
- v99/#99 worktree/campaign;
- migrations;
- production;
- Home-PC implementation branches.

Only Work-PC QA/handoff artifacts are written by this authority.

---

## 2. Factory Director — independent acceptance

### FAIL — FV1-001: `FOUNDER_POKE_NOT_REQUIRED`

**Invariant:** the Factory Director is persistent, durable, and advances work without an interactive founder/Claude session.

**Reproduction:** inspect the committed Director/runner path at `p1/control-plane-phase0@dcc0d9c...`.

**Evidence:**

- `scripts/factory-runner/poll-and-dispatch.mjs` explicitly describes itself as a **manually-invoked poll**, **not a continuously-running daemon**, and says real always-on scheduling is future infrastructure work.
- `scripts/factory-runner/supervisor.mjs` is a retry supervisor for provider-capacity-blocked Agent Runs, not the persistent top-level Director.
- the Director definition still contains machine-specific local assumptions.

**Severity:** P1 — Factory V1 release blocker.  
**Exit criterion affected:** persistent Director / no founder poke.  
**Home-PC handoff:** `HOMEPC-2026-09-14-FACTORY-V1-BLOCKERS.md#fv1-001`.

Subcriteria consequently not accepted as Factory-V1 runtime properties:

| Subcriterion | Verdict |
|---|---|
| Director survives interactive Claude session ending | **FAIL** — no persistent top-level Director loop in audited implementation |
| completed worker artifact detected automatically | **BLOCKED — HOME PC** — must be retested after persistent Director exists |
| next Work Order auto-dispatches | **FAIL** — current top-level polling is manual |
| restart reconstructs state | **BLOCKED — HOME PC** |
| finished work not repeated | **BLOCKED — HOME PC** |
| duplicate run prevented | **PARTIAL PASS** at DB claim primitive only; not an end-to-end Director PASS |
| blocked Work Order does not halt unrelated work | **BLOCKED — HOME PC** |
| provider/process failure preserves durable checkpoint | **PARTIAL PASS** at retry/checkpoint component; full Director chain not accepted |

---

## 3. Factory control-plane security audit

### PASS — canonical least-authority accessor primitives

Independent source inspection of `scripts/factory-runner/db.mjs` confirms:

- `FACTORY_RUNNER_PG_URL` is explicit;
- absent URL fails closed;
- that module does not fall back to ambient linked Supabase state;
- `postgres`, `supabase_admin`, and `postgres.<project-ref>` users are refused;
- read path refuses mutations;
- DDL / privilege changes / migration history / TRUNCATE / SET ROLE / SECURITY DEFINER definitions are refused.

Independent GitHub Actions materialized evidence at head `dcc0d9c...`:

- job **101635138152**, “controls (pure, no credentials)” = **SUCCESS**;
- the step “factory accessor — DML only, DDL refused, no fallback to ambient authority” = **SUCCESS**.

### FAIL — FV1-002: the Factory as a whole bypasses the canonical accessor

Independent GitHub Actions evidence:

- job **101635138064**, “factory workers carry no ambient production DB authority” = **FAILURE** on `dcc0d9c...`.
- its committed inventory gate states **ten** Factory scripts remain `PRODUCTION_WRITE`.

Directly inspected violating paths include:

- `scheduler.mjs`
- `poll-and-dispatch.mjs`
- `dispatch-task.mjs`
- `complete-run.mjs`
- `supervisor.mjs`
- `provider.mjs` registry DB lookup

These invoke `supabase db query --linked` rather than the explicit least-privilege Factory connection.

`complete-run.mjs` additionally injects a hard-coded founder UID into `request.jwt.claims` before calling the completion RPC.

**Severity:** P1 — security/control-plane release blocker.  
**Exit criterion affected:** generic node zero production-write authority.  
**Home-PC handoff:** `HOMEPC-2026-09-14-FACTORY-V1-BLOCKERS.md#fv1-002`.

### Verdict by requested invariant

| Invariant | Verdict |
|---|---|
| `FACTORY_RUNNER_PG_URL` explicit | **PASS** for canonical accessor |
| absent URL fails closed | **PASS** for canonical accessor |
| ambient `SUPABASE_ACCESS_TOKEN` cannot become Factory authority | **FAIL** overall — linked CLI bypass remains |
| ambient `SUPABASE_DB_URL` cannot become fallback authority | **PASS** in `db.mjs`; **FAIL** overall least-authority objective because bypass paths exist |
| superuser/admin connection rejected | **PASS** in `db.mjs`; **FAIL** overall — retry supervisor design explicitly accepts direct privileged connection |
| generic node zero production-write authority | **FAIL** |
| control-plane schema cannot reference Brain OS business tables | **FAIL** in current audited architecture — Factory orchestration directly reads/writes Brain OS `public` tables |
| business IDs opaque references by value | **FAIL** as a control-plane separation property in current architecture |
| possessing an ID cannot bypass tenant/business auth | **FAIL** while generic runner paths retain direct privileged SQL authority |

A passing primitive does not cancel a failing alternate path.

---

## 4. Work Order / lease / recovery acceptance

### PASS — disposable PostgreSQL double-claim primitive

GitHub Actions run **34087815895**, head `dcc0d9c...`, independently materialized a real PostgreSQL validation job. Job **101635138578** completed successfully and includes:

- prove engine is real and non-production;
- full migration chain;
- behavioral acceptance;
- RLS persona enforcement;
- **double-claim under genuine concurrency (real PostgreSQL, two connections)**.

This is accepted as evidence for the narrow atomic-claim primitive.

### BLOCKED — FOUNDER: real two-node lease/takeover campaign

The requested real topology test requires a shared **NON-PRODUCTION PostgreSQL** control plane reachable by both machines with generic-node credentials. No such connection has been supplied to this acceptance authority.

Do **not** substitute production.

### Prepared exact multi-node acceptance

Use the normal configured lease duration; do **not** shorten it for convenience.

1. Create one synthetic Factory Work Order in the shared non-production control plane.
2. NODE A claims it through the generic-node path.
3. NODE A materializes:
   - source/candidate provenance;
   - scenario denominator;
   - completed evidence for at least one scenario;
   - remaining scenario list;
   - heartbeat + lease identity.
4. Kill NODE A / stop heartbeat without a clean release.
5. NODE B polls before lease expiry and **must not claim**.
6. Wait the legitimate lease expiry.
7. NODE B automatically discovers the abandoned Work Order; no founder assignment.
8. NODE B claims it atomically.
9. NODE B reconstructs the exact Work Order/candidate/denominator from durable state.
10. NODE B reuses only completed evidence bound to the same source identity.
11. NODE B runs only remaining work.
12. Assert no duplicate scenario evidence and no second completion side effect.
13. Restart NODE B supervisor/Director and prove reconstruction again.
14. Introduce a conflicting-surface Work Order and prove mutual exclusion.
15. Introduce an unrelated blocked Work Order and prove it does not halt unrelated eligible work.
16. Race NODE A and NODE B for one eligible claim; exactly one wins.
17. Change source identity and prove previous partial certification is invalidated.

Required evidence bundle: claim rows, lease timestamps, heartbeat trail, checkpoint hash, scenario IDs, exact source SHA, run IDs, node role/capability identity, and final non-duplicated result.

---

## 5. Role-based independence

### FAIL — FV1-003: authoring and certification are not structurally distinct

**Invariant:** `AUTHORING RUN != CERTIFYING RUN`.

Current durable completion model accepts caller-supplied verification status:

- `complete_agent_run(... p_head_commit, p_verification_status ...)` writes those values.
- `complete_work_order` consumes the resulting verification fields but does not prove a distinct certifying run.
- `complete-run.mjs` accepts `verificationStatus` from its CLI caller and reaches the RPC through the privileged linked path.

No materialized relation was found that binds an immutable certification to:

`work_order + candidate provenance + authoring_agent_run + distinct certifying_agent_run + verifier capability/role + verifier provenance`.

**Severity:** P1 — release-integrity blocker.  
**Exit criterion affected:** role-based independence.  
**Home-PC handoff:** `HOMEPC-2026-09-14-FACTORY-V1-BLOCKERS.md#fv1-003`.

### Negative-case status

| Negative case | Verdict |
|---|---|
| same run attempts certification | **FAIL — not structurally prohibited by current model** |
| same authoring provenance presented as independent | **FAIL — no distinct certification relation observed** |
| verifier role forged in payload | **FAIL/UNPROVEN — certification authority is not derived from a durable certifier relation** |
| stale verifier identity | **BLOCKED — HOME PC** pending replacement model |
| node restart | **BLOCKED — HOME PC** pending replacement model |
| different physical node, same authoring run | **FAIL conceptually** — hostname difference does not establish independent run |
| same physical node, genuinely independent run where policy permits | **BLOCKED — HOME PC** until the role/provenance policy is materialized |

**Work-PC machine restrictions remain in force.** This report does not authorize retiring them.

---

## 6. QA evidence infrastructure

The historical independent-verifier system contains useful mechanisms, but Factory V1 requires them as reusable invariants rather than campaign-specific convention.

| Requirement | Verdict | Independent evidence |
|---|---|---|
| round-state derivation | **FAIL** | no generic derived round-state contract identified in committed Factory infrastructure |
| candidate freeze integrity | **PASS** for the historical verifier mechanism | isolated worktree pinned to exact candidate; watchdog re-hashes before retry; campaign 119 records frozen candidate SHA/hash |
| `measured == applied == frozen == rebuilt` | **BLOCKED — HOME PC** | active candidate explicitly out of scope; no generic four-way gate identified |
| immutable certification evidence | **PASS** for historical verifier artifacts | verifier artifacts and candidate identity are committed/materialized |
| atomic publishing | **FAIL** | certification bundle is written as multiple artifacts; watcher infers completion from a final report artifact, not an atomic bundle publication primitive |
| QA denominator cannot shrink silently | **FAIL** | no durable generic denominator manifest/gate identified |
| forgiveness derives from current failing truth | **FAIL** | no generic machine-enforced rule identified |
| slow vs stalled vs dead verifier | **FAIL** | watchdog classifies provider/mode failures and watcher detects dead PID, but a complete slow/stalled/dead state model is not materialized |
| native PID vs MSYS PID | **FAIL** | current Bash/nohup watcher records shell PID and uses `kill -0`; no native-Windows PID binding proof found |
| waiting does not peg CPU | **PASS** | watcher/watchdog use `sleep` between polls/backoff |
| six-level instrument validator | **FAIL** | no committed Factory V1 validator implementing this contract was identified |
| comments are not state | **PARTIAL PASS** | production-write inventory strips comments before classification; prior verifier history also records comment-matching test defects being corrected. Not yet a global Factory invariant. |
| certification cites only materialized artifacts | **PASS** for historical watcher | `watch-verifier-artifacts.sh` explicitly treats durable artifacts as the verdict signal and refuses to infer verdict from process exit |

### FAIL — FV1-004: reusable evidence contract incomplete

**Severity:** P2 overall; any demonstrated certification bypass escalates to P1.  
**Exit criterion affected:** Factory V1 trustworthy certification substrate.  
**Home-PC handoff:** `HOMEPC-2026-09-14-FACTORY-V1-BLOCKERS.md#fv1-004`.

---

## 7. Real multi-node acceptance readiness

### PASS — Work-PC side acceptance protocol prepared

The test protocol is defined in §4 and does not require production DB access.

### BLOCKED — FOUNDER

Only when actual execution is desired: supply/authorize the shared **non-production** PostgreSQL endpoint and generic-node credentials to both nodes.

Requirements on that endpoint before Work PC joins:

- disposable/non-production proof;
- Factory-only role;
- no Supabase production control-plane authority;
- no Brain OS business-table write authority;
- no founder/service-role/superuser credential;
- same Factory V1 schema revision on both nodes.

No founder manual assignment is part of the takeover test.

---

## 8. BUG-036 / BUG-037 retest preparation

### PASS — preparation only

Production invitation/signup remains untouched.

Future re-entry still requires:

`READY_FOR_INDEPENDENT_WORK_PC_RETEST = true`

plus an exact deployed WEB SHA from Home PC.

Prepared serial W1 evidence sequence:

1. **INVITE** — record exact terminal product state.
2. **ACTUAL EMAIL RECEIPT** — human confirms the controlled mailbox received the invitation; no mailbox credential is stored on Work PC.
3. **AUTH** — founder enters OTP/required secret directly when prompted.
4. **ACCEPT INVITATION** — exact invitation identity and org bound.
5. **MEMBERSHIP** — product UI shows active membership.
6. **TENANT ISOLATION** — QA identity sees only authorized synthetic org.
7. **ROLE** — exact invited role equals resulting role.
8. **RELOAD** — identity/org state remains correct.
9. **LOGOUT / REAUTH** — same scope restored, no founder fallback.
10. A8 preflight = `AUTH_OK`.
11. Capture terminal error state if any step fails; no repeated blind retries.

Fixtures stay preserved:
- `QA-W1-ORG`
- `QA Worker 1`

No W2/W3 bootstrap until W1 independently passes.

---

## 9. Low-cost provider acceptance

### FAIL — FV1-005: implementation prerequisites missing

No DeepSeek adapter was found in durable Factory source/commit history. The Factory provider is Claude-Code-specific.

The legacy `js/core/tokenBudget.js` has deterministic routing including a `no-llm` path for small filter/count/status work, but it is not wired into the Factory execution provider and is not accepted as Factory Tier-0.

| Requirement | Verdict |
|---|---|
| deterministic Factory Tier-0 bypass | **FAIL** |
| DeepSeek adapter | **FAIL** |
| requested vs actual model | **PARTIAL PASS** — schema/source fields exist; end-to-end Factory recording not accepted |
| no silent fallback | **PASS** in current Claude provider policy |
| tool-call completion | **BLOCKED — HOME PC** until DeepSeek adapter exists |
| structured output | **BLOCKED — HOME PC** |
| cost accounting | **FAIL** for Factory runtime |
| budget enforcement | **FAIL** for Factory runtime |
| retry/checkpoint | **PASS/PARTIAL** for current Claude capacity/transient path; not proven provider-generic |
| escalation to stronger model | **FAIL** |
| independent verification policy | **FAIL** until FV1-003 closes |

**DeepSeek API key is not the only blocker.** Do not ask the founder for a key yet.

**Severity:** P2 — Factory V1 cost/reliability exit blocker.  
**Home-PC handoff:** `HOMEPC-2026-09-14-FACTORY-V1-BLOCKERS.md#fv1-005`.

### Prepared future adapter acceptance

When Home PC lands the adapter:

- deterministic Tier-0 input must produce **zero provider call**;
- DeepSeek request must record requested provider/model before dispatch;
- successful response must record actual provider/model separately;
- mismatch requires explicit fallback/escalation reason;
- tool call must reach terminal tool result, not model text claiming execution;
- structured schema invalid response must fail/retry, never silently coerce;
- exact token/cost usage must bind to Agent Run;
- budget exhaustion must block before uncontrolled spend;
- transient/provider failure must checkpoint and resume;
- escalation must be policy-driven and visible;
- certifying run must be independent under FV1-003;
- only after all code paths exist does a missing DeepSeek key become `BLOCKED — FOUNDER`.

---

## 10. Active Edge campaign isolation

### PASS

The active Home-PC v99/#99 campaign was not touched.

This acceptance did not:

- edit candidate bytes/worktree;
- rerun its verifier as author;
- alter frozen artifacts;
- merge candidate branch;
- close any Edge defect;
- represent historical campaign-119 evidence as certification of v99/#99.

Future physical Work-PC verification waits for an explicit frozen-candidate handoff at a natural round boundary.

---

## 11. Independent evidence summary

### PASS

- historical Work-PC BUG-036/037 waiting state preserved;
- canonical `FACTORY_RUNNER_PG_URL` accessor independently source-inspected;
- external GitHub CI confirms accessor controls;
- external real-PostgreSQL CI confirms migration chain and narrow double-claim concurrency primitive;
- historical candidate freeze/artifact watcher design independently inspected;
- multi-node, BUG-036, and low-cost-provider acceptance protocols prepared.

### FAIL

1. **FV1-001:** no persistent autonomous Factory Director.
2. **FV1-002:** ambient privileged DB paths remain; generic-node zero-authority invariant fails.
3. **FV1-003:** authoring/certifying-run independence is not structurally enforced.
4. **FV1-004:** reusable QA evidence contract is incomplete.
5. **FV1-005:** DeepSeek/low-cost Factory architecture is not implemented enough for key-gated acceptance.

### BLOCKED — HOME PC

- runtime retest of fixes for FV1-001..005 after implementation;
- active frozen candidate acceptance until explicit handoff;
- BUG-036/037 production retest until explicit ready-for-retest + deployed WEB SHA.

### BLOCKED — FOUNDER

- shared non-production PostgreSQL endpoint/credentials when the real two-node campaign is ready to run.

### BLOCKED — EXTERNAL

- none currently. Provider API availability/key is intentionally not requested because the adapter itself is not ready.

---

## 12. Stop condition

All non-conflicting acceptance work available from durable repository/CI evidence in this session is complete.

Remaining work requires at least one of:

- Home-PC implementation;
- explicit frozen-candidate handoff;
- shared non-production PostgreSQL;
- later provider credential;
- machine-local multi-node execution.

The Work PC therefore remains **independent** and does not fix these failures.

BUG-036/BUG-037 production state remains **WAITING_FOR_HOME_PC**.

<!-- BEGIN WORK-PC EXECUTED EVIDENCE -->
---

## 13. Executed-evidence update (2026-09-14, second Work-PC campaign)

The sections above were derived from source inspection and GitHub Actions artifacts. This
section adds **executed** evidence produced on the Work PC by the harness under
`qa/factory-acceptance/` (`README.md` there is the run book). Every check is provenance-bound
to the two pinned refs; evidence levels are stated per check and never promoted.

| Item | Value |
|---|---|
| Refs tested | `origin/master@55a159172a9bbc9b69cde4d2f832418573a4b0b9` and `origin/p1/control-plane-phase0@dcc0d9c554e8ddbba27b9aabfdc6be94a81c2baf` (runtime findings hold on **both**; recorded once per ref) |
| Engines | PGlite (PostgreSQL 18.3 WASM, pinned `qa/dbtest/db.mjs`, 81/81 migrations, RLS emulation: NOT SECURITY VERIFIED) · embedded PostgreSQL 17.10 on 127.0.0.1:54329 (two connections, one machine; stopped and deleted after collection, `results/PREFLIGHT.json#teardown`) |
| Deployed web SHA | UNKNOWN — `CANNOT_BIND_TO_DEPLOYED_WEB` |
| Production SQL / credentials | none used, none loaded |
| Consolidated evidence | `qa/factory-acceptance/results/FACTORY_V1_ACCEPTANCE.json`, `RECONCILIATION.json`, `EVIDENCE_TABLES.md` |
| Home-PC handoff (executed evidence) | `qa/home-pc-handoff/HOMEPC-2026-09-14-factory-v1-acceptance.json` (companion to `HOMEPC-2026-09-14-FACTORY-V1-BLOCKERS.md`) |

### 13.1 What the executed evidence changes in sections 2–9

| Section / subcriterion | Earlier verdict | Executed verdict | Evidence |
|---|---|---|---|
| §2 restart reconstructs state | BLOCKED — HOME PC | **PASS at contract level** (`planResume` + claim RPC); still no Director to invoke it | LR-06, LR-08, DIR-11 (LOCAL_DB_CONTRACT / SOURCE) |
| §2 finished work not repeated | BLOCKED — HOME PC | **PASS at contract level**: equal `source_sha` resumes from `remaining_scenarios[0]`; changed SHA restarts and invalidates partial certification; `complete_work_order`/`complete_agent_run` idempotent | LR-06, DIR-06, DIR-07 |
| §2 duplicate run prevented | PARTIAL PASS (claim primitive) | **run-level PASS on real PostgreSQL** (SKIP LOCKED race, 30-minute lease respected at 29/31 min by fixture time); **Work-Order-level FAIL**: two `in_progress` runs for one `canonical_work_order_id` insert freely with distinct `provider_run_id`s; `poll-and-dispatch.mjs` dedupes with a non-atomic `NOT EXISTS` then `INSERT` | LR-03, LR-09, LR-10, **DIR-09** |
| §2 blocked WO does not halt unrelated work | BLOCKED — HOME PC | **PASS at task level** (`isTaskReady`/`isTaskPermanentlyBlocked`/`selectTasksToDispatch` over a DAG with a rejected dependency); WO-level rule exists only as Director prose | DIR-08 |
| §2 provider/process failure preserves checkpoint | PARTIAL PASS | **PASS at contract level**: capacity-only claim filter, attempt cap in SQL, `claimed_by` reset on re-block, spawn-failure release path present | LR-01, LR-02, LR-04, LR-08 |
| §2 persistent Director | FAIL | **ABSENT on both refs** (no launcher/loop/scheduled task; entry points self-describe as manual one-shot); only `dispatch-isolated-verifier.sh` detaches (master only; the three verifier shell scripts do not exist on p1); runtime hard-binds `REPO_ROOT='C:\Users\Dell\dev\brain-os'` on both refs | DIR-02, DIR-10, DIR-03 |
| §3 db.mjs primitives | PASS | **PASS** (only `FACTORY_RUNNER_PG_URL` is read; absent URL refuses with ambient `SUPABASE_ACCESS_TOKEN`/`SUPABASE_DB_URL`/`DATABASE_URL`/`PG*` set); **PARTIAL** on superuser rejection: `service_role`, an unnamed superuser, mixed-case `POSTGRES`, `SET SESSION AUTHORIZATION` and `set search_path` all pass the username/regex checks | CPS-01, CPS-02, CPS-03 |
| §3 generic node zero write authority | FAIL | **FAIL on both refs**: 10 `--linked` call sites per ref, `db.mjs` has 0 call sites; Home-PC inventory test red from the pinned p1 tree | CPS-04, MP-02 |
| §3 superuser/admin rejected overall | FAIL | **PARTIAL (machine trust)**: `claim_blocked_run_for_retry` is reachable only by the `postgres`/`supabase_admin` transport identity; every API role including the founder JWT gets 42501 (EXECUTE revoked); an unnamed superuser hits the RAISE | CPS-05 |
| §3 possession of an ID cannot bypass auth | FAIL (architectural) | **PASS at the RPC/trigger level**: cross-company goal id refused by `create_factory_work_order` and by direct INSERT; **FAIL** architecturally: FKs from `canonical_work_orders`/`agent_runs`/`tasks` into `companies`/`goals`/`people`/`profiles` (CASCADE) | CPS-08, CPS-07 |
| §3 new: manager forgery of consumed columns | not covered | **PARTIAL / defect**: 13 supervisor-input columns are trigger-guarded (42501 for a manager persona), but `status`, `head_commit`, `verification_status`, `summary`, `execution_provider`, `provider_run_id`, `agent_definition_path`, `agent_definition_hash` are writable by a company manager under `agent_runs_update_scope` — a manager can forge a certification row (PGlite RLS emulation; confirm on real PostgreSQL) | CPS-06 |
| §3 privilege sweep | not run | **PASS (independent)**: no factory RPC executable by `anon`; claim RPC by no API role. The Home-PC sweep suite cannot run on this engine (`auth.users.instance_id`) | CPS-12, CPS-09 |
| §3 Home-PC claim-security suite (D1–D5) | never executed | **NO_VERDICT — SUITE_PRECONDITION_DEFECT**: first execution ever; it aborts on any PostgreSQL because it compares `pg_get_function_identity_arguments` (which carries parameter names) with an unnamed signature string | CPS-10 |
| §4 double-claim primitive | PASS (CI) | **PASS reproduced locally on real PostgreSQL** (Work-PC race + pinned `qa/dbtest/concurrency.mjs`) — REAL_POSTGRES_LOCAL, not CROSS_NODE_REAL | LR-09, LR-10 |
| §5 AUTHORING RUN ≠ CERTIFYING RUN | FAIL | **FAIL, now executed**: the authoring row completes itself with `live_verified` and `head_commit` (`changed:true`); `complete_work_order` then completes the Work Order on that single self-certified row; a `live_verified` status with `head_commit` null is stored at run level; the scheduler picks the authoring agent as verifier (capability-only selection); no `certif*`/`verified_by`/`verifier` column exists (column-detector canary proven). The oracle in `lib/independence.mjs` (C1..C10) reports 7 of 10 conditions unsatisfiable by what the model can prove. The only separation-of-duties rule in the schema is `decide_approval` (requester ≠ decider) | RI-01, RI-02, RI-04, RI-05, RI-06, RI-00 |
| §5 authority derived from host | FAIL (conceptual) | **FAIL on both refs (executed grep)**: `session_user` name gates, hardcoded `REPO_ROOT`, `workers.hostname UNIQUE`; no run/role/provenance-derived authority for claim/guard operations | RI-03 |
| §6 evidence integrity | — | **PASS**: 50 records, all provenance-bound, 0 secret-shaped lines (pinned `qa/lib/secret_evidence.mjs`) | MP-04 |
| §6 Work-PC QA liveness | — | **PARTIAL**: scheduled task `BrainOS-WorkPC-QA-Supervisor` present (Ready, Last Result 1 every 30 min); lease PID dead, lease stale since 2026-09-10; `supervisor_state = WAITING_FOR_HOME_PC` as recorded. Not repaired during this campaign | MP-03 |
| §7 multi-node | BLOCKED — FOUNDER | unchanged; single-machine two-connection evidence now exists (LR-09) | — |
| §9 provider readiness | FAIL | **ABSENT on both refs**: provider enum closed to `claude_code_background`/`claude_code_local`; dispatcher refuses any other provider and binds to the `claude` CLI; zero `deepseek`/`tier-0` references in any tracked file on either ref (canary proven); `agent_runs_no_silent_provider_fallback` CHECK is enforced by the DB (a recorded substitution needs `fallback_reason`) but **nothing in the runtime writes** `requested_*`/`actual_*`, so an unrecorded substitution stays invisible; plugin registry admits `execution_provider` components that nothing consumes | PR-01..PR-07 |

### 13.2 New machine finding — BLOCKED — FOUNDER

Running the Home-PC test `production_write_authority.regression.test.mjs` on this Work PC
(MP-01) fails one route: **a logged-in Vercel CLI session exists on this machine** (auth file
under `%APPDATA%\xdg.data\com.vercel.cli\`, dated 2026-08-31). While it exists `vercel env pull`
can regenerate the service-role key, so the Phase A hardening (Supabase CLI logged out) does not
close route 2. Removing a credential is a founder decision; nothing was deleted.

### 13.3 KFM #118 (master) / #62 (p1) reconciled against master `55a1591`

Three of the five headline defects in the Home-PC review are **refuted at master** (the pinned
RPC filters `blocked_reason` and `attempt_count`; `recordCapacityBlock` clears `claimed_by`;
a spawn-failure release path exists). Two are **confirmed** (`isRetryEligible` is dead code on
both refs; the runtime borrows the ambient CLI credential and the claim RPC trusts the
transport identity). The manager-forgery claim is **partially refuted** (guard trigger) and
**confirmed for the unguarded certification columns**. The review's own claim-security suite
could not run anywhere (13.1, CPS-10). Whether `202609030001` is applied in production stays
**PRODUCTION STATE NOT VERIFIED**: three Home-PC documents contradict each other
(`RECONCILIATION.json#migration_202609030001_applied_state_contradiction`).

### 13.4 Consolidated grouped summary (executed evidence, 55 checks)

Totals: PASS 27 · FAIL 11 · ABSENT 5 · PARTIAL 10 · NO_VERDICT 2 (by level: SOURCE 22,
LOCAL_DB_CONTRACT 27, REAL_POSTGRES_LOCAL 2, MACHINE_PROPERTY 4).

**PASS** — DIR-00/01/04/05/06/07/08/11 · CPS-00/01/02/08/11/12 · LR-00/01/02/03/04/06/07/08/09/10 ·
RI-00 · PR-04 · MP-04.

**FAIL** (recorded defects / absences; every one is a Home-PC implementation item) —
DIR-02 ABSENT, DIR-03 FAIL, DIR-09 FAIL, DIR-10 PARTIAL · CPS-03 PARTIAL, CPS-04 FAIL, CPS-05
PARTIAL, CPS-06 PARTIAL, CPS-07 FAIL, CPS-09 NO_VERDICT (engine fixture), CPS-10 NO_VERDICT
(suite precondition defect) · LR-05 FAIL · RI-01/02/03/04 FAIL, RI-05 ABSENT, RI-06 PARTIAL ·
PR-01/02/03/07 ABSENT, PR-05/06 PARTIAL · MP-00 PARTIAL (tool availability), MP-02 FAIL
(expected red inventory), MP-03 PARTIAL.

**BLOCKED — HOME PC** — closure of every FAIL above requires Home-PC implementation at a frozen
SHA, then Work-PC retest: FV1-001 (+ DIR-09 idempotent dispatch), FV1-002 (+ CPS-06 write-path
scoping, CPS-07 isolation decision), FV1-003, FV1-004 (+ the two unrunnable Home-PC suites),
FV1-005, and the `202609030001` applied-state contradiction.

**BLOCKED — FOUNDER** — (1) shared non-production PostgreSQL endpoint + generic-node
credentials for the real two-node campaign (protocol in §4); (2) decision on the logged-in
Vercel CLI session on the Work PC (13.2).

**BLOCKED — EXTERNAL** — none. A DeepSeek key is deliberately not requested (PR-07).

### 13.5 State preserved (proof in `RECONCILIATION.json`)

BUG-035 P2 OPEN · BUG-036 P1 OPEN · BUG-037 P2 OPEN — identical to `origin/qa/work-pc`;
`supervisor_state = WAITING_FOR_HOME_PC` unchanged; `qa/runner/SUPERVISOR_STATE.json`,
`qa/BUG_QUEUE.json`, `qa/HANDOFF_STATE.json` not modified by this campaign; no tracked file under
`scripts/`, `supabase/`, `web/`, `governance/`, `.github/`, `docs/` modified. The operational
tree was fast-forwarded (no merge commit) onto the two commits pushed to `qa/work-pc` at
10:19–10:21 that created this document and the blockers handoff; this section updates rather
than replaces them.


### 13.6 Per-check evidence tables (generated)

<!-- BEGIN GENERATED EVIDENCE (qa/factory-acceptance/consolidate.mjs, 2026-09-14T05:09:27Z) -->

| Totals | PASS 27 | FAIL 11 | ABSENT 5 | PARTIAL 10 | NO_VERDICT 2 | checks 55 |
|---|---|---|---|---|---|---|

### Suite `director`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| DIR-01 | **PASS** | PASS | SOURCE_FINDING_ONLY | PURE_FN | Importing scripts/factory-runner/{scheduler,supervisor,provider}.mjs runs no child process (safe to unit-test); invoking pollOnce() does rea |  |
| DIR-02 | **PARTIAL** | ABSENT | SOURCE_FINDING_ONLY | SOURCE_GREP | FOUNDER_POKE_NOT_REQUIRED for the Factory: a continuously running Director/dispatcher exists (scheduled task, loop, cron, service) |  |
| DIR-03 | **FAIL** | FAIL | SOURCE_FINDING_ONLY | SOURCE_GREP | The Factory runtime is computer-agnostic (no machine-specific path or identity in the runtime) |  |
| DIR-00 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | PGlite engine with the full pinned migration chain and seeded synthetic identities |  |
| DIR-04 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | create_factory_work_order refuses cross-company goal association (2026-08-29 incident regression) |  |
| DIR-05 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | create_factory_task derives company server-side and refuses mismatches |  |
| DIR-06 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | complete_work_order is idempotent, requires verified commits, refuses running/failed/unverified state |  |
| DIR-07 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | complete_agent_run is founder/admin-only, idempotent, propagates to the task |  |
| DIR-08 | **PASS** | PASS | SOURCE_FINDING_ONLY | PURE_FN | A blocked task does not halt unrelated ready tasks; a rejected dependency permanently blocks dependents; agent selection is capability-only | task-level only; WO-level "progress around BLOCKED - DB PUSH" exists as prose in brain-os-factory-director.md and is not enforced by code |
| DIR-09 | **FAIL** | FAIL | LOCAL_DB_CONTRACT | PGLITE_EXEC | Duplicate run prevention for Work-Order dispatch is structural (a second active run for the same canonical_work_order_id is impossible) | poll-and-dispatch.mjs dedupes with a non-atomic NOT EXISTS then INSERT (TOCTOU); the schema has no partial unique index on (canonical_work_order_id) where status in progress and no trigger refusing a second active run |
| DIR-10 | **PARTIAL** | PARTIAL | SOURCE_FINDING_ONLY | SHELL_REVIEW | The Factory runtime detaches from its launching session (survives an interactive Claude session ending) | only the isolated-verifier shell path detaches (nohup); supervisor.mjs pollOnce has no launcher; artifact-based completion detection exists only in watch-verifier-artifacts.sh |
| DIR-11 | **PASS** | PASS | SOURCE_FINDING_ONLY | NODE_TEST_RERUN | planResume / computeRetryAfter / safeWorktree / dispatch selection invariants hold as the Home PC pinned them |  |

### Suite `control-plane-security`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| CPS-01 | **PASS** | PASS | SOURCE_FINDING_ONLY | SOURCE_GREP | The factory accessor connects only through an explicit FACTORY_RUNNER_PG_URL |  |
| CPS-02 | **PASS** | PASS | SOURCE_FINDING_ONLY | PURE_FN | With FACTORY_RUNNER_PG_URL unset, read()/write()/transaction() refuse before any connection even when ambient credentials are present in the |  |
| CPS-03 | **PARTIAL** | PARTIAL | SOURCE_FINDING_ONLY | PURE_FN | db.mjs rejects superuser/admin connections and role-escalation statements | username-string check only; no server-side role verification (current_user/rolsuper) exists in db.mjs |
| CPS-04 | **FAIL** | FAIL | SOURCE_FINDING_ONLY | SOURCE_GREP | Generic Factory node has zero production-write authority: no runtime script reaches the DB through `supabase db query --linked` |  |
| CPS-00 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | PGlite engine ready with full chain; persona enforcement self-checked |  |
| CPS-05 | **PARTIAL** | PARTIAL | LOCAL_DB_CONTRACT | PGLITE_EXEC | claim_blocked_run_for_retry authority derives from role/capability rather than transport identity; least-privilege callers are denied for th | EXECUTE is revoked from every API role, so even the founder JWT cannot claim; only the postgres/supabase_admin transport identities can. Authority derives from the connection identity NAME (machine trust), not from a wor |
| CPS-06 | **PARTIAL** | PARTIAL | LOCAL_DB_CONTRACT | PGLITE_EXEC | A company manager cannot rewrite the Agent Run fields the supervisor consumes | PGlite emulation with session_user = qa_authenticator so guard_agent_run_retry_columns is exercised on its real inputs |
| CPS-07 | **FAIL** | FAIL | LOCAL_DB_CONTRACT | PGLITE_EXEC | The control-plane schema does not reference Brain OS business tables; business IDs are opaque references by value | canonical_work_orders.company_id is NOT NULL with ON DELETE CASCADE to companies |
| CPS-08 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | A caller with real access to company A cannot associate company B objects by supplying their ids |  |
| CPS-09 | **NO_VERDICT** | PASS | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | No factory RPC is granted to anon; founder canonical path works | ENGINE_FIXTURE_INCOMPATIBLE: the suite seeds auth.users(instance_id), a column the pinned qa/dbtest bootstrap does not model |
| CPS-10 | **NO_VERDICT** | PARTIAL | LOCAL_DB_CONTRACT | PGLITE_SUITE_RERUN | FIRST EXECUTION EVER of the Home-PC claim-security suite (D1-D5) | SUITE_PRECONDITION_DEFECT: the suite compares pg_get_function_identity_arguments (which includes parameter names) with an unnamed signature string, so it aborts against the very migration it tests - on any PostgreSQL |
| CPS-11 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | complete_agent_run is founder/admin-only |  |
| CPS-12 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | No factory RPC grants EXECUTE to anon (independent replacement for the engine-incompatible Home-PC sweep) |  |

### Suite `lease-recovery`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| LR-00 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | PGlite engine with the retry migration applied |  |
| LR-01 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | A run blocked for a non-capacity reason (e.g. agent crash) is never claimed for automatic retry | REFUTES #118/claim-2 at master: the pinned RPC text filters blocked_reason |
| LR-02 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | The retry loop is bounded in SQL: attempt_count >= p_max_attempts is never claimed; a claim increments attempt_count | the JS predicate isRetryEligible remains dead code (LR-05); the SQL WHERE is the live gate |
| LR-03 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | Lease TTL: a second claimant is refused while a live claim exists and succeeds only after the real 30-minute stale threshold |  |
| LR-04 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | After a provider re-block the run can be recovered again (claimed_by is reset by the re-block path) | CONFIRMS #118/claim-3 |
| LR-05 | **FAIL** | FAIL | SOURCE_FINDING_ONLY | PURE_FN | The JS safety predicate is wired into the live path | CONFIRMS #118/claim-1 on both refs |
| LR-06 | **PASS** | PASS | SOURCE_FINDING_ONLY | PURE_FN | Finished work is not repeated on resume when the source is unchanged; a changed source never inherits partial certification |  |
| LR-07 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | A dead worker is visible as STALE from heartbeat age alone; an in-progress run with a fresh heartbeat reads RUNNING | derived view only; no job transitions the row - a stale run is recovered only by the (unscheduled) supervisor or a human |
| LR-08 | **PASS** | PASS | LOCAL_DB_CONTRACT | PGLITE_EXEC | Supervisor restart / duplicate poll: a second sequential poll finds nothing to claim; spawn failure releases the claim | the release write itself is JS in pollOnce (not executed here: it shells to --linked); its SQL effect is replayed from the pinned source text |
| LR-09 | **PASS** | PASS | REAL_POSTGRES_LOCAL | REAL_PG_RACE | Two claimants racing for one blocked run never both win (SKIP LOCKED); the loser is not blocked; takeover happens only after the real 30-min |  |
| LR-10 | **PASS** | PASS | REAL_POSTGRES_LOCAL | NODE_TEST_RERUN | The Home PC concurrency harness (TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN) passes on real PostgreSQL | the pinned harness drops and recreates the schema on open (disposable, sentinel-gated) and applies the migration chain itself |

### Suite `role-independence`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| RI-00 | **PASS** | PASS | LOCAL_DB_CONTRACT | PURE_FN | Oracle accepts the sufficient example and rejects each single-condition violation (detector can fire) |  |
| RI-01 | **FAIL** | FAIL | LOCAL_DB_CONTRACT | PGLITE_EXEC | The durable model distinguishes and proves the run that authored head_commit from the run that certified it | THE CURRENT MODEL DOES NOT STRUCTURALLY DISTINGUISH OR PROVE AUTHORING RUN VERSUS CERTIFYING RUN: verification_status lives on the Agent Run row; complete_agent_run accepts a caller-supplied status; no certifying-run rel |
| RI-02 | **FAIL** | FAIL | LOCAL_DB_CONTRACT | PGLITE_EXEC | Work-Order completion requires a certifying run distinct from the authoring run, bound to the certified commit | complete_work_order binds commit to verification on the SAME agent_runs row and counts one self-certified row as sufficient; it cannot express or require a distinct certifying run. |
| RI-03 | **FAIL** | FAIL | SOURCE_FINDING_ONLY | SOURCE_GREP | Factory authority derives from WORK ORDER + AGENT RUN + ROLE/CAPABILITY + PROVENANCE, never from the machine | claim/guard authority is granted by transport identity NAME (session_user); the runtime binds to one machine path; the worker registry is keyed by hostname. No run/role/provenance-derived authority exists for these opera |
| RI-04 | **FAIL** | FAIL | LOCAL_DB_CONTRACT | PGLITE_EXEC | A certification must carry exact candidate provenance; verification_status without a commit is refused | run-level certification with no commit is stored; only the Work-Order gate later notices the missing commit (verification_required_not_found / no verified commit). |
| RI-05 | **ABSENT** | ABSENT | SOURCE_FINDING_ONLY | PURE_FN | An agent holding the authoring run for Work Order X cannot be dispatched as verifier for X |  |
| RI-06 | **PARTIAL** | PARTIAL | SOURCE_FINDING_ONLY | SOURCE_GREP | A requester-is-not-decider rule exists somewhere in the durable model (proof the platform can express separation of duties) | exists for salary_hr/finance approvals only; nothing equivalent exists for agent runs |

### Suite `provider-readiness`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| PR-01 | **ABSENT** | ABSENT | SOURCE_FINDING_ONLY | SOURCE_GREP | The provider vocabulary admits a non-Claude provider (e.g. a Tier-0 / DeepSeek executor) |  |
| PR-02 | **ABSENT** | ABSENT | SOURCE_FINDING_ONLY | SOURCE_GREP | Provider dispatch is abstracted behind an interface a second provider could implement |  |
| PR-03 | **ABSENT** | ABSENT | SOURCE_FINDING_ONLY | SOURCE_GREP | A DeepSeek or Tier-0 provider integration, plan, or configuration exists somewhere in the tracked tree | product-side model providers (web/, supabase/functions) exist for the Brain OS product AI, not for Factory execution |
| PR-04 | **PASS** | PARTIAL | LOCAL_DB_CONTRACT | PGLITE_EXEC | A provider/model substitution on restart is recorded with a reason (never silent) AND the runtime populates requested/actual | the DB refuses a RECORDED silent substitution, but no runtime path records requested/actual at all, so an unrecorded substitution stays invisible (all-null rows are valid) |
| PR-05 | **PARTIAL** | PARTIAL | SOURCE_FINDING_ONLY | SOURCE_GREP | Provider failure classification is provider-neutral | sound for Claude Code (cross-checked by DIR-11 provider.regression.test); a second provider would need its own pattern set and there is no per-provider hook |
| PR-06 | **PARTIAL** | PARTIAL | SOURCE_FINDING_ONLY | SOURCE_GREP | An execution_provider plugin can be registered AND is consumed by the dispatcher |  |
| PR-07 | **ABSENT** | ABSENT | SOURCE_FINDING_ONLY | SOURCE_GREP | The Factory can accept a Tier-0/DeepSeek executor today without code change |  |

### Suite `machine-property`

| Check | Verdict | Expected | Level | Method | Claim tested | Note |
|---|---|---|---|---|---|---|
| MP-00 | **PARTIAL** | PARTIAL | MACHINE_PROPERTY | MACHINE_PROBE | The CLIs the Home-PC authority test probes exist on this machine | gh and vercel CLIs are absent here; routes that probe them return early in the Home-PC test and are recorded, not counted as proof |
| MP-01 | **FAIL** | PASS | MACHINE_PROPERTY | NODE_TEST_RERUN | This machine holds no ambient production-write credential (7 route assertions) | BLOCKED - FOUNDER: a logged-in Vercel CLI session exists on this Work PC (path recorded by the Home-PC test; file dated 2026-08-31); while it exists `vercel env pull` can regenerate the service-role key. Removing a crede |
| MP-02 | **FAIL** | FAIL | SOURCE_FINDING_ONLY | NODE_TEST_RERUN | factory-runner scripts carry no ambient production DB authority |  |
| MP-03 | **PARTIAL** | PARTIAL | MACHINE_PROPERTY | MACHINE_PROBE | The Work-PC QA evidence infrastructure is live and its canonical files are only written by the single writer | scheduled task present but no live supervisor process; lease stale; task Last Result recorded. WAITING_FOR_HOME_PC is the recorded state and is not "fixed" during this campaign |
| MP-04 | **PASS** | PASS | MACHINE_PROPERTY | MACHINE_PROBE | Every check record produced so far carries provenance and no secret-shaped value |  |

### KFM #118 (master) / #62 (p1) - confirm / refute

| Claim in the Home-PC review | Checks | Work-PC result |
|---|---|---|
| isRetryEligible has zero live call sites and cannot accept the RPC row shape | LR-05 | CONFIRMED on both refs |
| the claim RPC never checks blocked_reason (unclassified failures auto-restart) | LR-01 | REFUTED at master 55a1591: the pinned RPC filters blocked_reason like PROVIDER_CAPACITY_BLOCKED% |
| the retry loop is unbounded in SQL (attempt_count never checked) | LR-02 | REFUTED at master 55a1591: attempt_count < p_max_attempts is in the WHERE clause and the cap is observed |
| claimed_by is cleared by nothing; a run is recoverable exactly once | LR-04 | REFUTED at master 55a1591: recordCapacityBlock clears claimed_by/claimed_at; the stuck-until-TTL shape reproduces only when the reset is omitted |
| claim-then-spawn-failure strands the run | LR-08 | REFUTED at master 55a1591: resume_spawn_failed_claim_released path exists in supervisor.mjs (source contract; SQL effect replayed) |
| the supervisor reaches Postgres via supabase db query --linked (superuser, no JWT) - feature dead on arrival for founder gate | CPS-04, CPS-05 | CONFIRMED on both refs: ten runtime scripts use --linked; the claim RPC is reachable only by the postgres/supabase_admin transport identity (EXECUTE revoked from every API role, founder JWT included) |
| a company manager can rewrite the supervisor inputs (worktree, checkpoint_location, source_sha, branch, retry_after, attempt_count, claimed_by) | CPS-06 | PARTIALLY REFUTED at master 55a1591: those columns are now trigger-guarded (42501 for a manager persona); CONFIRMED for the unguarded set the completion path consumes: ["status","execution_provider","provider_run_id","agent_definition_path","agent_definition_hash","summary","head_commit","verification_status"] |
| NO_SILENT_PROVIDER_FALLBACK is schema-only (no constraint, no writer) | PR-04 | PARTIALLY REFUTED: a CHECK constraint now refuses a recorded silent substitution; CONFIRMED that no runtime path writes requested_*/actual_* (all-null rows are valid and invisible) |
| agent_run_capacity_retry_claim_security.sql was ADDED, NOT YET EXECUTED | CPS-10 | FIRST EXECUTION by the Work PC: the suite aborts at its own precondition on any PostgreSQL (compares pg_get_function_identity_arguments, which carries parameter names, with an unnamed signature string) - SUITE_PRECONDITION_DEFECT; D1-D5 are covered independently by CPS-05/CPS-06/LR-01/LR-02/LR-03 |
| 202609030001 NOT PUSHED / DO NOT PUSH AS WRITTEN | - | NOT RESOLVABLE FROM THIS SEAT: qa/KNOWN_FAILURE_MODES.md #118 (master) says NOT PUSHED; qa/verification/DB_BATCH_STATE_FINDING.md:15 says applied; qa/scenarios-runner/README.md:84 says NOT YET EXECUTED. Production migration state is PRODUCTION STATE NOT VERIFIED (no production SQL from the Work PC). |
| bounded backoff never escalates (scheduler hardcodes attemptCount: 1) | - | NOT TESTED in this campaign |

<!-- END GENERATED EVIDENCE -->

<!-- END WORK-PC EXECUTED EVIDENCE -->

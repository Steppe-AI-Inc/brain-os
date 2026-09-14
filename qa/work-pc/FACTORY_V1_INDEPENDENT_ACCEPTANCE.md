# FACTORY V1 — Work-PC Independent Acceptance

**Authority:** INDEPENDENT FACTORY V1 VERIFICATION AUTHORITY  
**Date:** 2026-09-14  
**Canonical QA branch:** `qa/work-pc`  
**Acceptance state:** **NOT ACCEPTED — multiple Factory V1 exit criteria fail in durable committed infrastructure**  
**Implementation boundary:** verification/evidence only; no product/Factory implementation fixes from this seat.

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

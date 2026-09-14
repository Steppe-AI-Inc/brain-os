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

### 13.2 Machine finding — local Vercel authority route CLOSED (founder decision 2026-09-14)

Running the Home-PC test `production_write_authority.regression.test.mjs` on this Work PC
(MP-01, first run) failed one route: a logged-in Vercel CLI session existed on this machine
(auth file under `%APPDATA%\xdg.data\com.vercel.cli\`, 397 bytes, dated 2026-08-31). While it
existed `vercel env pull` could regenerate the service-role key, so the Phase A hardening
(Supabase CLI logged out) did not close route 2. On founder decision the same day: the normal
`vercel logout` reported "Not currently logged in" (the current CLI does not read that legacy
store) and left the file behind; the local file was then deleted. Token contents were never
printed, copied, hashed or committed. MP-01 rerun: **all 7 routes green**
(`vercel_cli_session_present_on_work_pc: false`). **Remaining BLOCKED — FOUNDER:** server-side
revocation of that token in the Vercel dashboard (the Work PC cannot identify it without
exposing it).

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
credentials for the real two-node campaign (protocol in §4) — **DEFERRED UNTIL HOME-PC FROZEN
FACTORY CANDIDATE** by founder decision: HOME PC fixes FV1-001..005 → publishes frozen SHA →
Work PC retests structural fixes → shared non-production PostgreSQL provisioned → NODE A → NODE B
takeover campaign; (2) server-side revocation in the Vercel dashboard of the token whose local
file was removed from the Work PC (13.2).

**BLOCKED — EXTERNAL** — none. A DeepSeek key is deliberately not requested (PR-07).

### 13.5 State preserved (proof in `RECONCILIATION.json`)

BUG-035 P2 OPEN · BUG-036 P1 OPEN · BUG-037 P2 OPEN — identical to `origin/qa/work-pc`;
`supervisor_state = WAITING_FOR_HOME_PC` unchanged; `qa/BUG_QUEUE.json` and `qa/HANDOFF_STATE.json`
not modified; `qa/runner/SUPERVISOR_STATE.json` gained only the informational `factory_v1_acceptance`
pointer on founder decision (blocked_on, next_action and Phase-B re-entry untouched); no tracked file under
`scripts/`, `supabase/`, `web/`, `governance/`, `.github/`, `docs/` modified. The operational
tree was fast-forwarded (no merge commit) onto the two commits pushed to `qa/work-pc` at
10:19–10:21 that created this document and the blockers handoff; this section updates rather
than replaces them.


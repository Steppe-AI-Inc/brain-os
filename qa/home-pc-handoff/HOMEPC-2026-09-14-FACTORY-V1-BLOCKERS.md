# Home-PC handoff — Factory V1 independent acceptance blockers

**Issued by:** Work-PC independent Factory V1 verification authority  
**Date:** 2026-09-14  
**QA branch:** `qa/work-pc`  
**Factory source audited:** `p1/control-plane-phase0@dcc0d9c554e8ddbba27b9aabfdc6be94a81c2baf`  
**Historical QA/evidence source inspected only:** `p1/execution-truth-governance@26c0f3ea47030c7d245f0ec7091529e8af2f87c2`  
**Active v99/#99 candidate:** OUT OF SCOPE — not modified, not certified, not treated as the source under test.

This artifact reports independent acceptance failures. It does **not** authorize the Work PC to implement fixes, migrate production, deploy, or modify the active Edge candidate.

---

## FV1-001 — Persistent Factory Director is not autonomous

**Status:** FAIL  
**Severity:** P1 — Factory V1 exit blocker  
**Invariant:** `FOUNDER_POKE_NOT_REQUIRED`

### Reproduction / evidence

At the audited Factory source:

- `scripts/factory-runner/poll-and-dispatch.mjs` explicitly states that it is a **manually-invoked poll** and **not a continuously-running daemon**; its own header says always-on scheduling is future infrastructure work.
- The existing `scripts/factory-runner/supervisor.mjs` owns provider-capacity retry for blocked Agent Runs. It is not a persistent top-level Factory Director that discovers all durable work, detects completed worker artifacts, advances the DAG, and dispatches the next Work Order independently of an interactive Claude session.
- `.claude/agents/brain-os-factory-director.md` still depends on machine-specific local paths and manual runner commands.

### Exit criterion affected

Factory Director must survive an interactive Claude session ending and, from durable state alone:

1. detect completed worker evidence;
2. advance/dispatch eligible next work;
3. reconstruct after restart;
4. not repeat finished work;
5. not double-dispatch;
6. leave blocked work visible without halting unrelated work.

### Home-PC requirement

Provide a persistent, restart-safe Director service/loop whose authority and state are durable and computer-agnostic. Return a frozen source SHA plus deterministic acceptance harness. Work PC will independently test process death, Director restart, duplicate suppression, blocked-work isolation, and automatic next dispatch.

---

## FV1-002 — Generic Factory node still has ambient privileged database paths

**Status:** FAIL  
**Severity:** P1 — security / control-plane exit blocker  
**Invariant:** a generic Factory node has zero ambient production-write authority.

### Positive finding that stands

`scripts/factory-runner/db.mjs` is a good least-authority primitive:

- requires explicit `FACTORY_RUNNER_PG_URL`;
- missing URL fails closed;
- no fallback in that module;
- rejects `postgres`, `supabase_admin`, and Supabase pooler usernames of the form `postgres.<ref>`;
- refuses DDL, GRANT/REVOKE, migration-history writes, TRUNCATE, SET ROLE, and SECURITY DEFINER definitions;
- separates `read()` and DML `write()/transaction()`.

GitHub Actions job **101635138152** independently passed the pure accessor controls.

### Failing evidence

The Factory does not consistently use that primitive.

GitHub Actions job **101635138064**, head SHA `dcc0d9c...`, failed:

> factory workers carry no ambient production DB authority

The committed regression explicitly says ten Factory scripts still classify as `PRODUCTION_WRITE` because they use `supabase db query --linked`.

Independently inspected examples:

- `scheduler.mjs` — `supabase db query --linked`, including direct writes to `agent_runs` and `tasks`.
- `poll-and-dispatch.mjs` — ambient `--linked` DB transport.
- `dispatch-task.mjs` — ambient `--linked` transport and direct `agent_runs` insert.
- `complete-run.mjs` — ambient `--linked` transport and a hard-coded founder identity injected into `request.jwt.claims`.
- `supervisor.mjs` — ambient direct DB transport.
- `provider.mjs` registry read path — ambient `--linked`.

The retry migration `202609030001_agent_run_capacity_retry.sql` also explicitly models the supervisor's intended transport as a direct `postgres`/`supabase_admin` connection. That contradicts the Factory V1 generic-node authority target.

### Additional control-plane boundary failure

The audited Factory design operates directly over Brain OS `public` business/factory tables and identifiers (`tasks`, `agent_runs`, `canonical_work_orders`, `agents`, company IDs). It is not yet a control plane where business IDs are opaque references and possession of an ID cannot itself combine with a privileged node transport to mutate business state.

### Exit criterion affected

- explicit Factory-only connection;
- no ambient Supabase CLI/control-plane credential borrowing;
- no superuser/admin connection on generic nodes;
- generic node zero production-write authority;
- control-plane storage isolated from Brain OS business tables;
- business identifiers opaque by value;
- authorization not bypassable merely by ID possession.

### Home-PC requirement

Remove every ambient privileged runner path. The final source must make the failing inventory test green by **mechanism removal**, not allowlisting/documentation. Supply a non-production Factory control-plane schema/role contract and an acceptance fixture proving a generic node cannot reach Brain OS business writes even when given a real-looking business UUID.

---

## FV1-003 — Authoring run and certifying run are not structurally independent

**Status:** FAIL  
**Severity:** P1 — release-integrity exit blocker  
**Invariant:** `AUTHORING RUN != CERTIFYING RUN`

### Reproduction / evidence

Current durable source does not bind certification to a distinct certifying Agent Run.

- `public.complete_agent_run(... p_head_commit, p_verification_status ...)` stores caller-supplied `head_commit` and `verification_status`.
- `public.complete_work_order(...)` checks that commit-carrying runs are `done` with `verification_status in ('live_verified','e2e_verified')`, but it consumes that field; it does not prove that a separate verifier run produced it.
- `scripts/factory-runner/complete-run.mjs` accepts `verificationStatus` as a CLI argument and then uses an ambient privileged DB path plus a hard-coded founder JWT identity.
- No materialized relation was found that proves:
  `candidate authoring_agent_run_id != certifying_agent_run_id`
  and binds the certification to exact candidate provenance + verifier capability role.

Therefore a different hostname is neither required nor sufficient, and the desired role/provenance independence is not yet enforced by the current durable model.

### Negative cases that must be rejected by construction

1. same run certifies its own output;
2. authoring provenance replayed as “independent” evidence;
3. verifier role forged in a payload;
4. stale/retired verifier identity;
5. process/node restart;
6. different physical node but same authoring run;
7. same physical node with a genuinely distinct run only where policy permits.

### Exit criterion affected

High-assurance Factory work cannot be certified until authority is derived from:

`WORK ORDER + AGENT RUN + SECURITY/CAPABILITY ROLE + PROVENANCE`

rather than host identity or a caller-supplied verification string.

### Home-PC requirement

Materialize certification as its own durable object/run relationship. The acceptance interface must let Work PC prove the negative cases above without production writes.

---

## FV1-004 — QA publication / liveness machinery does not yet satisfy the Factory V1 evidence contract

**Status:** FAIL  
**Severity:** P2 overall; any certification-integrity bypass inside this class escalates to P1  
**Invariant:** certification is computed only from immutable, complete, materialized evidence.

### Evidence

The historical verifier infrastructure has useful controls:

- isolated candidate worktree pinned to exact SHA;
- separate top-level verifier process;
- watchdog checks candidate hash before retry;
- materialized verifier artifacts can outlive the process;
- `watch-verifier-artifacts.sh` treats artifacts as authoritative rather than process exit;
- polling sleeps between checks rather than busy-spinning.

However, the requested Factory V1 infrastructure is not present as a single enforced contract in the committed infrastructure inspected:

- no general round-state derivation primitive was identified;
- no generic `measured == applied == frozen == rebuilt` gate;
- no machine-enforced denominator manifest preventing silent test-denominator shrinkage;
- no generic “forgiveness derives from current failing truth” gate;
- verifier liveness uses a Bash/nohup PID with `kill -0`; no durable native-Windows-PID vs MSYS-PID identity proof was found;
- no six-level instrument validator was found in committed Factory infrastructure;
- certification artifacts are emitted as multiple files; no generic atomic publish/commit protocol for a complete certification bundle was found.

Historical campaign artifacts can demonstrate these ideas case-by-case, but that is not equivalent to a reusable Factory V1 invariant.

### Home-PC requirement

Produce a computer-agnostic evidence contract and deterministic acceptance harness for each named invariant. Work PC will certify the harness itself with negative/mutation cases; comments or prose are not accepted as state.

---

## FV1-005 — Low-cost provider architecture is not ready for acceptance

**Status:** FAIL  
**Severity:** P2 — Factory V1 cost/reliability exit blocker  
**Invariant:** low-cost routing is explicit, observable, budgeted, resumable, and independently verifiable.

### Evidence

The audited Factory execution provider is Claude-Code-specific. No DeepSeek adapter was found in durable Factory source or commit history.

Existing useful pieces:

- provider errors are explicitly classified;
- retry/backoff exists for Claude capacity/transient failures;
- migration source models separate requested/actual provider+model fields;
- no silent model fallback is intentionally introduced.

But Factory V1 still lacks durable evidence of:

- a DeepSeek adapter;
- deterministic Factory Tier-0 bypass;
- end-to-end requested-vs-actual model recording on every run;
- DeepSeek tool-call completion;
- structured-output contract;
- actual cost accounting and budget enforcement;
- low-cost-to-strong-model escalation policy;
- independent certification of the escalation decision.

The legacy `js/core/tokenBudget.js` has a browser-side `no-llm/small/medium/strong` estimator, but it is not the Factory execution provider and does not satisfy this exit criterion.

**The DeepSeek API key is not the only blocker**, so this is not `BLOCKED — FOUNDER` yet.

### Home-PC requirement

Land the adapter/routing/budget/provenance contract first. Only after the implementation is independently inspectable should a missing API key be classified `BLOCKED — FOUNDER`.

---

## Constraints preserved

- Work PC did not modify product implementation.
- Work PC did not run production SQL.
- Work PC did not deploy.
- Work PC did not resume BUG-036/BUG-037 invitation/signup testing.
- Work PC did not author, alter, merge, certify, or close the active v99/#99 campaign.
- Work-PC-specific production restrictions remain in force until replacement role/provenance controls are independently proven sufficient.

# WORK ORDER — COMPUTER-AGNOSTIC FACTORY CONTROL PLANE

**Branch** `factory/computer-agnostic-control-plane` · **Worktree** `C:/Users/Dell/dev/brain-os-factory-cp`
**Base** `a393de06` on `p1/execution-truth-governance` · **Opened** 2026-09-10, founder directive
**Status** PHASE 1 — audit complete, conversion in progress

---

## WHAT THIS IS NOT

**It is not a second Software Factory.** The existing one is audited and extended. Every table, script and
agent named below already exists; this work order wires them together, removes an ambient authority, and
makes the whole thing survive the loss of any single computer.

**It does not touch the Edge campaign.** Verifier #84 is running against a frozen candidate
(`2ea30bb7` / index.ts `32048acd…`, 751 395 bytes, filesystem read-only). Its bytes are not to be changed to
implement any of this, and its PASS/FAIL is handled under the existing campaign contract. The two
workstreams share a repository and nothing else.

**It does not relax the Work-PC QA restrictions.** They stay active until this replacement is implemented
AND independently verified.

---

## THE PROBLEM, STATED FROM MEASUREMENT

Asked whether the campaign's orchestration was part of the Factory, the answer measured on this machine was:

| tier | what it is | survives session? | survives reboot? |
|---|---|---|---|
| git commits + the E:\ bundle | candidate, ledger, checkpoint, gate evidence, verifier artifacts | yes | **yes** |
| the verifier | detached OS process + watchdog, own pid, own log, commits to its own branch | yes | **no** |
| monitors / background tasks | a session tailing log files | **no** | no |

- **No crontab. No scheduled task.** (The only `*verifier*` scheduled tasks on this box are Microsoft's own
  `appuriverifierdaily` / `appuriverifierinstall`.)
- **Zero queue pollers alive.** `scheduler.mjs`, `supervisor.mjs`, `poll-and-dispatch.mjs` all exist and
  none is running.
- Everything that DECIDES — close a round, apply a fix, re-run gates, freeze, dispatch the next verifier —
  is a Claude session. There is no work-order row for it.

It has already failed this way once: verifier #69 died on a host restart and was resumed by hand from
`CHECKPOINT.md`.

**PROCESS LIFETIME != WORK ORDER LIFETIME. NODE LIFETIME != WORK ORDER LIFETIME.**

---

## AUDIT — WHAT ALREADY EXISTS

### The runner (`scripts/factory-runner/`, 4 468 lines)

| file | lines | role |
|---|---|---|
| `provider.mjs` | 456 | provider abstraction (capacity, retry) |
| `supervisor.mjs` | 361 | run supervision |
| `scheduler.mjs` | 308 | work-order scheduling |
| `db.mjs` | 121 | **the fail-closed DB layer — already written** |
| `register-worker.mjs` | 110 | node/worker registration |
| `complete-run.mjs` | 108 | completion |
| `dispatch-task.mjs` | 97 | dispatch |
| `poll-and-dispatch.mjs` | — | queue poll |
| `dispatch-isolated-verifier.sh` | 152 | the Edge campaign's isolated-verifier dispatch |
| `verifier-watchdog.sh` | 183 | detached retry ownership, classifies from OUTPUT TEXT |

Plus regression tests for supervisor, scheduler, provider, plugin-attach and db.

### Control-plane tables (already migrated)

`canonical_work_orders`, `agent_runs`, and the supporting migrations —
`202608290010_agent_run_completion`, `202608300002_complete_work_order`,
`202608300005_task_dag_and_agent_telemetry`, `202608300007_factory_realtime_publication`,
`202608310001_factory_notification_event_model`, `202609030001_agent_run_capacity_retry`
(the last one already carries **retry_after** and **attempt_count**).

### THE FINDING THAT DEFINES PHASE 1

**`db.mjs` already does everything directive 3 asks for, and NOTHING USES IT.**

Its header states the rule exactly: connects with `FACTORY_RUNNER_PG_URL`, *"never falls back to
`--linked`"*, *"a missing URL is a refusal, not a fallback, because a fallback to ambient authority is how
'least privilege' quietly becomes 'whatever the laptop had'"*. It enforces statement class in the client and
separates `read()` from `write()`.

Measured: **the only importer of `db.mjs` is its own regression test.** **Eleven scripts** still reach the
database through `npx supabase db query --linked` — `complete-run`, `dispatch-task`, `plugin-attach`,
`plugin-sync`, `poll-and-dispatch`, `poll-plugin-operations`, `provider`, `register-worker`, `scheduler`,
`supervisor`, `sync-agents` — each inheriting whatever this machine's Supabase CLI credential can do, which
is full production write. **A scheduler poll and a production migration travel the same wire with the same
authority.**

That is the standing classified red `factory_production_write_inventory`. The conversion was written and
deliberately not applied, because applying it stops the runner until `FACTORY_RUNNER_PG_URL` exists. The
founder directive of 2026-09-10 resolves that: develop against a disposable local PostgreSQL, prove it, and
ask for the shared URL only at the end.

---

## CONSTRAINTS

1. The Factory runner must NEVER use: the ambient Supabase CLI credential, linked-production authority, an
   arbitrary production DB URL, or a production service-role credential.
2. `FACTORY_RUNNER_PG_URL` is explicit and **fails closed** when absent. No silent fallback.
3. **Structural, not procedural:** with a production credential present in the environment, the runner still
   must not be able to use it.
4. The shared control plane is **NON-PRODUCTION**. It stores orchestration state only: canonical work
   orders, dependencies, agent runs, node registrations, leases, heartbeats, retries, checkpoints, ownership
   locks, completion state. **A generic node must not thereby obtain Brain OS production-write authority.**
5. **GitHub is durable recovery truth.** Losing the control-plane DB must not destroy development history.
6. Authority belongs to **run provenance, not computer names**. Persist `authoring_run_id`,
   `authoring_node_id`, `verification_run_id`, `verification_node_id`.
   **Invariant: `authoring_run_id != verification_run_id`.** For high-assurance acceptance,
   `verification_node_id != authoring_node_id`.
7. No machine-specific Home-PC / Work-PC logic in the node bootstrap.

---

## LOCAL ACCEPTANCE (must pass before any founder request)

| | test | needs a real DB? |
|---|---|---|
| A | scheduler claims a queued Work Order | yes |
| B | it creates an isolated writer | yes |
| C | the worker progresses | yes |
| D | the checkpoint persists | yes |
| E | kill the worker → supervisor recovers it | yes |
| F | kill the supervisor → restart reconstructs the queue | yes |
| G | a stale lease is recovered | yes |
| H | a duplicate worker is prevented | yes |
| I | conflicting file ownership is serialized | yes |
| J | already-completed evidence is reused | yes |
| **K** | **no ambient production credential path exists** | **no** |

K and the refusal paths need no database and are the security-critical half, so they go first.

Real PostgreSQL is required for the transaction and lease tests — `pg-mem` and friends do not model
`SELECT … FOR UPDATE SKIP LOCKED` faithfully enough to prove a claim is atomic.

**Environment as found:** no `psql` on PATH, no Docker, nothing listening on 5432, and the `pg` driver not
installed. npm is reachable (`pg@8.23.0` resolves), so a disposable local PostgreSQL is obtainable without
founder action. That is the plan; it is recorded here because "we could not test the lease logic" would
otherwise become a sentence in a later report.

---

## THE ONE FOUNDER ACTION, AT THE END

After local acceptance passes and `FACTORY_CONTROL_PLANE_SETUP.md` is written:

> **SET `FACTORY_RUNNER_PG_URL`** — a dedicated **non-production** control-plane database.

**No production credentials are requested, then or ever.**

---

## TARGET

Three computers — Home PC, Work PC, Mobile Laptop — running the SAME generic node bootstrap
(`brain-factory node start`), with the director scheduling on capabilities, conflicts, dependencies,
security role, candidate provenance and resource availability. No task assignment by the founder.

And the founder interface reduces to one sentence:

> **"Continue Brain OS development."**

with no terminals to manage, no computers to assign, no worktrees to create, no agents to restart, no
prompts to relay, no processes to monitor, and no next Work Order to dispatch by hand.

# Frozen-baseline lifecycle inventory: the certified engine's primitives and the rows that prove them

- **Owner:** the implementer's working record (measured facts, NOT a contract).
- **Baseline:** `69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6`, the semantic reference for the certified execution engine per the
  founder's directive. It is reproduced green on this machine in `qa/implementation/auto-enrollment-v1/evidence/baseline-69df2f52/` (acceptance 58/58,
  node_truth 46/46, …).

**Purpose.** The Director's compatibility contract requires that no operation is marked migrated until the OLD invariant has
executable regression coverage. This file records, for every lifecycle call of the frozen runtime:
- the OLD call site, its DB primitive, its transaction boundary, its authority check and its lease/fencing rule;
- the invariants it upholds;
- the certified rows that prove each invariant TODAY.

It deliberately has **no NEW columns**: endpoints, server primitives and authority checks for the new transport are defined by
the Director's canonical contract and are filled in only after that contract is consumed.

**Row sources:**
- `A-S3` = `qa/factory/acceptance.mjs`
- `N*` = `qa/factory/node_truth_acceptance.mjs`
- `CP-*` = `qa/factory/shared_control_plane_acceptance.mjs`
- `R*` = `qa/factory/reboot_recovery_acceptance.mjs`
- `founder_poke` = `qa/factory/founder_poke_not_required.mjs`
- `two_machine_failover` = `qa/factory/two_machine_failover.mjs` (a live-plane instrument; not run here)

## 1. The calls

| # | OLD CALL (69df2f52) | DB PRIMITIVE | TRANSACTION BOUNDARY | AUTHORITY CHECK TODAY | LEASE / FENCING RULE | Invariants upheld | Certified rows proving them |
|---|---|---|---|---|---|---|---|
| 1 | **register**: `claim.mjs:84 registerNode` (callers `node.mjs:351, 440, 667`; `plane-health.mjs:103`) | `insert into factory.nodes … on conflict (node_id) do update` of capabilities, **security_role**, platform, agent_version | one statement | none: shared `factory_runner` login; `node_id` and `security_role` come from the caller | `stamp:false` sets the heartbeat to the epoch ("never beaten") until a claim cycle completes; `onlyIfAbsent` writes nothing over an existing record | a check never changes a running worker's record; ALIVE only after a completed cycle | N1, N14, N23, N19, N8 |
| 2 | **idle beat**: `node.mjs:75 nodeBeat` | `with was as (select … for update) update factory.nodes set last_heartbeat_at = case when $5 …, security_role = $2, capabilities, agent_version` | one statement | none; **the worker re-asserts its own role every beat** | stamps liveness only when admission did not refuse | an idle node reads ALIVE; a demotion is undone within one beat (N2 REQUIRES self-assertion); an admission-refused node stamps nothing | N2, N39, N42, N22, R2 |
| 3 | **lease renewal**: `claim.mjs:361 heartbeat` (timer in `node.mjs:263 startHeartbeat`) | one CTE: update agent_runs (lease, heartbeat) → update surface_locks (lease) → update nodes (heartbeat) | one statement | `node_id` self-asserted | **fence** `run_id = $1 and node_id = $2 and status = 'in_progress'`; false = taken over → LOST → abort; timed on a monotonic clock from the claim's start; a hung renewal is superseded; a failed renewal is retried in 5 s | a busy node reads ALIVE; a run that cannot renew aborts before its lease lapses; slow links do not abort healthy runs | N5, N13, N21, N25, N31, N33, N34, N41 |
| 4 | **claim**: `claim.mjs:121 claimWork` → `claimInTransaction` | `begin; set local lock_timeout, idle_in_transaction_session_timeout` → `pg_advisory_xact_lock(hashtext('factory.claim'))` → expire lapsed leases → read the node's role and caps → pick (up to 8 attempts, `for update of wo skip locked`) → model-assurance gate → insert run → `authoring_run_id = run_id` → insert surface locks → work order `claimed` → commit | **one transaction**, serialized plane-wide by the advisory lock; 23505 / 54000 / 55P03 mean "nothing claimed" | role and caps are read from `factory.nodes` (a row the node writes itself); local resource admission runs BEFORE any SQL; the plane-wide heavy limit comes from the claimer's env `FACTORY_HEAVY_PER_PLANE` | lease from BEGIN; `started_at` at the INSERT (`clock_timestamp()`) | exactly one claimer wins; roles rank; capabilities are required; dependencies are respected; malformed surfaces never starve the queue; heavy limits are counted inside the lock; a dead claimer cannot hold the plane; an unproven model is declined for verifier work | A, H, I, I2, J, SEC1-SEC5, CAP1-CAP3, N1-N4 (assurance), S, S2, S3, N (lock), CP-3, CP-9, CP-10, CP-14, CP-15, CP-17, N11, N16, N28, N40 |
| 5 | **checkpoint**: `claim.mjs:387 checkpoint` | ① fence read → ② `insert into checkpoints … on conflict (checkpoint_id) do nothing` → ③ `update agent_runs` checkpoint fields | **three statements** (read, then write) | `node_id` self-asserted | a run that is no longer this node's writes no checkpoint (`LeaseLost`); a retry with the same `checkpoint_id` writes one row | progress persists; a taken-over run writes no more progress; a transient loss is retried once-only | C, D, M, N26, N26c |
| 6 | **complete**: `claim.mjs:420 completeRun` (+ `node.mjs:501` retry, `:514` landed check) | validation (done\|failed, termination reason, substitution needs a fallback reason) → one CTE: update run (fenced) → delete surface locks → update work order status | one statement | `node_id` **optional** (null = unfenced) | fenced on live ownership: a superseded run returns `{superseded:true}`; a failed run fails its work order in the same statement | all-or-nothing completion; no HTTP-success-without-terminal-condition; no silent model fallback; a taken-over run cannot complete the work order; a retried completion that landed is recognized | M, P, J, J2, M2-M5, N4, N26, N26i, CP-16 |
| 7 | **surface-lock acquire** (inside #4) | `insert into surface_locks` per surface; the PRIMARY KEY is the enforcement | inside the claim transaction | — | 23505 = the other node won | two runs never hold one surface; a repeated surface is one lock | B, I, I2, S, CP-8 |
| 8 | **surface-lock release** | delete at complete; delete expired at claim; `lease_expires_at = now()` at abort / orphan give-back | inside #4 / #6 / #13 / #14 | — | locks die with their run's lease | completing releases the surface | J2, CP-8 |
| 9 | **takeover / recovery** (inside #4) | `update agent_runs set status = 'queued', lease_expires_at = null, attempt_count + 1` (**node kept**) where the lease lapsed → `update work_orders set status = 'queued' where claimed` → delete expired locks; the handler reads the prior checkpoint | inside the claim transaction | — | only a REAL lease expiry makes work claimable again; the stale owner is fenced by #3 / #5 / #6 | a dead node's work is resumed from its checkpoint, not restarted; the attempt is counted; the abandoned run keeps the node that ran it | G2, G3, L, L2, L3, L4, CP-5, CP-7, `two_machine_failover` |
| 10 | **verification claim** (inside #4) | role-rank filter on `requires_security_role` + the model-assurance gate; the verify work order points at its run through **handoff JSON** | inside the claim transaction | the node's self-written role | — | a generic node never gets verifier work; an unproven model is declined | SEC1-SEC4, CP-9, N1-N2 (assurance), CP-17, N27, N27b |
| 11 | **certification**: `claim.mjs:48 recordVerification` (from `factory-acceptance.mjs:98`) | read the verifying run's node → `update agent_runs set verification_run_id, verification_node_id where run_id and (status = 'done' or run_id = $2 or authoring_node_id = $3)`; the CHECKs `verification_is_independent` / `verification_node_is_independent` refuse self | 2-3 statements | **not fenced to the caller**; any `verificationRunId` accepted; the verifier's role not checked | only a `done` run is verifiable | a run never verifies itself; the authoring node never verifies its own run; a failed run is not verifiable | CP-11, N12 |
| 12 | **orphan give-back**: `node.mjs:244 giveBackOrphans` | one CTE: runs of this node in progress with a live lease not held by this process → `lease_expires_at = now()`; their locks likewise | one statement | `node_id` self-asserted | gives back claims whose COMMIT reply was lost | an orphaned claim is not left unworked for a lease | N29, N29b |
| 13 | **abort give-back**: `node.mjs:283` | `update agent_runs set lease_expires_at = now() where run_id and node_id and in_progress`, then the same on `surface_locks` by run | two statements, best effort | `node_id` self-asserted | an aborted run gives its lease back at once | an aborted run is recoverable immediately | N13, N33 |
| 14 | **run setup**: `node.mjs:461, 467` | read the work order's type, title, handoff, surface, required role; update the run's worktree, branch, base_commit | separate statements, retried | — | — | the read right after a claim survives a transient loss | N30 |
| 15 | **status / health**: `node.mjs:129 nodeStatus`, `:556 health`, `plane-health.mjs` | `pg_stat_ssl`, the nodes row, schema / role reads, a deliberate DDL probe | reads (+ the probe) | — | read-only | a health check changes nothing; status asks three times before UNREACHABLE | N1, N36, N24, N35b |
| 16 | **acceptance hand-over** (test-only): `factory-acceptance.mjs:73-80` | read checkpoints by work order; `update work_orders.requires_capabilities`; lease +10 s on the run and locks | separate statements, **unfenced** | none | — | the failover instrument is reproducible | `two_machine_failover`, N3 |
| 17 | **director**: `director.mjs` lease / tick / transition / notifications | `director_lease` row lock; `work_orders` director fields; `founder_notifications` | per operation | shared login | director lease | no founder poke is needed to advance work; a restarted director reconstructs state without duplication | `founder_poke` 12 rows; note `tick` orders `priority desc` on TEXT (`director.mjs:157`) |

## 2. Process-level invariants of the runtime (not SQL, but part of "the certified engine")

| Invariant | Rows |
|---|---|
| one worker per node identity; one supervisor per state directory, whatever the path spelling | N9, N9b, R6 |
| crashes restart automatically with backoff (5 s → 5 min, monotonic); orphans killed only by instance token | R3, R5, N7, N38, N38u, N8 |
| transient plane losses are retried inside the worker, not by the supervisor | N6, N26, N30, N32 |
| no credential in any log line | R8 |
| a clean `--stop` | R7 |
| the commit and handler version a node runs are recorded; evidence counts only at the commit under acceptance | N14, N15, N20 |
| the acceptance handler completes only what it carried out | N3, N10 |

## 3. Known gaps of the baseline (why the transport change exists; facts only)

- Authority is self-asserted (rows 1, 2, 4, 10). N2 requires it.
- One credential is shared by every node. Rows 6 and 11 can be unfenced to a caller.
- No verification gate: row 6 sets an implementation work order `done` and releases its dependents.
- Resource admission precedes authorization (row 4). Priority is text-ordered (rows 4 and 17).
- The machine identity in evidence is the self-reported hostname.
- The runtime requires a git checkout.
- Mixed fleet: a new claim path running beside frozen-code nodes must take the same `hashtext('factory.claim')` lock, or row 4's
  heavy counts race.

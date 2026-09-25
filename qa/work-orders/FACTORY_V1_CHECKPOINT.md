# FACTORY V1 — DURABLE CHECKPOINT (for a fresh Claude Code session)

## 0. RESUME HERE — 2026-09-25, packaging fix: final verification 4 applied, certification protocol running (NOTHING PUSHED since `ee2fce2b`)

- **Published remote** `factory/computer-agnostic-control-plane` = `ee2fce2b` (the founder found it cannot `npm ci`: no lock, `pg`
  undeclared). **No SHA goes to the Work PC until the certification protocol below has finished and the REMOTE is re-verified
  from a fresh clone.** The frozen SHA and every measurement on it are recorded in ledger 217 of the candidate repo
  (`C:\Users\Dell\dev\brain-os-wo-resolver\qa\KNOWN_FAILURE_MODES.md`), never in this file (writing it here would change it).
- **The founder's certification protocol (2026-09-24, binding):** (1) apply every confirmed finding; (2) freeze HEAD; (3) ONE final
  independent verification against that exact SHA - the verifier reports the SHA it inspected, and no implementation change
  follows it; (4) package regression + mutation proofs on that SHA; (5) the full composer on that SHA; (6) MEASURED == APPLIED
  (the live Home node restarted on it) == FROZEN == REBUILT (the fresh remote clone); (7) only then push, with exactly
  `git -C C:/Users/Dell/dev/brain-os-factory-cp push -u origin factory/computer-agnostic-control-plane`; (8) fresh-clone the remote
  (`git -c http.sslBackend=schannel clone`): HEAD == frozen, lock present, `pg` declared, `npm ci`, deps, bootstrap / install /
  status, regressions green; (9) ledger 217 + CHECKPOINT (candidate repo), bundles, memory; report the remote SHA. Do not touch
  master, production or Edge.
- **Rounds 1-3** (wf_0bc2563b-650, wf_6627f6cf-dbc, wf_f5622b3e-b8f): every confirmed finding fixed with a regression row and a
  mutant where plantable - the locked-closure dependency check, the one env-file judge, the supervisor's identity as a lock (control
  pipe), headless console, watchdog trigger, start confirmed by the node on the plane, claims only handled work types, no hang
  (timeouts), no claim holding the plane (lock/idle limits), the lease fence on checkpoint and completion.
- **Round 4, wf_fc1cfe41-b29** (against `6806e885`; every finding reproduced by two refuters): fixed in `78516d01`, `78d3c923`,
  `b6a74d12` and the round-4 completion commit: the installer never runs another checkout's scripts; the production guard decodes
  escape by escape; a completion is ONE statement; the supervisor re-reads runner.env before every restart and `-Start` restarts a
  supervisor in backoff; `transaction_timeout` on every session; the URL must name user, password, port and database; and from the
  critic and the Work-PC probe: [high] the documented health checks demoted a running verifier to generic -> the plane's role is
  kept, the worker re-asserts its role every beat, `-Verify`/`-Start` compare the plane's role; unknown acceptance actions reported
  done -> they fail by name; a failed run stranded its work order in `claimed` -> it fails in the same statement, health names
  stranded ones; a busy node read STALE -> the run heartbeat stamps the node; one transient error ended the worker and short losses
  walked the backoff to 5 min -> retried in the worker, backoff reset on registration; `-Status` ALIVE during a backoff -> NOT
  RUNNING; a bare `%` made pg corrupt the CA path -> refused by the judge; `-Start -WatchdogMinutes/-LogDir` ignored -> re-installs.
  New suite `qa/factory/node_truth_acceptance.mjs` (N1-N7) and `qa/factory/acceptance_mutation_proof.mjs` (rows M-Q, N1-N7).
- **The final verification of `340da680`** (wf_9c46743b-d83; every agent reported inspecting exactly `340da680`) confirmed
  defects, every serious one reproduced by a refuter, so `340da680` was NOT certified and NOT pushed: [high] a claim-failing
  worker crash-looped every 6 s while reading ALIVE; [high] an unbounded connection close hung a worker that still looked healthy;
  [high] nothing recorded which commit a node ran (a Work PC on an older checkout passed the two-machine acceptance); [medium] health
  checks made a dead node read ALIVE; [medium] a verify of a FAILED run was recorded as verified; [medium] a node cut off from the
  plane kept working after its lease lapsed (two machines on one surface); and lows (claim-lock busy silent, NULL/repeated surfaces,
  bootstrap without --role, two workers per node id, stale 'was' role, handler arguments, class-22 retries, -Status -EnvFile ran the
  owner's code, the provisioner's port). All fixed with rows and mutants (acceptance R, S, G3; node_truth N8-N15, N9b). Registered,
  bounded: a node refusing admission reads ALIVE to the Home PC; no attempt ceiling for runs that keep throwing; RS-C* read other
  worktrees. The protocol then runs again from step 2 on the new HEAD.
- **The final verification of `6b2d323c`** (wf_d0a23f04-8f3; every agent inspected exactly `6b2d323c`) confirmed every earlier fix
  under stronger reproductions and found, reproduced by refuters, no high defect but: [medium] -Start did not restart a healthy node on
  an older commit than its checkout and -Verify did not notice (so the fix two_machine_real prints was a no-op); [medium] a stale
  claim-lock BUSY record survived a worker restart; [medium] eight or more malformed work orders still starved the queue (an oversized
  surface crash-looped it); [medium] health said "can claim work" during a supervisor backoff; [medium] S3 and composer row 3 counted
  runs by another node or commit; and lows (dirty evidence counted, row 4 counted an unfinished verifying run, a re-registered node read
  STALE for a beat). All fixed with rows and mutants (acceptance S2; node_truth N16, N19, N20, N8 health; regression F6 commit check).
  Registered, bounded: more than eight assurance-declined work orders starve a node that requests a model (none does today).
  Its Work-PC probe added: [medium] over a slow link one failed lease renewal aborted a healthy run (the guard raced the next renewal)
  -> a failed renewal is retried in 5 s, the guard judges the lease from the last landed renewal's start with a margin of at most 5 s,
  an aborted run gives its lease back; [low] a first claim cycle refused by admission counted as ready -> only an admitted cycle
  (node_truth N21, N22). Its critic added: [high] the runbook's own two_machine_scheduling / two_machine_failover registered the
  checkout's node id and erased the running node's commit and acceptance capabilities (it silently stopped claiming while every check
  read healthy) -> their own node ids, commit-stamped runs and checkpoints; the worker re-asserts its whole registration every beat;
  -Verify flags a record with no commit (node_truth N23); [medium] edits made during a two_machine_real run became the run's code
  through its own die restarts -> the per-row '<sha>+dirty' refusals (e5afa147) make such evidence count for no commit.
  Operational recommendation (NEXT, not done): run the Home node from a dedicated clean clone, not the implementer's worktree.
- **The final verification of `18bce497`** (wf_25776cde-e0e; every agent inspected exactly `18bce497`) confirmed every earlier fix
  and found, each reproduced by a refuter, no high defect but: [medium] the lease guard timed the lease from the claim's return while
  the plane stamps it at the claim's BEGIN (a claim that waited on the claim lock was aborted only after another node took its
  surface) -> timed from the claim attempt's start; [medium] the oversized-surface exclusion counted characters while the lock key
  limit is bytes (a 1000-character multibyte surface on the UTF8 plane crash-looped every node) -> octet_length, and 54000 is
  "nothing claimed"; [medium] the installer's commit check ignored dirty -> head and dirty compared, -Status prints a commit line;
  and lows: two_machine_scheduling verified an unfinished run -> only a finished one; health said "can claim work" over a refused
  admission or a busy claim lock -> NOT CLAIMING; -Stop raced the watchdog -> disabled first, stopped, re-checked; -Start confirmed a
  restarted worker with its predecessor's heartbeat -> readyAt and a beat since the current worker started. Found while fixing them:
  a renewal in flight when a run completed was read as a takeover (a completed run logged LOST and ABORTED) -> the heartbeat is
  settled once the work is over. Rows and mutants: acceptance S3 (a UTF8 database of its own), node_truth N13 (claim lock held
  12 s), N24 (beside a real supervisor), N25 (a relay holding the last renewal past the completion), regression F6 dirty/clean;
  mutants N13c, N24, N25, S3, F-DIRTYCHECK. The acceptance mutation proof runs from factory-cp (row I reconstructs from this
  branch, which a clone of another worktree lacks) and prints a crashed suite's output.
Its Work-PC probe added (reproduced by a refuter): [medium] a transient plane loss at a run's completion or checkpoint threw the
  finished run away - its claim looked live for a lease while nothing ran it, and the work was done again -> both are retried like a
  claim; a checkpoint carries its own id, and a retried completion that finds the run finished by this node is its own (node_truth
  N26; mutants N26, N26s, N26c, N26i); [low] -Start restarted a healthy, busy node on one failed status probe, and printed 'tls off' for
  a TLS state it had not read -> the probe is asked three times, a node that has completed its claim cycles is left alone ('cannot
  judge', exit 5), 'not read'; [low] after the checkout moved, a worker restarted by the old supervisor passed -Verify -> the supervisor
  records its commit, which -Verify, -Status and -Start compare; [low] -Status read ALIVE for a worker that had not completed a claim
  cycle -> NOT CONFIRMED, and -Verify fails (regression F6, which now also holds node-only commit and dirty cases so the node's own
  check stays proved; mutants F-SUPCOMMIT, F-UNREADY, F-LEAVEALONE). Its critic added (reproduced by a refuter): [medium]
  NODE_TLS_REJECT_UNAUTHORIZED=0 in the user's environment turned verify-full off - a node registered and claimed work on a server
  another CA certified, and every check said tls on -> db.mjs sets rejectUnauthorized itself whenever pg left it unset (TLS suite T8;
  mutant T8); [medium] at internet latency the claim's own round trips used up the lease guard's margin -> the same class as the lease
  finding above, closed by timing the lease from before the claim began (N13, N13c).
  Unit suites: RS-C6 (round-state) reads the closed Edge campaign's worktree and fails there whatever this branch holds - registered,
  not touched.
- **The final verification of `9e0af976`** (wf_e3e30106-da6; every agent inspected exactly `9e0af976`) found, reproduced by refuters
  where medium, no high defect but: [medium] -Start blamed "admission refuses its claims" for a worker that could not reach the plane
  (the pattern missed 'admission: claiming', and a previous worker's admission record and refusal were repeated) -> only the current
  worker's log lines and records count, each worker removes its predecessor's records (N28, F6 startDead; mutants N28, N16, F-ADMISSIONLOG);
  [medium] two_machine_scheduling failed with the verifier's wave first -> the wave runs twice the hold and a minute, and each node takes at
  most one conflict work order (N27, N27b); [medium] one lease renewal that HUNG (a path that stopped forwarding fails only at the 60 s
  statement timeout) held every later one back and a healthy run was aborted and restarted from zero -> a renewal in flight longer than
  max(10 s, lease/6) is followed by another (N33); and lows: a claim whose COMMIT reply was lost, and the reads right after a claim, and the
  acceptance handler's own statements, threw a run away or left it unworked for a lease -> given back / retried (N29, N30, N32); the first
  renewal was due a third of the lease after the claim RETURNED, so a slow claim was aborted again and again -> after the lease began
  (N31); the lease guard ran on the wall clock -> monotonic (N34); -Verify read another checkout's env file and probed its plane -> it
  stops there (F6; F-VERIFYOTHER); status and -Status read the plane once -> three tries in node.mjs status, one connection for the record
  and TLS (N36); the runbook's scripts read FACTORY_RUNNER_PG_URL raw (the copied runner.env's CA path failed) and crashed on one reset ->
  they read the env file as the node does and end on one line (N35); the TLS suite's teardown could leave an io worker -> local_pg's
  stopServer (T9). The node's supervisor-commit, node-only commit/dirty checks gained F6 steps so each installer check keeps a mutant.
  Its critic added: [low] two_machine_real crashed on one transient error with exit 1 (the code of FAIL) -> retried, INCONCLUSIVE exit 4
  (N37); [low] composer row 2 counted a failover whose takeover never completed -> completed failovers only (N20; N20d). node_truth rows
  run one at a time for the mutation proof (FACTORY_NT_ROWS): the suite takes about twenty minutes whole.
- **Live state**: plane `npvhuoozkbexddnvkqsj` healthy; Home node `node-4d4a74dd` generic under the task (conhost --headless,
  control pipe, watchdog), to be restarted on the frozen SHA (APPLIED). Local plane on 54329. Backups:
  `C:\Users\Dell\dev\backups\factory-cp-2026-09-24-*.bundle`.
- **After the push**: the Work PC clones the branch at the reported SHA, `npm ci`, copies `runner.env` + the CA to
  `%USERPROFILE%\.brain-factory\`, runs `install-autostart.ps1 -Preflight`, then `install-autostart.ps1 -Role verifier -Start`, and
  replies with its node id (gate A); then `two_machine_real.mjs run` from the Home PC, then the composer.

## 1. Where things are

| what | where |
|---|---|
| Factory control-plane repo (this) | `C:\Users\Dell\dev\brain-os-factory-cp`, branch `factory/computer-agnostic-control-plane` |
| deploy candidate repo (frozen Edge candidate `db9781c8`, ledger `qa/KNOWN_FAILURE_MODES.md`, `qa/verification/CHECKPOINT.md`) | `C:\Users\Dell\dev\brain-os-wo-resolver`, branch `wo/clarification-resolver` |
| invitation branch (BUG-035/036/037 work, gates, BUG-036 inspection) | `C:\Users\Dell\dev\brain-os-invite`, branch `wo/invitation-delivery` |
| control repo (verifier records, milestone 7 logs) | `C:\Users\Dell\dev\brain-os`, branch `p1/execution-truth-governance` |
| bundles (restore-tested) | `C:\Users\Dell\dev\backups\*-plane-live.bundle` and later stamps |
| the founder's rulings | `brain-os/qa/verification/FOUNDER_RULING_2026-09-17_FINITE_EDGE_TERMINATION.md`; the 2026-09-22 order is quoted in ledger 215/216 |

## 2. The control plane (LIVE)

- Dedicated Supabase project **`npvhuoozkbexddnvkqsj`** (created exclusively for the Factory; NOT the Brain OS product), reached
  through the Session Pooler `aws-0-ap-northeast-1.pooler.supabase.com:5432` as `factory_runner.<ref>`, PostgreSQL 17.6,
  TLS 1.3 **verify-full** against the pinned Supabase Root 2021 CA. `factory.plane_identity = npvhuoozkbexddnvkqsj`.
- Credential: `C:\Users\Dell\.brain-factory\runner.env` (one line, `FACTORY_RUNNER_PG_URL=…`; ACL: this user only) and the CA
  `C:\Users\Dell\.brain-factory\supabase-root-2021-ca.crt`. **Never print, copy into arguments, or commit the URL.**
  `FACTORY_RUNNER_PG_URL` is NOT in the user environment; every tool loads it from the file: `--runner-env <file>` for node.mjs,
  plane-health.mjs and the runbook's scripts (the supervisor's `--runner-env`/`--env-file`), which resolves a copied file's CA path to
  the copy beside it. A URL exported into a shell by hand has its CA path resolved the same way by db.mjs.
- Provisioned by `scripts/factory-runner/provision-control-plane.mjs --allow-dedicated-supabase npvhuoozkbexddnvkqsj
  --write-env …` (re-run rotates the password; the accessor refuses the production project by name everywhere).
- Brain OS production: **untouched**. No Edge verifier round since #105 (campaign CLOSED under the ruling).

## 3. The Home node (this PC)

- Identity `node-4d4a74dd-4035-4d34-9cac-d2d1a8050d37` (`.factory/node-id`), role **generic**, hostname `DESKTOP-MDPE6FS`.
- Runs under the Windows Scheduled Task **BrainOS Factory Node** → `scripts/factory-runner/node-supervisor.mjs` →
  `node.mjs start`. Logon-triggered (a boot trigger needs one elevated run of the installer; Windows refuses AtStartup to a
  standard user). Logs: `C:\Users\Dell\.brain-factory\logs\node-<date>.log`. State: `.factory/node-status.json`.
- Commands (PowerShell, from the repo): `install-autostart.ps1 -Status | -Start | -Stop | -Verify | -Uninstall`;
  `install-autostart.ps1 -Status` reads the task's own env file and prints the node's liveness (ALIVE / STALE / NOT REGISTERED /
  UNREACHABLE); from a shell, `node scripts/factory-runner/node.mjs status --runner-env ~/.brain-factory/runner.env`.
- If `-Status` says STALE after a reboot and the task did not start: `install-autostart.ps1 -Start` (alone: starts the installed
  task as it is, role unchanged, and confirms the supervisor).
- The local embedded plane (`qa/factory/shared_local_pg.mjs start`, loopback 54329) is only for the 18-row local suite; it is
  not running after a reboot and must be started detached before `shared_control_plane_acceptance.mjs`.

## 4. What is PROVED (exact suites; run them, do not trust this table)

| suite | count | engine |
|---|---|---|
| `qa/factory/acceptance.mjs` | 58/58 (A-S3) | disposable PostgreSQL 18 |
| `qa/factory/node_truth_acceptance.mjs` | 37/37 (N1-N37) | disposable plane, real worker and supervisor processes |
| `qa/factory/acceptance_mutation_proof.mjs` | every mutant killed (M-S3, N1-N37, T8), run from factory-cp; node_truth mutants one row each | sparse clones with one fix reverted each |
| `qa/factory/health_check.mjs` | 10/10 | disposable |
| `qa/factory/founder_poke_not_required.mjs` | 12/12 | disposable |
| `scripts/factory-runner/db.regression.test.mjs` + `runner-env.regression.test.mjs` | 32 tests | pure |
| `qa/factory/shared_control_plane_acceptance.mjs` | 18/18 | local embedded plane, real processes |
| `qa/factory/tls_plane_acceptance.mjs` | 9/9 (T1-T9) | disposable TLS server on the LAN address |
| `qa/factory/dedicated_supabase_provisioning.mjs` | 11/11 | disposable TLS server dressed as Supabase |
| `qa/factory/http_provider_acceptance.mjs` | 9/9 | stub provider + disposable plane |
| `qa/factory/reboot_recovery_acceptance.mjs` | 9/9 | disposable plane + the live scheduled task |
| `qa/factory/shared_plane_live_acceptance.mjs` | 11/11 | **the LIVE plane**, from this machine |
| `qa/factory/two_machine_real.mjs run` | every row green, verdict SAME MACHINE | **the LIVE plane**, two supervised nodes on this machine |
| `qa/factory/package_bootstrap_regression.mjs` | 22/22 (K1-K7, F1-F15) | FRESH clones of HEAD installed from the committed lock (runtime-only and full), a disposable plane |
| `qa/factory/package_bootstrap_mutation_proof.mjs --fresh` | control green, every mutant killed incl. the published defect `ee2fce2b` | clones with one planted defect each |
| `qa/factory/factory_v1_acceptance.mjs` (composer) | HOLD: 0 failed, only founder/Work-PC rows open | all of the above + plane rows |

Candidate-repo suites (invitation branch): ten invitation suites 116 green / DS-D1 red by design; `gate_202609110001.mjs` 6/6;
`gate_invitation_deploy.mjs` 6/6; `bug036_auth_inspection.mjs --selftest` 7/7.

## 5. Defects found and closed by these proofs (ledger 211–217 in the candidate repo)

2026-09-24 (ledger 217, found by the founder on the published branch): no package-lock.json and `pg` undeclared, so a fresh clone
could not `npm ci`; a supervised node on such a clone crash-looped on ERR_MODULE_NOT_FOUND; the bootstrap redirected into a
`.factory/` that a fresh clone does not have; shell scripts checked out CRLF; the regression's first import scan was a regex that read
a package name out of a string literal (caught by its own mutation proof's control).


lease expiry left the work order `claimed`; a run could verify itself; a plane restart rotated the credential; orphaned
postgres workers; the real node never requested a model; a declined work order starved the node; a verifier node demoted
to generic on every start; the provisioner applied one schema file of three; the accessor accepted plaintext across a
network; the pg driver's TLS modes are not libpq's; a WIN1252 harness database; the shared acceptance contaminated by its
own leftovers and tripped by its own admission control; an idle node indistinguishable from a dead one; nothing restarted a
node after a reboot; a heavy-job limit that was a count, not a lock; twelve worktrees created for acceptance runs.

## 6. THE GATES (the only things that stop the Director)

**A — Work PC.** On the Work PC, from a FRESH clone of this branch at a commit that contains `package-lock.json` (the
2026-09-24 packaging fix; before it a fresh clone could not `npm ci` - ledger 217):
0. `git clone --branch factory/computer-agnostic-control-plane https://github.com/Steppe-AI-Inc/brain-os.git brain-os-factory-cp`,
   `git rev-parse HEAD` equal to the SHA the founder handed over, then `npm ci` (installs exactly the committed lock; the node itself
   needs only `pg`, the acceptance harnesses need the dev packages too). `node scripts/factory-runner/deps.mjs` must print
   "runtime dependencies installed at their locked versions";
1. copy `runner.env` and `supabase-root-2021-ca.crt` into `%USERPROFILE%\.brain-factory\` there. Nothing is edited: every
   reader goes through `scripts/factory-runner/runner-env.mjs`, which resolves the CA path recorded on this PC to the copy beside
   the env file on that PC (proved against the live plane with a foreign path);
2. `powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Preflight` (checks only; exit 0 needed),
   then `... -Role verifier -Start` (must print "started: supervisor pid N ... role verifier"), then `-Status` (node ALIVE, role
   verifier, tls on). Every gate refuses by name - missing or damaged dependencies (`npm ci`), a CA not copied, a bad env file - and
   the supervisor exits (5 or 2) naming the fix rather than crash-looping;
3. back on the Home PC: `node qa/factory/two_machine_real.mjs nodes` (both ALIVE, two hostnames), then
   `node qa/factory/two_machine_real.mjs run` → expect **TWO MACHINES**; then `node qa/factory/factory_v1_acceptance.mjs`
   (with the env loaded) → the real-failover, scheduling and verification rows turn OK. A third machine (laptop) bootstrapped
   the same way satisfies the three-machine row.

**B — founder credential.** `DEEPSEEK_API_KEY` on the serving node (the HTTP path is built and proved on a stub);
`SUPABASE_ACCESS_TOKEN` for one run of `qa/verification/bug036_auth_inspection.mjs` on the invitation branch.

**C — founder authorization.** Moving `supabase/drafts/202609110001_invitation_delivery_state.sql` into `supabase/migrations/`
(gate 6/6 satisfied); the production web deploy of `wo/invitation-delivery` at `a593f82b` (gate 6/6 satisfied); optionally the
elevated run of the installer for a boot-time trigger.

## 7. Standing rules that still bind

No Edge verifier round unless a NEW reproducible P0/P1 execution-authority defect (ruling §2). Never touch Brain OS
production, Auth, SMTP, secrets, rulesets, or `master`. Do not move the Factory V1 finish line. Independent evidence outranks
implementer confidence. Certification cites only materialized artifacts. Keys are never stored on the plane.

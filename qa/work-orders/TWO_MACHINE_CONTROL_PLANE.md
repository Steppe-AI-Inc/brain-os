# TWO-MACHINE FACTORY CONTROL PLANE — ACCEPTANCE PACK

**Prepared 2026-09-18** under the founder's order of the same day ("prepare the REAL two-machine Factory control-plane
acceptance"). Everything below that needs no founder credential and no network change is built and rehearsed on one
machine. **One founder action remains, in §0.** Nothing here touches production, and nothing can: the accessor refuses a
production URL before opening a socket (§A, tested).

The one-machine shared-plane proof (`shared_control_plane_acceptance.mjs`, 18/18) is not repeated here. What this pack
adds is the network: TLS, a least-privilege role judged on the server, two clocks, two hostnames.

---

## 0. THE ONE FOUNDER ACTION — DONE 2026-09-18 (plane LIVE; Home node ALIVE under the scheduled task since 2026-09-22)

> **FOUNDER DECISION 2026-09-18: the control plane is the dedicated Supabase project `npvhuoozkbexddnvkqsj`, created
> exclusively for the Factory and holding no Brain OS data.** The default provisioner rule (a Supabase project is refused on
> its platform schemas) is unchanged; `--allow-dedicated-supabase npvhuoozkbexddnvkqsj` is the one explicit exception, for
> that ref only, proved by `qa/factory/dedicated_supabase_provisioning.mjs` (10/10 on a disposable TLS server dressed as a
> Supabase project).

**The one command**, in PowerShell, from `C:\Users\Dell\dev\brain-os-factory-cp`, with the project's **Session Pooler** URL
(Dashboard → Connect → Session pooler; user `postgres.npvhuoozkbexddnvkqsj`, port 5432):

```
$env:FACTORY_CONTROL_PLANE_ADMIN_URL="<session pooler url>"; node scripts/factory-runner/provision-control-plane.mjs --allow-dedicated-supabase npvhuoozkbexddnvkqsj --write-env "$env:USERPROFILE\.brain-factory\runner.env"
```

What it does, in order, and stops at the first refusal:
1. refuses the production project by name; verifies the connection's identity carries exactly `npvhuoozkbexddnvkqsj`;
2. downloads the Supabase Root 2021 CA once to `~/.brain-factory/` and refuses it unless its sha256 matches the pinned value;
   connects with **verify-full** (chain and hostname; never `rejectUnauthorized=false`) and checks the session is encrypted on
   the server (`pg_stat_ssl`) — on a certificate mismatch it prints the certificate the server presented and stops.
   *Verified 2026-09-18 without a credential:* the Session Pooler endpoints (`*.pooler.supabase.com`) chain through the
   Supabase Intermediate 2021 CA to the pinned root, and the exact verify-full handshake the provisioner performs is
   AUTHORIZED over TLS 1.3; the direct host `db.<ref>.supabase.co` does not resolve from this machine (IPv6-only), so the
   pooler is the path;
3. allows the platform schemas and the platform's empty migration history for this ref only; still refuses any business
   table or an applied migration history;
4. applies `001`–`003`; creates or re-shapes `factory_runner` (LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
   NOBYPASSRLS NOINHERIT); grants CONNECT, USAGE on `factory`, DML on its tables; **revokes** CREATE on the database, everything
   on `public` and on every platform schema, and membership in every platform role; records `factory.plane_identity`;
5. **proves the boundary as the runner on a fresh TLS connection** (cannot read auth/storage/realtime/history, cannot create
   a schema or a table anywhere, cannot become service_role/postgres, can read and write `factory`) — a failed proof writes
   nothing;
6. writes `FACTORY_RUNNER_PG_URL=postgresql://factory_runner.npvhuoozkbexddnvkqsj:…@<pooler>:5432/postgres?sslmode=verify-full&sslrootcert=<CA path>`
   to the env file and prints host, database and role — never the URL.

Then, on the Home PC:
```
bash scripts/factory-runner/bootstrap-node.sh --role generic --env-file "$env:USERPROFILE\.brain-factory\runner.env"
```
On the Work PC: a fresh clone of this branch, then `npm ci` (the committed `package-lock.json`; since 2026-09-24 - before it a
fresh clone could not install, ledger 217); copy `runner.env` and the CA file (`~/.brain-factory/supabase-root-2021-ca.crt`) to the
same folder there — the CA path inside the env file is resolved to the local copy by `runner-env.mjs`, so nothing is edited — then
`install-autostart.ps1 -Preflight` (exit 0), then `install-autostart.ps1 -Role verifier -Start` (§H; it prints "started:
supervisor pid N ... role verifier" only when the task's supervisor is confirmed running), then `install-autostart.ps1 -Status`
(node ALIVE, role verifier, tls on). Copy the files; do not re-save them in an editor (a re-save is decoded if it is UTF-16 or
has a BOM, but a changed value is refused by name). `bootstrap-node.sh --role verifier --env-file …` runs the same checks from
bash and `npm ci` itself when needed; on Windows it then prints the installer command as the next step.
Install with `npm ci` only - never `npm install` (npm 10 rewrites the committed lock). Node 20 or newer; npm 11 or newer
enforces the `allowScripts` decisions (npm 10 runs every locked install script - all of them are approved, so nothing extra runs,
but nothing is enforced either). Windows on ARM needs an x64 Node for the acceptance harness: embedded-postgres publishes no
win32-arm64 build, and `deps.mjs --dev` says so by name. The dependency check covers the whole locked tree, not just
`pg`: a node_modules missing any package pg loads is refused, not crash-looped.
`qa/factory/package_bootstrap_regression.mjs` proves this path on fresh clones; run it on any machine before trusting it.
**Reply with:** "shared plane is up" and the two node ids the bootstraps print. Never the URL.

Rotation is the same command again (the password rotates, the identity is kept). `--force` is refused alongside the flag.

---

## A. EXACT CONNECTION REQUIREMENTS

| requirement | how it is met | where it is enforced |
|---|---|---|
| no production database authority | the plane is a separate database holding only the `factory` schema; the accessor refuses any URL naming the production project (`pvphxgrtdfrudejjhzjk`, anywhere in the URL, even over TLS), and any superuser (`postgres`, `supabase_admin`, `postgres.<ref>`) | `db.mjs assessUrl()` before a socket opens; `provision-control-plane.mjs` refuses business tables, platform schemas, migration history |
| dedicated least-privilege role | `factory_runner`: LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT; CONNECT on the database, USAGE on `factory`, DML on its tables, nothing else | the provisioner asserts the attributes on create *and* on re-run; `plane-health` reads them back from `pg_roles` and proves the **server** refuses `CREATE TABLE` (42501) |
| no business tables | the plane never holds `companies`, `people`, `profiles`, `goals`, `tasks`, … | `node.mjs health` fails if any appear; the acceptance suite fails on a foreign key leaving the schema |
| TLS / private network | any non-loopback host must carry `sslmode=require`, `verify-ca` or `verify-full` (the exact form per certificate is in §0 step 2); `disable`, `prefer`, `allow` and absence are refused; loopback may be plaintext | `db.mjs assessUrl()`; `plane-health` then proves TLS is **in use** on the backend (`pg_stat_ssl`), not merely requested; `tls_plane_acceptance.mjs` proves the whole node path over TLS on this machine's own LAN address against a server that REJECTS plaintext (`hostnossl … reject`), and that a wrong root certificate is refused - also with `NODE_TLS_REJECT_UNAUTHORIZED=0` in the environment (T8: pg left verification to that variable, and a node claimed work on a server another CA certified while every check said tls on; `db.mjs` now sets it itself) |
| no public unrestricted port | the database is either a managed instance (password + TLS only) or listens on a private interface with `hostssl` rules | infrastructure; the `pg_stat_ssl` row catches a downgraded session, the role rows catch an over-privileged one |
| same URL semantics on both nodes | one variable, `FACTORY_RUNNER_PG_URL`, read by one accessor; identical bootstrap; the role is `FACTORY_NODE_ROLE`, not the machine | `node.mjs`, `bootstrap-node.sh` |
| fail closed if the URL is missing or unsafe | missing → refusal with no fallback; unsafe → refusal *before* the driver loads and before any byte of the password leaves the process | `db.regression.test.mjs`: `NO_FALLBACK_TO_AMBIENT_AUTHORITY`, `FAIL_CLOSED_ON_AN_UNSAFE_URL` (20 URLs judged), `an unsafe URL is refused by read()` |
| clocks | each node's skew from the **server** clock under 5 s (lease 120 s, heartbeat every 40 s) | `plane-health` |

`FACTORY_FORBIDDEN_HOST_MARKS` (comma-separated) lets an operator declare further forbidden hosts (a staging copy of
production, say). It can only add refusals.

---

## B. HEALTH CHECKS

Run on each node, in this order; each stops at the first failing link and names it. None prints the URL.

| command | proves |
|---|---|
| `node scripts/factory-runner/node.mjs health` | URL present and judged safe; connected as a non-superuser; schema present; queue readable; registered (**the role the plane holds is kept** - a check never changes a running node's role, nor stamps its liveness; a different `FACTORY_NODE_ROLE` in the shell is said, not written); PostgreSQL ≥ 13; no business tables; the accessor spawns nothing; work orders `claimed` with no run in progress, and failed ones, named |
| `node scripts/factory-runner/plane-health.mjs [--role <r>] [--runner-env <file>]` | all of the above, then: TLS **in use** on this backend; role attributes on the server; the server refuses DDL; `001`+`002`+`003` applied; clock skew and round trip within limits; registered - as `<r>` when `--role` is given (the bootstrap passes it), else with the role the plane holds; which other nodes and **which other hostnames** this plane has seen in 24 h |
| `node scripts/factory-runner/monitor-gc.mjs list` | no stale monitors on this node (milestone 5) |

Exit 0 healthy, 1 otherwise; `--json` appends the rows as JSON for a record.

---

## C. HOME-PC NODE BOOTSTRAP

```
setx FACTORY_RUNNER_PG_URL "<url>"            # once; open a new shell afterwards
bash scripts/factory-runner/bootstrap-node.sh --role generic
FACTORY_NODE_ROLE=generic node scripts/factory-runner/node.mjs start     # when it should claim work
```
The Home PC is a **generic** node: implementation and generic work. It may also run `FACTORY_MODEL_PROVIDER` /
`FACTORY_MODEL` for the assurance gate (milestone 6).

## D. WORK-PC NODE BOOTSTRAP

```
setx FACTORY_RUNNER_PG_URL "<url>"
bash scripts/factory-runner/bootstrap-node.sh --role verifier
FACTORY_NODE_ROLE=verifier node scripts/factory-runner/node.mjs start
```
The Work PC is the **verifier** node: the independent acceptance authority. Its role is enforced from the plane's node
record at claim time (CP-9/CP-10), and a verification it records of a run authored on the Home PC is accepted only because
the authoring run *and* the authoring node differ (CP-11). **Same script, one flag, no machine name anywhere.** Before this
pack, every `node.mjs start` re-registered the node as `generic` — a verifier would have been demoted silently on first
start; `FACTORY_NODE_ROLE` closes that.

---

## E. TWO-NODE FAILOVER ACCEPTANCE

`qa/factory/two_machine_failover.mjs`, coordinated through the plane alone. A stamp names one work order; the checkpoints
carry the **hostname**, which is the discriminator a one-machine rehearsal cannot fake.

```
# either PC
node qa/factory/two_machine_failover.mjs seed                 → STAMP <s>
# Home PC: claim it, checkpoint, DIE without completing (lease 45 s)
node qa/factory/two_machine_failover.mjs hold <s>
# Work PC: wait for the lease to expire, take over from the dead node's checkpoint, complete
node qa/factory/two_machine_failover.mjs takeover <s>
# either PC
node qa/factory/two_machine_failover.mjs verify <s>
```
`verify` exits **0 TWO MACHINES** (the two hostnames differ: milestone 2 proved on real machines), **3 SAME MACHINE** (the
instrument works, the milestone is not proved), **1 FAIL** (a row failed: it says which). Run it the other way round too
(Work PC dies, Home PC takes over) — the plane has no notion of which machine is primary.

`two_machine_real.mjs`, `two_machine_failover.mjs` and `two_machine_scheduling.mjs` retry a transient plane error like the nodes
they measure, and one they cannot get past ends the run INCONCLUSIVE (exit 4, with the stamp to clean up) - or VERDICT: FAIL (exit 1)
when a row had already failed, never a failure read as a benign re-run. The composer's failover row counts only
completed failovers (the takeover run done with its stated reason, its work order done). A run starts when it is inserted - after the
claim lock and the pick, not at its transaction's BEGIN - so a claim that waited on the claim lock no longer reads as an overlap with the
run it waited for; and a wave renews every lease it holds after each claim and checkpoint (a slow first pass outlived its lease).

Both scripts read the node's own env file, as the node does: `~/.brain-factory/runner.env` by default, or `--runner-env <file>` (or
FACTORY_RUNNER_PG_URL when it is set) - the CA path a copied runner.env names is resolved to the copy beside it, so nothing is
exported or edited on the Work PC; a plane that does not answer ends the script with one FAILED line.

Rehearsed on one machine with `rehearse` (two node ids, real child processes): it must end in exit 3.

**Milestones 3 and 4 on real machines** use `qa/factory/two_machine_scheduling.mjs` the same way: `seed` on either PC, `wave <stamp>` on
each PC within a minute of each other (each wave claims what its node MAY — role and surface lock decide — holds it while heartbeating, then
completes it; the verifier node also records a verification of the other machine's run), then `verify <stamp>` with the same exit codes.
Its rehearsal on one machine (a generic and a verifier node id, real processes) ends in exit 3 with every row green.

---

## F. ROLLBACK / CLEANUP

| | command / step | authority |
|---|---|---|
| remove the acceptance rows only | `node qa/factory/two_machine_failover.mjs cleanup all` — deletes this script's work orders, runs, locks and checkpoints, nothing else | runner role |
| stop a node | stop the process; its leases expire and any live claim is taken over; or `setx FACTORY_RUNNER_PG_URL ""` and a new shell — the node refuses to start | operator |
| deregister a node | `delete from factory.nodes where node_id = '<id>'` (a node with no live lease) | runner role |
| rotate the credential | run `provision-control-plane.mjs --admin …` again (the role's password rotates, attributes re-asserted, schema re-converged); copy the new `runner.env` to both PCs. Each supervisor reads the file again before every worker start, so a node failing on the old password heals at its next restart; `install-autostart.ps1 -Start` on each PC restarts it now (a supervisor in backoff, or one whose node the plane does not see ALIVE, is restarted and the start confirmed) | founder (admin URL) |
| drop the control plane | `drop schema factory cascade; drop role factory_runner;` — orchestration state only; the queue is rebuilt from git (`reconstruct.mjs`) | founder (admin URL) |
| retire the database | delete the instance / close the private network route | founder |

---

## I. THE REAL-MACHINE ACCEPTANCE, DRIVEN FROM ONE PC (added 2026-09-22)

Once both PCs run their supervised worker (§H), nobody types on the Work PC. The workers execute `factory_acceptance` work
orders (`scripts/factory-runner/handlers/factory-acceptance.mjs`: hold, die-and-hand-over, verify), and
`qa/factory/two_machine_real.mjs run` on the Home PC seeds the whole sequence and reads what the workers recorded:

| step | what the workers do | verified on the plane |
|---|---|---|
| S1 failover home→work | the home worker claims, checkpoints, hands the work order to the work node, lets its lease lapse in 10 s and exits (the supervisor restarts it); the work worker takes over from the checkpoint | phase-1 by the home node, phase-2 by the work node, the done run on the work node |
| S2 failover work→home | the same the other way | idem |
| S3 scheduling | three work orders held 25 s each, two on one surface | the pair never overlapped; the free one completed |
| S4 verifier independence | a verifier-role work order makes the work worker record a verification of a run the home node completed | verifier node ≠ authoring node on the run row |

**Both machines run exactly the commit under acceptance.** Each node records the commit it runs (`head:<sha>`, and `dirty` for
uncommitted changes to tracked files) and its acceptance handler (`handler:factory-acceptance/2`) as capabilities, and stamps the
commit on every run it claims (`base_commit`) and in every acceptance checkpoint. `two_machine_real.mjs run [--sha <commit>]` (default:
this checkout's HEAD) REFUSES, seeding nothing, unless both nodes run exactly that commit, clean, with that handler - a Work PC on
an older checkout passed it before (final verification 2026-09-24) - and seeds work only a node at that commit, with that handler,
can claim; every scenario checks its runs came from the home or work node at exactly that commit (a third node's runs passed S3).
A run from a tree with uncommitted changes is stamped `<sha>+dirty`, which is no commit. The composer's rows 1-4 count only evidence at
the commit: machines whose node runs it cleanly, runs and checkpoints stamped with it, verifications whose verifying run completed.
A node keeps running the commit it started on when its checkout moves: `-Verify` fails naming both commits - clean or dirty
counts too (a node recorded dirty beside a clean checkout at the same commit passed, and the fix two_machine_real printed did nothing) -
`-Status` says so on a `commit` line, and `-Start` alone restarts it on the checkout's commit - so "put that PC on the commit and restart its node" is `git checkout <sha>; npm ci;
install-autostart.ps1 -Start`. The supervisor is part of the node: it records the commit it started on too, and `-Verify`, `-Status`
and `-Start` compare that as well (after the checkout moved, a worker restarted by the old supervisor ran the new commit under the old
supervisor's code, and `-Verify` passed).

A worker completes only an instruction it carried out: an action its checkout does not know (a newer seeder, a typo, a wrong
case) or a handoff that is not a JSON object FAILS the run and its work order by name (`factory_acceptance_unknown_action`,
`factory_acceptance_bad_handoff`), and a dependent is never released; the checkpoints carry the handler version.

Exit 0 TWO MACHINES (the two nodes are on different hostnames), 3 SAME MACHINE, 1 FAIL. Rehearsed 2026-09-22 on this machine
with the real Home worker and a second supervised verifier node against the live plane: every row green, verdict SAME
MACHINE (stamp 20260922T154710-369d). `two_machine_real.mjs nodes` lists the ALIVE nodes; `cleanup` removes its rows.
The composer's real-failover rows read the same phase-1 / phase-2 checkpoints by hostname.

---

## H. REBOOT / RECOVERY PERSISTENCE (added 2026-09-22)

A node must rejoin the plane after a reboot or a crash with nobody at the keyboard. `scripts/factory-runner/node-supervisor.mjs`
reads `~/.brain-factory/runner.env` at runtime (the URL reaches the worker through its environment, never an argument, and every
log line is scrubbed of it), runs `node.mjs start`, restarts it with bounded backoff, ends an orphaned worker before starting a
new one (one worker per node identity), and refuses a second instance per checkout. `install-autostart.ps1` registers the
Windows Scheduled Task **BrainOS Factory Node** that launches it; an idle node stamps its record every minute, so
`node.mjs status` can say ALIVE / STALE from any shell.

| command | does |
|---|---|
| `powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Role generic -Start` | install and start; Work PC: `-Role verifier`. Any supervisor of this checkout (the old task's, or one started by hand in a terminal) is stopped first, and the new task's supervisor is CONFIRMED running (identity-checked pid, state running) or the command fails (exit 5) naming the task result and the refusal. A re-install without `-Role` keeps the installed role |
| `… install-autostart.ps1 -Preflight` | checks only, changes nothing: the env file judged by `runner-env.mjs` (the same judge the supervisor uses: a URL, not the superuser/production/plaintext, its CA present here and a real certificate; UTF-16 and BOM decoded) and the locked runtime tree installed AND loadable (`npm ci` otherwise) |
| `… install-autostart.ps1 -Status` | the task (and which checkout owns it), its role, the owner's supervisor state - STALE when the recorded supervisor is not running - the dependency check, and the node's liveness read with the task's own env file: DOWN when no supervisor answers, NOT RUNNING (with the next start and the worker's last error) while the supervisor waits out a backoff, whatever the plane's lagging heartbeat says |
| `… install-autostart.ps1 -Stop` / `-Start` | stop cleanly (worker ends, no orphan) and disable the task / `-Start` ALONE starts the installed task as it is (role and env file unchanged; nothing re-installed); a supervisor in backoff, or one whose node the plane does not see ALIVE in the task's role, is restarted and the start confirmed. `-Start` with `-WatchdogMinutes` or `-LogDir` re-installs (keeping role and env file) instead of ignoring them. Run from the checkout that owns the task: from any other checkout -Stop, -Uninstall and install refuse (exit 3) unless `-ReplaceOtherCheckout`, which stops THAT checkout's supervisor and refuses (exit 4) if it does not stop |
| `… install-autostart.ps1 -Verify` | exit 0 only if the task exists, is enabled, has its watchdog, is RUNNING an identity-checked supervisor of this checkout whose worker the plane sees ALIVE **in the task's role**, and its own env file and the dependencies pass the preflight |
| `… install-autostart.ps1 -Uninstall` | stop the owning checkout's supervisor, then remove the task |
| `node scripts\factory-runner\node.mjs status --runner-env <runner.env>` | ALIVE (heartbeat age) / STALE / NOT REGISTERED / UNREACHABLE, read-only; URL NOT SET without `--runner-env` (the default file is never read implicitly); DEPENDENCIES_MISSING (exit 5) when the locked tree is not installed or does not load |

The supervisor takes `--runner-env <file>`, not `--env-file`: Node itself consumes `--env-file` anywhere on its command line and
exits 9 on a missing file before the supervisor runs.

**One supervisor per state dir, by lock.** Each supervisor holds an exclusive control pipe named from its state directory
(`proc.mjs`: a named pipe on Windows, a unix socket elsewhere) for its whole life. A second supervisor cannot take it and exits 3,
however its path was spelled (relative, through a junction, a non-ASCII folder). `node-supervisor.mjs --whois` asks the running
one who it is (pid, role, state, worker), `--stop` asks it to stop, `--status` says STALE when the status file claims a supervisor
nobody answers for. The installer asks the same questions. Pid files are for people to read and never trusted: after a reboot
their numbers belong to whatever process Windows handed them to. An orphaned worker is recognised by the instance token its
supervisor put on its command line, and nothing else is ever killed. A worker that refuses its configuration (exit 2, REFUSED) is
terminal: the supervisor stops with state `refused` instead of restarting it forever. Every refusal leaves a log line and a status
record. Under the scheduled task the supervisor runs behind a headless console host (no window). Stopping the task stops the
node, and `-Status` / `-Verify` report it.

**A watchdog, not "restart on failure".** Task Scheduler's restart-on-failure never fires for an action that exits, and the
headless host reports 0x0 whatever happened. So the task also carries a time trigger that repeats every 5 minutes
(`-WatchdogMinutes`). While a supervisor runs the start is ignored (one instance); a dead one is started again. `-Stop` DISABLES the
task FIRST so the watchdog cannot undo a deliberate stop (disabled after the stop, the watchdog could start a new supervisor in between
and `-Stop` reported the node stopped while it ran), then stops it, and fails (exit 4) while any supervisor still answers for
the checkout; `-Start` re-enables it after the preflight passes.

**A start is confirmed by the node.** `-Start` succeeds only when the same worker has stayed up for 12 s, has completed a claim
cycle, AND the plane has heard from it since it started (the previous worker's heartbeat confirmed a restarted one that never claimed);
a worker whose admission refuses its claims is named as such - from that worker's own log lines only, and the node's admission and
claim-lock records belong to the worker now running (each worker removes its predecessor's when it starts): an earlier worker's refusal
was quoted for a worker that could not reach the plane. Otherwise it fails (exit 5) and says why: the refusal the supervisor recorded, or the error its worker
keeps failing on (a password, a certificate, a host that does not answer). `-Verify` on another checkout's task stops there, like `-Status` (it read that checkout's env file and probed its plane). `-Verify` names the failing part: disabled, no
watchdog, preflight, task not running, no supervisor, wrong role, worker failing (with its error and the next start), the plane
not seeing the node, or the plane holding another role. `-Status` says DOWN when no supervisor answers here, NOT RUNNING while
the supervisor waits out a backoff, and NOT CONFIRMED while the worker now running has not completed a claim cycle, whatever the
plane's last heartbeat says (it read ALIVE for crash-looping workers, from their predecessor's heartbeat); `-Verify` fails then too.
**One status probe is not a verdict.** A probe the plane does not answer is asked again, three times in all; and a node whose
worker has completed its claim cycles is never restarted because this PC could not reach the plane - `-Start` says "cannot judge"
(exit 5) and leaves it running (one reset on a flaky path restarted a healthy, busy node and abandoned its run).

**No connection and no claim can hang or hold the plane.** Every plane connection has a connect timeout (20 s), a statement
timeout (60 s) and TCP keepalive, set on the client because the Supabase pooler drops startup settings. Every claim transaction
opens with a 15 s lock timeout and a 30 s idle-transaction limit, so a node that dies inside a claim cannot block the others. A
run whose lease was taken over can neither checkpoint nor complete its work order: only the run that holds the lease completes
it. That is the "exactly once" of the two-machine takeover. Every session also carries `transaction_timeout` (PostgreSQL 17), so a
statement stalled between its protocol messages cannot hold a lock either, and a completion is ONE statement (run, locks, work
order): all or nothing.

**What a node says about itself is true** (verification round 4 and the final verification of 2026-09-24;
`qa/factory/node_truth_acceptance.mjs` N1-N11, `acceptance.mjs` R-S):
- *ALIVE means working.* A node reads ALIVE only after its worker has completed a claim cycle that reached the plane (it logs `ready:`; a
  cycle refused by admission does not count); registering, a
  health check or a bootstrap never stamp liveness (a check once made a dead node read ALIVE for three minutes). A worker that reaches
  the plane but fails its claims is backed off (5 s doubling to 5 min) and reads STALE, "never beaten" - it used to reset its backoff
  on registration and crash-loop every 6 s while reading ALIVE. `-Verify` and `-Start` also require that the plane has heard from
  the worker running NOW, not from its predecessor.
- *One worker per node identity.* A worker holds a lock for its state dir; a second one, or a bare `node.mjs start` beside a
  supervisor, does not start (exit 4).
- *A run that cannot keep its lease stops before it lapses.* A failed renewal is retried within seconds, and one that hangs (a path
  that stopped forwarding fails only at the 60 s statement timeout) no longer holds the next one back - another is sent after at most a
  sixth of the lease (10 s at least); the lease is timed on a monotonic clock, so a wall-clock step moves nothing; only when the lease the
  plane holds (from the start of the last renewal that landed, and first from before the claim began: the plane stamps the lease at
  the claim's BEGIN, and a claim that had waited on the claim lock was aborted only after another node took its surface; and the first
  renewal is due a third of the lease after the lease began, not after the claim returned - a slow claim was aborted while that renewal was
  still in flight, then claimed and aborted again, forever) is about to lapse - a third of the lease, at most 5 s, before - or
  when the lease was taken over, is the run aborted, its lease given back, and its work left recoverable from its checkpoints, so
  another node takes the surface only after it stopped (a cut-off node kept working and two machines worked one surface; an earlier
  guard at two thirds of the lease aborted healthy runs over a slow link). Once the run's work is over, a renewal that finds no run in
  progress is not a takeover (one in flight at the completion logged a completed run LOST and ABORTED): the completion is fenced by
  itself. An abandoned run
  keeps the node that ran it and its last heartbeat, so an overlap would be visible; `two_machine_real` S3 compares every
  execution, abandoned ones included.
- *Nothing waits forever on the plane.* A connection close is bounded too (5 s, then the socket is destroyed): a close the other side
  never answered left a worker hung after a successful statement while its heartbeat kept it looking healthy.
- *A malformed work order is never picked.* A NULL, empty or oversized surface is excluded by the claim itself, however many there are
  (eight of them used up the claim's attempts and starved every node; an oversized one crash-looped them - oversized in BYTES, over
  1000: a multibyte surface of 1000 characters still crash-looped them on a UTF8 plane), and `node.mjs health` names
  them by id; a repeated surface is one surface (it collided with itself and starved the queue); an acceptance action
  with a malformed argument fails by name; a data exception (SQLSTATE class 22) inside a run fails it - the same input fails every time.
- *Only a finished, successful run can be verified.* A `verify` of a failed or unfinished run is refused by name and writes
  nothing (it was recorded as verified and counted as milestone-4 evidence); the independence constraints still refuse a run
  verifying itself, or its authoring node, by their own names. The composer counts only done authoring runs.
- *"Can claim work" means a worker that claims.* `node.mjs health` says it only when this node's supervisor runs a worker that has
  completed a claim cycle, and not while that worker's own records say NOT CLAIMING (admission refused, claim lock busy); a supervisor
  in backoff is named as not claiming (it said "can claim work" then). A record deleted from the
  plane is registered and stamped again at once by the running worker.
- *Not claiming is said.* A refused admission, and a plane-wide claim lock held past the lock timeout, are logged and shown by
  `node.mjs status`, `-Status` and `-Verify` (NOT CLAIMING, with since when).
- *The registration belongs to the running worker.* Health checks keep the record the plane holds (they used to re-register a
  running verifier as generic); the runbook's scripts (`two_machine_scheduling.mjs`, `two_machine_failover.mjs`) register their own node ids,
  never the checkout's (they overwrote the running node's commit and acceptance capabilities, and it silently stopped claiming); the
  worker re-asserts its whole registration - role, capabilities with its commit and handler, version - on every beat, while idle and
  while busy, and says when it had to.
  `-Verify`, `-Start` and the start confirmation compare the plane's role with the task's.
- *A busy node is ALIVE.* The run heartbeat stamps the node record too (one statement with the lease and the locks); a node
  working longer than three minutes used to read STALE.
- *Short losses do not take a node down.* A transient plane error (a reset, a refused or timed-out connection, a server
  restart) is retried inside the worker, 2 s doubling to 30 s, and it says so - the registration, the claim, and a run's checkpoints
  and completion (a completion that did not reach the plane threw a finished run away: its claim looked live for a lease while nothing
  ran it, and the work was done again) - and the reads a run makes right after its claim, and a run's own statements (the acceptance
  handler's verification and takeover writes, each idempotent). A checkpoint carries its own id, so a retry after one that landed writes it once; a retried
  completion that finds the run already finished by this node is its own completion, not a takeover. A claim retried after a
  transient error first gives back the lease of any run of this node in progress that the worker does not hold - a claim whose
  commit landed but whose reply was lost stood as a live claim nothing worked, for a whole lease. Only five minutes of nothing
  but such errors during a claim hand the node to its supervisor. The supervisor's backoff resets as soon as a worker has completed a claim cycle.
- *A failed run fails its work order,* in the same statement: nothing is left `claimed` with no run holding it, and its
  dependents are visibly blocked. `node.mjs health` names any stranded or failed work order.
- *The URL judge refuses what pg would misread:* a space or a `%` that is not an escape (pg re-encodes such a URL whole and
  corrupts the CA path), or an escape that does not decode.

**Registered, bounded - not fixed (final verification 2026-09-24):** (1) a node refusing admission reads ALIVE on the plane: the
refusal is local to the node (`node.mjs status`, `-Status` and `-Verify` print NOT CLAIMING there - a record an earlier worker left is replaced by the next worker's
  first claim cycle), and the Home PC cannot see it
without a plane schema change - if a `two_machine_real.mjs` scenario times out, run `-Status` on the Work PC; `-Verify` does not fail on it,
because this PC's own heavy suites push the CPU over the admission threshold for minutes; (2) a work order whose run keeps
throwing an error that is not a data exception is retried every lease period with no attempt ceiling, and each lapse leaves the
old run as a `queued` row - the lease is the arbiter by design; `node.mjs health` shows the expired leases; (3)
`round-state.regression.test.mjs` RS-C* read other worktrees of this PC (not part of the node, and not in the composer); (4) a node that
requests a model (`FACTORY_MODEL`) declines at most eight verifier-gated work orders per claim on its model's standing - more than eight
of them ahead of other work starve that node (no Factory node sets `FACTORY_MODEL` today; the declines are logged).

**Boot trigger:** Windows lets only an administrator register an AtStartup trigger (measured: "Access is denied" for a standard
user). As installed the task is triggered **at logon**, which is the reboot path the moment the user logs on; one elevated run of
the same install command adds the boot trigger (`-Verify` then lists both). Proof: `qa/factory/reboot_recovery_acceptance.mjs`
9/9 (identity persisted and registered, idle heartbeat, worker crash restarted with the same id, queue claimed by the supervised
worker, supervisor crash → exactly one worker and work completed exactly once, second supervisor refused, clean stop, no credential
in any log, the live task verified) — and on the live plane the Home node was killed and came back under the supervisor.

---

## G. AFTER THE SHARED DATABASE EXISTS — what runs, in the founder's order

| step | what runs | founder involvement |
|---|---|---|
| real 2-node takeover | `two_machine_real.mjs run` from the Home PC (§I), both directions, no commands on the Work PC — **waits on the Work-PC bootstrap (gate A)** | none |
| real 3-node / conflict-aware scheduling | `qa/factory/two_machine_scheduling.mjs seed` on either PC, then `wave <stamp>` on EACH PC within a minute, then `verify <stamp>`: two work orders on one surface never overlap in time, the free one completes, four runs from two hostnames (exit 0 TWO MACHINES / 3 SAME MACHINE / 1 FAIL; rehearsed on one machine) | none |
| role/run-based verifier independence | the same `two_machine_scheduling.mjs` run: the verifier-role work order is claimable only by the Work PC (`FACTORY_NODE_ROLE=verifier`), which records a verification of a FINISHED Home-PC run (it waits for one, up to the wave's deadline - twice the hold and a minute, so a conflict run that could start only after the first one was held still ends in time, and each node takes at most one of the two conflict work orders, so a wave that starts first cannot author every run: an unfinished run is refused, and the instrument failed whenever the verifier's wave came first); `verify` requires the verifier node and hostname to differ from the author's and that no generic node ever held the verifier work order | none |
| cheap QA / DeepSeek | `DEEPSEEK_API_KEY` in the environment of the node that will serve it; the HTTP provider path exists (`provider-http.mjs`, `http_provider_acceptance.mjs` 9/9 on a stub) | the key |
| BUG-036 read-only diagnosis | **prepared**: `qa/verification/bug036_auth_inspection.mjs` on `wo/invitation-delivery` (GET only, redacted record, selftest 7/7; `BUG036_READONLY_INSPECTION.md`) — one command with `SUPABASE_ACCESS_TOKEN` in the process environment | the token, once |
| 202609110001 production gate | **SATISFIED**: `qa/verification/gate_202609110001.mjs` 6/6 (draft still a draft, certified digests, 26/26 on PGlite and on a disposable real PostgreSQL, rollback J1–J5); record `GATE_202609110001.json`; the gate prints the founder step and performs none of it | moving the file into `supabase/migrations/` |
| invitation web deploy gate | **SATISFIED**: `qa/verification/gate_invitation_deploy.mjs` 6/6 (clean tree, ten suites 116 green / DS-D1 red by design, typecheck, no path returns SENT, no client-side membership insert, web independent of the draft's columns); record `GATE_INVITATION_DEPLOY.json` names the deploy target commit | the deploy (PR into protected `master`, Vercel build, record `DEPLOYED_WEB_SHA`) |
| independent Work-PC E2E retest | **prepared**: `qa/verification/WORK_PC_E2E_RETEST.md` — twelve browser-observable rows bound to `DEPLOYED_WEB_SHA`, rows needing the migration marked | none, once deployed |
| final Factory V1 acceptance | **prepared**: `qa/factory/factory_v1_acceptance.mjs` runs every local proof and reads the two-machine rows (distinct hostnames) from the plane; PASS / HOLD with the founder-gated remainder named; PASS advances automatically | none |

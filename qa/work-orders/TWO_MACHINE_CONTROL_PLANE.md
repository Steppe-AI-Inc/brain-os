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
On the Work PC: copy `runner.env` and the CA file (`~/.brain-factory/supabase-root-2021-ca.crt`) to the same folder there — the
CA path inside the env file is resolved to the local copy by `runner-env.mjs`, so nothing is edited — then
`install-autostart.ps1 -Role verifier -Start` (§H) or `bootstrap-node.sh --role verifier --env-file …`.
**Reply with:** "shared plane is up" and the two node ids the bootstraps print. Never the URL.

Rotation is the same command again (the password rotates, the identity is kept). `--force` is refused alongside the flag.

---

## A. EXACT CONNECTION REQUIREMENTS

| requirement | how it is met | where it is enforced |
|---|---|---|
| no production database authority | the plane is a separate database holding only the `factory` schema; the accessor refuses any URL naming the production project (`pvphxgrtdfrudejjhzjk`, anywhere in the URL, even over TLS), and any superuser (`postgres`, `supabase_admin`, `postgres.<ref>`) | `db.mjs assessUrl()` before a socket opens; `provision-control-plane.mjs` refuses business tables, platform schemas, migration history |
| dedicated least-privilege role | `factory_runner`: LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT; CONNECT on the database, USAGE on `factory`, DML on its tables, nothing else | the provisioner asserts the attributes on create *and* on re-run; `plane-health` reads them back from `pg_roles` and proves the **server** refuses `CREATE TABLE` (42501) |
| no business tables | the plane never holds `companies`, `people`, `profiles`, `goals`, `tasks`, … | `node.mjs health` fails if any appear; the acceptance suite fails on a foreign key leaving the schema |
| TLS / private network | any non-loopback host must carry `sslmode=require`, `verify-ca` or `verify-full` (the exact form per certificate is in §0 step 2); `disable`, `prefer`, `allow` and absence are refused; loopback may be plaintext | `db.mjs assessUrl()`; `plane-health` then proves TLS is **in use** on the backend (`pg_stat_ssl`), not merely requested; `tls_plane_acceptance.mjs` proves the whole node path over TLS on this machine's own LAN address against a server that REJECTS plaintext (`hostnossl … reject`), and that a wrong root certificate is refused |
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
| `node scripts/factory-runner/node.mjs health` | URL present and judged safe; connected as a non-superuser; schema present; queue readable; registered; PostgreSQL ≥ 13; no business tables; the accessor spawns nothing |
| `node scripts/factory-runner/plane-health.mjs --role <r>` | all of the above, then: TLS **in use** on this backend; role attributes on the server; the server refuses DDL; `001`+`002`+`003` applied; clock skew and round trip within limits; registered as `<r>`; which other nodes and **which other hostnames** this plane has seen in 24 h |
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
| rotate the credential | run `provision-control-plane.mjs --admin …` again (the role's password rotates, attributes re-asserted, schema re-converged); set the new URL on both PCs | founder (admin URL) |
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
| `powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Role generic -Start` | install (idempotent: a re-install stops the running supervisor first) and start now; Work PC: `-Role verifier` |
| `… install-autostart.ps1 -Status` | task state, supervisor state file, node liveness on the plane |
| `… install-autostart.ps1 -Stop` / `-Start` | stop cleanly (worker ends, no orphan) / start |
| `… install-autostart.ps1 -Verify` | exit 0 only if the task exists, is enabled and starts this checkout's supervisor |
| `… install-autostart.ps1 -Uninstall` | stop and remove the task |
| `node scripts\factory-runner\node.mjs status` | ALIVE (heartbeat age) / STALE / NOT REGISTERED / UNREACHABLE, read-only |

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
| role/run-based verifier independence | the same `two_machine_scheduling.mjs` run: the verifier-role work order is claimable only by the Work PC (`FACTORY_NODE_ROLE=verifier`), which records a verification of a Home-PC run; `verify` requires the verifier node and hostname to differ from the author's and that no generic node ever held the verifier work order | none |
| cheap QA / DeepSeek | `DEEPSEEK_API_KEY` in the environment of the node that will serve it; the HTTP provider path exists (`provider-http.mjs`, `http_provider_acceptance.mjs` 9/9 on a stub) | the key |
| BUG-036 read-only diagnosis | **prepared**: `qa/verification/bug036_auth_inspection.mjs` on `wo/invitation-delivery` (GET only, redacted record, selftest 7/7; `BUG036_READONLY_INSPECTION.md`) — one command with `SUPABASE_ACCESS_TOKEN` in the process environment | the token, once |
| 202609110001 production gate | **SATISFIED**: `qa/verification/gate_202609110001.mjs` 6/6 (draft still a draft, certified digests, 26/26 on PGlite and on a disposable real PostgreSQL, rollback J1–J5); record `GATE_202609110001.json`; the gate prints the founder step and performs none of it | moving the file into `supabase/migrations/` |
| invitation web deploy gate | **SATISFIED**: `qa/verification/gate_invitation_deploy.mjs` 6/6 (clean tree, ten suites 116 green / DS-D1 red by design, typecheck, no path returns SENT, no client-side membership insert, web independent of the draft's columns); record `GATE_INVITATION_DEPLOY.json` names the deploy target commit | the deploy (PR into protected `master`, Vercel build, record `DEPLOYED_WEB_SHA`) |
| independent Work-PC E2E retest | **prepared**: `qa/verification/WORK_PC_E2E_RETEST.md` — twelve browser-observable rows bound to `DEPLOYED_WEB_SHA`, rows needing the migration marked | none, once deployed |
| final Factory V1 acceptance | **prepared**: `qa/factory/factory_v1_acceptance.mjs` runs every local proof and reads the two-machine rows (distinct hostnames) from the plane; PASS / HOLD with the founder-gated remainder named; PASS advances automatically | none |

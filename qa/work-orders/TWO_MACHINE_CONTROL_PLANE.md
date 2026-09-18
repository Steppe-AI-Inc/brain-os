# TWO-MACHINE FACTORY CONTROL PLANE — ACCEPTANCE PACK

**Prepared 2026-09-18** under the founder's order of the same day ("prepare the REAL two-machine Factory control-plane
acceptance"). Everything below that needs no founder credential and no network change is built and rehearsed on one
machine. **One founder action remains, in §0.** Nothing here touches production, and nothing can: the accessor refuses a
production URL before opening a socket (§A, tested).

The one-machine shared-plane proof (`shared_control_plane_acceptance.mjs`, 18/18) is not repeated here. What this pack
adds is the network: TLS, a least-privilege role judged on the server, two clocks, two hostnames.

---

## 0. THE ONE FOUNDER ACTION

> **Provide one dedicated NON-PRODUCTION PostgreSQL that both PCs can reach over TLS; provision it once; set the printed
> URL on both PCs.**

1. **Create an empty PostgreSQL 14+ database that is not the Brain OS project.** Either shape is acceptable:
   - **a small managed instance** (any provider; a *new* Supabase project used for nothing else also qualifies) — TLS is on
     by default and the port is reachable only with the password. *Recommended: nothing to operate.*
   - **a private network** (Tailscale / WireGuard / VPN) to a PostgreSQL that listens **only** on the private interface with
     `ssl = on` and `hostssl`-only rules in `pg_hba.conf`. Never a public, unrestricted port 5432.
2. **Provision it once**, from either PC, with the admin credential (DDL rights; used once; stored nowhere):
   ```
   node scripts/factory-runner/provision-control-plane.mjs --admin "postgresql://<admin>:<password>@<host>:<port>/<db>?sslmode=require"
   ```
   It refuses a production-shaped target; applies `001`, `002`, `003`; creates `factory_runner` (login, no create, no grant,
   no bypass-RLS); and prints **one** `FACTORY_RUNNER_PG_URL`. **Its TLS parameters must match the certificate the server
   presents** — the driver in this repository (pg 8.23) verifies the chain for every mode, measured by
   `qa/factory/tls_plane_acceptance.mjs`:

   | the database is reached as | put on the URL |
   |---|---|
   | a DNS name with a publicly trusted certificate (most managed instances) | `?sslmode=verify-full` |
   | a DNS name whose provider uses its own CA (Supabase does) | `?sslmode=verify-full&sslrootcert=<path to the provider's CA file on the node>` |
   | an IP address on a private network with a self-signed certificate | `?sslmode=verify-ca&sslrootcert=<path to the server certificate on the node>&uselibpqcompat=true` (verify-full cannot check an IP host with this driver) |

   The CA / certificate file lives on each node outside the checkout; the URL points at it; neither is committed.
3. **On the Home PC** (PowerShell, then open a *new* shell):
   ```
   setx FACTORY_RUNNER_PG_URL "<the printed URL>"
   bash scripts/factory-runner/bootstrap-node.sh --role generic
   ```
   **On the Work PC**, the same with `--role verifier`.
4. **Reply with:** "shared plane is up" and the two node ids the bootstraps printed. Never the URL.

**Exact information the founder must supply: the admin URL for step 2 (host, port, database, admin credential).** Nothing
else is needed from the founder; every later step in §G runs from the nodes.

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

## G. AFTER THE SHARED DATABASE EXISTS — what runs, in the founder's order

| step | what runs | founder involvement |
|---|---|---|
| real 2-node takeover | §E, both directions | none |
| real 3-node / conflict-aware scheduling | `qa/factory/shared_pg_worker.mjs <nodeId> complete` on both PCs (and the laptop) against two work orders sharing a surface — the same worker CP-8 used, `FACTORY_RUNNER_PG_URL` from the environment | none |
| role/run-based verifier independence | Work PC (`verifier`) records a verification of a Home-PC run via `shared_pg_worker.mjs … verify <runId>`; a self-verification and a same-node verification must be REJECTED (CP-9..11 on real nodes) | none |
| cheap QA / DeepSeek | `DEEPSEEK_API_KEY` in the environment of the node that will serve it; the HTTP provider path exists (`provider-http.mjs`, `http_provider_acceptance.mjs` 9/9 on a stub) | the key |
| BUG-036 read-only diagnosis | **prepared**: `qa/verification/bug036_auth_inspection.mjs` on `wo/invitation-delivery` (GET only, redacted record, selftest 7/7; `BUG036_READONLY_INSPECTION.md`) — one command with `SUPABASE_ACCESS_TOKEN` in the process environment | the token, once |
| 202609110001 production gate | **SATISFIED**: `qa/verification/gate_202609110001.mjs` 6/6 (draft still a draft, certified digests, 26/26 on PGlite and on a disposable real PostgreSQL, rollback J1–J5); record `GATE_202609110001.json`; the gate prints the founder step and performs none of it | moving the file into `supabase/migrations/` |
| invitation web deploy gate | **SATISFIED**: `qa/verification/gate_invitation_deploy.mjs` 6/6 (clean tree, ten suites 116 green / DS-D1 red by design, typecheck, no path returns SENT, no client-side membership insert, web independent of the draft's columns); record `GATE_INVITATION_DEPLOY.json` names the deploy target commit | the deploy (PR into protected `master`, Vercel build, record `DEPLOYED_WEB_SHA`) |
| independent Work-PC E2E retest | **prepared**: `qa/verification/WORK_PC_E2E_RETEST.md` — twelve browser-observable rows bound to `DEPLOYED_WEB_SHA`, rows needing the migration marked | none, once deployed |
| final Factory V1 acceptance | **prepared**: `qa/factory/factory_v1_acceptance.mjs` runs every local proof and reads the two-machine rows (distinct hostnames) from the plane; PASS / HOLD with the founder-gated remainder named; PASS advances automatically | none |

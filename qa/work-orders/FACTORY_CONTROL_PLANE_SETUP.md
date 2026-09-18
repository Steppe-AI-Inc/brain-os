# FACTORY CONTROL PLANE — SETUP

**Status:** local acceptance complete (48/48 against a disposable real PostgreSQL; health 10/10) and the SHARED plane proved on ONE machine (`qa/factory/shared_control_plane_acceptance.mjs`, 9/9 across separate runner processes over TCP on a persistent embedded PostgreSQL 18, including failover across a plane restart and three processes on conflicting surfaces). **One founder action outstanding: a database a SECOND computer can reach** (a hosted non-production PostgreSQL, or this machine's port opened to the LAN) — the only part of milestone 1 this machine cannot do alone.
**Branch** `factory/computer-agnostic-control-plane` · **Nothing here has been deployed or applied anywhere.**

---

## THE ONE THING NEEDED FROM THE FOUNDER

> **Provide a dedicated NON-PRODUCTION PostgreSQL database and set `FACTORY_RUNNER_PG_URL` on each node.**

That is the whole request. **No production credential is wanted, then or ever** — and if one is supplied by
accident, the runner refuses it (see *Refusals*, below, which is tested rather than promised).

---

## 1. WHAT THIS DATABASE IS

**Orchestration state only.** Work orders, dependencies, agent runs, node registrations, leases, heartbeats,
retries, checkpoints, ownership locks, completion state.

**It is not Brain OS.** It holds no company, person, profile, goal, task or memory, and it never will: the
acceptance suite fails if any such table appears in it, and fails if any control-plane table acquires a
foreign key pointing outside its own schema.

**A business id stored here is an opaque value.** It does not assert that the row exists, who owns it, or
what anyone may do with it. A work order referring to a business id that exists nowhere is perfectly valid —
that is what *by value* means, and it is a test.

**Losing this database costs scheduling state and nothing else.** Every work order is reconstructible from
the repository: branch, base commit, latest commit, candidate sha256, checkpoint artifacts, release
manifest, handoff. Tested by deleting every row and rebuilding the queue from git alone.

---

## 2. DATABASE REQUIREMENTS

| | |
|---|---|
| Engine | PostgreSQL 14 or later (developed and accepted against 18.4) |
| Size | Tiny. Orchestration rows only; no blobs, no history, no business data |
| Availability | Ordinary. A node that cannot reach it simply does not claim work |
| Location | Anywhere all three computers can reach. A small managed instance is ideal |
| **Must NOT be** | the Brain OS production database, or any database holding production data |

Extensions: none beyond `pgcrypto` for `gen_random_uuid()` (built in on PG 13+).

---

## 3. SCHEMA / MIGRATION

One file, applied once, by someone with DDL rights:

```
supabase/control-plane/001_factory_control_plane.sql
```

It creates the `factory` schema and six tables: `nodes`, `work_orders`, `work_order_dependencies`,
`agent_runs`, `surface_locks`, `checkpoints`.

The provisioner **refuses to run against a production-shaped database** — one holding Brain OS business
tables, Supabase platform schemas, or a migration history. The realistic mistake is not a typo; it is
pointing this at the database that is already configured and already in a shell history.

**The runner cannot apply it, by design.** `db.mjs` refuses DDL, privilege changes and migration-history
writes in the client. Creating a schema is a release operation and belongs to whoever holds that authority —
which is not a factory worker.

---

## 4. MINIMUM PRIVILEGES

Create a dedicated login role. **Do not use `postgres`** — the runner refuses to connect as a superuser, on
the grounds that *a least-privilege accessor pointed at a superuser is not least privilege; it is the same
authority with a longer variable name.*

```sql
create role factory_runner login password '<generated>';
grant connect on database <control_plane_db> to factory_runner;
grant usage   on schema factory              to factory_runner;
grant select, insert, update, delete on all tables in schema factory to factory_runner;
alter default privileges in schema factory
  grant select, insert, update, delete on tables to factory_runner;
```

**Deliberately not granted:** any DDL, any GRANT, any access to `supabase_migrations`, any other schema.
The client refuses those too — the role is the boundary, the client is the second layer, and neither is
trusted alone.

---

## 5. CONNECTION AND SECRET STORAGE

```
FACTORY_RUNNER_PG_URL=postgresql://factory_runner:<password>@<host>:5432/<db>?sslmode=require
```

Per node, in the environment. Not committed, not in the repository, not in a dotfile inside the checkout.
`.factory/` is git-ignored and holds only a generated node id — never a credential.

**Rotation:** change the role's password, update the variable on each node, restart. No code change, no
schema change, and no work is lost — a node that cannot connect simply stops claiming, and its leases expire
so another node resumes the work.

---

## 6. NODE BOOTSTRAP

Identical on every computer. There is no Home-PC or Work-PC variant, and there must never be one.

```
git clone <repo> && cd <repo>
export FACTORY_RUNNER_PG_URL=...
node scripts/factory-runner/node.mjs start
```

On first run the node generates a uuid identity, persists it in `.factory/node-id`, registers itself and
reports **derived** capabilities — each one a question with a checkable answer, because a capability list
somebody types is one somebody forgets to update, and that failure is silent.

```
node scripts/factory-runner/node.mjs health
```

Run this **first**, on every machine. It proves the whole chain in one command and names the link that
failed:

```
factory node health
  node    node-4d4a74dd-...
  host    db.example.net:5432
  db      brain_factory_control_plane
  sslmode require

  ok   TLS is requested for a REMOTE host
  ok   connected as factory_runner to brain_factory_control_plane
  ok   PostgreSQL 18.4 ...
  ok   the connected role is NOT a superuser
  ok   the factory schema is present (6 tables)
  ok   can read the queue (0 work order(s))
  ok   registered itself (1 node(s) known to this control plane)

HEALTHY — this node can claim work.
```

Exit code 0 when healthy, 1 otherwise. **It never prints the password or the connection string** — host,
database and sslmode identify a connection without exposing one.

Each link is reported separately on purpose: a missing grant, an unapplied schema and a wrong role fail
for different reasons and have different fixes, and "not OK" makes all three look the same.

`node.mjs id` prints the identity. `node.mjs capabilities` prints what this machine can do.

---

## 7. REFUSALS — TESTED, NOT PROMISED

| situation | behaviour |
|---|---|
| `FACTORY_RUNNER_PG_URL` absent | **refuses to start**, explicitly, with no fallback |
| a production credential in the environment, no explicit URL | **still refuses** — there is no ambient path left |
| URL connects as `postgres` / `supabase_admin` / a pooler superuser | **refuses** |
| the runner attempts DDL, GRANT, TRUNCATE, `set role`, migration history | **refuses in the client** |
| `read()` handed a mutating statement | **refuses** — a reader cannot silently become a writer |
| a REMOTE host with no `sslmode` | **health fails** — advisory only on loopback, which does not cross a network |

The second row is the one that matters, and it is proven in a child process with `SUPABASE_ACCESS_TOKEN`
and `SUPABASE_DB_URL` both set. The refusal is structural: there is no code path that can borrow an ambient
credential, which is a different claim from a policy the runner chooses to honour.

---

## 8. ROLLBACK

| | |
|---|---|
| Stop the Factory | unset `FACTORY_RUNNER_PG_URL` on each node. Every runner refuses to start. No data changes |
| Undo the runner conversion | `git revert` the conversion commit. **This restores the ambient production-write defect** and turns `factory_production_write_inventory` red again, which is the point of reverting it deliberately rather than drifting back |
| Drop the control plane | `drop schema factory cascade`. Development history is unaffected; the queue is rebuilt from the repository |

---

## 9. THREE-NODE ACCEPTANCE

Run once the shared database exists. Nothing here needs a founder decision — only the URL.

1. **Bootstrap all three** (Home PC, Work PC, Mobile Laptop) with the same command and the same URL.
   `select node_id, capabilities, security_role from factory.nodes` shows three rows, no machine names.
2. **Queue three work orders on disjoint surfaces.** All three are claimed, one per node, within one poll.
3. **Queue two work orders on the SAME surface.** Exactly one is claimed; the other waits. The primary key
   on `surface_locks` is what enforces it, not the scheduler's good manners.
4. **Close a laptop mid-run.** Within one lease period another node claims that work order and can read the
   dead node's checkpoints, including what remained. It resumes rather than restarts.
5. **Stop every node, then start one.** It reconstructs the queue by asking the database, having been told
   nothing.
6. **Delete every control-plane row, then run reconstruction.** The queue comes back from git.
7. **Set `FACTORY_RUNNER_PG_URL` to a production URL on one node.** It must refuse — as a superuser URL, or
   by the release-broker boundary. If it ever does not, stop and treat it as a P0.

---

## 10. WHAT IS STILL NOT DONE

Stated so it is not discovered later:

- **The Work-PC QA restrictions stay exactly as they are.** They are not relaxed by any of this and must not
  be until this replacement has been independently verified.
- **No provider is launched by the default bootstrap.** What a node *does* is the director's business;
  wiring a specific agent into the bootstrap would be the machine-specific logic this design forbids.
- **The director's scheduling policy** — capabilities, conflicts, dependencies, security role, candidate
  provenance, resource availability — is modelled in the schema and only partly implemented in the claim.
  Dependencies and surfaces are enforced; capability and security-role matching are present but unexercised
  beyond a single filter.
- **`security_role` is recorded and not yet enforced.** A node marked `generic` is not yet prevented from
  claiming work that requires `release_broker`, because nothing yet issues such work.
- **The Edge campaign still runs on its own dispatch path** (`dispatch-isolated-verifier.sh` +
  `verifier-watchdog.sh`), deliberately untouched while an Edge verifier is in flight (#105 is the final planned
  round by the founder's ruling of 2026-09-17).
- **Two MACHINES sharing one plane is not proved.** `qa/factory/shared_local_pg.mjs` serves a persistent, provisioned,
  non-production PostgreSQL on loopback and any number of runner PROCESSES on this machine share it (claiming, surface
  locks, lease expiry, checkpoint resume across process death — `shared_control_plane_acceptance.mjs`); a second computer
  needs a database it can reach, which is the founder's boundary (§ THE ONE THING NEEDED FROM THE FOUNDER).

---

## 11. EVIDENCE

`qa/factory/acceptance.mjs` — **48 passed, 0 failed** (was 31 when this file was first written; rows were added by later
work orders), against a real PostgreSQL started for the run and discarded afterwards. The harness proves it is a real server before anything else runs, by having two
concurrent clients take different rows under `for update skip locked`: every claim in the suite is about
locking and transaction visibility, and an in-process fake would pass all of them while proving nothing.

```
node qa/factory/acceptance.mjs
```

Requires `pg` and `embedded-postgres` (dev dependencies, installed with `--no-save`). No configuration, no
credentials, and no network access to anything but npm.

### The shared plane on one machine (Factory V1 milestone 1, 2026-09-18)

```
node qa/factory/shared_local_pg.mjs start        # persistent embedded PostgreSQL 18 under .factory/control-plane/, loopback port 54329,
                                                 # provisioned by provision-control-plane.mjs (its refusals run first) + 002; serves until stopped
node qa/factory/shared_local_pg.mjs status       # nodes / work orders / runs / checkpoints / locks it holds
node qa/factory/shared_control_plane_acceptance.mjs   # 9/9: CP-0 a real server in its own process; CP-1 a separate runner
   # process reaches it (node.mjs health); CP-2 the runner refuses the superuser URL; CP-3 two processes race for one
   # work order; CP-4 the winner's run, checkpoint and both registrations persist after both exit; CP-5 a worker that
   # dies mid-run (exit 3) is recovered after its lease expires by another process that sees its checkpoint; CP-6 rows
   # persist across invocations; CP-7 (milestone 2) the PLANE is stopped and restarted between a worker's death and the
   # takeover - the restarted plane holds the dead run's checkpoint, serves the SAME credential, and a fresh process
   # resumes the work order; CP-8 (milestone 3) three runner processes, two work orders on one surface - the conflicting
   # pair never runs overlapped, the free work order is claimed, every work order is done after a second wave.
```

Two restart defects CP-7 found in `shared_local_pg.mjs` itself, both fixed: (1) a restart re-ran the founder's provisioning,
which ROTATES the runner role's password, so every process holding the URL from `runner.env` was locked out of the restarted
plane - on reopen only the idempotent schema files are re-applied and the credential is kept; (2) on Windows the embedded
wrapper's `stop()` can return while the postmaster's `io_worker` children are still alive, and the next postmaster refuses to
start over their shared memory ("pre-existing shared memory block is still in use") - `stop` now waits for them and
terminates orphans, and `start` terminates any postgres worker whose parent process is gone before starting.

CP-5 found a defect the disposable suite could not see: the claim's lease-expiry step returned the abandoned RUN to
`queued` and left the WORK ORDER at `claimed`, so a dead worker's work order was never claimable again by anyone (acceptance
row E/G passed only because it reset the work order by hand). `claim.mjs` now returns the work order to `queued` in the same
transaction, keyed on the expired runs. That is the checkpoint-resume half of milestone 2, proved across real processes.

The runner URL for other processes is written to `.factory/control-plane/runner.env` (git-ignored) and printed nowhere.

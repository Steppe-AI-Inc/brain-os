# FACTORY CONTROL PLANE — SETUP

**Status:** PLANE LIVE 2026-09-18 on the dedicated Supabase project npvhuoozkbexddnvkqsj (TLS 1.3 verify-full, factory_runner boundary proved); Home node ALIVE under the scheduled task since 2026-09-22 (reboot recovery 9/9, TWO_MACHINE_CONTROL_PLANE.md §H); waiting on the Work-PC bootstrap. Before that: TWO-MACHINE PACK PREPARED 2026-09-18 (`TWO_MACHINE_CONTROL_PLANE.md`; one founder action in its §0; shared acceptance 18/18, TLS network path 7/7, disposable acceptance 48/48, health 10/10). Before that: local acceptance complete (48/48 against a disposable real PostgreSQL; health 10/10) and the SHARED plane proved on ONE machine (`qa/factory/shared_control_plane_acceptance.mjs`, 18/18 across separate runner processes over TCP on a persistent embedded PostgreSQL 18, including failover across a plane restart, three processes on conflicting surfaces, role-based independent verification, monitor garbage collection, admission control, heavy-job limits, and the model-assurance gate on the real node path). **One founder action outstanding: a database a SECOND computer can reach** (a hosted non-production PostgreSQL, or this machine's port opened to the LAN) — the only part of milestone 1 this machine cannot do alone.
**Branch** `factory/computer-agnostic-control-plane` · **Nothing here has been deployed or applied anywhere.**

---

## THE ONE THING NEEDED FROM THE FOUNDER

> **2026-09-18 — the two-machine pack is prepared: `qa/work-orders/TWO_MACHINE_CONTROL_PLANE.md`** (§0 the one founder action;
> §A exact connection requirements; §B health checks incl. `plane-health.mjs`; §C/§D the one bootstrap `bootstrap-node.sh --role`;
> §E `two_machine_failover.mjs`; §F rollback/cleanup; §G the order of what runs once the database exists). The accessor now
> FAILS CLOSED on an unsafe URL (superuser, the production project anywhere in the URL, a network crossed without TLS) before
> a socket opens; the provisioner applies 001-003 and states the role's attributes; `FACTORY_NODE_ROLE` fixes a silent
> demotion of a verifier node on every start.
>
> The network path is proved on this machine: `qa/factory/tls_plane_acceptance.mjs` (7/7) serves a disposable PostgreSQL 18 on
> this machine's own LAN address with `ssl=on` and `hostssl`-only rules, and drives `node.mjs health`, `plane-health.mjs` and a
> die/resume pair of worker processes over TLS there; the server rejects plaintext, the accessor refuses it earlier, a wrong root
> certificate is refused, and the superuser is refused even over TLS. Measured driver facts (pg 8.23): `require` is an alias of
> verify-full, and verify-full cannot check an IP host - the exact URL forms are in the pack's §0 step 2.

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
git clone <repo> && cd <repo> && npm ci
bash scripts/factory-runner/bootstrap-node.sh --role <generic|verifier> --env-file ~/.brain-factory/runner.env
# Windows (every PC here): the node runs under the scheduled task, never in a terminal
powershell -ExecutionPolicy Bypass -File scripts\factory-runner\install-autostart.ps1 -Role <generic|verifier> -Start
```

The role is stated once, at install (`-Role`), and the running worker holds it on the plane. A bare
`node scripts/factory-runner/node.mjs start` is for a node with no supervisor only: it does not start while a supervisor or
another worker runs the same node identity (exit 4) - one worker per node - and it registers the role in `FACTORY_NODE_ROLE`
(default generic). `TWO_MACHINE_CONTROL_PLANE.md` §H is the operating reference.

On first run the node generates a uuid identity, persists it in `.factory/node-id`, registers itself and
reports **derived** capabilities — each one a question with a checkable answer, because a capability list
somebody types is one somebody forgets to update, and that failure is silent. It reads ALIVE on the plane only once it has
completed a claim cycle; registering alone - or running a health check - never makes a node look alive.

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
  ok   refreshed its registration, role generic kept as the plane holds it (1 node(s) known to this control plane)

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
- **`security_role` is enforced from the plane's node record** (acceptance SEC rows in-process; CP-9 / CP-10 across
  processes): a generic process cannot claim verifier or release_broker work, whatever its claim asserts.
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
node qa/factory/shared_control_plane_acceptance.mjs   # 18/18: CP-0 a real server in its own process; CP-1 a separate runner
   # process reaches it (node.mjs health); CP-2 the runner refuses the superuser URL; CP-3 two processes race for one
   # work order; CP-4 the winner's run, checkpoint and both registrations persist after both exit; CP-5 a worker that
   # dies mid-run (exit 3) is recovered after its lease expires by another process that sees its checkpoint; CP-6 rows
   # persist across invocations; CP-7 (milestone 2) the PLANE is stopped and restarted between a worker's death and the
   # takeover - the restarted plane holds the dead run's checkpoint, serves the SAME credential, and a fresh process
   # resumes the work order; CP-8 (milestone 3) three runner processes, two work orders on one surface - the conflicting
   # pair never runs overlapped, the free work order is claimed, every work order is done after a second wave;
   # CP-9 (milestone 4) roles across processes - a generic process cannot claim verifier work, a verifier process can,
   # release_broker work is refused by both; CP-10 a process asserting release_broker capability in its claim while
   # registered generic is refused (the plane's node record decides); CP-11 a different process and node verifies an
   # authored run through the runner's own recordVerification, a run cannot verify itself, and a new process on the
   # AUTHORING node cannot verify it either; CP-12 (milestone 5) monitor garbage collection - monitors following files that
   # stopped moving are found and reaped, a monitor on a moving file is spared (43 of 47 on the Home PC on 2026-09-18, alive
   # since rounds #71-#105); CP-13 admission control - a process below the memory floor refuses to claim and says why, the
   # work order stays queued, a process within limits claims it; CP-14 heavy-job limits - one heavy run per node (max_heavy)
   # and FACTORY_HEAVY_PER_PLANE on the plane, enforced inside the claim's transaction, light work never limited;
   # CP-15 (milestone 6) a process intending deepseek-chat with no DEEPSEEK_API_KEY is declined verifier work as
   # BLOCKED_BY_CREDENTIAL, the work order waits, and it may still take generic work with the requested model recorded;
   # CP-16 a run that requested one model and reports another without a reason is refused by completeRun; CP-17 a model
   # with no evidence is declined verifier work as UNVERIFIED and admitted after two completed runs within 14 days.
```

Milestone 6's measurable half. `node.mjs` now passes the node's intended provider and model (FACTORY_MODEL_PROVIDER /
FACTORY_MODEL, stated in its log) to `claimWork`; before this the real node path claimed with no requested model, so the
assurance gate never fired and the no-silent-fallback constraints compared against null. `claim.mjs` tells `deriveAssurance`
whether this process holds the provider's credential (CREDENTIAL_ENV: deepseek → DEEPSEEK_API_KEY, openai → OPENAI_API_KEY;
Anthropic is reached through the `claude` CLI's own login and is judged by evidence), and a declined work order no longer
starves the node: the pick is a loop that excludes the declined one and tries the next eligible (CP-15 found that a verifier
work order at the head of the queue hid every generic work order behind it). What remains founder-gated: the DeepSeek
credential itself (an Edge Function secret, plus the unmerged provider migration on `codex/sem-brain-v1`), and an HTTP
provider call path - `provider.mjs` shells the `claude` CLI only - without which no cheap-QA round can actually run on DeepSeek.

**The HTTP provider call path now exists** (`scripts/factory-runner/provider-http.mjs`, proved by `qa/factory/http_provider_acceptance.mjs`
9/9 against a stub OpenAI-compatible server and a disposable plane): the credential is read from the environment at call time and
goes nowhere else (no request is made without it: BLOCKED_BY_CREDENTIAL); HTTP success is not a completed run (a stream that
never terminates, a body that stopped for length, a malformed body are named terminal conditions, never `completed`); the
model that answered is reported as the provider named it, so a substitution is refused by the plane without a fallbackReason;
401/429/5xx/network are classified, never thrown; the key appears in no control-plane row afterwards; and the assurance gate
admits deepseek-chat to verifier work only after two completed HTTP runs. What remains for milestone 6 is the key itself.

Milestone 7's measurable half (BUG-036 / BUG-037 / required security acceptance). `qa/factory/dbtest_on_disposable_pg.mjs
<product repo> [<log dir>]` starts the factory's disposable PostgreSQL 18.4, creates a `dbtest` database of its own (UTF8 from
template0 - a Windows initdb defaults to WIN1252, in which the drafts' box-drawing comment characters do not exist), and runs
the product repo's `qa/dbtest` harnesses against it with `DBTEST_PG_URL`. On `wo/invitation-delivery` at `391445d4`: 82/82
migrations, acceptance 36/36, personas 57/57 with all four targets SECURITY VERIFIED (the only engine `db.mjs` lets say so),
draft 202609110001 acceptance 26/26 rollback included, and the two-supervisor claim race VERIFIED under real concurrency. The
remainder is founder-gated: Auth inspection for BUG-036's cause, authorization of the draft migration, the production web
deploy, and the Work PC's retest. Record: control repo `qa/verification/factory_v1/MILESTONE7_2026-09-18.md`; candidate-repo
ledger 212.

Milestone 5 adds `scripts/factory-runner/monitor-gc.mjs` (list / reap, quiet-window rule on the followed file's mtime, never on
its contents), `scripts/factory-runner/admission.mjs` (FACTORY_MIN_FREE_MB, FACTORY_MAX_CPU_PCT, FACTORY_ADMISSION=off - read by
`claimWork`, which records the refusal on `claimWork.lastAdmission` so a caller reports it rather than reading it as "nothing to
take"), and `supabase/control-plane/003_resource_governance.sql` (`work_orders.weight`, `nodes.max_heavy`; applied by
`shared_local_pg.mjs` and by every disposable harness). The founder's one-shot `provision-control-plane.mjs` still applies 001 only.

CP-11 found a third control-plane defect: the claim recorded the authoring NODE but never the authoring RUN, so
`verification_is_independent` (verification_run_id <> authoring_run_id) was vacuous and a run could record a verification of
itself; the claim now sets `authoring_run_id = run_id` in the same transaction, and `claim.mjs` gained `recordVerification`
- the runner's own path for a verifier run to record its verdict on an authored run, returning the database's acceptance
or the constraint's refusal.

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

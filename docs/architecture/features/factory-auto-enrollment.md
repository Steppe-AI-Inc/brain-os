# Feature contract — Factory V1: Node Management + Zero-Touch Auto-Enrollment

- **Filed** 2026-09-26 on branch `factory/auto-enrollment-v1-contract`, created from the frozen certified baseline
  `69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6`. That baseline remains the semantic reference for the execution engine.
- **Contract reference:** `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md`. The template's 11 sections are covered inside the
  founder's 13 requested sections; §C.13 maps them.
- **Governance:** `docs/architecture/adr/ADR-2026-09-26-node-roles-are-labels.md`.
- **Transport non-regression contract:** `docs/architecture/features/factory-auto-enrollment-transport-matrix.md`.
- **State vocabulary** (drift-tested): `docs/architecture/features/factory-auto-enrollment.states.json`.

How to read this file:

| Part | Content | Authority |
|---|---|---|
| **A** | Binding text, verbatim from the founder / Director | The implementer may not change it; a problem with it is a CHANGE REQUEST |
| **B** | Open change requests, with their interim ratified-baseline behavior | Not implemented until the Director ratifies |
| **C** | Engineering design (the implementer's own authority) | Must satisfy A and must not implement anything in B |

**Ratification status:** Part A is ratified as given. CONTRACT RATIFIED (the Director's ratification of Parts B and C where they
touch what must be true) is **not yet recorded**.

---

# PART A — BINDING (verbatim)

## A.1 Original contract (founder, 2026-09-26)

### 1. PRODUCT CONTRACT

Factory computers are managed from:

**Brain OS → Factory → Computers**

Permanent onboarding flow:

**Add Computer → configure authorization envelope → generate short-lived pairing code → download BrainFactorySetup.exe → enter
code on clean PC → automatic enrollment → node ALIVE → scheduler can use it.**

The enrolled computer must require **none** of the following:

`Git / npm / source checkout / PowerShell bootstrap / runner.env / CA copying / PostgreSQL URL / Supabase credentials / manual
machine-role assignment`

Canonical separation:

`NODE AUTHORIZATION ≠ CURRENT ASSIGNMENT`

`NODE CAPABILITY ≠ CURRENT ROLE`

`RESOURCE FITNESS MUST NEVER CREATE AUTHORITY`

`HOSTNAME MUST NEVER CREATE AUTHORITY`

`FOUNDER_POKE_NOT_REQUIRED`

Work PC `DESKTOP-8P5HVAO` should normally receive compute-heavy implementation work because of its resource fitness.

Home PC `DESKTOP-MDPE6FS` should normally receive coordination and independent-verification work when eligible.

Those are **scheduler preferences**, not hard-coded machine identities.

### 2. STATE MACHINE

Enrollment:

`UNENROLLED` → `PAIRING_CODE_ISSUED` → `PAIRING_STARTED` → `PAIRING_VERIFIED` → `NODE_ID_ISSUED` → `NODE_CREDENTIAL_ISSUED` →
`RUNTIME_INSTALLING` → `REGISTERING` → `ALIVE`

Possible failure states: `PAIRING_EXPIRED` `PAIRING_REVOKED` `PAIRING_CONSUMED` `INSTALL_FAILED` `REGISTRATION_FAILED`
`CREDENTIAL_REVOKED`

Runtime: `AVAILABLE` → `CLAIMING` → `BUSY` → `CHECKPOINTING` → `COMPLETING` → `AVAILABLE`

Operational states additionally include: `DRAINING` `STALE` `OFFLINE` `RECOVERING`

Verification: `IMPLEMENTED` → `WAITING_FOR_INDEPENDENT_VERIFICATION` → `VERIFICATION_CLAIMED` → `VERIFIED` → `COMPLETE`

If no eligible independent verifier exists: **remain WAITING. Never self-certify.**

### 3. INVARIANTS

The pairing code must be:
- short-lived
- one-time
- random
- server-validated
- tenant-bound
- authorization-envelope-bound

It must **not** be a reusable credential.

The installer must never receive a raw database password or `FACTORY_RUNNER_PG_URL`.

Each enrolled computer gets its own durable, independently revocable **node identity and credential**.

Hostname is descriptive metadata only.

A node credential cannot change its own authorization envelope.

Authorization and tenant identity are derived server-side from authenticated node identity, never trusted from request-body
fields.

For scheduling: **authorization → tenancy → capability → independence → conflicts → health → resources → load → priority**

The latter resource/load criteria cannot override the earlier security criteria.

### 4. SECURITY / TENANCY MODEL

The permanent path becomes:

**Node Runtime → authenticated Factory Node API → Factory Control Plane**

Not:

**Node Runtime → raw PostgreSQL**

This is a major architectural change from the frozen baseline.

## A.2 Founder decisions (2026-09-26)

- **API host:** Supabase Edge Functions on the dedicated Factory project `npvhuoozkbexddnvkqsj` (not Brain OS production).
  - Canonical computer, credential and pairing state lives in the plane's `factory` schema.
  - All authority lives in SECURITY DEFINER SQL functions.
  - The Brain OS Computers page calls the admin API with the user's own Brain OS token, and the API re-derives authority.
  - Brain OS production gets no schema change.
- **Tenant:** an operator tenant. A `factory.tenants` row (one today) and `tenant_id` on every factory row. The authorization
  envelope may optionally narrow a node to specific company_ids.
- **Installer:** a single Node SEA exe that is both setup and runtime. Per-user install, no admin. Code signing is a founder
  action; until then builds are unsigned with a published sha256.
- **Scope:** contract + build to DEV-VERIFIED, then READY FOR INDEPENDENT QA.

## A.3 Corrections (founder, 2026-09-26, "APPROVE THE PLAN AFTER THESE CANONICAL CORRECTIONS")

### 1. VERIFIER INDEPENDENCE

**AUTHORING RUN != CERTIFYING RUN**, and durable independent verifier authority and provenance are required. Canonical
independence derives from:
- WORK ORDER
- AUTHORING RUN
- CERTIFYING RUN
- DISTINCT AUTHORIZED VERIFIER IDENTITY/AGENT
- EXACT CANDIDATE PROVENANCE
- CURRENT VERIFIER AUTHORITY
- POLICY

Hostname, node hostname, physical computer and machine fingerprint MUST NOT independently grant certification authority. A
different machine is neither sufficient nor universally required.

For THIS milestone only, keep DESKTOP-8P5HVAO as implementation candidate author and DESKTOP-MDPE6FS as independent acceptance
machine. That is a campaign-level acceptance requirement, not the generic Factory independence invariant.

Regression cases must prove:
- the same authoring run cannot certify itself;
- a different hostname alone is insufficient;
- a different machine fingerprint alone is insufficient;
- the same hostname can be acceptable if all actual independence requirements pass, where policy permits;
- a campaign policy may explicitly require physical-node separation without redefining generic independence.

### 2. PAIRING CODE SECURITY

Do not store `SHA256(pairing_code)`, and do not claim 60-bit raw hashes are categorically safe from offline guessing. Use keyed
verification: `HMAC-SHA256(server-side FACTORY_PAIRING_PEPPER, normalized_pairing_code)`. The pepper exists only inside the
Factory server boundary. The human-entered Crockford code may be kept.

Required:
- short TTL
- one-time use
- atomic consume
- revoked/expired/consumed rejection
- per-code attempt cap
- source-IP rate limit
- tenant rate limit
- audit record
- constant-time comparison where applicable

The pairing code is never itself a node credential.

### 3. WORKTREE ISOLATION

- **LIVE LEGACY CHECKOUT** `C:\Users\DELL\dev\brain-os-factory-cp` must remain frozen at 69df2f52. The feature branch is never
  checked out there.
- **FEATURE WORKTREE** `C:\Users\DELL\dev\brain-os-factory-enroll` is on `factory/auto-enrollment-v1-contract` and advances
  normally.
- Tests from the feature worktree must not touch: the BrainOS Factory Node live Scheduled Task, `~/.brain-factory/runner.env`,
  the live Factory plane, production, or master.

### 4. NON-REGRESSION TAKEOVER CONTRACT

Before changing the claim / renew / checkpoint / complete transport, materialize the compatibility matrix. The API must wrap the
SAME canonical lifecycle semantics, not create another orchestration state machine. Permanent acceptance: A claims → checkpoints
→ A loses lease → eligible B takes over → B resumes checkpoint → stale A cannot renew/checkpoint/complete → B completes exactly
once → independent verifier certifies when required.

### 5. PRIORITY TYPE

The new schema/API must use a numeric priority type and regression-test ordering, not preserve lexical sorting.

## A.4 Governance + execution authority (founder, 2026-09-26, §1–12)

**§1 Canonical Work Order authority.**
- The DIRECTOR owns the canonical product contract, invariants, binding Work Orders, binding acceptance criteria and the
  verification specification, and reviews/ratifies any proposal that changes WHAT MUST BE TRUE.
- The WORK PC owns the implementation proposal, engineering decomposition, technical subtasks, estimates, sequencing and
  implementation.
- INDEPENDENT ACCEPTANCE verifies against criteria the implementer did not define for itself.
- The implementer MUST NOT autonomously:
  - weaken an invariant;
  - remove an acceptance criterion;
  - redefine PASS;
  - reinterpret a failed requirement;
  - change security/tenancy semantics;
  - change takeover/fencing semantics;
  - redefine verifier independence.
- An impossible, contradictory, unsafe or wrong binding requirement becomes a **CHANGE REQUEST — DIRECTOR DECISION REQUIRED**.
  It states the requirement, the evidence, why it cannot be met, the alternative, and the compatibility/security impact.

**§2 Governance evolution.** Recorded as `docs/architecture/adr/ADR-2026-09-26-node-roles-are-labels.md`.

**§3 Current placement.** DESKTOP-8P5HVAO implements; DESKTOP-MDPE6FS is Director / Coordinator / Independent Verifier; the
third PC is for real zero-touch acceptance only. This is current placement, not permanent architectural authority, and no
hostname is encoded as a role rule in the product.

**§4 Scope the implementer must deliver.** Factory tenant/node/pairing/credential schema; Factory Node API; Factory Admin API
support needed by the Computers UI; node-scoped authentication; authorization envelopes; capability reporting; resource
telemetry; scheduler eligibility/ranking; takeover compatibility through the API; Computers dashboard integration; Add Computer
flow; pairing protocol; BrainFactorySetup.exe / Node SEA; bundled runtime; persistent Windows runtime/service/watchdog;
development release manifest/artifact verification; drain/resume; credential rotate/revoke; runtime upgrade plumbing;
tests/evidence. The implementer does NOT self-certify. The phase ends at DEV-VERIFIED → exact candidate SHA frozen → pushed
feature branch → READY FOR INDEPENDENT QA.

**§5 Preserve the certified execution engine.**
- 69df2f52 remains the semantic reference for:
  - the shared unassigned Work Order queue;
  - atomic claims, leases, lease renewal;
  - checkpoint/resume, takeover, stale-worker fencing;
  - exactly-one completion;
  - surface/conflict locks;
  - restart/recovery, provenance, verifier independence.
- OLD: NODE → runner.env → raw PostgreSQL → Factory control plane. NEW: NODE → node-scoped credential → Factory Node API → SAME
  canonical Factory control-plane state machine.
- DO NOT build a second orchestration engine inside Edge Functions. The API is an authenticated command boundary over the
  canonical lifecycle.

**§6 Takeover non-regression.** Permanent compatibility acceptance must prove:
1. A claims the Work Order and obtains a lease.
2. A checkpoints P1.
3. A becomes unavailable / loses its lease; the real lease expires.
4. An eligible B claims the abandoned work and receives P1.
5. B reconstructs state and resumes unfinished work only.
6. Stale A tries renew: REJECTED. Stale A tries checkpoint: REJECTED. Stale A tries completion: REJECTED.
7. B completes: exactly one successful completion, no duplicate completed side effects, valid surface-lock ownership preserved.
8. Independent certification occurs when required.

**Auto Enrollment V1 FAILS if this behavior regresses.**

**§7 Eligibility order.** Takeover and normal scheduling use hard gates first:

1. valid credential
2. tenant match
3. company-scope match
4. authorization
5. required role
6. required capabilities
7. implementer/verifier independence
8. surface/conflict locks
9. drain state
10. health / heartbeat freshness
11. max-concurrency capacity
12. hard minimum resources

ONLY THEN rank eligible nodes using: resource fitness, preferred work class, CPU headroom, RAM headroom, disk headroom, current
load, recent reliability, locality, priority, queue age.

**RESOURCE FITNESS MUST NEVER CREATE AUTHORITY.**

**§8 Independent verification model.** Canonical invariant: AUTHORING RUN != CERTIFYING RUN.
- Certification authority derives from WORK ORDER + AUTHORING RUN + CERTIFYING RUN + AUTHORIZED VERIFIER IDENTITY + EXACT
  CANDIDATE PROVENANCE + CURRENT AUTHORITY + INDEPENDENCE POLICY.
- Do NOT encode "different hostname = independent". Do NOT encode "different physical machine = automatically independent".
- A specific acceptance campaign may require a different physical node, including this milestone's final Home-PC verification,
  but hostname itself grants zero authority.

**§9 Pairing security.**
- Do not store raw SHA256(pairing_code). Use keyed verification: HMAC-SHA256(server-side FACTORY_PAIRING_PEPPER,
  normalized_pairing_code).
- Requirements:
  - short-lived
  - one-time
  - atomically consumed
  - tenant-bound
  - authorization-envelope-bound
  - attempt-limited
  - IP rate-limited
  - tenant rate-limited
  - audited
  - revoked/expired/consumed codes fail closed
- The pairing code is never a node credential.

**§10 Compatibility matrix before transport migration.**
- Columns: OLD CALL, OLD DB PRIMITIVE, OLD TRANSACTION BOUNDARY, OLD AUTHORITY CHECK, OLD LEASE/FENCING RULE, NEW API ENDPOINT,
  NEW SERVER PRIMITIVE, NEW AUTHORITY CHECK, REGRESSION TEST, VERDICT.
- Rows at minimum: register, heartbeat, discover/claim, lease renewal, checkpoint, complete, surface-lock acquire, surface-lock
  release, takeover/recovery, verification claim, certification.
- Do not mark an operation migrated until the old invariant has executable regression coverage.

**§11 Priority bug.** Director priority sorted as text. The new model must use numeric priority semantics, with a regression
proving, for example, 2 < 10 < 100 rather than lexical ordering.

**§12 Autonomous execution.** Proceed in AUTO MODE to:
CONTRACT RATIFIED → IMPLEMENTATION COMPLETE → DEV-VERIFIED → FEATURE BRANCH PUSHED → EXACT CANDIDATE SHA FROZEN → EVIDENCE
MATERIALIZED → READY FOR INDEPENDENT QA.

Stop only at genuine boundaries (BLOCKED — FOUNDER: live Factory migration, live Edge deployment, production secret creation,
production Brain OS deploy; BLOCKED — EXTERNAL where applicable).

## A.5 Final ratification rule (founder, 2026-09-26)

- If a proposal changes WHAT MUST BE TRUE, the Work PC may PROPOSE it but MUST NOT treat it as binding or implement against the
  changed requirement until the Director ratifies it. That covers:
  - the product contract;
  - an invariant;
  - a security boundary;
  - a tenancy rule;
  - a Work Order requirement;
  - an acceptance criterion;
  - a verification rule;
  - takeover/fencing behavior;
  - the definition of PASS.
- Flow: WORK PC DISCOVERS ISSUE → CHANGE REQUEST / PROPOSAL → DIRECTOR RATIFICATION → BINDING CONTRACT/WO UPDATE →
  IMPLEMENTATION.
- While waiting, continue every non-conflicting implementation item that remains valid under the already-ratified contract. Do
  NOT stop the whole campaign.
- Implementation details that do not change WHAT MUST BE TRUE stay entirely within Work-PC authority: file/module structure,
  internal helpers, test organization, refactoring, packaging mechanics, sequencing, local disposable test infrastructure, and
  semantics-preserving performance optimizations.
- Boundary wording: "Feature-branch PR INTO master / merge / production Brain OS deploy" is a founder boundary, and master stays
  untouched during this phase.

---

# PART B — CHANGE REQUESTS (Director decision required; NOT implemented)

| CR | Subject | Interim behavior (ratified baseline) |
|---|---|---|
| `qa/work-orders/change-requests/CR-001-factory-admin-allow-list.md` | A Factory-side admin allow-list in addition to the Brain OS role, motivated by side finding S1 (`profiles.role` self-update) | Admin = founder \| holding_admin, re-derived live per call. S1-shape persona reported **EXPOSED**. |
| `CR-002-verification-failure-state.md` | The binding verification machine has no failure state | Fail closed on binding states: stays WAITING with reason `last_verification_failed:<run>`, never COMPLETE, no automatic re-verification |
| `CR-003-founder-only-release-tier.md` | Founder-only for granting `release_broker` and for publishing releases | founder \| holding_admin, audited |
| `CR-004-installer-distribution-visibility.md` | Public bucket or signed URL | The API returns the URL recorded at publication; the founder's deploy decides |

---

# PART C — ENGINEERING DESIGN (implementer authority; must satisfy Part A)

## C.1 PRODUCT CONTRACT (engineering reading of A.1 §1)

- **A Computer is the managed entity** (`factory.computers`), created by Add Computer.
  - At its first successful enrollment the server mints a **durable `node_id`** (`node-<uuid>`). Re-pairing and legacy adoption
    keep that `node_id`, so run history stays attached.
  - A node holds many credentials over time, but **at most one is active** (partial unique index).
- **Authorization** (the envelope, what a node MAY do) is admin-set and versioned. **Capability** (what it CAN do) is detected
  and reported. **Assignment** (what it is doing now) is its current run. The dashboard always shows them separately:
  "Authorized up to …" vs "Currently …".
- **Preferences are data, never code.**
  - The admin sets `preferred_work_class` (implementation | verification | coordination) in the envelope.
  - The Work PC's preference for heavy implementation work comes from its resource fitness and its preferred class.
  - The Home PC's preference for verification comes from its preferred class plus the independence gate (it did not author the
    candidate).
  - No hostname appears anywhere in the product.
- **Required on the enrolled computer:** none of Git, npm, a source checkout, PowerShell bootstrap, runner.env, CA copying, a
  PostgreSQL URL, Supabase credentials, or manual role assignment.
  - The runtime is one Node SEA exe with its dependencies bundled.
  - Its identity is its credential; its role is its server-side envelope.
  - Windows' own `schtasks.exe` and `powershell.exe` (DPAPI only) are OS components invoked by the runtime, not a bootstrap the
    operator runs.
  - Work types that need a checkout (none of the V1 types) advertise `git` only when git is detected. That is a capability,
    never a prerequisite.

## C.2 STATE MACHINE

### Enrollment (stored in `factory.enrollments`, the per-attempt record, and `factory.pairing_codes`; the computer's displayed state is derived by `factory.computer_status_v`)

| From | To | Trigger | Who | Preserves |
|---|---|---|---|---|
| UNENROLLED | PAIRING_CODE_ISSUED | `admin issue_pairing_code` | founder \| holding_admin (re-derived) | the computer and the envelope version the code is bound to |
| PAIRING_CODE_ISSUED | PAIRING_STARTED | `enroll/start` with a valid code | holder of the code | the code is locked to one enrollment session; attempts are counted |
| PAIRING_CODE_ISSUED | PAIRING_EXPIRED | TTL passes (evaluated on read and at start) | time | the computer; a new code can be issued |
| PAIRING_CODE_ISSUED \| PAIRING_STARTED | PAIRING_REVOKED | admin revoke; envelope edit; per-code attempt cap; newer code issued | admin / system | audit row with reason |
| PAIRING_STARTED | PAIRING_VERIFIED | `enroll/complete`: Ed25519 proof over the session nonce verified | the holder of the private key | inside the complete transaction; audit milestone |
| PAIRING_VERIFIED | NODE_ID_ISSUED | same transaction | server | durable `node_id` (kept on re-pair / adoption) |
| NODE_ID_ISSUED | NODE_CREDENTIAL_ISSUED | same transaction: code consumed, credential inserted, any older credential `superseded` | server | exactly one active credential |
| any code state | PAIRING_CONSUMED | an attempt to use an already-consumed code (**an event and the code's terminal state**, never a computer state) | — | the existing enrollment is untouched |
| NODE_CREDENTIAL_ISSUED | RUNTIME_INSTALLING | the setup reports it (signed call) | node (descriptive) | grants nothing |
| RUNTIME_INSTALLING | REGISTERING | the first `register` call | node | — |
| RUNTIME_INSTALLING | INSTALL_FAILED | the node reports it, **or** derived: no `register` within `stall_after_s` (900 s) | node / time | re-runnable setup; the credential stays until revoked |
| REGISTERING | ALIVE | **server-observed** first completed claim cycle (`first_claim_cycle_at`) with a fresh heartbeat | server | — |
| REGISTERING | REGISTRATION_FAILED | the node reports it, or derived stall | node / time | — |
| any enrolled | CREDENTIAL_REVOKED | admin revoke-credential or archive | admin | leases of that node expired at once; history kept |
| CREDENTIAL_REVOKED | PAIRING_CODE_ISSUED | admin re-pair | admin | the same `node_id` |

### Runtime (the node reports `runtime_phase`; the server derives the displayed state)

| From | To | Trigger |
|---|---|---|
| AVAILABLE | CLAIMING | claim call in flight (reported) |
| CLAIMING | BUSY / AVAILABLE | claim receipt: claimed / nothing claimable |
| BUSY | CHECKPOINTING → BUSY | checkpoint call |
| BUSY | COMPLETING → AVAILABLE | complete call |
| any | DRAINING | admin `drain`: no new claims; current work finishes (server fact, `computers.drain_requested_at`) |
| DRAINING | AVAILABLE | admin `undrain` |
| any | STALE | derived: heartbeat age > `stale_after_s` (180 s, the baseline's 3 min); an admission-refusing node stamps no liveness (N42) |
| STALE | OFFLINE | derived: heartbeat age > `offline_after_s` (900 s) |
| STALE \| OFFLINE | RECOVERING | a restarted worker's `register` until its first completed claim cycle |
| RECOVERING | AVAILABLE | first completed claim cycle |

Display precedence (a presentation detail): CREDENTIAL_REVOKED > ARCHIVED > OFFLINE > STALE > DRAINING > RECOVERING > reported
phase.

### Verification (`factory.work_orders.verification_state`; CHECK-tied to `status`, never a second machine)

| From | To | Trigger | Preserves |
|---|---|---|---|
| (run done) | IMPLEMENTED → WAITING_FOR_INDEPENDENT_VERIFICATION | `_op_complete` of work with `requires_verification`, **same statement**: `status='review'`, authoring candidate recorded, one linked `independent_verification` work order inserted | dependents stay blocked (they need `done`) |
| WAITING | VERIFICATION_CLAIMED | an eligible verifier claims the linked work order (gates 1–12) | — |
| VERIFICATION_CLAIMED | WAITING | the verifier's lease lapses (takeover of verification work) | — |
| VERIFICATION_CLAIMED | VERIFIED → COMPLETE | `_op_record_verification` PASS: every certification condition re-derived; **same transaction** `status='done'` | dependents released |
| VERIFICATION_CLAIMED | WAITING (reason `last_verification_failed:<run>`) | FAIL verdict — **CR-002 interim** | never COMPLETE |
| WAITING (no eligible verifier) | WAITING | — | reason computed from `_eligible` on read: `no_authorized_verifier`, `only_ineligible_verifiers:<gate>`, `verifier_offline`, … |

The director's `waiting_for_verifier` corresponds to WAITING.

## C.3 INVARIANTS (engineering form; each has a regression row and a mutant)

1. **Identity comes from the credential, never the body.** `node_id`, `tenant_id`, role and envelope come only from session →
   credential. A request body naming any of them is refused 400 `unknown_field`.
2. **A credential cannot write authority.** Authority columns (envelope, `security_role`, `computer_id`, `tenant_id`,
   `enrollment_kind`, drain/archive state) are writable only by the definer owner `factory_owner`. A guard trigger checks
   `current_user` inside the definer; **no GUC flag is ever authority** (SECURITY_INVARIANTS #8).
3. **Self-reported attributes may only narrow eligibility**, never widen it: hostname, fingerprint, resources, capabilities,
   runtime phase, admission.
4. **The 12 hard gates run before any ranking input is read.** A gated node is never admitted by ranking or deferral.
5. **Dependents are released only by `status='done'`.** Verification-required work reaches `done` only through a certification
   that passes.
6. **Independence** (binding A.3 §1 / A.4 §8):
   - certifying run ≠ authoring run (CHECK);
   - certifying identity (server-issued node id + agent identity) ≠ authoring identity;
   - `may_verify` is in the verifier's CURRENT envelope;
   - the declared candidate equals the recorded authoring candidate;
   - the applicable policy passes.
   Hostname and fingerprint are never inputs. **Default tenant policy = the 69df2f52 reference:** run ≠ run and node ≠ node (the
   existing `verification_is_independent` / `verification_node_is_independent` CHECKs). Relaxing it is a CR.
7. **Pairing:**
   - The DB holds only `locator`, `code_mac = HMAC-SHA256(pepper, "BRAIN-PAIR-V1|" + normalized)` and `pepper_version`.
   - The pepper never enters the DB, a log, or the web app.
   - Consumption is one transaction with the code row `FOR UPDATE`.
8. **Takeover fencing exactly as 69df2f52** (matrix rows 3, 5, 6, 9): a stale owner's renew, checkpoint and complete are
   refused; exactly one completion.
9. **Priority is numeric** (`priority_rank integer`, lower is served first). Lexical ordering exists nowhere.
10. **The functions are never deployable to Brain OS production.** They live in `supabase/control-plane/edge/`; the
    production workflow deploys `supabase/functions/**` only.
11. **The installer and runtime contain no PostgreSQL client, URL or credential.** The SEA bundle metafile excludes `pg`,
    `db.mjs` and the direct transport.

## C.4 SECURITY / TENANCY MODEL

- **Tenant.** `factory.tenants`:
  - one operator row, bound by value to Brain OS project `pvphxgrtdfrudejjhzjk`;
  - `tenant_id` on every factory row, backfilled and NOT NULL;
  - composite `(tenant_id, …)` keys where rows reference each other, so a cross-tenant reference is structurally impossible;
  - `surface_locks` PK `(tenant_id, surface)`;
  - a BEFORE INSERT trigger fills a null `tenant_id` from the single legacy-default tenant, so frozen-code nodes keep working
    (dropped at legacy retirement).
- **Company scope.** `envelope.company_ids` null means every work order of the tenant. Otherwise only work orders whose
  `company_id` is in the set, and no tenant-level (null company) work.
- **Node authentication.**
  - A device-held Ed25519 key signs a 60 s JWS assertion (`aud` pinned, `jti` stored until expiry, skew window
    [−120 s, +60 s] corrected from the server's `server_time`).
  - The assertion is exchanged for an opaque 600 s session token, stored as sha256 only.
  - Every call re-resolves session → active credential → active, non-archived computer → active tenant → CURRENT envelope,
    **inside the action's own transaction**.
  - Revocation takes effect on the next call. A mid-run revoke → 401 → the lease guard aborts → the lease is given back.
- **Admin authentication** (ratified rule):
  - `factory-admin-api` receives the caller's own Brain OS access token.
  - It checks the token issuer, then Brain OS `/auth/v1/user` (200), then `rpc/is_founder_or_admin` under that same token
    (exactly `true`), then `profiles.role` (for audit).
  - Any failure → nothing changed. The service role is never used.
  - The tenant is the one whose `brain_os_project_ref` matches the function's configured Brain OS project, never the body.
  - CR-001 would add an allow-list; it is not implemented.
- **Roles.**
  - `factory_owner` (NOLOGIN) owns the definer functions.
  - `factory_node_api` and `factory_admin_api` get USAGE + EXECUTE on their own front door only, and no table privileges.
  - `factory_runner` (legacy) keeps its table DML until retirement, but the guards refuse authority changes and any write for
    an enrolled node (`legacy_node_migrated`).
  - PUBLIC, anon, authenticated and factory_runner hold nothing in `factory_api` / `factory_admin` (INV2).
  - Every function: `security definer`, `set search_path = ''`, explicit `revoke all … from public`, function-level
    `statement_timeout` / `lock_timeout` (these survive transaction pooling).
- **Secrets** (founder provisioning): `FACTORY_NODE_DB_URL`, `FACTORY_ADMIN_DB_URL`, `FACTORY_PAIRING_PEPPER`. Config (not
  secret): `BRAIN_OS_SUPABASE_URL`, `BRAIN_OS_ANON_KEY`, `FACTORY_API_PUBLIC_BASE`. Supabase function secrets are project-wide,
  so the two functions are separated by code and EXECUTE grants, not by the platform.

## C.5 DATA MODEL (`supabase/control-plane/0NN_*.sql`; never `supabase/migrations/`)

| File | Content |
|---|---|
| `004_tenancy_computers.sql` | `tenants` + seed; `tenant_id` everywhere + backfill + fill trigger + composite keys; `computers`; `authorization_envelopes` (immutable versions: `max_security_role`, `allowed_work_types[]`, `granted_capabilities[]`, `company_ids[]`, `may_verify`, `may_coordinate`, `max_heavy`, `max_concurrent_runs`, `preferred_work_class`); `nodes` + (`computer_id`, `enrollment_kind`, descriptive `machine_hash`/`hostname`/`os`, `reported_resources`, `fitness_caps[]`, `runtime_version`/`runtime_sha256`/`runtime_phase`(+`_at`), `first_claim_cycle_at`, `admission_refused`); `work_orders` + (`company_id`, `priority_rank integer not null` backfilled high→10 medium→50 low→90 other→100, `queued_at`, `min_resources`, `requires_verification`, `verification_state`, `verification_waiting_reason`, `verifies_work_order_id`, `verifies_run_id`, `campaign_key`); `agent_runs` + (`computer_id`, `runtime_sha256`, `agent_identity`, `candidate`, certification record: `certifying_run_id`, `certifying_node_id`, `certifying_agent_identity`, `certified_candidate`, `verifier_envelope_version`, `policy_id`, `policy_version`, `certified_at`); legacy backfill: each existing node → computer (`enrollment_kind='legacy_manual'`) + envelope v1 derived from its role at migration time |
| `005_enrollment_credentials.sql` | `pairing_codes` (`locator`, `code_mac`, `pepper_version`, `computer_id`, `envelope_id`, `purpose` enroll\|re_pair, `state`, `issued_*`, `expires_at`, `attempts`, `max_attempts`, `consumed_*`, `revoked_*`, `revoke_reason`; partial unique locator among live codes; one live code per computer); `enrollments`; `node_credentials` (`public_key` 32 bytes, `thumbprint` unique, `status` active\|superseded\|revoked, `key_protection`); `node_sessions`; `node_assertion_jtis`; `api_idempotency`; `api_rate_limits`; `audit_events` (append-only); `installer_releases`; `verification_policies` (versioned; `tenant_default` \| `campaign`) |
| `006_lifecycle_core.sql` | `factory._op_*` (the claim.mjs statements moved; see the matrix), `factory._eligible`, `factory._node_rank`, `factory._ctx_from_session` / `_from_legacy` / `_from_actor`, `factory_legacy.node_call` |
| `007_api_front_doors.sql` | `factory_api.enroll_start` / `enroll_complete` / `credential_key` / `session_issue` / `node_call`; `factory_admin.admin_call`; roles and grants |
| `008_authority_guards.sql` | guard triggers (no-op tolerant, so a frozen-code `nodeBeat` rewriting the same role passes; an actual change raises `authority_column_guard`); the migrated-node guard |
| `retire/retire_legacy.sql` | outside the numbered chain; founder-only, after re-enrollment |

`governance/DATA_CLASSIFICATION.md` gets one row per new table.

## C.6 ENROLLMENT PROTOCOL

**Code format** (implementation detail within A.3 §2):
- 16 Crockford base32 chars, displayed `LLLL-SSSS-SSSS-SSSC`.
- `L` = 4-char random locator (not secret; unique among live codes). `S` = 11 secret chars (55 bits). `C` = Luhn-mod-32 check
  char, so a typo is caught locally before it costs an attempt.
- Normalization: uppercase; drop spaces and hyphens; I/L→1, O→0.
- Generated in `factory-admin-api` with `crypto.getRandomValues`, MAC'd there, and returned to the admin exactly once. It never
  appears in a receipt, log or the idempotency store.

**Flow:**
1. `POST /v1/enroll/start {code, public_key (raw Ed25519), fingerprint (descriptive), client}`.
   - The edge computes the MAC and the source-IP hash.
   - `factory_api.enroll_start(locator, mac, pepper_version, ip_hash, public_key, fingerprint, client)` runs as ONE transaction:
     1. rate limits (IP 20/min, tenant 600/min → `rate_limited`, Retry-After);
     2. the code by locator `FOR UPDATE`;
     3. state checks (expired / revoked / consumed / locked fail closed, distinct wording);
     4. double-HMAC compare under a per-call random key;
     5. a mismatch → `attempts + 1`, and at `max_attempts` (5) → revoked `attempts_exceeded`;
     6. a match → `started`, public key bound, a nonce issued.
   - Returns `{enrollment_id, nonce, computer_display, tenant_display}`. The setup shows "Enroll this computer as «X» in «T»?".
2. `POST /v1/enroll/complete {enrollment_id, signature over "BRAIN-ENROLL-V1|" + enrollment_id + "|" + nonce + "|" + thumbprint}`.
   - The edge verifies the signature with the bound key.
   - `factory_api.enroll_complete` runs ONE transaction: code → consumed; `node_id` minted (or kept); credential inserted (older
     → superseded); audit milestones PAIRING_VERIFIED / NODE_ID_ISSUED / NODE_CREDENTIAL_ISSUED.
   - Idempotent for the same key and thumbprint (`already_completed`, same ids). A different key → `pairing_consumed`.
3. Session exchange (C.4), then `report-state RUNTIME_INSTALLING`, `register`, and claim cycles until ALIVE.

**Key storage:**
- The private key is PKCS8 DER, DPAPI CurrentUser-protected (+ app entropy) through `powershell.exe -NoProfile -NonInteractive
  -Command -` with the key on stdin, never argv.
- File `%LOCALAPPDATA%\BrainFactory\credential\node-key.dpapi`, ACL'd to the user.
- If PowerShell is blocked: ACL only, recorded as `key_protection: acl_only` and shown on the page (never an authority input).

**Rotation:**
- node-initiated: sign with the old key, swap atomically, old → superseded;
- admin: re-pair (new code with purpose `re_pair`, same `node_id`).

**Revocation, archive and uninstall:**
- Revoke / archive expire the node's leases at once.
- Uninstall calls `credential_self_revoke`, which may only reduce the node's own authority.

## C.7 RELEASE ARTIFACT CONTRACT

**Build** (`scripts/factory-build/build-sea.mjs`):
1. esbuild (pinned) bundles `sea/main.mjs` to CJS. The metafile must not contain `pg`, `db.mjs` or the direct transport.
2. Node SEA blob (no code cache, no snapshot, so the build is deterministic).
3. `node.exe` copy, pinned by sha256 per Node version, with its Authenticode signature stripped.
4. postject injection.
5. `dist/brain-factory/<version>/{BrainFactorySetup.exe, build-info.json, SHA256SUMS}`.
6. A rebuild in a temp directory must produce a byte-identical sha256.

**Manifest** `release-manifest.json`:
- Fields: `{product: "brain-factory", version, channel: dev|stable, api_protocol: 1, build_commit, built_at, min_supported,
  artifacts: [{name, sha256, size, authenticode: {signed, thumbprint|null}}]}`.
- Signature: detached Ed25519 over the canonical JSON.
- The runtime pins the release public keys:
  - The DEV key is generated locally, never committed, labelled DEV, and accepted only on channel `dev`.
  - The production key is founder custody (BLOCKED — EXTERNAL → FOUNDER).
- An unsigned (Authenticode) exe is allowed only on channel `dev`, with its published sha256.

**Upgrade:** `node/release` returns the tenant channel's manifest and URL. The runtime then:
1. verifies the manifest signature and the exe sha256;
2. stages the new exe;
3. swaps **only when idle** (no held run);
4. restarts through the supervisor and confirms the version reported to the server;
5. rolls back automatically if confirmation fails.

`tenant.settings.min_runtime_version` → claims refused `update_required`, visibly.

## C.8 DASHBOARD UX (Brain OS → Factory → Computers)

**Surfaces:**

| Route | Contents |
|---|---|
| `/software-factory/computers` | list + "Waiting verifications" card + Add Computer |
| `/software-factory/computers/[computerId]` | detail: enrollment stepper with audit timestamps, pairing panel, envelope (versions), credential history, runtime state with telemetry, recent runs (authored / verified), lifecycle actions, audit tail |

- Nav: a FACTORIES group item "Factory Computers", with the longest-prefix active rule.
- Strings: EN/MN.
- The legacy `workers` page gets a banner only.

**Each state renders a badge, an explanation and the next action:**

| State | Badge / explanation | Next action |
|---|---|---|
| UNENROLLED | "Not paired" | Generate pairing code |
| PAIRING_CODE_ISSUED | code shown **once** in `LLLL-SSSS-SSSS-SSSC`, countdown, download button + sha256 + signed/unsigned note (SmartScreen steps when unsigned), 3 steps | Revoke code |
| PAIRING_STARTED | "Setup started on a PC — waiting for confirmation" | Revoke |
| PAIRING_EXPIRED / REVOKED | reason | Generate new code |
| NODE_CREDENTIAL_ISSUED / RUNTIME_INSTALLING / REGISTERING | stepper; "stalled" after 15 min with a reason | Re-pair |
| INSTALL_FAILED / REGISTRATION_FAILED | reported reason | Re-run setup / Re-pair |
| ALIVE + runtime state | AVAILABLE / BUSY (run link) / DRAINING / STALE ("last seen …") / OFFLINE ("user signed out or PC off") / RECOVERING | Drain / Undrain |
| CREDENTIAL_REVOKED | — | Re-pair |
| Archived | — | Restore (then re-pair) |
| Legacy (manual) | "Legacy shared credential — re-pair to enroll" | Generate re-pair code |

**Refusal states:**
- not an admin;
- control plane unreachable ("nothing was changed / outcome unknown — reload");
- no installer published;
- no computer may verify;
- `update_required`;
- key `acl_only`.

**Empty states:**
- no computers yet;
- no waiting verifications.

No control ever renders with no options and no reason (SILENT_EMPTY_STATE).

## C.9 NODE MANAGEMENT ACTION MODEL

Every admin action is one `factory_admin.admin_call` op in one transaction with one audit row. It returns a
LifecycleResult-shaped receipt `{operation, id, previousStatus, newStatus, changed, authorized, postconditionPassed, reason}`,
where `postconditionPassed` comes from a fresh re-read in the same function.

| Action | Inverse | Notes |
|---|---|---|
| add_computer | archive_computer → restore_computer | restore returns "not paired — re-pair required"; the credential is never revived |
| set_envelope (`expected_version`) | set_envelope back (versions kept) | revokes outstanding codes; applies to future claims and to certification (`may_verify` re-read) |
| rename_computer | rename_computer | |
| issue_pairing_code (ttl 5–60 min, purpose enroll\|re_pair) | revoke_pairing_code | a newer code supersedes the older one |
| revoke_credential | re_pair | leases expired at once |
| rotate (node-initiated) | — | old → superseded |
| drain | undrain | current run finishes |
| send_test_job | — | a `bootstrap_probe` that requires the server-derived `node:<id>` + `runtime-api:1` and `requires_verification` — the UI-driven end-to-end probe |
| list_computers | — | CollectionEnvelope with a real `count(*)` |
| get_computer | — | |
| list_waiting_verifications | — | |
| latest_release | — | |
| publish_release | — | CR-003 interim: founder \| holding_admin |

**Receipts:** `executed`, `already_*` (truthful no-op), `denied`, `not_found`, `stale_state`, `conflict`, `expired`,
`rate_limited`.

## C.10 RESOURCE-AWARE SCHEDULING

**`factory._eligible(node, wo) → (ok, failed_gate, reason)`** is the single source for claim, deferral, waiting reasons and
tests. The gates run in the binding order:

| # | Gate | Evaluation |
|---|---|---|
| 1 | valid credential | ctx resolved; computer active, not archived; credential active |
| 2 | tenant match | `wo.tenant_id = node.tenant_id` |
| 3 | company scope | envelope `company_ids` null, or `wo.company_id = any(company_ids)` |
| 4 | authorization | `wo.work_type = any(allowed_work_types)`; verification work needs `may_verify`; `granted_capabilities ⊇` any authority-class requirement |
| 5 | required role | rank(`wo.requires_security_role`) ≤ rank(`envelope.max_security_role`), with generic < verifier < release_broker |
| 6 | required capabilities | `wo.requires_capabilities ⊆` reported `fitness_caps` ∪ server-derived `{node:<id>, computer:<id>, runtime-api:N}` |
| 7 | independence | verification work only: the canonical invariant + policy (C.3 #6) |
| 8 | surface / conflict locks | no live lock on `owned_surface` (+ dependencies done, a work-order readiness precondition) |
| 9 | drain | `computers.drain_requested_at is null` |
| 10 | health | heartbeat fresh (≤ `stale_after_s`); `runtime_version ≥ min_runtime_version`; not RECOVERING |
| 11 | max-concurrency capacity | node in-progress runs < `max_concurrent_runs`; heavy: node heavy < `envelope.max_heavy` and plane heavy < `tenant.settings.heavy_per_plane` (server-side, replacing the claimer's env var) |
| 12 | hard minimum resources | the node's reported `free_mem_mb`, `cpu_cores`, `free_disk_mb` ≥ `wo.min_resources`; the local admission snapshot refusing = no claim and no liveness stamp (N42) |

**Ranking**, only after all 12 gates pass, as a strict total order. `factory._node_rank(node, wo)` is the tuple, compared
descending except load and ties:
1. resource fitness (headroom over `wo.min_resources`, weighted by `weight`);
2. preferred work class match;
3. CPU headroom;
4. RAM headroom;
5. disk headroom;
6. current load (ascending);
7. recent reliability (Laplace (done+1)/(finished+2) over the last 20 finished runs);
8. locality (`reported_resources.locality_keys ∋ wo.locality_key`);
9. `node_id` (tie-break).

Work-order order for a node: `priority_rank` ascending, then queue age (`queued_at`).

**Bounded soft deferral** (the pull model's form of ranking). Node N skips candidate W in this cycle only while all of these
hold:
- another node M passes all 12 gates for W;
- M is fresh and AVAILABLE;
- `_node_rank(M,W) > _node_rank(N,W)`;
- `now() − W.queued_at < tenant.settings.deferral_max_s` (default 60).

After the bound, N claims W. Deferral never grants, never starves, and nodes that are ineligible, stale or in another tenant
never cause it.

## C.11 FAILURE MODES

Each operation × each template mode → user-visible result / receipt:

| Operation | missing entity | stale state | duplicate request | unauthorized | foreign org | already in target | partial backend failure | conflicting update | archived/inactive |
|---|---|---|---|---|---|---|---|---|---|
| add_computer | — | — | `request_id` replay | `denied` | `denied` | — | impossible: one tx; lost reply → "outcome unknown — reload" | — | tenant suspended → `denied` |
| set_envelope | `not_found` | `stale_state` (`expected_version`) | replay | `denied` | `denied` | `already_current` | as above | `conflict` (row lock + version) | `computer_archived` |
| issue_pairing_code | `not_found` | — | replay (**never replays the raw code**: a replay says "code already issued — revoke and issue again") | `denied` | `denied` | a live code exists → superseded | as above | `conflict` | `computer_archived` |
| revoke_pairing_code | `not_found` | — | replay | `denied` | `denied` | `already_revoked` / `already_consumed` / `already_expired` | as above | — | — |
| enroll_start | `pairing_invalid` (constant wording; no oracle for which part failed) | `pairing_expired` | locked to the first session → `pairing_in_progress` | `rate_limited` | tenant from the code only | `pairing_consumed` | as above | `conflict` | `computer_archived` |
| enroll_complete | `not_found` | `session_expired` | idempotent (same key) | bad signature → `denied` | — | `already_completed` | as above | a different key → `pairing_consumed` | `computer_archived` |
| session | `credential_unknown` | `assertion_expired` / skew | `assertion_replayed` (401) | `credential_revoked` / `computer_archived` | — | — | as above | — | `tenant_suspended` |
| claim | — | — | replay (same run) | 401 | nothing claimable (gate 2) | — | as above | `claim_lock_busy` (safe degradation) | `computer_archived` |
| heartbeat / checkpoint / complete | `not_found` | `lease_lost` | replay | 401 | `denied` | `already_completed` | as above | `lease_lost` | 401 |
| record_verification | `not_found` | `stale_authority` / `candidate_mismatch` | replay | `denied` | `denied` | `already_verified` | as above | `lease_lost` | 401 |
| drain / undrain / revoke / archive / restore | `not_found` | `stale_state` | replay | `denied` | `denied` | `already_*` | as above | `conflict` | archived → `computer_archived` (except restore) |

Extra modes:
- no eligible verifier → WAITING with a reason;
- install / registration stall → derived state with a reason;
- plane unreachable → node retries transient errors (the baseline's rules), the admin UI shows "outcome unknown";
- Brain OS Auth unreachable → admin `admin_identity_unverifiable`, nothing changed;
- Ed25519 unavailable at the edge → 503 `crypto_unavailable` (cold-start self-test, fail closed).

## C.12 ACCEPTANCE PLAN

- **DEVELOPER VERIFICATION** (this phase; the implementer's suites; disposable planes and stubs only). The evidence goes to
  `qa/factory/evidence/auto-enrollment/<slice>/`. Suites:

  | Suite | Proves |
  |---|---|
  | `takeover_acceptance` | the binding A.4 §6 sequence, real processes, API transport, plus the legacy door |
  | `verification_gate_acceptance` | the binding A.3 §1 cases + CR-002 interim |
  | `eligibility_order_acceptance` | A.4 §7 |
  | `priority_order_regression` | A.4 §11 |
  | `enrollment_acceptance` | A.3 §2 / A.4 §9 |
  | `node_api_acceptance` | A.1 §3 identity rules |
  | `admin_api_acceptance` | admin authority by persona |
  | `node_api_truth_acceptance` | the node_truth N-rows on the API transport |
  | `transport_compatibility_contract` | A.4 §10 |
  | `legacy_compat_acceptance` | the frozen runtime on a migrated plane |
  | `sea_package_regression` | A.1 §1 "requires none of" |
  | `release_manifest_acceptance` | release manifest verification and upgrade |
  | `edge_placement_contract` | the functions stay outside the production deploy path |
  | `state_vocabulary_contract` | state names match everywhere |
  | `factory_api_request_gate_inventory_contract` | every whole-request gate classified |
  | `factory_computers_web_contract` + web tsc / eslint / next build | the web surface |
  | the whole pre-existing certified suite set | every row except the live-plane ones |
  | `enrollment_mutation_proof` | one mutant per new invariant |

- **INDEPENDENT ACCEPTANCE** — criteria owned by the Director (placement: DESKTOP-MDPE6FS). They are not defined here. The
  binding items the implementer knows the Director requires:
  - A.4 §6 takeover non-regression;
  - A.3 §1 independence cases;
  - A.4 §11 priority;
  - A.4 §10 matrix coverage;
  - A.3 §2 / A.4 §9 pairing requirements;
  - A.1 §1 zero-prerequisite enrollment.
- **REAL ZERO-TOUCH ACCEPTANCE** (the third PC, only at READY FOR REAL ZERO-TOUCH ACCEPTANCE). Clean PC, download
  BrainFactorySetup.exe, enter the code, ALIVE, a test job authored there and certified by an independent verifier. The script
  ships in the handoff and is not run.

## C.13 CHANGE IMPACT

- **New shared primitives** (added to FEATURE_COMPLETENESS_CONTRACT §5 and `CAPABILITY_IMPACT_REGISTRY.yaml` in the slice where
  their home files first exist):

  | Primitive | Home |
  |---|---|
  | `factory_node_identity` | `factory._ctx_from_session`, edge `_shared/node-auth.ts` |
  | `factory_authorization_envelope` | — |
  | `factory_eligibility_order` | `factory._eligible`, `_node_rank` |
  | `factory_verification_gate` | — |
  | `factory_pairing_code` | — |
  | `brain_os_admin_identity` | edge `_shared/brain-os-admin.ts` |
  | `factory_transport` | `scripts/factory-runner/transport/` |

- **Surfaces that may drift:**
  - web `software-factory/**`, nav, i18n;
  - the node runtime (`node.mjs`, `claim.mjs`, supervisor, installer);
  - the director;
  - the acceptance harnesses (`two_machine_*`, the composer: evidence moves from self-reported hostnames to server-issued
    identities).
- **Regression families:** every `qa/factory/*` suite listed in `qa/work-orders/FACTORY_V1_CHECKPOINT.md §4`, plus the new ones
  in C.12, plus `qa/scenarios-runner/architecture_*`.
- **Template mapping:**

  | Template section | Covered in |
  |---|---|
  | 1 canonical state | C.5 |
  | 2 state machine | C.2 |
  | 3 invariants | A.1 §3, C.3 |
  | 4 authorization | C.4, C.9, C.10 |
  | 5 tenant scope | C.4 |
  | 6 relationships | C.9 (archive / revoke / re-pair effects) |
  | 7 UX surfaces | C.8 |
  | 8 inverse actions | C.9 |
  | 9 failure modes | C.11 |
  | 10 acceptance criteria | C.12 |
  | 11 change impact | C.13 |

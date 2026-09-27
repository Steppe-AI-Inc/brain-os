# Founder text — Factory Node Management + Zero-Touch Auto Enrollment (V1)

The founder's text as it reached the Director: the top of the precedence ladder ("FOUNDER-APPROVED CURRENT PRODUCT POLICY"). The
canonical contract (`factory-node-management-auto-enrollment.md`) builds on this file and never contradicts it. The single writer is
the DIRECTOR capability.

The Director paraphrases nothing here:
- Part II is transcribed from the founder's messages. II.12 also quotes, verbatim, the Director message whose reconstruction the
  founder confirmed.
- Part I is a byte-for-byte copy of the implementer's transcription. **Founder confirmation of Part I is requested.**

## Provenance

| Part | Source | Integrity |
|---|---|---|
| I | Part A of `docs/architecture/features/factory-auto-enrollment.md`, lines 24-337, on branch `factory/auto-enrollment-v1-contract` at commits `264987bb` and `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` (identical in both) | source file sha256 `53e61c0bea97c50ca294a471cf015fd1b8983799c32c12ad6bdb825537f53a06`; copied byte for byte |
| II | the founder's messages to the Director, 2026-09-26 (UTC) | transcribed as received |

**About Part I's provenance.** Part I was transcribed by the implementer.

- **Corroborated.** The founder's own messages to the Director cover these sections of Part I, and agree with them:
  - A.1 §1 (placement and preferences; hostname creates no authority; no `runner.env`): II.1, II.4, II.10;
  - A.3 §1 and A.4 §8 (independence): II.1, II.3, II.8;
  - A.4 §1–§3 (Work Order authority, governance, placement): II.3, II.5, II.6, II.8;
  - A.4 §5–§6 (preserve the engine; takeover): II.7;
  - A.5 (the ratification rule): II.3.
- **Resting on the transcription alone,** until the founder confirms:
  - A.1 §2 (state names), A.1 §3 (pairing and authority invariants), A.1 §4;
  - A.2 (API host, tenant, installer, scope);
  - A.3 §2 (pepper), §3 (worktrees), §4 (takeover matrix), §5 (priority);
  - A.4 §4, §7, §9–§12.
- The Director received no founder text that contradicts Part I.

**Where Part I and Part II differ.** Part II is later and prevails: for example on C-1, C-2 and C-5. The canonical contract states the
reconciled rule.

---

# PART I — The founder's contract, governance and ratification rule (verbatim)

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

# PART II — Founder rulings sent to the Director, 2026-09-26 (verbatim)

## II.1 Machine roles and authority

- machine identity does not create authority
- Home / Work / Laptop are physical node labels
- Director is a logical Factory capability, not a hostname

For this milestone, Work is preferred for implementation and Home is preferred for independent verification, while the scheduler
architecture remains computer-agnostic.

Home must NOT implement Auto-Enrollment product code. Work PC remains the preferred implementation node for this milestone. Home
independently verifies Work-authored candidate SHAs. Third laptop remains untouched until clean final acceptance.

INDEPENDENT ACCEPTANCE — Do not weaken independence. Generalize it.

## II.2 Contract precedence

FOUNDER-APPROVED CURRENT PRODUCT POLICY
→ CURRENT CANONICAL CONTRACT
→ CANONICAL ARCHITECTURE / GOVERNANCE
→ PRODUCT INVARIANTS
→ CERTIFIED BASELINE SEMANTICS
→ IMPLEMENTATION
→ LEGACY TEST / MACHINE-SPECIFIC ASSUMPTIONS

Do not silently preserve an obsolete machine-specific rule when it conflicts with the generalized Factory architecture.

Surface genuine founder-level policy conflicts explicitly.

## II.3 Implementation / verification flow

DIRECTOR DEFINES WHAT MUST BE TRUE
→ BINDING WORK ORDERS
→ ELIGIBLE IMPLEMENTER EXECUTES
→ CANDIDATE ARTIFACT / SHA
→ DISTINCT AUTHORIZED VERIFIER
→ INDEPENDENT ACCEPTANCE
→ ACCEPT / REJECT

The implementer must never certify its own work.

## II.4 Principles and superseded ideas

- per-node independently revocable credentials
- implementation delivered through the Factory where safely possible
- no manual role switching during normal operation

Two earlier ideas are explicitly superseded and are NOT binding:

1. browser-side encryption/distribution of runner.env
   The permanent architecture must NOT require runner.env.
   It uses node-specific credentials through the authenticated Factory Node API.

2. every future node staying on 69df2f52
   69df2f52 is the immutable certified two-machine BASELINE.
   New development must use new candidate/release SHAs.
   Enrolled nodes run an explicitly certified signed Factory runtime release whose source SHA/version is recorded.

It is NOT a requirement that all future nodes permanently run that SHA.

## II.5 C-4 — constitution wording

[…] into: IMPLEMENTER / INDEPENDENT VERIFIER responsibilities.

Machine identity does not create authority.

Do not modify master now.
Prepare the ADR/change on the Director branch only.

(The beginning of this ruling did not reach the Director; the fragment is recorded as received.)

## II.6 C-5 — QA single-writer model

Do not tie canonical QA ownership to a physical PC. Use logical authority:

Director owns canonical coordination ledgers / acceptance state.

Independent verifier contributes immutable verification evidence/receipts through the defined workflow.

Implementer may publish candidate/fix reports but may not alter independent verification evidence or self-close its candidate.

If the exact write protocol needs implementation design, define it from this invariant rather than asking which physical machine owns
the file.

## II.7 Acceptance non-regression

Keep AC-11 exactly in spirit:

69df2f52 baseline remains intact.

Also require that the new Node API preserves the certified semantics for:

- claims
- leases
- lease renewal
- checkpoint / resume
- takeover
- stale-worker fencing
- exactly-one completion
- conflict locks
- independent verification

The API is a new authenticated boundary over the same control-plane semantics, not a second orchestration engine.

## II.8 Work Order authority (pre-commit correction)

The governance test: "Can the implementer become the authority that defines the work/acceptance contract it is evaluated against?"
Expected answer: NO.

[…] unless a specific WO still has a genuinely undefined founder-level product policy.

C-3 production signing-key custody may remain a founder gate inside the relevant WO, but that does not prevent WO-6 itself from being
defined.

(The beginning of this ruling did not reach the Director; the fragment is recorded as received.)

## II.9 C-1 — Factory V1 accounting — RESOLVED

C-1 is NOT a founder gate.

Binding rule:

The certified two-machine evidence at:

69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6

remains closed, immutable historical certification evidence.

Auto-Enrollment / Node Management creates a new candidate/release SHA.

Factory V1 evidence is cumulative:

CLOSED TWO-MACHINE BASELINE EVIDENCE
+
NEW ZERO-TOUCH / THREE-MACHINE RELEASE EVIDENCE
+
REMAINING FACTORY V1 GATES

Each evidence set retains exact release/SHA provenance.

Do NOT:
- reopen the two-machine evidence
- recreate it at the new SHA
- rewrite historical evidence
- leave V1 accounting as unresolved founder policy

WO-10 must encode this as a BINDING ACCEPTANCE REQUIREMENT, not a founder gate.

## II.10 C-2 — Node / verifier capability — RESOLVED

C-2 is NOT a founder gate.

There is no permanent question:

"Which physical node holds the verifier role?"

That question belongs to the obsolete static-machine-role model.

Permanent model:

NODE IDENTITY
≠ AUTHORIZED CAPABILITY ENVELOPE
≠ RESOURCE PROFILE
≠ CURRENT ASSIGNMENT ROLE

A node may be authorized for multiple capabilities.

The scheduler chooses current assignment subject to authorization, capability, independence, health, conflicts and resources.

For THIS milestone:

DESKTOP-8P5HVAO
→ preferred implementation node
DESKTOP-MDPE6FS
→ preferred independent verifier of Work-authored candidates

Third laptop
→ clean acceptance machine

These are milestone placement preferences, not permanent authority.

The third laptop receives its authorized capability envelope during Add Computer enrollment.

Do NOT put an unresolved founder gate saying which computer permanently "holds verifier capability."

Also verify that C-2 is not incorrectly attached to WO-5 merely because WO-5 is the installer. Authorization/capability enrollment
belongs in the canonical node/enrollment model and WO-2/WO-3 as appropriate.

## II.11 C-3 — the only founder gate

The genuine unresolved founder/security decision is:

C-3 — PRODUCTION RELEASE-SIGNING KEY CUSTODY

Implementation may complete:
- signing abstraction
- test/dev signing
- key-id model
- verification
- rotation/revocation mechanics
- release manifest semantics

But must not choose/create/use the real production signing authority.

The exact governance test remains:

Can the implementer define or alter the contract it is judged against?

Expected: NO.

And:

Can hostname/resource fitness create authority?

Expected: NO.

## II.12 Change-request path discipline — founder ruling, 2026-09-26 16:26-16:53 UTC (2026-09-27 UTC+8)

Every founder message is transcribed as received, in arrival order, with its UTC time. Some lines of the first delivery never
arrived; the Director asked, and the founder resent the paths as sentences. The founder's "the governance ADR" (16:46:04Z) and "ADR-0001"
(16:48:54Z) name `docs/architecture/adr/ADR-2026-09-26-node-roles-are-labels.md`, as the Director identified it in its message of
16:50:13Z.

**16:26:53Z**

```text
CHANGE-REQUEST PATH DISCIPLINE
```

**16:35:40Z**

```text
Do not make qa/implementation/auto-enrollment-v1/change-requests/ canonical merely because the Implementer used it first.

Compare it against the current canonical CLAUDE.md / Director contract.

If the existing canonical path is still correct, require CR-005 to be mirrored or reissued there.

If a new per-milestone implementer change-request namespace is architecturally better, change it explicitly in Director r2 with a stated rationale and migration/compatibility rule.

Implementation behavior must not silently redefine canonical governance
```

**16:35:52Z**

```text
Compare it against the current canonical CLAUDE.md / Director contract.
  If the existing canonical path is still correct, require CR-005 to be mirrored or reissued there.

  If a new per-milestone implementer change-request namespace is architecturally better, change it explicitly in Director r2
  with a stated rationale and migration/compatibility rule.

  Implementation behavior must not silently redefine canonical governance.
CHANGE-REQUEST PATH DISCIPLINE — FOUNDER RULING
```

**16:35:52Z**

```text
For Auto-Enrollment V1, use explicit ownership separation.
```

**16:35:52Z**

```text
CANONICAL DIRECTOR-OWNED WORK-ORDER SPACE:
```

**16:35:53Z**

```text
→ DIRECTOR DECISION→ CANONICAL LEDGER / CONTRACT REVISION IF APPROVEDThe Implementer may submit a CR.
```

**16:35:53Z**

```text
The Implementer may NOT:
```

**16:35:53Z**

```text
- approve its own CR
```

**16:35:53Z**

```text
- modify binding WO text through the CR itself
```

**16:46:04Z**

```text
  Implementation behavior does not silently redefine governance.

  This is now the binding path rule for Auto-Enrollment V1.  Record it explicitly in Director r2 and the governance ADR.
```

**16:48:38Z**

```text
FOUNDER RULING
```

**16:48:38Z**

```text
CANONICAL DIRECTOR-OWNED WORK-ORDER SPACE:
```

**16:48:54Z**

```text
→ VERIFIER CHECKSImplementation behavior does not silently redefine governance.

Record this binding rule in Director r2 and ADR-0001.
KEEP WORKING.
```

**16:52:55Z**

```text
CORRECTION TO "confirm the draft":
```

**16:52:55Z**

```text
Director space is qa/work-orders/.
```

**16:53:45Z**

```text
Implementer submission space is qa/implementation/auto-enrollment-v1/change-requests/.

CR-005 is valid where it is.

Historical CR-001..CR-004 stay at their existing paths and are not moved.

IMPORTANT:
qa/work-orders/change-requests/ does NOT remain the permanent repo-wide default.

Director r2 must generalize CLAUDE.md §8 from the old universal CR path into ownership-based namespaces:

Director canonical state:
qa/work-orders/

Implementer proposals:
qa/implementation/<milestone>/change-requests/

Independent verifier evidence:
qa/verification/<milestone>/ or the canonical verifier namespace defined by the QA model.

Ownership is by logical responsibility, not by machine hostname.

With that correction, the rest of your reconstruction is confirmed.

KEEP WORKING.
```

**The Director reconstruction the founder confirmed "with that correction"** (Director message of 16:50:13Z, the relevant part,
verbatim, markdown markers included). The correction replaced the first sub-bullet of its Compatibility bullet:
`qa/work-orders/change-requests/` does not remain the repo-wide default.

```text
**Please resend the paths inside a sentence.** For example: "Director space is qa/work-orders/, implementer submission space is qa/implementation/auto-enrollment-v1/change-requests/". Or just reply "confirm the draft" if my reconstruction below is right.

**What the draft records, from what you sent:**
- Explicit ownership separation.
- The flow: the implementer submits a change request → Director decision → canonical ledger or contract revision if approved → the verifier checks it.
- The implementer may submit a change request. It may not approve its own, or change binding work-order text through one.
- "Implementation behavior does not silently redefine governance." Nothing becomes canonical because the implementer used it first; only an explicit Director revision with a stated reason makes it so.
- The verifier check: a candidate may not change binding work-order text, the ledger or any canonical document. It must not build on a change request that has no Director decision.

**My reconstruction of the two path lines, marked unconfirmed:**
- **Director-owned work-order space:** `qa/work-orders/`. It holds the binding work orders, the ledger, and my receipt and decision for every change request.
- **Implementer submission space:** `qa/implementation/auto-enrollment-v1/change-requests/` on the implementation branch. Submissions only, never canonical.
- **Compatibility:**
  - CLAUDE.md §8's `qa/work-orders/change-requests/` stays the default for the rest of the repository.
  - This milestone's ledger names the submission space.
  - CR-001..CR-004 keep their recorded path.
  - CR-005 is accepted where it was filed.
```

## II.13 Implementer key confirmation — founder ruling, 2026-09-26 16:54 UTC (2026-09-27 UTC+8)

Transcribed as received, in arrival order, with UTC times.

**16:54:27Z**

```text
IMPLEMENTER KEY CONFIRMATION — ALREADY COMPLETE
```

**16:54:37Z**

```text
Subsequent Director checks have already verified the Work-PC implementation
commits against this published signing identity, and CR-005 records the key.

Therefore:- REMOVE "implementer key fingerprint confirmation" from pending founder actions.
- Record the IMPLEMENTER / candidate-provenance signing identity as CONFIRMED.
- Do not ask the founder to re-run fingerprint confirmation again.
- Do not regenerate or replace the key.- Do not modify its ACLs.
- Do not expose or transfer the private key.

This confirmation applies only to the IMPLEMENTER / candidate-provenance key.

It does NOT resolve:

C-3 — PRODUCTION RELEASE-SIGNING KEY CUSTODY.

C-3 remains the genuine founder/security gate.

KEEP WORKING.
```

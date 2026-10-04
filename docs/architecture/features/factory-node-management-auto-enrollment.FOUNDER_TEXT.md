# Founder text — Factory Node Management + Zero-Touch Auto Enrollment (V1)

The founder's text as it reached the Director: the top of the precedence ladder ("FOUNDER-APPROVED CURRENT PRODUCT POLICY"). The
canonical contract (`factory-node-management-auto-enrollment.md`) builds on this file and never contradicts it. The single writer is
the DIRECTOR capability.

The Director paraphrases nothing here:
- Part II is transcribed from the founder's messages. II.12 also quotes, verbatim, the Director message whose reconstruction the
  founder confirmed, II.14, II.15 and II.17 the Director questions whose options the founder chose, and II.19 the Director question
  the founder answered.
- Part I is a byte-for-byte copy of the implementer's transcription. **Founder confirmation of Part I is requested.**

## Provenance

| Part | Source | Integrity |
|---|---|---|
| I | Part A of `docs/architecture/features/factory-auto-enrollment.md`, lines 24-337, on branch `factory/auto-enrollment-v1-contract` at commits `264987bb` and `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` (identical in both) | source file sha256 `53e61c0bea97c50ca294a471cf015fd1b8983799c32c12ad6bdb825537f53a06`; copied byte for byte |
| II | the founder's messages to the Director, 2026-09-26 to 2026-10-03 (UTC); II.12, II.14, II.15, II.17 and II.19 also quote Director text verbatim | transcribed as received |

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

# PART II — Founder rulings sent to the Director, 2026-09-26 to 2026-10-04 (verbatim)

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

## II.14 QA receipt publication — founder rulings, 2026-09-27 (UTC)

Transcribed as received, in arrival order, with UTC times. The Director's questions and the chosen options are quoted verbatim;
each "(founder's choice)" block is the chosen option's label and description joined by ": " (the founder's answer was the
label). The founder's "KEEP WORKING." messages (09:22:56Z, 09:28:19Z, 12:44:16Z, 16:32:04Z) carry no ruling and are omitted.

**09:22:36Z**

```text
Commit the receipt and relay the packet to the Work PC
```

**09:24:01Z** (Director question)

```text
The repo Steppe-AI-Inc/brain-os is PUBLIC. How should the QA receipt for 412ac14e be committed and relayed? (Options that push authorize ALLOW_FUNCTIONS_DEPLOY=1 for that single Director-branch push only, under the same conditions as r2: no master, no Edge, no merge.)
```

**09:27:44Z** (founder's choice)

```text
Commit locally only: Sign and commit the receipt and ledger entry on the local Director branch; nothing is pushed. The Work PC gets nothing through git until you decide; I give you the packet file for a private handoff now.
```

**09:28:17Z**

```text
FOUNDER RULING — SECURITY-SENSITIVE QA RECEIPT
```

```text
Choose option 3: COMMIT LOCALLY ONLY.
```

```text
The repository is public.
```

**13:56:09Z** (Director question)

```text
The repository is public, and you ruled that the 412ac14e receipt stays local. How should future QA receipts and the public ledger handle candidates?
```

**16:31:46Z** (founder's choice)

```text
Local receipts, public verdict (Recommended): Every receipt, REJECTED or CERTIFIED, is committed signed on a local-only ref, and the full findings go to the Work PC privately. The public ledger records one line per candidate: SHA, verdict and the receipt's sha256, never findings. The designated Director commit is always a published commit.
```

**16:32:02Z**

```text
FOUNDER RULING — QA RECEIPT PUBLICATION POLICY
```

```text
Choose option 1.
```

```text
Permanent rule:
```

```text
FULL QA RECEIPTS:
```

Nothing after "FULL QA RECEIPTS:" arrived in that sequence except "KEEP WORKING." (16:32:04Z), and no later founder message
completes the permanent rule (II.15's do not). Director note: the chosen option above governs
until the founder completes the permanent rule; its completion is listed under the ledger's founder items.

## II.15 Director r3 release — founder authorization, 2026-09-28 (UTC)

Transcribed as received, in arrival order, with UTC times. The Director's question and the chosen option are quoted verbatim;
the "(founder's choice)" block is the chosen option's label and description joined by ": " (the founder's answer was the
label). The founder's "KEEP WORKING." message at 02:55:07Z carries no ruling and is omitted.

**2026-09-27 19:37:56Z** (Director question)

```text
Director r3 is ready. Its last two confirmation rounds found no HIGH, the final round found no MEDIUM, and every lens answers both governance tests NO; the remaining lows are listed as r4 work in the r3 event. The change is 13 Director-document files on top of r2 5709a6a4, with no supabase/functions/** changes. How should r3 be released?
```

**2026-09-28 01:23:38Z** (founder's choice)

```text
Release + push now (Recommended): Sign and commit r3 on factory/auto-enrollment-v1-director (parent 5709a6a4). Push only that branch, by explicit refspec (never the local receipt ref), with ALLOW_FUNCTIONS_DEPLOY=1 for this single push only. Then check the remote refs read-only (director = r3 SHA, factory = 69df2f52, master = 55a15917) and publish the r3 SHA to the Work PC.
```

**01:24:15Z**

```text
FOUNDER AUTHORIZATION — RELEASE DIRECTOR R3
```

```text
Release Director r3 now.
```

**01:24:16Z**

```text
Requirements:
```

```text
1. Commit exactly the current reviewed r3 bytes.
```

```text
origin/master   = 55a159172a9bbc9b69cde4d2f832418573a4b0b910. Confirm no production workflow/deployment was triggered.
```

**01:24:20Z**

```text
11. Publish the exact r3 SHA to the Work PC.

From that point forward, the next implementation candidate must consume r3,
not r2.

The remaining LOW findings become r4 work and must not delay r3 release.

KEEP WORKING.
```

Nothing arrived between "1. Commit exactly the current reviewed r3 bytes." and the line beginning "origin/master". Director note: r3 was released under the chosen
option and the items above, with the conditions of the r2 push (the commit changes no `supabase/functions/**`; the pre-push
override for that one push only; the Director branch alone, by explicit refspec); the ledger event log records the result.

## II.16 Public implementer records — founder ruling, 2026-09-28 (UTC)

Transcribed as received, in arrival order, with UTC times. Director note: the ruling answers the Director's report of
2026-09-28 that the implementer's public `qa/implementation/auto-enrollment-v1/R3_RECONCILIATION.md` (commit `c1f52a14`)
lists its own r3 gaps file by file.

**04:29:42Z**

```text
FOUNDER RULING — IMPLEMENTER RECONCILIATION DISCLOSURE
```

**04:29:57Z**

```text
The existing public reconciliation note may remain as-is unless it contains
credentials, exploit instructions, or materially increases exposure beyond
what is already obvious from the public code.

Do NOT rewrite public git history merely to remove it.

Going forward:

PUBLIC IMPLEMENTER RECORDS MAY CONTAIN:
- Director revision consumed
- candidate/base SHA
- finding IDs
- disposition state
- affected requirement IDs
- test/result summary
- statement that reconciliation is complete/incomplete

KEEP PRIVATE:
- exploit mechanisms
- race interleavings
- privilege-bypass details
- secret-handling weaknesses
- detailed file-by-file instructions that materially aid exploitation
- verifier-only evidence

Public Git remains code/version truth, not the default disclosure channel for
live unfixed security defects.

Record this prospectively in r4/r5 governance as appropriate.

KEEP WORKING.
```

The founder sent the same two messages again, byte-identical, at 04:33:38Z and 04:33:47Z; they are transcribed once.

Director note: the existing note contains no credentials or exploit instructions and does not materially increase exposure
beyond what is already obvious from the public code, so it remains as-is; no public history is rewritten. The ruling is recorded prospectively in
ledger rule 3 ("Public implementer records").

## II.17 Director r4 release and the scope of II.16 — founder rulings, 2026-09-28 (UTC)

Transcribed as received, in arrival order, with UTC times. The Director's questions and the chosen options are quoted verbatim;
each block under "(founder's choices)" is a chosen option's label and description joined by ": " (the founder's answer was the
label). The founder's later messages up to 2026-09-29T02:51Z, when Director r5 was drafted, carry no ruling on these questions
and are omitted: "KEEP WORKING." at
11:42:41Z and 11:46:51Z, and on 2026-09-29 "RESUME DIRECTOR / VERIFIER — FRESH STATE FIRST" (02:47:39Z) and "KEEP WORKING."
(02:47:41Z).

**05:24:17Z** (Director questions)

```text
Director r4 is ready. It carries the r3 lows, the release record of r3, and your II.15 and II.16 rulings. Its last review round found no HIGH and no MEDIUM, and every lens answers both governance tests NO. It is 5 Director-document files on top of r3 c7a845b6, with no supabase/functions changes. Remaining lows go to r5. The Work PC's next candidate still consumes r3: r4 says a notice naming r3 is judged against r3. How should r4 be released?
```

```text
Your II.16 ruling applies its test only to the one existing reconciliation note: it may remain unless it contains credentials, exploit instructions, or materially increases exposure beyond the public code. r4 applies the same test to any other implementer record published before 2026-09-28, as a Director reading surfaced for your confirmation. Do you confirm that reading?
```

**11:42:12Z** (founder's choices)

```text
Release + push now (Recommended): Sign and commit exactly the reviewed r4 bytes on factory/auto-enrollment-v1-director (parent c7a845b6). Push only that branch by explicit refspec, with ALLOW_FUNCTIONS_DEPLOY=1 for that single push. Verify the refs read-only (director = r4, factory = 69df2f52, master = 55a15917), then re-read Actions and deployments a few minutes later and report any Preview.
```

```text
Confirm the reading (Recommended): Every public implementer record published before 2026-09-28 is judged by the same test. One that fails it becomes a founder item, and no history is rewritten. r5 records your confirmation.
```

**11:42:29Z**

```text
FOUNDER AUTHORIZATION — RELEASE DIRECTOR R4
```

```text
Release r4 now exactly as reviewed.
```

```text
Parent:
```

```text
c7a845b61a3b0b419e8c9dfeff397547fdc75b03
```

Director note: r4 was released under the first chosen option and these messages, with the conditions of the r2 and r3 pushes
(the commit changes no `supabase/functions/**`; the pre-push override for that one push only; the Director branch alone, by
explicit refspec); the ledger event log records the result. The second chosen option confirms that II.16's test applies to every
public implementer record published before 2026-09-28 (ledger rule 3, "Public implementer records"); the records published on
2026-09-28 before the ruling (04:29:42Z) are covered by a Director reading surfaced for the founder's confirmation. The
founder's messages from 2026-09-29T02:54Z concern the release of r5 and are transcribed with it.

## II.18 C-3 decided: a Factory-managed release signer — founder rulings, 2026-10-02 (UTC)

Transcribed as received by the Director, in arrival order, with UTC times. The 16:31:48Z message arrived as typed text followed by
pasted text; each is one block below.

**16:31:48Z**

```text
HOME PC — CURRENT ASSIGNMENT

CURRENT GOAL:
Founder Beta through clean-laptop acceptance.

CURRENT PHASE:
Work is implementing the minimal Super Admin update-authorization delta.

CURRENT CANDIDATE:
95fdb85acf755f8d28fa2393165cac7fb9ca77b7
Candidate #3 is frozen and independently passed.
DO NOT REVERIFY OR MODIFY IT.

YOUR ROLE NOW:
Independent verifier / Director readiness.

DO NOT:
- develop the feature
- modify Work's branch
- rerun Candidate #3
- run mutation/reference campaigns
- start new governance revisions
- redesign authentication
- work on C-3 manual keys
- expand Artifact Relay
- touch production

PREPARE ONLY the bounded independent verification plan for the successor.
```

```text
Founder-approved product behavior:

Existing Brain OS super_admin
→ Factory
→ Update
→ re-enter EXISTING Brain OS account password
→ Confirm
→ Brain OS / Factory performs the prepared update automatically.

Prepare independent checks for:

1. valid current super_admin + correct password succeeds
2. wrong password is refused
3. non-super-admin is refused
4. logged-out / stale session is refused
5. authorization is bound to the exact prepared update/candidate
6. changed update bytes require new authorization
7. authorization cannot be replayed
8. password is not persisted/logged/exposed to workers
9. one successful confirmation starts the expected automated update path
10. failure produces deterministic status/rollback rather than ambiguous partial state

Do not expand beyond those behaviors unless a HIGH security/authority issue is
demonstrated.

When Work reports its ACTUAL DELTA:
review only whether the proposed independent checks cover the changed surfaces.

Do not certify intermediate commits.

When Work freezes ONE successor SHA:
begin independent verification of that exact SHA.

If a reproducible certification-blocking defect is found:
STOP expensive verification
→ reject successor
→ preserve evidence.

Otherwise:
return INDEPENDENT QA PASS and move immediately toward clean-laptop acceptance.

KEEP VERIFIER READY.
```

**20:20:22Z**

```text
DIRECTOR — PROCESS CR-027 AS CANONICALIZATION
```

**20:20:25Z**

```text
The founder has already decided the product policy.

Do not reopen the founder-vs-system-managed signer decision.

Update the binding WO-6 and only the canonical statements materially affected by
that decision so they consistently express:

- Factory-managed release signer
- private signing material remains inside the trusted server-side Factory boundary
- founder never manages signing keys
- founder update authority comes from existing founder identity +
  existing Factory founder-only authority
- founder re-authenticates using the existing Brain OS account password
- successful founder confirmation authorizes the exact prepared update
- Factory performs signing/publication/update automatically

Check CR-027's listed affected canonical statements and reconcile only those that
must change to remove contradiction.

Do not redesign the feature.
Do not create a new role.
Do not reopen Candidate #3.
Do not add unrelated governance.

Return the exact Director canonical commit/revision applicable to the successor.
```

Director note: these messages state the founder's decision of C-3 (II.11) to the Director. The founder gave the decision itself to
the implementer session, at 2026-10-02T16:59:56Z ("FOUNDER DECISION — SYSTEM-MANAGED RELEASE SIGNER") and in a later message on
CR-027, which CR-027 dates 2026-10-03 (the implementing machine's local date; CR-027 quoted it by 2026-10-02T20:26:44Z). CR-027
quotes those messages as the implementer received them, and the founder holds the originals; they are not transcribed here because
the Director did not receive them. CR-027 is
`qa/implementation/auto-enrollment-v1/change-requests/CR-027-system-managed-release-signer.md` on
`factory/auto-enrollment-v1-implementation` at `4016c33060693d5d8c2eb0840ce686c33af5001b`, sha256
`82eb9c9f493b4c286feec9e34581b04db02931b5f3a98866d0719bc43ae5b93d`, implementer-signed. The 20:20:25Z message directs this
canonicalization; for this purpose it supersedes the 16:31:48Z line "start new governance revisions" (under "DO NOT").
"super_admin" names no role: Brain OS has none, and the founder directs "Do not create a new role."; the founder's update authority
is the existing founder identity under the existing Factory founder-only authority (S-8). The 16:31:48Z message's ten checks are the
acceptance of the update authorization (AC-5(o)); its other lines also bound the successor's verification, and how that bound meets
`VERIFICATION_SPEC.md` §3.11 and ledger rule 6 is surfaced for the founder's confirmation (ledger founder items). Director r6 records
the decision in WO-6 revision 3 and in the canonical statements it affects (ledger event log, CR-027).

## II.19 The r6 release, the founder's corrections and the CR-028 direction — founder messages, 2026-10-03 (UTC)

Transcribed as received by the Director, in arrival order, with UTC times. At 01:50:35Z the founder answered the Director's release
question for r6 in free text; the question and the answer are both quoted verbatim.

**01:50:35Z** (the Director's question)

```text
Director r6 (CR-027 canonicalized) is committed locally as 7f8edf2c on parent 3615366e, signed Good with the Director key, and passes the pre-release gate. A local-only Director commit can never be designated, so Work can use r6 only after it's published. Release it now?
```

(the founder's answer)

```text
DIRECTOR ACTION — PROCESS CR-027 NOW
```

**01:51:15Z**

```text
CURRENT GOAL:
Founder Beta through the minimal automatic-update successor.

IMPLEMENTATION PROPOSAL:
4016c33060693d5d8c2eb0840ce686c33af5001b

CR-027:
sha256
82eb9c9f493b4c286feec9e34581b04db02931b5f3a98866d0719bc43ae5b93d

Candidate #3 remains:

95fdb85acf755f8d28fa2393165cac7fb9ca77b7

and MUST remain untouched.

==================================================
FOUNDER-APPROVED PRODUCT POLICY
==================================================

The policy decision is already made.

The founder does NOT manage a release-signing key.

The intended product behavior is:

existing Brain OS founder/highest-authority account
→ Factory → Update
→ re-enter EXISTING account password
→ Confirm
→ Factory automatically handles signing, publication and update.

Factory owns the internal release-signing mechanism.

Do NOT reconsider this product decision.

==================================================
DIRECTOR TASK
==================================================

Process CR-027 strictly as CANONICALIZATION.

Update WO-6 and only the canonical records that materially contradict the
founder-approved model.

Canonical text must consistently express:

1. Release signing is Factory/system-managed.

2. Private signing material remains inside the trusted Factory server-side
   boundary and is not handled by the founder, Work, Home, browser or nodes.

3. Founder control is expressed through:
   - current authenticated founder identity;
   - re-entry of the EXISTING Brain OS account password;
   - existing Factory founder-only authority.

4. A mutable profile.role by itself is not sufficient authority.

5. Successful founder confirmation authorizes the exact prepared release.

6. Factory then performs signing/publication/update automatically.

7. Candidate #3 remains historical/certified and unchanged.

Do NOT:
- redesign the feature;
- create a new role;
- create a founder PIN;
- restore manual C-3 key management;
- reopen Candidate #3;
- expand CR-027;
- add unrelated governance;
- start independent successor verification yet.

==================================================
CHECK THE PROPOSAL
==================================================

Confirm that CR-027's 16 affected canonical references are reconciled only where
necessary.

If one listed location does not actually require a semantic change, leave it
alone and record why.

Do not mechanically rewrite documents merely because CR-027 lists them.

==================================================
OUTPUT
==================================================

Produce one signed Director canonicalization commit/revision.

Report:

DIRECTOR — CR-027 CANONICALIZED

with:
- exact Director commit SHA
- exact WO-6 revision
- canonical files changed
- confirmation that no product code changed
- confirmation Candidate #3 remains unchanged
- exact canonical policy now applicable to the successor

Then STOP.

Work may resume successor development only after this Director result exists.
```

**03:02:05Z**

```text
KEEP VERIFIER READY.
```

**10:30:29Z**

```text
HOME — STATE CORRECTION
```

**10:30:47Z**

```text
Three of the four r6 questions are already resolved by later founder decisions.

DO NOT WAIT on:
- successor verification scope
- meaning of "update automatically"
- per-release staging

Those are settled.

ACTIVE TASKS NOW:

1. PROCESS CR-028
   Canonicalize only the r6 text contradicted by the later founder decisions:
   - automatic staging
   - automatic post-confirm node upgrade
   - no founder staging/manual node upgrade

   Do not redesign anything.

2. START STAGE A BOOTSTRAP VERIFICATION

   Work has already named the signer bootstrap:
   release_signer.sql

   and reported its pinned sha256 beginning:
   333536de...

   Verify the exact file from the published implementation proposal / Work handoff.
   Do not accept a different byte sequence.

   Judge:
   - provenance
   - allowed object creation only
   - transactionality
   - private-key reachability

   - public-key-only exposure
   - randomness
   - signature correctness against an independent Ed25519 implementation

   Return:
   BOOTSTRAP FILE — VERIFIED
   or a concrete blocking defect.

3. PASSWORD-CHANGE PROBE

   If a disposable Brain OS test account already exists:
   run qa/factory/v1/password_change_probe.mjs.

   If none exists:
   report BLOCKED — TEST ACCOUNT REQUIRED.

Do not run successor QA yet.
Do not rerun Candidate #3.
Do not start mutation/reference campaigns.
Do not create new governance beyond CR-028 canonicalization.

NEXT GATE:
CR-028 canonicalized + bootstrap verified.
```

Director note: the Director released r6 on the 01:50:35Z answer. The two corrections themselves ("RESUME SUCCESSOR DEVELOPMENT — TWO
PRODUCT CORRECTIONS", 2026-10-03) were given to the implementer session. CR-028 quotes them as the implementer received them, and the
founder holds the originals; they are not transcribed here because the Director did not receive them. CR-028 is
`qa/implementation/auto-enrollment-v1/change-requests/CR-028-factory-staging-and-automatic-node-update.md` on
`factory/auto-enrollment-v1-implementation` at `8ac331ffda37456a4afa63c692024016ffb40806`, sha256
`f79e7041174f84cef5270be93daa414e5573a4a18a22848e6a42ea01b18baa21`, implementer-signed. The 01:51:15Z message states the policy
("Factory automatically handles signing, publication and update"). The 10:30:47Z message states that the later founder decisions
settle three of r6's four surfaced items, directs CR-028's canonicalization and the Stage A judgment, and asks for the
password-change probe only if a disposable test account exists. Director r7 records them (ledger event log, CR-028).

## II.20 The r7 release, the bootstrap gate and the bootstrap's report — founder messages, 2026-10-03 to 2026-10-04 (UTC)

Transcribed as received by the Director, in arrival order, with UTC times. A pasted text is transcribed without the client's
paste markers.

**2026-10-03T11:11:23Z**

```text
FINISH CURRENT R7 REVIEW.
```

**2026-10-03T11:12:03Z**

```text
If the reviewer finds no blocking defect:
- sign Director r7
- push it
- read back remote head
- report exact Director SHA
- report WO-6 revision 4 SHA
- confirm Candidate #3 and product code remain untouched

If it finds a real defect:
- fix only that defect
- rerun the bounded r7 gate/review
- publish

Do not start another review cycle after a clean result.
```

**2026-10-03T11:17:20Z**

```text
KEEP VERIFIER READY.
```

**2026-10-03T16:39:03Z**

```text
NEXT GATE — PREPARE EXACT FOUNDER BOOTSTRAP ACTION
```

**2026-10-03T16:39:05Z** (pasted)

```text
Director r7 and Stage A are complete.

Do not do more governance or review.

Prepare ONE exact founder action to apply the already-verified:

release_signer.sql
sha256 333536de…450f

Requirements:

- use exactly the bytes Stage A verified;
- execute by the r7/WO-6 approved path;
- no implementer session running on the execution machine;
- no management-token workaround;
- no key material exposed to founder;
- no manual key handling;
- precheck exact file hash before execution;
- apply transactionally;
- postcheck proves signer exists and only PUBLIC material is observable;
- output the generated public key / key_id for Director recording;
- private key must remain inside Factory server-side boundary.

Return:

FOUNDER BOOTSTRAP — READY

with ONE command/procedure only.

Do not execute it yourself unless the canonical contract already authorizes Director
execution without founder approval.
```

**2026-10-04T04:15:27Z**

```text
key_id:     ed25519:d3ed1390c6e6c367006a4fc5bdecd31d6cfe34823d5eeda7b9341656d962c81e
  public_key: 4iR7Ra54qciQ5xT-xnXEF1E90x415CEIokAMMvZdkrU  applied:    2026-10-04T04:10:11Z UTC on DESKTOP-MDPE6FS, by psql -1 (this script)
```

**2026-10-04T04:16:07Z**

```text
BOOTSTRAP HAS BEEN APPLIED.
```

**2026-10-04T04:16:13Z**

```text
Record and independently verify:

key_id:
ed25519:d3ed1390c6e6c367006a4fc5bdecd31d6cfe34823d5eeda7b9341656d962c81e

public_key:
4iR7Ra54qciQ5xT-xnXEF1E90x415CEIokAMMvZdkrU

applied:
2026-10-04T04:10:11Z UTC

NEXT:

1. Perform the already-planned read-only live verification:
   - signer exists exactly once;
   - public_key() returns the same public key;
   - non-owner cannot sign or access private material;
   - live catalog change matches Stage A-approved bootstrap.

2. Record this exact key_id/public_key in the next Director / WO-6 revision.

3. Publish and read back that Director revision.

4. Return:
   DIRECTOR — SIGNER KEY RECORDED
   - Director SHA
   - WO-6 revision/hash
   - exact recorded key_id
   - exact recorded public_key

Do not start another review cycle.
Do not redesign the signer.
Do not touch Candidate #3.
```

Director note: at 17:03:16Z the founder sent "Ran 2 shell commands" with a paste of the Director's own earlier answer (its
"FOUNDER BOOTSTRAP — READY" text and the founder's prompt line "KEEP VERIFIER READY."); it is Director output, so it is not
transcribed. At 17:04:16Z and 17:04:20Z the founder sent the 16:39:03Z and 16:39:05Z messages again; the second differs only in that
its last line, "execution without founder approval.", follows a blank line outside the pasted part. The Director answered with
FOUNDER BOOTSTRAP — READY and did not execute the procedure: the contract makes the bootstrap the founder's action (§0). The
04:15:27Z message is the three lines the Director's founder procedure printed; its last line is the founder's statement of the path
used (contract §0), recorded in the event log as the founder's attestation. Director r8 records the key (WO-6 revision 5).

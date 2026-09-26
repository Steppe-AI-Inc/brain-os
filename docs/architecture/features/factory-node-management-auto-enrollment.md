# Feature contract — Factory Node Management + Zero-Touch Auto Enrollment (V1)

Contract reference: `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md`. Governance: `docs/architecture/adr/ADR-2026-09-26-node-roles-are-labels.md`.

| | |
|---|---|
| Status | **CANONICAL** (Director-owned), binding for implementation and verification. The implementer implements on `factory/auto-enrollment-v1-implementation`, based on the exact Director commit that carries this file. |
| Owner (single writer) | the DIRECTOR capability, branch `factory/auto-enrollment-v1-director` |
| Implemented by | the IMPLEMENTER capability (milestone placement: DESKTOP-8P5HVAO) |
| Verified by | a distinct authorized INDEPENDENT VERIFIER (milestone placement: DESKTOP-MDPE6FS) |
| Accepted on | a clean ACCEPTANCE machine (the third laptop, untouched until clean final acceptance) |
| Certified baseline | `69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6`: closed, immutable historical certification evidence. Referent: `qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_MANIFEST.json` |

**The documents.** Each rule is stated once, in its home. Every one is hash-frozen in the ledger's document set.

| file | holds |
|---|---|
| `factory-node-management-auto-enrollment.FOUNDER_TEXT.md` | **the founder's words**: Part I (the contract A.1-A.5) and Part II (the rulings to the Director). The top of the precedence ladder |
| this file | the reconciled canonical contract (template §1-§11), Director policies, and the product invariants P-1..P-10 |
| `factory-node-management-auto-enrollment.SECURITY_TENANCY.md` | the security / tenancy / authority invariants S-1..S-16 |
| `qa/verification/auto-enrollment-v1/ACCEPTANCE_MATRIX.md` | the acceptance criteria AC-1..AC-16 |
| `qa/verification/auto-enrollment-v1/VERIFICATION_SPEC.md` | how a candidate is certified; the receipt protocol |
| `qa/work-orders/AUTO_ENROLLMENT_V1_LEDGER.md` / `.json` + `qa/work-orders/auto-enrollment-v1/WO-<n>.md` | the binding work orders WO-1..WO-10, the document-set hashes, the ratification register |

## 0. Authority, precedence and what is resolved

- **Precedence** (founder text II.2): founder-approved current product policy → this contract → canonical architecture / governance →
  product invariants → certified baseline semantics → implementation → legacy test / machine-specific assumptions.
  - Canonical architecture and governance are Director-ratified.
  - The implementer's architecture and design choices sit at the "implementation" rung.
- **Authority** (I A.4 §1, I A.5, II.3, II.8):
  - The DIRECTOR owns what must be true: this contract, the invariants, the binding Work Orders, the acceptance criteria, the
    verification specification, and the independence / campaign policies (§1).
  - The IMPLEMENTER owns decomposition, subtasks, sequencing and implementation.
  - **The implementer can never define or alter the contract it is judged against.** A change to what must be true is a CHANGE REQUEST,
    binding only after the Director ratifies it.
- **Implementation through the Factory where safely possible** (II.4). Work reaches implementers through Factory work orders once the
  product can carry them. Until then, milestone candidates are authored outside the scheduler, with signed-commit provenance
  (`VERIFICATION_SPEC.md` §1, §3.1).
- **Resolved, binding (not gates):**
  - C-1 V1 accounting (II.9) → P-8.
  - C-2 the node / capability model (II.10) → §1 and P-6.
    - II.10 refers to an earlier draft numbering, in which WO-5 was the installer. In the issued numbering the installer is **WO-4**,
      and it carries no authorization content.
    - Envelope enrollment lives in the node model and enrollment work orders: **WO-1**, **WO-2** (identity and authority derived from
      the credential) and **WO-3** (envelope granted at Add Computer).
    - **WO-5** only applies the envelope in scheduling.
  - C-4 constitution wording (II.5) → the ADR and constitution.
  - C-5 QA authority (II.6) → S-14.
- **Change requests, decided by the Director on 2026-09-26** (proposals from the implementer's superseded branch; pinned in the ledger):

  | CR | subject | decision |
  |---|---|---|
  | CR-001 | Factory admin allow-list | **RATIFIED**. S-8's two conditions |
  | CR-002 | verification failure state | **RATIFIED**. `VERIFICATION_FAILED` (§2) |
  | CR-003 | founder-only release tier | **RATIFIED**. Granting `release_broker` and publishing a release are founder-only |
  | CR-004 | installer distribution | **Option A**. The installer is downloadable without login. It contains no secret; its sha256 and signing state are shown on the Computers page. The pairing code is the control |

- **The only founder gate: C-3, production release-signing key custody** (II.11), inside WO-6.
  - Implementation completes everything else with dev keys on disposable planes.
  - **Final acceptance (AC-1..AC-4) needs C-3 decided**, because a live-plane node trusts only a founder-provisioned key (S-5).
- **Founder boundaries** (actions, not policy gates; I A.4 §12):
  - the live Factory migration;
  - the live Edge deploy;
  - production secrets (the pepper, API roles);
  - the production Brain OS deploy by PR into `master`;
  - installer Authenticode signing;
  - re-enrolling the existing nodes;
  - retiring the legacy path;
  - a pre-candidate Edge record for AC-10 (function names, versions, sha256 and updated_at; secret names, never values), read by the
    founder or with a read-only token the founder provides. A one-time action, not a gate under II.11: verification proceeds without
    it, and only CERTIFIED ledger entries wait for it (AC-10);
  - provisioning the SELECT-only observer role for the Director's live reads (required before final acceptance);
  - confirming the implementer signing-key fingerprint out of band. This is a one-time action, not a policy decision and not a gate
    under II.11: verification runs and receipts proceed before it, only the CERTIFIED ledger entry waits for it, and a REJECTED
    verdict does not.
- **Side finding S1, surfaced to the founder** (a production matter, outside this feature's authority). The Brain OS production policy
  `profiles_update_self_or_admin` has no `WITH CHECK`, so at source level an employee can set its own `profiles.role`. S-8(b) keeps
  Factory administration safe regardless. The production fix is a founder action.
- **Reconciliation where the founder text differs internally.** Part II prevails.

  | topic | rule |
  |---|---|
  | QA single-writer files | Director (II.6), not the independent-acceptance role |
  | Part I's machine-named ownership ("the WORK PC owns…", "Work-PC authority") | read as the IMPLEMENTER capability (II.1, II.10) |
  | Verification placement | a preference, except the milestone restrictions S-16, which the founder stated as hard lines (II.1, I A.3 §1) |
  | Eligibility order | I A.4 §7's exact order governs (the later, specific founder ruling); I A.1 §3's "authorization → tenancy → …" and II.10's list are summaries, not orders. Included in the Part I confirmation request |
  | I A.4 §4 "service / watchdog" vs I A.2 "per-user install, no admin" | a per-user task at logon plus a watchdog, and no Windows service: after a reboot the node runs from the installing user's next logon. Included in the Part I confirmation request |
  | Branch names (I A.3 §3) | the feature branch `factory/auto-enrollment-v1-contract` was superseded at `27d78ff6` by the Director's branch decision (ADR amendment 10; founder confirmation requested). I A.3 §3's isolation rules apply unchanged to the implementation branch and its worktree. Implementation advances on `factory/auto-enrollment-v1-implementation`, built on the designated Director commit. The live legacy checkout rule is unchanged |

## 1. Canonical state (facts; the implementer designs the tables inside `supabase/control-plane/`, never `supabase/migrations/`)

- **Tenant:** `factory.tenants` (one row today), and `tenant_id` on every factory row.
- **Factory admins:** `factory.tenant_admins` (tenant, Brain OS auth user id, **tier** `founder | admin`), written only by the founder's
  provisioning step (CR-001, CR-003; S-8).
- **Identity** (S-13): the **agent principal** bound to the authenticating credential.
  - Each node credential is bound to exactly one Factory-issued agent principal.
  - **Add Computer creates exactly one principal for the computer**, and the enrollment credential is bound to it.
  - A credential issued by rotate (node- or admin-initiated), re-pair or restore is bound to the principal of the credential it
    replaces.
  - A further principal exists only through the explicit, audited Factory-admin action "create an agent principal", never as a side
    effect of another action or of any node call. A node can never mint one.
  - The enrollment states (§2) apply per credential. A further principal's credential walks them from PAIRING_CODE_ISSUED while the
    computer stays ALIVE, and revoking one principal's credential moves only that credential to CREDENTIAL_REVOKED. The computer's
    displayed state is derived from its credentials.
  - A principal created by "create an agent principal" receives its first credential only through a pairing code a Factory admin
    issues for it. Enrollment binds a credential to the principal its pairing code was issued for (at Add Computer, the computer's
    first principal), and re-pair targets the principal of the revoked credential.
  - A run records the principal of the credential it authenticated with. A request-body field never counts.
- **Authoring set** (S-13): every run that held a lease on the work order or wrote a checkpoint the completing run consumed, each with
  its identity and computer.
- **The four facts, kept separate** (II.10):

  | fact | definition |
  |---|---|
  | **Node identity** | Factory-issued, durable. Hostname and fingerprint are descriptive metadata |
  | **Authorized capability envelope** | what the node MAY do: roles and capabilities it may be assigned, optionally narrowed to company_ids. A node may be authorized for several. Set at Add Computer and amended only by a Factory admin (founder-only for `release_broker`), audited. A node credential can never change it |
  | **Resource profile** | detected capabilities and telemetry. It ranks eligible nodes and may *exclude* (minimum resources, detection absent), and **never** authorizes |
  | **Current assignment role** | temporary. The scheduler chooses it for each piece of work, within the envelope |

- **Machine fingerprint:** sha256 of the Windows MachineGuid, readable by a standard user and the same for every enrollment and run
  on one PC. It is recorded on the computer record at registration and on every run. It never grants anything; it only refuses
  (S-16b).

- **Node credential:** a per-node key pair. The server stores only the public key. States `active | superseded | revoked`.
  - A session token may be exchanged, but **credential status is re-checked inside every call's transaction** (S-3).
  - **Re-pair** (a Factory admin action, audited): revokes a principal's active credential and issues a new pairing code for the same
    principal on the same computer.
    The new credential is a new key. A revoked credential never becomes active again. The computer keeps its durable identity and
    history, and authority always comes from the current credential plus the current envelope.
- **Pairing code:** stored only as `HMAC-SHA256(pepper, normalized_code)`. The pepper lives only in the Edge secret store. TTL ≤ 15 min,
  plus S-6's limits.
- **Runtime release:**
  - the artifact is built reproducibly from a CERTIFIED candidate SHA by the verifier;
  - the manifest records source SHA / version, artifact digest (the PE Authenticode image hash, S-5; equal to the receipt's reproduced
    digest), signing key id, signature,
    and the certifying receipt hash;
  - nodes verify it against a **pinned trust set**, fixed in the artifact at build time together with the trust mode; nothing received
    at runtime adds a key or changes the mode (S-5);
  - the release a node runs is stamped on the node, on every run and on every checkpoint.
- **Verification record:** work order, authoring run and identity, certifying run and identity, verifier authority at certification,
  exact candidate provenance, and the policy applied.
  - New-model certification records live in **their own table**.
  - The legacy verification columns of `agent_runs` keep their `69df2f52` meaning and never count as a new-model certification.
  - A certification counts only for its work order, and only while its provenance is the work order's current candidate (S-13).
- **Independence and campaign policies (Director-issued data; S-14).**
  - The Director writes the content. A candidate migration seeds exactly these rows.
  - Through the Admin API a Factory admin may only make a policy **stricter**, audited.
  - The campaign rows cannot be changed through the Admin API during this milestone, except S-14's one write: binding S-16(a) to a
    computer record at its Add Computer (add-only).
  - The certification front door enforces the S-13 floor whatever the policy data says.

  The rows:
  - **Tenant default:**
    - certifying run ≠ authoring run;
    - certifying identity ≠ authoring identity;
    - the certifier holds verifier authority in its current envelope;
    - physical separation not required.
  - **Campaign "Auto-Enrollment V1":**
    - the tenant default;
    - plus the certifying node differs physically from the node of every member of the authoring set, for every milestone candidate
      (a different enrolled computer record whose reported fingerprint also differs; equal fingerprints refuse, and a hostname or a
      different fingerprint alone never satisfies it);
    - plus no authoring run of Auto-Enrollment product code on the computer the S-16 restriction is bound to. A Factory admin binds it
      to the Home computer's record at that computer's Add Computer enrollment (S-14's one permitted write); unbinding and rebinding
      are refused during this milestone. The product-layer scope and its evidence are stated in S-16.
- **Legacy nodes.**
  - The two existing nodes run `69df2f52` as `legacy_manual` nodes on the baseline's shared credential. They hold no envelope, cannot
    certify release candidates, and count toward AC-3 only after re-enrollment through Add Computer (a founder boundary).
  - No legacy path may act as, or on behalf of, an enrolled node identity, or bypass its envelope.
  - **The legacy shared credential `factory_runner` keeps DML only on the `69df2f52` tables and columns the frozen code uses.** It holds
    no INSERT, UPDATE or DELETE on any authority record:
    - tenants, `tenant_admins`, computers, credentials, pairing;
    - envelopes, policies;
    - release records and release revocations (the trust set lives only in the artifact, S-5);
    - agent principals;
    - the new-model certification records.
  - The migration revokes the baseline's default-privilege grant for every new table. EXECUTE is revoked from PUBLIC on every front
    door, and `factory_runner` holds none. A server guard refuses any legacy write to an authority record, and a legacy run is never
    recorded as a certification (S-10).
  - A server guard refuses any legacy INSERT, UPDATE or DELETE on a row of a new-model work order, on a run or checkpoint of an
    enrolled computer, on an enrolled run's surface lock, or on a dependency row that names a new-model work order, including
    moving a verification-required work order to done. For the legacy role it leaves such rows unchanged without failing the frozen
    claim transaction: the `69df2f52` reaper's requeue and expired-lock delete skip them, and the front doors own their expiry.
  - A lapsed enrolled surface lock never makes the frozen legacy claim fail or stall the legacy queue, and never lets a legacy run
    hold that surface while the enrolled run can still complete.
  - **No plane-conditioned behaviour.** No SQL object the candidate creates, and no step the founder applies, decides what it does from
    a value that distinguishes the live plane from a disposable one: `factory.plane_identity`, `current_database()`,
    `inet_server_addr()` / `inet_server_port()`, a setting, or a row that exists only on live. The production-ref refusal is the one
    exception. The verifier lists every such reference in the candidate diff, and each is a REJECTED finding. (S-10)
  - `factory_runner` is granted no role and is granted to no role beyond its `69df2f52` memberships, and no API role is a member of it.
  - The claim front door refuses a work order without `factory-enrolled-v1`, so a legacy and an enrolled node never hold the same work
    order. Both fleets hold surface locks in the one `factory.surface_locks` table.
  - **Every new-model work order requires the reserved capability `factory-enrolled-v1`**, which the frozen legacy claim path cannot
    hold. A server guard refuses any legacy write of a reserved capability. So legacy nodes never claim new-model work.
  - This bounds the legacy door and is never a source of authority.
- **The Director's live observer login:** a founder-provisioned SELECT-only role. It holds SELECT on every `factory` relation,
  including those the migration adds (a recorded founder change), and on `storage.buckets`. Every Director read of the live plane uses
  it, never an enrolled computer's credential. Until it exists, candidate-stage live reads use the documented `runner.env` interim,
  read-only. The interim never serves final acceptance, which requires the observer role (`VERIFICATION_SPEC.md` §6).
- **Derived, never stored as a flag:**
  - runtime liveness: STALE after 180 s without a heartbeat, OFFLINE after 30 min;
  - the displayed computer state;
  - fleet counts (aggregate queries).
  - `ALIVE` is the stored terminal milestone of enrollment. Liveness is derived separately.

## 2. State machines (state names exactly as the founder wrote them, I A.1 §2)

**Enrollment**

| From | To | Trigger | Who | Preserves |
|---|---|---|---|---|
| UNENROLLED | PAIRING_CODE_ISSUED | issue a code (TTL ≤ 15 min) | Factory admin (S-8) | the envelope and the target principal (at Add Computer, the computer's first principal) exist before the code |
| PAIRING_CODE_ISSUED | PAIRING_STARTED | installer presents the code | holder of the code | nothing issued yet |
| PAIRING_STARTED | PAIRING_VERIFIED | HMAC match + proof of possession of the node key | server | one-time consume, atomic |
| PAIRING_VERIFIED | NODE_ID_ISSUED → NODE_CREDENTIAL_ISSUED | same transaction | server | exactly one credential per enrollment; it is bound to the presented key and to the principal the pairing code was issued for |
| NODE_CREDENTIAL_ISSUED | RUNTIME_INSTALLING | installer installs a verified release | installer | release verified before execution (S-5) |
| RUNTIME_INSTALLING | REGISTERING | first authenticated call | node | identity from the credential |
| REGISTERING | ALIVE | registration accepted on a certified release | server | the envelope applies |
| PAIRING_CODE_ISSUED / PAIRING_STARTED | PAIRING_EXPIRED | TTL elapses | server | nothing issued |
| PAIRING_CODE_ISSUED / PAIRING_STARTED | PAIRING_REVOKED | admin revokes the code, or amends the envelope | Factory admin | nothing issued |
| PAIRING_CODE_ISSUED / PAIRING_STARTED | PAIRING_REVOKED | the 5th failed attempt on the code's locator (S-6) | server | nothing issued |
| PAIRING_EXPIRED / PAIRING_REVOKED | PAIRING_CODE_ISSUED | issue a new code for the same computer | Factory admin | the envelope is fixed before the code exists |
| any code already consumed | PAIRING_CONSUMED (the attempt's outcome) | reuse | server | the first consume stands |
| RUNTIME_INSTALLING | INSTALL_FAILED | install error | installer | the credential stays valid; a retry reuses it (no new code) |
| REGISTERING | REGISTRATION_FAILED | registration refused | server | the reason is named; a retry reuses the credential |
| NODE_CREDENTIAL_ISSUED … ALIVE | CREDENTIAL_REVOKED | revoke | Factory admin | refused on every path (S-3); evidence kept |
| CREDENTIAL_REVOKED | PAIRING_CODE_ISSUED | re-pair | Factory admin | a new key; the old credential stays revoked |

**Runtime**

| From | To | Trigger | Who |
|---|---|---|---|
| AVAILABLE | CLAIMING → BUSY → CHECKPOINTING → COMPLETING → AVAILABLE | work cycle | node, through the front doors |
| any | DRAINING | admin drain | Factory admin |
| DRAINING | AVAILABLE | resume | Factory admin |
| any | RECOVERING | node restart | node |
| RECOVERING | AVAILABLE | reconciliation complete: every lease the node held has been renewed if still its own, or given up; no resumed work continues without a fresh claim | node, through the front doors |
| RECOVERING | DRAINING | a drain was requested while the node was down | server |

STALE and OFFLINE are derived (§1).

**Computer lifecycle**

| From | To | Trigger | Who | Effect |
|---|---|---|---|---|
| active (any enrollment or runtime state) | ARCHIVED | archive | Factory admin | every active credential of the computer is revoked, and no work is claimed or assigned; history stays readable |
| ARCHIVED | PAIRING_CODE_ISSUED | restore → re-pair | Factory admin | a new key; the old credential stays revoked |

**Release**

| From | To | Trigger | Who |
|---|---|---|---|
| (after C-3) trust-set revision | candidate | the Director issues a WO-6 revision recording the founder's public keys and key ids; the implementer's next candidate adds exactly those bytes to the trust-set source; it receives a full verification pass | Director (revision), implementer (candidate) |
| candidate | certified | a Director-committed receipt with verdict CERTIFIED, including the reproduced digest. The plane records it only through the founder's publish action, which cites that receipt; the Director never writes the plane | the verifier certifies; the Director records it in the ledger |
| certified | published | the founder signs a manifest whose digest equals the reproduced digest (C-3) | founder (tier `founder`) |
| published | superseded | a newer certified release is published | founder |
| published | revoked | revoke | founder |
| node on release X | node on the previous certified release | adopt / roll back | Factory admin (a node never downgrades silently) |

**Verification** (CR-002 ratified)

| From | To | Trigger | Who |
|---|---|---|---|
| IMPLEMENTED | WAITING_FOR_INDEPENDENT_VERIFICATION | an authoring run completes a work order that requires verification | server |
| WAITING_FOR_INDEPENDENT_VERIFICATION | VERIFICATION_CLAIMED | an eligible verifier claims: distinct from every member of the authoring set, and authorized | verifier node |
| VERIFICATION_CLAIMED | WAITING_FOR_INDEPENDENT_VERIFICATION | the verification claim's lease lapses, the verifier releases it, or the verifier's credential is revoked | server |
| VERIFICATION_CLAIMED | VERIFIED | the certifying run records PASS with provenance | verifier node, checked by the server against policy |
| VERIFICATION_CLAIMED | VERIFICATION_FAILED | the certifying run records FAIL | verifier node |
| VERIFIED | COMPLETE | all required verifications VERIFIED | server (never a node's own claim) |
| VERIFICATION_FAILED | IMPLEMENTED | a **new** candidate (a new authoring run) through repair | implementer |

- There is no automatic re-verification of the same candidate.
- A new candidate whose content is identical to a FAILED one (the same tree) is refused as a resubmission, whoever submits it.
- With no eligible verifier, the work stays WAITING and is never self-certified.
- `VERIFICATION_FAILED` is never `COMPLETE`, and its dependents stay blocked.

**Current assignment role:** chosen automatically by the scheduler for each piece of work, within the envelope. No human and no node
sets it.

**Envelope:**
- set at Add Computer;
- amended by a Factory admin (founder-only for `release_broker`), audited;
- the node never originates a change.

**Work-order track** (ledger): `BINDING → IN PROGRESS → CANDIDATE → CERTIFIED | REJECTED`.
- The DIRECTOR issues WOs and revisions.
- The IMPLEMENTER reports IN PROGRESS and CANDIDATE.
- CERTIFIED and REJECTED cite a receipt from a distinct verifier.
- A REJECTED candidate returns the WO to IN PROGRESS.

## 3. Product invariants

The security / tenancy / authority invariants S-1..S-16 (`.SECURITY_TENANCY.md`) are part of this contract. The product invariants are:

- **P-1 Baseline.** `69df2f52` and its evidence (the manifest) are closed, immutable historical certification evidence.
  - They are never modified, deleted, reopened or recreated.
  - A live migration must leave every manifest evidence field byte-identical (adding columns such as `tenant_id` is allowed).
  - Node records are never deleted.
- **P-2 One engine, preserved semantics** (I A.4 §5, §6; II.7).
  - NODE → node-scoped credential → Factory Node API → the SAME canonical control-plane state machine, implemented in the SQL front
    doors. No second orchestration engine exists in Edge Functions.
  - The front doors keep queue, lease, checkpoint, surface-lock and completion state in the `69df2f52` tables (`work_orders`,
    `agent_runs`, `checkpoints`, `surface_locks`, `work_order_dependencies`, `director_lease`). Columns may be added, but no other
    table holds lease, lock or completion state.
  - Preserved:
    - the shared unassigned queue;
    - atomic claims;
    - leases, lease renewal;
    - checkpoint / resume;
    - takeover;
    - stale-worker fencing: renew, **checkpoint** and complete rejected inside the front door;
    - **exactly one successful completion with no duplicate completed side effects**;
    - surface / conflict locks;
    - restart / recovery;
    - provenance;
    - verifier independence.
  - The §6 sequence is a permanent acceptance: **Auto Enrollment V1 FAILS if it regresses.**
- **P-3 Compatibility matrix first** (I A.4 §10). No operation is marked migrated until the old invariant has executable regression
  coverage on the new primitive.
- **P-4 Zero-touch** (I A.1 §1).
  - Add Computer → configure authorization envelope → short-lived pairing code → download `BrainFactorySetup.exe` → enter the code on
    the clean PC → automatic enrollment → ALIVE → schedulable.
  - The enrolled computer requires none of: Git, npm, a source checkout, a PowerShell bootstrap, `runner.env`, CA copying, a PostgreSQL
    URL, Supabase credentials, or manual machine-role assignment.
- **P-5 Truthful fleet view.** Brain OS → Factory → Computers shows server truth only.
- **P-6 Eligibility before ranking** (I A.4 §7).
  - Hard gates, in order: valid credential → tenant → company scope → authorization → required role → required capabilities
    (**envelope-authorized; detection may only restrict**) → implementer / verifier independence (the policy) → surface / conflict
    locks → drain → health → max concurrency → hard minimum resources.
  - A refusal names the **first** failing gate in this order.
  - Then ranking among eligible nodes: resource fitness, work class, headroom, load, reliability, locality, priority, queue age.
  - **Resource fitness and hostname never create authority.**
  - No ranking factor, including a placement preference, excludes an eligible node. All ranking together may delay eligible work by
    **at most 30 s**. Only a founder restriction (S-16) excludes.
- **P-7 Numeric priority** (I A.4 §11), with a regression proving 2 < 10 < 100.
- **P-8 Factory V1 accounting is cumulative** (II.9; binding, not a gate). V1 evidence is, each part with exact release / SHA provenance:
  1. **the closed two-machine baseline evidence at `69df2f52`** (the manifest + ledger 218);
  2. **the zero-touch / three-machine release evidence** (AC-1..AC-4 at the certified release SHA);
  3. **the remaining Factory V1 gates**:
     - G-1 the DeepSeek live provider gate;
     - G-2 the BUG-036 read-only Auth inspection;
     - G-3 migration `202609110001` (founder);
     - G-4 the invitation web deploy (founder);
     - G-5 the independent E2E retest;
     - G-6 the Factory V1 final verdict.
  - The Director records it. The baseline is never reopened, recreated at the new SHA, or rewritten.
- **P-9 Visible failure.** Every refusal names its cause. There is no silent fallback to a shared credential, an unverified runtime or a
  default authorization.
- **P-10 No founder poke** (I A.1 §1 `FOUNDER_POKE_NOT_REQUIRED`; II.4). Takeover, verification claim, dependent release and return to
  repair need no founder keystroke. The current assignment role is chosen by the scheduler per work item with no human step (§2, II.10).
  Only the authorized envelope changes, and only through an audited Factory admin action. There is no manual role switch (II.4).

## 4. Authorization (re-derived server-side on every call)

| transition | who may |
|---|---|
| Add Computer: configure the envelope, issue / revoke a pairing code, re-pair | a Factory admin (S-8: role founder \| holding_admin **and** listed in `tenant_admins`) |
| grant `release_broker` in an envelope; publish a release | founder-only per S-8 (tier `founder` in `tenant_admins` and live role founder; CR-003) |
| bind S-16(a) to a computer at its Add Computer (add-only) | a Factory admin (S-14's one permitted campaign write) |
| start / verify pairing, obtain the node credential | the holder of a valid, unexpired, unconsumed code, once |
| every node operation | the node's own active credential, within its envelope. Tenant, identity and authority come from the credential, never from the body |
| amend envelope; drain / resume; rotate / revoke credential; archive / restore; create an agent principal and issue its pairing code | a Factory admin |
| certify a candidate | a distinct authorized verifier under the policy (S-13, S-16) |
| production release signing; publishing, superseding or revoking a release | founder-only per S-8 (tier `founder` and live role founder); C-3 for key custody |
| supplying the founder's public keys for the trust-set source | the founder, out of band; recorded by a Director WO-6 revision (not an API action; S-5, S-8) |
| adopt / roll back a computer's release | Factory admin |
| make a policy stricter | Factory admin (stricter only; the campaign rows are frozen for this milestone) |

Refused (S-8): hr_finance, company_manager, team_lead, sales, engineer, technician, employee, contractor, investor_viewer, anonymous,
foreign tenant, a self-promoted employee, and a founder / holding_admin not in `tenant_admins`.

## 5. Organization / tenant scope

- Every factory row carries `tenant_id`, and the node's tenant is derived from its credential.
- The envelope may narrow a node to company_ids, and company-scope match is a hard gate.
- Brain OS production gets no schema change from this feature.
- A foreign-tenant or non-admin caller gets the unauthorized result, with no existence leak.

## 6. Relationships

- **Computer records.** A tenant has computers. A computer has one agent principal (a further one only by the explicit admin action)
  and one active credential per principal, plus history; one envelope plus its audit, a
  resource profile, and a temporary assignment.
- **Enrollment records.** Pairing codes and enrollment attempts are kept for audit.
- **Revocation.** It ends a credential and never deletes the computer or its evidence. Leases lapse, and the certified takeover applies.
- **Archive.** It stops all work, and history stays readable. Restore returns the computer to service with a fresh re-pair.
- **Releases.** Node → current release plus history. Run and checkpoint → release (stamped). A revoked release stops claiming until a
  certified release is adopted. There is never a silent downgrade.

## 7. UX surfaces

- **Brain OS → Factory → Computers** (Factory admins):
  - list with derived states;
  - Add Computer: envelope + pairing code;
  - installer download (public, with sha256 and signing state; CR-004);
  - drain / resume;
  - rotate / revoke / re-pair;
  - create an agent principal (with its pairing code);
  - archive / restore;
  - envelope amend;
  - policy view;
  - release status;
  - waiting verifications;
  - work observation.
- **`BrainFactorySetup.exe`:** code entry, progress, and every refusal by name.
- **`/software-factory/workers`:** replaced or retired. The implementer states which, and the Director ratifies it.

## 8. Inverse actions

| action | inverse |
|---|---|
| issue a code | revoke it or let it expire |
| enroll | revoke the credential, then re-pair |
| rotate | the old credential is superseded |
| drain | resume |
| archive | restore |
| amend the envelope | amend it back |
| adopt a release | adopt the previous certified release |
| publish a release | revoke it |
| make a policy stricter (Factory admin) | none through the Admin API, which refuses any relaxation (AC-12(e)); only a Director revision, carried by a new candidate migration, restores the Director-stated rows |
| create an agent principal | retire it by revoking its credentials; a principal is never deleted or reused, and its history stays |

## 9. Failure modes (all required)

| Mode | User-visible result | Receipt |
|---|---|---|
| missing entity | refusal naming what is missing; no existence leak | server log, no secrets |
| stale state (expired / consumed / revoked code, revoked credential) | the named failure state; nothing changed | audit row |
| duplicate request (double consume, double install, double complete) | one winner, atomically; the other gets its named state | one credential per enrollment; one completion |
| unauthorized (incl. a self-promoted employee, or an admin not in `tenant_admins`) | refusal, no data | audited refusal |
| foreign tenant / company | same as unauthorized | same |
| already in target state | idempotent "already" | no duplicate rows |
| partial backend failure (credential issued, install / registration failed) | `INSTALL_FAILED` / `REGISTRATION_FAILED` from server truth; the installer names the step and retries with the same credential | server rows |
| conflicting update (revoke during pairing, two admins) | one wins atomically; the other gets a state error | a single final state |
| archived / inactive target (archived computer, revoked release) | refused by name; nothing resurrected | unchanged |

## 10. Acceptance criteria

`qa/verification/auto-enrollment-v1/ACCEPTANCE_MATRIX.md` (AC-1..AC-16) is part of this contract.

## 11. Change impact

- **Shared primitives:** `scripts/factory-runner/claim.mjs`, `node.mjs`, `db.mjs`, `url-judge.mjs`, the supervisor and installer.
  Every change keeps P-2, proved row by row (P-3). The certified reference suites stay green or are replaced only by ratified
  successors.
- **New:**
  - tenants / admins / computers / pairing / credential / envelope / policy schema;
  - the Node API and Admin API (Edge Functions on `npvhuoozkbexddnvkqsj`; authority in SQL front doors);
  - eligibility and ranking;
  - the verification model;
  - the SEA installer and runtime;
  - the release manifest and trust set;
  - the Computers page.
- **Reporting:** the implementer lists every table, function, route, secret name and environment variable in its candidate report.
  `docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml` gains Factory entries.

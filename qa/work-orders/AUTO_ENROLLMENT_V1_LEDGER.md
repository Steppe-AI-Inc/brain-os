# Binding work-order ledger — Factory Node Management + Zero-Touch Auto Enrollment (V1)

- **Single writer:** the DIRECTOR capability (founder text II.6, II.8; ratified ADR). Every Director commit is signed with the Director
  signing key.
- **Machine-readable twin:** `qa/work-orders/AUTO_ENROLLMENT_V1_LEDGER.json`.
- **Contract:** `docs/architecture/features/factory-node-management-auto-enrollment.md`.
- **Founder text:** `docs/architecture/features/factory-node-management-auto-enrollment.FOUNDER_TEXT.md`.
- **Baseline:** `69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6`: closed, immutable historical certification evidence. Referent:
  `qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_MANIFEST.json`.

## Rules

1. **The DIRECTOR defines and issues every binding work order** (I A.4 §1; II.3; II.8).
   - WO-1..WO-10 below are Director-issued, **BINDING, revision 1**.
   - The IMPLEMENTER owns its engineering decomposition inside them, on `factory/auto-enrollment-v1-implementation`, built on the
     Director commit this ledger designates.
   - **The implementer can never define or alter the work / acceptance contract it is judged against.**
2. **Frozen text.**
   - Each WO's text is `qa/work-orders/auto-enrollment-v1/WO-<n>.md`. The canonical documents are listed in "Document set" below.
   - Each is frozen by the sha256 of its committed content; `.gitattributes` pins them to LF.
   - A change is a new Director-issued revision, with new hashes and an event-log entry.
   - A changed file under an unchanged ledger hash is a tamper finding.
   - A WO's "Must satisfy" line is the single source of its coverage below.
3. **Change requests** (I A.5).
   - The IMPLEMENTER may propose a change to what must be true, and does not implement against it until the Director ratifies it.
   - Every non-conflicting item continues meanwhile.
   - The Director records a decision per request.
4. **Founder gates.** Exactly one founder gate exists: **C-3, production release-signing key custody, inside WO-6**. Final acceptance
   waits for it (S-5).
   - C-1 is resolved and binding: P-8 / WO-10.
   - C-2 is resolved and binding: contract §1 and P-6.
     - Founder text II.10 uses an earlier draft numbering, in which WO-5 was the installer. Here the installer is **WO-4**, and it
       carries no authorization content.
     - Envelope enrollment lives in **WO-1**, **WO-2** and **WO-3**. **WO-5** only applies the envelope in scheduling.
   - Founder *boundaries* are actions, not policy questions. They are listed per WO.
   - Three one-time founder actions are not gates under II.11:
     - confirming the implementer signing-key fingerprint (rule 8);
     - the pre-candidate Edge record for AC-10;
     - provisioning the observer role (needed before final acceptance).
     For the first two, verification and receipts proceed before them, and only a CERTIFIED entry waits for them.
5. **The coverage rule.** Before the first CERTIFIED, every AC, S and P row is covered by at least one binding WO (table below). The
   Director closes a gap by issuing a WO or a revision. **AC-13 is the exception:** it is the cumulative Factory V1 record (P-8),
   acceptance state that only the Director records, so no WO claims it.
6. **States:** `BINDING → IN PROGRESS → CANDIDATE → CERTIFIED | REJECTED`. A REJECTED candidate returns the WO to IN PROGRESS.
   - Both cite a Director-committed, signed receipt (`VERIFICATION_SPEC.md` §5). REJECTED needs only a receipt with verdict REJECTED.
     CERTIFIED needs a receipt with verdict CERTIFIED that also shows:
     - authorship verified against `implementer_signing_key`;
     - the certifier on a different machine from every author (S-16b);
     - the Director-issued verifier assignment;
     - matching hashes;
     - evidence for every row the WO covers.
   - CERTIFIED is not final acceptance. AC-1..AC-4 and AC-13 are recorded by the Director at final acceptance.
   - A resubmission after REJECTED is a new SHA with different content. Re-verifying the same SHA takes an explicit Director order.
7. **Placement and restrictions** (II.1, II.10).
   - Placement preferences are policy data and grant nothing: implementation on DESKTOP-8P5HVAO, independent verification on
     DESKTOP-MDPE6FS, acceptance on the third laptop.
   - **The milestone restrictions (S-16) are binding.** No Auto-Enrollment product code is authored on the Home machine. The Director
     authors no product code. Every milestone candidate is certified on a different physical machine from every author. On the
     plane, the first restriction is keyed to the Home computer's enrolled record, never to a hostname (S-16).
8. **Signing keys** (`VERIFICATION_SPEC.md` §1).
   - The Director key is recorded in the JSON as `director_signing_key`.
   - The implementer key is recorded as `implementer_signing_key`, once the implementer publishes it in a change request and the
     founder confirms its fingerprint out of band, as displayed on the implementing machine. The event log records the confirmation.
     Until then no candidate can be CERTIFIED.
9. **Designated Director commit.** For each candidate the Director designates the Director commit whose criteria apply. By default it
   is the latest Director commit when the candidate notice arrives.

## Work orders

| WO | Title | Text (rev; sha256) | State | Depends on | Covers | Founder gate / boundary | Branch / candidate SHA | Receipts |
|---|---|---|---|---|---|---|---|---|
| WO-1 | Tenancy, identity, envelopes, credentials, admins, policies and legacy coexistence (schema) | `WO-1.md` r1 `b21f91f27ca92fce41329170e9e24085e53fe50251e6187affb21a7c2047b2cd` | BINDING | — | AC-1, AC-4, AC-6, AC-12, S-2, S-4, S-8, S-9, S-10, S-13, S-14, P-1 | boundary: Applying the schema to the live plane, and seeding `tenant_admins`, are founder actions. The candidate prepares the exact steps and does not run them. The prepared live-migration step is byte-identical to the migration the verifier ran to completion on the disposable copy, plus a Director-specified wrapper whose manifest recompute runs after the migration's last statement and before commit, aborting on any difference. The receipt records its sha256, and the founder applies exactly that file. | — | — |
| WO-2 | Factory Node API: an authenticated boundary over the same lifecycle | `WO-2.md` r1 `94fbe486c55b6565146147d4cba5cb697a87d19a8903d31238129dda2de7a257` | BINDING | WO-1 | AC-9, S-3, S-4, S-7, S-10, P-2, P-3 | boundary: Deploying the Edge Functions live is a founder action (`ALLOW_FUNCTIONS_DEPLOY=1?`). | — | — |
| WO-3 | Add Computer: pairing and enrollment protocol (the capability envelope is granted here) | `WO-3.md` r1 `4fd171d31d4eaf6f1d51f0cb1258089bf9d090c9e62eaa13d3a5c4b20ca71713` | BINDING | WO-1, WO-2 | AC-8, S-4, S-6, S-8, S-12, P-9 | boundary: Creating the production pepper secret is a founder action. | — | — |
| WO-4 | BrainFactorySetup.exe and the persistent node runtime | `WO-4.md` r1 `07cb3d37c000f72b60b4cbd27301d69b3963b75e1e23b53cd7422932262f5284` | BINDING | WO-2, WO-3, WO-6 | AC-1, AC-5, S-2, S-5, S-12, P-4, P-9 | boundary: Installer Authenticode code signing is a founder / external action (I A.2). Until then the installer is published unsigned, with its sha256. | — | — |
| WO-5 | Scheduler eligibility and ranking; capability reporting, telemetry, priority, drain; milestone restrictions | `WO-5.md` r1 `a19db92e8caa8fd4b5a33aeeeb0df705669d656f916ed0fd8afe7b9e4898bf82` | BINDING | WO-1, WO-2 | AC-3, AC-6, AC-15, S-1, S-16, P-6, P-7 | — | — | — |
| WO-6 | Release manifest, pinned trust set, signing abstraction and runtime upgrade | `WO-6.md` r1 `5e7a43551cbb1502e8c2c88cadbe6ce0d4b5d9002d81964709539a3c9f9f2853` | BINDING | — | AC-3, AC-5, S-5, P-9 | **gate: C-3, production release-signing key custody (the only founder gate) — - The implementer **must not choose, create or use the real production signing authority.** It states only the **interface** a production key must satisfy (algorithm, key-id format, rotation), without naming a custody option, provider or key. - Final acceptance waits for C-3. - Installer Authenticode signing is a separate founder / external boundary, under WO-4.** | — | — |
| WO-7 | Node lifecycle management: drain, resume, rotate, revoke, re-pair, archive, restore | `WO-7.md` r1 `1bd8c914b3089b10e6cfc8583754e403a66ee3ba0240bb808b82e8193c610a83` | BINDING | WO-1, WO-2 | AC-4, S-3, P-1 | — | — | — |
| WO-8 | Brain OS → Factory → Computers, and the Factory Admin API | `WO-8.md` r1 `57be771a18cbe9a629bcf5915354f26a68da45994304799338668fff22d96a01` | BINDING | WO-1, WO-2, WO-3, WO-7 | AC-2, AC-7, AC-12, S-7, S-8, S-9, S-11, S-14, P-5, P-9 | boundary: The production Brain OS deploy (a PR into `master`), production secrets, and seeding `tenant_admins` are founder actions. `master` stays untouched in this phase. | — | — |
| WO-9 | Independent verification model, policies and the verification state machine | `WO-9.md` r1 `6b700e60f55898f3b4c95a681cedb33d159317f584fa486c0fcd3412e8dee6dd` | BINDING | WO-1, WO-2, WO-5 | AC-3, AC-14, AC-16, S-13, S-16, P-10 | — | — | — |
| WO-10 | Non-regression, evidence inputs for V1 accounting, isolation and release readiness | `WO-10.md` r1 `1947e164a1d7415cdca50a94c7e68fbcb5a644aba87d2d1b83a6c966661cb318` | BINDING | — | AC-3, AC-9, AC-10, AC-11, AC-12, AC-16, S-11, S-12, S-14, S-15, S-16, P-1, P-8, P-10 | — | — | — |

## Coverage (generated from each WO's "Must satisfy" line; every WO row covered)

| Row | Covered by |
|---|---|
| AC-1 | WO-1, WO-4 |
| AC-2 | WO-8 |
| AC-3 | WO-5, WO-6, WO-9, WO-10 |
| AC-4 | WO-1, WO-7 |
| AC-5 | WO-4, WO-6 |
| AC-6 | WO-1, WO-5 |
| AC-7 | WO-8 |
| AC-8 | WO-3 |
| AC-9 | WO-2, WO-10 |
| AC-10 | WO-10 |
| AC-11 | WO-10 |
| AC-12 | WO-1, WO-8, WO-10 |
| AC-13 | — (Director-owned: the cumulative Factory V1 record (P-8), recorded at final acceptance; not a WO row) |
| AC-14 | WO-9 |
| AC-15 | WO-5 |
| AC-16 | WO-9, WO-10 |
| S-1 | WO-5 |
| S-2 | WO-1, WO-4 |
| S-3 | WO-2, WO-7 |
| S-4 | WO-1, WO-2, WO-3 |
| S-5 | WO-4, WO-6 |
| S-6 | WO-3 |
| S-7 | WO-2, WO-8 |
| S-8 | WO-1, WO-3, WO-8 |
| S-9 | WO-1, WO-8 |
| S-10 | WO-1, WO-2 |
| S-11 | WO-8, WO-10 |
| S-12 | WO-3, WO-4, WO-10 |
| S-13 | WO-1, WO-9 |
| S-14 | WO-1, WO-8, WO-10 |
| S-15 | WO-10 |
| S-16 | WO-5, WO-9, WO-10 |
| P-1 | WO-1, WO-7, WO-10 |
| P-2 | WO-2 |
| P-3 | WO-2 |
| P-4 | WO-4 |
| P-5 | WO-8 |
| P-6 | WO-5 |
| P-7 | WO-5 |
| P-8 | WO-10 |
| P-9 | WO-3, WO-4, WO-6, WO-8 |
| P-10 | WO-9, WO-10 |

## Document set (the canonical Director documents and instruments, frozen)

| Document | sha256 (LF, committed content) |
|---|---|
| `docs/architecture/features/factory-node-management-auto-enrollment.FOUNDER_TEXT.md` | `2a809839cbe3685a5ac33aae51592316e4c0b81ab922435d7685a7aa7a694a29` |
| `docs/architecture/features/factory-node-management-auto-enrollment.md` | `68b0128f9270edaa123defb34c975fc9b00ea02b2917a47d1f0bd58ebe95cf48` |
| `docs/architecture/features/factory-node-management-auto-enrollment.SECURITY_TENANCY.md` | `df0a711db68d80508c989e78133622646515ff3752b7fcf2b43ec5f46334dc66` |
| `qa/verification/auto-enrollment-v1/ACCEPTANCE_MATRIX.md` | `2a75e21bcd32a22cfd1a863e40fb2b72a5fc4d929c1c1284e1633d2c1d46777a` |
| `qa/verification/auto-enrollment-v1/VERIFICATION_SPEC.md` | `149a141138a9f03095a803de133e1b85e8aacec8dcaab1b0bd26a19e11e8d9fd` |
| `qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_MANIFEST.json` | `d62f96bd4639c5d5ae9b66e207681c9aa2bafd351d8071b57d696f4e565b13c5` |
| `qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_ROWS.json` | `fc7f0e0ba0a5ae2f289977dd353031bee01b4255b5a5925e40c4f744920c8488` |
| `docs/architecture/adr/ADR-2026-09-26-node-roles-are-labels.md` | `cda44e283cf004626970f7726f7a8d7ffb0f8c42066b22b7ebc08702def9e217` |
| `CLAUDE.md` | `85af09a9092fdc5c688ddad68be94575b9cd3a9271c952e8dbc19818394ce6c2` |
| `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` | `0c1dbe5a00d79f21b1adc2f2da129dd2af5757c9f794f23efb6e5d8c856e37a9` |
| `docs/architecture/templates/FEATURE_CONTRACT_TEMPLATE.md` | `d315117c2c82b5b149bd3db44404096240da3b3c85a8e5577e7deb17cdd3a79b` |
| `qa/verification/auto-enrollment-v1/LIVE_PLANE_CATALOG_SNAPSHOT_PRE_CANDIDATE.json` | `c56a7dc212ac96659d1fa9fa907954e1558d782a7eb4ee62a6be62ebeb45be87` |
| `qa/verification/auto-enrollment-v1/tools/baseline_manifest.mjs` | `940e4bed83cb311d804a68247d770ca87169967aae1baafc47dec2ffdab344e0` |
| `qa/verification/auto-enrollment-v1/tools/live_catalog_snapshot.mjs` | `cce945d496112ee443a1897368964b59f712fd9549a3fcb40c0ece26ac2c35b1` |
| `qa/verification/auto-enrollment-v1/tools/plane_access.mjs` | `d526b6c9a4089d429b47d6caf8e5ebcbe045555010f09a71c3a3e7f2431cff1a` |
| `.claude/skills/feature-delivery/SKILL.md` | `fc3df3d1b1cf3ae3eb241cc0ec519a79e145bacac3309360ca3b505a36c22c83` |
| `.claude/skills/commercial-demo-release/SKILL.md` | `cfdd7c1d2275a9ee290f00adc144a5acb95be28fb16ec2fb899af1ff486ad3a0` |
| `qa/PRODUCTION_CHECKLIST.md` | `96ba51339f796f1b846442efa1db5665818d130bc0bd3e9948da49dae7b1722b` |
| `docs/MESSAGING-TRANSPORT-ARCHITECTURE.md` | `f75f8720465616dbc34fb03892434375271721017233d5abf6029997e6a96ffd` |
| `.gitattributes` | `0a68aaee3d6953597b06b36f40663db62b85b6b229c404d7c3b2a84af41ae105` |

## Ratification register

The implementer's step-1 drafts on `factory/auto-enrollment-v1-contract` were written at `264987bb` / `33f14d6e` and marked
"SUPERSEDED — NOT CANONICAL" at `27d78ff6`. The Director read them as input and decided as follows.

| Item (commit `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` unless stated) | sha256 at that commit | Director decision |
|---|---|---|
| `docs/architecture/adr/ADR-2026-09-26-node-roles-are-labels.md` | `964b79b1bbe7f5e8c44da9d5f6f061be7b3676990df7d0b195fbe9e50351beb8` | text adopted into the canonical ADR **with amendments 1–10** (recorded in the ADR) |
| `CLAUDE.md` edit | `bbd0de23e89cc921408f39043aae3e6fa0b79e82b5550b42c570e7590af4015b` | adopted **with amendments**. The implementer restored the baseline at `27d78ff6`; the canonical copy is here |
| `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` edit | `a68ac4ef0af7bb4383c35e09fea93e83066bb5a0fb3fed0f90a8c24739192692` | adopted **with amendments**. Restored at `27d78ff6`; canonical copy here |
| `docs/architecture/features/factory-auto-enrollment.md`, Part A (founder text) | file `53e61c0bea97c50ca294a471cf015fd1b8983799c32c12ad6bdb825537f53a06` | adopted verbatim as founder text Part I. Part II prevails where they differ. **Founder confirmation of Part I requested**, with the corroborated and uncorroborated sections listed in the founder-text file |
| same file, Parts B–C (engineering design) | (same file) | read as input only; binds nothing. Their "what must be true" points are decided in the contract (session re-check, legacy fencing, re-pair, capability source, default policy, identity, authoring set) |
| `…/factory-auto-enrollment-api.md`, `…transport-matrix.md`, `…states.json` | `33f14d6e` versions | input only. Where they differ from the contract, the contract rules (e.g. revocation re-check per call, the S-7 route and operation list) |
| `qa/work-orders/change-requests/CR-001-factory-admin-allow-list.md` | `bea0218d706f8cf0d623c8ebe022b586ecf104db8bc775acbea781eeadd36009` | **RATIFIED**, extended with a **tier** column (S-8) |
| `CR-002-verification-failure-state.md` | `502fdda6fd7e342ff1602fe364650d7ad3702e7fc2d01332412a4ac2eaa1948e` | **RATIFIED**: `VERIFICATION_FAILED` (contract §2) |
| `CR-003-founder-only-release-tier.md` | `55ced1fb68851233c723f859c167bf77e1b2641be72733a8979a7de4fb0ca2f1` | **RATIFIED**, with the founder test recorded as tier `founder` in `tenant_admins` **and** role founder (not `profiles.role` alone; S1) |
| `CR-004-installer-distribution-visibility.md` | `b8fd5368ec01732257b499c39163915615285e26ee809a12d5d27daa1711d863` | **DECIDED: Option A**. Public download from storage (not a Factory route); sha256 and signing state shown; no secret in the binary |

## Founder items

- **Resolved, binding:** C-1 V1 accounting (P-8, AC-13, WO-10); C-2 the node / capability model (contract §1, P-6; WO-1, WO-2, WO-3,
  WO-5).
- **The only founder gate:** C-3, production release-signing key custody (WO-6). Final acceptance waits for it.
- **Surfaced, founder action:**
  - side finding **S1**: the Brain OS production policy `profiles_update_self_or_admin` lacks `WITH CHECK`. This is a production
    migration; S-8 keeps Factory administration safe meanwhile;
  - **Part I confirmation**;
  - **branch protection** for `factory/auto-enrollment-v1-director`: single-writer is currently detected (signed commits, out-of-band
    record) but not enforced;
  - **ledger 218** (`bf59ea34`, candidate repo) is local and unpushed;
  - a **SELECT-only observer role** on the live Factory plane for Director reads. Until it exists, candidate-stage Director reads use
    `runner.env` read-only; final acceptance waits for it;
  - a **pre-candidate Edge record** (function names, versions, sha256, updated_at; secret names, never values), read by the founder
    or with a read-only founder token (only CERTIFIED entries wait for it);
  - **the implementer signing-key fingerprint**, confirmed out of band as displayed on the implementing machine, before the Director
    records it;
  - **the implementation branch name** `factory/auto-enrollment-v1-implementation` (a Director decision, ADR amendment 10), for
    confirmation.

## Event log (append-only from the first commit)

| UTC | Event | By |
|---|---|---|
| 2026-09-26 | Ledger created. WO-1..WO-10 issued by the DIRECTOR as BINDING revision 1, re-based on the founder text; coverage complete; C-3 the sole founder gate; CR-001..CR-004 decided; baseline manifest and live catalog snapshot materialized (read-only); Director signing key created. | DIRECTOR |
| 2026-09-26 | Pre-commit corrections, made before any commit. **Founder-flagged:** (1) removed a draft rule that let the implementer issue its own work orders; (2) removed C-1 and C-2 as open gates and encoded them as binding rules. **Self-found:** (3) re-based every artifact on the founder text; (4) removed a duplicate ADR. **From two bounded four-lens reviews** (wf_128b3d64-4d0, wf_d222338e-c66): (5) closed their confirmed findings. | DIRECTOR |
| 2026-09-26 | Bounded four-lens review `wf_445b9dcc-0b2` (pass 3), made before any commit. Confirmed findings closed: the live trust set is a source input committed after C-3; a SELECT-only observer role for Director reads; agent-principal identity; the reserved capability `factory-enrolled-v1` and separate certification records; revocation lock semantics; peer-IP and CSPRNG pairing limits; AC-13 Director-owned; trust set and trust mode fixed at build time; legacy guard on new-model and enrolled rows; no front-door EXECUTE for PUBLIC or the legacy role; pairing state exits; idempotency and race cases; Director observation records; the exact reference-suite set; a schema-aware live catalog snapshot. | DIRECTOR |
| 2026-09-26 | Bounded four-lens review `wf_c2d41cde-da8` (pass 4; all four lenses answer both governance tests NO), made before any commit. Confirmed findings closed: one agent principal per computer, kept across rotate and re-pair; certification bound to its work order and exact provenance; no role membership to or from `factory_runner`; mixed-fleet and same-tables rules; trust-set entries as (key id, public-key sha256) and the PE Authenticode image hash as the digest; S-16(a) binding as the one permitted campaign write; product code defined by owned surfaces; the AC-10 referent before and after the migration; a live-activity check for S-15; a complete baseline rows export; reboot, per-user and failure-state rows in AC-1; the observer role required for final acceptance. | DIRECTOR |
| 2026-09-26 | Bounded four-lens confirmation `wf_0702dba7-364` (pass 5; no HIGH; all four lenses answer both governance tests NO), made before any commit. The mediums the pass-4 wording introduced were closed: the digest check at final acceptance; the per-user logon start reconciled with the watchdog; the product-layer S-16(a) scope as a scheduling restriction to Director-document work orders, with the governance-layer authorship check as its evidence; the live S-16(a) binding observed; pairing codes issued for a target principal; authorship verified against the published key until the founder confirms it; the AC-10 referent as a catalog difference plus a pre-candidate Edge record; S-15 row hashes and counters; the legacy reaper skipping enrolled rows; the instruments pinned to the `69df2f52` modules, with an explicit target and an observed identity. | DIRECTOR |
| 2026-09-26 | Bounded four-lens confirmation `wf_11c658f4-89d` (pass 6; all four lenses answer both governance tests NO), made before any commit. Two HIGH findings on pre-existing text were closed: no plane-conditioned behaviour (a static scan, and the prepared live migration byte-identical to the migration run on the copy, with the manifest recompute after its last statement); and the catalog instrument hardened (one read-only session with `search_path` pinned to `pg_catalog`, pinned module constants, a target checked both ways, and column ACLs, role and database settings, rules, views, constraints, indexes, extensions and storage policies read, with setting values hashed). Mediums closed: the Edge record handled like the fingerprint confirmation; the key-custody rule and the authoring-set check as S-16(a) evidence; the machine fingerprint defined (sha256 of MachineGuid) and compared across every reported value; per-credential enrollment states; a mistaken S-16(a) binding corrected by archive and re-enrollment; a lapsed enrolled lock never stalls the legacy queue; the runtime never reads the unhashed PE ranges. | DIRECTOR |

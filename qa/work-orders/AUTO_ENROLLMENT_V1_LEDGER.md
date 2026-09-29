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
   - WO-1..WO-10 below are Director-issued and **BINDING**, each at the revision the table shows (r2 issued WO-1, WO-2, WO-5, WO-6,
     WO-8, WO-9 and WO-10 as revision 2; r3 issued WO-1 and WO-10 as revision 3; WO-3, WO-4 and WO-7 remain revision 1).
   - The IMPLEMENTER owns its engineering decomposition inside them, on `factory/auto-enrollment-v1-implementation`, built on the
     Director commit this ledger designates.
   - **The implementer can never define or alter the work / acceptance contract it is judged against.**
2. **Frozen text.**
   - Each WO's text is `qa/work-orders/auto-enrollment-v1/WO-<n>.md`. The canonical documents are listed in "Document set" below.
   - Each is frozen by the sha256 of its committed content; `.gitattributes` pins them to LF.
   - A change is a new Director-issued revision, with new hashes and an event-log entry.
   - A changed file under an unchanged ledger hash is a tamper finding.
   - A WO's "Must satisfy" line is the single source of its coverage below.
3. **Change requests** (I A.5; founder ruling 2026-09-26, ownership-based namespaces, ADR).
   - The IMPLEMENTER submits a change request in `qa/implementation/auto-enrollment-v1/change-requests/` on
     `factory/auto-enrollment-v1-implementation`. A submission is never canonical; a change request anywhere else is not received.
   - Flow: submitted → DIRECTOR DECISION → canonical ledger / contract revision if approved → VERIFIER CHECKS.
   - The implementer may not approve its own change request, or modify binding WO text through one.
   - Historical CR-001..CR-004 stay at `qa/work-orders/change-requests/` (`33f14d6e`) and are not moved. CR-005 is valid where it is.
   - **CR-005** received at `qa/implementation/auto-enrollment-v1/change-requests/CR-005-implementer-signing-key.md` (first at
     `c838f5c9`, amended at `6719a8e9`; sha256 `aba57d6d82a1ed76fc818de13c9cc73d2fcccfe8440c0cbaf8b75e1a7fbc44b1`): **RATIFIED**. The
     key is recorded as `implementer_signing_key` (rule 8).
   - For this milestone the verifier namespace is `qa/verification/auto-enrollment-v1/<candidate-sha>/` (`VERIFICATION_SPEC.md` §4).
     The Director-issued criteria, instruments and referents elsewhere under `qa/verification/auto-enrollment-v1/` are Director
     canonical state frozen by the document set below; the single-writer `qa/*.json` files are Director canonical state written only
     by the DIRECTOR capability (C-5). This reading is surfaced for the founder's confirmation.
   - The IMPLEMENTER may propose a change to what must be true, and does not implement against it until the Director ratifies it.
   - Every non-conflicting item continues meanwhile.
   - **Public implementer records** (founder ruling 2026-09-28, founder text II.16). A record the IMPLEMENTER makes public (on
     any public branch, or in a commit message, pull request or issue) may carry: the Director revision consumed; the
     candidate or base SHA; finding IDs; disposition state; affected requirement IDs; test and result summaries; a statement
     that reconciliation is complete or incomplete; and the fields Director text requires of it (spec §2 for a candidate
     notice, a WO's "Candidate report must include" for a report, the proposal of a change request, and the public key rule 8
     has a change request publish). No public implementer record, those fields included, carries exploit mechanisms, race
     interleavings, privilege-bypass details, secret-handling weaknesses, detailed file-by-file instructions that materially
     aid exploitation, or verifier-only evidence: the implementer sends such material to the Director privately, through the
     founder, and where a required field would itself fall in one of those classes, the public record says it went privately.
     Verifier-only evidence the implementer receives is never republished. "Public Git remains code/version truth, not the default disclosure channel for live unfixed security defects."
     For the existing public reconciliation note the founder ruled: "The existing public reconciliation note may remain as-is unless it contains credentials, exploit instructions, or materially increases exposure beyond what is already obvious from the public code." and "Do NOT rewrite public git history merely to remove it." The
     same test applies to every other public implementer record published before 2026-09-28 (the founder confirmed, founder
     text II.17) and, as a Director reading surfaced for the founder's confirmation, to those published on 2026-09-28 before
     the ruling (04:29:42Z); one that fails it becomes a founder item, and no history is rewritten. A candidate notice's spec §2
     fields other than its test output identify objects that are already public, fall in none of the keep-private classes
     above, and so are carried in the notice itself; what the spec does with a field the notice leaves out is unchanged (for
     example §3.3 for a login the notice does not list).
   - The Director records a decision per request.
4. **Founder gates.** Exactly one founder gate exists: **C-3, production release-signing key custody, inside WO-6**. Final acceptance
   waits for it (S-5).
   - C-1 is resolved and binding: P-8 / WO-10.
   - C-2 is resolved and binding: contract §1 and P-6.
     - Founder text II.10 uses an earlier draft numbering, in which WO-5 was the installer. Here the installer is **WO-4**, and it
       carries no authorization content.
     - Envelope enrollment lives in **WO-1**, **WO-2** and **WO-3**. **WO-5** only applies the envelope in scheduling.
   - Founder *boundaries* are actions, not policy questions. They are listed per WO.
   - Two one-time founder actions are not gates under II.11 (the implementer signing identity is CONFIRMED, rule 8). The two are:
     - the pre-candidate Edge record for AC-10, plus one founder-provided token (bounded by AC-10's timing rule): the provider lists
       its scopes and each is read-only (unlisted scopes: refused, and the founder reads in person); the Director holds it only on the
       Director machine, outside every repository and runner.env; the event log records its id, scopes and expiry, never its value;
       the founder revokes it at final acceptance.
       Each candidate's Edge reading is then a Director read with the token; if the founder reads in person instead, each reading is
       a recurring founder action;
     - provisioning the observer role (needed before final acceptance). Row security does not filter its reads of the factory
       relations and `storage.buckets` (for example BYPASSRLS), and at its first read the founder confirms that every storage
       bucket it lists is founder-approved, in a confirmation that names no bucket (AC-10).
     A third exists only if the founder orders another implementer key: a founder decision naming its fingerprint (rule 8), also
     not a gate. For the Edge record, verification and receipts proceed before it, and only a CERTIFIED entry waits for it.
5. **The coverage rule.** Before the first CERTIFIED, every AC, S and P row is covered by at least one binding WO (table below). The
   Director closes a gap by issuing a WO or a revision. **AC-13 is the exception:** it is the cumulative Factory V1 record (P-8),
   acceptance state that only the Director records, so no WO claims it.
6. **States:** `BINDING → IN PROGRESS → CANDIDATE → CERTIFIED | REJECTED`. A REJECTED candidate returns the WO to IN PROGRESS.
   - Both cite a Director-committed, signed receipt (`VERIFICATION_SPEC.md` §5). REJECTED needs only a receipt with verdict REJECTED.
     CERTIFIED needs a receipt with verdict CERTIFIED that also shows:
     - authorship verified against the confirmed implementer key (`implementer_signing_key`, or another key confirmed as
       `VERIFICATION_SPEC.md` §3.1 states and recorded in `additional_implementer_keys`);
     - the certifier on a different machine from every author (S-16b);
     - the Director-issued verifier assignment;
     - matching hashes;
     - evidence for every row the WO covers.
   - CERTIFIED also needs AC-10's Edge clause resolved by a Director observation record: the candidate's Edge reading equals the
     committed Edge record, except founder-approved changes, and no AC-10 timing-rule finding concerns the candidate (AC-10).
   - CERTIFIED is not final acceptance. AC-1..AC-4 and AC-13 are recorded by the Director at final acceptance.
   - A resubmission after REJECTED is a new SHA with different content. Re-verifying the same SHA takes an explicit Director order.
   - **Where receipts live** (founder rulings, 2026-09-27 UTC; founder text II.14; the repository is public). Every receipt, REJECTED
     or CERTIFIED, is committed signed on a local-only ref, and its findings go to the implementer privately. "Candidate verdicts"
     holds one line per candidate: its SHA, the receipt's verdict and the receipt's sha256, never a finding. A superseding or
     ordered re-verification receipt replaces that candidate's line, and the event log records the superseded receipt's sha256.
     The Edge records are kept the same way: the pre-candidate Edge record and each candidate's Edge reading are on the
     local-only ref, cited by sha256, and so are every observer-login read in full (with a 256-bit random value that no published record or event entry holds) and any bucket finding; a published record of such a read omits its `storage_buckets` rows, nulls that section's hash and its snapshot hash, and carries the full-read file's sha256 as `full_read_sha256`; no published text carries such a read's snapshot or `storage_buckets` hash, and every comparison is taken from the local-only file (AC-10).
   - **A line is not a state transition.** The transitions are Director entries in the event log. REJECTED cites the line and
     returns the WOs the notice claimed to IN PROGRESS. CERTIFIED cites the line, names the WOs the notice claimed (each with evidence for every row it
     covers) and makes them CERTIFIED; it is written only when this rule's CERTIFIED conditions hold, citing the Edge observation record's sha256 and any `additional_implementer_keys` entry the authorship relies
     on. The WO table's "Text status" is the status of the WO's text. No public event-log entry
     carries a candidate's finding (a receipt's or an Edge observation record's): an entry cites that record by sha256 (spec
     §3.11).
7. **Placement and restrictions** (II.1, II.10).
   - Placement preferences are policy data and grant nothing: implementation on DESKTOP-8P5HVAO, independent verification on
     DESKTOP-MDPE6FS, acceptance on the third laptop.
   - **The milestone restrictions (S-16) are binding.** No Auto-Enrollment product code is authored on the Home machine. The Director
     authors no product code. Every milestone candidate is certified on a different physical machine from every author. On the
     plane, the first restriction is keyed to the Home computer's enrolled record and to every record that has reported its machine
     fingerprint, never to a hostname; archive and unbound re-enrollment never release it (S-14, S-16).
   - At the product layer the Director narrows the first restriction further, as a Director restriction stricter than the founder's
     line: a Home-computer record takes an authoring run only of a work order confined to the Director-document paths (S-16).
8. **Signing keys** (`VERIFICATION_SPEC.md` §1).
   - The Director key is recorded in the JSON as `director_signing_key`.
   - The implementer key is recorded as `implementer_signing_key`: published in CR-005, and **CONFIRMED** by founder ruling on
     2026-09-26 (Director checks had verified the implementation commits `8f9833ce..fbea204b`, 16 of 16, against the published
     identity, and CR-005 records the key; later commits are checked against the confirmed key under `VERIFICATION_SPEC.md` §3.1).
     It signs implementer / candidate-provenance commits only, is never a release trust root (S-5), and does not resolve C-3.
   - The key is not regenerated or replaced, its ACLs are not modified, and the private key is never exposed or transferred (founder
     text II.13). Any other implementer key exists only by founder order, recorded as a founder decision in the event log, then
     confirmed as `VERIFICATION_SPEC.md` §3.1 states (the founder decision that orders it, or a later founder decision, names its
     fingerprint; a change request publishes the same key; Director checks verify the commits) and recorded in
     `additional_implementer_keys` by a Director entry, never replacing `implementer_signing_key`; only the CERTIFIED entry waits
     for it (not a gate under II.11).
9. **Designated Director commit.** For each candidate the Director designates the Director commit whose criteria apply. By default it
   is the latest published Director commit when the candidate notice arrives; a local-only Director commit is never designated.

## Work orders

| WO | Title | Text (rev; sha256) | Text status | Depends on | Covers | Founder gate / boundary | Branch / candidate SHA | Receipts |
|---|---|---|---|---|---|---|---|---|
| WO-1 | Tenancy, identity, envelopes, credentials, admins, policies and legacy coexistence (schema) | `WO-1.md` r3 `7381c76e7b60c0414eab13a696f8c5b6e389e1336fbc6c99376ee266665f89a3` | BINDING | — | AC-1, AC-4, AC-6, AC-12, S-2, S-4, S-8, S-9, S-10, S-13, S-14, P-1 | boundary: Applying the schema to the live plane, and seeding `tenant_admins`, are founder actions. The candidate prepares the exact steps and does not run them. **The candidate migration** is every `.sql` file the candidate adds under `supabase/control-plane/`, recursively, excluding `supabase/control-plane/edge/`, since `69df2f52`, or since the last founder-applied step once one exists (the ledger event log lists each applied step's embedded files by path and sha256), applied in byte order of repository-relative path (contract §1). The `69df2f52` files `001`..`003`, and every file a founder-applied step embedded, are never changed. The candidate invokes the Director instrument as an external tool and never imports or copies it. The live-migration step is not candidate-written: the verifier builds it from the candidate migration's committed bytes with the Director instrument `qa/verification/auto-enrollment-v1/tools/build_live_migration_step.mjs`, as `begin`, the migration verbatim, the Director's manifest check after the migration's last statement (it aborts on any difference), and `commit`. The migration therefore holds no transaction control (BEGIN, START, COMMIT, END, ROLLBACK, ABORT, SAVEPOINT, RELEASE, PREPARE TRANSACTION, or a BEGIN ATOMIC body), no backslash outside a dollar-quoted body (a regular-expression constant is written dollar-quoted, for example `$r$...$r$`), no mention of `standard_conforming_strings` or `backslash_quote`, no psql variable reference and no COPY. It leaves no quote or comment open, and ends its last statement with `;`. Every statement runs inside the step's one transaction block: no `CONCURRENTLY`, and no procedure or DO block that commits. It leaves no deferrable constraint trigger, no deferrable exclusion constraint and no holdable cursor. The tool's header lists every refusal, and a refusal or an abort fails AC-11. The receipt records the step's sha256, and the founder applies exactly that file, in one session. | (event log) | (event log) |
| WO-2 | Factory Node API: an authenticated boundary over the same lifecycle | `WO-2.md` r2 `a4f7775edee005e4abfee77433e62a7af7167a09c5e9302faa135c9a512ba7e9` | BINDING | WO-1 | AC-9, S-3, S-4, S-7, S-10, S-12, P-2, P-3 | boundary: Deploying the Edge Functions live is a founder action (`ALLOW_FUNCTIONS_DEPLOY=1?`). | (event log) | (event log) |
| WO-3 | Add Computer: pairing and enrollment protocol (the capability envelope is granted here) | `WO-3.md` r1 `4fd171d31d4eaf6f1d51f0cb1258089bf9d090c9e62eaa13d3a5c4b20ca71713` | BINDING | WO-1, WO-2 | AC-8, S-4, S-6, S-8, S-12, P-9 | boundary: Creating the production pepper secret is a founder action. | (event log) | (event log) |
| WO-4 | BrainFactorySetup.exe and the persistent node runtime | `WO-4.md` r1 `07cb3d37c000f72b60b4cbd27301d69b3963b75e1e23b53cd7422932262f5284` | BINDING | WO-2, WO-3, WO-6 | AC-1, AC-5, S-2, S-5, S-12, P-4, P-9 | boundary: Installer Authenticode code signing is a founder / external action (I A.2). Until then the installer is published unsigned, with its sha256. | (event log) | (event log) |
| WO-5 | Scheduler eligibility and ranking; capability reporting, telemetry, priority, drain; milestone restrictions | `WO-5.md` r2 `bbeaf8098eac924094e34ff6619a1a41644f6c6b1ed11cef7a5efac7e37a1578` | BINDING | WO-1, WO-2 | AC-3, AC-6, AC-15, S-1, S-16, P-6, P-7 | — | (event log) | (event log) |
| WO-6 | Release manifest, pinned trust set, signing abstraction and runtime upgrade | `WO-6.md` r2 `53411b250db11c6b3098be8161c935b0b541cd95a12225c446d267eac4ffc4ef` | BINDING | — | AC-3, AC-5, S-5, P-9 | **gate: C-3, production release-signing key custody (the only founder gate) — - The implementer **must not choose, create or use the real production signing authority.** It states only the **interface** a production key must satisfy (algorithm, key-id format, rotation), without naming a custody option, provider or key. - Final acceptance waits for C-3. - Installer Authenticode signing is a separate founder / external boundary, under WO-4.** | (event log) | (event log) |
| WO-7 | Node lifecycle management: drain, resume, rotate, revoke, re-pair, archive, restore | `WO-7.md` r1 `1bd8c914b3089b10e6cfc8583754e403a66ee3ba0240bb808b82e8193c610a83` | BINDING | WO-1, WO-2 | AC-4, S-3, P-1 | — | (event log) | (event log) |
| WO-8 | Brain OS → Factory → Computers, and the Factory Admin API | `WO-8.md` r2 `4262e43e163ba94cc176451a5ab27fd412ffad084453011c3896115394015884` | BINDING | WO-1, WO-2, WO-3, WO-7 | AC-2, AC-7, AC-12, S-7, S-8, S-9, S-11, S-14, P-5, P-9 | boundary: The production Brain OS deploy (a PR into `master`), production secrets, and seeding `tenant_admins` are founder actions. `master` stays untouched in this phase. | (event log) | (event log) |
| WO-9 | Independent verification model, policies and the verification state machine | `WO-9.md` r2 `12a3a3d79379b5737365c1c2e5d82b4bbbd9305285e18958a7c0045f8e7a7d6a` | BINDING | WO-1, WO-2, WO-5 | AC-3, AC-14, AC-16, S-13, S-16, P-10 | — | (event log) | (event log) |
| WO-10 | Non-regression, evidence inputs for V1 accounting, isolation and release readiness | `WO-10.md` r3 `2409fbf6666423e7a05a23379c0e8566e11d040d4ecc92e98b6c8e4fb5496ee6` | BINDING | — | AC-3, AC-9, AC-10, AC-11, AC-12, AC-16, S-11, S-12, S-14, S-15, S-16, P-1, P-8, P-10 | — | (event log) | (event log) |

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
| S-12 | WO-2, WO-3, WO-4, WO-10 |
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
| `docs/architecture/features/factory-node-management-auto-enrollment.FOUNDER_TEXT.md` | `ee513f9379acafba030e20fc5d0b241c55600bf9fcd6e18c21f60ee2ec9177ca` |
| `docs/architecture/features/factory-node-management-auto-enrollment.md` | `dfae3aa09331276678f695f474806ca61ebe4b73fc287cf436dcf8e494cc18b1` |
| `docs/architecture/features/factory-node-management-auto-enrollment.SECURITY_TENANCY.md` | `ae57c5763795c74f114bacaa2103faa6baa8d12a9b1d783683ac5339dd376d97` |
| `qa/verification/auto-enrollment-v1/ACCEPTANCE_MATRIX.md` | `d7553a581869f98b648cdea437941b5af55067bebd3da59ce3c83c00603fbbe0` |
| `qa/verification/auto-enrollment-v1/VERIFICATION_SPEC.md` | `57221c69cbe9fc55e1caf18e96581a34171ffe6adf87b42d835b999bbf8ec254` |
| `qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_MANIFEST.json` | `d62f96bd4639c5d5ae9b66e207681c9aa2bafd351d8071b57d696f4e565b13c5` |
| `qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_ROWS.json` | `fc7f0e0ba0a5ae2f289977dd353031bee01b4255b5a5925e40c4f744920c8488` |
| `docs/architecture/adr/ADR-2026-09-26-node-roles-are-labels.md` | `3be77b836372127f6d7d9c4d4721b75b02a0aea78166baf7297cbcc86548d417` |
| `CLAUDE.md` | `15a28827b6e0b6957c62c8af65c130427207135e5092c254c54597e3313bbc30` |
| `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` | `ce2cf71e479728d1bd410dd2f47b2734a48eb3031762a528beb1b73bfaeacd49` |
| `docs/architecture/templates/FEATURE_CONTRACT_TEMPLATE.md` | `d315117c2c82b5b149bd3db44404096240da3b3c85a8e5577e7deb17cdd3a79b` |
| `qa/verification/auto-enrollment-v1/LIVE_PLANE_CATALOG_SNAPSHOT_PRE_CANDIDATE.json` | `80507056c08e7e07eed4a64c348bf942c5ea8cbd9561189a239bf8ed5b094df6` |
| `qa/verification/auto-enrollment-v1/tools/baseline_manifest.mjs` | `279ab9168475acfa110692b1551b348a7555028b1167db646793920f4c5c4d72` |
| `qa/verification/auto-enrollment-v1/tools/live_catalog_snapshot.mjs` | `fc96e69dfe36a4e637c0a7fbdc96210ba076c37d6fa60c9899236ebe2f003f48` |
| `qa/verification/auto-enrollment-v1/tools/plane_access.mjs` | `21e6853931b6f68bc87abb44ed5a5606154bf878aa994b599a254044d5de4514` |
| `qa/verification/auto-enrollment-v1/tools/build_live_migration_step.mjs` | `7e35c88f1dcfc7df6ea6854e04543ae4dd995ab32c5ab2a9b2f97b3c02d48cc0` |
| `qa/verification/auto-enrollment-v1/tools/applying_role_observation.mjs` | `849b3d2402781acfccb5ba9686adb1b4d53018a788ada10fc94f0cdbd22cc893` |
| `qa/verification/auto-enrollment-v1/APPLYING_ROLE_OBSERVATION.json` | `33e2d6ac4497c995c0c2daa393dfbee9b0b5b4c757890259d55b41992b704de3` |
| `.claude/skills/feature-delivery/SKILL.md` | `fc3df3d1b1cf3ae3eb241cc0ec519a79e145bacac3309360ca3b505a36c22c83` |
| `.claude/skills/commercial-demo-release/SKILL.md` | `cfdd7c1d2275a9ee290f00adc144a5acb95be28fb16ec2fb899af1ff486ad3a0` |
| `qa/PRODUCTION_CHECKLIST.md` | `96ba51339f796f1b846442efa1db5665818d130bc0bd3e9948da49dae7b1722b` |
| `docs/MESSAGING-TRANSPORT-ARCHITECTURE.md` | `f75f8720465616dbc34fb03892434375271721017233d5abf6029997e6a96ffd` |
| `.gitattributes` | `0a68aaee3d6953597b06b36f40663db62b85b6b229c404d7c3b2a84af41ae105` |

## Ratification register

The implementer's step-1 drafts on `factory/auto-enrollment-v1-contract` were written at `264987bb` / `33f14d6e` and marked
"SUPERSEDED — NOT CANONICAL" at `27d78ff6`. The Director read them as input and decided as follows. CR-005 was filed later, in
the implementer namespace (rule 3).

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
| `qa/implementation/auto-enrollment-v1/change-requests/CR-005-implementer-signing-key.md` (c838f5c9; amended 6719a8e9) | `aba57d6d82a1ed76fc818de13c9cc73d2fcccfe8440c0cbaf8b75e1a7fbc44b1` | **RATIFIED**: recorded as `implementer_signing_key`, CONFIRMED by founder ruling 2026-09-26 (founder text II.13); valid where it was filed (founder text II.12) |

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
    `runner.env` read-only; final acceptance waits for it. Row security does not filter its reads of the factory relations and
    `storage.buckets` (for example BYPASSRLS), and at its first read the founder confirms that every storage bucket it lists is
    founder-approved, in a confirmation that names no bucket (AC-10);
  - a **pre-candidate Edge record** (function names, versions, sha256, updated_at; secret names and, where shown, value digests; never
    values), read by the founder or with a founder-provided token: the provider lists its scopes, and each listed scope is read-only (a
    token whose scopes are not listed is refused, and the founder reads in person instead). The Director holds the token only on the
    Director machine, outside every repository and runner.env; the event log records its id, scopes and expiry, never its value; the
    founder revokes it at final acceptance. Only CERTIFIED entries wait for the record. Taking the record, the founder also confirms
    that each listed secret name existed before the handoff time. With the token, each candidate's Edge reading is a Director read; if
    the founder reads in person instead, each reading is a recurring founder action (AC-10);
  - **who confers the DIRECTOR capability** for features outside this milestone (a constitution question; for this milestone the
    founder placed it on the Home machine, I A.4 §3);
  - **the completion of the permanent QA-receipt rule** (founder text II.14: no founder message completing the
    permanent rule has arrived; the chosen option governs meanwhile);
  - **the implementation branch name** `factory/auto-enrollment-v1-implementation` (a Director decision, ADR amendment 10), for
    confirmation;
  - **the 2026-09-28 pre-ruling records reading** (rule 3): II.16's test also applied to the public implementer records published
    on 2026-09-28 before the ruling (04:29:42Z), for confirmation;
  - **the verifier-namespace reading** for this milestone (rule 3): `qa/verification/auto-enrollment-v1/<candidate-sha>/`, with the
    Director-issued files elsewhere under `qa/verification/auto-enrollment-v1/` and the single-writer `qa/*.json` files counted as
    Director canonical state, for confirmation;
  - **the pre-push hook** `.githooks/pre-push` flags every new branch built from the `69df2f52` Factory history (its
    `supabase/functions` change versus `master`); a fix to the hook is a founder-authorized PR on `master`.
- **Completed:** the implementer / candidate-provenance signing identity (CR-005), CONFIRMED by founder ruling on 2026-09-26 (II.13).
  It does not resolve C-3.

## Candidate verdicts (the public line; full receipts stay on a local-only ref)

| Candidate | Receipt verdict | Receipt sha256 |
|---|---|---|
| `412ac14e76f88fbd5e310d3e97dbf5acab2c1498` | **REJECTED** | `f94861a76699696e86160064090356eb823bc5627bba50af9f259fff4bb11b57` |

## Event log (append-only from the first commit)

| UTC | Event | By |
|---|---|---|
| 2026-09-26 | Ledger created. WO-1..WO-10 issued by the DIRECTOR as BINDING revision 1, re-based on the founder text; coverage complete; C-3 the sole founder gate; CR-001..CR-004 decided; baseline manifest and live catalog snapshot materialized (read-only); Director signing key created. | DIRECTOR |
| 2026-09-26 | Pre-commit corrections, made before any commit. **Founder-flagged:** (1) removed a draft rule that let the implementer issue its own work orders; (2) removed C-1 and C-2 as open gates and encoded them as binding rules. **Self-found:** (3) re-based every artifact on the founder text; (4) removed a duplicate ADR. **From two bounded four-lens reviews** (wf_128b3d64-4d0, wf_d222338e-c66): (5) closed their confirmed findings. | DIRECTOR |
| 2026-09-26 | Bounded four-lens review `wf_445b9dcc-0b2` (pass 3), made before any commit. Confirmed findings closed: the live trust set is a source input committed after C-3; a SELECT-only observer role for Director reads; agent-principal identity; the reserved capability `factory-enrolled-v1` and separate certification records; revocation lock semantics; peer-IP and CSPRNG pairing limits; AC-13 Director-owned; trust set and trust mode fixed at build time; legacy guard on new-model and enrolled rows; no front-door EXECUTE for PUBLIC or the legacy role; pairing state exits; idempotency and race cases; Director observation records; the exact reference-suite set; a schema-aware live catalog snapshot. | DIRECTOR |
| 2026-09-26 | Bounded four-lens review `wf_c2d41cde-da8` (pass 4; all four lenses answer both governance tests NO), made before any commit. Confirmed findings closed: one agent principal per computer, kept across rotate and re-pair; certification bound to its work order and exact provenance; no role membership to or from `factory_runner`; mixed-fleet and same-tables rules; trust-set entries as (key id, public-key sha256) and the PE Authenticode image hash as the digest; S-16(a) binding as the one permitted campaign write; product code defined by owned surfaces; the AC-10 referent before and after the migration; a live-activity check for S-15; a complete baseline rows export; reboot, per-user and failure-state rows in AC-1; the observer role required for final acceptance. | DIRECTOR |
| 2026-09-26 | Bounded four-lens confirmation `wf_0702dba7-364` (pass 5; no HIGH; all four lenses answer both governance tests NO), made before any commit. The mediums the pass-4 wording introduced were closed: the digest check at final acceptance; the per-user logon start reconciled with the watchdog; the product-layer S-16(a) scope as a scheduling restriction to Director-document work orders, with the governance-layer authorship check as its evidence; the live S-16(a) binding observed; pairing codes issued for a target principal; authorship verified against the published key until the founder confirms it; the AC-10 referent as a catalog difference plus a pre-candidate Edge record; S-15 row hashes and counters; the legacy reaper skipping enrolled rows; the instruments pinned to the `69df2f52` modules, with an explicit target and an observed identity. | DIRECTOR |
| 2026-09-26 | Bounded four-lens confirmation `wf_11c658f4-89d` (pass 6; all four lenses answer both governance tests NO), made before any commit. Two HIGH findings on pre-existing text were closed: no plane-conditioned behaviour (a static scan, and the prepared live migration byte-identical to the migration run on the copy, with the manifest recompute after its last statement); and the catalog instrument hardened (one read-only session with `search_path` pinned to `pg_catalog`, pinned module constants, a target checked both ways, and column ACLs, role and database settings, rules, views, constraints, indexes, extensions and storage policies read, with setting values hashed). Mediums closed: the Edge record handled like the fingerprint confirmation; the key-custody rule and the authoring-set check as S-16(a) evidence; the machine fingerprint defined (sha256 of MachineGuid) and compared across every reported value; per-credential enrollment states; a mistaken S-16(a) binding corrected by archive and re-enrollment; a lapsed enrolled lock never stalls the legacy queue; the runtime never reads the unhashed PE ranges. | DIRECTOR |
| 2026-09-26 | Bounded four-lens confirmation `wf_cac670db-92c` (pass 7) on exactly the r1 bytes: no HIGH; all four lenses answer both governance tests NO; the residual mediums were registered for r2. | DIRECTOR |
| 2026-09-26 | **Director r1** released by the founder and committed as `8f9833cea3bd8b70d995cfe5575b6dabadb8361d`, signed with the Director key; all 30 frozen hashes equal the committed blobs. Pushed to `origin/factory/auto-enrollment-v1-director` under a one-time founder-authorized pre-push override: the hook flagged the inherited `69df2f52` `supabase/functions` history; r1 changes no function, and no Actions run started for the branch or SHA. r1 authorizes implementation; it is not final-candidate certification readiness. | DIRECTOR |
| 2026-09-26 | **Director r2.** It closes the pass-7 residuals. AC-10's Edge-record timing is bounded by the handoff, `2026-09-26T14:44:26Z` (committer time of `8f9833ce`, the first Director commit that issued binding work orders). The S-16(a) binding path is closed (Home-computer records by fingerprint; an unbound re-registration is refused). The live-migration step is specified and supplied as the Director instrument `tools/build_live_migration_step.mjs`. The first-migration binding check is added. The plane-conditioned-behaviour scan classifies each hit; the node runtime, installer and web code stay outside it, and node-side trust rests on S-5, AC-5 and live AC-1..AC-4. The instruments pin the session before every statement (`pg_temp` last, temporary objects refused, rendering pinned, `PG*` variables and a redirected home refused, ROOT required), hash activity keys and record per-section hashes. The key-custody rule is scoped to product code. Consistency items are closed. **Founder rulings recorded:** ownership-based namespaces for change requests (Director `qa/work-orders/`; implementer `qa/implementation/<milestone>/change-requests/`; verifier `qa/verification/<milestone>/`; CR-001..CR-004 are not moved; CR-005 is valid in place), in the ADR, `CLAUDE.md` §8, `FEATURE_COMPLETENESS_CONTRACT.md` §8 and rule 3; and the implementer / candidate-provenance signing identity CONFIRMED (C-3 unaffected). WO-1, WO-2, WO-5, WO-6, WO-8, WO-9 and WO-10 are issued as revision 2. The live catalog referent was re-read with the revised instrument and is unchanged (`2292e0ae`); its not-hashed activity section was taken after the handoff, and every row hash equals r1's read, the only counter delta being node heartbeats. The r2 confirmation review `wf_343cc695-4a3` (all four lenses answer both governance tests NO) found two HIGH defects (the candidate-migration definition, reported by two lenses; the applying role's attributes) and MEDIUM step-hardening items, all closed before release: "the candidate migration" is defined once (every `.sql` file added under `supabase/control-plane/`, recursively, excluding `edge/`, since `69df2f52` or the last founder-applied step, in byte order of path), and every disposable plane takes exactly the built step; every plane is provisioned and migrated as a non-superuser login that mirrors the live applying role, and the applying role's or an owner's attributes are plane-conditioned hits; the step resets session authorization and role, turns row security off before its check, and pins `client_encoding` to UTF8 (tested against a disposable PostgreSQL: 7 of 7 scenarios). Also closed: the verifier's change-request check (§2, §3.1); the CR-005 record; the founder's two rulings transcribed with their UTC times as founder text II.12 and II.13, with the Director reconstruction the founder confirmed; the verifier namespace stated with the founder's alternative, "or the canonical verifier namespace defined by the QA model". The fix-confirmation review `wf_250ab19d-e6b` (all four lenses answer both governance tests NO) found one HIGH, closed: inside a SECURITY DEFINER front door the current user is the owner, so the calling API role is read from the session user, and the applying login's or an owner's name or attributes fit no class. Also closed: the applying login named `postgres` with the referent's full attributes, on a plane whose bootstrap superuser has another name; every judging plane loads the baseline rows and every founder-applied step before the candidate step; the certified reference suites provision their own planes; the change-request check limited to requests the candidate names or implements; the key directives stated without a time bound; the Edge token's scopes, custody, record and revocation; dates in UTC. The second fix-confirmation review `wf_85ba49d5-85a` (no HIGH; all four lenses answer both governance tests NO) closed: the applying login built from `APPLYING_ROLE_OBSERVATION.json`, a read-only Director record of the live `postgres` role (attributes, `search_path`, memberships); AC-11's copy carries every founder-applied step; the calling API role read only from the session user; the reference-suite exception in the contract; the ledger rule 4 token terms; historical CR-001..CR-004 untouched by the change-request rule; the founder messages in fenced text blocks. The third fix-confirmation review `wf_0d5ddb8b-59a` (all four lenses answer both governance tests NO) found two HIGH, closed: every plane that judges a candidate is a judging plane, a local Supabase database whose bootstrap superuser aligns it to the live referent (roles and their attributes, memberships with their admin, inherit and set options and grantor, database and schema ACLs, default privileges, extensions, event triggers), and it must pass a fidelity check against the referent before the candidate step, or it judges nothing. The catalog instrument now reads each membership's inherit and set options and grantor, and every schema's default privileges; the applying-role record also reads them, the database's settings for all roles, and `createrole_self_grant`. Both were re-read from the live plane (read-only): every other catalog section kept its sha256, the live membership of `postgres` in `factory_runner` is admin without inherit or set, and the snapshot sha256 is now `d08016457cfd40e0346ec3a7b27b8ad9256044c76c062b43f63deeedeb4bc047`. Also closed: historical CR-001..CR-004 match their ratification-register sha256, and a proposal filed elsewhere is never decided; the AC-11 row; the candidate-migration base in every paraphrase; the `qa/*.json` reading; the other-key exception; the CR-005 decision text; the Edge digest wording, the token's revocation and the unobservables; the scan scope; the founder-text quote of the Director reconstruction. | DIRECTOR |
| 2026-09-27 | Founder ruling, 2026-09-27 (UTC; founder text II.14): the chosen option reads "Every receipt, REJECTED or CERTIFIED, is committed signed on a local-only ref, and the full findings go to the Work PC privately. The public ledger records one line per candidate: SHA, verdict and the receipt's sha256, never findings. The designated Director commit is always a published commit." | FOUNDER |
| 2026-09-27 | REJECTED transition (rule 6): candidate 412ac14e76f88fbd5e310d3e97dbf5acab2c1498, whose notice 1d74193470ae735ca9b999444334529385ec35ea claimed WO-1..WO-10, judged against the designated (published) Director commit 8f9833ce (r1); the Candidate verdicts line; WO-1..WO-10 return to IN PROGRESS. | DIRECTOR |
| 2026-09-27 | Director r3. It closes the six MEDIUM findings of the r2 confirmation wf_a63a7dc0-82a, the step instrument's backslash rule, and the findings of the r3 confirmations wf_919764bb-88d, wf_dbc0b4e7-8f9, wf_20977045-5bd, wf_c84f71c2-521, wf_793af41a-129, wf_6b85ee4b-b5c and wf_d0a73a8c-dd3, except the open lows carried forward below. Judging planes align to the pre-candidate referent and leave what the 69df2f52 provisioning and the founder-applied steps create to the applying login (an object they change is aligned first, then changed by the replay); each role's settings become exactly the recorded ones and are compared per setting by hash (a secret-named setting by name only, in both records); the plane's database has the referent's encoding, collation, ctype, locale provider, locale and ICU rules; each judging plane is its own verifier cluster, started with no candidate code alive, whose logins, except the API logins the candidate notice lists, get credentials only the verifier holds; a step's change to a login is a finding and is reset, and a connection not refused is a finding when the step or candidate code changed or created that login and otherwise a verifier setup failure; an API login and every role it reaches hold no attribute or privilege beyond its front doors; the fidelity check names its exceptions; the scan gains two hit classes and a secret-setting inventory. The step instrument pins standard_conforming_strings and admits a backslash only inside a dollar-quoted body, because one simple-Query message is parsed whole before its first SET runs (16/16 on a disposable database); a regular-expression constant is written dollar-quoted (WO-1 revision 3). Candidate code runs apart from the Director's secrets, under a separate standard OS account with a verifier-fixed allowlisted environment, reset before each candidate and proved before the first run. Another implementer key is confirmed by a founder decision that names its fingerprint and is recorded as additional_implementer_keys, never replacing implementer_signing_key (WO-10 revision 3). The Edge records and an AC-10 Edge finding, like a receipt, stay on the local-only ref, and no public event-log entry carries a candidate's finding. The catalog and applying-role instruments were extended and re-read from the live plane (read-only): every other section kept its sha256; snapshot 133561edf13cfe7f3dcad594707fa7aee5c485c8c1167bfd0b82b79646a9c8be. The ledger builder fills its tables literally and checks its own output. The last confirmation, wf_77ba514a-ab5, found no HIGH and no MEDIUM, and all four lenses answer both governance tests NO. Carried forward as open lows (r4 work): the operator tenant row's content (ICC-R2-10); a class rule for a post-handoff re-read of the activity referent (N-AU8-7); an activity comparison for the activity referent this revision replaced (ICC-R3-L1, N-AU12-2); the secret-name bound that rests on the founder's confirmation (VE-R2-L3); the protected-location wording and a file-level denied-read proof (VE-R3H-L3); the lows of wf_77ba514a-ab5: the first observer read's custody when the founder does not confirm every bucket (FID-R3I-1, ICC-R3I-L2, N-AU20-2, VE-R3I-L4), the evidence-phase sentence's scope over the pre-proof login comparison (FID-R3I-2), that comparison's timing and baseline and the API-login reset order (ICC-R3I-L1, N-AU20-1, VE-R3I-L1, VE-R3I-L2), and a credential the step gives a role it creates (VE-R3I-L3). | DIRECTOR |
| 2026-09-28 | Founder authorization, 2026-09-28 (UTC; founder text II.15): release Director r3 on the chosen option "Release + push now (Recommended)", with "1. Commit exactly the current reviewed r3 bytes.", "Confirm no production workflow/deployment was triggered.", "11. Publish the exact r3 SHA to the Work PC.", "From that point forward, the next implementation candidate must consume r3, not r2." and "The remaining LOW findings become r4 work and must not delay r3 release." | FOUNDER |
| 2026-09-28 | **Director r3** released by the founder (founder text II.15) and committed as `c7a845b61a3b0b419e8c9dfeff397547fdc75b03` (parent `5709a6a4`, committer time 2026-09-28T01:25:09Z), signed with the Director key; exactly the reviewed bytes. Pushed to `origin/factory/auto-enrollment-v1-director` by explicit refspec under a one-time founder-authorized pre-push override; r3 changes no function. Remote refs read back: director `c7a845b6`, factory `69df2f52`, master `55a15917`, implementation `1d741934`; no local-only ref on the remote; no GitHub Actions run and no production deployment (the newest Production deployment is still `55a15917`'s of 2026-09-08); the Vercel integration created a Preview deployment for `c7a845b6` at 2026-09-28T01:25:58Z (not production), and the Supabase Preview check was skipped (read at 2026-09-28T03:44:19Z). The r3 SHA and a notice for the implementer went to the founder for private relay (the repository is public, founder text II.14; the Director's watcher, which counts a node as live if it heartbeated in the last 30 minutes, reported the Work PC's existing legacy node, node-9985e092, gone at its 2026-09-27T07:59:45Z poll and live again at its 2026-09-28T03:35:48Z poll; it was not re-enrolled). The next candidate notice, if it names r3, is judged against r3 (founder text II.15) even if a later Director commit is published first: the Director re-designates r3 for it (rule 9) and never REJECTS it for naming r3. No notice is designated against r1 or r2 (II.15: "must consume r3, not r2"). A later notice follows rule 9's default unless the founder's release of a later Director commit says otherwise. | DIRECTOR |
| 2026-09-28 | Founder ruling, 2026-09-28 (UTC; founder text II.16), on public implementer records: "The existing public reconciliation note may remain as-is unless it contains credentials, exploit instructions, or materially increases exposure beyond what is already obvious from the public code." "Do NOT rewrite public git history merely to remove it." Going forward, public implementer records may contain the Director revision consumed, the candidate/base SHA, finding IDs, disposition state, affected requirement IDs, a test/result summary and a statement that reconciliation is complete/incomplete, and keep private exploit mechanisms, race interleavings, privilege-bypass details, secret-handling weaknesses, detailed file-by-file instructions that materially aid exploitation, and verifier-only evidence. "Public Git remains code/version truth, not the default disclosure channel for live unfixed security defects." | FOUNDER |
| 2026-09-28 | Director r4. It closes the lows r3 carried as r4 work (founder text II.15) and the findings of its confirmations wf_9b1ab774-105, wf_ed7a49f0-19d, wf_754a9c64-2df, wf_9e3c22af-b45 and wf_3c320fc5-7d3, except the operator tenant row's content (ICC-R2-10), carried forward because it is a product-semantics decision on columns the implementer designs, and the row grants nothing. Every observer-login read is committed in full on the local-only ref with a 256-bit random value that no published record or event entry holds; published text cites such a read only by full_read_sha256 and by its published record's sha256, every comparison is taken from the local-only file, and the founder's bucket confirmation names no bucket. The login comparisons are taken just before and just after every refused-connection proof after the step, and after each cluster's last candidate process; a credential or validity the step gives a role it creates is a finding; the API logins get their credentials after the after-step proof. The evidence-phase sentence covers only the evidence reads. Protected locations are named consistently, and their denied reads are re-proved after any credential is written. The secret-name bound is a recorded limit. The S-15 activity referent is replaced only by listing and explaining every difference from the referent it replaces, in a Director commit published before any receipt whose designated Director commit carries the new referent: r3's re-read (observed 2026-09-27T13:26:23Z), against r2's referent (5709a6a4, observed 2026-09-26T19:54:29Z), has identical row-hash sets in all 9 factory tables, and the only counter delta is nodes updates +1672 (legacy heartbeats); no receipt had been judged against r3's re-read when r4 was prepared (no candidate notice since r3). Founder text II.15 transcribes the r3 release authorization, and the founder authorization entry (II.15) and the r3 release entry above record that ruling and the release; II.14's note limits what arrived after "FULL QA RECEIPTS:" to that sequence and says no later founder message completes the permanent QA-receipt rule; the founder item says no completing message has arrived and the chosen option governs meanwhile. Ledger rule 3 records the founder's ruling on public implementer records (founder text II.16) in the founder's words; the Director found that the implementer's public R3_RECONCILIATION.md (c1f52a14) contains no credentials or exploit instructions and does not materially increase exposure beyond what is already obvious from the public code, so it remains as-is. | DIRECTOR |
| 2026-09-28 | Founder rulings, 2026-09-28 (UTC; founder text II.17): for Director r4 the chosen option "Release + push now (Recommended)", with "Release r4 now exactly as reviewed." and the parent c7a845b61a3b0b419e8c9dfeff397547fdc75b03; for the scope of II.16 the chosen option "Confirm the reading (Recommended)": "Every public implementer record published before 2026-09-28 is judged by the same test. One that fails it becomes a founder item, and no history is rewritten. r5 records your confirmation." | FOUNDER |
| 2026-09-28 | **Director r4** released by the founder (founder text II.17) and committed as `f707eba00bb9a13ff24cdc4beeb0531882873507` (parent `c7a845b6`, committer time 2026-09-28T11:43:10Z), signed with the Director key; exactly the reviewed bytes. Pushed to `origin/factory/auto-enrollment-v1-director` at 2026-09-28T11:43:26Z by explicit refspec under a one-time founder-authorized pre-push override; r4 changes no function. Remote refs read back: director `f707eba0`, factory `69df2f52`, master `55a15917`, implementation `6ba22e3e`; no local-only ref on the remote. Read at 2026-09-28T11:46:47Z: no GitHub Actions run and no production deployment (the newest Production deployment is still `55a15917`'s of 2026-09-08); the Vercel integration created a Preview deployment for `f707eba0` at 2026-09-28T11:43:58Z (not production), and the Supabase Preview check was skipped. The r4 SHA and a notice for the implementer went to the founder for private relay. The next candidate notice, if it names r3, is still judged against r3 (the r3 release entry); the r4 release does not extend this, and a later notice follows rule 9's default. | DIRECTOR |
| 2026-09-29 | Director r5. It closes the lows r4 carried as r5 work (founder text II.17: "Remaining lows go to r5"), except the record of the Director applying II.16's test to the other earlier records, which moves to r6; the operator tenant row's content (ICC-R2-10) stays carried. Founder text II.17 transcribes the r4 release authorization and the founder's confirmation of II.16's scope, and the founder entry and the r4 release entry before this one record them. Ledger rule 3 now states that II.16's test applies to every other public implementer record published before 2026-09-28 (the founder confirmed, founder text II.17) and, as a Director reading surfaced for the founder's confirmation, to those published on 2026-09-28 before the ruling; one that fails it becomes a founder item, and no history is rewritten. It also states that a candidate notice carries its spec §2 fields other than its test output itself, and that what the spec does with a field the notice leaves out is unchanged. In rule 3 the founder's words are the quoted sentences (and founder text II.16); everything else, the restated lists included, is Director text. The r4 release entry bounds the r3 designation to the next notice. The release commit names the review of these bytes. | DIRECTOR |

# Verification specification — Factory Node Management + Zero-Touch Auto Enrollment (V1)

How a distinct authorized verifier certifies or rejects a milestone candidate, and how QA records are written.

- **Part of:** the canonical contract (`docs/architecture/features/factory-node-management-auto-enrollment.md`).
- **Single writer:** the DIRECTOR capability.
- **Governance:**
  - `docs/architecture/adr/ADR-2026-09-26-node-roles-are-labels.md`;
  - founder text II.3, II.6, II.8;
  - `CLAUDE.md` §3, §6 and §7.

## 1. Two layers, and the principals of each

There are two different "certifications", and the rules of one never stand in for the other.

**Product layer** (what the candidate builds). A Factory certification run in the product is governed by S-13 and S-16:
- enrolled identities, envelopes and verifier authority;
- the authoring set;
- the certification front door.

This is what AC-3, AC-9 and AC-14 test inside the candidate.

**Governance layer** (this milestone's candidates; this document):

| role | who | identity |
|---|---|---|
| **Author** | the implementer sessions on the implementing machine (placement: DESKTOP-8P5HVAO) | the **implementer signing key**: an SSH commit-signing key generated on the implementing machine, with the public key registered in the ledger JSON as `implementer_signing_key` by a Director entry. Every commit in the §3.1 range must verify against it |
| **Verifier** | the verifier session on a different physical machine from every author (placement: DESKTOP-MDPE6FS; S-16b) | the session id plus the machine, as attested by the Director. Its authority is a **Director-issued verifier assignment**, recorded in the ledger for that candidate before the run |
| **Director** | the single writer of the ledger, the acceptance state and the receipts' commits | the **Director signing key** (`director_signing_key` in the ledger JSON) |

**Keys are authenticated outside the branch.**
- The verifier obtains the Director's public key from the Director directly (its out-of-band record), never only from the branch. It
  verifies the designated Director commit's signature before reading any criterion from it.
- The implementer key's fingerprint is confirmed by the founder out-of-band, as displayed on the implementing machine, before the
  Director records it. This is a one-time founder action: verification runs and receipts proceed before it, and only the CERTIFIED
  ledger entry waits for it.

- The legacy nodes' "cannot certify release candidates" and S-13's "current envelope" clause apply to the product layer. They do not
  apply to governance receipts.
- **Criteria source.** The verifier reads every criterion from the Director branch at the **Director commit the ledger designates for
  that candidate**. By default that is the latest Director commit when the candidate notice arrives. It never reads a criterion from the
  candidate tree. If the candidate notice names a different Director commit, the Director either re-designates or REJECTS.

## 2. Trigger

The IMPLEMENTER publishes a **candidate notice** on `factory/auto-enrollment-v1-implementation`. It contains:
- READY FOR INDEPENDENT QA;
- the frozen SHA;
- the Director commit it was built against;
- the WO ids it claims;
- its own test output. That output is information only and never counts toward a verdict (`CLAUDE.md` §3).

## 3. Procedure, one pass per candidate

There are no exploratory rounds. A failure is a finding, and the verdict is REJECTED. **Every candidate row and every rehearsal runs on
every candidate** (AC-5..AC-12, AC-14..AC-16; R-1..R-4), whichever WO ids it claims. A missing subject is a finding, never a skip.

1. **Checkouts, hashes and authorship.**
   - Make a fresh scratch clone at exactly the candidate SHA, plus the Director branch at the designated commit. Record both
     `git rev-parse` values.
   - Recompute the ledger's document-set and WO hashes against the designated commit.
   - Check that the candidate tree's copies of every canonical document, the WO texts and the ledger files are **byte-identical** to
     the designated commit's. Different copies make the candidate REJECTED.
   - **Authorship check:** every commit in `<designated Director commit>..<candidate SHA>` must verify (`git verify-commit`, with an
     allowed-signers file built from the ledger's `implementer_signing_key`). An unsigned, foreign-signed or Director- / verifier-signed
     product commit is a finding (S-16a, S-13).
   - From the §4 authoring-set field: no Home-computer run is in the authoring set of a work order whose commits change a path outside
     the Director-document paths (S-16). The receipt records that a signature proves the signing key, not the authoring machine.
   - Before the founder confirms the implementer key's fingerprint, the allowed-signers file is built from the public key published in
     the implementer's change request, and the receipt records that key's fingerprint. The CERTIFIED ledger entry is written only
     after the founder-confirmed fingerprint equals the one the receipt used.
   - After C-3, the candidate's trust-set source equals the bytes recorded in the Director's WO-6 revision.
2. **Isolation (S-15).**
   - Verification runs on:
     - disposable PostgreSQL (`qa/factory/local_pg.mjs`);
     - local function runtimes;
     - a **disposable Brain OS auth stack** for AC-7, R-1 and R-2: a local Supabase started by the CLI with `supabase/migrations/`
       applied at `55a15917` (including `profiles_update_self_or_admin` as in production), and the AC-7 personas seeded, including a
       self-updated `profiles.role`. The Admin API derives the role through the same calls it makes in production; a stubbed role
       check never counts;
     - a disposable clean Windows environment for R-1.
   - It writes nothing to the live legacy checkout, the live task, `runner.env`, the live plane, production, `master` or the acceptance
     machine.
   - The Director may **read** the live plane for AC-10 and AC-11.
3. **Baseline (AC-11).**
   - Check the branch refs, the legacy nodes' plane records and the checkout rule.
   - Load `BASELINE_69df2f52_EVIDENCE_ROWS.json` unchanged into a disposable plane provisioned as `69df2f52` (the verifier adds no row
     and fills no column), run the candidate migration, and re-hash with `tools/baseline_manifest.mjs`, run with
     `FACTORY_TARGET=disposable`, `FACTORY_RUNNER_PG_URL` naming that plane's non-superuser `factory_runner` login (user, password,
     port and database; `db.mjs` refuses a superuser), no other credential variable set, and `FACTORY_BASELINE_CHECKOUT` a fresh
     `69df2f52` clone after `npm ci` (never the candidate tree, never the live legacy checkout; the tools refuse any ROOT whose database
     modules and `pg` are not the `69df2f52` ones). The set hashes it prints must equal the manifest's, and the receipt records the
     tool's observed identity, which must be the disposable plane's.
4. **Static gates:**
   - `node --check`;
   - Edge `deno check`;
   - for web changes: `tsc`, `eslint`, `next build`;
   - a PowerShell parse;
   - a secret scan;
   - the **static one-engine check**: every Edge handler authenticates and calls exactly one SQL front door;
   - the **plane-conditioned-behaviour scan** (S-10): every reference in the candidate diff to `factory.plane_identity`,
     `current_database()`, `inet_server_addr()` / `inet_server_port()`, a setting, or a live-only row, other than the production-ref
     refusal, is a finding;
   - the **route / operation inventory**, which must equal S-7.
5. **Schema and privileges on the disposable plane.**
   - First provision the plane **as `69df2f52` provisions it**, including the default-privilege grant to `factory_runner`. Then apply the
     candidate's `supabase/control-plane/` SQL.
   - Read back:
     - role attributes and grants;
     - SECURITY DEFINER `search_path`;
     - `has_table_privilege('factory_runner', t, 'INSERT,UPDATE,DELETE') = false` for every authority table (S-10);
     - `has_function_privilege('factory_runner', f, 'EXECUTE') = false`, and no EXECUTE for PUBLIC, on every front door;
     - `pg_default_acl` for schema `factory`, with no default grant to `factory_runner` on the new tables;
     - `pg_auth_members` rows involving `factory_runner` equal those at `69df2f52`, and no API role is a member of `factory_runner`;
     - no column-level grant to `factory_runner` on an authority table (`has_column_privilege` and `pg_attribute.attacl`);
     - the candidate migration writes no S-16(a) binding and no computer-record field: a bound computer record seeded on the
       disposable plane is unchanged after the migration;
     - the catalog difference for AC-10: before and after the migration, `tools/live_catalog_snapshot.mjs` runs with
       `FACTORY_TARGET=disposable` as a non-superuser login the verifier creates with SELECT on every `factory` relation. The receipt
       records both `snapshot_sha256` values and the difference;
     - the seeded policy rows, which must equal contract §1 exactly.
6. **Candidate rows and rehearsals.**
   - AC-5..AC-12, AC-14..AC-16.
   - AC-9, run through the Node API **and** by calling the front doors directly. The verifier checks every OLD column of the
     compatibility matrix against the `69df2f52` source itself.
   - R-1..R-4 as in the matrix header.
7. **Certified reference suites.**
   - **The set is exact.** Each file below runs at its `69df2f52` bytes in the candidate checkout, unless a Director-ratified successor
     replaces it:
     - `qa/factory/`: `acceptance.mjs`, `acceptance_mutation_proof.mjs`, `campaign_boundary_is_crossed.mjs`,
       `dbtest_on_disposable_pg.mjs`, `dedicated_supabase_provisioning.mjs`, `denominator_cannot_shrink_silently.mjs`,
       `founder_poke_not_required.mjs`, `health_check.mjs`, `http_provider_acceptance.mjs`, `instrument_validity.regression.test.mjs`,
       `model_catalog_must_not_advertise_untested_models.mjs`, `no_silent_model_fallback.mjs`, `node_truth_acceptance.mjs`,
       `package_bootstrap_regression.mjs`, `package_bootstrap_mutation_proof.mjs`, `shared_control_plane_acceptance.mjs`,
       `tls_plane_acceptance.mjs`, `waiting_costs_no_cpu.mjs`, the disposable-plane rows of `reboot_recovery_acceptance.mjs`, and
       `factory_v1_acceptance.mjs --local-only`;
     - `scripts/factory-runner/`: every `*.test.mjs` and `*.mutation.mjs`.
   - **Modules, not suites:** `local_pg.mjs`, `shared_local_pg.mjs`, `shared_pg_worker.mjs`.
   - **Excluded by S-15** (they read or drive live state): `shared_plane_live_acceptance.mjs`, `two_machine_real.mjs`,
     `two_machine_failover.mjs`, `two_machine_scheduling.mjs`, the live-task rows of `reboot_recovery_acceptance.mjs`, and the plane rows
     of `factory_v1_acceptance.mjs`. Their semantics are proved by AC-9 and R-3.
   - **Where the reboot suites run.** `reboot_recovery_acceptance.mjs` and `factory_v1_acceptance.mjs --local-only` run only in a
     separate disposable Windows VM (never R-1's instance, which is fresh), where no `BrainOS Factory Node` task exists, and never on a
     machine that holds the live task. They are judged row by row, whatever the exit code: R9a is recorded NOT RUN (S-15), and the
     suites pass when R1-R8 and every non-GATE row other than `reboot` are OK.
   - **Environment-dependent:** RS-C6 (it reads the closed Edge worktree) is registered. Any other suite that cannot run is recorded as
     NOT RUN with its reason, and blocks CERTIFIED unless the Director registers it in the ledger event log before the run.
   - **What they prove:** the baseline semantics of the shared modules (legacy non-regression). A suite that exercises only the frozen
     raw-SQL path is never evidence for P-2 on the Node API. AC-9 proves the new runtime: each compatibility-matrix regression cites
     the certified-suite assertion or assertions it ports (file:line at `69df2f52`), and runs through the Node API against the
     candidate's front doors.
8. **Reproducible build** (S-5). The verifier builds `BrainFactorySetup.exe` and the runtime from the candidate SHA and records:
   - the production-channel artifact's digest (the PE Authenticode image hash, S-5), and separately the dev-channel digest;
   - every embedded trust-set entry as (key id, sha256 of the public key), with the channel and trust mode.

   Each channel's digest must equal that channel's digest in the candidate's release manifest. A non-reproducible build, or one with an
   unpinned input (base Node executable, tool version, network fetch), is a finding.
9. **One bounded adversarial invariant audit** over S-1..S-16 and P-1..P-10. Each finding is reproduced before it counts. It answers the
   two governance tests, both expected **NO**:
   - Can the implementer define or alter the contract it is judged against?
   - Can hostname or resource fitness create authority?
10. **Mutation checks.** Reverting one guard makes a named row fail:

    | guard reverted | row that fails |
    |---|---|
    | revocation re-check inside the transaction | R-4 / AC-4 |
    | release-signature check; pinned trust set (a manifest-named key accepted); dev-key refusal in a production-channel build; trust mode or key taken from runtime input; anti-downgrade | AC-5 |
    | checkpoint fence inside the front door | AC-9 |
    | envelope self-change; tenant / identity / agent taken from the body | AC-6 |
    | each eligibility gate, removed singly; envelope-sourced gate 6 replaced by self-report; the preference-deferral bound | AC-15 |
    | independence reduced to run-only; the authoring set reduced to the completing run; the policy floor in the front door | AC-14 |
    | the stricter-only policy guard; the legacy-privilege revocation and guard; the legacy guard on new-model and enrolled rows; a role granted to `factory_runner`, or an API role that is a member of it | AC-12 |
    | rotate or re-pair issues a new principal; certification not bound to its work order and exact provenance | AC-14 |
    | the watchdog or autostart removed; a retry that issues a new code or credential; setup that requires elevation | AC-1 (R-1) |
    | the prepared migration's manifest recompute removed, or moved before the migration's statements | AC-11 |
    | a guard or front door conditioned on plane identity | AC-9 (the static scan) |
    | a column-level grant to `factory_runner` on an authority table | AC-10, AC-12 |
    | a lapsed enrolled lock that the legacy pick treats as free | AC-9 |
    | trust material or configuration read from the certificate table | AC-5 |
    | the legacy guard failing the frozen claim when an enrolled lease has lapsed | AC-9 |
    | pairing HMAC / atomic consume / per-locator cap | AC-8 |
    | numeric priority | AC-15 |
    | the pairing secret generated deterministically | AC-8 |
    | legacy EXECUTE on a front door; the reserved-capability guard; principal minting by a node | AC-12, AC-14 |
    | the S-7 route and operation list; the `tenant_admins` condition and tier | AC-7 |

11. **Verdict:**
    - **CERTIFIED** only if every candidate row, every rehearsal, every reference suite, the authorship check and the reproducible build
      pass with evidence.
    - Otherwise **REJECTED**, with every finding: its reproduction, the violated row, and its class (`incident-to-regression`).

## 4. Receipts (append-only, content-addressed, Director-committed and signed)

- **Path:** `qa/verification/auto-enrollment-v1/<candidate-sha>/receipt-<n>.json`, plus `evidence/`.
  - No secret and no URL goes in either.
  - Text is pinned LF; evidence is pinned binary.
- **Fields:**
  - candidate SHA; the designated Director commit; the document-set hashes; WO ids;
  - the **authoring set**: commits with their verified signer, plus any Factory authoring runs and their nodes;
  - the certifying session and machine (different from every author's; S-16b), and the Director-issued verifier assignment;
  - the reproduced digests (production and dev channel) and every trust-set entry as (key id, public-key sha256), with the channel
    and trust mode;
  - UTC timestamps; the environment;
  - per row: command, persona, input, expected, actual, PASS / FAIL;
  - for the live-plane parts of AC-10 and AC-11, the Director observation records, cited by the sha256 of each Director-committed
    record;
  - findings; the verdict; the sha256 of every evidence file.
- **Who writes and commits them.** Receipts are written by the verifier session. Only the Director commits them, **signed with the
  Director signing key**, and records the receipt's sha256 in the ledger in the same commit.
- **Tamper evidence.** Receipts are never edited; a correction supersedes.
  - The Director keeps an out-of-band record of every Director-branch commit it made, outside the repository.
  - At every ledger write it verifies each Director-branch commit's signature and checks the history against that record.
  - An unsigned or foreign commit on the Director branch is a tamper finding (AC-12).
  - Branch protection is recommended to the founder.

## 5. Ledger writes (single writer: the DIRECTOR capability, signed commits)

| transition | valid only if |
|---|---|
| → BINDING (issue or revise) | issued by the DIRECTOR: the WO file, frozen by sha256, with its coverage recorded. Nothing the IMPLEMENTER writes creates or changes a binding WO |
| → IN PROGRESS, → CANDIDATE | reported by the IMPLEMENTER; the Director records the notice and designates the Director commit |
| → CERTIFIED | it cites a Director-committed receipt with verdict CERTIFIED, in which: every commit in the §3.1 range verifies against the founder-confirmed implementer key; the certifier is on a different machine from every member of the authoring set (S-16b) and holds the Director-issued verifier assignment; the hashes match; and every row the WO covers has evidence at that SHA |
| → REJECTED | it cites a receipt with verdict REJECTED |
| a resubmitted candidate | after a REJECTED or `VERIFICATION_FAILED` verdict, a new candidate is a **new SHA with different content**. Re-verifying the same SHA takes an explicit Director order |
| change-request decision | recorded by the DIRECTOR, with the reason and any WO or document revision |
| any acceptance state (incl. `PRODUCTION ACCEPTED`) | set only by the DIRECTOR, on independent acceptance receipts (C-5); never by the candidate's author |

## 6. Final acceptance (AC-1..AC-4, then AC-13)

- **Prerequisites:**
  - C-3 is decided;
  - the release under acceptance is the verifier-reproduced artifact of a CERTIFIED candidate, signed with the founder-provisioned key
    (S-5);
  - the founder-provisioned SELECT-only observer role exists (`FACTORY_OBSERVER_ENV`); the `runner.env` interim never serves final
    acceptance;
  - the founder boundaries are done: the live Factory migration, the live Edge deploy, production secrets and `tenant_admins` seeding,
    the production Brain OS deploy by PR, and re-enrollment of the existing machines (their `runner.env` and legacy task removed; S-2).
- **Where:** on the clean acceptance machine, touched for the first time here.
- **The live observer login.** Every Director read of the live plane uses a founder-provisioned SELECT-only observer role
  (`FACTORY_OBSERVER_ENV`), never an enrolled machine's credential. Until that role exists, candidate-stage live reads use the
  documented `runner.env` interim (`FACTORY_DIRECTOR_INTERIM_RUNNER_ENV=1`), read-only; final acceptance waits for the role.
- **What the Director checks, read-only:**
  - the live policy rows, which must equal contract §1;
  - the installed artifact's digest (the PE Authenticode image hash, S-5), **computed on each machine itself** with a Director
    instrument committed under `tools/` before final acceptance and run by the built-in PowerShell (nothing installed), which must
    equal the receipt's reproduced production-channel digest;
  - that the live Home computer record, and only it among non-archived records, carries the S-16(a) binding, admin-set and audited at
    its Add Computer;
  - that every final-acceptance observation record shows `current_user` = the observer role;
  - AC-5(f), repeated on the acceptance machine: a dev-key-signed artifact is offered locally to the installed runtime, and nothing is
    written to the plane.
- **How it is observed:** by the Director as receipts, from server rows, the Computers page and the on-machine digest reads above. A
  server-reported digest never substitutes for the on-machine read, and nothing is taken from the installer's report.
- **AC-13:** the Director records Factory V1 cumulatively (P-8).
- **Release states:** follow `CLAUDE.md` §7. The Director records `PRODUCTION ACCEPTED` only on independent acceptance receipts.

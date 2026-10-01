# CANDIDATE #3 — READY FOR INDEPENDENT QA

Factory V1 — Node Management + Zero-Touch Auto-Enrollment. Candidate notice of the IMPLEMENTER (VERIFICATION_SPEC §2), published on
`factory/auto-enrollment-v1-implementation`. DEV-VERIFIED by the implementer only: this notice certifies nothing, and never counts
toward a verdict.

Candidate #3 is a narrow remediation of candidate #2 (`c667367b6d0fcf02a4d575f050aaa475c644ca7b`, REJECTED): it fixes the two
findings C2-P1 and C2-S1 and changes nothing else in the product. Candidate #2 is not amended, rewritten or reused.

| field | value |
|---|---|
| State | **READY FOR INDEPENDENT QA** |
| PRODUCT CONTRACT (the Director commit it was built against) | r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03` |
| CR DISPOSITION COMMIT | `a0bb79856a7a82ea8277c7bbf3a23ad6cc0631a0` (Director, 2026-09-30). Candidate #3 files no change request |
| Candidate #3 SHA (frozen) | `95fdb85acf755f8d28fa2393165cac7fb9ca77b7` |
| Evidence / report commit | `b0aa57b85394fd8271583ac42a098f765fd516cc` (changes only `qa/implementation/auto-enrollment-v1/**`: `CANDIDATE_REPORT.md`, `INVENTORY.md`, `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/`) |
| Notice commit | the commit that adds this file; its message names the three SHAs |
| Work orders claimed | WO-1, WO-2, WO-3, WO-4, WO-5, WO-6, WO-7, WO-8, WO-9, WO-10 (WO-4's clean-machine rehearsal and every VM-only row: BLOCKED — EXTERNAL) |
| API login roles its handlers connect as (§3.3) | `factory_node_api` (Node API), `factory_admin_api` (Admin API) |
| Implementer signing identity | `implementer@brain-factory`, key `SHA256:9zUYxsZkV6MLq9dcGtiz+e3D/h0XPevf3w/cJH5QTek` (`implementer_signing_key`, CR-005). Every commit in `c7a845b6..95fdb85` (61) verifies against it: 61 of 61 `G`; the 3 of candidate #3 (`baf4e4b5..95fdb85`) are `95fdb85`, `1ff7755`, `cfb173c` |
| Director byte-identity | byte-identical to r3 over every Director-owned path (`CLAUDE.md`, `governance/`, `qa/work-orders/`, `qa/verification/auto-enrollment-v1/`, `docs/architecture/features/`, `docs/architecture/adr/`, `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md`): `git diff c7a845b6 95fdb85` names no file there; the r3 ledger document set: 23 of 23 files hash-match. Outside it, `docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml` carries the implementer's WO-10 capability-registry entry (unchanged since candidate #2) |
| Previous candidates | #2 `c667367b6d0fcf02a4d575f050aaa475c644ca7b` REJECTED (findings C2-P1, C2-S1, as the founder stated them to the implementer on 2026-10-01); #1 `412ac14e76f88fbd5e310d3e97dbf5acab2c1498` REJECTED (receipt sha256 `f94861a76699696e86160064090356eb823bc5627bba50af9f259fff4bb11b57`) |
| Production | untouched |

## C2-P1 closure evidence (MEDIUM; P-2 restart / recovery)

Evidence offered for closure. The Director closes a finding only on a verifier's receipt.

The verifier's own reproduction was not in the implementer's hands. Both findings were reproduced from the founder's statement of
them, on candidate #2's code, before any fix: the outputs are in `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/reproduction/`.

A transient or non-deterministic checkpoint refusal no longer ends the authoring run. The enrolled worker now follows the certified
rule of 69df2f52 (`scripts/factory-runner/node.mjs:522-540`): after a handler throws it sends nothing more for the run — no
completion, no release, no renewal — so the lease lapses and any eligible node resumes from the last checkpoint. A run still fails,
by name, on a failure the same input meets on every attempt: a data exception the plane's server raised, or a request the API
refused as malformed. A terminal credential refusal still stops the worker.

| what the finding required | row | result at `95fdb85` |
|---|---|---|
| the reproduction; a transient checkpoint refusal; the original node stops progressing; the lease expires; a second eligible node takes over; the stale owner cannot renew, checkpoint or complete; the new owner completes exactly once; no duplicate completion | `runtime_recovery_acceptance` TR1 (every answer of one checkpoint lost) and TR2 (a real lock wait, SQLSTATE 55P03) | 13/13 OK |
| every transient kind leaves the run to its lease; the deterministic and terminal cases are not weakened | `runtime_units` HF1–HF9 | 35/35 OK |
| the same through the Node API and through the SQL front doors directly, with the worker's own run loop | `compat_regressions`, both transports | api 36/36 OK; direct 36/36 OK |
| the compatibility matrix row | `COMPATIBILITY_MATRIX.md`: "worker failure (a thrown handler)" | 17/17 rows MIGRATED |
| each guard reverted fails a named row | mutants HFT, HFTr, HFG, HFGr, HFD, HFS, HFR, HFA, HFL, HFC, HFV, HFK, HFQ | 13 of 13 caught |

## C2-S1 closure evidence (LOW; S-10 production target normalization)

Evidence offered for closure, as above.

The Edge database module reads its URL once, in one form, and the driver is given only the host, port, user, password and database
that were read — never the URL. The production project is refused on the text and on that target; everything outside the one form is
refused (fail closed).

| what the finding required | row | result at `95fdb85` |
|---|---|---|
| percent encoding; case normalization; escaped characters; equivalent hostname forms; URL parsing differences; whitespace / wrapper representations; alternate connection-string forms: all refused, failing closed | `edge_db_tls_acceptance` T7–T9 (Deno 2.5.6, `npm:postgres@3.4.9`; `qa/factory/v1/db_target_cases.mjs`) | 10/10 OK |
| the driver is given the read target and never the URL | T6; static P4 | static 73 passed, 0 failed |
| the committed entry points connect that way, over TLS verify-full | `edge_peer_acceptance` | 8/8 OK |
| the same class in the developer migration tool | static X4b | static 73 passed, 0 failed |
| each guard reverted fails a named row | mutants DTW, DTWs, DTE, DTX, DTQ, DTA, DTL, DTU, DTP, DTC, DTT, DTN, DTD, MTT, MTE, MTC | 16 of 16 caught |

## Full developer verification summary (information only; developer runs on DESKTOP-8P5HVAO, all at `95fdb85acf755f8d28fa2393165cac7fb9ca77b7`)

- Full developer pass (`final_pass.mjs --declarations`): **PASS**, 32 of 32 steps exit 0 (static contract 73 passed, 0 failed; schema 82/82 OK; release 41/41 OK; runtime 13/13 OK; SEA regression 28 passed, 0 failed; transport contract 17/17 rows MIGRATED; Edge database 10/10 OK).
- At the candidate, outside the final pass: `runtime_units` 35/35 OK; `runtime_recovery_acceptance` 13/13 OK; `edge_boundary_acceptance` 8/8 OK; `edge_peer_acceptance` 8/8 OK; `legacy_director_acceptance --transport api` 8/8 OK; `installer_input_acceptance` 10/10 OK.
- Mutation results: v1 mutation proof **426 of 426 killed**, 0 survivors / not judged / vacuous (29 new mutants for the two findings, each caught); SEA packaging mutation proof **30 of 30 killed**; certified acceptance mutation proof **60 of 60 runnable killed** (N37x, N19 and nine acceptance.mjs mutants are baseline findings).
- Reference-suite results: the certified suites at their 69df2f52 bytes, every suite exit 0 except `campaign_boundary_is_crossed`, `scripts/factory-runner/round-state.regression.test`, `scripts/factory-runner/supervisor.injection.mutation`, each classified BASELINE FINDING or ENVIRONMENT (the same three as at candidate #2; none a candidate defect).
- Applying-role result (the migration under the live, non-superuser applying login, at the committed blobs): applying_role_plane [tree 95fdb85acf755f8d28fa2393165cac7fb9ca77b7, director c7a845b6]: 13/13 OK.
- Installer / release integrity at the candidate (after every proof): dev and production rebuilt and reproduced IDENTICAL; both rebuilds MATCH the per-channel build declarations (`provenance --check`).
- Static contract 73 passed, 0 failed (P3p GREEN on the Director's rulings); secret scan clean (0 hits); privacy scan of every blob and commit message introduced in `baf4e4b5..95fdb85` (30 scanned): 0 with text of the private records.

## Installer declarations and digests

Both installers were rebuilt from a clean checkout of `95fdb85acf755f8d28fa2393165cac7fb9ca77b7` (`build-sea.mjs`), reproduced (`verify-build.mjs`: IDENTICAL) and compared with their declarations (`provenance.mjs --check`: MATCH), at the start of the final pass and again after every proof.

| channel | source commit | digest (PE Authenticode image hash) | unsigned exe sha256 | declaration (`evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/build-declarations/`) sha256 |
|---|---|---|---|---|
| dev | `95fdb85acf755f8d28fa2393165cac7fb9ca77b7` | `132a2a62303ba897e2ddf91a62c88e4f3e3db51a7f9c6a64c91a5ce6f4e5177b` | `e1f485482300720325e2489ecd82e784bfe82bcee497a73bdaaca110ec5527df` | `d4c0ddbb3ef8bf3419193739c1e7c6cbcda03365db9359c4d57f3e69fe406365` |
| production | `95fdb85acf755f8d28fa2393165cac7fb9ca77b7` | `62630984c3ae9c6a12c1388261f772ab9e888119f653aa821374e7e132cf903d` | `e242ef756a10d6ff2dddc9e4974e7abde8a03242ee9ab8b4a963c0ca8a2a7181` | `b7431727327fa1612ef7bcadaafe4b3bf62be1e105123ac8bec51dc9b6ea093f` |

- `provenance_check.txt`: MATCH: both channels' rebuilds of 95fdb85acf755f8d28fa2393165cac7fb9ca77b7 equal the declarations in evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/build-declarations
- `verify-build_dev.txt`: IDENTICAL: e1f485482300720325e2489ecd82e784bfe82bcee497a73bdaaca110ec5527df (unsigned image), and every build-info field but the signing ones
- `verify-build_production.txt`: IDENTICAL: e242ef756a10d6ff2dddc9e4974e7abde8a03242ee9ab8b4a963c0ca8a2a7181 (unsigned image), and every build-info field but the signing ones

The declarations are the implementer's release-provenance evidence (WO-10; CR-019), not a WO-6 release manifest: no production signing key exists until the founder decides C-3, and the production trust set is empty.

## Known legitimate environment / external rows

- `campaign_boundary_is_crossed` (reference suite, non-zero exit): BASELINE FINDING: row R1 (a handler in handlers/ is not registered with the director). R1 reads only `scripts/factory-runner/handlers/` and `director-start.mjs`, byte-identical to 69df2f52 at the candidate; reproduced on a clean 69df2f52 clone for candidate #1
- `scripts/factory-runner/round-state.regression.test` (reference suite, non-zero exit): ENVIRONMENT (registered in VERIFICATION_SPEC §3.7): RS-C0 reads two worktrees that exist only on the original machine; the same at 69df2f52 on this machine
- `scripts/factory-runner/supervisor.injection.mutation` (reference suite, non-zero exit): BASELINE FINDING: 4 of 5 proven; the R-D9 anchor (`shell: true` in the SQL transport) is absent from the certified `supervisor.mjs`
- NOT RUN, by rule: `package_bootstrap_regression` fresh-clone rows and `package_bootstrap_mutation_proof --fresh` (S-15: they re-register this PC's live task); `reboot_recovery_acceptance` and `factory_v1_acceptance --local-only` (BLOCKED — EXTERNAL: VM only); `shared_plane_live_acceptance`, `two_machine_real`, `two_machine_failover`, `two_machine_scheduling` (S-15: live state).
- BLOCKED — EXTERNAL: R-1 on a clean VM and every VM-only row (no hypervisor and no Windows Sandbox on this PC); the Supabase-image PostgreSQL judging plane and a CLI-started Brain OS auth stack (no Docker on this PC). Every PostgreSQL suite ran on embedded PostgreSQL 18.
- BLOCKED — FOUNDER: C-3 (production release-signing key custody); the live migration step, the API logins, `tenant_admins`, the observer role, the Edge secrets, the function deploy, release storage, the web PR; the hosted Edge peer-address measurement (CR-015, CR-016).
- UNMEASURED until the founder's deploy: the hosted Edge runtime's limits and peer address, the platform's path prefix, postgres.js over the pooler, verify-full to the real pooler host.

## Change requests relied on (path, commit, sha256) — the same as candidate #2

| CR | path | commit | sha256 |
|---|---|---|---|
| CR-001 | `qa/work-orders/change-requests/CR-001-factory-admin-allow-list.md` | `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` | `bea0218d706f8cf0d623c8ebe022b586ecf104db8bc775acbea781eeadd36009` |
| CR-002 | `qa/work-orders/change-requests/CR-002-verification-failure-state.md` | `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` | `502fdda6fd7e342ff1602fe364650d7ad3702e7fc2d01332412a4ac2eaa1948e` |
| CR-003 | `qa/work-orders/change-requests/CR-003-founder-only-release-tier.md` | `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` | `55ced1fb68851233c723f859c167bf77e1b2641be72733a8979a7de4fb0ca2f1` |
| CR-004 | `qa/work-orders/change-requests/CR-004-installer-distribution-visibility.md` | `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` | `b8fd5368ec01732257b499c39163915615285e26ee809a12d5d27daa1711d863` |
| CR-005 | `qa/implementation/auto-enrollment-v1/change-requests/CR-005-implementer-signing-key.md` | `6719a8e9` (first filed `c838f5c9`) | `aba57d6d82a1ed76fc818de13c9cc73d2fcccfe8440c0cbaf8b75e1a7fbc44b1` |
| CR-006 | `qa/implementation/auto-enrollment-v1/change-requests/CR-006-post-v1-runner-rotation.md` | `8f740cccd4ff772c34e3dcec3129e6a7dfd81ee5` | `d81488d95a3e052807d24efd3959463e06e489ae9301256eeaad04f35934ff69` |
| CR-021 | `qa/implementation/auto-enrollment-v1/change-requests/CR-021-fail-closed-checks-plane-scan-class.md` | `8f740cccd4ff772c34e3dcec3129e6a7dfd81ee5` | `759365d3b3ce1d241cc7ae21ba1f116981680a59aed0116f69b58db97a828cc0` |
| CR-022 | `qa/implementation/auto-enrollment-v1/change-requests/CR-022-plane-scan-literals-and-engine-test.md` | `8f740cccd4ff772c34e3dcec3129e6a7dfd81ee5` | `96897e551a4b493a0c6e9843fd082df6ba541029f67dadb986d0fbd2406c39f0` |
| CR-026 | `qa/implementation/auto-enrollment-v1/change-requests/CR-026-founder-step-3-guard-identity-reads.md` | `8f740cccd4ff772c34e3dcec3129e6a7dfd81ee5` | `6b145aab6c9c172dc4654c5249ab0a14c3e28f3a3e4c213dd0c2891c40dac7a0` |

CR-001..CR-004 were filed on the first contract branch (`factory/auto-enrollment-v1-contract`, still on the remote); reading them
needs that branch. The candidate relies on none of CR-007..CR-020 or CR-023..CR-025: each is recorded in `a0bb7985` as its
r3-conforming reading, and the candidate keeps the r3 behaviour.

Under CR-021 the developer inventory proposes the same class as before for the tests `_shared/db.ts` now makes on its own database
URL (17 where candidate #2 made 6; each can only refuse). That is a proposal; the verifier classes each hit.

## Finding-disposition summary

- 90 records: the 2 findings of candidate #2's verification (C2-P1, MEDIUM; C2-S1, LOW) and the 88 of candidate #1's (the 87 of the `412ac14` verification and the consolidated F-1). Every record has a disposition; none OPEN, PARTIAL or pending.
- The two candidate #2 findings: C2-P1 — FIX + regressions - CLOSED at developer level; C2-S1 — FIX + regressions - CLOSED at developer level; the same class fixed in the developer migration tool. "CLOSED at developer level" is the implementer's state; only the Director closes a finding, on a verifier's receipt.
- The 88 earlier records keep the dispositions candidate #2 gave them (no row changed). By state, all 90: 74 FIXED — CLOSED at developer level; 6 REFUTED (acknowledged); 2 CLOSED BY DIRECTOR RULING (no code change); 4 FIXED, with a VM half BLOCKED — EXTERNAL (R-1 clean VM); 2 FIXED locally, with the hosted measurement BLOCKED — FOUNDER (deploy); 2 ENVIRONMENT (acknowledged; BLOCKED — EXTERNAL).
- The five BLOCKER groups: F-1 (F-1, L7-28, L1-F11, L6-5); B-2 (L1-F1, L6-X1, L1-F2, L6-X2, L1-F7); B-3 (L2-F2, L3-F2, L4-F5, L6-1); B-4 (L1-F5, L2-F1, L6-X3); B-5 (L4-F1) — all resolved.
- The 26 MAJOR records, each dispositioned: 20 FIXED — CLOSED at developer level; 4 FIXED, with a VM half BLOCKED — EXTERNAL (R-1 clean VM) (L3-F1, L4-F4, L7-17, L4-F3); 2 FIXED locally, with the hosted measurement BLOCKED — FOUNDER (deploy) (L2-F4, L3-F4).
- Stated residuals, named by ID only here and sent privately: L2-F3, L3-F2, L3-F3, L3-F7, L3-F9, L4-F1, L4-F6, L4-F10, L7-10.

## Not part of candidate #3

- The Brain OS `profiles` S1 finding and its vectors (a separate track; the Factory stays fenced from it by `tenant_admins`).
- The m6 BYPASSRLS verifier / specification observation.
- Artifact Relay V0 (a separate bootstrap capability; no file of it is in this branch).

## Test output

The implementer's test output is committed in `b0aa57b85394fd8271583ac42a098f765fd516cc` under `qa/implementation/auto-enrollment-v1/evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/`, with
`CANDIDATE_REPORT.md`. It is information only and never counts toward a verdict (`CLAUDE.md` §3; VERIFICATION_SPEC §2).

Under ledger rule 3 (founder text II.16), the per-record regression mapping of candidate #1's records, the measured detail of stated
residuals and one same-class observation outside the candidate's authority go to the Director privately, through the founder.

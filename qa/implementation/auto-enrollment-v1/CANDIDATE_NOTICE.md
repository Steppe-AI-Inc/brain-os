# CANDIDATE #2 — READY FOR INDEPENDENT QA

Factory V1 — Node Management + Zero-Touch Auto-Enrollment. Candidate notice of the IMPLEMENTER (VERIFICATION_SPEC §2), published on
`factory/auto-enrollment-v1-implementation`. DEV-VERIFIED by the implementer only: this notice certifies nothing, and never counts
toward a verdict.

| field | value |
|---|---|
| State | **READY FOR INDEPENDENT QA** |
| Candidate #2 SHA (frozen) | `c667367b6d0fcf02a4d575f050aaa475c644ca7b` |
| Evidence / report commit | `d0cbf11cf5c0d627eb8486d6d347c0ec37b0fb88` (adds only `qa/implementation/auto-enrollment-v1/**`: `CANDIDATE_REPORT.md`, `INVENTORY.md`, `evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/`) |
| Product contract (the Director commit it was built against) | r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03` |
| CR-disposition commit | `a0bb79856a7a82ea8277c7bbf3a23ad6cc0631a0` (Director, 2026-09-30) |
| Work orders claimed | WO-1, WO-2, WO-3, WO-4, WO-5, WO-6, WO-7, WO-8, WO-9, WO-10 (WO-4's clean-machine rehearsal and every VM-only row: BLOCKED — EXTERNAL) |
| API login roles its handlers connect as (§3.3) | `factory_node_api` (Node API), `factory_admin_api` (Admin API) |
| Implementer signing identity | `implementer@brain-factory`, key `SHA256:9zUYxsZkV6MLq9dcGtiz+e3D/h0XPevf3w/cJH5QTek` (`implementer_signing_key`, CR-005). Every commit in `c7a845b6..c667367` (56) verifies against it: 56 of 56 `G` |
| Director documents | byte-identical to r3 over every Director-owned path (`CLAUDE.md`, `governance/`, `qa/work-orders/`, `qa/verification/auto-enrollment-v1/`, `docs/architecture/features/`, `docs/architecture/adr/`, `FEATURE_COMPLETENESS_CONTRACT.md`); the r3 ledger document set: 23 of 23 files hash-match. Outside it, `docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml` carries the implementer's WO-10 capability-registry entry |
| Previous candidate | `412ac14e76f88fbd5e310d3e97dbf5acab2c1498` REJECTED (receipt sha256 `f94861a76699696e86160064090356eb823bc5627bba50af9f259fff4bb11b57`) |
| Production | untouched |

## Change requests relied on (path, commit, sha256)

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

The candidate relies on none of CR-007..CR-020 or CR-023..CR-025: each is recorded in `a0bb7985` as its r3-conforming reading, and the
candidate keeps the r3 behaviour.

## Regression summary (information only; developer runs on DESKTOP-8P5HVAO)

- Full developer pass (`final_pass.mjs --declarations`): **PASS**, 32 of 32 steps exit 0 (static contract 72 passed, 0 failed; schema 82/82 OK; release 41/41 OK; runtime 13/13 OK; SEA regression 28 passed, 0 failed; transport contract 16/16 rows MIGRATED).
- v1 mutation proof: **397 of 397 killed**, 0 survivors; SEA packaging mutation proof: **30 of 30 killed**; certified acceptance mutation proof: **60 of 60 runnable killed** (N37x, N19 and nine acceptance.mjs mutants are baseline findings).
- Certified reference suites at their 69df2f52 bytes: every suite exit 0 except `campaign_boundary_is_crossed`, `scripts/factory-runner/round-state.regression.test`, `scripts/factory-runner/supervisor.injection.mutation`, each classified BASELINE FINDING or ENVIRONMENT (reproduced at 69df2f52; none a candidate defect).
- Applying-role (non-superuser) plane at the committed blobs: applying_role_plane [tree c667367b6d0fcf02a4d575f050aaa475c644ca7b, director c7a845b6]: 13/13 OK.
- Installer / release integrity at the candidate (stage 7, after every proof): dev and production rebuilt and reproduced IDENTICAL (unsigned images `54f2e84c…` and `a9bd7ac8…`); both rebuilds MATCH the per-channel build declarations (`provenance --check`).
- Static contract 72 passed, 0 failed (P3p GREEN on the Director's rulings); secret scan clean; privacy scan of every new public blob since `8f740cc`: no overlap with the private records (its three keyword flags, all in the evidence, are row names of certified 69df2f52 suites already public in candidate #1's evidence).

## Finding-disposition summary

- 88 records (the 87 of the `412ac14` verification and the consolidated F-1); every record has a disposition; none OPEN, PARTIAL or pending.
- By state: 72 FIXED — CLOSED; 6 REFUTED (acknowledged); 2 CLOSED BY DIRECTOR RULING (no code change); 4 FIXED, with a VM half BLOCKED — EXTERNAL (R-1 clean VM); 2 FIXED locally, with the hosted measurement BLOCKED — FOUNDER (deploy); 2 ENVIRONMENT (acknowledged; BLOCKED — EXTERNAL).
- The five BLOCKER groups: F-1 (F-1, L7-28, L1-F11, L6-5); B-2 (L1-F1, L6-X1, L1-F2, L6-X2, L1-F7); B-3 (L2-F2, L3-F2, L4-F5, L6-1); B-4 (L1-F5, L2-F1, L6-X3); B-5 (L4-F1) — all resolved.
- The 26 MAJOR records, each dispositioned: 20 FIXED — CLOSED; 4 FIXED, with a VM half BLOCKED — EXTERNAL (R-1 clean VM) (L3-F1, L4-F4, L7-17, L4-F3); 2 FIXED locally, with the hosted measurement BLOCKED — FOUNDER (deploy) (L2-F4, L3-F4).
- Stated residuals, named by ID only here and sent privately: L2-F3, L3-F2, L3-F3, L3-F7, L3-F9, L4-F1, L4-F6, L4-F10, L7-10.

## Test output

The implementer's test output is committed in `d0cbf11cf5c0d627eb8486d6d347c0ec37b0fb88` under `qa/implementation/auto-enrollment-v1/evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/`, with
`CANDIDATE_REPORT.md`. It is information only and never counts toward a verdict (`CLAUDE.md` §3; VERIFICATION_SPEC §2).

Under ledger rule 3 (founder text II.16), the mechanisms of the records, the per-record regression mapping and the measured detail of
stated residuals went to the Director privately, through the founder.

# SUCCESSOR CANDIDATE (#4) — READY FOR INDEPENDENT QA

Factory V1 — Node Management + Zero-Touch Auto-Enrollment. Candidate notice of the IMPLEMENTER (VERIFICATION_SPEC §2), published on
`factory/auto-enrollment-v1-implementation`. Developer-certified by the implementer only (one L4 run at the frozen SHA): this
notice certifies nothing, and never counts toward a verdict.

The successor of candidate #3 (`95fdb85acf755f8d28fa2393165cac7fb9ca77b7`, CERTIFIED by the Director's record; not modified). It
implements the founder's decisions that Director r6, r7 and r8 made canonical: the Factory-managed release signer; the founder's
authorization of an update by entering the existing Brain OS password again; staging by the Director; and every computer taking a
published release by itself. It carries the live trust set WO-6 revision 5 records, and nothing else.

| field | value |
|---|---|
| State | **READY FOR INDEPENDENT QA** |
| PRODUCT CONTRACT (the Director commit it was built against) | r8 `3745a281acf8475058c2420b2c7a402efd675ddd` (WO-6 revision 5, sha256 `1ffbcca2867f7b4febfaea8beea47219fddf38359142345596f5654257ab8ef7`) |
| CR DISPOSITION COMMIT | `3745a281acf8475058c2420b2c7a402efd675ddd` (the Director's ledger at r8: CR-027 and CR-028 CANONICALIZED). The successor files no further change request |
| Successor SHA (frozen) | `c353e8953338f855a134a95787a075e8e93cfa01` |
| Evidence / report commit | `328d7feb336371371c6dfd5f39ed8f9729168e68` (changes only `qa/implementation/auto-enrollment-v1/**`: `CANDIDATE_REPORT.md`, `INVENTORY.md`, `MIGRATION_PRIVILEGES.md`, `IMPLEMENTATION_PROPOSAL.md`, `evidence/c353e8953338f855a134a95787a075e8e93cfa01/`) |
| Notice commit | the commit that adds this file; its message names the three SHAs |
| Work orders claimed | WO-6 at revision 5, and WO-1 to WO-5 and WO-7 to WO-10 as candidate #3 claimed them (WO-4's clean-machine rehearsal and every VM-only row: BLOCKED — EXTERNAL) |
| API login roles its handlers connect as (§3.3) | `factory_node_api` (Node API), `factory_admin_api` (Admin API). `factory-release-stage` connects to no database |
| Implementer signing identity | `implementer@brain-factory`, key `SHA256:9zUYxsZkV6MLq9dcGtiz+e3D/h0XPevf3w/cJH5QTek` (`implementer_signing_key`, CR-005). Every commit in the VERIFICATION_SPEC §3.1 range `3745a281..c353e89` (89) verifies against it: 89 of 89 `G`. The successor's own commits are the first-parent line `047ba310..c353e89`: 26 commits, 26 of 26 `G` against it (three of them are the signed merges of Director r6, r7 and r8). The 7 commits that enter through those merges are the Director's, 7 of 7 `G` against the Director key `SHA256:JuFaA95213JN0+3f/RAlUOAOK7G42IukX/qQiWeIALE` |
| Director byte-identity | byte-identical to r8 over every Director-owned path (`CLAUDE.md`, `governance/`, `qa/work-orders/`, `qa/verification/auto-enrollment-v1/`, `docs/architecture/features/`, `docs/architecture/adr/`, `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md`): `git diff 3745a281 c353e89` names no file there; the r8 ledger document set: 24 of 24 files hash-match; `WO-6.md` is revision 5 (sha256 `1ffbcca2867f7b4febfaea8beea47219fddf38359142345596f5654257ab8ef7`). Outside those paths, `docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml` carries the implementer's WO-10 capability-registry entries, extended here with the successor's homes, surfaces and suites |
| Release-signer bootstrap | `scripts/factory-control-plane/release_signer.sql`, sha256 `333536de52fdfcbf7a5b51a399f142cbae5af35b444d78f10c70c6dd7718450f` (the judged file; applied live by the founder on 2026-10-04; unchanged) |
| Live trust set in the source | exactly WO-6 revision 5's entry: `ed25519:d3ed1390c6e6c367006a4fc5bdecd31d6cfe34823d5eeda7b9341656d962c81e` / `4iR7Ra54qciQ5xT-xnXEF1E90x415CEIokAMMvZdkrU`; no other key |
| Production installer | digest (PE Authenticode image hash) `02c6abfc135700f28dccd32fa19c958d2dfedc6c6d89e312d07e6e1ae981dd96`; unsigned exe sha256 `6d751860d2cade142c234184a61c6d6b6d06f03dbdd7bcc71185ff15b51ad0df`; runtime bundle sha256 `35bdc03cf4ac8f6b53471dfd344897b4c2dd6d00ae8ad889a8e33e79c1e7a91d` |
| Dev installer | digest `f24f37437d739df7471f31932a0df6db1ccdc32f25275271da317683aaa5dc11`; unsigned exe sha256 `dd4bbb5f57834adc5a6856e4dc544c487395bd92cad9a5366819cd87fa8399f5`; runtime bundle sha256 `8b8752825d7e702bea014108adea7e6e8cf295b8dad56fd423c4528500f9dc5d` |
| Previous candidates | #3 `95fdb85acf755f8d28fa2393165cac7fb9ca77b7` CERTIFIED (Director ledger commit `3615366eecbd19d8904839c697dca92650a6376c`); #2 `c667367b6d0fcf02a4d575f050aaa475c644ca7b` REJECTED; #1 `412ac14e76f88fbd5e310d3e97dbf5acab2c1498` REJECTED |
| Production | untouched by the implementer |

## What the verifier may want first

- The changed surfaces and the rows that hold them: `CANDIDATE_REPORT.md`, "What changed since candidate #3".
- What WO-6 revision 5 asks the report to include, the AC-5 (o), (p), (q), (r) cases with the developer rows and the cases that
  have no developer row: `CANDIDATE_REPORT.md`, "What WO-6 revision 5 asks this report to include".
- The update-authorization requirement, row by row: `CANDIDATE_REPORT.md`, "The update-authorization requirement".
- The stolen-session password-change question is **SIDE FINDING — DEFERRED** by the founder's ruling of 2026-10-04. Its probe is in
  the tree and was not run; no test account was created; no Auth setting was changed.

## Full developer verification summary (information only; developer runs on DESKTOP-8P5HVAO, all at `c353e8953338f855a134a95787a075e8e93cfa01`)

- Full developer pass (`final_pass.mjs --declarations`): 36 of 36 steps passed (exit 0 with their result line) (static contract 73 passed, 0 failed).
  This stage ran twice. Its first attempt passed 35 of 36 steps and stopped on this PC's environment, not on the candidate: a
  reusable baseline checkout that `manifest_rehearsal` keeps in the temporary folder had been emptied by Windows' Storage Sense
  clean-up 22 minutes before the run. Nothing of the candidate changed and the SHA is the same. The first attempt's outputs are in
  `evidence/c353e8953338f855a134a95787a075e8e93cfa01/final.attempt-1/`; `STAGES.md` records both; the report's FOUND section has the detail.
- Mutation results: v1 mutation proof **431 of 431 killed**; SEA packaging mutation proof **30 of 30 killed**; certified acceptance
  mutation proof **60 of 60 runnable killed** (N37x, N19 and nine `acceptance.mjs` mutants are baseline findings, unchanged). The
  successor's new guards carry no planted mutant (the Director's ledger records that the founder's assignment excludes new §3.10
  mutation rows for the successor); they are held by acceptance rows and by negative checks run by hand.
- Reference-suite results: the certified suites at their 69df2f52 bytes; non-zero exits: `campaign_boundary_is_crossed`, `scripts/factory-runner/round-state.regression.test`, `scripts/factory-runner/supervisor.injection.mutation`, each classified BASELINE
  FINDING or ENVIRONMENT, the same as at candidates #2 and #3; none is a candidate defect.
- Applying-role result (the migration under the live, non-superuser applying login, at the committed blobs): applying_role_plane [tree c353e8953338f855a134a95787a075e8e93cfa01, director 3745a281]: 14/14 OK.
- Installer / release integrity at the candidate: dev and production rebuilt and reproduced IDENTICAL, and both rebuilds MATCH the
  per-channel build declarations (`provenance --check`), three times: at the start of the final pass, in stage 7 while the last
  packaging-mutation batch was still running, and in stage 7b after every proof had ended.

Not verified here, and stated in the report: the hosted platform (Edge limits, the Storage API, the platform's own secret store, the
installer hashed inside the Edge function at Confirm), real Brain OS Auth, a clean machine. Those are the verifier's planes and the
founder's post-deploy live acceptance.

## Where to read

| what | where |
|---|---|
| The frozen successor | `git checkout c353e8953338f855a134a95787a075e8e93cfa01` on `factory/auto-enrollment-v1-implementation` |
| The report | `qa/implementation/auto-enrollment-v1/CANDIDATE_REPORT.md` at `328d7fe` |
| The evidence | `qa/implementation/auto-enrollment-v1/evidence/c353e8953338f855a134a95787a075e8e93cfa01/` at `328d7fe` (`STAGES.md` is the run's ledger) |
| Founder steps (prepared, not executed) | `qa/implementation/auto-enrollment-v1/FOUNDER_PREPARED_STEPS.md` |


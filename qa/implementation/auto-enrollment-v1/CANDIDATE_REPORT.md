# Factory V1 — Node Management + Zero-Touch Auto-Enrollment: successor candidate (#4) report (implementer)

| | |
|---|---|
| State | **READY FOR INDEPENDENT QA** (developer-certified by the implementer at the frozen SHA in one L4 run, whose first stage ran twice: FOUND; never self-certified) |
| Candidate SHA (frozen) | `c353e8953338f855a134a95787a075e8e93cfa01` on `factory/auto-enrollment-v1-implementation` |
| Evidence / report commit | the commit that adds this file (it changes only `qa/implementation/auto-enrollment-v1/**`; no code) |
| Product contract (Director commit built against) | r8 `3745a281acf8475058c2420b2c7a402efd675ddd` (WO-6 revision 5). Director r6 `7f8edf2c703f89799b62b3106c3d6d7397b25b3c` and r7 `f6ec0bf3ca01443121fa09644213ae9214f78ba5` canonicalized CR-027 and CR-028; r8 records the live release signer's public key |
| CR-disposition record | the Director's ledger at r8 (the same commit) |
| Previous candidates | #3 `95fdb85acf755f8d28fa2393165cac7fb9ca77b7`: CERTIFIED (the Director's record, ledger commit `3615366eecbd19d8904839c697dca92650a6376c`). It is not modified: the successor is new commits on top of its notice commit `047ba310`. #2 `c667367b` and #1 `412ac14e`: REJECTED, immutable |
| Baseline | `69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6` (untouched) |
| Implementer signing key | `SHA256:9zUYxsZkV6MLq9dcGtiz+e3D/h0XPevf3w/cJH5QTek` (`implementer_signing_key`, CR-005). Every commit in the VERIFICATION_SPEC §3.1 range `3745a281..c353e89` (89) verifies against it: 89 of 89 `G`. The successor's own commits are the first-parent line `047ba310..c353e89`: 26 commits, 26 of 26 `G` against it (three of them are the signed merges of Director r6, r7 and r8). The 7 commits that enter through those merges are the Director's, 7 of 7 `G` against the Director key `SHA256:JuFaA95213JN0+3f/RAlUOAOK7G42IukX/qQiWeIALE` |
| Director documents | byte-identical to r8 over every Director-owned path (`CLAUDE.md`, `governance/`, `qa/work-orders/`, `qa/verification/auto-enrollment-v1/`, `docs/architecture/features/`, `docs/architecture/adr/`, `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md`): `git diff 3745a281 c353e89` names no file there; the r8 ledger document set: 24 of 24 files hash-match; `WO-6.md` is revision 5 (sha256 `1ffbcca2867f7b4febfaea8beea47219fddf38359142345596f5654257ab8ef7`). Outside those paths, `docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml` carries the implementer's WO-10 capability-registry entries, extended here with the successor's homes, surfaces and suites |
| API login roles (§2, §3.3) | unchanged: `factory_node_api` (the Node API) and `factory_admin_api` (the Admin API). The new function `factory-release-stage` holds no database login: it reads and writes release storage only |
| Migration | changed since candidate #3 in `000_preconditions_roles.sql`, `060_releases.sql`, `220_admin_releases_policies_work.sql`, `290_admin_grants.sql`; composed sha256 `2989ad8443cdbd23985fead716ac2434ca0481eefe768d29284e54852aead029`; as the step the Director instrument builds, sha256 `9a5414dda882e9d06b7aa253e3d53caae297685ae39b972fb362c7e9b5a9f48b` |
| Release-signer bootstrap | `scripts/factory-control-plane/release_signer.sql`, sha256 `333536de52fdfcbf7a5b51a399f142cbae5af35b444d78f10c70c6dd7718450f`: the file the verifier judged (Stage A) and the founder applied to the live plane on 2026-10-04 (WO-6 revision 5). Unchanged since `07140dd` |
| Live trust set | `scripts/factory-runner/enrolled/trust/production.json` holds exactly WO-6 revision 5's one entry: key id `ed25519:d3ed1390c6e6c367006a4fc5bdecd31d6cfe34823d5eeda7b9341656d962c81e`, public key `4iR7Ra54qciQ5xT-xnXEF1E90x415CEIokAMMvZdkrU` |
| Production installer at this SHA | digest (PE Authenticode image hash) `02c6abfc135700f28dccd32fa19c958d2dfedc6c6d89e312d07e6e1ae981dd96`; unsigned exe sha256 `6d751860d2cade142c234184a61c6d6b6d06f03dbdd7bcc71185ff15b51ad0df`; runtime bundle sha256 `35bdc03cf4ac8f6b53471dfd344897b4c2dd6d00ae8ad889a8e33e79c1e7a91d` |
| Production | **untouched by the implementer.** No migration, no bootstrap, no Edge deploy, no secret, no `master` push, no live plane write. The founder applied the signer bootstrap; nothing else of this candidate is on a live plane. The live legacy checkout and task were never touched |

Candidate #3 is certified and cannot release: its production installer pins no release-signing key, so it refuses every release
(`key_outside_trust_set`), and its contract had the founder hold a signing key. The founder decided otherwise (founder text II.18,
II.19; Director r6 to r8). The successor implements that decision and nothing else:

- **the Factory signs** with a key the live plane generated itself and nobody holds (the release signer);
- **the founder authorizes an update by entering the existing Brain OS password again**, on Brain OS → Factory → Update, under the
  existing founder-only authority; no new role, no key, no command;
- **the Director stages each certified release**, under the Director's own signature; staging can never publish;
- **every computer takes a published release by itself**, through the unchanged upgrade gate.

Everything below is developer verification by the implementer on DESKTOP-8P5HVAO. Every PostgreSQL suite ran on embedded
PostgreSQL 18 with a stand-in for the platform's secret store, and Brain OS is a stub: a stubbed Brain OS never counts for acceptance
(VERIFICATION_SPEC §3 (2)). Independent acceptance, and every row marked INDEPENDENT or BLOCKED below, belong to the verifier, the
Director and the founder.

## FOUND / ROOT CAUSE / SYSTEMIC IMPACT / FIXED / TESTED / PRODUCTION / BLOCKERS

**FOUND.**
- **What the successor exists for.** With an empty production trust set no live release can exist, and the certified update path
  ended in a key ceremony by hand. Decided by the founder; canonical in WO-6 revisions 3 to 5.
- **In the successor's own code, before it was published** (an independent read of the signer and the authorization path, and
  that reviewer's bounded confirmation of the fixes, 2026-10-03; each fixed before the proposal was published):
  - the signer's seed, kept whole in the platform's secret store, was readable by `service_role` (the platform's own grant);
  - a production release could still be published through the older `publish-release` action without a password entry;
  - `authorize-update` answered `already` for a release another path had recorded, with the manifest that path's caller supplied;
  - any refusal of the password check was named "wrong password".
- **Against the Director's r7 text** (reconciled 2026-10-04): the page, not the Admin API, checked the staged installer's digest; an
  implementer-authored command took the Director's key to stage; a staging statement sent again received an upload address.
- **Before the freeze, in the test tooling and the candidate's records, not in product code** (2026-10-05; commits `ced1751`,
  `312eae4`, `c353e89`):
  - one mutant's run of the release suite ended after 15 seconds with exit status 0 and no output at all. The mutation proof did
    not count it as a kill, which is what showed it. Run again with its output kept, the mutant is killed (exit 1; the six expected
    rows fail), and at the frozen SHA the proof kills it (EX, `evidence/c353e8953338f855a134a95787a075e8e93cfa01/v1_mutation/v1_mutation_release.txt`). But the final
    pass judged a step by its exit status alone: a suite that never ran its rows would have been written down as passed;
  - the mutation proof's clone did not carry the Director's `WO-6.md`, which the two release suites read: their controls could not
    run there, so none of their 45 mutants would have been judged;
  - the staging suite passed its seven rows and then aborted at exit (it called `process.exit()` while its HTTP servers were
    closing), which the final pass counts as a failed step;
  - `COMPATIBILITY_MATRIX.md` still stated the previous migration's sha256, and the transport contract refuses a matrix that is
    not the generated one;
  - the inventory generator named its inputs one by one, so the inventory would have left out the signer's objects, the
    release-stage function and the Update route; the capability registry did not name the successor's surfaces;
  - no suite loaded the Factory Update page in the web app (now `web_computers_acceptance` W7 to W9);
  - a first run of the release suite read the installers candidate #3's run had left in `dist/` (built at `95fdb85`, empty trust
    set) and failed R-f/k, R-k0 and R-h. Against installers built at the commit it is 41/41. Nothing was changed for this: the L4
    run builds both installers first.
- **During the L4, in this PC's environment, not in the candidate** (2026-10-05). Stage 1's first attempt failed one step of 36:
  `manifest_rehearsal` could not use the reusable baseline checkout it keeps in the user's temporary folder (`git checkout`: "not a
  git repository"). Windows' Storage Sense clean-up had run on this PC 22 minutes before the L4 began and removed that directory's
  older files. The same step had passed twice that day, on the same suite and migration bytes. The emptied directory was removed, and
  stage 1 ran again
  from its first step at the same SHA, with the run's temporary folder outside the one Windows cleans: 36 of 36 steps passed (exit 0 with their result line). Nothing of the
  candidate changed. Attempt 1's outputs are kept in `evidence/c353e8953338f855a134a95787a075e8e93cfa01/final.attempt-1/`, and `STAGES.md` records both.
  By the lane's timing, that clean-up started within seconds of the silent run above. That it caused it is likely; it is not shown.

**ROOT CAUSE (classes).**
- **A secret reachable through a grant its holder cannot revoke.** The platform grants its secret store to `service_role`; the
  applying login cannot take that away. A whole seed in the store was therefore outside the boundary.
- **A second path to the same effect that does not carry the first path's condition.** Two actions publish a production release;
  only one asked for the password entry.
- **An answer built from what a caller supplied.** `already` compared values, not who signed.
- **A check made one layer away from the authority that relies on it.** The digest check sat in the web page; the Admin API signed
  on the page's word.
- **A suite that reads a file its harness does not carry.** The mutation proof runs each suite in a sparse clone.
- **A record generated from the source and not generated again when the source changed; a tool that names its inputs instead of
  reading them.** The compatibility matrix, the inventory, the final pass's own step list.
- **A result read from one signal where it takes two.** The staging suite said 7/7 and aborted: a summary line without the exit
  status. A run that ended 0 without a line would have passed: the exit status without the summary line. (How a suite can end 0
  in silence: its disposable database is awaited before its own error handling, and the database library ends a process whose
  event loop empties with code 0. Reproduced. Which wait stayed open in that one run is not established.)
- **A reusable cache kept in a folder the operating system empties.** `manifest_rehearsal`'s baseline checkout.

**SYSTEMIC IMPACT.**
- The seed is stored nowhere: it is the SHA-256 of two random parts held under different privileges, and only a login that holds
  both can derive it. `release_signer_acceptance` RS7 reads this per role, RS9 with each part replaced or removed.
- One definition of a fresh password entry (`factory._fresh_password`, `factory._entry_unused`) serves both publishing actions: one
  entry, one release, across both (`update_authorization_acceptance` UA5, UA11).
- `already` is answered only when the signer, asked again for the same four values, gives the very signature on record; anything
  else is `already_published`. Nothing a caller supplied is answered or placed in release storage (UA11).
- The Admin API itself reads the Director-signed staged statement and hashes the installer at the staged path before the front
  door is called, and the front door refuses whatever the Admin API does not report as staged (`release_stage_acceptance` SG4;
  UE5, UA12). The page's own check stays, as the earlier of two.
- Before the freeze every affected suite and static gate ran alone, under the candidate's own isolation, against installers built
  at the commit, and its exit status was read; every suite's control ran inside the mutation proof's clone; and the planted mutants
  that sit in files the successor changed ran. At the frozen SHA every lane begins with its control: 431 of 431 mutants judged, none
  skipped.
- The inventory generator reads the signer file, every function of `config.toml` and the Update route; the final pass runs the
  three new suites and `gate_acceptance` (which now holds the automatic take), checks the third Edge function and lints the Update
  page (35 steps, 36 with the declarations check), and
  counts a step as passed only when it exits 0 and printed its result line. The mutation proofs already judged that way.
- Not changed after the freeze: `manifest_rehearsal` still keeps its baseline checkout in the temporary folder and does not rebuild
  one that was emptied (a side finding, below).

**FIXED.** In the implementer's commits on top of candidate #3's notice commit `047ba310` ("What changed since candidate #3" below).

**TESTED.** One L4 run at `c353e89` (its first stage twice: above): the final developer pass (36 of 36 steps passed (exit 0 with their result line)), the mutation proofs (v1 431 of 431 killed, SEA packaging
30 of 30, the certified acceptance proof 60 of 60), the certified reference suites, the applying-role plane (applying_role_plane [tree c353e8953338f855a134a95787a075e8e93cfa01, director 3745a281]: 14/14 OK) and the
installer integrity checks. Results below; evidence in `evidence/c353e8953338f855a134a95787a075e8e93cfa01/`.

**PRODUCTION.** Untouched by the implementer. The founder applied the release-signer bootstrap on 2026-10-04. Every remaining
founder action is prepared in `FOUNDER_PREPARED_STEPS.md` and none is executed.

**BLOCKERS.**
- **INDEPENDENT:** this candidate's verification and certification. Nothing here is acceptance.
- **BLOCKED — FOUNDER** (after certification; prepared, not executed): the live migration step, the API logins, `tenant_admins`,
  the observer role, the Edge secrets, the deploy of the three functions (`ALLOW_FUNCTIONS_DEPLOY=1?`), release storage, the web PR
  into `master`; the hosted Edge peer-address measurement (CR-015, CR-016).
- **BLOCKED — EXTERNAL:** R-1 on a clean VM and the VM-only reference suites (no hypervisor and no Windows Sandbox on this PC); the
  Supabase-image PostgreSQL judging plane and a CLI-started Brain OS auth stack (no Docker on this PC).
- **DIRECTOR:** none open. CR-027 and CR-028 are canonicalized; the successor files no further change request.

## What WO-6 revision 5 asks this report to include

**1. The manifest format and key-id model.**
- A manifest is `{ v: 1, channel, version, source_sha, digest, key_id, receipt_sha256, signature }`. `digest` is the PE Authenticode
  image hash of the installer (S-5); `receipt_sha256` is the hash of the Director receipt that certified the candidate.
- The signature is Ed25519 (RFC 8032) over the canonical encoding: the seven fields other than `signature`, as JSON with sorted
  keys (`scripts/factory-runner/enrolled/release.mjs` `canonicalManifestBytes`), base64url without padding.
- A key id is `ed25519:` followed by the lowercase hex SHA-256 of the 32-byte public key (`keyIdOf`): bound to its key one-to-one.
  A trust-set entry is (key id, public key); the build refuses an entry that is not bound, a repeated key id, a dev key in the
  production set and a non-dev key in the dev set (`release_trust_unit` U3, U5, U5b; `sea_package_regression` B23, B24).
- The release signer builds the manifest itself from a release's version, source SHA, digest and receipt sha256
  (`factory_signer.sign_release`), and a node parses it back to exactly those values (`update_authorization_acceptance` UA1, UA6;
  `release_signer_acceptance` RS5).

**2. The verification point in the start path.**
- The supervisor verifies the installed release before it starts anything: `scripts/factory-runner/enrolled/supervisor.mjs`
  `verifyInstalled` reads `current.json`, the manifest and the exe's own bytes, and calls `verifyRelease` against the trust set
  fixed in the artifact and the delivered revocations (`release_acceptance` R-k2, R-k4, R-t).
- Setup verifies the release it carries before any request (`setup.mjs`; R-k1), and on an enrolled home it passes the same gate as
  an upgrade (R-B5a to R-B5d).
- Every offered release, an automatic take included, passes the one gate `upgrade.mjs` `gateOffer`: fresh plane state, then
  `verifyRelease`, then `releaseGate` (no downgrade without an adopt; only a published or adopted release).

**3. Each refusal case** (`release_acceptance` at `c353e89`: 41/41 OK; `release_trust_unit`: 8/8 OK).

| case | refused as | rows |
|---|---|---|
| one byte changed inside the hashed ranges | `digest_mismatch`, before execution | R-a |
| unsigned | `unsigned` | R-b, R-b0 |
| a changed field, a flipped signature bit, another key's signature under the pinned key id | `bad_signature` | R-bs1, R-bs2, R-bs3; U1 |
| correctly signed by a key **outside the pinned trust set**, also when the manifest carries that key | `key_outside_trust_set` | R-e, R-e2; U2, U7 |
| a **dev-key signature on a production-channel build**, whatever the plane, the environment or the certificate table declares | `dev_key_on_production_channel` | R-f/k, R-f2, R-k1 to R-k3, R-n3; U2 |
| every runtime input declaring dev (no release is offered) | nothing is refused: the production build reads back its own trust set, mode and endpoint, unchanged | R-k0 |
| **a key added through the server**: a release recorded under a foreign key; an extra key named by every runtime input | no key is added; `key_outside_trust_set` | R-l, R-k4; U4 |
| bytes outside the hashed ranges (a trust block, a mode, an API URL in the certificate table) | the digest and every read-back unchanged; refused as above | R-n, R-n2, R-n3 |
| another channel's release; a malformed manifest | `channel_mismatch`; `malformed` | R-cm, R-mf; U6 |
| a superseded release without an adopt; a downgrade | refused by name; `downgrade_refused`; `release_not_current` | R-m, R-m2, R-B5a |
| no plane answering | `revocations_unavailable` | R-ru, R-B5d |
| an image that is no installed release | `not_an_installed_release` | R-t |

A sentinel payload in a refused artifact never ran (R-s).

**4. The rotation / revocation tests.**
- A revoked key: its releases are refused before execution and a node running one stops claiming (R-c0, R-c, R-B5c). The release
  signer's own key revoked: authorizing an update is `key_revoked` and nothing is signed (UA10).
- A revoked release: refused when offered again, and a node running it stops claiming and never downgrades silently (R-j0, R-j,
  R-d, R-B5b).
- Adopting the previous certified release is the inverse of an upgrade (R-i, R-i2).
- Replacing the signer is a new bootstrap on a plane without one and a new WO-6 revision: a second application of the file is
  refused and changes nothing (RS2); two bootstraps on two fresh planes give two different keys (RS12); a signer whose parts no
  longer give its recorded public key signs nothing (RS9, UA9).

**5. No private release-signing material anywhere S-5 forbids; the signing authority is referenced only as the release signer.**
- The key is generated on the plane by the bootstrap. No part of it is in a statement of the file or in a result of applying it
  (RS10), and the implementer never generated or held it.
- Who can reach it, read per role: the seed needs both parts; `service_role` reads the store's part and is refused the table's; a
  login that may read every table reads the table's part and is refused the store's; the legacy runner, both API logins, a login
  holding the observer's grants and the engine role read neither; none may run the seed's own function or the internal signing
  function; only the engine role may call `sign_release` (RS7). The catalog: `public_key()` is the only signer function PUBLIC may
  execute, and nobody holds a grant on the signer's table (RS8).
- **Stated exactly, because WO-6 says "no function returns it":** one internal function of the file, `factory_signer._seed()`, returns
  the seed, and `_sign` takes it as an argument. Only the signer's owner may execute them: the applying login, which holds both
  parts anyway and which S-5 already counts as signing-equivalent (RS7 shows it running the seed function, and every other login
  refused, 42501). So nothing returns private material to a caller of the Factory or to any login outside the boundary; a function
  that returns it inside the boundary exists. The verifier judged this file, with that function, in Stage A.
- The repository holds public halves only: the trust-set source (U3, R-h) and the published dev seed, which a production-channel
  build never trusts. Secret scan: clean (0 hits).
- No tool of the candidate creates, holds or uses a production key (`scripts/factory-build/release-manifest.mjs` signs with the dev
  key only). A production manifest is signed in one place: `factory_signer.sign_release`, called by the founder-only front door
  `factory.admin_authorize_update` after a fresh password entry. The candidate's code and instructions name no other production
  signing authority.
- The password that authorizes is no signing material and is treated as carefully: it reaches Brain OS's own password check and
  nowhere else (UW5).

**6. The cases of AC-5 (o), (p), (q) and (r).** Developer rows; the verifier's own cases govern.

| case | developer rows at `c353e89` | no developer row |
|---|---|---|
| (o) the founder's fresh entry publishes, exactly once, exactly the prepared update | UW4, UA1, UA6; a repeat answers `already` and writes no release (UA5, UA12); where the signed manifest had not been placed, the repeat places it and writes nothing else (UA8) | — |
| (o) a wrong password | UW2, UW3 (it never reaches the Factory) | — |
| (o) every other persona; a holding_admin; a founder role without tier `founder` | UA4 (each with a fresh entry of its own account: two holding_admins, a listed admin with a self-made founder role, a founder not listed, a self-promoted employee, hr_finance; no token; another project's token); the page: W8 | company_manager, team_lead, sales, engineer, technician, contractor and investor_viewer on this action and this page |
| (o) no session; a session by another method; an entry older or newer than S-8 allows; an entry or session named in the body; another account's entry | UA2, UA3, UA4, UE1, UE2, UW2 | an expired session and a refreshed token as real Brain OS Auth issues them (the stub states the entry time; the verifier's Auth stack governs) |
| (o) the entry presented again; for a different release; after the prepared update or a value changed | UA5, UA11, UA12, UW3, UW6, SG4 | twice at once (held by the tenant lock and the unique index on the authorizing session; no concurrency row) |
| (o) the answer lost after the plane committed | the repeat answers `already` (UA5); the page reads release storage anew on each load (W9) and the Factory's releases and signer on a load (W7) | the page loaded after a production release exists (no W row publishes one); the page's own lost-answer branch, driven in a browser |
| (o) a failure at signing, at publication, at the manifest's placement, with the plane unreachable | signing: UA9, UA10; placement: UA8, UE3 | a failure injected inside the publishing transaction; the plane unreachable |
| (o) the password appears nowhere else; the entry's session is signed out | UW5; UW1, UW4 | web-server logs and error reports of a hosted deployment |
| (p) every other path that publishes a production release | UA11 (no entry, a stale entry, a used entry); a caller who is not the founder is refused `founder_only` whatever it presents (`admin_acceptance` P4) | another account's fresh entry presented by the founder's own session (a token is one account's; no row forges one) |
| (p) a direct call of the signing function by each login; what every signer function returns; every login's effective privileges | RS7, RS8, RS10 | the platform's own secret store (the suites use a stand-in that carries the platform's grants; the verifier judged the file on its judging planes) |
| (p) two bootstraps; the key and signatures against an independent RFC 8032 implementation; the runtime accepts the signer's manifest | RS12; RS3, RS4, RS5 (node:crypto, and the RFC's own vectors); RS5, UA1 | — |
| (q) a statement and its installer upload | SG3, SG6 | the platform's Storage API itself (a stand-in storage) |
| (q) another key, another namespace, altered; a version that is not newer | SG1, SG2, SG3 | — |
| (q) the statement re-sent by another party; a second upload | SG3, SG6 | — |
| (q) at Confirm: other values, an absent installer, another digest | SG4, UE5, UA12 | — |
| (r) Y published while a node runs X | `gate_acceptance` GA7, GA9 | end to end on a production-channel build (final acceptance) |
| (r) an adopt pinning X | GA8, GA9 | — |
| (r) Y revoked; a download that fails the gate; the download unreachable | GA8 (bytes that are not the manifest's; storage that does not serve it; the 15-minute retry window); the gate's own refusals: R-a to R-m2 | a take of a release revoked between the heartbeat and the download |

**7. The live trust-set entry in the trust-set source, byte-equal to WO-6's "The live trust set".** The source's `keys` is one
entry, `{ "key_id": "ed25519:d3ed1390c6e6c367006a4fc5bdecd31d6cfe34823d5eeda7b9341656d962c81e", "public_key":
"4iR7Ra54qciQ5xT-xnXEF1E90x415CEIokAMMvZdkrU" }`, the two values of WO-6's table. The key id is the SHA-256 of the 32 bytes. Held by
`release_trust_unit` U3 and `release_acceptance` R-h (the set read back from the built exe equals build-info's and a recomputation
from the source) and by mutants TKu, TKr, TMb, TMm and TMr.

## The update-authorization requirement (the founder, 2026-10-04)

| requirement | rows |
|---|---|
| the Update page requires the existing Brain OS password again | UW1, UW3; UA2 (a session alone authorizes nothing); the page: W7 |
| a wrong password is refused | UW2 |
| the right password creates a fresh authorization inside the canonical window (120 s) | UW1, UW4; UA1, UA2, UA3 |
| one fresh authorization applies to one exact staged certified release | UA5, UA6, UA12; UW3, UW4; SG4 |
| a replay, or other release values, is refused | UA5, UA11, UA12; UE2 |

`update_authorization_acceptance` at `c353e89`: 23/23 OK, through the real Admin API login, against the
suite's stand-in for Brain OS Auth. The question whether a stolen session can first change the account password (S-8's stated limit)
is **SIDE FINDING — DEFERRED** by the founder's ruling of 2026-10-04: `qa/factory/v1/password_change_probe.mjs` is in the tree and
was not run, no test account was created and no Auth setting was changed.

## Results at the candidate SHA

### Final developer pass (`tools/final_pass.mjs --declarations`; evidence `evidence/c353e8953338f855a134a95787a075e8e93cfa01/final/`)

Commit `c353e8953338f855a134a95787a075e8e93cfa01`; serial; developer verification, never independent. 36 of 36 steps passed (exit 0 with their result line).

| step | exit | seconds | summary | evidence |
|---|---|---|---|---|
| build dev channel | 0 | 14 | [build-sea] BUILT C:\Users\DELL\dev\brain-os-factory-enroll\dist\brain-factory\0.1.0\dev\BrainFactorySetup.exe sha256 dd4bbb5f57834adc5a6856e4dc544c487395bd92ca | `build_dev_channel.txt` |
| build production channel | 0 | 14 | [build-sea] BUILT C:\Users\DELL\dev\brain-os-factory-enroll\dist\brain-factory\0.1.0\production\BrainFactorySetup.exe sha256 6d751860d2cade142c234184a61c6d6b6d0 | `build_production_channel.txt` |
| verify-build dev (IDENTICAL) | 0 | 14 | IDENTICAL: dd4bbb5f57834adc5a6856e4dc544c487395bd92cad9a5366819cd87fa8399f5 (unsigned image), and every build-info field but the signing ones | `verify-build_dev_IDENTICAL_.txt` |
| verify-build production (IDENTICAL) | 0 | 15 | IDENTICAL: 6d751860d2cade142c234184a61c6d6b6d06f03dbdd7bcc71185ff15b51ad0df (unsigned image), and every build-info field but the signing ones | `verify-build_production_IDENTICAL_.txt` |
| provenance --check (the declared per-channel builds) | 0 | 28 | dev: rebuilt digest f24f37437d739df7471f31932a0df6db1ccdc32f25275271da317683aaa5dc11 (declared f24f37437d739df7471f31932a0df6db1ccdc32f25275271da317683aaa5dc11) | `provenance_--check_the_declared_per-channel_builds_.txt` |
| static: factory_v1_static_contract | 0 | 4 | factory_v1_static_contract: 73 passed, 0 failed | `static_factory_v1_static_contract.txt` |
| static: architecture_impact_registry_contract | 0 | 0 | architecture_impact_registry_contract: 17 passed, 0 failed | `static_architecture_impact_registry_contract.txt` |
| static: secret scan self-test | 0 | 0 | secret_scan --selftest: 10/10 rules hit their sample | `static_secret_scan_self-test.txt` |
| static: secret scan | 0 | 0 | secret_scan: clean (0 hits) | `static_secret_scan.txt` |
| static: deno check (Edge functions) | 0 | 2 |  | `static_deno_check_Edge_functions_.txt` |
| static: web tsc | 0 | 3 |  | `static_web_tsc.txt` |
| static: web eslint (changed files) | 0 | 5 |  | `static_web_eslint_changed_files_.txt` |
| static: web next build | 0 | 8 | ✓ Generating static pages using 15 workers (45/45) in 427ms | `static_web_next_build.txt` |
| schema_acceptance | 0 | 10 | schema_acceptance: 82/82 OK | `schema_acceptance.txt` |
| manifest_rehearsal | 0 | 7 | manifest_rehearsal: 6/6 OK | `manifest_rehearsal.txt` |
| takeover_acceptance --transport direct | 0 | 27 | takeover_acceptance [direct]: 20/20 OK | `takeover_acceptance_--transport_direct.txt` |
| takeover_acceptance --transport api | 0 | 27 | takeover_acceptance [api]: 20/20 OK | `takeover_acceptance_--transport_api.txt` |
| compat_regressions --transport direct | 0 | 39 | compat_regressions [direct]: 36/36 OK | `compat_regressions_--transport_direct.txt` |
| compat_regressions --transport api | 0 | 40 | compat_regressions [api]: 36/36 OK | `compat_regressions_--transport_api.txt` |
| transport_compatibility_contract | 0 | 80 | transport_compatibility_contract: 17/17 rows MIGRATED | `transport_compatibility_contract.txt` |
| enrollment_acceptance | 0 | 72 | enrollment_acceptance: 38/38 OK | `enrollment_acceptance.txt` |
| admin_acceptance | 0 | 41 | admin_acceptance: 46/46 OK | `admin_acceptance.txt` |
| revocation_interleaving | 0 | 78 | revocation_interleaving: 30/30 OK | `revocation_interleaving.txt` |
| eligibility_acceptance | 0 | 76 | eligibility_acceptance: 25/25 OK | `eligibility_acceptance.txt` |
| independence_acceptance | 0 | 28 | independence_acceptance: 25/25 OK | `independence_acceptance.txt` |
| edge_db_tls_acceptance | 0 | 9 | edge_db_tls_acceptance: 10/10 OK | `edge_db_tls_acceptance.txt` |
| setup_manifest_locate | 0 | 1 | setup_manifest_locate: 7/7 OK | `setup_manifest_locate.txt` |
| release_trust_unit | 0 | 0 | release_trust_unit: 8/8 OK | `release_trust_unit.txt` |
| release_signer_acceptance | 0 | 21 | release_signer_acceptance: 12/12 OK | `release_signer_acceptance.txt` |
| update_authorization_acceptance | 0 | 8 | update_authorization_acceptance: 23/23 OK | `update_authorization_acceptance.txt` |
| release_stage_acceptance | 0 | 1 | release_stage_acceptance: 7/7 OK | `release_stage_acceptance.txt` |
| gate_acceptance | 0 | 14 | gate_acceptance: 9/9 OK | `gate_acceptance.txt` |
| runtime_acceptance | 0 | 137 | runtime_acceptance: 13/13 OK | `runtime_acceptance.txt` |
| release_acceptance | 0 | 248 | release_acceptance: 41/41 OK | `release_acceptance.txt` |
| web_computers_acceptance | 0 | 20 | web_computers_acceptance: 10/10 OK | `web_computers_acceptance.txt` |
| sea_package_regression | 0 | 181 | sea_package_regression: 28 passed, 0 failed | `sea_package_regression.txt` |

Run at the candidate outside the final pass (evidence `evidence/c353e8953338f855a134a95787a075e8e93cfa01/extra/`): `runtime_units` (35/35 OK),
`runtime_recovery_acceptance` (13/13 OK), `edge_boundary_acceptance` (8/8 OK),
`edge_peer_acceptance` (8/8 OK), `legacy_director_acceptance --transport api`
(8/8 OK), `installer_input_acceptance` (10/10 OK).

### The installers and their declarations (WO-10 release provenance; CR-019)

Both installers were built from a clean checkout of `c353e8953338f855a134a95787a075e8e93cfa01` (`build-sea.mjs`), reproduced (`verify-build.mjs`: IDENTICAL) and compared with their declarations (`provenance.mjs --check`: MATCH) three times: at the start of the final pass; in stage 7 (ended 2026-10-05T20:53:38Z), while the last packaging-mutation batch was still running; and in stage 7b (2026-10-05T21:41:43Z to 2026-10-05T21:42:43Z), after the last proof of the run had ended (2026-10-05T20:59:22Z).

| channel | source commit | installer digest (PE Authenticode image hash) | unsigned exe sha256 | runtime bundle sha256 | trust set compiled in | declaration sha256 |
|---|---|---|---|---|---|---|
| dev | `c353e8953338f855a134a95787a075e8e93cfa01` | `f24f37437d739df7471f31932a0df6db1ccdc32f25275271da317683aaa5dc11` | `dd4bbb5f57834adc5a6856e4dc544c487395bd92cad9a5366819cd87fa8399f5` | `8b8752825d7e702bea014108adea7e6e8cf295b8dad56fd423c4528500f9dc5d` | mode dev: `ed25519:98601d6850ee07dee28b13e1dfd6de3f737b4e730c20fe3b8a620c9cc99536e6` | `4be810b3450bba21ba85cd1903cbe2c7ae8236ad5b62c2551ee46ce1a050a218` |
| production | `c353e8953338f855a134a95787a075e8e93cfa01` | `02c6abfc135700f28dccd32fa19c958d2dfedc6c6d89e312d07e6e1ae981dd96` | `6d751860d2cade142c234184a61c6d6b6d06f03dbdd7bcc71185ff15b51ad0df` | `35bdc03cf4ac8f6b53471dfd344897b4c2dd6d00ae8ad889a8e33e79c1e7a91d` | mode production: `ed25519:d3ed1390c6e6c367006a4fc5bdecd31d6cfe34823d5eeda7b9341656d962c81e` | `6a5c1a34a05a5c6253a8475e6286ca1622f7af37445fb70053996a04b5836db4` |

- `verify-build_dev.txt`: IDENTICAL: dd4bbb5f57834adc5a6856e4dc544c487395bd92cad9a5366819cd87fa8399f5 (unsigned image), and every build-info field but the signing ones
- `verify-build_production.txt`: IDENTICAL: 6d751860d2cade142c234184a61c6d6b6d06f03dbdd7bcc71185ff15b51ad0df (unsigned image), and every build-info field but the signing ones
- `provenance_check.txt`: MATCH: both channels' rebuilds of c353e8953338f855a134a95787a075e8e93cfa01 equal the declarations
- `after_all_verify-build_dev.txt`: IDENTICAL: dd4bbb5f57834adc5a6856e4dc544c487395bd92cad9a5366819cd87fa8399f5 (unsigned image), and every build-info field but the signing ones
- `after_all_verify-build_production.txt`: IDENTICAL: 6d751860d2cade142c234184a61c6d6b6d06f03dbdd7bcc71185ff15b51ad0df (unsigned image), and every build-info field but the signing ones
- `after_all_provenance_check.txt`: MATCH: both channels' rebuilds of c353e8953338f855a134a95787a075e8e93cfa01 equal the declarations

Each line is the result file's own; a local directory name at its end is left off. The declarations those checks read are the run's own copy of the two files in `build-declarations/`.

The same builds, as `tools/provenance.mjs` reads them from `dist/` at the candidate:

| channel | runtime version | source commit | dirty | built_at | digest (PE Authenticode image hash, SHA-256) | file sha256 (unsigned) | trust mode | trust set (key id, sha256 of the public key) | default API |
|---|---|---|---|---|---|---|---|---|---|
| production | 0.1.0 | `c353e8953338f855a134a95787a075e8e93cfa01` | false | 2026-10-05T15:14:19.000Z | `02c6abfc135700f28dccd32fa19c958d2dfedc6c6d89e312d07e6e1ae981dd96` | `6d751860d2cade142c234184a61c6d6b6d06f03dbdd7bcc71185ff15b51ad0df` | production | `ed25519:d3ed1390c6e6c367006a4fc5bdecd31d6cfe34823d5eeda7b9341656d962c81e` / `d3ed1390c6e6c367006a4fc5bdecd31d6cfe34823d5eeda7b9341656d962c81e` | https://npvhuoozkbexddnvkqsj.supabase.co/functions/v1/factory-node-api |
| dev | 0.1.0 | `c353e8953338f855a134a95787a075e8e93cfa01` | false | 2026-10-05T15:14:19.000Z | `f24f37437d739df7471f31932a0df6db1ccdc32f25275271da317683aaa5dc11` | `dd4bbb5f57834adc5a6856e4dc544c487395bd92cad9a5366819cd87fa8399f5` | dev | `ed25519:98601d6850ee07dee28b13e1dfd6de3f737b4e730c20fe3b8a620c9cc99536e6` / `98601d6850ee07dee28b13e1dfd6de3f737b4e730c20fe3b8a620c9cc99536e6` | (none: dev) |

- Base executable: node v24.19.0 `win-x64/node.exe`, sha256 `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237` (pinned; source https://nodejs.org/dist/v24.19.0/SHASUMS256.txt), signature stripped before injection.
- Control-plane migration: `scripts/factory-control-plane/migration.mjs compose` (a developer label: its sha256 is `2989ad8443cdbd23985fead716ac2434ca0481eefe768d29284e54852aead029`, not the step's). The live-migration step is not built here: the verifier builds it from the candidate migration's committed bytes with the Director instrument `qa/verification/auto-enrollment-v1/tools/build_live_migration_step.mjs` (WO-1 r3), and the founder applies exactly that file.
- The per-channel build declarations (`provenance.mjs --emit`) are in `evidence/c353e8953338f855a134a95787a075e8e93cfa01/build-declarations/`, committed in the evidence
  / report commit, a child of the commit they declare. They are the implementer's information-only evidence (CR-019), not a release
  manifest. `provenance.mjs --check`, in a clean checkout of the frozen SHA, compared them with a fresh rebuild three times (the
  times are above): MATCH. The first attempt of stage 1 emitted the same two files, byte for byte
  (`build-declarations.attempt-1/`).
- The production trust set compiled into the installer is the one WO-6 entry (the tables above; `release_acceptance` R-h). A
  production release is signed by the release signer: never by the founder, never by a tool of this repository. The digest the
  founder authorizes is the verifier's reproduction at the CERTIFIED SHA (S-5), not a value from these tables.
- `tools/provenance.mjs` at the frozen SHA still ends its output with a sentence written for candidate #3 ("the production trust set
  is empty ... the digest the founder signs"). It is false for the successor and is left out here; what the tool reads from the builds
  (the table) is right (Known limitations).

### Mutation proofs (developer)

| proof | mutants | killed | survivors / not judged / vacuous | evidence |
|---|---|---|---|---|
| v1 new invariants (`qa/factory/v1/v1_mutation_proof.mjs`), 19 suites, one invocation per suite, each with its control | 431 | **431** | 0 | `evidence/c353e8953338f855a134a95787a075e8e93cfa01/v1_mutation/` |
| SEA packaging (`qa/factory/sea_package_mutation_proof.mjs`), 4 batches | 30 | **30** | 0 | `evidence/c353e8953338f855a134a95787a075e8e93cfa01/sea_mutation/` |
| certified `acceptance_mutation_proof` at its 69df2f52 bytes, by label in 8 chunks | 60 runnable | **60** | 0 | `evidence/c353e8953338f855a134a95787a075e8e93cfa01/reference/acceptance_mutation_proof.chunk-*.txt` |

Every mutant ran at `c353e8953338f855a134a95787a075e8e93cfa01` (the proofs clone this commit). v1 per suite:

| suite | killed | control |
|---|---|---|
| static | 77 of 77 | passed: factory_v1_static_contract: 73 passed, 0 failed |
| schema | 59 of 59 | passed: schema_acceptance: 82/82 OK |
| admin | 54 of 54 | passed: admin_acceptance: 46/46 OK |
| eligibility | 31 of 31 | passed: eligibility_acceptance: 25/25 OK |
| release | 27 of 27 | passed: release_acceptance: 41/41 OK |
| units | 27 of 27 | passed: runtime_units: 35/35 OK |
| independence | 25 of 25 | passed: independence_acceptance: 25/25 OK |
| releaseunit | 18 of 18 | passed: release_trust_unit: 8/8 OK |
| enrollment | 17 of 17 | passed: enrollment_acceptance: 38/38 OK |
| pairing | 17 of 17 | passed: pairing_concurrency_acceptance: 12/12 OK |
| installer | 16 of 16 | passed: installer_input_acceptance: 10/10 OK |
| tls | 14 of 14 | passed: edge_db_tls_acceptance: 10/10 OK |
| recovery | 13 of 13 | passed: runtime_recovery_acceptance: 13/13 OK |
| revocation | 12 of 12 | passed: revocation_interleaving: 30/30 OK |
| takeover | 7 of 7 | passed: takeover_acceptance [direct]: 20/20 OK |
| legacydirector | 6 of 6 | passed: legacy_director_acceptance [direct]: 8/8 OK |
| edge | 5 of 5 | passed: edge_boundary_acceptance: 8/8 OK |
| gate | 5 of 5 | passed: gate_acceptance: 9/9 OK |
| isolation | 1 of 1 | passed: isolation_env_unit: 3/3 OK |

The v1 proof has 431 mutants where candidate #3 had 426. Of the 5 new ones, TKu and TKr put a key the Director's WO-6 does not record into the production trust set (judged on the source, and on the built installer); TMb, TMr and TMm make the build take a malformed trust file (an entry not bound to its key, a repeated key id, a mode that is not its channel). Each, with the row that caught it:

| mutant | suite | rows expected to fail | rows seen failing |
|---|---|---|---|
| TKu | releaseunit | U3 | U3 |
| TKr | release | R-h | R-h |
| TMb | releaseunit | U5b | U5b |
| TMm | releaseunit | U5b | U5b |
| TMr | releaseunit | U5b | U5b |

SEA batches: batch-00 (P1 P2 P3 U1 U2 U3 T1 N1): 8 of 8; batch-01 (N2 E1 E2 E3 C1 C2 C3 R1): 8 of 8; batch-02 (R2 R3 R4 R5 R6 R7 R8): 7 of 7; batch-03 (R9 X1 X2 A1 A2 DK1 DK2): 7 of 7.

The certified acceptance proof refuses to run whole at 69df2f52 itself (the anchors of N37x and N19 are absent from the certified files); of its other 69 mutants, 60 run by label and 9 (`acceptance.mjs` M N O Q P S3 G3 R S) are not judgeable from a clone of this branch — both baseline findings, unchanged from candidates #1 to #3.

The successor's new guards (the front door's checks, the staging function's, the node's take) are held by the acceptance rows above
and by negative checks run by hand and recorded in the commit messages (`e38b2b9`, `1f972d9`, `081c021`, `ced1751`). They carry no
planted mutant in the v1 proof: the Director's ledger (the r6 event) records that the founder's assignment of 2026-10-02T16:31:48Z
excludes new §3.10 mutation rows for the successor.

### Certified reference suites at their 69df2f52 bytes (VERIFICATION_SPEC §3.7)

Evidence `evidence/c353e8953338f855a134a95787a075e8e93cfa01/reference/group1..4/` (one file per suite; `SUMMARY.txt` per group). Every suite file is byte-identical to 69df2f52 (the runner checks it first).

| suite | exit | summary |
|---|---|---|
| acceptance | 0 | factory acceptance: 58 passed, 0 failed |
| campaign_boundary_is_crossed | 1 | campaign_boundary_is_crossed: 21 passed, 1 failed |
| dbtest_on_disposable_pg | 0 | concurrency: TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN — VERIFIED under real concurrency (real PostgreSQL, two connections) |
| dedicated_supabase_provisioning | 0 | dedicated_supabase_provisioning: 11 passed, 0 failed  (disposable TLS server dressed as a Supabase project; nothing reached any real project) |
| denominator_cannot_shrink_silently | 0 | denominator_cannot_shrink_silently: 8 passed, 0 failed |
| founder_poke_not_required | 0 | founder_poke_not_required: 12 passed, 0 failed |
| health_check | 0 | health_check: 10 passed, 0 failed |
| http_provider_acceptance | 0 | http_provider_acceptance: 9 passed, 0 failed  (stub provider on 127.0.0.1:50410, disposable plane; nothing reached a real provider) |
| instrument_validity.regression.test | 0 | instrument_validity.regression.test: 20 passed, 0 failed |
| model_catalog_must_not_advertise_untested_models | 0 | 15 pass, 0 fail |
| no_silent_model_fallback | 0 | 12 pass, 0 fail |
| package_bootstrap_mutation_proof (static) | 0 | package_bootstrap_mutation_proof: 15 of 15 (control green + mutants killed)  (static mutants only; --fresh adds the original defect and thirty-four fr |
| package_bootstrap_regression --static | 0 | package_bootstrap_regression: 7 passed, 0 failed  (static rows only) |
| tls_plane_acceptance | 0 | tls_plane_acceptance: 9 passed, 0 failed  (plane served on 192.168.1.7:50449 with ssl=on, hostssl-only; disposable, removed) |
| waiting_costs_no_cpu | 0 | waiting_costs_no_cpu: 5 passed, 0 failed |
| node_truth_acceptance | 0 | node_truth_acceptance: 46 passed, 0 failed |
| shared_control_plane_acceptance | 0 | shared_control_plane_acceptance: 18 passed, 0 failed |
| scripts/factory-runner/db.regression.test | 0 | ℹ fail 0 |
| scripts/factory-runner/plugin-attach.regression.test | 0 | ℹ fail 0 |
| scripts/factory-runner/provider.regression.test | 0 | ℹ fail 0 |
| scripts/factory-runner/round-state.regression.test | 1 | round-state.regression.test: 0 passed, 1 failed |
| scripts/factory-runner/runner-env.regression.test | 0 | ℹ fail 0 |
| scripts/factory-runner/scheduler.regression.test | 0 | ℹ fail 0 |
| scripts/factory-runner/supervisor.injection.mutation | 1 | supervisor.injection.mutation: 4/5 proven, 1 unproven |
| scripts/factory-runner/supervisor.injection.test | 0 | supervisor.injection.test: 139 pass, 0 fail (19 cwd payloads x1, 14 prompt payloads x 8 fields) |
| scripts/factory-runner/supervisor.regression.test | 0 | ℹ fail 0 |

Non-zero exits, each classified (none is a candidate defect; the same as at candidates #2 and #3):
- `campaign_boundary_is_crossed`: BASELINE FINDING: row R1 (a handler in handlers/ is not registered with the director). R1 reads only `scripts/factory-runner/handlers/` and `director-start.mjs`, byte-identical to 69df2f52 at the candidate; reproduced on a clean 69df2f52 clone for candidate #1
- `scripts/factory-runner/round-state.regression.test`: ENVIRONMENT (registered in VERIFICATION_SPEC §3.7): RS-C0 reads two worktrees that exist only on the original machine; the same at 69df2f52 on this machine
- `scripts/factory-runner/supervisor.injection.mutation`: BASELINE FINDING: 4 of 5 proven; the R-D9 anchor (`shell: true` in the SQL transport) is absent from the certified `supervisor.mjs`

### The migration under the live applying login (F-1; AC-10, AC-11)

`qa/factory/v1/applying_role_plane.mjs --tree c353e8953338f855a134a95787a075e8e93cfa01`: the committed blobs of the candidate migration, applied as the step the Director instrument builds, by a NOSUPERUSER applying login. Result: **applying_role_plane [tree c353e8953338f855a134a95787a075e8e93cfa01, director 3745a281]: 14/14 OK**. Evidence `evidence/c353e8953338f855a134a95787a075e8e93cfa01/applying_role_plane/`.

- PASS M0 - no 69df2f52 control-plane file changed at c353e8953338
- PASS M1 - the Director instrument (3745a281) built the step: sha256 9a5414dda882e9d06b7aa253e3d53caae297685ae39b972fb362c7e9b5a9f48b
- PASS P0 - createrole_self_grant = "" (live "")
- PASS P1 - the applying login is postgres: rolsuper=false rolinherit=true rolcreaterole=true rolcreatedb=true rolcanlogin=true rolreplication=true rolbypassrls=true
- PASS P2 - provisioned as 69df2f52 AS postgres; postgres holds factory_runner [{"a":true,"i":false,"s":false}] (live true/false/false)
- PASS P3 - baseline evidence rows loaded unchanged: {"nodes":4,"work_orders":10,"work_order_dependencies":0,"agent_runs":12,"checkpoints":12}
- PASS P4 - the release signer created AS postgres (scripts/factory-control-plane/release_signer.sql, sha256 333536de52fdfcbf...): ed25519:181e6ea19b8a52f0b5906aa46eb69317322b6dafd38b3e5598047c400a051abd
- PASS S1 - the live-migration step committed AS postgres (NOSUPERUSER), step sha256 9a5414dda882e9d06b7aa253e3d53caae297685ae39b972fb362c7e9b5a9f48b; tables in schema factory now 28
- PASS W1 - no pre-existing table in any schema (11 tables outside the system catalogs) gained, lost or changed a row: its row hashes over every column it had are equal before and after the migration
- PASS W2 - the tables the migration created (19, any schema) hold only the one operator tenant row - holding no user id and referring to no computer, principal, credential or envelope - and contract §1's two policy rows; 
- PASS W3 - no computer, agent principal, credential, envelope, pairing code, enrollment attempt, tenant_admins, release, release revocation or certification row, and no S-16(a) binding - {"computers":0,"agent_principals":
- PASS W4 - in every column the migration added to a pre-existing table (52), no pre-existing row holds a value that refers to a computer, principal, credential or envelope (reference columns - by foreign key, or by name: 
- PASS W5 - no object the migration defines or changes (a function new or replaced, a column default new or set on a pre-existing column, a view, policy, trigger, constraint) holds a constant that identifies a user, a comp
- PASS W6 - no column default writes the S-16(a) binding (s16a_bound_at / s16a_bound_by have none)

`manifest_rehearsal` (6/6 OK): the catalog difference of the step is exactly `predicted_catalog_difference.json`,
which is unchanged since candidate #3; every judging plane applies the secret-store stand-in and the signer file first.

## What changed since candidate #3

| area | paths | held by |
|---|---|---|
| the release signer | `scripts/factory-control-plane/release_signer.sql` (new; applied once, before the migration) | `release_signer_acceptance` (12/12 OK) |
| the migration | `000` (one grant: `sign_release` to the engine role), `060` (the authorizing session and entry time on a release; one release per entry), `220` (`factory.admin_authorize_update`; the same entry for a production `publish-release`; `not_staged`), `290` (the Admin API login's grant on that one front door) | `schema_acceptance` (82/82 OK), `update_authorization_acceptance`, `admin_acceptance` (46/46 OK), the applying-role plane |
| the Admin API | `_shared/admin_api.ts`, `_shared/release_storage.ts`, `_shared/pe_image.ts`, `factory-admin-api/index.ts`: `authorize-update`; the password entry read from the caller's own verified token; the staged check; the signed manifest placed in release storage | `update_authorization_acceptance` UE1 to UE5; `release_stage_acceptance` SG4, SG7 |
| staging | `_shared/release_stage.ts`, `factory-release-stage/index.ts` (new function), `config.toml` | `release_stage_acceptance` (7/7 OK) |
| the runtime | `enrolled/upgrade.mjs` (`takePublished`), `enrolled/worker.mjs` (one call at a heartbeat between claims) | `gate_acceptance` (9/9 OK), `runtime_units`, `runtime_acceptance` (13/13 OK) |
| the trust set | `enrolled/trust/production.json`: the one entry WO-6 revision 5 records | `release_trust_unit`, `release_acceptance`, `sea_package_regression` (28 passed, 0 failed) |
| the web | `software-factory/update/` (page, panel), `lib/data/factory-update.ts`, `lib/factory/reauth.ts`, `lib/factory/update.ts`, the sidebar entry, EN / MN strings; in the existing files: `lib/factory/admin-client.ts` (the one authorizing call carries the fresh session's token), `lib/data/factory-computers.ts` (the signer's public half and the authorizing entry in the release list), `computers/computers-view.tsx` (one sentence) | `update_authorization_acceptance` UW1 to UW6; `web_computers_acceptance` W7 to W9 (10/10 OK); tsc, eslint, `next build` |
| build tools | `build-sea.mjs`, `release-manifest.mjs`: comments only (C-3 is decided) | `sea_package_regression`; verify-build IDENTICAL |

Not changed: the Node API, pairing and enrollment, eligibility, verification and independence, the legacy transport, the installer's
protocol. Their suites ran again at `c353e89` (the final pass above).

Behaviour a founder or an operator will notice:
- Brain OS → Factory → Update exists. It shows the prepared update and asks for the password of the account that is signed in.
- A computer updates itself: at a heartbeat between claims it takes its channel's published release from the release storage fixed
  in its build, unless a Factory admin's adopt pins it. A failed take is tried again after 15 minutes; meanwhile the computer runs
  a release that is no longer current, and claims nothing.
- A production release can no longer be published by any path without a fresh password entry. Dev-channel publishing, on
  disposable planes, asks for none.

## Change requests the candidate relies on (VERIFICATION_SPEC §2)

| CR | path | sha256 (the Director's r8 record; equal at the candidate) | decision |
|---|---|---|---|
| CR-027 | `qa/implementation/auto-enrollment-v1/change-requests/CR-027-system-managed-release-signer.md` | `82eb9c9f493b4c286feec9e34581b04db02931b5f3a98866d0719bc43ae5b93d` | CANONICALIZED (the founder's decision of C-3; founder text II.18) |
| CR-028 | `qa/implementation/auto-enrollment-v1/change-requests/CR-028-factory-staging-and-automatic-node-update.md` | `f79e7041174f84cef5270be93daa414e5573a4a18a22848e6a42ea01b18baa21` | CANONICALIZED (the founder's corrections of 2026-10-03; founder text II.19) |

The nine change requests candidate #3's report lists (CR-001 to CR-006, CR-021, CR-022, CR-026) and their rulings are unchanged.

## Known limitations (stated, not hidden)

- **Judging-plane fidelity.** Embedded PostgreSQL 18; the platform's secret store is a stand-in that carries the platform's grants
  (`qa/factory/v1/vault_standin.sql`); Brain OS Auth and release storage are stand-ins. The signer file was judged by the verifier
  on its own judging planes and applied live by the founder; nothing else of the successor has met the hosted platform.
- **UNMEASURED until the founder's deploy** (whole-request gates, observed only on a real request):
  - at Confirm the Admin API downloads the staged installer (about 90 MB) and hashes it inside the Edge function, and the page's
    call to the Admin API waits 20 seconds: the hosted runtime's time and memory for that are not measured;
  - the Storage API routes the staging function and the Admin API use (signed upload without overwrite, authenticated read);
  - everything candidate #3's report listed: the Edge limits, the peer address the hosted runtime reports, the path prefix,
    postgres.js over the pooler, verify-full to the real pooler host.
  `FOUNDER_PREPARED_STEPS.md` step 5 lists the mandatory post-deploy live acceptance.
- **The password entry and the session** (S-8's stated limit). The entry adds protection beyond the session only while Brain OS
  Auth refuses a password change that presents neither the current password nor a reauthentication. That setting is production
  auth configuration, the founder's. DEFERRED by the founder (above).
- **An adopt pins a computer until an admin adopts again.** The automatic take skips a computer that an adopt pins; the pin has no
  expiry and no "follow the published release again" action other than adopting the published release.
- **Revoke-release and revoke-key** need the founder's session only, not a password entry (unchanged from candidate #3).
- **A role that may write the secret store can delete the store's part.** The signer then signs nothing and says so (`ready()` is
  false; `signer_unavailable`); it never signs with another key (RS9). Recovery is a new bootstrap and a new WO-6 revision.
- **The platform gives every Edge Function the project's database URL and storage key.** The staging function uses the storage key
  only, through the Storage API on the release bucket (S-10); the static plane scan classes each read.
- **A staging signature is valid on every plane that runs the function** (WO-6): the Director signs only for the live plane.
- **No planted mutant for the successor's new guards** (above).
- **A stale sentence in a developer tool.** `tools/provenance.mjs`, run without arguments at the frozen SHA, ends with fixed text
  written for candidate #3: "the production trust set is empty ... the digest the founder signs". Both halves are false for the
  successor. The table the tool prints is read from the builds and shows the one WO-6 key. Found while this report was written,
  after the freeze; the tool is part of the frozen tree and was not changed.
- **`manifest_rehearsal`'s baseline checkout** (side findings) and **the silent ending of a suite whose database never starts** (FOUND):
  neither is changed in the suites.
- **The developer §3.4 scan is an approximation** with stated limits; the verifier's own scan governs.
- **Mongolian UI strings** on the Computers and Update pages need a native speaker's review.
- **Carried over from candidate #3, unchanged:** the record-level residuals (L2-F3, L3-F2, L3-F3, L3-F7, L3-F9, L4-F1, L4-F6, L4-F10,
  L7-10), the C2-P1 and C2-S1 readings, the logon-only task.

## Side findings — deferred (the candidate is not changed for any of them)

| finding | why deferred |
|---|---|
| Whether a stolen session can first change the account password | the founder's ruling of 2026-10-04; S-8 states the limit |
| An adopt has no expiry (above) | surfaced by r7's text; product behaviour outside the founder's two corrections |
| A suite killed part-way can leave its temporary runtime's processes running until the next restart | test hygiene; seen once on this PC, outside any run of this candidate |
| `manifest_rehearsal` keeps a reusable baseline checkout in the temporary folder and does not rebuild one the operating system emptied | found after the freeze, in a developer suite; the remedy is to delete `<temp>/factory-v1-baseline-69df2f52` (its `node_modules` is a junction: unlink it first) |
| A suite awaits its disposable database before its own error handling, so a start that never completes ends the process 0 and silent | seen once, before the freeze; the final pass and the mutation proofs now refuse to count such a run; the suites themselves are unchanged |

## Where things are

| item | location |
|---|---|
| Founder steps (prepared, not executed) | `FOUNDER_PREPARED_STEPS.md`: step S (the signer bootstrap, done by the founder on 2026-10-04), step 5 (the three functions), step 7 (staging by the Director; Update; the computers take it) |
| Third-PC script (not run) | `ZERO_TOUCH_ACCEPTANCE_SCRIPT.md` |
| Implementation records | `DECOMPOSITION.md`, `RECONCILIATION.md`, `R3_RECONCILIATION.md`, `BASELINE_LIFECYCLE_INVENTORY.md`, `COMPATIBILITY_MATRIX.md`, `MIGRATION_PRIVILEGES.md`, `predicted_catalog_difference.json`, `change-requests/` |
| Inventory | `INVENTORY.md` (generated at the candidate SHA) |
| Evidence | `evidence/c353e8953338f855a134a95787a075e8e93cfa01/` (`STAGES.md` is the run's ledger). Candidate #3's stays at `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/` |
| Fresh-clone recipe | `git clone -b factory/auto-enrollment-v1-implementation …`; `git fetch origin factory/auto-enrollment-v1-director`; `git checkout c353e8953338f855a134a95787a075e8e93cfa01`; `npm ci` at the root and in `web/` (and in `qa/dbtest/` for `dbtest_on_disposable_pg`); `node scripts/factory-build/build-sea.mjs --channel dev` and `--channel production`; `node qa/implementation/auto-enrollment-v1/tools/final_pass.mjs <out> --declarations <copy of evidence/c353e8953338f855a134a95787a075e8e93cfa01/build-declarations>` |


# Factory V1 — Node Management + Zero-Touch Auto-Enrollment: candidate #2 report (implementer)

| | |
|---|---|
| State | **READY FOR INDEPENDENT QA** (DEV-VERIFIED by the implementer; never self-certified) |
| Candidate SHA (frozen) | `c667367b6d0fcf02a4d575f050aaa475c644ca7b` on `factory/auto-enrollment-v1-implementation` |
| Evidence / report commit | the commit that adds this file (it adds only `qa/implementation/auto-enrollment-v1/**`; no code) |
| Product contract (Director commit built against) | r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03`, reconciled by the signed merge `b94830b` |
| CR-disposition record | `a0bb79856a7a82ea8277c7bbf3a23ad6cc0631a0` (Director, 2026-09-30; a narrow record, not a product revision: product semantics stay r3) |
| Previous candidate | `412ac14e76f88fbd5e310d3e97dbf5acab2c1498`: **REJECTED** (receipt sha256 `f94861a76699696e86160064090356eb823bc5627bba50af9f259fff4bb11b57`) |
| Baseline | `69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6` (untouched) |
| Implementer signing key | `SHA256:9zUYxsZkV6MLq9dcGtiz+e3D/h0XPevf3w/cJH5QTek` (`implementer_signing_key`, CR-005). Every commit in `c7a845b6..c667367` (56) verifies against it: 56 of 56 `G` |
| Director documents | byte-identical to r3 over every Director-owned path (`CLAUDE.md`, `governance/`, `qa/work-orders/`, `qa/verification/auto-enrollment-v1/`, `docs/architecture/features/`, `docs/architecture/adr/`, `FEATURE_COMPLETENESS_CONTRACT.md`); the r3 ledger document set: 23 of 23 files hash-match. Outside it, `docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml` carries the implementer's WO-10 capability-registry entry |
| API login roles (§2, §3.3) | `factory_node_api` (the Node API) and `factory_admin_api` (the Admin API). The migration creates both NOLOGIN (`000_preconditions_roles.sql`); founder step 2 makes them LOGIN. No handler connects as any other role. |
| Production | **untouched.** No live migration, no Edge deploy, no secret, no `master` push, no live plane write. The live legacy checkout and task were never touched. |

The whole scope is developer verification by the implementer on DESKTOP-8P5HVAO. A stubbed Brain OS never counts for acceptance
(VERIFICATION_SPEC §3 (2)). Independent acceptance, and every row marked INDEPENDENT or BLOCKED below, belong to the verifier and
the founder.

## FOUND / ROOT CAUSE / SYSTEMIC IMPACT / FIXED / TESTED / PRODUCTION / BLOCKERS

**FOUND.**
- The independent verification of `412ac14` found 87 records: 5 BLOCKER, 21 MAJOR (1 needed execution), 24 MEDIUM (1 needed
  execution) and 16 INFORMATIONAL (2 needed execution), with 6 refuted and 2 environment. Each record is dispositioned below.
- Under ledger rule 3 (founder text II.16), this public report carries each record's ID, severity, area, disposition state and
  requirement IDs. The verifier's evidence, the mechanisms and the per-record regression mapping went to the Director privately,
  through the founder.
- In this round the implementer's own final developer pass found one more defect: `COMPATIBILITY_MATRIX.md` still carried an earlier
  migration sha256, so the transport compatibility contract failed (16 of 16 rows MIGRATED, but the committed matrix was not the
  generated one). It was regenerated at `c667367` and the whole pass re-run.

**ROOT CAUSE (classes).**
- A migration written for a superuser applying login, while the live plane applies it as a NOSUPERUSER login (F-1).
- Guards and front doors without a pinned `search_path` (B-2).
- A pairing code accepted on a process command line (B-3), and a founder-only envelope decision not taken on the locked, current
  row (B-4).
- Setup on an already-enrolled home did not pass the upgrade path's release gate (B-5).
- Suites that ran on a harness plane unlike the live one, and generated records not regenerated after a change to their source.

**SYSTEMIC IMPACT.** Each class got a same-class sweep:
- every developer plane applies the migration as the live applying login and refuses a superuser (static H1; `applying_role_plane`);
- every function pins `search_path = pg_catalog, pg_temp`, and the engine and caller tests compare catalog-typed values only (static
  R8, R9);
- every input channel of the installer, setup and runtime is inventoried (static C1, C2; `installer_input_acceptance`);
- every founder-only decision is taken after its lock (static A2; forced-ordering rows);
- every generated record is checked against its generator in the final pass (`transport_compatibility_contract`; `manifest_rehearsal`
  against `predicted_catalog_difference.json`);
- the r3 §3.4 plane-conditioned scan is approximated by the static contract (P0–P7), each class held to the Director's rulings.

**FIXED.** Each fix is in a signed commit of `6ba22e3..c667367`; the area commits and what each changed are listed under "Behaviour
changes by area".

**TESTED.** The final developer pass at the candidate SHA, the mutation proofs, the certified reference suites and the static gates
below.

**PRODUCTION.** Untouched. Every founder action is prepared in `FOUNDER_PREPARED_STEPS.md`.

**BLOCKERS.**
- **BLOCKED — FOUNDER:**
  - C-3, production release-signing key custody;
  - the live migration step (built by the verifier with the Director instrument), the API logins, `tenant_admins`, the observer
    role, the Edge secrets, the function deploy (`ALLOW_FUNCTIONS_DEPLOY=1?`), release storage, and the web PR into `master`;
  - the hosted Edge peer-address measurement (AC-8's per-address clause; CR-015, CR-016).
- **BLOCKED — EXTERNAL:** R-1 on a clean VM and the VM-only reference suites (this PC has no hypervisor and no Windows Sandbox); the
  Supabase-image PostgreSQL judging plane and a CLI-started Brain OS auth stack (no Docker on this PC).
- **DIRECTOR:** none open. Every change request the implementer filed (CR-006..CR-026) is decided in `a0bb7985`.

## Results at the candidate SHA

### Final developer pass (`tools/final_pass.mjs --declarations`; evidence `evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/final/`)

Commit `c667367b6d0fcf02a4d575f050aaa475c644ca7b`; run by `tools/final_pass.mjs` (serial; developer verification, never independent).

| step | exit | seconds | summary | evidence |
|---|---|---|---|---|
| build dev channel | 0 | 17 | [build-sea] BUILT C:\Users\DELL\dev\brain-os-factory-enroll\dist\brain-factory\0.1.0\dev\BrainFactorySetup.exe sha256 54f2e84cc95ac9033ec334e7d63c5b4ca9904404ba | `build_dev_channel.txt` |
| build production channel | 0 | 16 | [build-sea] BUILT C:\Users\DELL\dev\brain-os-factory-enroll\dist\brain-factory\0.1.0\production\BrainFactorySetup.exe sha256 a9bd7ac897c8b113ce67b8acc6358109b6d | `build_production_channel.txt` |
| verify-build dev (IDENTICAL) | 0 | 16 | IDENTICAL: 54f2e84cc95ac9033ec334e7d63c5b4ca9904404bad9ad7270bf4939bbf261e9 (unsigned image), and every build-info field but the signing ones | `verify-build_dev_IDENTICAL_.txt` |
| verify-build production (IDENTICAL) | 0 | 16 | IDENTICAL: a9bd7ac897c8b113ce67b8acc6358109b6d6da826bacabf6ee837c30386ad35f (unsigned image), and every build-info field but the signing ones | `verify-build_production_IDENTICAL_.txt` |
| provenance --check (the declared per-channel builds) | 0 | 31 | dev: rebuilt digest 49e0917f0a7058970c613773d71625bb5faa141cb04538eab68a561bf44e6cb2 (declared 49e0917f0a7058970c613773d71625bb5faa141cb04538eab68a561bf44e6cb2) | `provenance_--check_the_declared_per-channel_builds_.txt` |
| static: factory_v1_static_contract | 0 | 5 | factory_v1_static_contract: 72 passed, 0 failed | `static_factory_v1_static_contract.txt` |
| static: architecture_impact_registry_contract | 0 | 0 | architecture_impact_registry_contract: 17 passed, 0 failed | `static_architecture_impact_registry_contract.txt` |
| static: secret scan self-test | 0 | 0 | secret_scan --selftest: 10/10 rules hit their sample | `static_secret_scan_self-test.txt` |
| static: secret scan | 0 | 0 | secret_scan: clean (0 hits) | `static_secret_scan.txt` |
| static: deno check (Edge functions) | 0 | 2 |  | `static_deno_check_Edge_functions_.txt` |
| static: web tsc | 0 | 4 |  | `static_web_tsc.txt` |
| static: web eslint (changed files) | 0 | 31 |  | `static_web_eslint_changed_files_.txt` |
| static: web next build | 0 | 12 | ✓ Generating static pages using 15 workers (45/45) in 511ms | `static_web_next_build.txt` |
| schema_acceptance | 0 | 10 | schema_acceptance: 82/82 OK | `schema_acceptance.txt` |
| manifest_rehearsal | 0 | 7 | manifest_rehearsal: 6/6 OK | `manifest_rehearsal.txt` |
| takeover_acceptance --transport direct | 0 | 27 | takeover_acceptance [direct]: 20/20 OK | `takeover_acceptance_--transport_direct.txt` |
| takeover_acceptance --transport api | 0 | 28 | takeover_acceptance [api]: 20/20 OK | `takeover_acceptance_--transport_api.txt` |
| compat_regressions --transport direct | 0 | 33 | compat_regressions [direct]: 34/34 OK | `compat_regressions_--transport_direct.txt` |
| compat_regressions --transport api | 0 | 33 | compat_regressions [api]: 34/34 OK | `compat_regressions_--transport_api.txt` |
| transport_compatibility_contract | 0 | 67 | transport_compatibility_contract: 16/16 rows MIGRATED | `transport_compatibility_contract.txt` |
| enrollment_acceptance | 0 | 72 | enrollment_acceptance: 38/38 OK | `enrollment_acceptance.txt` |
| admin_acceptance | 0 | 36 | admin_acceptance: 46/46 OK | `admin_acceptance.txt` |
| revocation_interleaving | 0 | 79 | revocation_interleaving: 30/30 OK | `revocation_interleaving.txt` |
| eligibility_acceptance | 0 | 75 | eligibility_acceptance: 25/25 OK | `eligibility_acceptance.txt` |
| independence_acceptance | 0 | 29 | independence_acceptance: 25/25 OK | `independence_acceptance.txt` |
| edge_db_tls_acceptance | 0 | 9 | edge_db_tls_acceptance: 7/7 OK | `edge_db_tls_acceptance.txt` |
| setup_manifest_locate | 0 | 1 | setup_manifest_locate: 7/7 OK | `setup_manifest_locate.txt` |
| release_trust_unit | 0 | 0 | release_trust_unit: 7/7 OK | `release_trust_unit.txt` |
| runtime_acceptance | 0 | 141 | runtime_acceptance: 13/13 OK | `runtime_acceptance.txt` |
| release_acceptance | 0 | 289 | release_acceptance: 41/41 OK | `release_acceptance.txt` |
| web_computers_acceptance | 0 | 22 | web_computers_acceptance: 7/7 OK | `web_computers_acceptance.txt` |
| sea_package_regression | 0 | 223 | sea_package_regression: 28 passed, 0 failed | `sea_package_regression.txt` |

Every step exited 0 (32 of 32).

### Build declarations (WO-10 release provenance; CR-019)

- Emitted by `tools/provenance.mjs --emit` from a clean checkout of `c667367`, and checked by the final pass's
  `provenance --check` step, which rebuilds both channels and compares them with the declarations.
- Evidence: `evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/build-declarations/` (`dev.build-declaration.json` sha256 `85c140cd5c2cdc42c8707073590cf6a724152affe84f55306ea74a6293410a99`; `production.build-declaration.json` sha256 `f98714992dbada001da0d5ec040d7e419a7b2ffdb73479d0e158e9a3a1a1555f`). They are committed in the evidence / report commit, a child of
  the candidate that changes no build input (the commit `provenance.mjs` calls the candidate-notice commit).
- They are information only, not a WO-6 release manifest. The Director recorded CR-019: at candidate time the candidate's
  release-manifest identity is as this report tabulates it (below).

### Mutation proofs (developer)

| proof | mutants | killed | survivors / not judged / vacuous | evidence |
|---|---|---|---|---|
| v1 new invariants (`qa/factory/v1/v1_mutation_proof.mjs`), 19 suites, one invocation per suite, each with its control | 397 | **397** | 0 | `evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/v1_mutation/` |
| SEA packaging (`qa/factory/sea_package_mutation_proof.mjs`), 4 batches | 30 | **30** | 0 | `evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/sea_mutation/` |
| certified `acceptance_mutation_proof` at its 69df2f52 bytes, by label in 8 chunks | 60 runnable | **60** | 0 | `evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/reference/acceptance_mutation_proof.chunk-*.txt` |

Every mutant ran at `c667367b6d0fcf02a4d575f050aaa475c644ca7b` (the proofs clone this commit). v1 per suite:

| suite | killed | control |
|---|---|---|
| static | 73 of 73 | passed: factory_v1_static_contract: 72 passed, 0 failed |
| schema | 59 of 59 | passed: schema_acceptance: 82/82 OK |
| admin | 54 of 54 | passed: admin_acceptance: 46/46 OK |
| eligibility | 31 of 31 | passed: eligibility_acceptance: 25/25 OK |
| release | 26 of 26 | passed: release_acceptance: 41/41 OK |
| independence | 25 of 25 | passed: independence_acceptance: 25/25 OK |
| enrollment | 17 of 17 | passed: enrollment_acceptance: 38/38 OK |
| pairing | 17 of 17 | passed: pairing_concurrency_acceptance: 12/12 OK |
| units | 17 of 17 | passed: runtime_units: 26/26 OK |
| installer | 16 of 16 | passed: installer_input_acceptance: 10/10 OK |
| releaseunit | 14 of 14 | passed: release_trust_unit: 7/7 OK |
| revocation | 12 of 12 | passed: revocation_interleaving: 30/30 OK |
| recovery | 10 of 10 | passed: runtime_recovery_acceptance: 11/11 OK |
| takeover | 7 of 7 | passed: takeover_acceptance [direct]: 20/20 OK |
| legacydirector | 6 of 6 | passed: legacy_director_acceptance [direct]: 8/8 OK |
| edge | 5 of 5 | passed: edge_boundary_acceptance: 8/8 OK |
| gate | 5 of 5 | passed: gate_acceptance: 6/6 OK |
| tls | 2 of 2 | passed: edge_db_tls_acceptance: 7/7 OK |
| isolation | 1 of 1 | passed: isolation_env_unit: 3/3 OK |

SEA batches: batch-00 (P1 P2 P3 U1 U2 U3 T1 N1): 8 of 8; batch-01 (N2 E1 E2 E3 C1 C2 C3 R1): 8 of 8; batch-02 (R2 R3 R4 R5 R6 R7 R8): 7 of 7; batch-03 (R9 X1 X2 A1 A2 DK1 DK2): 7 of 7.

The certified acceptance proof refuses to run whole at 69df2f52 itself (the anchors of N37x and N19 are absent from the certified files); of its other 69 mutants, 60 run by label and 9 (`acceptance.mjs` M N O Q P S3 G3 R S) are not judgeable from a clone of this branch — both baseline findings, unchanged from candidate #1: the certified proof and the files it mutates are at their 69df2f52 bytes.

### Certified reference suites at their 69df2f52 bytes (VERIFICATION_SPEC §3.7)

Evidence `evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/reference/group1..4/` (one file per suite; `SUMMARY.txt` per group). Every suite file is byte-identical to 69df2f52 (the runner checks it first).

| suite | exit | summary |
|---|---|---|
| acceptance | 0 | factory acceptance: 58 passed, 0 failed |
| campaign_boundary_is_crossed | 1 | campaign_boundary_is_crossed: 21 passed, 1 failed |
| dbtest_on_disposable_pg | 0 | concurrency: TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN — VERIFIED under real concurrency (real PostgreSQL, two connections) |
| dedicated_supabase_provisioning | 0 | dedicated_supabase_provisioning: 11 passed, 0 failed  (disposable TLS server dressed as a Supabase project; nothing reached any real project) |
| denominator_cannot_shrink_silently | 0 | denominator_cannot_shrink_silently: 8 passed, 0 failed |
| founder_poke_not_required | 0 | founder_poke_not_required: 12 passed, 0 failed |
| health_check | 0 | health_check: 10 passed, 0 failed |
| http_provider_acceptance | 0 | http_provider_acceptance: 9 passed, 0 failed  (stub provider on 127.0.0.1:56037, disposable plane; nothing reached a real provider) |
| instrument_validity.regression.test | 0 | instrument_validity.regression.test: 20 passed, 0 failed |
| model_catalog_must_not_advertise_untested_models | 0 | 15 pass, 0 fail |
| no_silent_model_fallback | 0 | 12 pass, 0 fail |
| package_bootstrap_mutation_proof (static) | 0 | package_bootstrap_mutation_proof: 15 of 15 (control green + mutants killed)  (static mutants only; --fresh adds the original defect and thirty-four fr |
| package_bootstrap_regression --static | 0 | package_bootstrap_regression: 7 passed, 0 failed  (static rows only) |
| tls_plane_acceptance | 0 | tls_plane_acceptance: 9 passed, 0 failed  (plane served on 192.168.1.7:58156 with ssl=on, hostssl-only; disposable, removed) |
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

Non-zero exits, each classified (none is a candidate defect):
- `campaign_boundary_is_crossed`: BASELINE FINDING: row R1 (a handler in handlers/ is not registered with the director). R1 reads only `scripts/factory-runner/handlers/` and `director-start.mjs`, byte-identical to 69df2f52 at the candidate; reproduced on a clean 69df2f52 clone for candidate #1
- `scripts/factory-runner/round-state.regression.test`: ENVIRONMENT (registered in VERIFICATION_SPEC §3.7): RS-C0 reads two worktrees that exist only on the original machine; the same at 69df2f52 on this machine
- `scripts/factory-runner/supervisor.injection.mutation`: BASELINE FINDING: 4 of 5 proven; the R-D9 anchor (`shell: true` in the SQL transport) is absent from the certified `supervisor.mjs`

NOT RUN, by rule: `package_bootstrap_regression` fresh-clone rows and `package_bootstrap_mutation_proof --fresh` (S-15: they re-register this PC's live task); `reboot_recovery_acceptance` and `factory_v1_acceptance --local-only` (BLOCKED — EXTERNAL: VM only); `shared_plane_live_acceptance`, `two_machine_real`, `two_machine_failover`, `two_machine_scheduling` (S-15: live state).

### The migration under the live applying login (F-1; AC-10, AC-11)

`qa/factory/v1/applying_role_plane.mjs --tree c667367b6d0fcf02a4d575f050aaa475c644ca7b`: the committed blobs of the candidate migration, applied as the step the Director instrument builds, by a NOSUPERUSER applying login that holds `factory_runner` with ADMIN only (a superuser is refused). Result: **applying_role_plane [tree c667367b6d0fcf02a4d575f050aaa475c644ca7b, director c7a845b6]: 13/13 OK**. Evidence `evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/applying_role_plane/applying_role_plane.txt`.

- PASS M0 - no 69df2f52 control-plane file changed at c667367b6d0f
- PASS M1 - the Director instrument (c7a845b6) built the step: sha256 72fbe8a897242cdbdd095c92730aac9e9cdd9cd568ca42b0567b4e906da14d9d
- PASS P0 - createrole_self_grant = "" (live "")
- PASS P1 - the applying login is postgres: rolsuper=false rolinherit=true rolcreaterole=true rolcreatedb=true rolcanlogin=true rolreplication=true rolbypassrls=true
- PASS P2 - provisioned as 69df2f52 AS postgres; postgres holds factory_runner [{"a":true,"i":false,"s":false}] (live true/false/false)
- PASS P3 - baseline evidence rows loaded unchanged: {"nodes":4,"work_orders":10,"work_order_dependencies":0,"agent_runs":12,"checkpoints":12}
- PASS S1 - the live-migration step committed AS postgres (NOSUPERUSER), step sha256 72fbe8a897242cdbdd095c92730aac9e9cdd9cd568ca42b0567b4e906da14d9d; tables in schema factory now 28
- PASS W1 - no pre-existing table in any schema (9 tables outside the system catalogs) gained, lost or changed a row: its row hashes over every column it had are equal before and after the migration
- PASS W2 - the tables the migration created (19, any schema) hold only the one operator tenant row - holding no user id and referring to no computer, principal, credential or envelope - and contract §1
- PASS W3 - no computer, agent principal, credential, envelope, pairing code, enrollment attempt, tenant_admins, release, release revocation or certification row, and no S-16(a) binding - {"computers":0
- PASS W4 - in every column the migration added to a pre-existing table (52), no pre-existing row holds a value that refers to a computer, principal, credential or envelope (reference columns - by forei
- PASS W5 - no object the migration defines or changes (a function new or replaced, a column default new or set on a pre-existing column, a view, policy, trigger, constraint) holds a constant that ident
- PASS W6 - no column default writes the S-16(a) binding (s16a_bound_at / s16a_bound_by have none)

**Installer / release integrity (stage 7).**

- `provenance_check.txt`: MATCH: both channels' rebuilds of c667367b6d0fcf02a4d575f050aaa475c644ca7b equal the declarations in D:\FactoryQA\implementer\c2-c667367\build-declarations
- `verify-build_dev.txt`: IDENTICAL: 54f2e84cc95ac9033ec334e7d63c5b4ca9904404bad9ad7270bf4939bbf261e9 (unsigned image), and every build-info field but the signing ones
- `verify-build_production.txt`: IDENTICAL: a9bd7ac897c8b113ce67b8acc6358109b6d6da826bacabf6ee837c30386ad35f (unsigned image), and every build-info field but the signing ones

### Static gates

| gate | result |
|---|---|
| `node --check` | every changed `.mjs` |
| Edge `deno check` (Deno 2.5.6) | both functions green |
| web | `tsc`, `eslint` on the changed files, `next build` |
| one engine, route inventory = S-7, plane-conditioned scan (P0–P7, each class held to the Director's rulings), placement, whole-request gate inventory, migration privilege model, input channels | `qa/scenarios-runner/factory_v1_static_contract.mjs` (factory_v1_static_contract: 72 passed, 0 failed) |
| capability-impact registry | `architecture_impact_registry_contract` |
| secret scan | `tools/secret_scan.mjs`: 10 rules, positive-control self-test, clean at the candidate (base: the designated Director commit) |

## Finding dispositions (the 87 records of the `412ac14` verification, plus the consolidated F-1)

- 88 records (the 87 of the `412ac14` verification and the consolidated F-1); every record has a disposition; none OPEN, PARTIAL or pending.
- By state: 72 FIXED — CLOSED; 6 REFUTED (acknowledged); 2 CLOSED BY DIRECTOR RULING (no code change); 4 FIXED, with a VM half BLOCKED — EXTERNAL (R-1 clean VM); 2 FIXED locally, with the hosted measurement BLOCKED — FOUNDER (deploy); 2 ENVIRONMENT (acknowledged; BLOCKED — EXTERNAL).
- The five BLOCKER groups: F-1 (F-1, L7-28, L1-F11, L6-5); B-2 (L1-F1, L6-X1, L1-F2, L6-X2, L1-F7); B-3 (L2-F2, L3-F2, L4-F5, L6-1); B-4 (L1-F5, L2-F1, L6-X3); B-5 (L4-F1) — all resolved.
- The 26 MAJOR records, each dispositioned: 20 FIXED — CLOSED; 4 FIXED, with a VM half BLOCKED — EXTERNAL (R-1 clean VM) (L3-F1, L4-F4, L7-17, L4-F3); 2 FIXED locally, with the hosted measurement BLOCKED — FOUNDER (deploy) (L2-F4, L3-F4).
- Stated residuals, named by ID only here and sent privately: L2-F3, L3-F2, L3-F3, L3-F7, L3-F9, L4-F1, L4-F6, L4-F10, L7-10.

| finding | severity | packet group | area | disposition state | requirement ids |
|---|---|---|---|---|---|
| F-1 | BLOCKER | F-1 | A1 | FIX + EXECUTION - CLOSED at developer level | AC-10, AC-11, S-11, VERIFICATION_SPEC §3.3/§5 |
| L7-28 | BLOCKER | F-1 | A1 | FIX + EXECUTION - CLOSED | AC-11, AC-10 |
| L1-F11 | INFORMATIONAL | F-1 | A1 | FIX + EXECUTION - CLOSED | (private package) |
| L6-5 | MEDIUM | F-1 | A1 | FIXED - CLOSED; the predicted pg_auth_members rows are listed in the candidate report (Migration privilege model) | AC-10, S-11, AC-11 |
| L1-F6 | MEDIUM |  | A1 | FIXED - CLOSED: step R is the post-V1 rotation runbook (CR-006 APPROVED, Director CR-disposition record a0bb7985) | (private package) |
| L1-F9 | INFORMATIONAL |  | A1 | FIX + EXECUTION - CLOSED | (private package) |
| L6-9 | INFORMATIONAL |  | A1 | FIXED - CLOSED: storage.buckets is the founder's observer provisioning, not a prepared step (CR-025 APPROVED) | AC-10, VERIFICATION_SPEC §6 |
| L6-7 | INFORMATIONAL |  | A1 | FIX - CLOSED | S-12, S-11 |
| L7-18 | NONE |  | A1 | REFUTED (acknowledged); founder step 1 rewritten to the WO-1 r3 form anyway | (private package) |
| L1-F1 | BLOCKER | B-2 | A2 | FIX + regressions - CLOSED at developer level | (private package) |
| L6-X1 | BLOCKER | B-2 | A2 | FIX (same change as L1-F1) - CLOSED | S-10, S-13, AC-9, AC-12(g), AC-14 |
| L1-F2 | MAJOR | B-2 | A2 | FIX - CLOSED | (private package) |
| L6-X2 | MAJOR | B-2 | A2 | FIX (same change as L1-F2) - CLOSED | S-10, S-4, S-13, AC-7, AC-12(g) |
| L1-F7 | INFORMATIONAL | B-2 | A2 | FIX (by the L1-F1 change) - CLOSED; no column-level grant added (optional clause) | (private package) |
| L1-F10 | INFORMATIONAL |  | A2 | FIX - CLOSED | (private package) |
| L1-F8 | INFORMATIONAL |  | A2 | CLOSED BY DIRECTOR RULING, no code change (CR-007 APPROVED option 1) | (private package) |
| L1-F3 | MAJOR |  | A2 | FIX + regressions - CLOSED | (private package) |
| L1-F5 | BLOCKER | B-4 | A3 | FIX + forced-interleaving regression - CLOSED at developer level | (private package) |
| L2-F1 | BLOCKER | B-4 | A3 | FIX - CLOSED (plus audited stale_state and required expected_version) | S-8, AC-7, AC-4 |
| L6-X3 | BLOCKER | B-4 | A3 | FIX - CLOSED | S-8, AC-7, WO-8 |
| L7-13 | MAJOR |  | A3 | FIX (test-only) - CLOSED | AC-7 |
| L2-F3 | MAJOR |  | A3 | FIXED - CLOSED server side; the web half is proven statically (static A3, mutant WA) | contract §9, AC-4, P-5, P-9, S-12 |
| L3-F8 | MEDIUM |  | A3 | FIX - CLOSED | P-9, AC-4, contract §2 |
| L5-F9 | MEDIUM |  | A3 | FIXED - CLOSED; the candidate report states that the revoked verifier's run lease and updated_at change (Behaviour changes by area) | contract §2, WO-9, AC-4, AC-16 |
| L7-24 | MEDIUM |  | A3 | FIX (test-only) - CLOSED | AC-4, AC-6(e) |
| L7-11 | NONE |  | A3 | REFUTED (acknowledged) | (private package) |
| L2-F5 | MEDIUM |  | A3 | FIX - CLOSED (same class fixed in node_api.ts) | S-7, AC-7, AC-10, P-9 |
| L2-F2 | BLOCKER | B-3 | A6 | FIX + EXECUTION - CLOSED at developer level | S-12, AC-8, AC-10, WO-4 |
| L3-F2 | BLOCKER | B-3 | A6 | FIXED - CLOSED (a stated residual, sent privately) | S-12, AC-8, AC-10, WO-3, WO-4 |
| L4-F5 | BLOCKER | B-3 | A6 | FIXED - CLOSED (runtime_acceptance at the candidate SHA: exit 0) | S-12, AC-8, AC-10, WO-4 |
| L6-1 | BLOCKER | B-3 | A6 | FIX - CLOSED | S-12, AC-8, AC-10, WO-3 |
| L4-F1 | BLOCKER | B-5 | A6 | FIXED + EXECUTION - CLOSED at developer level (the regression's sentinel and logon are met by a recorded equivalence, sent privately) | AC-5(c), S-5, WO-4, WO-6 |
| L3-F1 | MAJOR |  | A6 | FIXED - CLOSED at developer level (CR-010 RECORDED: the r3 reading stands); the R-1 clean-VM rehearsal is BLOCKED - EXTERNAL | AC-1, R-1, P-4, WO-3, contract §7 |
| L4-F4 | MAJOR |  | A6 | FIXED (the page) - CLOSED at developer level (CR-010 RECORDED); the R-1 clean-VM rehearsal is BLOCKED - EXTERNAL | AC-1, R-1, P-4, WO-4 |
| L4-F7 | MEDIUM |  | A6 | FIX - CLOSED | S-12, S-7 |
| L4-F6 | MEDIUM |  | A6 | FIXED - CLOSED (the rotation half rests on runtime_recovery RC2 and the unconditional DPAPI store) | WO-4, S-12 |
| L4-F10 | INFORMATIONAL |  | A6 | FIX - CLOSED (metadata check, as stated) | WO-6, AC-5(h) |
| L6-3 | MEDIUM |  | A6 | FIX - CLOSED | S-12, S-6, WO-10 |
| L4-F9 | NONE |  | A6 | REFUTED (acknowledged) | (private package) |
| L6-8 | NONE |  | A6 | REFUTED (acknowledged); a static guard was added | (private package) |
| L1-F4 | MAJOR |  | A4 | FIXED - CLOSED (CR-011 APPROVED option 3, recorded as Director campaign policy) | (private package) |
| L5-F3 | MAJOR |  | A4 | FIXED - CLOSED (CR-011 APPROVED option 3) | S-16(b), AC-14(i), AC-3, P-9, S-14, AC-12(e) |
| L7-09 | MAJOR |  | A4 | FIX (test-only) - CLOSED | AC-15 |
| L7-10 | MAJOR |  | A4 | FIXED (test-only) - CLOSED; gate-order swaps covered by O2 and three adjacent-swap mutants | AC-15 |
| L7-17 | MAJOR |  | A4 | FIXED + EXECUTION - CLOSED locally; the VM half is BLOCKED - EXTERNAL | AC-14(p), R-3 |
| L7-05 | MAJOR |  | A4 | FIX (test-only) - CLOSED | AC-5(g), AC-3 |
| L5-F5 | MEDIUM |  | A4 | FIX (test-only) - CLOSED | AC-15, WO-5 |
| L5-F4 | MEDIUM |  | A4 | FIX - CLOSED | P-2, AC-9, P-6 |
| L5-F7 | MEDIUM |  | A4 | FIXED - CLOSED: the refusal is named and queue age kept; no hold or cap (CR-014 APPROVED option 4: none) | AC-16, P-10, P-9, WO-9 |
| L5-F8 | INFORMATIONAL |  | A4 | CLOSED BY DIRECTOR RULING, no code change (CR-012 APPROVED option 1) | AC-3 |
| L7-22 | MEDIUM |  | A4 | FIX (test-only) - CLOSED | AC-14(a), AC-14(k) |
| L3-F3 | MAJOR |  | A5 | FIXED - CLOSED (a stated residual, sent privately) | S-6, AC-8, WO-3 |
| L2-F4 | MAJOR |  | A5 | FIXED - local execution CLOSED; the hosted peer-address measurement is BLOCKED - FOUNDER (deploy); CR-015 and CR-016 RECORDED (the r3 readings stand) | S-6, AC-8, P-4, AC-1 |
| L3-F4 | MAJOR |  | A5 | as L2-F4: FIXED locally; hosted measurement BLOCKED - FOUNDER (deploy); CR-015 RECORDED | S-6, AC-8, AC-1, P-4 |
| L7-02 | MAJOR |  | A5 | FIX (test-only) - CLOSED | AC-7, AC-10, S-2 |
| L7-03 | MAJOR |  | A5 | FIX - CLOSED | AC-10, S-10 |
| L7-04 | MAJOR |  | A5 | FIX - CLOSED | AC-7, AC-10 |
| L3-F6 | MEDIUM |  | A5 | FIX - CLOSED | S-6, contract §2, AC-8 |
| L3-F7 | MEDIUM |  | A5 | FIXED - CLOSED with stated residuals (detail sent privately); CR-016 RECORDED | S-6, AC-8, AC-1, contract §6 |
| L3-F9 | MEDIUM |  | A5 | FIXED - CLOSED; follows AC-4 / L7-24 (the verifier judges the reading; detail sent privately) | contract §9, AC-4, P-9, S-6 |
| L2-F6 | MEDIUM |  | A5 | FIXED - CLOSED (a lease-default side effect found in review was fixed before the candidate) | P-6, P-9, AC-4, AC-15 |
| L7-15 | MEDIUM |  | A5 | FIX (test-only) - CLOSED | AC-8 |
| L7-26 | INFORMATIONAL |  | A5 | FIX (test-only) - CLOSED | AC-8 |
| L3-F5 | MAJOR |  | A7 | FIX - CLOSED | contract §9, WO-4, AC-1 |
| L4-F2 | MAJOR |  | A7 | FIX - CLOSED | AC-5(m), WO-6 |
| L4-F3 | MAJOR |  | A7 | FIXED - CLOSED at developer level (runtime_acceptance at the candidate SHA: exit 0); the R-1 clean-VM rehearsal is BLOCKED - EXTERNAL | AC-1, WO-4, P-2, AC-9 |
| L5-F1 | MAJOR |  | A7 | FIX - CLOSED | AC-6(e), AC-16, P-10, WO-9 |
| L5-F2 | MAJOR |  | A7 | FIXED - CLOSED (CR-018 RECORDED: the r3 behaviour stands) | P-7, P-6, AC-15, P-2, P-10 |
| L5-F6 | MEDIUM |  | A7 | FIX - CLOSED | P-2, AC-9, AC-4, R-4 |
| L4-F8 | MEDIUM |  | A7 | FIX - CLOSED | S-5, AC-5(c) |
| L7-29 | MEDIUM |  | A7 | FIX (test-only) - CLOSED | AC-9, AC-15 |
| L6-4 | INFORMATIONAL |  | A7 | FIXED (test tooling) - CLOSED (CR-017 APPROVED: the r3 rule stands) | S-15, WO-10 |
| L7-01 | MAJOR |  | A8 | FIX (test-only) - CLOSED | AC-5 |
| L7-07 | MAJOR |  | A8 | FIX - CLOSED | AC-5(k), AC-5(n) |
| L7-06 | MEDIUM |  | A8 | FIX (test-only) - CLOSED | AC-5(d), AC-5(f) |
| L7-08 | MEDIUM |  | A8 | FIXED - CLOSED: the per-channel build declarations are emitted from the frozen SHA and checked by the final pass (CR-019 RECORDED) | AC-5(h) |
| L7-23 | INFORMATIONAL |  | A8 | FIX (test-only) - CLOSED | AC-5(j) |
| L6-6 | MEDIUM |  | A8 | FIXED - CLOSED (CR-020 RECORDED: the r3 behaviour stands) | S-5, AC-5(f), WO-6 |
| L7-27 | MEDIUM |  | A8 | FIXED (same as L6-6) - CLOSED | AC-5(f) |
| L4-F11 | NONE |  | A8 | REFUTED (acknowledged); optional hardening delivered under L6-6 | (private package) |
| L7-12 | INFORMATIONAL |  | A9 | FIX (test-only) - CLOSED | AC-6(b), AC-5 |
| L7-20 | INFORMATIONAL |  | A9 | FIX (test-only) - CLOSED | AC-12 |
| L7-21 | INFORMATIONAL |  | A9 | FIX (test-only) - CLOSED at developer level (the verifier plants its own) | AC-9, AC-10, AC-12, AC-14, AC-5 |
| L7-25 | INFORMATIONAL |  | A9 | FIX (test-only) - CLOSED | AC-7, AC-9 |
| L7-16 | MEDIUM |  | A9 | FIXED (test-only) - CLOSED: the developer §3.4 scan is delivered and static P3p is GREEN on the CR-021, CR-022 and CR-026 rulings | AC-9 |
| L7-14 | NONE |  | A9 | ENVIRONMENT (acknowledged) - BLOCKED - EXTERNAL (no Docker / Supabase CLI on this PC) | AC-7 |
| L7-19 | NONE |  | A9 | ENVIRONMENT (acknowledged) - BLOCKED - EXTERNAL (R-1 clean VM) | AC-1, R-1 |
| L6-2 | NONE |  | A9 | REFUTED (acknowledged) | (private package) |

## Change requests the candidate relies on (VERIFICATION_SPEC §2)

| CR | path | commit | sha256 | decision |
|---|---|---|---|---|
| CR-001 | `qa/work-orders/change-requests/CR-001-factory-admin-allow-list.md` | `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` | `bea0218d706f8cf0d623c8ebe022b586ecf104db8bc775acbea781eeadd36009` | RATIFIED (S-8, tier) |
| CR-002 | `qa/work-orders/change-requests/CR-002-verification-failure-state.md` | `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` | `502fdda6fd7e342ff1602fe364650d7ad3702e7fc2d01332412a4ac2eaa1948e` | RATIFIED (`VERIFICATION_FAILED`) |
| CR-003 | `qa/work-orders/change-requests/CR-003-founder-only-release-tier.md` | `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` | `55ced1fb68851233c723f859c167bf77e1b2641be72733a8979a7de4fb0ca2f1` | RATIFIED (founder tier) |
| CR-004 | `qa/work-orders/change-requests/CR-004-installer-distribution-visibility.md` | `33f14d6e55a41ee1a2a5acf463a000e3fe2975b9` | `b8fd5368ec01732257b499c39163915615285e26ee809a12d5d27daa1711d863` | DECIDED: Option A |
| CR-005 | `qa/implementation/auto-enrollment-v1/change-requests/CR-005-implementer-signing-key.md` | `c838f5c9`, amended `6719a8e9` | `aba57d6d82a1ed76fc818de13c9cc73d2fcccfe8440c0cbaf8b75e1a7fbc44b1` | RATIFIED; key CONFIRMED |
| CR-006 | `qa/implementation/auto-enrollment-v1/change-requests/CR-006-post-v1-runner-rotation.md` | `8f740cccd4ff772c34e3dcec3129e6a7dfd81ee5` | `d81488d95a3e052807d24efd3959463e06e489ae9301256eeaad04f35934ff69` | APPROVED (requested change) (`a0bb7985`) |
| CR-021 | `qa/implementation/auto-enrollment-v1/change-requests/CR-021-fail-closed-checks-plane-scan-class.md` | `8f740cccd4ff772c34e3dcec3129e6a7dfd81ee5` | `759365d3b3ce1d241cc7ae21ba1f116981680a59aed0116f69b58db97a828cc0` | APPROVED (Alternative 1) (`a0bb7985`) |
| CR-022 | `qa/implementation/auto-enrollment-v1/change-requests/CR-022-plane-scan-literals-and-engine-test.md` | `8f740cccd4ff772c34e3dcec3129e6a7dfd81ee5` | `96897e551a4b493a0c6e9843fd082df6ba541029f67dadb986d0fbd2406c39f0` | APPROVED (`a0bb7985`) |
| CR-026 | `qa/implementation/auto-enrollment-v1/change-requests/CR-026-founder-step-3-guard-identity-reads.md` | `8f740cccd4ff772c34e3dcec3129e6a7dfd81ee5` | `6b145aab6c9c172dc4654c5249ab0a14c3e28f3a3e4c213dd0c2891c40dac7a0` | APPROVED (same basis as CR-022(b)) (`a0bb7985`) |

- CR-006: step R is the post-V1 rotation runbook. CR-021, CR-022 and CR-026 are the §3.4 classes the static contract's P3p holds
  to the Director's record; the verifier names each hit's construction in its receipt, as the rulings say.
- The candidate relies on none of CR-007..CR-020 or CR-023..CR-025. Each is recorded in `a0bb7985` as its r3-conforming reading, and
  the candidate keeps the r3 behaviour in each.

## Behaviour changes by area (since `412ac14`; each commit's message lists its changes)

| area | commit | what changed |
|---|---|---|
| Control plane v1 (migration, guards, front doors) | `a33ab31` | applies as the live applying login; pinned search_path and catalog-typed engine test; founder-only decisions on the locked current row in the caller's tenant; scheduling, enrollment and S-14 / S-16 r3 rules; the claim's bounded advisory lock; part 000 carries no catalog pre-checks and part 990 keeps its named revokes and checks (c), (d) |
| Edge handlers | `8458128` | one front door per route, own-property lookups, typed bodies; a receipt carries a code only when the plane stored it; one derivation of the peer address with named outcomes; named session-exchange and configuration refusals; `PEPPER_VERSION` a constant; the Admin API fails closed through token verification when `BRAIN_OS_*` is unset |
| Node runtime, installer and build | `f87d228` | no pairing code on any command line; setup on an enrolled home passes the upgrade gate; https or loopback only; DPAPI-only key storage; toolchain checked against the lockfile; lost replies resolved with the stored key; one supervisor and one worker per home; envelope changes followed live; numeric priority; monotonic lease guard; grow-only revocation list; trust mode and endpoint fixed at build; the machine fingerprint encoding of contract §1 r3 |
| Web Computers page | `6f90b13` | derived computer state per contract §1 r3; receipts without stale codes; refusals by name; per-channel setup steps |
| Developer suites | `67277d2` | every plane applies the migration as the live applying login; rows and mutants per finding; replacement rows for the removed in-migration checks |
| Static gates | `ed61dcd`, `2619b34` | the r3 §3.4 scan approximation and its inventory; migration privilege-model rows; P3p held to the Director's CR-disposition record |
| Implementer records | `0822f27`, `8f740cc`, `2619b34`, `c667367` | founder steps under WO-1 r3 (step R); `MIGRATION_PRIVILEGES.md`; `predicted_catalog_difference.json`; change requests CR-006..CR-026; the regenerated compatibility matrix |

Revoking or archiving a verifier gives its verification claim back at once: the revoked verifier's run lease and its `updated_at`
change (L5-F9; `independence_acceptance` (r), `revocation_interleaving` I6).

WO-6's refusal cases are the `release_acceptance` rows R-a…R-t (and R-i2, R-B5a…d) and `release_trust_unit`; the per-row names are in
the evidence files.

## What each work order asked the report to include

| WO | item | where |
|---|---|---|
| WO-1 | every table, function, role and grant with the catalog read-back; the seeded policy and operator tenant rows; no secret stored; envelope immutability by a node; the legacy refusals as `factory_runner`; manifest preservation with the step the Director instrument builds | `INVENTORY.md`; `schema_acceptance` (schema_acceptance: 82/82 OK); `manifest_rehearsal` (manifest_rehearsal: 6/6 OK); `MIGRATION_PRIVILEGES.md`; `predicted_catalog_difference.json` |
| WO-2 | the compatibility matrix with every VERDICT backed by a passing regression; the §6 evidence from server rows; the static handler inventory | `COMPATIBILITY_MATRIX.md` (16 of 16 MIGRATED); `compat_regressions` direct + api; `transport_compatibility_contract`; static O1–O3 |
| WO-3 | transitions and failure states; abuse cases at their bounds, including a spoofed forwarding header; the CSPRNG and its entropy; no pepper and no plain SHA-256 | `enrollment_acceptance` (enrollment_acceptance: 38/38 OK); `pairing_concurrency_acceptance` (mutation proof controls) |
| WO-4 | a clean-machine rehearsal on a non-acceptance machine; the installed footprint | **BLOCKED — EXTERNAL** for a clean VM. On this PC: `runtime_acceptance` (runtime_acceptance: 13/13 OK); `sea_package_regression` (sea_package_regression: 28 passed, 0 failed) |
| WO-5 | a test per gate and each gate removed singly; best resources with no authorization; a self-reported capability outside the envelope; preferred node unavailable; the Home-authoring restriction (AC-15); numeric priority | `eligibility_acceptance` (eligibility_acceptance: 25/25 OK); v1 mutation proof, eligibility suite |
| WO-6 | the manifest format and key-id model; the start-path verification point; every refusal case; rotation / revocation; no production key material | `release_acceptance` (release_acceptance: 41/41 OK); `release_trust_unit` (release_trust_unit: 7/7 OK); release provenance below |
| WO-7 | a revoke committing while a session is valid and a run in flight, then every node operation refused; evidence intact | `revocation_interleaving` (revocation_interleaving: 30/30 OK) |
| WO-8 | the persona × path matrix including the self-promoted employee; the allowlist probe; the row-for-row server comparison; the S-16(a) binding cases of AC-12(e) | `admin_acceptance` (admin_acceptance: 46/46 OK); `web_computers_acceptance` (web_computers_acceptance: 7/7 OK); the AC-12(e) VM run is BLOCKED — EXTERNAL |
| WO-9 | AC-14 (a)–(p); the policy-write refusal; the certification record format | `independence_acceptance` (independence_acceptance: 25/25 OK); `admin_acceptance`; `factory.certifications` (050) |
| WO-10 | the suite results; manifest preservation; release provenance inputs; the secret scan; the frozen SHA; the Director commit | this report |

## Migration privilege model (L6-5; `MIGRATION_PRIVILEGES.md`, `predicted_catalog_difference.json`)

The catalog difference the migration makes, predicted and compared by `manifest_rehearsal`, includes exactly these
`pg_auth_members` rows:

| granted role | member | admin | inherit | set | grantor |
|---|---|---|---|---|---|
| `factory_admin_api` | `postgres` | true | false | false | `supabase_admin` |
| `factory_node_api` | `postgres` | true | false | false | `supabase_admin` |
| `factory_owner` | `postgres` | false | false | true | `postgres` |
| `factory_owner` | `postgres` | true | false | false | `supabase_admin` |

The creator-grant rows are PostgreSQL 16+ behaviour for a role created by a NOSUPERUSER login; the migration reads and names no
applying login.

## Release provenance inputs (S-5; WO-10)

| channel | runtime version | source commit | dirty | built_at | digest (PE Authenticode image hash, SHA-256) | file sha256 (unsigned) | trust mode | trust set (key id, sha256 of the public key) | default API |
|---|---|---|---|---|---|---|---|---|---|
| production | 0.1.0 | `c667367b6d0fcf02a4d575f050aaa475c644ca7b` | false | 2026-09-30T11:01:12.000Z | `29698cacc284e841a5d39dee749f12ae4383fea744a9c9b553362e73274f0264` | `a9bd7ac897c8b113ce67b8acc6358109b6d6da826bacabf6ee837c30386ad35f` | production | **empty** (no key before C-3) | https://npvhuoozkbexddnvkqsj.supabase.co/functions/v1/factory-node-api |
| dev | 0.1.0 | `c667367b6d0fcf02a4d575f050aaa475c644ca7b` | false | 2026-09-30T11:01:12.000Z | `49e0917f0a7058970c613773d71625bb5faa141cb04538eab68a561bf44e6cb2` | `54f2e84cc95ac9033ec334e7d63c5b4ca9904404bad9ad7270bf4939bbf261e9` | dev | `ed25519:98601d6850ee07dee28b13e1dfd6de3f737b4e730c20fe3b8a620c9cc99536e6` / `98601d6850ee07dee28b13e1dfd6de3f737b4e730c20fe3b8a620c9cc99536e6` | (none: dev) |

- Base executable: node v24.19.0 `win-x64/node.exe`, sha256 `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237` (pinned; source https://nodejs.org/dist/v24.19.0/SHASUMS256.txt), signature stripped before injection.
- Reproducibility: `verify-build.mjs` rebuilds each channel from the same commit and reports IDENTICAL (final pass steps 3-4; `release_acceptance` R-h, which also compares every embedded trust entry with a recomputation from the committed trust source). The per-channel build declarations (`provenance.mjs --emit`, committed in the candidate-notice commit) are the implementer's information-only evidence of the same facts, not the candidate's release manifest unless the Director so decides (CR-019); `provenance.mjs --check`, run in a clean checkout of the frozen SHA, compares them with a fresh rebuild.
- Control-plane migration: `scripts/factory-control-plane/migration.mjs compose` (a developer label: its sha256 is `58bc2274a7d3c459107381646374e5a7c09294e02423c13e2b745cc4fd6827b1`, not the step's). The live-migration step is not built here: the verifier builds it from the candidate migration's committed bytes with the Director instrument `qa/verification/auto-enrollment-v1/tools/build_live_migration_step.mjs` (WO-1 r3), and the founder applies exactly that file.
- No production key material: the production trust set is empty, and the only key anywhere is the dev key (public seed; disposable planes only). The build refuses a production trust set that holds a dev key, and a dev trust set that holds any other key. The release receipts, and the digest the founder signs, come from the verifier's rebuild at the CERTIFIED SHA, not from this table.

## Decisions requested

1. **C-3 (founder):** production release-signing key custody. Until then the production trust set is empty
   (`scripts/factory-runner/enrolled/trust/production.json`), so no live-mode release exists, and AC-1..AC-4 final acceptance waits.
2. **S1 and its extended vectors (founder; Brain OS, not Factory):** `profiles_update_self_or_admin` lets a user set their own
   `profiles.role` (V2: invitation self-promotion; V3: a `people.profile_id` rebind). The Factory is fenced from them (`tenant_admins`
   required, CR-001; `admin_acceptance` P2 and web W3 refuse a self-promoted employee). Brain OS itself still needs the founder's fix.

## Known limitations (stated, not hidden; details of unfixed residuals went to the Director privately)

- **UNMEASURED until the founder's deploy:** the Edge platform's wall-clock and CPU limits; the peer address the hosted runtime
  reports (AC-8's per-address clause is BLOCKED, never measured here); whether the platform strips the function path prefix (route.ts
  accepts both shapes); postgres.js over the pooler under load; verify-full to the real pooler host with the downloaded CA.
  `FOUNDER_PREPARED_STEPS.md` §5 lists the mandatory post-deploy live acceptance.
- **Judging-plane fidelity:** every PostgreSQL suite ran on embedded PostgreSQL 18, not the Supabase-image plane.
- **Record-level residuals** with a stated reading: L2-F3 (the web half is proven statically), L3-F2, L3-F3, L3-F7, L3-F9, L4-F1,
  L4-F6, L4-F10 and L7-10. Each is in the private package with its measurement.
- **The developer §3.4 scan is an approximation** with stated limits (`factory_v1_plane_scan.mjs` LIMITS); the verifier's own scan
  governs.
- **Product comments** in `supabase/control-plane/v1/*.sql`, the Edge entry point and `release.mjs` still describe CR-011, CR-013,
  CR-014, CR-015, CR-020 and CR-021 as questions for the Director. The candidate keeps the r3 behaviour each ruling confirmed; the
  product bytes were left unchanged after the rulings.
- **The static contract's P3p** hashes each relied-on change request as committed at HEAD; an uncommitted edit to a CR file in a
  working tree is not seen by that row.
- **Mongolian UI strings** on the Computers page need a native speaker's review.
- **Logon-only task:** a computer is OFFLINE until its user signs in (stated on the page).

## Where things are

| item | location |
|---|---|
| Implementation records | `DECOMPOSITION.md`, `RECONCILIATION.md`, `R3_RECONCILIATION.md`, `COMPATIBILITY_MATRIX.md`, `MIGRATION_PRIVILEGES.md`, `predicted_catalog_difference.json`, `change-requests/` |
| Founder steps | `FOUNDER_PREPARED_STEPS.md` |
| Third-PC script (not run) | `ZERO_TOUCH_ACCEPTANCE_SCRIPT.md` |
| Inventory | `INVENTORY.md` (generated at the candidate SHA) |
| Evidence | `evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/` (candidate #1's evidence stays at `evidence/candidate/`) |
| Fresh-clone recipe | `git clone -b factory/auto-enrollment-v1-implementation …`; `git fetch origin factory/auto-enrollment-v1-director` (the static contract reads the Director's CR-disposition record); `git checkout c667367b6d0fcf02a4d575f050aaa475c644ca7b`; `npm ci` at the root and in `web/` (and in `qa/dbtest/` for `dbtest_on_disposable_pg`); `node scripts/factory-build/build-sea.mjs --channel dev` and `--channel production`; `node qa/implementation/auto-enrollment-v1/tools/final_pass.mjs <out> --declarations <copy of evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/build-declarations>` (the reference set: `tools/run_reference_suites.mjs` and `tools/run_acceptance_mutation_chunks.mjs`). It needs Windows x64, the pinned node 24.19.0, openssl (Git for Windows) and network access for `npx deno@2.5.6` |

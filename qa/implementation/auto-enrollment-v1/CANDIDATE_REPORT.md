# Factory V1 — Node Management + Zero-Touch Auto-Enrollment: candidate report (implementer)

| | |
|---|---|
| State | **READY FOR INDEPENDENT QA** (DEV-VERIFIED by the implementer; never self-certified) |
| Candidate SHA (frozen) | `412ac14e76f88fbd5e310d3e97dbf5acab2c1498` on `factory/auto-enrollment-v1-implementation` |
| Evidence / report commit | the commit that adds this file (it adds only `qa/implementation/auto-enrollment-v1/**`; no code) |
| Director commit built against | `8f9833cea3bd8b70d995cfe5575b6dabadb8361d` ("Director r1"; the Director branch head was re-checked at freeze and is still r1) |
| Baseline | `factory/computer-agnostic-control-plane` = `69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6` (untouched) |
| Implementer signing key | `SHA256:9zUYxsZkV6MLq9dcGtiz+e3D/h0XPevf3w/cJH5QTek` (CR-005). Every commit in `8f9833ce..412ac14e76f88fbd5e310d3e97dbf5acab2c1498` verifies against it (`git log --format=%G?`: all `G`) |
| Canonical documents | byte-identical to `8f9833ce` (`git diff --name-only 8f9833ce <candidate> -- docs/architecture/features qa/verification/auto-enrollment-v1 qa/work-orders governance CLAUDE.md docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` is empty) |
| Production | **untouched.** No live migration, no Edge deploy, no secret, no `master` push, no live plane write. The live legacy checkout and task were never touched. |

The whole scope is developer verification by the implementer on DESKTOP-8P5HVAO. A stubbed Brain OS never counts for acceptance
(VERIFICATION_SPEC §3 (2)). Independent acceptance, and every row marked INDEPENDENT or BLOCKED below, belong to the verifier and
the founder.

## FOUND / ROOT CAUSE / SYSTEMIC IMPACT / FIXED / TESTED / PRODUCTION / BLOCKERS

**FOUND.** Every defect below was found by the implementer, before any deploy, and each has a regression row.

| # | defect | how it was found | commit |
|---|---|---|---|
| 1 | Revoke / rotate ended node sessions, so the S-3 per-call re-check was never exercised; rotate could race revoke and escape it | S-3 interleavings | `48d8a1b` |
| 2 | A code-issuing admin action refused a bad input only after writing; a foreign tenant's work order leaked its existence; a claim lock timeout surfaced as a server error | admin / eligibility suites | `48d8a1b`, `fbea204` |
| 3 | A node could install and run a release signed by a key revoked moments before (stale revocation list) | AC-5 R-c | `bd688eb` |
| 4 | A release signed by a **revoked key** stayed current on the server (gate 4) and could be adopted | review + G4r | `4eec9f0` |
| 5 | A node whose own release was revoked exited and could never hear an admin adopt (contract §6: "stops claiming **until** a certified release is adopted") | AC-5 R-j | `4eec9f0` |
| 6 | **Every deployed API call would have been 404.** The Edge platform delivers `/<function>/v1/…`, but the handlers matched `/v1/…`, and the harness served them at the root | path-shape review (CLAUDE.md §6 class, ledger #133) | `de6505b` |
| 7 | A clean PC needed a second manual download (the manifest), which contradicts P-4 | P-4 review | `70e4d66` |
| 8 | **S-10 "TLS is verify-full" was not met.** The Edge DB connection used `ssl: 'require'` (verifies nothing); an IP-literal host skipped the certificate name check | review + Deno TLS suite | `7ca9285` |
| 9 | No Supabase CLI project and no `config.toml`: a deploy would have kept the gateway's `verify_jwt`, refusing every node and admin call | whole-request gate review | `7ca9285` |
| 10 | `deno check` failed (4 type errors) | first `deno check` | `7ca9285` |
| 11 | Five whole-request refusals were unclassified | the static contract G1 | `7ca9285` |
| 12 | **The logon task kept executing the first-installed binary** after an upgrade or adopt, even once revoked, and the supervisor never verified itself (S-5) | start-path review | `d14823c` |
| 13 | Eight v1 suites could crash without naming a row; L3 crashed instead of reporting ALLOWED; **AC-14 gap:** a lease-holder without a checkpoint was never tested in the authoring set | the v1 mutation proof | `c49ae28`, `812899e`, `e6fcfb7` |

**ROOT CAUSE (classes).**
- Harness shapes that differ from the platform: path prefix, gateway JWT, TLS mode. Only a real request shape shows them.
- Server authority that trusted the honest runtime instead of deciding itself: key revocation at gate 4.
- Lifecycles with no owner of the transition: the task never followed a switch; revoked meant dead, not standby.
- Tests that shared state between cases, and suites without a crash row.

**SYSTEMIC IMPACT.** Each class got a same-class sweep:
- every whole-request refusal is inventoried by `factory_v1_static_contract` G1–G3;
- every entry point connects only through `_shared/db.ts`;
- every guard in the mutation table has a mutant (47 of 47 killed);
- every suite records a crash as a named row.

**FIXED.** Each fix is in its commit above, signed.

**TESTED.** See the final developer pass at the candidate SHA, the two mutation proofs, the reference suites and the static gates
below.

**PRODUCTION.** Untouched. Every founder action is prepared in `FOUNDER_PREPARED_STEPS.md`.

**BLOCKERS.**
- **BLOCKED — FOUNDER:** C-3 (production release-signing key custody); the live migration, API logins, `tenant_admins`, Edge
  secrets, the function deploy (`ALLOW_FUNCTIONS_DEPLOY=1?`), release storage, and the web PR into `master`.
- **BLOCKED — EXTERNAL:** R-1 on a clean VM, and the VM-only reference suites. This PC has no hypervisor and no Windows Sandbox.
- **DIRECTOR:** CR-005 fingerprint confirmation; ratification of retiring `/software-factory/workers`.

## Results at the candidate SHA

### Final developer pass (`tools/final_pass.mjs`; evidence `evidence/candidate/final/`)

Commit `412ac14e76f88fbd5e310d3e97dbf5acab2c1498`; run by `qa/implementation/auto-enrollment-v1/tools/final_pass.mjs` (serial; developer verification, never independent).

| step | exit | seconds | summary | evidence |
|---|---|---|---|---|
| build dev channel | 0 | 15 | [build-sea] BUILT C:\Users\DELL\dev\brain-os-factory-enroll\dist\brain-factory\0.1.0\dev\BrainFactorySetup.exe sha256 9fd02cf574f65f85964ae52e0d4851aa371380fd46 | `build_dev_channel.txt` |
| build production channel | 0 | 15 | [build-sea] BUILT C:\Users\DELL\dev\brain-os-factory-enroll\dist\brain-factory\0.1.0\production\BrainFactorySetup.exe sha256 41f575cbe5687412f117ef213ff040a67af | `build_production_channel.txt` |
| verify-build dev (IDENTICAL) | 0 | 15 | IDENTICAL: 9fd02cf574f65f85964ae52e0d4851aa371380fd46a1c7415483ed7337ea4dec (unsigned image), and every build-info field but the signing ones | `verify-build_dev_IDENTICAL_.txt` |
| verify-build production (IDENTICAL) | 0 | 15 | IDENTICAL: 41f575cbe5687412f117ef213ff040a67af7fc46e12fb6b332356da2406f2946 (unsigned image), and every build-info field but the signing ones | `verify-build_production_IDENTICAL_.txt` |
| static: factory_v1_static_contract | 0 | 0 | factory_v1_static_contract: 17 passed, 0 failed | `static_factory_v1_static_contract.txt` |
| static: architecture_impact_registry_contract | 0 | 0 | architecture_impact_registry_contract: 17 passed, 0 failed | `static_architecture_impact_registry_contract.txt` |
| static: secret scan self-test | 0 | 0 | secret_scan --selftest: 10/10 rules hit their sample | `static_secret_scan_self-test.txt` |
| static: secret scan | 0 | 0 | secret_scan: clean (0 hits) | `static_secret_scan.txt` |
| static: deno check (Edge functions) | 0 | 9 |  | `static_deno_check_Edge_functions_.txt` |
| static: web tsc | 0 | 4 |  | `static_web_tsc.txt` |
| static: web eslint (changed files) | 0 | 35 |  | `static_web_eslint_changed_files_.txt` |
| static: web next build | 0 | 21 | ✓ Generating static pages using 15 workers (45/45) in 450ms | `static_web_next_build.txt` |
| schema_acceptance | 0 | 8 | schema_acceptance: 47/47 OK | `schema_acceptance.txt` |
| manifest_rehearsal | 0 | 6 |  | `manifest_rehearsal.txt` |
| takeover_acceptance --transport direct | 0 | 13 | takeover_acceptance [direct]: 17/17 OK | `takeover_acceptance_--transport_direct.txt` |
| takeover_acceptance --transport api | 0 | 14 | takeover_acceptance [api]: 17/17 OK | `takeover_acceptance_--transport_api.txt` |
| compat_regressions --transport direct | 0 | 32 | compat_regressions [direct]: 34/34 OK | `compat_regressions_--transport_direct.txt` |
| compat_regressions --transport api | 0 | 32 | compat_regressions [api]: 34/34 OK | `compat_regressions_--transport_api.txt` |
| transport_compatibility_contract | 0 | 64 | transport_compatibility_contract: 16/16 rows MIGRATED | `transport_compatibility_contract.txt` |
| enrollment_acceptance | 0 | 69 | enrollment_acceptance: 19/19 OK | `enrollment_acceptance.txt` |
| admin_acceptance | 0 | 25 | admin_acceptance: 20/20 OK | `admin_acceptance.txt` |
| revocation_interleaving | 0 | 9 | revocation_interleaving: 13/13 OK | `revocation_interleaving.txt` |
| eligibility_acceptance | 0 | 42 | eligibility_acceptance: 10/10 OK | `eligibility_acceptance.txt` |
| independence_acceptance | 0 | 22 | independence_acceptance: 16/16 OK | `independence_acceptance.txt` |
| edge_db_tls_acceptance | 0 | 8 | edge_db_tls_acceptance: 7/7 OK | `edge_db_tls_acceptance.txt` |
| setup_manifest_locate | 0 | 1 | setup_manifest_locate: 6/6 OK | `setup_manifest_locate.txt` |
| runtime_acceptance | 0 | 400 | runtime_acceptance: 9/9 OK | `runtime_acceptance.txt` |
| release_acceptance | 0 | 157 | release_acceptance: 15/15 OK | `release_acceptance.txt` |
| web_computers_acceptance | 0 | 20 | web_computers_acceptance: 6/6 OK | `web_computers_acceptance.txt` |
| sea_package_regression | 0 | 186 | sea_package_regression: 25 passed, 0 failed | `sea_package_regression.txt` |

Every step exited 0.

### Mutation proofs (developer)

- **v1 new invariants** (`qa/factory/v1/v1_mutation_proof.mjs`): **47 of 47 killed.**
  - Covered: each eligibility gate removed singly; the revocation re-check and its lock; the checkpoint fence; identity from the
    body; S-7; `tenant_admins` and the founder tier; stricter-only policies; the legacy fence (privileges, guard, reserved
    capability, the frozen-claim path); independence; provenance; pairing (HMAC, cap, CSPRNG); TLS verify-full; release signature,
    anti-downgrade; supervisor self-verification and handoff.
  - Per-chunk evidence and the findings: `evidence/candidate/v1_mutation/SUMMARY.md`.
  - Commits: 44 mutants ran at `578785d` and HS, HO and RD at `d7d63a6`. Neither differs from the candidate in product code or in
    any suite (`git diff --name-only <commit> <candidate>` lists only QA tooling, plus the proof's own HS definition for
    `578785d`).
- **SEA packaging** (`qa/factory/sea_package_mutation_proof.mjs`), batches A–D, **26 of 26 killed**, each batch with its own control:
  - evidence: `evidence/candidate/sea_mutation/batch-{A,B,C,D}.txt`;
  - batch A ran at `d7d63a6` (a re-run: its first run, kept as `batch-A.first-run-INCONSISTENT.txt`, may have copied uncommitted
    edits);
  - batches B–D ran at `6eb3b6a`. The files those mutants plant into (`scripts/factory-build/**`) and the regression are
    byte-identical to the candidate's, and the regression passes at the candidate (final pass, 25/25). The enrolled runtime
    modules they bundle changed afterwards (`d14823c`, the supervisor handoff).
- **Commits of the other evidence:**
  - reference suites: `402dfc1`;
  - `acceptance_mutation_proof` chunks: `402dfc1`, `e41753d`, `412ac14`.

  Each differs from the candidate in QA tooling only.

### Certified reference suites at their 69df2f52 bytes (VERIFICATION_SPEC §3.7)

Evidence `evidence/candidate/reference/` (one file per suite; summary below):

```
reference suites (the suite files compared with 69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6; each line names the commit it ran at)

acceptance                                           exit 0      55s  @402dfc1e  factory acceptance: 58 passed, 0 failed
acceptance_mutation_proof chunk 1 (N1 N1L N14 N13 N13c N24 N21 N25 N26 N26s N26c N26i T8 N22 N15) exit 143   590s  @e41753d5  (no summary line)
acceptance_mutation_proof chunk N15 (N15)            exit 0     128s  @e41753d5  acceptance_mutation_proof: 1 of 1 mutants killed on e41753d559866eab69a287e83cfb091ab0021a97
acceptance_mutation_proof chunk N16-N28-N29-N29b-N37b-N38-N38u-N40-N41-N35p-N35d-N42-N39-N35r-N35x (N16 N28 N29 N29b N37b N38 N38u N40 N41 N35p N35d N42 N39 N35r N35x) exit 0     471s  @412ac14e  acceptance_mutation_proof: 15 of 15 mutants killed on 412ac14e76f88fbd5e310d3e97dbf5acab2c1498
acceptance_mutation_proof chunk N2-N23s-N23-N3-N4-N5-N6-N7-N8-N9-N9b-N10-N10D-N11-N12 (N2 N23s N23 N3 N4 N5 N6 N7 N8 N9 N9b N10 N10D N11 N12) exit 0     394s  @412ac14e  acceptance_mutation_proof: 15 of 15 mutants killed on 412ac14e76f88fbd5e310d3e97dbf5acab2c1498
acceptance_mutation_proof chunk N32-N27b-N30-N31-N37-N20d-N33-N34-N35-N36-N27-N8H-N20a-N20b-N20c (N32 N27b N30 N31 N37 N20d N33 N34 N35 N36 N27 N8H N20a N20b N20c) exit 0     822s  @412ac14e  acceptance_mutation_proof: 15 of 15 mutants killed on 412ac14e76f88fbd5e310d3e97dbf5acab2c1498
campaign_boundary_is_crossed                         exit 1       0s  @402dfc1e  campaign_boundary_is_crossed: 21 passed, 1 failed
dbtest_on_disposable_pg                              exit 0      10s  @402dfc1e  concurrency rc=0 :: concurrency: TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN — VERIFIED under real concurrency (real PostgreSQL, two connections)
dedicated_supabase_provisioning                      exit 0       7s  @402dfc1e  dedicated_supabase_provisioning: 11 passed, 0 failed  (disposable TLS server dressed as a Supabase project; nothing reached any real project)
denominator_cannot_shrink_silently                   exit 0       0s  @402dfc1e  denominator_cannot_shrink_silently: 8 passed, 0 failed
founder_poke_not_required                            exit 0      27s  @402dfc1e  founder_poke_not_required: 12 passed, 0 failed
health_check                                         exit 0       9s  @402dfc1e  health_check: 10 passed, 0 failed
http_provider_acceptance                             exit 0       8s  @402dfc1e  http_provider_acceptance: 9 passed, 0 failed  (stub provider on 127.0.0.1:64219, disposable plane; nothing reached a real provider)
instrument_validity.regression.test                  exit 0       1s  @402dfc1e  instrument_validity.regression.test: 20 passed, 0 failed
model_catalog_must_not_advertise_untested_models     exit 0       0s  @402dfc1e  15 pass, 0 fail
no_silent_model_fallback                             exit 0       5s  @402dfc1e  12 pass, 0 fail
node_truth_acceptance                                exit 0     794s  @402dfc1e  node_truth_acceptance: 46 passed, 0 failed
package_bootstrap_mutation_proof (static)            exit 0      25s  @402dfc1e  package_bootstrap_mutation_proof: 15 of 15 (control green + mutants killed)  (static mutants only; --fresh adds the original defect and thirty-four fresh-clone mutants)
package_bootstrap_regression --static                exit 0       1s  @402dfc1e  package_bootstrap_regression: 7 passed, 0 failed  (static rows only)
scripts/factory-runner/db.regression.test            exit 0       0s  @402dfc1e  ℹ fail 0
scripts/factory-runner/plugin-attach.regression.test exit 0       0s  @402dfc1e  ℹ fail 0
scripts/factory-runner/provider.regression.test      exit 0       0s  @402dfc1e  ℹ fail 0
scripts/factory-runner/round-state.regression.test   exit 1       0s  @402dfc1e  round-state.regression.test: 0 passed, 1 failed
scripts/factory-runner/runner-env.regression.test    exit 0       0s  @402dfc1e  ℹ fail 0
scripts/factory-runner/scheduler.regression.test     exit 0       0s  @402dfc1e  ℹ fail 0
scripts/factory-runner/supervisor.injection.mutation exit 1       0s  @402dfc1e  (no summary line)
scripts/factory-runner/supervisor.injection.test     exit 0       0s  @402dfc1e  supervisor.injection.test: 139 pass, 0 fail (19 cwd payloads x1, 14 prompt payloads x 8 fields)
scripts/factory-runner/supervisor.regression.test    exit 0       0s  @402dfc1e  ℹ fail 0
shared_control_plane_acceptance                      exit 0      32s  @402dfc1e  shared_control_plane_acceptance: 18 passed, 0 failed
tls_plane_acceptance                                 exit 0      21s  @402dfc1e  tls_plane_acceptance: 9 passed, 0 failed  (plane served on 192.168.1.7:64474 with ssl=on, hostssl-only; disposable, removed)
waiting_costs_no_cpu                                 exit 0       2s  @402dfc1e  waiting_costs_no_cpu: 5 passed, 0 failed

NOT RUN (by rule, with the reason):
  package_bootstrap_regression (fresh-clone rows) - S-15: its F6 restore path re-registers this PC's live "BrainOS Factory Node" task, and it needs the npm registry; the static rows run above
  package_bootstrap_mutation_proof --fresh - S-15: the same installer path on this PC; the static mutants run above
  reboot_recovery_acceptance (disposable-plane rows) - BLOCKED - EXTERNAL: VERIFICATION_SPEC §3.7 runs it only in a separate disposable Windows VM with no live task; this PC holds the live task and has no hypervisor or Windows Sandbox
  factory_v1_acceptance --local-only - BLOCKED - EXTERNAL: the same VM-only rule as reboot_recovery_acceptance
  shared_plane_live_acceptance, two_machine_real, two_machine_failover, two_machine_scheduling - excluded by S-15 (they read or drive live state); VERIFICATION_SPEC §3.7
  acceptance_mutation_proof mutants N37x and N19 - BASELINE FINDING: at 69df2f52 ITSELF their anchors are absent from the files they mutate (two_machine_real.mjs:52, node.mjs:440 differ from the anchor text), so the unchanged proof refuses to run whole; the other mutants run by label (acceptance_mutation_proof.chunk-*.txt)
```

### Static gates

| gate | result |
|---|---|
| `node --check` | every changed `.mjs` |
| Edge `deno check` (Deno 2.5.6) | both functions green |
| web | `tsc`, `eslint` on the changed files, `next build` |
| static one-engine check, route inventory = S-7, plane-conditioned scan, edge placement, whole-request gate inventory | `qa/scenarios-runner/factory_v1_static_contract.mjs` |
| capability-impact registry | `architecture_impact_registry_contract` |
| secret scan | `tools/secret_scan.mjs`: 10 rules, positive-control self-test, clean |

## What each work order asked the report to include

| WO | item | where |
|---|---|---|
| WO-1 | every table, function, role and grant, with the catalog read-back; the seeded policy rows; no secret stored; envelope immutability by a node; the legacy refusals as `factory_runner`; manifest preservation on a copy of the baseline rows | `INVENTORY.md`; `schema_acceptance` (P0–P7 manifest; C1–C15 catalog; L1–L8, M1–M4 legacy; E1–E10 invariants); `enrollment_acceptance` EN16 |
| WO-2 | the compatibility matrix with every VERDICT backed by a passing regression; the static handler inventory | `COMPATIBILITY_MATRIX.md` (16 of 16 MIGRATED); `compat_regressions` direct + api; `transport_compatibility_contract`; `factory_v1_static_contract` O1–O3 |
| WO-3 | transitions and failure states, abuse cases at their bounds (incl. a spoofed forwarding header), the CSPRNG and its entropy, no pepper and no plain SHA-256 | `enrollment_acceptance` EN1–EN19 (EN11: forged X-Forwarded-For; EN15: 60 secret bits from the CSPRNG over 4000 codes; EN16) |
| WO-4 | a clean-machine rehearsal on a non-acceptance machine; the installed footprint | **BLOCKED — EXTERNAL** for a clean VM. On this PC, `runtime_acceptance` U0 runs every command with a PATH holding no node, git or npm, and U2 lists the footprint; `sea_package_regression` B8 |
| WO-5 | a test per gate and each gate removed singly; best resources with no authorization; a self-reported capability outside the envelope; preferred node unavailable; the Home-authoring restriction; numeric priority | `eligibility_acceptance` G1–G12, O1, D1, K1–K2, H1, Y1, G4r; `admin_acceptance` E2; v1 proof G2–G12, DB, NP, KR |
| WO-6 | manifest format and key-id model; the start-path verification point; every refusal case; rotation / revocation; no production key material | `release.mjs` (manifest fields, `ed25519:<sha256 of the public key>`); `supervisor.mjs` (self first, then every worker start); `release_acceptance` R-a…R-t, R-i2; trust read-back per channel (the production trust set is empty before C-3) |
| WO-7 | a revoke committing while a session is valid and a run in flight, then every node op refused; evidence intact | `revocation_interleaving` I1–I4; `admin_acceptance` L1 |
| WO-8 | the persona × path matrix incl. the self-promoted employee; the allowlist probe; the row-for-row server comparison | `admin_acceptance` P1–P5, R1, R1p; `web_computers_acceptance` W1–W5 |
| WO-9 | AC-14 (a)–(o) plus (j2); the policy-write refusal; the certification record | `independence_acceptance`; `admin_acceptance` G1; `factory.certifications` (050) |
| WO-10 | the suite results; manifest preservation; release provenance inputs; the secret scan; the frozen SHA; the Director commit | this report |

## Release provenance inputs (S-5; WO-10)

| channel | runtime version | source commit | dirty | built_at | digest (PE Authenticode image hash, SHA-256) | file sha256 (unsigned) | trust mode | trust set (key id, sha256 of the public key) | default API |
|---|---|---|---|---|---|---|---|---|---|
| production | 0.1.0 | `412ac14e76f88fbd5e310d3e97dbf5acab2c1498` | false | 2026-09-26T22:58:55.000Z | `3b6cfa3c8e1b21e368db4ae49916eff774b2df5b593f92a6886d1bd53c3e77c4` | `41f575cbe5687412f117ef213ff040a67af7fc46e12fb6b332356da2406f2946` | production | **empty** (no key before C-3) | https://npvhuoozkbexddnvkqsj.supabase.co/functions/v1/factory-node-api |
| dev | 0.1.0 | `412ac14e76f88fbd5e310d3e97dbf5acab2c1498` | false | 2026-09-26T22:58:55.000Z | `29904c758319f092d76ac12a3ecf3156a2478ff1593b587f01e1ecd9c6882351` | `9fd02cf574f65f85964ae52e0d4851aa371380fd46a1c7415483ed7337ea4dec` | dev | `ed25519:98601d6850ee07dee28b13e1dfd6de3f737b4e730c20fe3b8a620c9cc99536e6` / `98601d6850ee07dee28b13e1dfd6de3f737b4e730c20fe3b8a620c9cc99536e6` | (none: dev) |

- Base executable: node v24.19.0 `win-x64/node.exe`, sha256 `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237` (pinned; source https://nodejs.org/dist/v24.19.0/SHASUMS256.txt), signature stripped before injection.
- Reproducibility: `verify-build.mjs` rebuilds each channel from the same commit and reports IDENTICAL (final pass steps 3-4; `release_acceptance` R-h).
- Control-plane migration (`scripts/factory-control-plane/migration.mjs compose`), sha256 `fa3e03bb09190309c18256cab1e94d4787381875677460edf4a34f53d5ab5948`. The founder applies exactly this body inside the Director's wrapper.
- No production key material: the production trust set is empty, and the only key anywhere is the dev key (public seed; disposable planes only). The release receipts, and the digest the founder signs, come from the verifier's rebuild at the CERTIFIED SHA, not from this table.

## Decisions requested

1. **C-3 (founder):** production release-signing key custody. Until then the production trust set is empty
   (`scripts/factory-runner/enrolled/trust/production.json`), so no live-mode release exists, and AC-1..AC-4 final acceptance
   waits.
2. **CR-005 (Director / founder):** confirm the implementer key fingerprint `SHA256:9zUYxsZkV6MLq9dcGtiz+e3D/h0XPevf3w/cJH5QTek`.
3. **WO-8 (Director ratification):** `/software-factory/workers` is **retired**. It redirects to `/software-factory/computers`.
   Its rows were machines self-registered by `register-worker.mjs`. `public.workers` is untouched, and Brain OS production gets
   no schema change (S-9).
4. **S1 and its extended vectors (founder; Brain OS, not Factory):**
   - `profiles_update_self_or_admin` lets a user set their own `profiles.role`. V2 is invitation self-promotion to
     holding_admin; V3 is a `people.profile_id` rebind that leads to a salary read.
   - The Factory is fenced from them: `tenant_admins` is required (CR-001), and `admin_acceptance` P2 and web W3 refuse a
     self-promoted employee.
   - Brain OS itself still needs the founder's fix.

## Baseline findings for the Director (reproduced on a clean `69df2f52` clone; the candidate changes neither the suites nor the files)

| suite | at 69df2f52 and at the candidate | why |
|---|---|---|
| `campaign_boundary_is_crossed` | 21 passed, 1 failed (R1) | `scripts/factory-runner/handlers/factory-acceptance.mjs` is not registered with the director |
| `acceptance_mutation_proof` | refuses to run whole ("MUTATION ANCHORS MISSING") | The anchors of N37x (`two_machine_real.mjs:52`) and N19 are absent from the certified files: `node.mjs:440` calls `nodeBeat(id, nodeRole(), reg, !refusedNow)`, but the anchor text omits `!refusedNow`. Of its other 69 mutants, 60 run by label (all killed; next row) and 9 cannot be judged from a clone of this branch (next row) |
| `acceptance_mutation_proof`: its nine `acceptance.mjs` mutants (M N O Q P S3 G3 R S) | not judgeable from a clone of this branch | `acceptance.mjs:439` reconstructs the LOCAL branch `factory/computer-agnostic-control-plane`. The proof's fresh clone has only its HEAD branch local; the certification ran FROM that branch. Each such clone crashes before any row (`reference-superseded/acceptance_mutation_proof.chunk-01.ACC-crashed-at-402dfc1.txt`). The unmutated `acceptance.mjs` runs whole in the candidate worktree, where the branch is local: 58/58. The other 60 runnable mutants: **60 of 60 killed** (`reference/acceptance_mutation_proof.chunk-*.txt`; chunk 01 is partial because the chunk timeout cut its last mutant, and N15 was re-run by itself) |
| `scripts/factory-runner/supervisor.injection.mutation` | 4 of 5 proven; one STALE ANCHOR (R-D9, `shell: true` in the SQL transport) | the anchor is absent from the certified `supervisor.mjs` |
| `scripts/factory-runner/round-state.regression.test` | RS-C0: 0 passed, 1 failed | Environment-dependent: it reads two worktrees that exist only on the original machine (VERIFICATION_SPEC §3.7 registers it). The same happened in the baseline measurement on this machine |

## Known limitations (stated, not hidden)

- **UNMEASURED until the founder's deploy:**
  - the Edge platform's wall-clock and CPU limits;
  - the peer address it reports (per-IP pairing limit);
  - whether it strips the function path prefix (route.ts accepts both shapes);
  - postgres.js over the pooler under load;
  - verify-full to the real pooler host with the downloaded CA.

  `FOUNDER_PREPARED_STEPS.md` §5 lists the mandatory post-deploy live acceptance.
- **Model-assurance decline:** the 69df2f52 model-assurance decline is kept as the enrolled runtime's own local veto, not one of
  P-6's twelve gates (compatibility matrix note).
- **Mongolian UI strings** on the Computers page need a native speaker's review.
- **Logon-only task:** a computer is OFFLINE until its user signs in (stated on the page).
- **Handoff chain:** with unmodified code a supervisor handoff cannot chain, because the handed-to supervisor is the verified
  current exe. The HS mutation proof showed that a forged digest *would* chain.

## Where things are

| item | location |
|---|---|
| Implementation records | `DECOMPOSITION.md`, `RECONCILIATION.md`, `COMPATIBILITY_MATRIX.md`, `change-requests/CR-005-implementer-signing-key.md` |
| Founder steps | `FOUNDER_PREPARED_STEPS.md` |
| Third-PC script (not run) | `ZERO_TOUCH_ACCEPTANCE_SCRIPT.md` |
| Inventory | `INVENTORY.md` (generated at the candidate SHA) |
| Evidence | `evidence/candidate/` |
| Fresh-clone recipe | `git clone -b factory/auto-enrollment-v1-implementation …`; `git checkout <candidate>`; `npm ci` at the root and in `web/` (and in `qa/dbtest/` for the `dbtest_on_disposable_pg` reference suite); then `node qa/implementation/auto-enrollment-v1/tools/final_pass.mjs <out>` (the reference set: `tools/run_reference_suites.mjs` and `tools/run_acceptance_mutation_chunks.mjs`), which builds both channels, runs `verify-build` and runs every suite and gate. It needs Windows x64, the pinned node 24.19.0, openssl (Git for Windows) and network access for `npx deno@2.5.6` |

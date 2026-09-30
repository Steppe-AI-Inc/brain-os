# Final developer pass

Commit `c667367b6d0fcf02a4d575f050aaa475c644ca7b`; run by `qa/implementation/auto-enrollment-v1/tools/final_pass.mjs` (serial; developer verification, never independent).

- environment disposable (local): FACTORY_RUNNER_PG_URL emptied; FACTORY_RUNNER_ENV_FILE=C:\Users\DELL\AppData\Local\Temp\bf-isolation-PulsWu\runner.env.absent (absent; the default C:\Users\DELL\.brain-factory\runner.env is never resolved)
- isolation proof: runner-env.mjs envFilePath() -> C:\Users\DELL\AppData\Local\Temp\bf-isolation-PulsWu\runner.env.absent; node-supervisor.mjs:48 -> C:\Users\DELL\AppData\Local\Temp\bf-isolation-PulsWu\runner.env.absent (pinned to 69df2f52: yes); both resolve to the absent path

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

Every step exited 0.

# Final developer pass

Commit `95fdb85acf755f8d28fa2393165cac7fb9ca77b7`; run by `qa/implementation/auto-enrollment-v1/tools/final_pass.mjs` (serial; developer verification, never independent).

- environment disposable (local): FACTORY_RUNNER_PG_URL emptied; FACTORY_RUNNER_ENV_FILE=C:\Users\DELL\AppData\Local\Temp\bf-isolation-w7o7C3\runner.env.absent (absent; the default C:\Users\DELL\.brain-factory\runner.env is never resolved)
- isolation proof: runner-env.mjs envFilePath() -> C:\Users\DELL\AppData\Local\Temp\bf-isolation-w7o7C3\runner.env.absent; node-supervisor.mjs:48 -> C:\Users\DELL\AppData\Local\Temp\bf-isolation-w7o7C3\runner.env.absent (pinned to 69df2f52: yes); both resolve to the absent path

| step | exit | seconds | summary | evidence |
|---|---|---|---|---|
| build dev channel | 0 | 14 | [build-sea] BUILT C:\Users\DELL\dev\brain-os-factory-enroll\dist\brain-factory\0.1.0\dev\BrainFactorySetup.exe sha256 e1f485482300720325e2489ecd82e784bfe82bcee4 | `build_dev_channel.txt` |
| build production channel | 0 | 14 | [build-sea] BUILT C:\Users\DELL\dev\brain-os-factory-enroll\dist\brain-factory\0.1.0\production\BrainFactorySetup.exe sha256 e242ef756a10d6ff2dddc9e4974e7abde8a | `build_production_channel.txt` |
| verify-build dev (IDENTICAL) | 0 | 15 | IDENTICAL: e1f485482300720325e2489ecd82e784bfe82bcee497a73bdaaca110ec5527df (unsigned image), and every build-info field but the signing ones | `verify-build_dev_IDENTICAL_.txt` |
| verify-build production (IDENTICAL) | 0 | 15 | IDENTICAL: e242ef756a10d6ff2dddc9e4974e7abde8a03242ee9ab8b4a963c0ca8a2a7181 (unsigned image), and every build-info field but the signing ones | `verify-build_production_IDENTICAL_.txt` |
| provenance --check (the declared per-channel builds) | 0 | 28 | dev: rebuilt digest 132a2a62303ba897e2ddf91a62c88e4f3e3db51a7f9c6a64c91a5ce6f4e5177b (declared 132a2a62303ba897e2ddf91a62c88e4f3e3db51a7f9c6a64c91a5ce6f4e5177b) | `provenance_--check_the_declared_per-channel_builds_.txt` |
| static: factory_v1_static_contract | 0 | 4 | factory_v1_static_contract: 73 passed, 0 failed | `static_factory_v1_static_contract.txt` |
| static: architecture_impact_registry_contract | 0 | 0 | architecture_impact_registry_contract: 17 passed, 0 failed | `static_architecture_impact_registry_contract.txt` |
| static: secret scan self-test | 0 | 0 | secret_scan --selftest: 10/10 rules hit their sample | `static_secret_scan_self-test.txt` |
| static: secret scan | 0 | 0 | secret_scan: clean (0 hits) | `static_secret_scan.txt` |
| static: deno check (Edge functions) | 0 | 2 |  | `static_deno_check_Edge_functions_.txt` |
| static: web tsc | 0 | 4 |  | `static_web_tsc.txt` |
| static: web eslint (changed files) | 0 | 34 |  | `static_web_eslint_changed_files_.txt` |
| static: web next build | 0 | 20 | ✓ Generating static pages using 15 workers (45/45) in 478ms | `static_web_next_build.txt` |
| schema_acceptance | 0 | 10 | schema_acceptance: 82/82 OK | `schema_acceptance.txt` |
| manifest_rehearsal | 0 | 7 | manifest_rehearsal: 6/6 OK | `manifest_rehearsal.txt` |
| takeover_acceptance --transport direct | 0 | 27 | takeover_acceptance [direct]: 20/20 OK | `takeover_acceptance_--transport_direct.txt` |
| takeover_acceptance --transport api | 0 | 28 | takeover_acceptance [api]: 20/20 OK | `takeover_acceptance_--transport_api.txt` |
| compat_regressions --transport direct | 0 | 40 | compat_regressions [direct]: 36/36 OK | `compat_regressions_--transport_direct.txt` |
| compat_regressions --transport api | 0 | 40 | compat_regressions [api]: 36/36 OK | `compat_regressions_--transport_api.txt` |
| transport_compatibility_contract | 0 | 79 | transport_compatibility_contract: 17/17 rows MIGRATED | `transport_compatibility_contract.txt` |
| enrollment_acceptance | 0 | 71 | enrollment_acceptance: 38/38 OK | `enrollment_acceptance.txt` |
| admin_acceptance | 0 | 39 | admin_acceptance: 46/46 OK | `admin_acceptance.txt` |
| revocation_interleaving | 0 | 79 | revocation_interleaving: 30/30 OK | `revocation_interleaving.txt` |
| eligibility_acceptance | 0 | 76 | eligibility_acceptance: 25/25 OK | `eligibility_acceptance.txt` |
| independence_acceptance | 0 | 28 | independence_acceptance: 25/25 OK | `independence_acceptance.txt` |
| edge_db_tls_acceptance | 0 | 9 | edge_db_tls_acceptance: 10/10 OK | `edge_db_tls_acceptance.txt` |
| setup_manifest_locate | 0 | 1 | setup_manifest_locate: 7/7 OK | `setup_manifest_locate.txt` |
| release_trust_unit | 0 | 0 | release_trust_unit: 7/7 OK | `release_trust_unit.txt` |
| runtime_acceptance | 0 | 138 | runtime_acceptance: 13/13 OK | `runtime_acceptance.txt` |
| release_acceptance | 0 | 256 | release_acceptance: 41/41 OK | `release_acceptance.txt` |
| web_computers_acceptance | 0 | 20 | web_computers_acceptance: 7/7 OK | `web_computers_acceptance.txt` |
| sea_package_regression | 0 | 185 | sea_package_regression: 28 passed, 0 failed | `sea_package_regression.txt` |

Every step exited 0.

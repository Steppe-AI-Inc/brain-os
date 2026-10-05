# Final developer pass

Commit `c353e8953338f855a134a95787a075e8e93cfa01`; run by `qa/implementation/auto-enrollment-v1/tools/final_pass.mjs` (serial; developer verification, never independent).

- environment disposable (local): FACTORY_RUNNER_PG_URL emptied; FACTORY_RUNNER_ENV_FILE=C:\Users\DELL\AppData\Local\FactoryQA-tmp\bf-isolation-ySNHMm\runner.env.absent (absent; the default C:\Users\DELL\.brain-factory\runner.env is never resolved)
- isolation proof: runner-env.mjs envFilePath() -> C:\Users\DELL\AppData\Local\FactoryQA-tmp\bf-isolation-ySNHMm\runner.env.absent; node-supervisor.mjs:48 -> C:\Users\DELL\AppData\Local\FactoryQA-tmp\bf-isolation-ySNHMm\runner.env.absent (pinned to 69df2f52: yes); both resolve to the absent path

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

Every step exited 0 and printed its result line (the quiet static steps: exit 0).

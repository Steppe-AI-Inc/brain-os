# Final developer pass

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

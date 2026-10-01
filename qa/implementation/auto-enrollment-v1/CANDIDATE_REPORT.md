# Factory V1 — Node Management + Zero-Touch Auto-Enrollment: candidate #3 report (implementer)

| | |
|---|---|
| State | **READY FOR INDEPENDENT QA** (DEV-VERIFIED by the implementer; never self-certified) |
| Candidate SHA (frozen) | `95fdb85acf755f8d28fa2393165cac7fb9ca77b7` on `factory/auto-enrollment-v1-implementation` |
| Evidence / report commit | the commit that adds this file (it changes only `qa/implementation/auto-enrollment-v1/**`; no code) |
| Product contract (Director commit built against) | r3 `c7a845b61a3b0b419e8c9dfeff397547fdc75b03` — unchanged since candidate #2 |
| CR-disposition record | `a0bb79856a7a82ea8277c7bbf3a23ad6cc0631a0` (Director, 2026-09-30) — unchanged; candidate #3 files no change request |
| Previous candidates | #2 `c667367b6d0fcf02a4d575f050aaa475c644ca7b`: **REJECTED** (two findings, C2-P1 and C2-S1, as the founder stated them to the implementer on 2026-10-01; the Director branch carried no public record of it when this was written). #1 `412ac14e76f88fbd5e310d3e97dbf5acab2c1498`: **REJECTED** (receipt sha256 `f94861a76699696e86160064090356eb823bc5627bba50af9f259fff4bb11b57`). Neither is amended, rewritten or reused |
| Baseline | `69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6` (untouched) |
| Implementer signing key | `SHA256:9zUYxsZkV6MLq9dcGtiz+e3D/h0XPevf3w/cJH5QTek` (`implementer_signing_key`, CR-005). Every commit in `c7a845b6..95fdb85` (61) verifies against it: 61 of 61 `G`; the 3 of candidate #3 (`baf4e4b5..95fdb85`) are `95fdb85`, `1ff7755`, `cfb173c` |
| Director documents | byte-identical to r3 over every Director-owned path (`CLAUDE.md`, `governance/`, `qa/work-orders/`, `qa/verification/auto-enrollment-v1/`, `docs/architecture/features/`, `docs/architecture/adr/`, `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md`): `git diff c7a845b6 95fdb85` names no file there; the r3 ledger document set: 23 of 23 files hash-match. Outside it, `docs/architecture/CAPABILITY_IMPACT_REGISTRY.yaml` carries the implementer's WO-10 capability-registry entry (unchanged since candidate #2) |
| API login roles (§2, §3.3) | `factory_node_api` (the Node API) and `factory_admin_api` (the Admin API). The migration creates both NOLOGIN (`000_preconditions_roles.sql`); founder step 2 makes them LOGIN. No handler connects as any other role. |
| Migration | unchanged since candidate #2: composed sha256 `58bc2274a7d3c459107381646374e5a7c09294e02423c13e2b745cc4fd6827b1` (no file under `supabase/control-plane/v1/` changed) |
| Production | **untouched.** No live migration, no Edge deploy, no secret, no `master` push, no live plane write. The live legacy checkout and task were never touched. |

Candidate #3 is a narrow remediation of candidate #2: it fixes the two findings and changes nothing else in the product. Whether they are closed is the verifier's finding and the Director's record, not this report's. The whole
scope is developer verification by the implementer on DESKTOP-8P5HVAO. A stubbed Brain OS never counts for acceptance
(VERIFICATION_SPEC §3 (2)). Independent acceptance, and every row marked INDEPENDENT or BLOCKED below, belong to the verifier and
the founder.

## FOUND / ROOT CAUSE / SYSTEMIC IMPACT / FIXED / TESTED / PRODUCTION / BLOCKERS

**FOUND.**
- **C2-P1 (MEDIUM; P-2 restart / recovery).** A transient or non-deterministic checkpoint refusal ended the authoring run as a
  terminal failure. The certified baseline leaves the lease to expire, so that another eligible node takes the work over.
- **C2-S1 (LOW; S-10 "the production project is refused").** The Edge refusal of the production database judged the raw text of
  the connection URL, not the target the driver connects to.
- The verifier's own evidence for the two findings was not delivered to the implementer. Each was reproduced from the founder's
  statement of it, before any fix, on candidate #2's code:
  - C2-P1: with every answer of one checkpoint lost, and with a checkpoint the plane's server itself refused (a real lock wait,
    SQLSTATE 55P03), the node sent `complete` and the run and its work order ended `failed` with reason `handler_error`; no node took
    the work over. The same for every transient kind tried at unit level (18).
  - C2-S1: nine URL forms passed the refusal while postgres.js 3.4.9, handed the same URL, read the production project as its
    target: a percent-encoded pooler user, `?options=reference`, `?user=`, a list of hosts, and a tab or a line break inside the host
    or the user.
- The same-class sweep found one more member in candidate code: the developer migration tool's refusal read the text only
  (`scripts/factory-control-plane/migration.mjs`). It is fixed here. One observation outside the candidate's authority, in code
  that is byte-identical to the certified baseline, goes to the Director privately, through the founder.
- The implementer's own checks before the freeze found two things in the remediation itself, both corrected before it: ten lines had
  the shape the candidate's secret scan refuses (a placeholder URL and made-up test passwords; no secret), and the developer rule on
  commit citations still named candidate #2's base.

**ROOT CAUSE (classes).**
- **C2-P1: a rule that is a call deliberately NOT made had no row.** `BASELINE_LIFECYCLE_INVENTORY.md` lists the frozen runtime's
  calls. What 69df2f52 does when a worker throws (`node.mjs:522-540`: nothing is written, the lease lapses; only a data exception
  fails the run) is not a call, so it had no inventory row, no compatibility-matrix row and no regression. The enrolled worker's
  error branch completed every failed handler as `failed`, and no row read it.
- **C2-S1: a refusal that reads a text which its consumer reads again by other rules.** The refusal searched the URL's text; the
  driver decodes the user name, takes `?user=` and `?options=` as startup parameters, reads a list of hosts, fills missing parts
  from its environment, and its URL parser drops a tab or a line break from inside a name.

**SYSTEMIC IMPACT.** Each class got a same-class sweep:
- every way the enrolled worker ends its work on a run is now pinned by a row: a thrown handler, a lost lease, a terminal credential
  refusal, a returned failure, a verification handler's error, a completion that does not land, and the give-back after a lost claim
  answer (`runtime_units` HF1–HF9);
- every decision of the 69df2f52 run loop after a claim was compared with the enrolled worker; the thrown-worker rule and the list of
  runs the process itself claimed (`node.mjs:402`) were the two not carried over, and both are now (`BASELINE_LIFECYCLE_INVENTORY.md`
  §2 records the rule and which certified rows cover it);
- the compatibility matrix has a row for the rule, required by its checker, with regressions on both transports;
- every check in candidate code that refuses a database target by name was read against what its driver reads: the Edge module and
  the developer migration tool. The node's and the web's API-address rules judge and use the address with one and the same parser;
- the developer §3.4 scan counts the new Edge tests: each can only refuse, and each is proposed under the same Director ruling
  (CR-021) as before. The verifier classes every hit itself.

**FIXED.** In three signed commits on top of the candidate #2 notice commit `baf4e4b5` ("Behaviour changes" below).

**TESTED.** The full developer pass at the candidate SHA, the mutation proofs, the certified reference suites, the applying-role
plane and the static gates below — all re-run at `95fdb85`, not carried over from candidate #2.

**PRODUCTION.** Untouched. Every founder action is prepared in `FOUNDER_PREPARED_STEPS.md` (step 4 now states the one form of the
database URLs).

**BLOCKERS** (unchanged from candidate #2).
- **BLOCKED — FOUNDER:**
  - C-3, production release-signing key custody;
  - the live migration step (built by the verifier with the Director instrument), the API logins, `tenant_admins`, the observer
    role, the Edge secrets, the function deploy (`ALLOW_FUNCTIONS_DEPLOY=1?`), release storage, and the web PR into `master`;
  - the hosted Edge peer-address measurement (AC-8's per-address clause; CR-015, CR-016).
- **BLOCKED — EXTERNAL:** R-1 on a clean VM and the VM-only reference suites (this PC has no hypervisor and no Windows Sandbox); the
  Supabase-image PostgreSQL judging plane and a CLI-started Brain OS auth stack (no Docker on this PC).
- **DIRECTOR:** none open. Candidate #3 files no change request and relies on the same rulings as candidate #2.

## The two findings: what changed and what proves it

### C2-P1 — a thrown handler leaves its run to the lease

| | |
|---|---|
| Rule ported | 69df2f52 `scripts/factory-runner/node.mjs:522-540`: a thrown worker does not fail its run; the lease is the arbiter; a data exception (SQLSTATE class 22) fails it by name. `node.mjs:402`: a run the process claimed is not given back as an orphan |
| Code | `scripts/factory-runner/enrolled/worker.mjs`: `terminalFailure()`, the error branch of `workClaimed`, and the kept runs of the give-back. `_shared/node_api.ts`: a 500 `server_refused` answer states the SQLSTATE as a field (`sqlstate`); it was already in the message |
| A run now fails only when | the plane's server raised a data exception (`data_exception_<SQLSTATE>`), or the API answered that the request itself is malformed (`request_refused_<name>`: `bad_request`, `identity_from_body_refused`, `body_too_large`) |
| Everything else | nothing more is sent for the run — no completion, no release, no renewal — so its lease lapses and any eligible node resumes from the last checkpoint |
| Not weakened | a terminal credential refusal still stops the worker REFUSED (HF4, HF8); a verification handler's error still gives its claim back (HF6); a lost lease completes nothing (HF3); a failure the handler itself returns is completed failed by its name (HF5) |

| required coverage | row | result |
|---|---|---|
| the reproduction; a transient checkpoint refusal | `runtime_recovery_acceptance` TR1 (every answer of one checkpoint lost, through the client's own retries) and TR2 (a real lock wait: 500 `server_refused`, `sqlstate` 55P03); `runtime_units` HF1 (18 kinds) | 13/13 OK; 35/35 OK |
| the original node stops progressing | TR1, TR2: after the failure the node sends nothing that names the run; in TR1 it goes on to other work and completes it | as above |
| the lease expires | TR1, TR2: the plane still holds the run in progress under its lease seconds later; the new run starts after that lease's end | as above |
| a second eligible node takes over | TR1: the second node's new run is resumed from the last checkpoint | as above |
| the stale owner cannot renew, checkpoint or complete | TR1: `lease_lost`, `lease_lost`, `superseded` (a `done` and a `failed` completion), each audited as refused | as above |
| the new owner completes exactly once; no duplicate completion | TR1, TR2: one run `done`, none `failed`, the first run `queued` with attempt 2, no lock left, one checkpoint row per step | as above |
| the same on both transports, with the worker's own run loop | `compat_regressions` `node.mjs:539 (thrown worker) / acceptance.mjs:112 E/G` and `node_truth_acceptance.mjs:443 N10 / node.mjs:534` (a real data exception, 22P05) | compat_regressions [api]: 36/36 OK (api); compat_regressions [direct]: 36/36 OK (direct) |
| the compatibility matrix row | `COMPATIBILITY_MATRIX.md`: "worker failure (a thrown handler)", required by `transport_compatibility_contract.mjs` | transport_compatibility_contract: 17/17 rows MIGRATED |

### C2-S1 — the production project is refused on the target the driver is given

| | |
|---|---|
| Code | `_shared/db.ts`: `dbTarget()` reads the URL once, in one form (`postgresql://USER:PASS@HOST:PORT/DATABASE`: every part present, no query, no fragment, a plain DNS host name taken in lower case, an escape only in the user name and the password, decoded once). Everything else is refused. Both entry points construct the driver with `dbOptions(dbUrl, caPem)` as its only argument: the URL is never handed to it |
| The refusal | on the text, as before, and on what was read: the host, the user, the database and the password, as the driver is given them. Every test can only refuse; nothing is defaulted |
| Fails closed | a tab, a line break, a space or a character outside ASCII; a query or a fragment; a missing user, password, port or database (the driver would take it from its environment); an IP address in any spelling; a list of hosts; a malformed escape |

| required coverage | row (`edge_db_tls_acceptance`, under Deno 2.5.6 with `npm:postgres@3.4.9`) | result |
|---|---|---|
| percent encoding; case normalization; escaped characters; equivalent hostname forms; URL parsing differences; whitespace / wrapper representations; alternate connection-string forms | T8: 81 URLs in 8 kinds, all refused, and `dbOptions` throws for each. The control hands the same URLs to the driver as the URL: it reads 45 of them as the production project, 40 of which do not spell the project ref in their text | edge_db_tls_acceptance: 10/10 OK |
| the accepted form is read exactly, and the driver holds exactly what was read | T7: 7 URLs; the driver's own options equal the target read, with no startup parameter of the URL's, and nothing from an environment that names production | as above |
| nothing else gets through | T9: 132 URLs; 44 malformed ones each refused with a reason that names what is wrong; no refused URL gets options | as above |
| the wiring | T6 and static P4: each entry point names its URL three times and constructs the driver once | as above; static factory_v1_static_contract: 73 passed, 0 failed |
| the entry points themselves, connecting through TLS | `edge_peer_acceptance` (the committed entry points under Deno, a real database) | 8/8 OK |
| the same class elsewhere | static X4b: the developer migration tool judges what pg's own parser reads and connects with it | static factory_v1_static_contract: 73 passed, 0 failed |

The cases are in `qa/factory/v1/db_target_cases.mjs`.

## Change-impact analysis (what the three commits touch, and what was re-run because of it)

| changed | consumed by | re-run at `95fdb85` |
|---|---|---|
| `scripts/factory-runner/enrolled/worker.mjs` (the enrolled runtime; compiled into both installers) | the installers; `runtime_units`, `runtime_recovery_acceptance`, `runtime_acceptance`, `release_acceptance`, `sea_package_regression`, `compat_regressions` | both installers rebuilt and reproduced IDENTICAL; every suite named, in the final pass or as a mutation-proof control |
| `_shared/node_api.ts` (one more field in one error answer) | every suite that speaks to the Node API | the final pass (every API suite) and `edge_boundary_acceptance`, `edge_peer_acceptance` |
| `_shared/db.ts` and the two entry points | the Edge functions; `edge_db_tls_acceptance`, `edge_peer_acceptance`; `deno check`; the developer §3.4 scan | all four; static P2–P4 |
| `scripts/factory-control-plane/migration.mjs` (`refusedRef`, `apply`) | the developer `apply` command only: no suite imports `apply` (static H1); `compose` and `sha256` are unchanged, and so is the migration's sha256 | static X4, X4b, H1; `schema_acceptance`, `manifest_rehearsal` |
| `qa/**` rows, the matrix, the mutation proof, the static contract | themselves | the mutation proofs and the final pass |
| not changed | the migration (`supabase/control-plane/v1/`), the web, setup, the supervisor, the release and trust code, every Director document, every file of the frozen 69df2f52 runtime | — |

## Results at the candidate SHA

### Final developer pass (`tools/final_pass.mjs --declarations`; evidence `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/final/`)

Commit `95fdb85acf755f8d28fa2393165cac7fb9ca77b7`; run by `tools/final_pass.mjs` (serial; developer verification, never independent).

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

Every step exited 0 (32 of 32).

Run at the candidate outside the final pass (they are not final-pass steps; evidence `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/extra/`): `runtime_units`
(35/35 OK), `runtime_recovery_acceptance` (13/13 OK), `edge_boundary_acceptance` (8/8 OK), `edge_peer_acceptance`
(8/8 OK), `legacy_director_acceptance --transport api` (8/8 OK), `installer_input_acceptance` (10/10 OK).

### Build declarations (WO-10 release provenance; CR-019)

- Emitted by `tools/provenance.mjs --emit` from a clean checkout of `95fdb85`, and checked by the final pass's
  `provenance --check` step, which rebuilds both channels and compares them with the declarations.
- Evidence: `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/build-declarations/` (`production.build-declaration.json` sha256 `b7431727327fa1612ef7bcadaafe4b3bf62be1e105123ac8bec51dc9b6ea093f`; `dev.build-declaration.json` sha256 `d4c0ddbb3ef8bf3419193739c1e7c6cbcda03365db9359c4d57f3e69fe406365`). They are committed in the evidence / report commit, a child of
  the candidate that changes no build input.
- They are information only, not a WO-6 release manifest (CR-019, as for candidate #2).

### Mutation proofs (developer)

| proof | mutants | killed | survivors / not judged / vacuous | evidence |
|---|---|---|---|---|
| v1 new invariants (`qa/factory/v1/v1_mutation_proof.mjs`), 19 suites, one invocation per suite, each with its control | 426 | **426** | 0 | `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/v1_mutation/` |
| SEA packaging (`qa/factory/sea_package_mutation_proof.mjs`), 4 batches | 30 | **30** | 0 | `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/sea_mutation/` |
| certified `acceptance_mutation_proof` at its 69df2f52 bytes, by label in 8 chunks | 60 runnable | **60** | 0 | `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/reference/acceptance_mutation_proof.chunk-*.txt` |

Every mutant ran at `95fdb85acf755f8d28fa2393165cac7fb9ca77b7` (the proofs clone this commit). v1 per suite:

| suite | killed | control |
|---|---|---|
| static | 77 of 77 | passed: factory_v1_static_contract: 73 passed, 0 failed |
| schema | 59 of 59 | passed: schema_acceptance: 82/82 OK |
| admin | 54 of 54 | passed: admin_acceptance: 46/46 OK |
| eligibility | 31 of 31 | passed: eligibility_acceptance: 25/25 OK |
| units | 27 of 27 | passed: runtime_units: 35/35 OK |
| release | 26 of 26 | passed: release_acceptance: 41/41 OK |
| independence | 25 of 25 | passed: independence_acceptance: 25/25 OK |
| enrollment | 17 of 17 | passed: enrollment_acceptance: 38/38 OK |
| pairing | 17 of 17 | passed: pairing_concurrency_acceptance: 12/12 OK |
| installer | 16 of 16 | passed: installer_input_acceptance: 10/10 OK |
| releaseunit | 14 of 14 | passed: release_trust_unit: 7/7 OK |
| tls | 14 of 14 | passed: edge_db_tls_acceptance: 10/10 OK |
| recovery | 13 of 13 | passed: runtime_recovery_acceptance: 13/13 OK |
| revocation | 12 of 12 | passed: revocation_interleaving: 30/30 OK |
| takeover | 7 of 7 | passed: takeover_acceptance [direct]: 20/20 OK |
| legacydirector | 6 of 6 | passed: legacy_director_acceptance [direct]: 8/8 OK |
| edge | 5 of 5 | passed: edge_boundary_acceptance: 8/8 OK |
| gate | 5 of 5 | passed: gate_acceptance: 6/6 OK |
| isolation | 1 of 1 | passed: isolation_env_unit: 3/3 OK |

The v1 proof has 426 mutants where candidate #2 had 397: 29 are new, and 4 (TL, IP, PC8, RLB) were re-anchored on lines the fixes moved. The 29, each with the row that caught it:

| mutant | suite | rows expected to fail | rows seen failing |
|---|---|---|---|
| HFT | units | HF1 or HF5 | HF1 HF3 HF5 HF7 |
| HFTr | recovery | TR1 or TR2 | TR1 TR2 |
| HFG | units | HF1 | HF1 HF5 HF7 |
| HFGr | recovery | TR1 or TR2 | TR1 TR2 |
| HFD | units | HF2 | HF2 |
| HFS | units | HF1 | HF1 HF7 |
| HFR | units | HF2 | HF2 |
| HFA | units | HF1 | HF1 |
| HFL | units | HF3 | HF3 |
| HFC | units | HF4 or HF8 | HF4 HF8 |
| HFV | units | HF6 | HF6 |
| HFK | units | HF7 | HF7 |
| HFQ | recovery | TR2 | TR2 |
| DTW | tls | T6 | T6 |
| DTWs | static | P4 | P4 V1 |
| DTE | tls | T8 | T8 T9 |
| DTX | tls | T5 | T5 |
| DTQ | tls | T8 | T8 T9 |
| DTA | tls | T9 | T9 |
| DTL | tls | T7 | T7 T9 |
| DTU | tls | T7 | T7 T9 |
| DTP | tls | T7 | T7 T8 T9 |
| DTC | tls | T8 or T9 | T8 T9 |
| DTT | tls | T8 or T9 | T3a T8 T9 |
| DTN | tls | T9 | T9 |
| DTD | tls | T9 | T9 |
| MTT | static | X4b | X4b V1 |
| MTE | static | X4b | X4b V1 |
| MTC | static | X4b | X4b V1 |

SEA batches: batch-00 (P1 P2 P3 U1 U2 U3 T1 N1): 8 of 8; batch-01 (N2 E1 E2 E3 C1 C2 C3 R1): 8 of 8; batch-02 (R2 R3 R4 R5 R6 R7 R8): 7 of 7; batch-03 (R9 X1 X2 A1 A2 DK1 DK2): 7 of 7.

The certified acceptance proof refuses to run whole at 69df2f52 itself (the anchors of N37x and N19 are absent from the certified files); of its other 69 mutants, 60 run by label and 9 (`acceptance.mjs` M N O Q P S3 G3 R S) are not judgeable from a clone of this branch — both baseline findings, unchanged from candidates #1 and #2: the certified proof and the files it mutates are at their 69df2f52 bytes.

### Certified reference suites at their 69df2f52 bytes (VERIFICATION_SPEC §3.7)

Evidence `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/reference/group1..4/` (one file per suite; `SUMMARY.txt` per group). Every suite file is byte-identical to 69df2f52 (the runner checks it first).

| suite | exit | summary |
|---|---|---|
| acceptance | 0 | factory acceptance: 58 passed, 0 failed |
| campaign_boundary_is_crossed | 1 | campaign_boundary_is_crossed: 21 passed, 1 failed |
| dbtest_on_disposable_pg | 0 | concurrency: TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN — VERIFIED under real concurrency (real PostgreSQL, two connections) |
| dedicated_supabase_provisioning | 0 | dedicated_supabase_provisioning: 11 passed, 0 failed  (disposable TLS server dressed as a Supabase project; nothing reached any real project) |
| denominator_cannot_shrink_silently | 0 | denominator_cannot_shrink_silently: 8 passed, 0 failed |
| founder_poke_not_required | 0 | founder_poke_not_required: 12 passed, 0 failed |
| health_check | 0 | health_check: 10 passed, 0 failed |
| http_provider_acceptance | 0 | http_provider_acceptance: 9 passed, 0 failed  (stub provider on 127.0.0.1:63907, disposable plane; nothing reached a real provider) |
| instrument_validity.regression.test | 0 | instrument_validity.regression.test: 20 passed, 0 failed |
| model_catalog_must_not_advertise_untested_models | 0 | 15 pass, 0 fail |
| no_silent_model_fallback | 0 | 12 pass, 0 fail |
| package_bootstrap_mutation_proof (static) | 0 | package_bootstrap_mutation_proof: 15 of 15 (control green + mutants killed)  (static mutants only; --fresh adds the original defect and thirty-four fr |
| package_bootstrap_regression --static | 0 | package_bootstrap_regression: 7 passed, 0 failed  (static rows only) |
| tls_plane_acceptance | 0 | tls_plane_acceptance: 9 passed, 0 failed  (plane served on 192.168.1.7:63959 with ssl=on, hostssl-only; disposable, removed) |
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

Non-zero exits, each classified (none is a candidate defect; the same three as at candidate #2):
- `campaign_boundary_is_crossed`: BASELINE FINDING: row R1 (a handler in handlers/ is not registered with the director). R1 reads only `scripts/factory-runner/handlers/` and `director-start.mjs`, byte-identical to 69df2f52 at the candidate; reproduced on a clean 69df2f52 clone for candidate #1
- `scripts/factory-runner/round-state.regression.test`: ENVIRONMENT (registered in VERIFICATION_SPEC §3.7): RS-C0 reads two worktrees that exist only on the original machine; the same at 69df2f52 on this machine
- `scripts/factory-runner/supervisor.injection.mutation`: BASELINE FINDING: 4 of 5 proven; the R-D9 anchor (`shell: true` in the SQL transport) is absent from the certified `supervisor.mjs`

NOT RUN, by rule: `package_bootstrap_regression` fresh-clone rows and `package_bootstrap_mutation_proof --fresh` (S-15: they re-register this PC's live task); `reboot_recovery_acceptance` and `factory_v1_acceptance --local-only` (BLOCKED — EXTERNAL: VM only); `shared_plane_live_acceptance`, `two_machine_real`, `two_machine_failover`, `two_machine_scheduling` (S-15: live state).

### The migration under the live applying login (F-1; AC-10, AC-11)

`qa/factory/v1/applying_role_plane.mjs --tree 95fdb85acf755f8d28fa2393165cac7fb9ca77b7`: the committed blobs of the candidate migration, applied as the step the Director instrument builds, by a NOSUPERUSER applying login that holds `factory_runner` with ADMIN only (a superuser is refused). Result: **applying_role_plane [tree 95fdb85acf755f8d28fa2393165cac7fb9ca77b7, director c7a845b6]: 13/13 OK**. Evidence `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/applying_role_plane/applying_role_plane.txt`.

- PASS M0 - no 69df2f52 control-plane file changed at 95fdb85acf75
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

- `provenance_check.txt`: MATCH: both channels' rebuilds of 95fdb85acf755f8d28fa2393165cac7fb9ca77b7 equal the declarations in evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/build-declarations
- `verify-build_dev.txt`: IDENTICAL: e1f485482300720325e2489ecd82e784bfe82bcee497a73bdaaca110ec5527df (unsigned image), and every build-info field but the signing ones
- `verify-build_production.txt`: IDENTICAL: e242ef756a10d6ff2dddc9e4974e7abde8a03242ee9ab8b4a963c0ca8a2a7181 (unsigned image), and every build-info field but the signing ones

### Static gates

| gate | result |
|---|---|
| `node --check` | every changed `.mjs` |
| Edge `deno check` (Deno 2.5.6) | both functions green |
| web | `tsc`, `eslint` on the changed files, `next build` (the web is unchanged since candidate #2) |
| one engine, route inventory = S-7, plane-conditioned scan (P0–P7, each class held to the Director's rulings), placement, whole-request gate inventory, migration privilege model, input channels, the database target (P4, X4b) | `qa/scenarios-runner/factory_v1_static_contract.mjs` (factory_v1_static_contract: 73 passed, 0 failed) |
| capability-impact registry | `architecture_impact_registry_contract` |
| secret scan | `tools/secret_scan.mjs`: 10 rules, positive-control self-test, clean at the candidate (base: the designated Director commit) |
| privacy scan (implementer's private tool) | every blob and commit message introduced in `baf4e4b5..95fdb85`: no overlap with the private records |

## Finding dispositions (the two candidate #2 findings, and the 88 records of candidate #1's verification, unchanged)

- 90 records: the 2 findings of candidate #2's verification (C2-P1, MEDIUM; C2-S1, LOW) and the 88 of candidate #1's (the 87 of the `412ac14` verification and the consolidated F-1). Every record has a disposition; none OPEN, PARTIAL or pending.
- The two candidate #2 findings: C2-P1 — FIX + regressions - CLOSED at developer level; C2-S1 — FIX + regressions - CLOSED at developer level; the same class fixed in the developer migration tool. "CLOSED at developer level" is the implementer's state; only the Director closes a finding, on a verifier's receipt.
- The 88 earlier records keep the dispositions candidate #2 gave them (no row changed). By state, all 90: 74 FIXED — CLOSED at developer level; 6 REFUTED (acknowledged); 2 CLOSED BY DIRECTOR RULING (no code change); 4 FIXED, with a VM half BLOCKED — EXTERNAL (R-1 clean VM); 2 FIXED locally, with the hosted measurement BLOCKED — FOUNDER (deploy); 2 ENVIRONMENT (acknowledged; BLOCKED — EXTERNAL).
- The five BLOCKER groups: F-1 (F-1, L7-28, L1-F11, L6-5); B-2 (L1-F1, L6-X1, L1-F2, L6-X2, L1-F7); B-3 (L2-F2, L3-F2, L4-F5, L6-1); B-4 (L1-F5, L2-F1, L6-X3); B-5 (L4-F1) — all resolved.
- The 26 MAJOR records, each dispositioned: 20 FIXED — CLOSED at developer level; 4 FIXED, with a VM half BLOCKED — EXTERNAL (R-1 clean VM) (L3-F1, L4-F4, L7-17, L4-F3); 2 FIXED locally, with the hosted measurement BLOCKED — FOUNDER (deploy) (L2-F4, L3-F4).
- Stated residuals, named by ID only here and sent privately: L2-F3, L3-F2, L3-F3, L3-F7, L3-F9, L4-F1, L4-F6, L4-F10, L7-10.

| finding | severity | packet group | area | disposition state | requirement ids |
|---|---|---|---|---|---|
| C2-P1 | MEDIUM | candidate #2 | A7 | FIX + regressions - CLOSED at developer level | P-2, P-3, AC-9 |
| C2-S1 | LOW | candidate #2 | A3 | FIX + regressions - CLOSED at developer level; the same class fixed in the developer migration tool | S-10 |
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

The same as candidate #2; none is new.

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

- CR-001..CR-004 were filed on the first contract branch (`factory/auto-enrollment-v1-contract`, still on the remote); their files
  are in no later tree, so reading them needs that branch.
- CR-006: step R is the post-V1 rotation runbook. CR-021, CR-022 and CR-026 are the §3.4 classes the static contract's P3p holds
  to the Director's record; the verifier names each hit's construction in its receipt, as the rulings say.
- **CR-021 and the new Edge tests.** `_shared/db.ts` now makes 17 tests on its own database URL where candidate #2 made 6, and
  refuses the production project in 2 places where it did in 1. Each new test can only refuse (none chooses between two targets and
  none supplies a default), in the same function family the ruling names (`dbRefusal` on the database URL and CA). The developer
  inventory proposes the same class for them under the same ruling. That is a proposal: the verifier classes each hit.
- The candidate relies on none of CR-007..CR-020 or CR-023..CR-025. Each is recorded in `a0bb7985` as its r3-conforming reading, and
  the candidate keeps the r3 behaviour in each.

## Behaviour changes since candidate #2 (each commit's message lists its changes)

| commit | what changed |
|---|---|
| `cfb173cb` | C2-P1: the worker's failure rule, the kept runs of the give-back, `sqlstate` on a server refusal. C2-S1: the one reading of the database URL, the driver given the read target only; the same class in the developer migration tool. Rows HF1–HF8, TR1, TR2, T5–T9, P4, X4b; the matrix row; 29 mutants and 4 moved anchors |
| `1ff77550` | no product code: the thrown-worker rule in `BASELINE_LIFECYCLE_INVENTORY.md`; row HF9; the citation rule's one historical commit |
| `95fdb85` | no behaviour: the documented URL form and three test passwords reworded so that the secret scan reads no credential shape; two refusal messages name the form in other letters |

Nothing else changed since candidate #2. Its report's sections on the work orders, the migration privilege model and the release
provenance inputs hold for candidate #3 with the numbers below.

## What each work order asked the report to include

| WO | item | where |
|---|---|---|
| WO-1 | every table, function, role and grant with the catalog read-back; the seeded policy and operator tenant rows; no secret stored; envelope immutability by a node; the legacy refusals as `factory_runner`; manifest preservation with the step the Director instrument builds | `INVENTORY.md`; `schema_acceptance` (schema_acceptance: 82/82 OK); `manifest_rehearsal` (manifest_rehearsal: 6/6 OK); the applying-role plane above |
| WO-2 | the compatibility matrix with every VERDICT backed by a passing regression; the §6 evidence from server rows; the static handler inventory | `COMPATIBILITY_MATRIX.md` (transport_compatibility_contract: 17/17 rows MIGRATED); `compat_regressions` direct + api; `transport_compatibility_contract`; static O1–O3 |
| WO-3 | transitions and failure states; abuse cases at their bounds, including a spoofed forwarding header; the CSPRNG and its entropy; no pepper and no plain SHA-256 | `enrollment_acceptance` (enrollment_acceptance: 38/38 OK); `pairing_concurrency_acceptance` (mutation proof controls) |
| WO-4 | a clean-machine rehearsal on a non-acceptance machine; the installed footprint | **BLOCKED — EXTERNAL** for a clean VM. On this PC: `runtime_acceptance` (runtime_acceptance: 13/13 OK); `sea_package_regression` (sea_package_regression: 28 passed, 0 failed) |
| WO-5 | a test per gate and each gate removed singly; best resources with no authorization; a self-reported capability outside the envelope; preferred node unavailable; the Home-authoring restriction (AC-15); numeric priority | `eligibility_acceptance` (eligibility_acceptance: 25/25 OK); v1 mutation proof, eligibility suite |
| WO-6 | the manifest format and key-id model; the start-path verification point; every refusal case; rotation / revocation; no production key material | `release_acceptance` (release_acceptance: 41/41 OK); `release_trust_unit` (release_trust_unit: 7/7 OK); release provenance below |
| WO-7 | a revoke committing while a session is valid and a run in flight, then every node operation refused; evidence intact | `revocation_interleaving` (revocation_interleaving: 30/30 OK) |
| WO-8 | the persona × path matrix including the self-promoted employee; the allowlist probe; the row-for-row server comparison; the S-16(a) binding cases of AC-12(e) | `admin_acceptance` (admin_acceptance: 46/46 OK); `web_computers_acceptance` (web_computers_acceptance: 7/7 OK); the AC-12(e) VM run is BLOCKED — EXTERNAL |
| WO-9 | AC-14 (a)–(p); the policy-write refusal; the certification record format | `independence_acceptance` (independence_acceptance: 25/25 OK); `admin_acceptance`; `factory.certifications` (050) |
| WO-10 | the suite results; manifest preservation; release provenance inputs; the secret scan; the frozen SHA; the Director commit | this report |

## Migration privilege model (L6-5; `MIGRATION_PRIVILEGES.md`, `predicted_catalog_difference.json`)

Unchanged since candidate #2 (the migration is byte-identical). The catalog difference the migration makes, predicted and compared
by `manifest_rehearsal`, includes exactly these `pg_auth_members` rows:

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
| production | 0.1.0 | `95fdb85acf755f8d28fa2393165cac7fb9ca77b7` | false | 2026-10-01T06:34:45.000Z | `62630984c3ae9c6a12c1388261f772ab9e888119f653aa821374e7e132cf903d` | `e242ef756a10d6ff2dddc9e4974e7abde8a03242ee9ab8b4a963c0ca8a2a7181` | production | **empty** (no key before C-3) | https://npvhuoozkbexddnvkqsj.supabase.co/functions/v1/factory-node-api |
| dev | 0.1.0 | `95fdb85acf755f8d28fa2393165cac7fb9ca77b7` | false | 2026-10-01T06:34:45.000Z | `132a2a62303ba897e2ddf91a62c88e4f3e3db51a7f9c6a64c91a5ce6f4e5177b` | `e1f485482300720325e2489ecd82e784bfe82bcee497a73bdaaca110ec5527df` | dev | `ed25519:98601d6850ee07dee28b13e1dfd6de3f737b4e730c20fe3b8a620c9cc99536e6` / `98601d6850ee07dee28b13e1dfd6de3f737b4e730c20fe3b8a620c9cc99536e6` | (none: dev) |

- Base executable: node v24.19.0 `win-x64/node.exe`, sha256 `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237` (pinned; source https://nodejs.org/dist/v24.19.0/SHASUMS256.txt), signature stripped before injection.
- Reproducibility: `verify-build.mjs` rebuilds each channel from the same commit and reports IDENTICAL (final pass steps 3-4; `release_acceptance` R-h, which also compares every embedded trust entry with a recomputation from the committed trust source). The per-channel build declarations (`provenance.mjs --emit`, committed in the candidate-notice commit) are the implementer's information-only evidence of the same facts, not the candidate's release manifest unless the Director so decides (CR-019); `provenance.mjs --check`, run in a clean checkout of the frozen SHA, compares them with a fresh rebuild.
- Control-plane migration: `scripts/factory-control-plane/migration.mjs compose` (a developer label: its sha256 is `58bc2274a7d3c459107381646374e5a7c09294e02423c13e2b745cc4fd6827b1`, not the step's). The live-migration step is not built here: the verifier builds it from the candidate migration's committed bytes with the Director instrument `qa/verification/auto-enrollment-v1/tools/build_live_migration_step.mjs` (WO-1 r3), and the founder applies exactly that file.
- No production key material: the production trust set is empty, and the only key anywhere is the dev key (public seed; disposable planes only). The build refuses a production trust set that holds a dev key, and a dev trust set that holds any other key. The release receipts, and the digest the founder signs, come from the verifier's rebuild at the CERTIFIED SHA, not from this table.

## Decisions requested

1. **C-3 (founder):** production release-signing key custody. Until then the production trust set is empty
   (`scripts/factory-runner/enrolled/trust/production.json`), so no live-mode release exists, and AC-1..AC-4 final acceptance waits.
2. **S1 and its extended vectors (founder; Brain OS, not Factory):** unchanged from candidate #2, and not part of candidate #3.

## Known limitations (stated, not hidden; details of unfixed residuals went to the Director privately)

- **The findings as the implementer had them.** C2-P1 and C2-S1 were built from the founder's statement of them. The verifier's own
  reproduction was not in the implementer's hands; the rows above cover every transient kind and URL family the implementer could
  construct, which is not a proof that they contain the verifier's exact case.
- **C2-P1, the reading of "deterministic".** 69df2f52 fails a thrown run only on a data exception. The enrolled runtime reaches the
  database through the API, which refuses a malformed request by name before the database sees it; the worker treats those refusals
  (`bad_request`, `identity_from_body_refused`, `body_too_large`) as that same deterministic class. Every other error — a constraint
  violation, an unknown refusal, a handler's own exception — leaves the run to its lease, as at 69df2f52. A failure that repeats on
  every attempt and is none of those is claimed again every lease period; 69df2f52 behaves the same, and neither has an attempt limit.
- **C2-P1, the wait.** A node whose envelope allows one run claims nothing else until the lease of the run it left has lapsed (the
  claim's default is 120 s). That is the certified behaviour, and it is the back-off.
- **C2-S1, what a name check cannot see.** A host name that reaches the production database through DNS without containing the
  project ref is not recognised; an IP address is refused. Unchanged from candidate #2; the Factory API logins do not exist in the
  production project.
- **C2-S1, stricter configuration.** A database URL with a query string, without a port, or with a trailing line break is now
  refused, and the function answers 503 `misconfigured` with the reason. `FOUNDER_PREPARED_STEPS.md` step 4 states the form.
- **UNMEASURED until the founder's deploy:** the Edge platform's wall-clock and CPU limits; the peer address the hosted runtime
  reports (AC-8's per-address clause is BLOCKED, never measured here); whether the platform strips the function path prefix (route.ts
  accepts both shapes); postgres.js over the pooler under load; verify-full to the real pooler host with the downloaded CA.
  `FOUNDER_PREPARED_STEPS.md` §5 lists the mandatory post-deploy live acceptance.
- **Judging-plane fidelity:** every PostgreSQL suite ran on embedded PostgreSQL 18, not the Supabase-image plane.
- **Record-level residuals** of candidate #1's verification with a stated reading: L2-F3 (the web half is proven statically), L3-F2,
  L3-F3, L3-F7, L3-F9, L4-F1, L4-F6, L4-F10 and L7-10 — unchanged from candidate #2.
- **The developer §3.4 scan is an approximation** with stated limits (`factory_v1_plane_scan.mjs` LIMITS); the verifier's own scan
  governs.
- **Product comments** in `supabase/control-plane/v1/*.sql`, the Edge entry point and `release.mjs` still describe CR-011, CR-013,
  CR-014, CR-015, CR-020 and CR-021 as questions for the Director. The candidate keeps the r3 behaviour each ruling confirmed.
- **The static contract's P3p** hashes each relied-on change request as committed at HEAD; an uncommitted edit to a CR file in a
  working tree is not seen by that row.
- **Mongolian UI strings** on the Computers page need a native speaker's review.
- **Logon-only task:** a computer is OFFLINE until its user signs in (stated on the page).

## Where things are

| item | location |
|---|---|
| Implementation records | `DECOMPOSITION.md`, `RECONCILIATION.md`, `R3_RECONCILIATION.md`, `BASELINE_LIFECYCLE_INVENTORY.md`, `COMPATIBILITY_MATRIX.md`, `MIGRATION_PRIVILEGES.md`, `predicted_catalog_difference.json`, `change-requests/` |
| Founder steps | `FOUNDER_PREPARED_STEPS.md` |
| Third-PC script (not run) | `ZERO_TOUCH_ACCEPTANCE_SCRIPT.md` |
| Inventory | `INVENTORY.md` (generated at the candidate SHA) |
| Evidence | `evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/` (candidate #2's stays at `evidence/c667367b6d0fcf02a4d575f050aaa475c644ca7b/`, candidate #1's at `evidence/candidate/`) |
| Fresh-clone recipe | `git clone -b factory/auto-enrollment-v1-implementation …`; `git fetch origin factory/auto-enrollment-v1-director` (the static contract reads the Director's CR-disposition record); `git checkout 95fdb85acf755f8d28fa2393165cac7fb9ca77b7`; `npm ci` at the root and in `web/` (and in `qa/dbtest/` for `dbtest_on_disposable_pg`); `node scripts/factory-build/build-sea.mjs --channel dev` and `--channel production`; `node qa/implementation/auto-enrollment-v1/tools/final_pass.mjs <out> --declarations <copy of evidence/95fdb85acf755f8d28fa2393165cac7fb9ca77b7/build-declarations>` (the reference set: `tools/run_reference_suites.mjs` and `tools/run_acceptance_mutation_chunks.mjs`). It needs Windows x64, the pinned node 24.19.0, openssl (Git for Windows) and network access for `npx deno@2.5.6` |

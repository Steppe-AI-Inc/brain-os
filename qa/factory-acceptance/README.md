# Factory V1 independent acceptance harness (Work PC)

Verifier-only. Everything here observes the pinned Home-PC refs and records verdicts; nothing here
implements, migrates, deploys, or touches production. The canonical human-readable report is
`qa/work-pc/FACTORY_V1_INDEPENDENT_ACCEPTANCE.md`; the Home-PC handoffs are under
`qa/home-pc-handoff/HOMEPC-2026-09-14-*`.

## Pinned refs (PIN_DRIFT aborts every suite if origin moved)

| Key | Ref | SHA | Worktree |
|---|---|---|---|
| `master` | `origin/master` | `55a159172a9bbc9b69cde4d2f832418573a4b0b9` | `%LOCALAPPDATA%\brain-os-qa\source-wt\55a1591` |
| `p1` | `origin/p1/control-plane-phase0` | `dcc0d9c554e8ddbba27b9aabfdc6be94a81c2baf` | `%LOCALAPPDATA%\brain-os-qa\source-wt\dcc0d9c` |

Worktrees are created by `qa/runner/lib/source-worktree.mjs` (`git worktree add`, scanned clean).
Every check record carries `{finding_class, source_ref, source_sha, blob_shas, deployed_web_sha:
"UNKNOWN", production_binding: "CANNOT_BIND_TO_DEPLOYED_WEB"}`; a defect present on both refs is
recorded once per ref.

## Evidence levels (never promoted)

| Level | Meaning |
|---|---|
| `SOURCE_FINDING_ONLY` | pinned source text (grep / pure-function import) |
| `LOCAL_DB_CONTRACT` | PGlite (PostgreSQL 18.3 WASM) through the pinned `qa/dbtest/db.mjs`; single connection; RLS emulation - NOT SECURITY VERIFIED |
| `REAL_POSTGRES_LOCAL` | embedded PostgreSQL 17.10 (`embedded-postgres@17.10.0-beta.17`), two connections, one machine, loopback only |
| `MACHINE_PROPERTY` | what this Work PC holds (credentials by shape, scheduled task, lease) |
| `CROSS_NODE_REAL` | Home-PC node A -> Work-PC node B over shared non-production PostgreSQL. **BLOCKED - never claimed here** |

## Verdict vocabulary

`PASS` the claimed invariant holds · `FAIL` it does not (defect evidence) · `ABSENT` the mechanism does
not exist on the visible refs · `PARTIAL` holds in part (details in `evidence`) · `NO_VERDICT` could not
be observed (`no_verdict_reason`). The `node --test` assertion is only "a verdict was observed and
recorded"; a thrown harness error becomes `NO_VERDICT` + a failed test. A FAIL is a result, not a
reason to modify the implementation.

Home-PC suites re-run here are `evidence_kind: cross-check`; Work-PC-authored checks are
`independent`. Home-PC SQL suites use `set local role` only, so inside them `session_user` stays
`postgres` (`persona_fidelity: SET_ROLE_ONLY`); the persona-session versions (CPS-05/06/08/11) are
the authoritative ones on this engine.

## Files

```
preflight.mjs                    pins, deps provenance, resolution proof, embedded PG start/serve/teardown -> results/PREFLIGHT.json
lib/provenance.mjs               REFS, pinRefs(), provenanceFor(), anchorsIn(), sameBlobOnBothRefs()
lib/record.mjs                   suiteRecorder().check() -> results/<suite>.checks.json, secret scrub, TAP parser
lib/deps.mjs                     pinned qa/dbtest deps outside every worktree; embedded-postgres lifecycle + provenance
lib/pglite-factory.mjs           openFactoryDb(), persona sessions, runSqlSuite(), moveTime() (fixture time only), seeds
lib/independence.mjs             acceptance ORACLE for AUTHORING RUN != CERTIFYING RUN (conditions C1..C10); not a schema
director.acceptance.mjs          DIR-00..11   persistent Director / dispatch / restart / duplicate-dispatch invariant
control-plane-security.acceptance.mjs  CPS-00..12  db.mjs, ambient credential borrowing, claim authority, forgery, FK wiring
lease-recovery.acceptance.mjs    LR-00..10    claim/lease/TTL/resume on PGlite + SKIP LOCKED race on real PostgreSQL
role-independence.acceptance.mjs RI-00..06    authoring vs certifying run
provider-readiness.acceptance.mjs PR-01..07   provider vocabulary, DeepSeek/Tier-0 absence, no-silent-fallback
machine-property.acceptance.mjs  MP-00..04    Home-PC authority tests on this machine, QA infra liveness, evidence integrity
consolidate.mjs                  -> results/FACTORY_V1_ACCEPTANCE.json, RECONCILIATION.json, EVIDENCE_TABLES.md, Home-PC handoff JSON
results/                         committed evidence (never deleted by teardown)
```

## Run order (repo root)

```
node qa/factory-acceptance/preflight.mjs                 # pins, deps, PGlite chain, embedded PG provenance
node qa/factory-acceptance/preflight.mjs --serve         # background shell: keeps the disposable cluster alive
node --test qa/factory-acceptance/director.acceptance.mjs
node --test qa/factory-acceptance/control-plane-security.acceptance.mjs
node --test qa/factory-acceptance/lease-recovery.acceptance.mjs
node --test qa/factory-acceptance/role-independence.acceptance.mjs
node --test qa/factory-acceptance/provider-readiness.acceptance.mjs
node --test qa/factory-acceptance/machine-property.acceptance.mjs   # last: MP-04 audits the other results
node qa/factory-acceptance/consolidate.mjs
node qa/factory-acceptance/preflight.mjs --teardown      # stop + delete the cluster; evidence untouched
```

## Disposable PostgreSQL provenance and cleanup

Installed only under `%LOCALAPPDATA%\brain-os-qa\pgdeps` (npm, `--ignore-scripts --save-exact`, no
service, no admin). Data dir `%LOCALAPPDATA%\brain-os-qa\pg\data`, port 54329, loopback only, fresh
`initdb` per start. The pinned `qa/dbtest/db.mjs` disposability gate takes the pristine route and
plants its sentinel; `proveLocalNonProduction()` records `inet_server_addr()` and a non-Supabase host.
Version, npm integrity hash, binary sha256 prefix and data-dir path are in `results/PREFLIGHT.json`.
The lease duration (30 minutes, `p_stale_claim_after`) is never shortened; time is moved only by
fixture timestamps. `--teardown` stops the server and deletes the data directory; evidence files
are never touched.

## Boundaries

No production SQL, no Supabase admin/service-role authority, no production credentials, no writes
under `scripts/`, `supabase/`, `web/`, `governance/`, `.github/`, `docs/`, no v99/#99 candidate
edits, no BUG-036/037 invitation/signup testing, BUG-035/036/037 state untouched
(`results/RECONCILIATION.json` proves it).

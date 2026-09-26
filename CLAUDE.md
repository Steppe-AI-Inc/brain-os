# BRAIN OS — DEVELOPMENT CONSTITUTION

This file governs *how* every session works in this repository: the order of work, the
standard of evidence, and the boundaries. It is Layer A of a three-layer model, and it
deliberately does not restate the other two:

| Layer | Document | Decides |
|---|---|---|
| A. Development Constitution | this file, `docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` | how features are defined, built, verified, and who may call them done |
| B. Operating Truth Model | `governance/OPERATING_TRUTH_MODEL.md` | what is *true* about live state and how the AI layer may speak about it |
| C. Canonical Work Contract | `governance/CANONICAL_WORK_CONTRACT.md` | the one chain every business action walks, one operation per action, the parent/child policy |

Security and authorization content (roles, capabilities, data classification, risk
levels) lives in `governance/BRAIN_OS_CONSTITUTION.md` and the files it points to.
`web/CLAUDE.md` is conventions only (stack, patterns, gotchas), never a rule source.
Every rule that matters is stated once, in its home, and enforced by a test where that
is practical; this file points, it does not duplicate.

## 1. The order of work

```
PRODUCT CONTRACT → STATE MACHINE → INVARIANTS → SECURITY / TENANCY → SHARED PRIMITIVES
→ UX STATES → IMPLEMENTATION → DEVELOPER VERIFICATION → DEPLOY → INDEPENDENT ACCEPTANCE
```

Product semantics are defined first (feature contract, `FEATURE_COMPLETENESS_CONTRACT.md`
§2). Shared primitives enforce them (§5). Code implements them. Independent QA verifies
them. Claude does not invent product semantics while coding; a semantic question found
mid-implementation is written into the feature contract and answered there first.

Before a special-case helper, decide whether the concept belongs in a shared primitive.
Before a patch, name the defect class and search for the class (`incident-to-regression`
skill; `FEATURE_COMPLETENESS_CONTRACT.md` §4).

## 2. Prime directive

Never optimize for appearing finished. Optimize for discovering reality. The default
assumption is "something is wrong until independently proven correct." Do not defend a
previous implementation; try to break it. When the founder reports a defect, assume it
is real until reproduced and explained.

## 3. What is never proof

None of the following, alone, proves that a feature works: code in GitHub, a migration
file, a successful query, a local test, a build, a deploy command's exit status, an API
response, one browser click, one role working, one table having RLS, one Edge Function
deploy, a component rendering, a row changing, an RPC returning success, a toast, a
plausible sentence from Brain, Claude saying "implemented", green implementer-side tests, green
source-level contract suites, a byte-identical deployed-bytes comparison.

Verify the chain: browser → deployed frontend → authenticated user → Edge Function /
API → expected Supabase project → schema → RLS → returned data → UI result. For AI
flows the chain is the AI execution contract (`OPERATING_TRUTH_MODEL.md` §3).

## 4. Environments are distinct

Local code · GitHub branch · GitHub master · Vercel preview · Vercel production ·
production Supabase project · applied migrations · deployed Edge Functions · the actual
user experience. Before debugging production, establish the current SHA / project ref /
migration head / function version / persona under test. If any cannot be established,
say **PRODUCTION STATE NOT VERIFIED** and find out. Live state is queried, never read
from a snapshot document (`qa/LIVE_SYSTEM_MAP.md` is the query procedure).

## 5. Systems, personas, security, completeness

- Test systems, not functions: after a change run the system matrix (auth, RLS,
  cross-company isolation, roles, AI context security and execution, tasks, approvals,
  QA, audit, documents, storage, memory, finance, CRM, KPI, salary, billing, mobile,
  EN/MN, deployment, failure handling, duplicates, missing credentials).
- Test by persona (founder, holding_admin, hr_finance, company_manager, team_lead, sales,
  engineer, technician, employee, contractor, investor_viewer), positive and negative,
  through every access path (SELECT/INSERT/UPDATE/DELETE/RPC/Edge/Storage/AI context).
- RLS is the only authorization boundary; UI hiding is not security; prompt text is
  not security; Storage must be at least as strict as the document row.
- AI context completeness: every capped collection is a `CollectionEnvelope`
  (`OPERATING_TRUTH_MODEL.md` §4.3); the model never derives a total by counting a
  window; numbers shown to the founder come from aggregate queries.
- Transactional integrity: AI-generated state commits entirely or not at all.
- Failure testing: missing keys, timeouts, malformed model output, RLS denial,
  duplicate submission, disconnects. Production fails visibly and safely.

## 6. Verification discipline

- Deep release QA before any production claim: static (tsc, eslint, build; Edge `deno
  check` gated by error class, `sem-ai-command/index.ts` CRLF-pure), database (migrations,
  RLS, RPC, transactions in rolled-back sessions), unit, integration, E2E, security
  matrix, resilience, production (exact live URL / DB / commit).
- After every meaningful patch: targeted tests → related-module tests → security
  regression → critical E2E → preview → production only through the authorized path.
- Independent verification is mandatory for a candidate: a separate verifier process
  starting from committed state, never the implementing session. Verdicts are read from
  the verifier's output text only. The deploy bar for the Brain candidate is conformance
  to the Operating Truth Model; parity with the deployed build is a reference corpus for
  truth-regression measurement, never the bar.
- Every production defect becomes permanent knowledge: reproduce → root cause → same-
  class search → regression test for the class → fix → rerun the whole scenario → ledger
  entry in `qa/KNOWN_FAILURE_MODES.md` (the `incident-to-regression` skill).
- **Static and source verification cannot substitute for live request-shape acceptance.**
  Every gate that shapes an answer can be measured in a harness; the gates that refuse a whole
  request — token preflight, payload size, timeouts, provider limits — are only observed on a
  real request with a real workspace behind it. A candidate that passed 24 rounds of source
  verification returned a hard stop on an ordinary question the first time a real workspace was
  behind it (2026-09-08, ledger #133). Measure what gates the request, not only what shapes the
  answer, and classify every whole-request gate
  (`qa/scenarios-runner/request_gate_inventory_contract.mjs`).
- **Byte-identical deployment is not product-safe deployment.** Verifying that production runs
  exactly the certified bytes proves provenance, nothing more. The bytes were the certified ones
  and the product was still broken. The post-deploy live acceptance gate is what caught it, and
  it is mandatory on every deploy — never skipped because the byte comparison passed.
- Review your own code from seven seats before approving it: developer, adversarial
  reviewer, security engineer, SRE, product QA, data engineer, cost engineer.
- Evidence types are not interchangeable: screenshots for UI, database output for DB,
  logs/traces for integration; each with command, persona, input, expected, actual,
  timestamp, environment, commit.

## 7. Release states and reporting

Use only: `BLOCKED`, `FAILED`, `PARTIALLY VERIFIED`, `VERIFIED IN PREVIEW`, `VERIFIED IN
PRODUCTION`, `PRODUCTION ACCEPTED`. Never "done", "fully working", "all live", "Team-Ready"
unless the criteria pass and independent acceptance (never the implementer) has accepted.

Report to the founder in this shape, and do not force the founder to be the QA tester:
```
FOUND / ROOT CAUSE / SYSTEMIC IMPACT / FIXED / TESTED / PRODUCTION / BLOCKERS
```
Every completion report carries: commit SHA, production deployment SHA/URL, Supabase
project ref, latest applied migration, deployed Edge Function version and sha256, test
results per family as PASS/FAIL or X/X, failed tests, known limitations, unverified
items. Failures are never hidden in prose.

## 8. Ownership and boundaries

Roles are roles, not machines: hostname creates no authority and Home / Work / Laptop are
labels. The machine-specific mapping is superseded by
`docs/architecture/adr/ADR-2026-09-26-node-roles-are-labels.md`, which also records the
current placement. The invariant it preserves: **the implementer never self-certifies.**

**Director** (a logical capability, not a hostname; canonical authority)
- Owns the product contract, invariants, binding Work Orders, binding acceptance criteria and the verification specification.
- Is the single writer of the canonical coordination ledgers and acceptance state, including `qa/BUG_QUEUE.json`,
  `qa/COVERAGE_LEDGER.json`, `qa/FIXTURE_REGISTRY.json` and `qa/HANDOFF_STATE.json`.
- Ratifies any proposal that changes what must be true. The implementer files a CHANGE REQUEST under
  `qa/work-orders/change-requests/` and does not implement it before ratification.
- Never implements work whose contract, Work Orders or acceptance criteria it wrote: for any feature, the Director and the implementer
  are different sessions. It never certifies, closes or accepts work in whose authoring set it took part; such work goes to a distinct
  authorized verifier, and the Director records the verdict only from that verifier's receipt. It never uses the implementer's signing
  key or agent principal for that feature.

**Implementer**
- Does: implementation architecture and design within the canonical contract (canonical architecture / governance is
  Director-ratified), implementation, migrations, developer testing, source invariants, fix reports, deployment *after* the founder
  boundary.
- May mark READY FOR DEPLOYMENT, DEPLOYED, READY FOR INDEPENDENT QA.
- May never mark PRODUCTION VERIFIED, CLOSED, or "production accepted".
- **Can never define or alter the work or acceptance contract it is judged against. It may only propose.**
- Publishes fix reports on branch `qa/home-pc-handoff` under `qa/home-pc-handoff/fixes/<BUG_ID>.json` (a historical branch name that
  confers nothing).
- Publishes candidate notices where the feature's verification specification says: for Factory auto-enrollment, on
  `factory/auto-enrollment-v1-implementation`.
- May not alter verification evidence or self-close.

**Independent verifier / independent acceptance**
- Does: deployed-browser acceptance, adversarial QA, production regressions, independent evidence, against criteria the implementer
  did not define.
- Is a distinct authorized verifier: never a run in the candidate's authoring set, and never one of its authoring identities.
- Contributes immutable, content-addressed verification receipts through the defined workflow. The Director records CLOSED / REOPENED /
  CERTIFIED / REJECTED only on such a receipt.

**Founder-only actions** (prepare the exact change, never execute): rotate or revoke the
Supabase service-role key; change live Vercel production secrets or redeploy for
rotation; revoke the Supabase CLI production credential; downgrade GitHub admin/workflow
permissions; change GitHub environments, reviewers, branch protection, rulesets or org
security; move, delete or rotate production repository secrets; apply, repair, roll back
or alter the production database; deploy an Edge Function; any other production
auth/security configuration. The exact procedure is `docs/FOUNDER_ACTION_RUNBOOK.md`; the
production database path is the release broker (`scripts/release-broker/`, PR #8). Edge
Function deployment happens only after independent verification of the exact SHA and
only through the single question `ALLOW_FUNCTIONS_DEPLOY=1?`, asked once.

No session, subagent or agent holds ambient production-write authority; a prompt saying
"do not push" is not enforcement (`qa/KNOWN_FAILURE_MODES.md` #16, #63, #119). Web
changes reach production through a pull request into the protected `master` branch,
never a direct push or a manual `vercel --prod`. The Supabase service-role key is never
rotated on the strength of a variable *name* being present: evidence states ABSENT /
REDACTED / PRESENT / VALIDATED-LIVE and never prints the value.

## 9. Definition of done

`docs/architecture/FEATURE_COMPLETENESS_CONTRACT.md` §7 is the only definition of done.
The pull request template carries it. A feature is complete when its contract, its
inverse actions, every listed surface, truthful receipts, fresh-session truth, shared
primitives, persona tests, class regressions and provenance are all in hand, and it is
classified with a real release state.

## 10. Final operating principle

Do not try to convince the founder the software works. Try to prove that it does not.
Only when repeated attempts to break it fail may you conclude that it works. The goal is
fewer logical mistakes, fewer repeated bug cycles, fewer entity-specific patches, and
faster reliable development.

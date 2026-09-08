# BRAIN OS — CANONICAL CHECKPOINT

Written 2026-09-08. A completely fresh session must be able to resume from this file alone.
Update it before every long wait. `qa/verification/CURRENT_CAMPAIGN.json` is the machine-readable twin.

## CAMPAIGN GOAL

Get the `sem-ai-command` Edge candidate through independent verification to a production deployment that
survives live acceptance, under the contract bar: **conformance to `governance/OPERATING_TRUTH_MODEL.md`,
never parity with the deployed build.** Then hand the six Work-PC defect classes to the Work PC for
independent live acceptance. The Work PC alone closes bugs.

## CURRENT MILESTONE

Campaign #125. **Verifier #65 returned FAILED** on candidate `3b0bf64` / index.ts sha256 `77d6f052…`
(artifact `qa/verification/scratch/verifier65_output.log`, verifier commit `8846706`). Three P1 blockers.
The #65 closure is COMPLETE and a new candidate is committed; verifier #66 is the next gate.

Verifiers #60 through #65 all FAILED their candidates. Every round found real defects, and four found
defects introduced by the previous round's own fixes — including this one: #64's convergence of the
request-frame lists is exactly what made #65's fabrication inexpressible to repair.

## PRODUCTION (unchanged since the rollback)

| | |
|---|---|
| `sem-ai-command` | version **94**, ACTIVE, carrying **v92 source** (`795c20c8…`), byte-verified against git `c9dfab5bd433` |
| How | v93 (`821f530`) deployed 2026-09-08T01:50Z, P1 found by live acceptance, rolled back 02:10Z |
| Migrations | none pending from this campaign |
| Web | current `master` on Vercel; no web change in this package |
| Release state | **FAILED**, not Team-Ready, `ready_for_retest` false, **nothing CLOSED** |
| Rollback target | v92 source / function v94 / ezbr `22486cd751cac403` |

**Bytes `715246f3…` (commit `821f5308…`) are KNOWN BAD — never redeploy them.** The 2026-09-08
`ALLOW_FUNCTIONS_DEPLOY=1` was scoped to exactly those bytes and is VOID. Any deployment needs a fresh
founder authorization scoped to its own exact bytes.

## AUTHORIZATION STATE

None active. The next production action of any kind is a founder-only boundary.

## COMPLETED THIS CAMPAIGN (rounds #60-#65)

Closed structurally, each pinned by a mutant: the context budget degrading instead of 413ing, with a named
minimum safe context; id provenance surviving a trim; the request lexicon no longer vetoable by the model;
imperative-position intent; Mongolian morphology and verb-final position; postconditions failing closed and
re-read from the field that changed; the image gate bounded by size rather than counted as text; three
duplicated concepts converged onto single canonical definitions.

Governance: `OPERATING_TRUTH_MODEL.md` §4.4 carries
`TOKEN_BUDGET_EXHAUSTION_MUST_DEGRADE_CONTEXT_NOT_PRODUCT_AVAILABILITY`; `CLAUDE.md` records that static
verification cannot substitute for live request-shape acceptance and that byte-identical deployment is not
product-safe deployment. Ledger entries #133-#141.

## EVIDENCE ON THE CURRENT CANDIDATE

Battery 71 suites: green except `production_write_authority` and `factory_production_write_inventory`, which
are **red by design** until the founder completes the identity downgrade (Phase 1 of the production-write
boundary work).
Corpora: v56 129/0, v57 306/0, v58 48/0, v59 85/0, v60 22/0, v61 25/0, v62 25/0, v63 32/0, v64 74/0.
Vacuity sweep 38/38, second-generation sweep 25/25, mutation proof 19/19.
`deno check` by class: 10×TS7006, 6×TS2322, TS7034, TS7005, TS2339 — unchanged, zero runtime-fatal.
`index.ts` CRLF-pure, 0 bare LF.

Token-budget incident conditions (founder §7): request-budget contract GREEN, fresh-channel 413 witness
GREEN on both halves, trimming semantics GREEN — **but the incident is NOT resolved**, because none of the
three is a live request and that is precisely the rule the incident produced.

## OPEN WORK, BY PRIORITY

**P1** — verifier #66's verdict on the new candidate.
**P1 (new, from the provider audit)** — `EMBEDDING_DEGRADATION_MUST_NOT_BE_SILENT`: OpenAI embeddings have
failed silently in production since 2026-08-24 ~16:00; 63 of 66 memories carry a NULL embedding and nothing
anywhere surfaces it. Also `PROVIDER_FAILURE_MUST_BE_OBSERVABLE` and `REQUESTED_MODEL_ALWAYS_RECORDED` —
a failed provider turn records no model name and emits no audit event. See
`qa/AI_LLM_PROVIDER_RELIABILITY_2026-09-08.md`.
**P2** — 23 registered duplicated-concept pairs (ledger #141), the largest a seven-list family describing
"words that claim something was done"; convergence is the first item of the next source window.
V61-D5: `compactionCheckpoint.summary` is untrimmable unbounded narrative.
**P3** — one bare CR in `index.ts` (~offset 554,776, harmless, awaiting a source window);
`sem_ai_command_confirmation_truth.mjs` re-implements product logic and has a drift guard rather than a real
fix; model-specific token limits still UNMEASURED; the platform request-body limit named but unmeasured.

**Registered deliberate gaps** (not part of any deployment claim): lifecycle controls on child surfaces
beyond People; archive-instead-of-delete for projects, departments, documents, leads and approvals.

## THE #65 CLOSURE (this round's work)

**V65-D1 / V65-D2 (P1).** The request-frame concept is ASYMMETRIC and one flat string could not say so:
the intent tier needs "should we" so the receipt arms, and the executor must not have it or a deliberative
question archives a company. Now ONE definition in three declared groups — `REQUEST_FRAME_ADDRESSED`,
`REQUEST_FRAME_ALTERNATION` (directive), `REQUEST_FRAME_DELIBERATIVE` — with the intent tier formed as the
union in one place, so **EXECUTOR ⊆ INTENT holds by construction**. Ledger #142.
**V65-D3c / D3d.** The question gate's private whitelist and the read-lead list were the fourth and fifth
re-spellings of the vocabulary; both now derive from the one definition.
**V65-D3a / D3b.** The byte-identical twins are ONE body with the second name a reference to it. Deleting
the names outright was tried and reverted: twelve suites and the shared belt extractor slice their windows
using `const LEGACY_PAST_COMPLETION =` as a MARKER, so removal silently changes what each measures.
**V65-D4.** Ledger #143 — four sweeps brought under the safety contract; two of them had been throwing on
stale anchors and measuring nothing while still being cited as evidence.

**Evidence on the frozen candidate `52d9582` / `e3134bc5…`:** battery **72 green / 2 red by design**
(74 suites); `v65_request_frame_tiers_contract` **104/0**; v57 proof 4/4; v58 proof 6/6; v56 proof **7/8**
(the one survivor is measured CONSTRUCT REDUNDANT, not a test gap).
Clean extended vacuity sweep on these exact bytes: **141 killed, 28 SURVIVED, 0 did not apply, candidate
byte-identical, exit 1**. All **six structural survivors are now closed** by two new mutation-proved suites
(`provenance_survives_trim_contract` 10/0, `context_scoped_mutation_gates_contract` 11/0) — they included
straight reverts of the V62-D1 and V63-D2 P1 fixes, each of which had been deletable with the battery green.
The 22 remaining survivors are regex-level and registered (ledger #145).
`index.ts` CRLF-pure, 0 bare LF, 1 pre-existing bare CR (unchanged P3 debt).
**`deno check` BLOCKER LIFTED and the classes ARE re-derived this round.** No binary was installed on the
machine — `npx --yes deno@latest check --no-lock` fetches one on demand (deno 2.9.6), which is the route to
use in future rounds. Result on the frozen candidate, matching the recorded baseline exactly:
**10x TS7006, 6x TS2322, 1x TS7034, 1x TS7005, 1x TS2339 — and ZERO of the runtime-fatal classes**
(TS2448 / TS2454 / TS2304 / TS2552 / TS2551 all 0). 19 diagnostics total, unchanged in class and count.

## NEXT EXECUTABLE ACTION

Dispatch verifier #66 against the new committed SHA. On FAIL: reproduce → root cause → same-defect sweep →
structural fix → regression → mutation proof → full battery → new SHA → verifier #67, automatically.
On PASS: freeze the exact candidate, assemble the deployment package from
`qa/verification/DEPLOYMENT_PACKAGE_3d1baeaa_DRAFT.md`, and ask the founder once for
`ALLOW_FUNCTIONS_DEPLOY=1`.

## WORK-PC HANDOFF STATE

Branch `qa/home-pc-handoff` at `7abc5a4`, pushed. Six fix reports carry
`ready_for_retest: false` and status "FIX PREPARED — DEPLOYED 2026-09-08 THEN ROLLED BACK THE SAME HOUR".
The README warns that the CURRENT production build can also hard-stop: a saturated workspace estimates
17,038 tokens against its own 12,000 cap, and the founder's real workspace sits roughly 1,430 below it.
**Home PC must never mark a Work-PC bug CLOSED.**

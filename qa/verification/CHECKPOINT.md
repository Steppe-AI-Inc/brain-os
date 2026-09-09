# BRAIN OS — CANONICAL CHECKPOINT

Written 2026-09-08. A completely fresh session must be able to resume from this file alone.
Update it before every long wait. `qa/verification/CURRENT_CAMPAIGN.json` is the machine-readable twin.

## CAMPAIGN GOAL

Get the `sem-ai-command` Edge candidate through independent verification to a production deployment that
survives live acceptance, under the contract bar: **conformance to `governance/OPERATING_TRUTH_MODEL.md`,
never parity with the deployed build.** Then hand the six Work-PC defect classes to the Work PC for
independent live acceptance. The Work PC alone closes bugs.

## CURRENT MILESTONE

Campaign #128. **Verifier #68 returned FAILED** on candidate `223bd24` / index.ts sha256 `fc48aa70…`
(artifact `qa/verification/scratch/verifier68_output.log`, verifier commit `298d4da`). Two P1 blockers,
**one of them introduced by the #67 closure**. The #68 closure is COMPLETE; verifier #69 is the next gate.

Verifiers #60 through #68 all FAILED their candidates. **FOUR consecutive rounds found the same defect
class on a different AXIS:** #65 request FRAMES, #66 OBJECT and CLAUSE shapes, #67 ENTITY REFERENCE,
#68 CLAUSE COUNT crossed with the entity vocabulary. The battery was green every time, because every
corpus varies one axis and holds the others constant.

**The counter-measure is not more corpora.** #68 found its axis by asking: *which consumer of this concept
does not derive from its definition, and what request shape reaches it?* Exactly one consumer
(`STRONG_OBJECT`) and exactly one shape (multi-clause). That question is the standing method now.

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

**P1** — verifier #69's verdict on the new candidate.
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

## THE #68 CLOSURE (this round's work)

**V68-D1 (P1).** `STRONG_OBJECT` was the EIGHTH re-spelling of the entity vocabulary — 25 hand-written
nouns against the canonical ~80 — and only a MULTI-CLAUSE command reaches it, so #67's corpora never
executed it. 198 of 207 fabrications shipped; the control with a listed noun shipped 0 of 72.
**V68-D2 (P1) — INTRODUCED BY THE #67 CLOSURE.** Its "a referring token counts wherever it sits" was
implemented POSITION-FREE, so "Transfer pricing for the business unit" became a mutation request and the
receipt DELETED the truthful answer: truthful reads acquiring intent 2/40 -> 31/40, answers destroyed
1/8 -> 8/8. The #67 session reverted one member of this class and kept another with the same disease.
**Fix, in the verifier's own words:** the vocabulary went to the tier that needed a POSITION rule and the
position rule to the tier that needed the VOCABULARY. `STRONG_OBJECT` now derives from the one definition;
`IMPERATIVE_OBJECT` matches an entity noun in the HEAD REGION (head, or behind at most one modifier).
**V68-D4a/b (P2).** A purchase order was reported as a work order; the receipt said "persons".
**V68-D3 (P2, harness).** `concept_duplication_ratchet_contract` never learned `ENTITY_NOUN_ALTERNATION`
when #67 converged onto it, so an eighth spelling was undetectable. It now carries every canonical
definition - **registering the name is part of converging a concept, not a follow-up.** Ledger #149.

**Evidence on the new candidate** (index.ts sha256 `006a0c3f...`, 607,490 bytes): battery
**74 green / 2 red by design** (76 suites); `v68_clause_and_vocabulary_contract` **13/0** (all 7 defect
assertions pass); `v67` 23/0; `v66` 71/0; `mutation_sweep_safety_contract` **52/0**;
**`v68_mutation_proof` 4/4 killed**, candidate byte-identical after each.
**`deno check` re-derived**: 19 diagnostics, **zero** runtime-fatal. CRLF-pure, 1 pre-existing bare CR.

## NEXT EXECUTABLE ACTION

**Verifier #69 is RESUMED, not re-dispatched.** Attempt 1 (dispatched 2026-09-09T03:04:09+08:00) was killed by a
host Claude restart with a 0-byte output log. Its durable evidence (preflight A/B/C PASS, battery, identifier
delta, participle family, concept map, all at index.ts sha256 `006a0c3f…`) is committed on
`verify-0ca756e-campaign129` as `337f255`; attempt 2 runs under the watchdog with
`scratch/verifier69_prompt_resume.txt` against the SAME candidate `0ca756e` / `006a0c3f…` and reuses that
evidence. Report: `scratch/verifier69_output.log`; retry ownership: `scratch/watchdog-verifier69_output.state`.

Durable backup taken 2026-09-09 10:22 before the run (no push, no deploy):
`E:/My Drive/17.4. R&D CLAUDE CODE/backups/brain-os-20260909T102226-p1-0ca756e.bundle` (all refs, verified
complete) and `…-verification-scratch.tgz`. `p1/execution-truth-governance` is 55 commits ahead of origin
(`26c0f3e`); rounds #60-#69 live on this disk and in that bundle only.

On FAIL: reproduce → root cause → same-defect sweep → structural fix → regression → mutation proof → full
battery → new SHA → verifier #70 (campaign #130), automatically. On PASS: freeze the exact candidate, assemble
the deployment package from `qa/verification/DEPLOYMENT_PACKAGE_3d1baeaa_DRAFT.md` retargeted to these bytes,
and ask the founder once for a fresh `ALLOW_FUNCTIONS_DEPLOY=1` scoped to `006a0c3f…`. The deploy package must
name the silent-embeddings P1 (#144), which verifier #66 ruled correctly deferred **only because it stays named**.

## WORK-PC HANDOFF STATE

Branch `qa/home-pc-handoff` at `7abc5a4`, pushed. Six fix reports carry
`ready_for_retest: false` and status "FIX PREPARED — DEPLOYED 2026-09-08 THEN ROLLED BACK THE SAME HOUR".
The README warns that the CURRENT production build can also hard-stop: a saturated workspace estimates
17,038 tokens against its own 12,000 cap, and the founder's real workspace sits roughly 1,430 below it.
**Home PC must never mark a Work-PC bug CLOSED.**

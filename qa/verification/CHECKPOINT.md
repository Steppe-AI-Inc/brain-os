# BRAIN OS — CANONICAL CHECKPOINT

Written 2026-09-08. A completely fresh session must be able to resume from this file alone.
Update it before every long wait. `qa/verification/CURRENT_CAMPAIGN.json` is the machine-readable twin.

## CAMPAIGN GOAL

Get the `sem-ai-command` Edge candidate through independent verification to a production deployment that
survives live acceptance, under the contract bar: **conformance to `governance/OPERATING_TRUTH_MODEL.md`,
never parity with the deployed build.** Then hand the six Work-PC defect classes to the Work PC for
independent live acceptance. The Work PC alone closes bugs.

## CURRENT MILESTONE

Campaign #126. **Verifier #66 returned FAILED** on candidate `52d9582` / index.ts sha256 `e3134bc5…`
(artifact `qa/verification/scratch/verifier66_output.log`, verifier commit `e6fb007`). One P1 blocker
(V66-D6) plus five P2/P3. The #66 closure is COMPLETE; verifier #67 is the next gate.

Verifiers #60 through #66 all FAILED their candidates. Every round found real defects. #66's P1 is the
same CLASS as #65's, one axis over: #65 converged the request FRAMES, and #66 found that the OBJECT and
CLAUSE shapes were still spelled twice and had drifted. Every committed corpus varies the frame and holds
the object constant, so the invariant was being tested exactly where it was already true.

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

**P1** — verifier #67's verdict on the new candidate.
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

## THE #66 CLOSURE (this round's work)

**V66-D6 (P1).** The raw-command lifecycle fallback archived real rows while `requestedIntent` was null —
9,128 of 52,800 at the gate — because *"a mutation verb heading a clause with a real object"* was spelled
twice: the executor strips `business unit` and tolerates a quoted name, the intent tier's `STRONG_OBJECT`
did neither (its trailing `` cannot match after a closing quote). **Fixed structurally**: the intent tier
now consumes the executor's OUTCOME (`commandFallbackResolvedVerb`, one value carrying the fact and its
direction) instead of re-deriving its gate, so `EXECUTOR ⊆ INTENT` is inexpressible otherwise rather than
maintained by two rules. Adding `business unit` would have been the local patch the directive rules out.
**V66-D7.** `AUTHORIZED IS NOT COMPLETED` now covers all three deterministic modes.
**V66-D3.** Both vacuity sweeps exited 0 with survivors; the safety contract now requires the exit to be
gated on the survivor count and pins each floor's VALUE as a non-decreasing ratchet (both proved
non-vacuous by mutation).
**V66-D4.** The V65-D3c guard was a literal search; it is now a structural detector for any regex listing
three or more request frames outside the canonical groups — proved by re-introducing exactly that.
**V66-D5.** Model-authored `requestIntent.kind` pinned as an input-validation boundary.
**Asymmetry resolved:** first-person modal interrogatives are DELIBERATIVE whatever their number
(`can we`/`could we`/`shall we`/`shall i` moved); hortatives (`let's`, `we need to`) stay DIRECTIVE.
**Dead code removed:** the `alwaysCyrillicRaw` disjunct. Ledger #146.

**Evidence on the new candidate** (index.ts sha256 `916da4e2…`, 600,113 bytes): battery
**73 green / 2 red by design** (75 suites); `v66_object_shape_tiers_contract` **71/0** (all 13 of #66's
defect assertions pass, 0 CONTRACT failures); `v65_request_frame_tiers_contract` **105/0**;
`mutation_sweep_safety_contract` **42/0**; **`v66_mutation_proof` 5/5 mutants killed**, candidate
byte-identical after each — every piece of the fix is load-bearing, and the one piece that was NOT
(a redundant veto relaxation) was removed rather than registered.
Clean extended vacuity sweep on these exact bytes: **147 killed, 22 SURVIVED, 0 did not apply,
candidate byte-identical, exit 1** — down from 28, and **zero STRUCTURAL survivors remain** (all six,
including the V62-D1 and V63-D2 reverts, are killed by `provenance_survives_trim_contract` and
`context_scoped_mutation_gates_contract`). The 22 that remain are all regex-level and registered; #145's
rule applies to each — establish CONSTRUCT REDUNDANT vs TEST VACUOUS before writing a test for it.
**`deno check` re-derived** (via `npx --yes deno@latest`): 10x TS7006, 6x TS2322, 1x TS7034, 1x TS7005,
1x TS2339 = 19 diagnostics, **zero** TS2448/TS2454/TS2304/TS2552/TS2551 — unchanged from baseline.
`index.ts` CRLF-pure, 0 bare LF, 1 pre-existing bare CR (unchanged P3 debt).

## NEXT EXECUTABLE ACTION

Dispatch verifier #66 against the new committed SHA. On FAIL: reproduce → root cause → same-defect sweep →
structural fix → regression → mutation proof → full battery → new SHA → verifier #67, automatically.
On PASS: freeze the exact candidate, assemble the deployment package from
`qa/verification/DEPLOYMENT_PACKAGE_3d1baeaa_DRAFT.md`, and ask the founder once for
`ALLOW_FUNCTIONS_DEPLOY=1`. The deploy package must name the silent-embeddings P1 (#144), which verifier
#66 ruled correctly deferred **only because it stays named**.

## WORK-PC HANDOFF STATE

Branch `qa/home-pc-handoff` at `7abc5a4`, pushed. Six fix reports carry
`ready_for_retest: false` and status "FIX PREPARED — DEPLOYED 2026-09-08 THEN ROLLED BACK THE SAME HOUR".
The README warns that the CURRENT production build can also hard-stop: a saturated workspace estimates
17,038 tokens against its own 12,000 cap, and the founder's real workspace sits roughly 1,430 below it.
**Home PC must never mark a Work-PC bug CLOSED.**

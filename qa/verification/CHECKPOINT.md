# BRAIN OS — CANONICAL CHECKPOINT

Written 2026-09-08. A completely fresh session must be able to resume from this file alone.
Update it before every long wait. `qa/verification/CURRENT_CAMPAIGN.json` is the machine-readable twin.

## CAMPAIGN GOAL

Get the `sem-ai-command` Edge candidate through independent verification to a production deployment that
survives live acceptance, under the contract bar: **conformance to `governance/OPERATING_TRUTH_MODEL.md`,
never parity with the deployed build.** Then hand the six Work-PC defect classes to the Work PC for
independent live acceptance. The Work PC alone closes bugs.

## CURRENT MILESTONE

Campaign #130. **Verifier #70 is RUNNING** on candidate `31979e8be62ed3d7c2bae2f5fa1bc8edea9cdf7b`,
index.ts sha256 `e03ddceb3718e48cb9c4ec3260ad8062232e9a5416aee262ae0bc5d5e6bb7472`, dispatched
2026-09-09 on `--model opus`, worktree `/c/Users/Dell/dev/brain-os-verify-31979e8`, branch
`verify-31979e8-campaign130`, report at `qa/verification/scratch/verifier70_output.log`.

**Verifier #69 FAILED `0ca756e` and that closure is COMPLETE.** For the first time in five rounds both
directions of the defect class are green together: v69 13/13, v61 A1 (80 turns) 25/0, v67 23/0, codex
witnesses 32/0, concept ratchet 9/0, mutation proof 18/18.

**The #69 ruling, implemented:** the object boundary is what a phrase NAMES, not how far away the entity
noun sits. Three formulations were measured; the first two each closed one direction while opening the
other, and only an OLD suite (v61 A1) caught the second. A headline opens with nothing referring, carries a
prepositional phrase and names nothing ("status report for the board"); a request names something anywhere
("access for Bob", "work order WO-1").

**Two Codex findings were CONFIRMED and fixed in this candidate:**
* **A** — the only negation test was consumed at one site (the raw-command fallback), which also required
  `!modelEmittedArchive`, so on exactly the turns where the model emitted a lifecycle payload the founder's
  "do not" was never consulted. Now ONE gate strips every mutating field from the reply the moment it is
  parsed. A mixed turn still executes its un-negated half; the refusal is audited.
* **C** — the final persist discarded its own error, so a failed write still returned `done`. Persistence is
  now classified (EXECUTION_SUCCEEDED_AND_PERSISTED / EXECUTION_SUCCEEDED_PERSISTENCE_FAILED /
  READ_SUCCEEDED_AND_PERSISTED / READ_SUCCEEDED_PERSISTENCE_FAILED) with recovery information kept.

**B** REFUTED and pinned. **D** already satisfied and pinned. **E** CONFIRMED at source
(`person_assignments_write_manager` authorises on `operating_company_id` alone while the row carries four
org-bearing columns, and the RPC is SECURITY INVOKER) — fix PREPARED in `supabase/drafts/`, deliberately
outside the migration path, status **BLOCKED — PRODUCTION DB AUTHORIZATION**. No live probe was run:
proving it behaviourally means performing the cross-tenant write.

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

## WORK COMPLETED ALONGSIDE #69 (2026-09-09, none of it in any candidate)

The Edge candidate was frozen throughout: `index.ts` in `brain-os` is `006a0c3f…` before and after all of it.

**Harness, on `p1/execution-truth-governance` (ledger #150).** A model-scoped provider limit ("You've reached
your Fable limit. Switch to another model") matched no capacity pattern, so the watchdog logged
`BLOCKED — OTHER` and scheduled a retry of the same exhausted model. `classifyProviderOutput` learns the
shape; `isModelScopedCapacity()` separates *wait for the reset* from *rotate the model*; the watchdog now
takes a MODEL LIST, passes `--model` explicitly, rotates instead of sleeping, and stops with exit 6 when the
list is exhausted. 18/18 regressions. **#150b**, same entry: `kill <pid>` left the watchdog's sleeping child
alive and it dispatched a SECOND concurrent verifier into the same worktree 600 s later — stop a process
GROUP, and never edit a running shell script in place.

**Two P1s, on branch `wo/embedding-observability` (based on `0ca756e`).** A SEPARATE source window; merging
it produces a new SHA needing its own verifier round.
- `EMBEDDING_DEGRADATION_MUST_NOT_BE_SILENT` (ledger #144): outcome-returning embedding calls, the retrieval
  MODE recorded, degradations in `contextErrors` + audit metadata + the `done` payload. **7/24 -> 24/24**,
  mutation proof **14/14**.
- `PROVIDER_FAILURE_MUST_BE_OBSERVABLE` + `REQUESTED_MODEL_ALWAYS_RECORDED`: `classifyProviderFailure()`,
  the requested model recorded BEFORE the call from one helper with two callers, and a classified
  `ai_command_provider_call_failed` on every failure. **5/22 -> 22/22**, mutation proof **15/15**.
- Battery in that worktree: **81 suites, 3 problems — the identical set the frozen candidate produces**.
  `deno check` 19 diagnostics in the same classes, zero runtime-fatal. CRLF-pure.
- Two `stripTS` gaps closed (generic constructor type arguments; typed catch bindings) — without them the
  real embedding window could not be executed at all.

**Audits (no code change).** `qa/PROMPT_CACHE_AUDIT_2026-09-09.md`: the cache-hit rate is not low, there is
no cache — `cache_control` appears nowhere, the counters are never read, and `model_usage` has no columns to
store them; `SYSTEM_PROMPT` is ~18,824 tokens re-sent uncached every turn and is not counted by
`estimateTokens`. `docs/FOUNDER_ACTION_RUNBOOK.md`: the production-write boundary re-measured — **5 of 7
routes still red, every one of them a founder-only credential or account action**; the eleven factory-runner
scripts that inherit ambient authority are the one non-founder item and are deliberately not started
(`provider.mjs` is load-bearing for the running watchdog — the #150b hazard).

**Backups.** `E:/My Drive/17.4. R&D CLAUDE CODE/backups/` — `git bundle --all` (verified complete) at 10:22,
10:47 and 10:55, plus a verification tarball. `p1/execution-truth-governance` is ~59 commits ahead of
`origin` (`26c0f3e`); rounds #60-#69 and all of the above live on this disk and in those bundles only.

## OPEN WORK, BY PRIORITY

**P1** — verifier #69's verdict on the new candidate.
**P1 (from the provider audit) — FIX PREPARED AND MEASURED, LIVE OUTAGE STILL OPEN.**
`EMBEDDING_DEGRADATION_MUST_NOT_BE_SILENT`, `PROVIDER_FAILURE_MUST_BE_OBSERVABLE` and
`REQUESTED_MODEL_ALWAYS_RECORDED` all exist on `wo/embedding-observability` with contract suites and
mutation proofs (see the section above). What remains is **not implementable here**: the live cause needs
audit test T5 — one read-only `POST /v1/embeddings` with the **Edge** `OPENAI_API_KEY` — which is a
founder-only credential action, and 63 memories still carry no vector, so a backfill also waits on a working
key. See `qa/AI_LLM_PROVIDER_RELIABILITY_2026-09-08.md` and ledger #144.
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

Read verifier #70's report. On FAIL: reproduce -> root cause -> same-defect sweep -> structural fix ->
regression -> mutation proof -> full battery -> new SHA -> verifier #71, automatically. On PASS: freeze the
exact bytes, finish the deployment package, and ask the founder ONCE for a fresh `ALLOW_FUNCTIONS_DEPLOY=1`
scoped to `e03ddceb…`.

**Registered standing reds** (the battery is 82 suites / 4 problems, and all four are explained):
`_gate_extract.mjs` is a library that prints no totals; `production_write_authority` and
`factory_production_write_inventory` are red pending founder §1-§2 actions;
`person_assignment_scope_authorization` is red BY DESIGN pending the founder-only DB action for Codex E and
says so in its own header. None is a property of the Edge candidate.

**Two founder-only items are open and neither blocks this Edge round:** audit test T5 (one read-only
`POST /v1/embeddings` with the Edge key) for the silent-embeddings P1, and the Codex E migration.

## WORK-PC HANDOFF STATE

Branch `qa/home-pc-handoff` at `7abc5a4`, pushed. Six fix reports carry
`ready_for_retest: false` and status "FIX PREPARED — DEPLOYED 2026-09-08 THEN ROLLED BACK THE SAME HOUR".
The README warns that the CURRENT production build can also hard-stop: a saturated workspace estimates
17,038 tokens against its own 12,000 cap, and the founder's real workspace sits roughly 1,430 below it.
**Home PC must never mark a Work-PC bug CLOSED.**

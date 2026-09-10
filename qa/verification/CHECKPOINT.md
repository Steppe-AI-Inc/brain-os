# BRAIN OS — CANONICAL CHECKPOINT

Written 2026-09-08. A completely fresh session must be able to resume from this file alone.
Update it before every long wait. `qa/verification/CURRENT_CAMPAIGN.json` is the machine-readable twin.

## CAMPAIGN GOAL

Get the `sem-ai-command` Edge candidate through independent verification to a production deployment that
survives live acceptance, under the contract bar: **conformance to `governance/OPERATING_TRUTH_MODEL.md`,
never parity with the deployed build.** Then hand the six Work-PC defect classes to the Work PC for
independent live acceptance. The Work PC alone closes bugs.

## CURRENT MILESTONE

**Campaign #139 closed as FAILED. The candidate for verifier #80 is prepared and NOT yet dispatched.**

| | |
|---|---|
| implementation worktree | `C:/Users/Dell/dev/brain-os-wo-resolver` (branch `wo/clarification-resolver`) |
| candidate commit | `39ef2f76f53bfe4356dfc5cf2f1b706e65cb4bfc` |
| DEPLOY_FILE_SHA256 | `b3d5e7a49e17d912e0a70fa8bc036c76ce214b62ae2ebdbbb0a1aad967abe408` |
| DEPLOY_FILE_BYTE_LENGTH | 732356 |
| line endings | CRLF-pure: 0 bare LF, 0 bare CR, 0 0x08 |
| battery | 99 suites — 94 GREEN, 2 BLOCKED-FOUNDER, 3 OPEN DEFECT-THIS PC, 0 unclassified RED |

**THE MAIN REPO `C:/Users/Dell/dev/brain-os` IS NOT THE CANDIDATE.** Its `index.ts` is a different, older
file (630,533 bytes, `e03ddceb…`) on branch `p1/execution-truth-governance`. A verifier dispatch once froze
THAT file while printing the candidate's hash beside it; the dispatcher now verifies what it froze. When
resuming, take the candidate from the worktree above, never from this repo's working tree.

### The five rounds of 2026-09-09/10, and what each cost

Rounds #74-#79 all FAILED, and not one was a false alarm. The pattern that matters for whoever resumes:
**three of the five failures were in the instruments, not the product**, and two of those flattered the
session that built them.

* **#77** — the mutation proof was crediting always-red suites with catching every mutant.
* **#78** — the same proof was crediting a suite for PRINTING A SHA256 (its output differed for every
  mutant by construction), and behind that credit sat a real survivor the deploy gate reported GREEN.
  Also: the V77 Mongolian allowlist had turned the language's ORDINARY POLITE REQUEST from live into dead,
  72 of 108 mixed turns swallowed.
* **#79** — both P1s were in #78's closures, and both had the same cause: **a change measured against a
  corpus that could not exercise the mechanism it changed.** The read-shape veto's cost was measured at
  0 of 4 on rows that exercised only one of its three arms; the real figure was 11 of 20, worse than before
  the veto existed. `NON_EXISTENCE_CLAIM`'s false-positive controls were 17 assertions of PRESENCE, when
  the risk is a truthful assertion of ABSENCE — 3 of 5 truthful answers were being destroyed.

Both #79 P1s are CLOSED (ledger 166), each pinned as a mutation-proof mutant so neither can reopen
silently. Ledger 167 records the rule: **a control set must be derived from the mechanism, not from the
author's imagination.**

### V78-H7 is CLOSED — one dependency order, four consumers

Four hand-maintained lists carried their own copy of the shared-constant dependency order. Adding ONE
constant cost five registrations in a single session. Before converging them it was CHECKED (not assumed)
that all four express the same graph — and the first probe written to check that was WRONG and its numbers
discarded, because it hand-rolled a fifth declaration scanner that mis-parsed regex literals.

`sharedConstantsFor(names)` in `_gate_extract.mjs` is now the one authority: a consumer supplies an
unordered REQUEST, the resolver supplies order, transitive closure and deduplication.
`qa/scenarios-runner/shared_constant_order_contract.mjs` is the ratchet (12 rows), and four deliberate
order drifts are proved to break it.

### The instrument guards now in place

* an already-red suite is credited only if its output moved, with the source PATH **and DIGEST** erased
* a probe that CRASHES on the candidate side is a HARNESS FAILURE, not an ineffective mutant, and exits 1
* **the mutation proof's whole input is fingerprinted before and after**; a mid-run harness edit voids the
  run. Proved with a valid, harmless edit 2.5s into a run — the case a crash-based gate cannot see
* the release manifest forgives per ROW, never wholesale; a classification with no named rows is RED; a
  GREEN suite still carrying a classification is RED (stale claim)
* generated mutants are untracked, so `WORKING_TREE_CLEAN` means something
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

## HISTORY — completed in rounds #60-#65 (kept for provenance, not current state)

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

Six gates, recorded with an INPUT DIGEST so a stale one cannot be quoted as current
(`node qa/verification/gate_evidence.mjs` prints the table; `run --force` re-takes them):

| gate | what it establishes |
|---|---|
| `battery` | 99 suites, every failure classified; 0 unclassified RED |
| `mutation_proof` | 19 mutants, each proved EFFECTIVE before its survival is read; 0 surviving, 0 ineffective, 0 harness failures |
| `harness_rename_probe` | no suite asserts a product property by naming a local identifier |
| `founder_acceptance_corpus` | the founder's own turns, replayed |
| `tdz_triage` | 0 eager forward references; nothing runtime-fatal |
| `backup_restore` | the newest bundle RESTORES, and the restored deploy bytes hash to the candidate |

**A gate goes STALE the moment any declared input changes**, which is the point: editing a battery suite
invalidates the battery and the mutation proof, and they say so rather than reporting yesterday's number.
Re-derive before quoting any of them.

`harness_rename_probe` was deliberately left FAILING at one point this campaign, naming exactly one suite
(`v78_regression_additions`, whose V78-C5 row lifts a window by six local identifiers). If it is red, read
the named suite before assuming a regression.

Token-budget incident conditions (founder §7): request-budget contract GREEN, fresh-channel 413 witness
GREEN on both halves, trimming semantics GREEN — **but the incident is NOT resolved**, because none of the
three is a live request and that is precisely the rule the incident produced.
## HISTORY — work alongside #69, 2026-09-09 (superseded by rounds #74-#79)

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

## HISTORY — the #68 closure (NOT this round; see CURRENT MILESTONE)

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

**Dispatch verifier #80** on the candidate named above. Nothing about it needs founder input.

```
cd C:/Users/Dell/dev/brain-os
bash scripts/factory-runner/dispatch-isolated-verifier.sh <candidate-commit> 140 80 \
    qa/verification/scratch/verifier80_prompt_template.txt
```

Build the #80 template from `verifier79_prompt_template.txt`. Derive the round, campaign and ledger number
from the repository — the header says so, and the dispatcher now REFUSES a prompt containing any
unsubstituted `__PLACEHOLDER__`.

Then act on the verdict automatically: FAIL → reproduce only genuinely new findings → root cause →
same-defect sweep → structural fix → regression → mutation proof → affected gates → global battery → new
SHA → backup → dispatch #81. PASS → inspect the real artifact, confirm it tested the exact frozen bytes,
classify every observation, confirm no unresolved candidate P0/P1, then the release package.

**Do NOT re-run a completed scenario** when its evidence is persisted, its provenance is valid, the
candidate SHA is unchanged, and the new change cannot affect it.

### Standing rules that have each cost a round

* **Never edit a harness file while a gate is running.** Every gate spawns one process per probe and
  re-reads the harness each time; it has no snapshot. The mutation proof now detects this, but the rule is
  cheaper than the detection.
* **Validate an instrument before believing it**, especially when it disagrees with the code.
* **A backslash typed through the tool transport is halved.** Build one with `String.fromCharCode(92)`, or
  write a pattern that needs none. `\b` inside a single-quoted string is a BACKSPACE, and a literal 0x08
  has reached these files three times.
* **Deploy identity comes from the deploy BYTES**, never from `git show` — the blob is LF, the surface is
  CRLF, and the two hashes must differ.
## WORK-PC HANDOFF STATE

Branch `qa/home-pc-handoff` at `7abc5a4`, pushed. Six fix reports carry
`ready_for_retest: false` and status "FIX PREPARED — DEPLOYED 2026-09-08 THEN ROLLED BACK THE SAME HOUR".
The README warns that the CURRENT production build can also hard-stop: a saturated workspace estimates
17,038 tokens against its own 12,000 cap, and the founder's real workspace sits roughly 1,430 below it.
**Home PC must never mark a Work-PC bug CLOSED.**

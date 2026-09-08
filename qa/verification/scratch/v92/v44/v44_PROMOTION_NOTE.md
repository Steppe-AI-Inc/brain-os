# v44 PROMOTION NOTE — campaign #104, verifier #44

**VERDICT: FAIL.** Candidate `3f6e05cfb751aeaac5796defd10c37ea24075bf8`
(`supabase/functions/sem-ai-command/index.ts` sha256
`3e56dbd163bbfc89ae1a9107763dee2eea684dabedfa7301fcb40d21bc2ca717`) is **not fit to deploy over
deployed v92**. Production stays on v92 (`c9dfab5bd433`, sha256 `795c20c82301aba1…`).
**Do not ask `ALLOW_FUNCTIONS_DEPLOY=1`.**

## Why, in one line each

| id | class | direction | size on my corpus |
|---|---|---|---|
| V44-D1 | `Now`/`Currently` + gerund product help | **truth destroyed** | 352 / 352 |
| V44-D2 | `working on <gerund>` with any subject | **truth destroyed** | 66 / 66 |
| V44-D3 | `let me <verb>` deferred offer | truth destroyed | 39 / 39 |
| V44-D4 | `(is\|are) (being\|getting) <participle>` as a state | truth destroyed | 27 / 27 |
| V44-D5 | coordinated negator-initial NAME | **fabrication shipped** | 13 / 15 names |
| V44-D6 | mid-clause negator-initial NAME/title | **fabrication shipped** | 6 rows |
| V44-D7 | 3 belt suites cannot reach the newest arm; run28's never-throws fuzz is alphabet-blind | suite integrity | 3 of 13 suites |

D1 and D2 are the class ledger #39 called the campaign's worst, recurring. All three guards that
#39/#40 installed are anchored `^\s*<gerund>`; a single leading adverbial walks past all of them.

D5 refutes `v92_open_regression_contract`'s `D-V92-R1 … closed (0 of 7 ship)` — the closure is
measured on seven **simple-subject** rows and does not hold for the class.

## Reproduce in one command each

```bash
node qa/verification/proposed/v44_regression_additions.mjs
#   candidate      : 67 passed, 51 failed
node qa/verification/scratch/v44/probe_eip_scale.mjs
#   484 generated truthful product-help rows, 484 truth regressions vs deployed v92
node qa/verification/scratch/v44/v44_measure.mjs
#   3952 rows, four quadrants per half: truth regression 35, fabrication regression 19
```

## The prepared fix (NOT applied; index.ts was never touched)

```bash
node qa/verification/scratch/v44/v44_build_fix.mjs      # -> qa/verification/scratch/v44/fix44.ts
SEM_INDEX_SRC=$PWD/qa/verification/scratch/v44/fix44.ts node qa/verification/proposed/v44_regression_additions.mjs
#   108 passed, 10 failed   (was 67 / 51)
```

Five edits, all inside the belt block:

1. `V44-F1a` guard 1: `^\s*(?:assigning|…)` → `^\s*(?:(?:now|currently|just|also|then)[,]?\s+)?(?:assigning|…)`
2. `V44-F1b` guard 2: same optional adverbial, case-doubled form.
3. `V44-F2` `'|working on (?:' + PROGRESS_VERBS + ')'` → bound to `^` or a first-person subject.
4. `V44-F3` `'|(?:is|are) (?:being|getting) …'` → prefixed `(?<!\b(?:that|which|who)\s)`.
5. `V44-F4` `subjectRun`: allow `and|&|of|the|for|de|von|van` inside the capitalised run.
6. `V44-F5` `detName`: allow a determiner + up to two lowercase nouns before the capitalised negator.

**Effect measured, not asserted:** truth regression 35 → 0, fabrication regression 19 → 6, generated
product-help 484 → 48. **Every existing gate holds at its exact current number** and three extra
fabrications are newly caught. No declaration is added to the belt block, so the run15–run19
named-const extractors and `v92_open_regression_contract` CONTRACT 5 are unaffected (I re-ran all of
them against `fix44.ts`).

Remaining after the fix: 3 × `let me` deferred offer (a product decision), 1 × generic habitual
passive, 4 × `Pending review of the Q3 ledger` mid-clause, 2 × the D7 suite-integrity items.

## The one-line D7 fix (in `qa/`, not in index.ts)

Add to `run18_defect_closure_contract.mjs`, `run28_defect_closure_contract.mjs` and
`v92_open_regression_contract.mjs`, above the extractor — the identical line run13–run19 already
carry:

```js
globalThis.knownEntityNames = globalThis.knownEntityNames || new Set();
```

I verified by differential that this changes **no** suite's output today (all 36 suites run with and
without the global preloaded; zero differ). It is purely the removal of a latent crash and a real
coverage hole. Separately, widen run28's fuzz alphabet, or add `'Confirmed — Archived ACME
Holdings.'` to its seed set, so `"predicate never throws"` can reach the one shape that throws.

## Gate state I measured myself (all as expected — nothing unexpected is red)

battery **36 files / 0 failing** (one process per file, exit status read per process; 31 asserting +
5 SUPERSEDED prose-era stubs; 1,192 assertion lines) · v43 40/0 · v42 12/1 · v41 22/0 · v40 77/0 ·
v39 21/0 · v38 29/0 · v37 21/0 · v36 61/0 · v35 55/0 · v34 57/0 · v33 93/0 · v32 101/0 ·
v31 33/1 · v30 25/1 · v92_parity 46/0 · v92_open_regression 28/0 · matcher differential 32/32, 0
regressions.

**The green battery is the finding, not the reassurance.** Every gate above is green on the same
candidate that destroys 484 of 484 generated truthful product-help sentences.

## Not measured — coverage gaps, stated rather than skipped

* `deno check` — **BLOCKED**. No `deno` binary on PATH; `npx deno@2 check` is refused by this
  session's command classifier. The 23-error baseline is unverified by me.
* Live `supabase functions download` / `list` — **BLOCKED** by the same classifier. Provenance is
  inherited from ledger #108. My own link is git → the three committed reference copies, byte-direct
  and confirmed identical (`795c20c82301aba1…`, 321,370 bytes).
* No browser, no live Edge invocation, no database access. Source differential only.

## Deploy-surface note (P3, worth fixing before the next sha is pinned)

The candidate's git blob is **100% CRLF**; deployed v92's is **100% LF**, and `.gitattributes` has no
rule for this path. The raw byte diff is therefore every line, and the post-deploy check
(`scripts/factory-runner/verify-deployed-bytes.sh`) would pass only via its LF-normalisation
fallback. No functional risk was found — there is no `new RegExp(\`…\`)` and no `split('\n')` in the
file — but the pinned sha256 becomes machine-dependent under `core.autocrlf`, which is exactly the
fragility this repo already added `.gitattributes` entries to fix for two other paths. Suggested:
`supabase/functions/sem-ai-command/index.ts eol=lf`.

## Scoping note the deploy conversation needs

v92's gate carries `&& !result.pendingAction`; the candidate's `legacyProseFallback` does not
(run8/D59, deliberately). Every truth regression above therefore also applies on clarification,
disambiguation and bulk-confirmation turns, where v92 never runs the gate at all. The suite named for
this exact class — `d3_past_completion_gate_not_shortcircuited_by_pending_action.mjs` — is a
SUPERSEDED stub that asserts nothing.

---

**index.ts sha256 at the end of this run: `3e56dbd163bbfc89ae1a9107763dee2eea684dabedfa7301fcb40d21bc2ca717` — byte-identical to the start.**

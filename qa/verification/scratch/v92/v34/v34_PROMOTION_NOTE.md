# v34 PROMOTION NOTE — verifier #34, campaign #94 (v92 differential, fifth round)

**Verdict on candidate `567cbd2c19a317d26f6eaa62681cc1400c314af4` / index.ts sha256
`85e59eac0b34fd25aed5eb4e8f02a0265c458b4fcc232fd1b175bc7ae15a9847`: FAIL — NOT DEPLOYMENT READY.**
Production stays v92 (`c9dfab5bd433`, sha256 `795c20c8…`). Nothing was deployed, pushed to the
database, or written to the implementation branch. The candidate's index.ts is byte-identical to the
required sha before, during and after this run.

## What to promote

| File | What it is | Where it should live |
|---|---|---|
| `qa/verification/proposed/v34_regression_additions.mjs` | The gate this verifier measured. 48/10 RED on the candidate; CONTRACT items non-vacuous (fail on the nameInternal-off and auxGap-off mutants); 57/1 on the prepared fix (the one remaining item is D198, a suite-integrity defect). Self-locating; `SEM_INDEX_SRC` honoured. | `qa/scenarios-runner/` as a battery member once the classes are closed (keep the DEFECT items; they go green with the fix). |
| `qa/verification/proposed/v34_known_failure_modes_entry_95.md` | The ledger entry (`## #95-V`). | Append to `qa/KNOWN_FAILURE_MODES.md`. |
| `qa/verification/scratch/v34/v34_corpus.mjs` + `v34_differential.mjs` + `v34_families.mjs` | This verifier's own corpus (673 truthful / 484 fabrications) and generated families (~1,900 shapes), with the candidate-vs-v92 differential runner. | Fold the rows into `v92_parity_corpus.json` — every row here is absent from it. |
| `qa/verification/scratch/v34/v34_mutation.mjs` | 12-way mutation test of every run30–run33 fix, which ALSO runs the committed generative suite against each mutant. | Keep as the model for future mutation proofs: it measures suite sensitivity, not only load-bearing-ness. |
| `qa/verification/scratch/v34/build_fix37.mjs` → `fix37/index.ts` (and `build_fix37b.mjs`) | PREPARED FIX on a scratch copy, NOT applied. Closes D189–D197 with 0 truth gate regressions on this corpus. | The implementing session's decision. See "Prepared fix" below. |
| `qa/verification/scratch/v34/v34_battery.mjs` | Battery runner that spawns each suite and records the REAL exit status. | Use instead of any shell pipeline for battery counts. |

## How to reproduce (from any cwd)

```
node qa/verification/proposed/v34_regression_additions.mjs                       # RED on the candidate
SEM_INDEX_SRC=qa/verification/scratch/v34/fix37/index.ts node qa/verification/proposed/v34_regression_additions.mjs   # 57/1
node qa/verification/scratch/v34/v34_differential.mjs                            # candidate vs v92 on the corpus
node qa/verification/scratch/v34/v34_differential.mjs qa/verification/scratch/v34/fix37/index.ts fix37
node qa/verification/scratch/v34/v34_families.mjs                                # generated families (+ CONTRACT 5 injection)
node qa/verification/scratch/v34/v34_mutation.mjs                                # 12 mutants + suite sensitivity
node qa/verification/scratch/v34/v34_battery.mjs candidate                       # 34 executed / 0 failures
node qa/verification/scratch/v34/v34_matcher.mjs                                 # 34 shapes, 0 regressions
```
`v34_lib.mjs` reads deployed v92 from `qa/verification/scratch/v34/prod/index.c9dfab5b.ts`, produced by
`git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts` (sha256 `795c20c8…`).

## Prepared fix (scratch only — NOT applied, NOT deployed)

`fix37/index.ts` (sha256 `249f4380…`) changes six things, each anchored exactly once:
1. R-AUXGAP guard: the left context is the text since the last SENTENCE boundary (`. ; ! ? \n`, `: `)
   capped at 160 chars, not a fixed 28-char window (closes D189 and D191); the bare modals leave the
   guard lexicon and become a lookbehind on the auxiliary itself, which is v92's own semantics (closes
   D190 while keeping every D183 hedged decline).
2. The run32/D176 status guard no longer treats `is not <participle>` as a completion (closes D193).
3. `EXECUTION_IN_PROGRESS`'s `(was|were) <participle>` arm is aligned to LEGACY's participle list
   (closes D192). **This trips run28's `D165.control.was` pin ("Delta Ltd was activated." must fire) —
   a candidate-era pin, not a v92 behaviour; re-pin it to a v92-list participle or choose variant B.**
   Variant B (`fix37b`) keeps the list and instead requires a name run after a negator to carry at
   least TWO Title-Case tokens. Measured and REJECTED: T3 stays 40/96 destroyed ("No Work Order was
   closed."), and single-token negator names re-open ("Nowhere Bakery was archived." fails verifier
   #32's pin; run18's D131.disclosedResidual.nowClosed fails). Battery 34/1 on it.
4. `quotedHead`: any negator that opens a quoted span heads a title (closes D194; generalises D186).
5. `adjective` / `fewQuant`: pending/awaiting after a determiner, and "a/the/quite a few", are not
   negators (closes D195, D196).
6. `detName`: a determiner + Title-Case negator + Title-Case token, or negator + ’s + Title-Case
   token, is inside a name (closes D197 except "The Do Not Disturb policy", where a word intervenes).

Measured on the scratch copy: v34 differential TRUTH 0 gate regressions / FAB 6 (the disclosed
pair, four synthetic three-word subjects, one mid-name shape); all families closed except F6 3/18;
battery 34/1 (run28 pin above); verifier #33's gate 92/1 (the disclosed shape); #32's 101/0;
generative 8/0; `v92_open_regression_contract` 28/0; `v92_parity_contract` 46/0. deno check was
BLOCKED in this session (not runnable) — the belt block is syntax-checked by `new Function` only.

## Provenance of the production bytes

`npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk` (read-only, this session):
sem-ai-command version 92, `ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`,
updated_at 1788239725518 = 2026-09-01T05:15:25.518Z, ACTIVE, entrypoint
`file:///home/runner/work/brain-os/brain-os/supabase/functions/sem-ai-command/index.ts`.
`gh run view 33472871764`: "Deploy Supabase Edge Functions", headSha `c9dfab5bd433…`, push to master,
created 05:15:04Z, completed 05:15:30Z, success; `gh run list` shows NO later run of that workflow.
`supabase functions download` was BLOCKED (requires an approval this session cannot grant), so the link
is **integration-level** (CI record + timestamps + the committed copy `index.v92.ts`, whose LF-normalised
sha256 equals git `c9dfab5b`), not byte-direct from production. The PCCP literal is byte-identical in the
candidate (pinned sha `54b678ad…`), so every measurement in this campaign is against the literal
production gate regardless.

## Artifact branch
`verify-567cbd2-campaign94`. No write to the implementation branch.

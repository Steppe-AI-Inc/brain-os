# v27 PROMOTION NOTE — verifier #27, campaign #87

Candidate `a9bf5189e071ae9b00ee2bddade2b0f9588e0f1d`, index.ts sha256
`70161e8de8d221824d02c5ae27ae87e1169a7a111770ea5482992860c2ba5344`.
**Verdict: FAIL.** Production is untouched and stays at `sem-ai-command` v92.

## What to do with these artefacts

| artefact | where it goes | when |
|---|---|---|
| `v27_known_failure_modes_entry_87.md` | append verbatim to `qa/KNOWN_FAILURE_MODES.md` as `## #87` | in the bookkeeping commit that opens campaign #88 |
| `v27_regression_additions.mjs` | promote to `qa/scenarios-runner/run27_defect_closure_contract.mjs` | in the commit that lands FIX-H + FIX-I |
| `run26_defect_closure_contract.mjs` | **retire** (its D162a/D162b DEFECT pins are closed; its `fixEModalHedgeGuardPresent` byte pin blocks the fix) | same commit |

`v27_regression_additions.mjs` resolves index.ts via `SEM_INDEX_SRC`, then
`../../../supabase/functions/sem-ai-command/index.ts` (its home in `qa/verification/proposed/`),
then `../../supabase/...` (after promotion into `qa/scenarios-runner/`). ANY failure exits
nonzero. It imports nothing from `qa/scenarios-runner` and nothing from any `v26_*` artefact.

## Expected results

| build | `v27_regression_additions.mjs` | battery |
|---|---|---|
| candidate `a9bf518` as shipped | **146 pass / 15 fail** — 15 `[DEFECT]` (10 D163 + 5 D164), 0 `[RESIDUAL]` moves, 0 `[CONTRACT]` failures | 31 executable `.mjs` + 1 helper, 0 non-zero exits, 0 FAIL lines |
| + FIX-H + FIX-I | **159 pass / 2 fail** — the 2 are the `D164.preexistingPlainName` `[RESIDUAL]` pins moving in the GOOD direction | green except `run26`'s `fixEModalHedgeGuardPresent` |

## Three things the promoting commit MUST do, not just the two code lines

1. **Apply FIX-H and FIX-I** (both one line, both in `readsAsCompletion`/`completionIsNegated`; the
   exact before/after text is in the `## #87` entry). Measured, zero collateral on my corpora.
2. **Restate `run26`'s `fixEModalHedgeGuardPresent` as a PROPERTY, not bytes** — or retire run26
   in favour of run27. As written it pins `(?:[a-z]+\s+){0,2}?`, the exact construct FIX-H has to
   change, so a correct fix fails its own contract. Its sibling
   `evidentialTestRunsOnTheLastLinkerDelimitedSegment` was written as a property for precisely
   this reason after verifier #26 asked for it; the guard pin was left as bytes.
3. **Re-pin the two `D164.preexistingPlainName` `[RESIDUAL]` assertions as `[CONTRACT]`** once
   FIX-I lands — FIX-I closes the pre-existing linker-free half too, so leaving them pinned at
   "missed" would make the suite fail on a strictly better build.

## Bookkeeping corrections required of the next closure postscript

1. **The axis claim must be reconcilable with its own Evidence line.** Correction 1 says
   *"fabrications-missed 0 vs 0 (equal)"*; the Evidence line eight lines below says
   *"4/50 fabrications missed"*. State, in the same sentence as every collateral figure: the SHA
   compared against, the corpus size, the direction, **and the shape the new change put at risk**.
   Sixth consecutive campaign on this claim shape; first where the postscript contradicts itself.
2. **Do not report a guard as "anchored" when an alternative was deleted from it.** D162a's stated
   root cause was that the guard never checks that the modal governs the completion verb. FIX-G
   removed the copular reach (real, 12/12) and left the guard unanchored — D163.
3. **Add the OPEN end of every bounded window to the corpus.** `run26`'s D161 fabrication block is
   six cases, all two-token names with `was`; the window probe is the 3-word closed end. It cannot
   fail. Add `I can confirm ACME has been archived.` (one-token name, perfect passive).
4. **Replace ledger #86's question-belt figure (7,995 bytes / `394e7666d501f8f1`)** with the slice
   boundaries it was measured on. Under mine (`const safeQuestionFragment =` .. the first 8-space
   `};`) it is 8,110 bytes / `1c5cafa9673855f8`, identical at `4476c92`, `415fed3` and here. The
   invariant holds; the number does not travel between verifiers.
5. **Add D165 to DOCUMENTED RESIDUALS** — the run11/D87 "one shared verb list, every arm" rule was
   never applied to the perfect-passive arm. Not a regression; undisclosed.
6. **Corrections 3, 4, 5 and 6 from run26 landed and are re-verified** (D158d in the residual list;
   run26 header at this sha with 0 hits for the prior sha and for "MISSED here"; battery stated as
   31 executable + helper, which matches my count exactly; the variable-length-lookbehind
   retraction with a detector that actually works and is pinned TRUE). Say so; they were the first
   clean bookkeeping pass in four campaigns and that is worth not losing.

## Standing rules this campaign adds

- **(c)** When a guard is defended by a bounded window (`{0,n}`), the regression corpus must
  contain the shape at **both** ends of that window, built from the **shortest plausible entity
  name**. A pin at the closed end proves nothing about the open end. (D163: a one-token company
  name is exactly 2 intervening tokens.)
- **(d)** Widening a **rescue** disjunct widens it for every sentence that matches its SHAPE,
  including the ones that should not be rescued. A change that makes a disarm-condition easier to
  satisfy must be measured on that disarm-condition's own **false-positive** corpus, not only on
  the cases it was written to save. (D164: FIX-F's name guard is right, and it rescued a
  fabrication along with the truthful negative.)

## Coverage gaps on my side (stated, not hidden)

- **`deno check`: BLOCKED.** No `deno` on PATH, no `npx deno@2`, no `tsc` reachable from this
  session. The postscript's "23 == baseline" is NOT re-derived by me. Fourth campaign running.
  Partly discharged from the other side: both changed regex literals construct and execute under
  V8 here, no modifier group is shipped, and the runtime property the `?? ''` stands for is proven
  by 20,000 fuzzed strings with 0 throws.
- **No live Edge Function invocation, no browser, no AI-chat check.** Nothing is deployed
  (production is v92, none of D58–D165 is live), so there is no live surface for these predicates
  to be exercised on. This is a static+unit campaign by construction, and every result above is
  `UNIT VERIFIED` against the real shipped source, not `LIVE VERIFIED`.
- **No production writes.** Only `supabase functions list` (read-only) was run. No
  `db push`, no `functions deploy`, no `QA-VERIFY-*` rows created — this campaign's surface is a
  pure text predicate, so no synthetic data was needed and none was left behind.

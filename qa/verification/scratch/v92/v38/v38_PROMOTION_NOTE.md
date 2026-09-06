# v38 PROMOTION NOTE — campaign #98, verifier #38

**VERDICT: FAIL — candidate `72e4d45e6a2469b1851e31cbf4084e09f78b53df` is NOT fit to deploy over v92.**
**EDGE STATUS = NOT DEPLOYMENT READY.**

## What to promote from this run

| Artifact | Path | Promote to |
|---|---|---|
| Regression additions (29 checks, RED on the candidate) | `qa/verification/proposed/v38_regression_additions.mjs` | `qa/scenarios-runner/v38_defect_closure_contract.mjs` |
| Ledger entry | `qa/verification/proposed/v38_known_failure_modes_entry_99.md` | `qa/KNOWN_FAILURE_MODES.md` as `#99` |
| Prepared fix | `qa/verification/proposed/v38_prepared_fix.patch` | `supabase/functions/sem-ai-command/index.ts` (see caveat) |
| Fix builder + self-checks | `qa/verification/scratch/v38/build_fix.mjs` | keep in scratch |

## The one blocking defect

**V38-D2** — F2b's length-preserving parenthetical blank (adopted verbatim at 72e4d45 from
verifier #37) pushes the auxiliary→participle distance past v92's `[^.]{0,30}` window. Completion
claims carrying a parenthetical are now **SHIPPED** where deployed v92 **CORRECTS** them.

- 72 such fabrications on a 2,400-string sweep; **200/200** on the generated contract.
- **0** truthful-negative-shaped strings are affected in either direction.
- The previous candidate `395c438` caught 5 of 7 spot-checked shapes — **this commit made it worse**.

Do **not** fix it by reverting F2b. F2b is load-bearing: I reproduced #37's justification shape
(`"No problem the team flagged was (after the long review that found nothing wrong at all)
archived."`), which v92 preserves, the candidate preserves, and an F2b revert **destroys**.

## The prepared fix, and its cost

`V38-FIX-1` adds a **sentence-local v92 parity backstop** to `readsAsCompletion`. It is a
structural invariant rather than another lexical rule: it fires *only* where deployed v92 already
fires, so it cannot create a truth regression vs v92 by construction. It is deliberately
sentence-local so it is not the whole-summary negation test that v32/v34/v36 correctly forbid.

Validation (all re-measured by me, exit status read from the child process, never a pipeline):

| Gate | Candidate | With V38-FIX-1 |
|---|---|---|
| battery (`qa/scenarios-runner/*.mjs`) | 35/35 exit 0 | **35/35 exit 0** |
| v32 / v34 / v35 / v36 / v37 | 101/0, 58/0, 56/0, 62/0, 21/0 | **identical** |
| v33 / v30 / v31 (known-red) | 92/1, 25/1, 33/1 | **identical** |
| v38 regression additions | 28/1 (RED on V38-D2) | **29/0** |
| V38-C1 generated property | 200/200 shipped | **0/200** |

**Caveat that must be read before merging:** the fix leaves **107 characters** of headroom under
run14/D107's 4000-character slicing window. Verifier #32 was already burned at 102 chars. Either
widen that window in the same change, or restructure the belt so `readsAsCompletion` is no longer
one giant statement that suites must slice.

## Corrections to the session's claims — please update the ledger

1. **"All of #30 and #31 closed except three disclosed residuals" is not accurate.**
   - The **three refused shapes are actually CAUGHT** by this build. The disclosure is stale.
   - **V31-F3b is still open** (`NEGATED_CLAUSE` omits couldn't/wouldn't/shouldn't/won't). It is a
     real quality gap but **0 truth regressions vs v92** — record it as "open, not a v92 regression".
2. **`"No North Depot was archived."` is destroyed by v92 as well**, so it is not a deployability
   regression; the session's reasoning about it is sound.
3. **`v92_parity_contract`'s 46/0 is not evidence of v92 parity.** Its corpus contains 911 strings
   with only 7 parentheticals and none in the aux→participle position. Green here means "the
   property was never generated", not "the regression is absent".

## Hygiene item worth one line of cleanup

**V38-H1** — this commit flipped the entire deployed file from LF to **CRLF** and left one bare CR
inside a `//` comment (line 5719). Runtime-inert (verified), but the raw deploy diff becomes a
5989/4312 whole-file rewrite that hides the real 1730/53 delta. Normalise before deploying so the
next reviewer can actually see what changed.

## Re-verification recipe

```
node qa/verification/proposed/v38_regression_additions.mjs          # RED on candidate (28/1)
node qa/verification/scratch/v38/build_fix.mjs                      # writes index.fixed2.ts
SEM_INDEX_SRC=qa/verification/scratch/v38/index.fixed2.ts \
  node qa/verification/proposed/v38_regression_additions.mjs        # 29/0
node qa/verification/scratch/v38/differential.mjs                   # 4-quadrant vs deployed v92
node qa/verification/scratch/v38/mutation.mjs                       # 8-mutation impact scan
node qa/verification/scratch/v38/probe_f2b_sweep.mjs                # the 144-verdict F2b sweep
```

## Deployment call

**Do not deploy 72e4d45.** Apply V38-FIX-1 (resolving the run14 headroom), re-run the battery plus
`v38_regression_additions.mjs`, and re-gate. Deployed v92 remains the safe serving version;
rollback target `c9dfab5bd433` is exact and available.

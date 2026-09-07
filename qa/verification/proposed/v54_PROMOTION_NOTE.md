# v48 PROMOTION NOTE — verifier #54, campaign #114

**VERDICT: FAIL. Do not deploy `8eb8cbd23f16c338efb7fd4115f9376c2d29de74` over v92.**
`index.ts` sha256 `4779ef4f9e2bf3fbdba2ab2b6511c5a2daa944a1e53d72a4522c5da42f535062`, preserved
byte-for-byte; the working tree is clean under `supabase/`.

## The one blocker

`V54-P0-TDZ` — `index.ts:2779` reads `PAST_COMPLETION_CLAIM_PATTERN` (declared `:4778`) and
`COMPLETION_WORD` (declared `:5054`) from inside the same block, with no function boundary. Every
founder reply that MATCHES a disambiguation option throws
`ReferenceError: Cannot access 'PAST_COMPLETION_CLAIM_PATTERN' before initialization`, the work
order is marked failed, and the selection never executes. **Deployed v92 performs this correctly.**
21 of my 31 disambiguation shapes reach that branch.

Proved three ways: block-scope analysis, runtime execution of the real statements in the real
order, and `deno check` (`TS2448 ×2` + `TS2454 ×2` on the candidate, **zero** on v92).

This is not a belt defect. The belt is better than v92 in every direction I could construct.

## What to promote regardless of the fix

1. **`qa/verification/proposed/v48_regression_additions.mjs` → `qa/scenarios-runner/`.** It is
   green on deployed v92 (8/0, exit 0) and red on the candidate (5/4, exit 1). Its TDZ detector is
   general, not a pin on this site, and its non-vacuity is proved by running the real detector on
   three synthetic sources (fires on the hazard; quiet on declaration-before-use; quiet on a
   closure).
2. **Retire "deno N == baseline" as a gate.** Pin the CLASSES. The candidate's 23 = v92's benign 7
   + 12 benign implicit-`any` + **4 runtime-fatal TDZ diagnostics**. A count cannot tell those
   apart, and for many rounds it did not.
3. **Annotate `belt_extract.buildDecide()`.** It concatenates dependencies before the branch, so it
   HOISTS exactly the declarations whose order is the bug. Every green reading it has produced
   about the disambiguation branch is a statement about a re-assembled program. `CONTRACT 2` in the
   new file records this so nobody reads it as ordering evidence again.
4. **Extend `v92_reference.mjs` with the fourth path.** `findEntityStateClaimContradiction`'s
   *confirmed-true* branch SUPPRESSES `claimsCompanyDeleted`/`claimsPersonDeleted`, so the
   three-arm instrument reports "v92 destroys" for rows v92 preserves. It cancels here only because
   the function is byte-identical in both binaries — `CONTRACT 4` now pins that. See
   `qa/verification/scratch/v54/differential.mjs`.

## The fix (prepared, not applied — no write authority on `index.ts`)

Move `const PAST_COMPLETION_CLAIM_PATTERN` and `const COMPLETION_WORD` above the resolution block;
module top level is right, both are pure regex literals. The comment at `:4776` says they were
moved INTO the window "so the QA harnesses … see it" — that relocation is the root cause, and its
claim that "its only consumer is `safeProseFragment` below" is false. If a harness truly needs
them inside the window, change the harness.

Re-verify with: `node qa/verification/proposed/v48_regression_additions.mjs` (must exit 0) and
`deno check` expecting `TS2448`/`TS2454` at **zero** — not the total back at 23.

## Corrections to the record

* **V53-R3 overstates the residual.** With the pack populated, both the parenthetical and the
  possessive fabrication are CAUGHT. They ship only with an EMPTY pack.
* **V53-R2 (`namePrefixHit` cap 8→16) is applied and is measurably a no-op** on every family I
  constructed — zero cost, and zero benefit I can reproduce.
* **`titleHead` and `ppInternal` show no marginal contribution** — fully subsumed by `nameInternal`
  on every shape I could build.
* **Ledger #101's "34 suites"** undercounts the current tree: 37 `.mjs` Edge/QA suites, 37/0. The
  two `*.regression.test.mjs` failures are machine-posture assertions, red by design.
* **First-person past-turn recall**: 246/294 generated shapes are v92-preserve / candidate-destroy.
  Correctly classified as fabrications-caught under `CLAUDE.md` "False-execution truth" and the
  ledger's own D144/D155 ruling — but it is a chosen cost, and this is its size.

## Rollback target

`c9dfab5bd433`, deployed version 92, `index.ts` sha256
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`,
`ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`. Exact, available,
and downloaded live in this session. Since nothing was deployed, no rollback is needed.

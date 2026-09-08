# v55 PROMOTION NOTE — verifier #55, campaign #115, candidate `1d720188fd1290f0855d58c8ad83c4910ea68900`

**Verdict: FAIL** (one narrow P1, fix prepared). index.ts sha256
`2bad0df120fef86c34e544081e30bc0c492947a7ddbe93b6b5c0bd29f8dad84a` — untouched.

## What to carry into the implementation branch

1. **Apply V55-D1's fix to `supabase/functions/sem-ai-command/index.ts`** — all 7 occurrences of
   `.replace(/['’]s$/, '')` inside the belt block become `.replace(/['’]s$|(?<=s)['’]$/, '')`.
   Measured in memory (`qa/verification/scratch/v55/fix_possessive.mjs`): populated-pack `s'`/`s’`
   possessive fabrications 72 → 0; zero truthful rows destroyed on a 915-row and an 864-row corpus;
   exactly one verdict moves on the 915 corpus. Keep the file CRLF; re-assert the new sha.
2. **Promote `qa/verification/proposed/v55_regression_additions.mjs` into `qa/scenarios-runner/`**
   (rename as the battery prefers). It is RED on `1d72018` by design (V55-D1) and must go GREEN on
   the fixed bytes: 18 CONTRACT + 1 DEFECT today → 19/0 after the fix. Resolves `index.ts` via
   `SEM_INDEX_SRC` or by walking up; the v92 reference via `V92_INDEX_SRC` or
   `qa/verification/scratch/v92/index.v92.ts`.
3. **Correct three statements in the record** (CURRENT_CAMPAIGN.json / ledger):
   * "possessive residual is pack-conditional" → true only for `'s`/`’s`; false for s-ending names
     until V55-D1 is applied;
   * "cubic growth … no length cap" → `readsAsCompletion` slices to 4,000 chars (+64-char tail);
     worst measured 17.7 ms at 3.9k chars; not a deploy risk;
   * "run14/D107 window 2000 → 2600" → the width budget is gone entirely (source comment "the
     character budget is GONE").
4. **Instrument:** add the fourth path (`findEntityStateClaimContradiction` confirmed-true
   suppression) to `qa/verification/lib/v92_reference.mjs` OR keep reporting every differential with
   LIFECYCLE cancelled on both sides. Today it cancels because the arm is byte-identical
   (`V55-C1` pins that); it will not cancel for a candidate that touches it.
5. **`qa/verification/proposed/v10_regression_additions.mjs` exits 0 while printing 37 failures** —
   historical, not a battery member, but it is the exit-code hazard the record already recorded once.
   Delete or fix.

## What NOT to change

* `nameInternal`, `titleHead`, `newSubject`, the idiom strip, `ppInternal`, the conditioned-offer
  stand-down: all load-bearing on my corpus (mutation-proven). `titleHeadAfterPrep`, `relInternal`,
  `quotedHead`, `adjective`, `fewQuant`, `detName`, the namePrefixHit cap, V45-N2, modal-hedge
  blanking: no marginal effect on my corpus — leave them; removing dead guards is not worth a round.
* CONTRACT 5's narrowing — honest and non-vacuous; leave it.
* The nine window suites' pattern injection ABOVE the window — that is production's scope now.

## Coverage gaps in this run (stated, not skipped)

* `deno check` could not run (`npx`/`deno` gated); TDZ classes covered by my own scanner only.
* No live `supabase functions list/download` (CLI gated); provenance confirmed through git +
  two prior in-tree downloads, LF-normalised identical.
* No browser / live chat turn.

## Expected next round

Apply (1), re-run `v55_regression_additions.mjs` (expect 19/0), re-run the battery and the standing
gates (expect the same counts as this round), `deno check` class decomposition (expect
TS2448/TS2454/TS2304/TS2552/TS2551 = 0), then a fresh verifier on the new exact SHA. Nothing else in
this round's evidence stands between the belt and DEPLOYMENT READY.

# v52 PROMOTION NOTE — verifier #52, campaign #112, candidate 416c14c728293f6c64febda2725b6d330f31626e

**Verdict: FAIL** (one open class). **EDGE STATUS: NOT DEPLOYMENT READY.** Production stays v92 (`c9dfab5bd433`, index.ts `795c20c8…`).

## What to promote from this round
1. `qa/verification/proposed/v52_known_failure_modes_entry_118.md` → append to `qa/KNOWN_FAILURE_MODES.md` as **## 118** (no preamble; the `-V` suffix marks it verifier-authored).
2. `qa/verification/proposed/v52_regression_additions.mjs` → keep in `proposed/` as the standing v52 gate (15/1 on 416c14c; the red is `V52-D1` by design; 16/0 once the closure lands). It exits non-zero on ANY failure, locates `index.ts` via `SEM_INDEX_SRC` or find-up, and is proven non-vacuous (14/2 on a D1-reverted mutant, 11/5 on an entity-signal-disabled mutant).
3. `qa/verification/scratch/v52/` — harness, corpus, differential, matcher, battery, mutation, witness, class-sizing, Q5 probe, closure builder and logs. Mutant `.ts` copies are gitignored (rebuild with `node qa/verification/scratch/v52/build_mutants.mjs && node qa/verification/scratch/v52/build_closure.mjs`).

## What to fix next (in order)
1. **V52-D1** — apply the prepared closure (`scratch/v52/build_closure.mjs`; two anchors inside `completionIsNegated`'s scan loop): a `namePrefixHit` local that tries every word-prefix of `after` against `knownEntityNames`, `nameInternal` true on a hit, longest hit used for the `lastIndex` jump. Measured here: sizing set 0/200 ship, 0/200 truths lost; corpus TR 0 / FR 0; 16 extractor suites green; deno 23.
2. Then re-measure on a corpus that was NOT green before (per #51's lesson) and hand the new exact SHA to a fresh verifier.

## Parity residuals recorded (not blockers — v92 ships them too)
- **V52-O1**: `\?\s*$` stand-down is a whole-summary test on the imminent/FUTURE arms — `I’m archiving X now. Anything else?` (28/30 shapes) ships; c2a57ac caught these.
- `Confirmed — I archived no companies except X` (20 rows) ships in both builds.
- `I ended <Person>’s employment.` (6) ships in both builds — first-person participle list lacks `ended`.

## Record corrections
`v47 44/0` → 43/9; `battery 36 files / 0 failing` → 38 suites / 36 exit-0 / 2 non-zero (machine-posture tests); CRLF 6,015 / 6,016 lines / 1 bare CR; run14/D107 has no slicing window any more; `open_deploy_blockers: []` is false on 416c14c.

## Blocked / not measured
Browser + AI-chat truth checks (no browser tooling in this session); `chat_channel_state` live probe (`supabase db query` gated); `ezbr_sha256` recomputation; the 30-minute durable pendingAction bind.

# v29 PROMOTION NOTE — campaign #89, verifier #29

Candidate `0b5f67ff024aa39b705dfb921a799fe083cbbcb3`
`supabase/functions/sem-ai-command/index.ts` sha256
`0565a5c2398ca17d44de18a40e4a1a1168651b1c1136153b28e6ac944be9c757` — unchanged, byte-identical at
end. **Verdict: PASS.** Nothing was deployed; production `sem-ai-command` remains **v92**.

---

## 1. What to promote, and where

| artefact | action | destination |
|---|---|---|
| `qa/verification/proposed/v29_regression_additions.mjs` | **PROMOTE** | `qa/scenarios-runner/run29_defect_closure_contract.mjs` |
| `qa/verification/proposed/v29_known_failure_modes_entry_89.md` | **APPEND** verbatim | `qa/KNOWN_FAILURE_MODES.md` |
| `qa/scenarios-runner/run28_defect_closure_contract.mjs` | **KEEP AND CORRECT** (see §3) — do NOT retire it in the same change | — |
| `qa/verification/proposed/v28_regression_additions.mjs` | leave in `proposed/` (it is campaign #88's artefact and fails 15 on these bytes **by design** — 7 `[CONTRACT] D164.*` pins written against FIX-I, plus 8 `[DEFECT]`) | — |
| `qa/verification/scratch/v29_*.{mjs,txt,json}` | evidence, keep as-is | — |

`v29_regression_additions.mjs` is **173 pass / 0 fail** on these bytes and is non-vacuous:

| mutation | `run28` failures | `v29` failures |
|---|---|---|
| M1 revert FIX-H | 12 | **22** |
| M2 evidential lexicon unmatchable | 24 | 20 |
| M3 re-apply FIX-I | 15 | 11 |
| M4 neutralise the D155 arm | 3 | 3 |
| **M5 drop one FIX-H lexicon member (`previously`)** | **0** | **2** |

M5 is why `v29` should be promoted alongside `run28` rather than instead of it: it is the one
mutation that destroys a real truthful answer while the currently-promoted suite stays green.

**Do NOT retire `run28` when promoting `run29`.** Standing rule **(f)** — added by this very
closure — says a retirement must carry every pin forward in the same change. `run29` deliberately
does not duplicate `run28`'s D165 ×19, D158d, D166b or `lowercaseNameWithAnd` fabrication-direction
pins. If `run28` is ever retired, those must move into `run29` (or into the deferred
cumulative-residuals suite) in that same commit.

## 2. New pins `v29` adds that exist nowhere else today

| pin | why it is needed |
|---|---|
| `D168.lexiconPinnedByValue` + `D168.lexiconMember.*` (31 members) | `run28` pins 6 of 32; dropping any of the other 26 is invisible there. Pinned **by value** as well as by loop, because a source-derived loop reads the mutated lexicon back out and cannot see a removal. |
| `D163.modal.*` / `D163.weForm.*` (12) + `singleCharName` + `pronounObject` | all 14 fail under M1; 11 of `run28`'s 13 D163 pins do not (V29-F4). |
| `D158b.lowercaseObjectMissed.*` | a **live regression vs `4476c92`**, disclosed since #84, pinned in no suite since run20–run27 were retired. |
| `D146b.*`, `D153.droppedLinker`, `D159.renamedArrowArmUnreachable.*` | documented residuals with no live pin (D153 is in `run28` too — kept here against rotation). |
| `V29.hadBeenNeverCaught.*` (+ control) | V29-F1 — the pluperfect is invisible to every arm; undisclosed until now. |
| `V29_D171.imperativeConfirmationDestroyedByNameParticiple.*` (+2 controls) | V29-F2 — 440 of 13,530 truthful prompts; undisclosed until now. |
| `V29.fillerNegatorDashUppercaseName` (+ control), `V29.bareParticipleInitialNoConfirmedPrefix` | V29-F7 — `index.ts`'s own comment is false for its own cited example. |
| `V29.hedgeWithAndIsSplitAndDestroyed` (+ `or` control) | V29-F8 — the `and` lexicon member is unreachable through the hedge route. |
| `V29.negatorInitialNameDestroysTruthfulMixedAnswer`, `V29.lowercaseNameWithAndDestroysTruthfulNegative` (+controls) | V29-F9 — `run28` pins only the fabrication direction of D116 and of `lowercaseNameWithAnd`. |
| `FIXIrevert.noNegativeLookaheadInEvidentialArm`, `FIXIrevert.evidentialArmStillPresent` | make re-adding FIX-I a deliberate, failing-test act rather than a silent one. |
| `questionBeltByteIdentical`, `pastCompletionClaimPatternByteIdentical`, `beltRegionConstListUnchanged`, `noInlineModifierGroupInCODE` | cheap structural drift guards; the modifier check is run on CODE only (the single textual hit in `index.ts` is inside a comment and must not fail the guard). |

## 3. Text corrections to make in `run28_defect_closure_contract.mjs` — assertions unchanged

`run28` is `v28_regression_additions.mjs` promoted verbatim, so its prose still describes FIX-I,
which no longer exists in these bytes (V29-F6 — the stale-rationale class, one campaign after the
ledger ruled on it). **Every assertion in it is correct and green; only the comments lie.**

| line | current text | should read |
|---|---|---|
| 4–5 | `Candidate under test: 45d05ccd…` / `index.ts sha256: 291800b1…` | `Candidate under test: 0b5f67ff…` / `index.ts sha256: 0565a5c2…` (or: state that the suite was authored for #88 and is now the standing suite for #89) |
| 163 | `--- [DEFECT] D166 (P2): FIX-I closes only a ONE-TOKEN determiner-led evidential subject` | `--- [RESIDUAL] D164/D166: FIX-I is REVERTED, so EVERY determiner-led evidential subject is missed, not only multi-token ones` |
| 170 | note `…MISSED here — the lookahead's single \w+ slot` | `…MISSED here — FIX-I reverted; no lookahead exists in these bytes` |
| 182 | `--- [DEFECT] D167 (P2): FIX-I destroys a negated subject carrying a determiner-led PP` | `--- [CONTRACT] D167: CLOSED by the FIX-I revert — these truthful negatives must survive` |
| 192 | group tag `'DEFECT'` on the D167 loop | re-tag to `'CONTRACT'`: per the file's own legend a `[DEFECT]` "FAILS on this candidate BY DESIGN", and D167 is now a closure that passes. Leaving it `[DEFECT]` makes a green run look like an unfixed defect. |
| 195–198 | `[DEFECT] D169` header/comment | `[RESIDUAL] D169` (the assertions already use `'RESIDUAL'`) |
| 137–141 (`modalWindow.hedgeOverThreeWords` note, if still present) | `a hedge with >2 intervening words falls outside {0,2}` | that window no longer exists; the pin passes because the ` and ` splitter cuts the clause (V29-F8) |

## 4. Text corrections to make in `supabase/functions/sem-ai-command/index.ts`

**Comment-only. No behavioural change. Do NOT bundle these with a regex edit** — if the founder
ever wants a one-line "comments only" diff to eyeball before a deploy, this is it.

1. Clause-splitter comment (~line 5597): drop `'No problem — ACME was archived'` from the list of
   shapes that "no longer shield the fabrication beside it". It still does (V29-F7). `'Nothing
   failed: ACME was archived'` is correct and should stay.
2. Same comment block (~line 5501): `"Deleted ACME, nothing else was changed" keeps its fabrication
   in a clause of its own` — true, and worth saying that isolating the clause buys nothing here,
   because no arm matches a bare participle-initial clause without a `Confirmed —` prefix.
3. D112/D100 comment (~line 5478): `"a legitimate imperative confirmation summary ('Confirmed —
   Archive ACME?') is unaffected"` — add: *unaffected only when the NAME carries no completion
   participle; `Confirmed — Archive Archived Media Group?` is destroyed* (V29-F2/D171).
4. FIX-H comment (~line 5613): note that the guard's `had been` alternative is decorative —
   `LEGACY_PAST_COMPLETION`'s auxiliary set has no `had been`, so the belt can never fire on a
   pluperfect in the first place (V29-F1).

## 5. Standing rules to add

- **(h)** A closed lexicon must be pinned **by value**, not only looped over. A test that reads the
  lexicon out of the source and tests each member it finds cannot observe a member being removed —
  proven by mutation M5, which destroys a truthful hedge with `run28` green at 110/0.
- **(i)** A `[CONTRACT]` group must be **mutation-scored**, not counted. `run28`'s D163 group has 13
  assertions and loses 2 when FIX-H is removed; the other 11 sit outside the construct's window and
  pass either way. Report "N of M pins fail under the fix's own removal", not "M pins".
- **(j)** When a suite is promoted from a verifier's `proposed/` artefact, its HEADER, its console
  group labels and its per-assertion notes must be rewritten to the promoting candidate in the same
  commit. `run24` corrected a stale header; #88 flagged a stale note; `run28` shipped with both.
  Promotion is not a copy.

## 6. Deferred, and still deferred

The **cumulative-residuals suite** the run28 postscript defers is still the right answer and is still
not built. `v29_regression_additions.mjs` closes the four worst gaps in it (D158b, D146b, D153,
D159) but is itself a closure suite and will face the same rotation problem. Recommended shape: one
`qa/scenarios-runner/residuals_cumulative.mjs` that is **never retired**, owns every `[RESIDUAL]`
pin, and is the file the ledger's DOCUMENTED RESIDUALS line names for each entry — which is what
rule (f) actually asks for.

## 7. The deploy gate that is still missing

Not a belt issue. Production runs **v92** (the prose-era build); every campaign #75–#89 measures
against `4476c92`, an in-chain SHA. The ledger's #64/#65 entries record this branch being a **net
regression against deployed v92** on twelve fabrication-escape shapes at an earlier point, and no
campaign since — mine included — has re-measured that. Three suites assert **named** v92-parity
shapes and are green (`structured_claim_verification` L222-244,
`structured_claim_laundering_contract` L1/C6, `lifecycle_evidence_and_output_persistence_contract`
X1b); that is a sample, not a differential.

**Before any deploy:** obtain the deployed v92 source (`supabase functions download sem-ai-command`
into a throwaway directory — my attempt from this session produced no files — or identify the commit
that produced v92) and run the same both-directions corpus + differential sweep against it. If clean,
deploy only behind the founder's explicit `ALLOW_FUNCTIONS_DEPLOY=1`, then byte-verify with
`functions download` + `diff`. **`supabase db push` remains off-limits and is not needed here — this
candidate touches no migration.**

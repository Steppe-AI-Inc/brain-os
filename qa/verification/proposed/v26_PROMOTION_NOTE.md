# v26 PROMOTION NOTE — what an implementing session should do with campaign #86

**Candidate verified:** `415fed37bbc6b266e0dcae8b64ca68195ac88475`
**index.ts sha256:** `3b5baa2c268ccb6c1ecb5e2eac0ac0f20ccfafc991af28af3b090416961f7602`
**Verdict:** **FAIL** — two new regressions (one P2 vs every prior SHA, one P3 vs the SHA where
D156 was closed), one vacuous suite invariant, and four bookkeeping corrections.
**Production is untouched and stays untouched: `sem-ai-command` v92, ACTIVE, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`. Do not deploy this candidate.**

---

## 1. The two code changes to make (both one line, both measured)

### FIX-G — D162a (P2). Apply first; it is a deletion.
In `readsAsCompletion`'s `.some()` arm, drop the unanchored `be` alternative:

```diff
-            && !/\b(?:may|might|could|can|would|should)\s+(?:[a-z]+\s+){0,2}?(?:have been|has been|had been|be)\b/i.test(c)
+            && !/\b(?:may|might|could|can|would|should)\s+(?:[a-z]+\s+){0,2}?(?:have been|has been|had been)\b/i.test(c)
```

Why: the guard drops the WHOLE clause when it matches. `have been|has been|had been` attach to the
participle the hedge is about; a bare `be` attaches to nothing, so ordinary copular English
(`can be confident`, `should be visible`, `may be`, `would be`) discards a genuine completion in
the same clause. Five fabrication shapes caught at `b32e0e4`/`4476c92`/`e6a4d02`/`0e72ced` are
missed here. A bare-`be` hedge (`ACME may be archived.`) is not reachable by this belt at all
(`LEGACY_PAST_COMPLETION` needs `has been|have been|was|were`; `EXECUTION_IN_PROGRESS` needs
`is/are being|getting`), so the alternative protects nothing.

Measured: D162a 0 → 5/5 recovered (6/6 with the window probes), D161 hedges 9 → 9 survive,
`run25` still 440/0, whole battery green.

### FIX-F — D162b (P3).
Give FIX-D's split the lowercase-token guard the disjunct four lines below it already has:

```diff
-  || /\b(?:show(?:s|ed)?|…|note(?:s|d)?)\b/i.test(c.slice(n, m.index).split(/\s(?:and|but)\s|\b(?:although|though|however|therefore)\b/i).pop() ?? '')
+  || /\b(?:show(?:s|ed)?|…|note(?:s|d)?)\b/i.test(c.slice(n, m.index).split(/\b(?:although|though|however|therefore)\b/i).pop().split(/(?:^|\s)[a-z][^\s]*\s+(?:and|but)\s/).pop() ?? '')
```

Why: an `and` inside a NAME is not a clause linker — run17/D128, pinned in this very file as
`Salt and Pepper Co`. Disjunct 4 carries the guard; FIX-D's split does not, so `Barnes and Noble`
/ `Salt and Pepper Co` / `Johnson and Johnson` / `Marks and Spencer` push the evidential out of
the last segment and, with a subordinator also present, destroy the truthful negative. Two
case-scoped splits keep the subordinator test case-insensitive and make the coordinator test
case-SENSITIVE **without** a `(?-i:)` modifier group.

**The `(?:^|\s)` anchor is load-bearing.** Without it `[a-z][^\s]*` matches from inside a
capitalised token (`Barnes` → `arnes and `) and the fix silently does nothing. My first attempt
made that mistake; the mutation harness caught it.

Measured: D162b 0 → 5/5 recovered, D160 15/15 still caught, D160b 8/8 still caught, D156 12/12
still survive, D128 intact, `run25` still 440/0, whole battery green.

**Both together:** `v26_regression_additions.mjs` **135/11 → 145/1**, battery **31/31 green**,
**no `[RESIDUAL]` move**, so the promoting commit needs no pin edits.

---

## 2. The suite change to make (D162c)

`qa/scenarios-runner/run25_defect_closure_contract.mjs` line ~366:

```js
t('CONTRACT', 'noVariableLengthLookbehindShipped', /\(\?<[!=][^)]*[*+{][^)]*\)/.test(nonComment), false);
```

is **vacuous**. `[^)]*` stops at the first `)`, so it cannot see a lookbehind whose quantifier sits
after a nested `(?:...)` group — exactly the shape shipped at `FIRST_PERSON_MAIN_CLAUSE_COMPLETION`
(present at every SHA). Either replace the detector with the depth-tracking scanner in
`v26_regression_additions.mjs` (`D162c.honestDetectorSeesTheShippedVariableLengthLookbehind`) and
**pin the result at `true` as a disclosed `[RESIDUAL]`** — a variable-length lookbehind IS shipped,
it is harmless under V8/Deno, and pretending otherwise is the thing to stop — or delete the
assertion. Do not leave it asserting `false`.

`v26_regression_additions.mjs`'s `D162c.run25DetectorIsNotVacuous` `[DEFECT]` stays red until this
is done; it is the only case that does not go green under FIX-F + FIX-G.

---

## 3. Bookkeeping that must actually land this time

1. **Correct the axis claim.** "Better on BOTH axes" is false for run25: better on truthful
   destroyed (4 vs `4476c92`'s 21 on 55 cases), **worse on fabrications missed (5 vs 0 on 46
   cases)**. After FIX-G it becomes 4 vs 21 and **0 vs 0** — at which point the two-axis claim is
   true and can be stated with its SHA, corpus size and both directions.
2. **Correct "FIX-E … 0 collateral"** — five fabrications lost, all caught at every prior SHA.
3. **Actually add D158d to the `DOCUMENTED RESIDUALS` enumeration.** The run25 postscript says it
   was added; the list three lines later does not contain it, and `run25`'s own D158d pin still
   carries the note saying the ledger omits it. This is the third campaign in a row a correction
   was announced and not made.
4. **Fix `run25`'s self-contradicting header.** Line 4 says the DEFECT pins are closed (correct);
   line 24 still says "EXPECTED ON THIS CANDIDATE: the 6 [DEFECT] groups FAIL" (false). Three case
   notes still read "CAUGHT at 4476c92, missed here" on a candidate where they are caught here.
   Fourth consecutive recurrence — when re-pointing a promoted suite, grep the whole file for the
   old candidate's SHA and for "here", not just the header block.
5. **"32 suites" is 31 executable suites + `_gate_extract.mjs`** (a helper), five of the 31 being
   inert `SUPERSEDED (prose-era)` stubs. Carried unchanged for three campaigns.
6. **Retract "No variable-length lookbehind is shipped"** (#85) — see D162c.
7. **`deno check` is `BLOCKED`, not confirmed**, for the third campaign running. Either provision
   `deno` on the machine that runs these campaigns or stop listing the number as evidence.

---

## 4. Standing rule to add to the ledger

> **Any new splitter over founder-facing prose must reuse this file's existing
> name-vs-clause-boundary guard, or state in the same change why it does not need it.**
> D125 → D128 → D162b is the same defect three times: a separator that is a clause boundary in
> English and part of a proper name in a customer list. FIX-D introduced a brand-new tokenizer four
> lines above a tokenizer that already answers that question correctly, and did not reuse it.

> **A guard that DROPS a whole clause must be anchored to the thing it is guarding.**
> D162a is FIX-E dropping a clause because of a modal that governs a different predicate. If a
> guard's job is "this completion is hedged", it must be tied to the completion verb, not merely
> co-located with one.

---

## 5. Re-verification order after applying FIX-F + FIX-G

1. `node qa/verification/proposed/v26_regression_additions.mjs` → expect **145 pass, 1 fail**
   (D162c only), then **146/0** once the run25 detector is fixed per §2.
2. The whole `.mjs` battery from the filesystem → **31 suites, 0 non-zero exits, 0 `FAIL` lines**,
   `run15` = 57, `run25` = 440/0.
3. Re-assert `index.ts` sha256 before and after; record the new one in the closure commit.
4. **Do not deploy.** Production stays `sem-ai-command` v92 until a fresh independent campaign
   passes on the exact new bytes.

# v22 PROMOTION NOTE — verifier #22, campaign #82 (candidate `be8d9ca` / closure `0969852`)

Verdict: **FAIL**. `index.ts` sha256 at the end:
`272de3a43cbfa685e144376b52c07cb30fa63d72615390ce529dca0b841bfbd2` (unchanged; nothing in
`supabase/` or `web/` was written).

## What to promote, and where

| artifact | promote to | when |
|---|---|---|
| `v22_regression_additions.mjs` | `qa/scenarios-runner/run22_defect_closure_contract.mjs` | with the run22 closure, after retiring `run21_defect_closure_contract.mjs` (same rotation run21 did to run20) |
| `v22_mutation_proof.mjs` | stays in `qa/verification/proposed/` | it is campaign evidence, not a standing suite |
| `v22_known_failure_modes_entry_82.md` | append verbatim to `qa/KNOWN_FAILURE_MODES.md` as `## #82 — …` | now |

`v22_regression_additions.mjs` already resolves `index.ts` from `SEM_INDEX_SRC`, then
`../../../supabase/…` (its home in `proposed/`), then `../../supabase/…` (its home in
`qa/scenarios-runner/`), so promotion is a `git mv` with no edit.

**On this candidate it exits 1: 199 pass, 43 fail — 43 DEFECT reproductions, 0 RESIDUAL moves,
0 CONTRACT failures.** That is the convention working: the DEFECT entries are the open defects and
they turn green as they are closed. Do not "fix" the suite by relaxing them.

## Three PREPARED fix directions (measured, NOT applied)

None of these was applied — this campaign has no write authority on the implementation branch and
the SHA had to come back byte-identical. Each is mutation-proven in `v22_mutation_proof.mjs`.

### 1. D150 (P2) — restore the label gate around D148's imperative test. **Take this one.**

`supabase/functions/sem-ai-command/index.ts`, the `const contradicted = …` statement (≈2734-2737).
Replace the second disjunct with the label-gated form:

```ts
|| (typeof matchedOption.label === 'string'
  && (matchedOption.actionType === 'restore' ? ARCHIVE_VERB_PATTERN : RESTORE_VERB_PATTERN).test(matchedOption.label)
  && matchedOption.label.replace(new RegExp((matchedOption.actionType === 'restore' ? ARCHIVE_VERB_PATTERN : RESTORE_VERB_PATTERN).source, 'ig'), ' ').trim().length === 0
  && (matchedOption.actionType === 'restore' ? /\b(?:archive|delete|remove|end)\b/i : /\b(?:restore|unarchive|reactivate|activate)\b/i).test(command)));
```

This is run20's label test (which was right) plus run21's raw-command test (which was right)
*without* run20's `commandForContradiction.trim().length === 0` (which was D148). It is exactly the
direction verifier #21 published and measured.

* 13/13 D150 names select again; 11/11 D148 phrasings still dead-end; mirror direction still
  closed; D138 preserved.
* **Blast radius: ZERO.** `run8, run10, run11, run12, run13, run14, run15, run16, run17, run18,
  run19, run21` all exit 0 against a temp copy carrying this change. No suite pin needs touching.
* Add the `D150.*` DEFECT block from `v22_regression_additions.mjs` as CONTRACT once it is green,
  and — this is the point of the lesson — add at least one **case AGAINST** for any future term
  added to that regex (a real name carrying it), not only cases FOR.

### 2. D151 (P2) — re-add the D141 lexicon AND close the clause-initial free pass. Requires two test-pin updates.

```ts
// NEGATED_CLAUSE — re-add the six words
/\b(?:not|never|no|nobody|nothing|none|nowhere|neither|nor|few|hardly|pending|awaiting|…)\b/i

// completionIsNegated — delete the third disjunct's free pass; let the (now narrow) R-ZR2
// linker test decide for a clause-initial negator too
return n >= m.index
  || /\b(?:that|which|who|whom)\b/i.test(c.slice(n, m.index))
  || !(/(?:^|\s)[a-z][^\s]*\s+(?:and|but)\s/.test(c.slice(n, m.index))
       || /\b(?:although|though|however|therefore)\b/i.test(c.slice(n, m.index)));
```

Measured on the 101-truthful / 61-fabrication union corpus: **truthful destroyed 11 → 1,
fabrications missed 32 → 27.** Strictly better on both axes. It closes D141's 8 truthful
destructions and 4 of D147b's clause-initial leaks, destroys nothing new, and loses no
previously-caught fabrication.

**Required in the SAME commit (this is the D149 rule):**
1. `qa/scenarios-runner/run15_defect_closure_contract.mjs:121` — update the pinned literal
   `"(?:not|never|no|nothing|none|pending|awaiting"` to the new list. Without this run15 THROWS and
   its 57 assertions silently stop running. **Verified live: it does exactly that.**
2. `run21`'s five `D141.residual.negatorLexiconGap.*` `[RESIDUAL]` pins and its
   `D149.run15PinStillMatchesTheProduct` `[DEFECT]` pin flip. Confirmed: run21 then reports
   **8 failures, all `[RESIDUAL]`/`[DEFECT]`, 0 CONTRACT failures.**
3. No other suite moves (`run8/10/11/12/13/14/16/17/18/19` all exit 0).

### 3. D152 (P3) — active voice, if it is judged worth one idiom FP. Otherwise keep the revert, but fix the reason recorded for it.

Add inside the existing `LEGACY_PAST_COMPLETION` (no new const, so the named-list suites
run15/16/17/18 are untouched — a new const **does** break all four, measured):

```
|(?:^|\bconfirmed\s*[—–-]\s*)(?:and\s+|but\s+|so\s+|then\s+)?(?:i|we)\s+(?:just\s+|already\s+|also\s+|now\s+|recently\s+|successfully\s+|have\s+|had\s+)*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\s+\S
```

* **0 of 12** of D145's truthful shapes destroyed; **7 of 7** of D144's fabrications caught.
* **One residual FP:** `I restored order to the report layout.` (`They restored order …` is safe —
  the arm is first-person only). That single idiom is the honest reason to defer; "cannot be made
  assertion-safe" is not.
* Blast radius if taken: run21's nine `D144.residual.activeVoiceNotCaught.*` `[RESIDUAL]` pins flip
  (0 CONTRACT failures). Everything else exits 0.

## Things NOT to do

* **Do not deploy.** Production is `sem-ai-command` **v92**, `ezbr_sha256 33255b31…4475`, verified
  read-only this campaign. None of D58–D154 is live. This candidate FAILs.
* **Do not close D154 with a longer verb list.** "revive / reopen / undelete / restoring" only
  matter because the option is literally NAMED that word; a blocklist of opposite verbs is the same
  shape run16/D123 struck down for negators. The general answer is the D136 ambiguity dead-end.
* **Do not treat run21's green as coverage.** It is green *despite* D150 and D153 because its D138
  block has only participial names and its D146 limits block has no dropped-linker sentence — the
  same corpus-inheritance blind spot #81 found in run20. Promoting a verifier's corpus verbatim
  inherits its blind spots along with its coverage.
* **Do not re-diagnose D147 as a lexicon problem.** It is `completionIsNegated`'s third disjunct
  (D147b), and it leaks today with the current word list.

## Claims in the run21 postscript that need correcting when #82 is filed

1. *"collateral … == the b32e0e4 baseline, no coverage regression"* — there is one: 8 aux-preceded
   linked fabrications caught at `b32e0e4`/`54ebecc` are missed here (D153).
2. *"the linked fabrications still caught"* — only for the retained linkers, and only when a finite
   auxiliary precedes the negator.
3. *"a participial NAME still selects"* — true, but base-form-verb names stopped selecting (D150),
   and that is not stated anywhere.
4. *"battery 32 suites"* — 32 files, 31 suites, 5 of them SUPERSEDED stubs.
5. *"[D144] cannot be made assertion-safe"* — overstated; see §3 above.

The D149 withdrawal (*"my earlier 'run15 exit-1 is a pre-existing stub' claim was WRONG …
withdrawn"*) is correct and complete. That one was handled exactly right.

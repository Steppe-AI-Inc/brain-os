# v15 PROMOTION NOTE — campaign #75, verifier #15, base `d724d8c`

Kept deliberately separate from `v15_known_failure_modes_entry_75.md`. A promotion preamble
pasted into the permanent ledger has corrupted it twice already (D97, D104, and D115 was the
cleanup). **Nothing in this file belongs in `qa/KNOWN_FAILURE_MODES.md`.**

## What to promote, and when

`qa/verification/proposed/v15_regression_additions.mjs` should be promoted to
`qa/scenarios-runner/run15_defect_closure_contract.mjs` **only after D116–D120 are closed**,
with the DEFECT expectations left exactly as written (they already encode the fixed
behaviour). Until then it belongs in `proposed/`, where a nonzero exit is correct and
expected. It currently reports 17 pass / 29 fail, and all 29 are open DEFECT cases —
**0 CONTRACT failures**, meaning every property `d724d8c` actually claims still holds.

The 13 CONTRACT cases are promotable *immediately* and independently of any fix. Three of
them (`V15.specificityUsesNormalisedLength`, `V15.residualJoinsWithSpace`,
`V15.d113AgreementIsEqualityNotContainment`) correspond to mutants that survived my battery,
i.e. guard limits that no committed suite currently observes.

## Source changes this campaign did NOT make, and why

**No source edit was applied.** This run operates under a hard SHA-discipline rule: the
`index.ts` sha256 must equal `1b291f37…ef64` at the end or the run is invalid. Fixing D116
in `index.ts` would have changed it. Every fix below is therefore *proposed and specified*,
not applied — `FIX PREPARED`, never `FIX LIVE VERIFIED`. None has been run against
production, and production is on v92 regardless (see the entry file's production-gap
section).

## Proposed fixes, in priority order

### 1. D116 (P1) — negation must dead-end, in `matchDisambiguationOption`

The bug is the `matches.length === 1` early return at index.ts:423, which fires before every
guard D106 added. The minimal correct change is **not** another word list bolted onto the
matcher; it is to route the single-match case through a refusal when the reply is negating.
Concretely: if the reply contains a negator (`not`, `no`, `don't`, `except`, `but`, `neither`,
`nor`, `other than`, `anything but`) in the same clause as the matched label, return `null`
and fall through to the LLM path, which can actually read the intent.

Dead-ending is cheap here and mis-binding is not: a dead end costs the founder one extra
turn, a mis-bind archives a company with no confirmation step. **Fail closed.**

Do not attempt to *interpret* the negation ("not acme" ⇒ pick the other one). Two options
make that look tempting; three make it wrong. The LLM path exists for this.

### 2. D117 — scope the negation lookahead to the clause, not the summary

Replace the whole-summary `(?![^]*\b(?:not|…)\b)` with a lookahead bounded to the current
sentence/clause (`(?![^.;!?]*\b(?:not|…)\b)`). This preserves both examples D112 was written
for — `"Confirmed — the company is not archived."` and `"Confirmed — you have 3 archived
companies."` — while `"Confirmed — Archived ACME. No further action needed."` stops being
exempt, because the negation is in a different sentence from the completion.

`D117.hold.d112ExamplesStillSurvive` and `D117.hold.baseShapeStillCaught` in the regression
file are there to keep any fix honest in both directions at once.

**Search the class, not the instance.** The ledger at `:5277` removed a whole-summary
negation exemption once already. Any *other* gate in this file that tests a negator against
the whole summary is the same bug and should be found in the same pass.

### 3. D118 — one predicate, all four arms

`readsAsCompletion` ORs four arms and only one has negation handling. The fix is to apply
the negation/part-of-speech constraint **once**, at the `readsAsCompletion` level, rather
than per-arm — which is what run13/D100's own "one predicate, both arms" principle already
demands and what D112 did not follow. `D118.hold.realCompletionsStillCaught` guards the
other direction.

### 4. D119 — obtain canonical evidence; do NOT add a sixth grammar rule

Stated as an explicit design constraint in the brief, and I agree with it: five campaigns
have been spent narrowing exactly such chains, and the measurement in the entry file shows
the current chain has no discriminating power at all (10/13 real names destroyed *and* 6/18
fabrications surviving, simultaneously).

**The remedy is not a better word list. It is to stop offering the option.**

run13/D103 already established that an option whose id is absent from the canonical read
**cannot execute** — its id fails the `contextCompanyIds` provenance filter at index.ts:3047.
Such an option is a dead pointer. Offering the founder a selectable choice that cannot do
anything, labelled with unverifiable model-authored text, is the actual defect; the label
gate is downstream of it.

Proposed: **drop options whose id does not resolve against the canonical read** before the
list is rendered, and if that empties the list, ask an open question instead of presenting
a disambiguation. This obtains/requires canonical evidence rather than guessing at grammar,
and it makes both failure directions disappear at once — there is no real name left to
destroy and no fabricated label left to ship.

This changes a committed contract. run8/D72b currently pins the *opposite* (a benign label
for an absent entity keeps its repair), and my mutant M20 was killed by run8, run10 and the
lifecycle suite. So this is a **founder/product decision, not a patch**, and D72b must be
retired deliberately rather than broken silently. I have left `V15.absentBranchBenignLabelSurvives`
as a CONTRACT case asserting today's behaviour precisely so the change is visible when made.

### 5. D120 — include `EXECUTION_IN_PROGRESS` in the label channel

`safeOptionLabel` should consult it alongside `PAST_COMPLETION_CLAIM_PATTERN` and
`COMPLETION_WORD`. Low cost, and it closes the progressive shapes independently of whether
D119 is adopted. If D119 *is* adopted, D120 becomes largely moot — which is an argument for
doing D119.

### 6. D122 — correct the citation at index.ts:2563

Either point it at `sem_ai_command_source_invariants_drift_guard.mjs` (which genuinely
observes the invariant, by source-text match), or give
`issue5_confirmation_action_type_binding.mjs` a real extraction of the product's
`resolveClarificationField` so the citation becomes true. Prefer the second: a source-text
guard catches a reversion but not a semantically-equivalent rewrite.

## Reproduction artifacts (scratch, not for promotion)

* `qa/verification/scratch/v15_extract.mjs` — my own extraction layer, with byte-level
  assertions that the security-critical literals survived TS-stripping into the executed
  slice. It reuses only `stripTS` from `_gate_extract.mjs` and does not trust it.
* `qa/verification/scratch/v15_mutations.mjs` — the 25-mutant battery (20 killed / 5
  survived). Writes to the **real** `index.ts` and restores from a pristine byte buffer in a
  `finally`, re-asserting the sha after every mutant.
* `qa/verification/scratch/v15_s0_matcher_attack.mjs` — 40 probes, where D116 was found.
* `qa/verification/scratch/v15_s3_drift_corpora.mjs` — 33 + 28 summaries, where D117/D118
  were measured.
* `qa/verification/scratch/v15_s4_corroboration.mjs` — the two-branch D113 measurement.
* `qa/verification/scratch/v15_s7_question_belt.mjs` — the three-SHA differential.
* `qa/verification/scratch/v15_s9_ledger_claims.mjs` — the ledger's own quoted examples,
  executed.

These are reproduction evidence for a reviewer, not suites; they are not intended for
`qa/scenarios-runner/`.

## One process note

My first draft of the question-belt metric counted *any* non-null return as an assertion
leak and scored the candidate at 11/20. The true figure is 0/20 — cutting an assertion down
to `"ok?"` is the belt working. I caught it because the number disagreed with the D114
narrative and I went back to the fragments rather than reporting the number. Worth recording
because a verifier's own measurement error in the *pessimistic* direction is just as capable
of producing a false verdict as an implementer's in the optimistic one.

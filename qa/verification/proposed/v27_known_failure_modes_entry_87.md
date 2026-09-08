## #87 — verifier #27, independent verification of the run26 D162a (FIX-G) + D162b (FIX-F) closure (`5db8603` / `a9bf518`)

**Candidate:** `a9bf5189e071ae9b00ee2bddade2b0f9588e0f1d` (closure commit `5db8603`; the campaign
rotation commit on top touches only `qa/verification` bookkeeping — verified by diff,
`git diff 5db8603 a9bf518 -- supabase/ web/` is empty).
**index.ts sha256:** `70161e8de8d221824d02c5ae27ae87e1169a7a111770ea5482992860c2ba5344`, asserted at
preflight, before and after every mutation, after every prepared-fix measurement, and at the end.
**index.ts was never written.** Every measurement ran on an in-memory string or on a TEMP COPY
handed to a suite by explicit path (`SEM_INDEX_SRC`). `git status -- supabase/ web/` is empty.
**Baselines, each extracted from git by my own extractor:** `415fed3` (#26's candidate — the SHA
FIX-F/FIX-G were written against) and `4476c92` (run22 — the collateral baseline every campaign
since #83 measures against).
**Real surface of the change:** exactly **2 non-comment lines** vs `415fed3` — the FIX-F
replacement of the evidential split and the FIX-G deletion of `|be`. Nothing else in `supabase/`
or `web/` moved.

**Verdict: FAIL** — **FIX-F and FIX-G each do exactly what they were prescribed to do, but the
closure again reports a two-directional trade as a one-directional improvement, and this time the
two collateral numbers inside the SAME postscript contradict each other.** FIX-G deletes one
alternative from the FIX-E guard instead of ANCHORING it, which was #26's stated root cause; the
guard is still unanchored, and its `{0,2}?` window still swallows a genuine completion whenever the
entity name is a SINGLE token — **D163, P2, a REGRESSION vs `4476c92` on 10 named shapes
(`I can confirm ACME has been archived.`), inherited from run25/FIX-E, NOT closed by FIX-G, and
positively denied by run26's own D161 pins, all six of which use a TWO-token name and `was`
instead of the perfect passive.** FIX-F's name guard is correct, but it widens the evidential
disjunct in BOTH directions: a POSITIVE evidential clause after a subordinator now disarms the belt
for coordinator-bearing names too — **D164, P3, a NEW regression introduced by this candidate,
CAUGHT at `415fed3` AND `4476c92`, MISSED here, 5 named shapes.** Postscript correction 1's
*"fabrications-missed 0 vs 0 (equal)"* is **FALSE** on my corpus (**15 missed here, 0 at
`4476c92`**) and is **irreconcilable with the Evidence line eight lines below it in the same
postscript**, which states *"4/50 fabrications missed"*. **This is the sixth consecutive campaign
in which a two-directional trade was reported as one-directional, and the first in which the
postscript's own two collateral figures cannot both be true as written.** **D162a and D162b ARE
genuinely closed** (12/12 and 12/12 on corpora I wrote, mutation-proven), **and no other prior
closure is reopened** — I re-derived all 34 belt closures, all 16 matcher closures and the whole
question belt cross-SHA. **Both new defects have a measured one-line fix with zero collateral on
my corpora** (FIX-H and FIX-I, below), taking my suite from 146/15 to 159/2 with the whole battery
green except one byte-pin in `run26` that must move with the fix. This is a fixable candidate.

**Production, read-only, re-derived myself:** `supabase functions list --project-ref
pvphxgrtdfrudejjhzjk` → `sem-ai-command` **version 92, ACTIVE**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at` 1788239725518 —
byte-identical to what #75–#86 recorded. **Nothing has been deployed; none of D58–D164 is live.**
Everything below concerns a candidate branch, not what the founder runs today. **Nothing was
written to production, and nothing was written outside my own worktree.**

**Method note.** Every measurement drives the REAL shipped predicates, sliced out of index.ts by
three extractors I wrote for this campaign (a belt module from `const LEGACY_PAST_COMPLETION` to
`const legacyProseFallback`; a matcher module from the verbatim `matchDisambiguationOption`,
`commandContradictsActionType` and the shared `ARCHIVE_VERB_PATTERN`/`RESTORE_VERB_PATTERN`; a
question-belt module from `safeQuestionFragment`). They import nothing from `qa/scenarios-runner`
— not `_gate_extract.mjs` — and nothing from any `v26_*.mjs`; all of those are artefacts under
test. Each extractor refuses to run unless every named const survives the slice and unless the TS
annotations it strips are exactly the ones it declares.

---

### D163 (P2, NEW — a REGRESSION vs `4476c92`) — FIX-G removed one alternative but did NOT anchor the guard, so `modal + (0-2 words) + PERFECT PASSIVE` still swallows a real completion

#26's root-cause sentence for D162a was: *"it never checks that the modal governs the completion
verb."* FIX-G's answer was to delete `|be`. That removes the copular reach — correctly, 12/12 —
but the guard is still not anchored, and `(?:[a-z]+\s+){0,2}?` still admits **a whole new
subject**. Two intervening tokens is precisely `verb + one-token company name`:

| founder-facing summary | `4476c92` | `415fed3` | **candidate** |
|---|---|---|---|
| `I can confirm ACME has been archived.` | **CAUGHT** | MISSED | **MISSED** |
| `I can report ACME has been archived.` | **CAUGHT** | MISSED | **MISSED** |
| `I can verify ACME has been archived.` | **CAUGHT** | MISSED | **MISSED** |
| `We can confirm ACME has been archived.` | **CAUGHT** | MISSED | **MISSED** |
| `We should note ACME has been deleted.` | **CAUGHT** | MISSED | **MISSED** |
| `You should know ACME has been archived.` | **CAUGHT** | MISSED | **MISSED** |
| `You may recall ACME has been archived.` | **CAUGHT** | MISSED | **MISSED** |
| `You could see ACME has been archived.` | **CAUGHT** | MISSED | **MISSED** |
| `I would say ACME has been archived.` | **CAUGHT** | MISSED | **MISSED** |
| `I should mention Beta has been removed.` | **CAUGHT** | MISSED | **MISSED** |

**The paired controls are what make this a defect and not a shape the belt refuses generally.**
The identical sentence fires here when *any one* of three accidents intervenes: the auxiliary is
`was` rather than the perfect passive (`I can confirm ACME was archived.` → CAUGHT); the name is
two tokens (`I can confirm ACME Holdings has been archived.` → CAUGHT, 3 intervening tokens); or
the name contains a digit (`I can confirm test3 has been archived.` → CAUGHT, because `[a-z]+`
cannot span `test3`). **The verdict changes because of the length and spelling of the company's
name** — the same class of accident as D162b, in the other belt.

**run26's own D161 pins are built entirely out of those accidents.** All six
`D161.modalDoesNotLaunderAFabrication` cases use `ACME Holdings`/`Beta Corp` (two tokens) and
`was`, never the perfect passive; the one window-boundary probe is the 3-word case
(`You can quite very definitely be confident…`) — the closed end. **The suite pins the side of the
`{0,2}?` window that holds and never the side that does not**, which is how a P2 survived a
campaign that explicitly set out to close the guard, and why ledger #86's *"a fabrication with a
modal in another clause is still caught 6/6, including `I can confirm ACME Holdings was
archived.`"* reads as reassurance while the one-token perfect-passive form of that exact sentence
ships.

**Founder impact.** `legacyProseFallback` and `structuredProseDrift` are the only consumers of
`readsAsCompletion`; both run on ordinary turns. A miss means raw model prose ships. The founder
reads *"I can confirm ACME has been archived."* on a turn where **nothing was archived** — a
first-person, explicitly-vouched fabrication, which is a strictly stronger claim than the D162a
shape this campaign was opened to fix. This is the BUG-002 class, and `4476c92` catches every one.

**Standing rule to add:** when a guard is defended by a bounded window, the regression corpus must
contain the shape at **both** ends of that window, built from the shortest plausible entity name.
A pin at the closed end proves nothing about the open end.

### D164 (P3, NEW — a REGRESSION vs `415fed3` and `4476c92`, introduced by FIX-F) — the evidential disjunct cannot tell a NEGATED evidential subject from a POSITIVE one, and FIX-F widened both

FIX-F is correct about names. But arm 3 asks only *"is there an evidential word in the last
segment?"*, never *"whose evidential is it?"* — and the segment after a subordinator is exactly
where a new positive subject appears. Before FIX-F the name-blind split accidentally chopped that
segment for coordinator-bearing names; FIX-F removes the accident in both directions at once:

| founder-facing summary | `4476c92` | `415fed3` | **candidate** |
|---|---|---|---|
| `Nothing failed however the log shows Acme and Sons was archived.` | **CAUGHT** | **CAUGHT** | **MISSED** |
| `No errors occurred however the audit confirms Salt and Pepper Co was archived.` | **CAUGHT** | **CAUGHT** | **MISSED** |
| `No issues arose although the record states Barnes and Noble was deleted.` | **CAUGHT** | **CAUGHT** | **MISSED** |
| `No blockers remain therefore the report notes Johnson and Johnson was restored.` | **CAUGHT** | **CAUGHT** | **MISSED** |
| `No problems though the log proves Smith and Sons was removed.` | **CAUGHT** | **CAUGHT** | **MISSED** |

Note what changes and what does not between the sentence FIX-F exists to rescue and the sentence
it now loses:

```
truthful negative (must survive):  No log       however   shows  Salt and Pepper Co was archived.
fabrication      (must fire)    :  Nothing failed however the log shows Acme and Sons  was archived.
```

The negator, the subordinator, the evidential, the coordinator-bearing name and the completion are
all in the same order. **The only difference is whether the evidential's subject is the negated
noun phrase or a new determiner-led one** — a distinction arm 3 does not make and FIX-F did not
add. The linker-free version of the same fabrication (`Nothing failed however the log shows ACME
was archived.`) was ALREADY open at `415fed3`; that half is pre-existing and is pinned
`[RESIDUAL]` rather than counted against this candidate. The coordinator-bearing half is new here.

**Root cause and the standing rule it breaks.** #26's own rule — *"any new splitter over
founder-facing prose must reuse the file's existing name-vs-clause-boundary guard"* — was followed
exactly. The rule it does not cover is the one this defect needs: **widening a rescue disjunct
widens it for every sentence that matches its SHAPE, including the ones that should not be
rescued. A change that makes a disarm-condition easier to satisfy must be measured on the
disarm-condition's own false-positive corpus, not only on the cases it was written to save.**

### D165 (P3, NEW disclosure — NOT a regression; identical at `4476c92`, `415fed3` and here) — the run11/D87 class was never applied to the perfect-passive arm

`LEGACY_PAST_COMPLETION`'s participle list omits `activated`, `deactivated`, `closed`, `cleared`
and `sent`; `CONFIRMED_COMPLETION`'s omits `closed` and `added`. Both lists are shorter than
`COMPLETION_WORD`'s and than `EXECUTION_IN_PROGRESS`'s own `was|were` arm. The result is the exact
symptom run11/D87 was raised to end — *one claim, two outcomes*:

| founder-facing summary | result |
|---|---|
| `Delta Ltd was activated.` | **CAUGHT** (the `was\|were` arm carries `activated`) |
| `Delta Ltd has been activated.` | **MISSED** (`LEGACY` does not) |
| `Delta Ltd has been added.` | **CAUGHT** (`added` is in `LEGACY`) |
| `Confirmed — Delta Ltd added.` | **MISSED** (`CONFIRMED_COMPLETION` does not carry `added`) |
| `Confirmed — Delta Ltd closed.` | **MISSED** |

Present at every SHA measured, so it does not count against this candidate — but it is
undisclosed, it is not in the DOCUMENTED RESIDUALS list, and D87's own fix note (*"One shared verb
list now feeds every arm, plus the broader progressive shapes the narrow arms missed"*) reads as
though it had already been applied here. Pinned `[RESIDUAL]` at current behaviour in
`v27_regression_additions.mjs` so a later change that moves it is seen.

---

### What is genuinely closed — re-derived independently, not taken on trust

**D162a (P2) — CLOSED, 12/12**, on sentences I wrote, not #26's: `can be confident`, `should be
visible`, `may be worth noting`, `can be seen`, `can be confirmed and`, `can be sure`, `should be
clear`, `would be everything`, `might be surprising but`, `could be that`, `can be hard to say`,
plus the `has been` copular variant. **On this family the candidate is byte-for-byte
behaviour-identical to `4476c92`** — FIX-G is a restoration, not a new trade. My mutation harness
proves it load-bearing: re-adding `|be` breaks 5/5 named cases and takes `run26` to `exit=1,
6 FAIL`.

**D162b (P3) — CLOSED, 12/12.** Twenty-six name-internal-linker truthful negatives across six
`and`-names and two `but`-names, four subordinators, and the zero-relativizer and
`was not`-negated forms — every one destroyed at `415fed3` AND `4476c92`, every one surviving
here. All nine paired real-linker fabrications still fire. Reverting FIX-F to the name-blind split
breaks 5/5 named cases and takes `run26` to `exit=1, 7 FAIL`.

**D161 (P4) — NOT reopened by FIX-G: 15/15 hedges survive**, including the two-space case, the
`may or may not` form, and a hedge about a coordinator-bearing name. The 16th
(`may well and truly have been` — 3 intervening words) is destroyed here AND at `4476c92`, so it
is a pre-existing window residual, pinned.

**No prior closure reopened.** Re-derived here rather than trusted, on the belt: D94, D100, D103c
(both halves), D112 (noun / list / not-done / present-negation), D125 (all four trailing-qualifier
shapes), D128, D130 (both names), D131, D134 (both halves), D136, D137 (both halves), D139, D147b,
D151, D155 (both claims and both non-claims), D156, D158, D160, D160b and BUG-002 — **34 cases,
34 correct.** On the matcher: D116 (all three negated-mention shapes), D123, D129, D132, D133
(word / hash / bare number), D135, D136 (`Option 2 Ltd` ambiguity), D142, D148, D150, D157 (both
the option-suffix reply and the unified contradiction test in all four directions) — **16 cases,
16 correct.**

**The question belt (`safeQuestionFragment`) is byte-identical** at `4476c92`, `415fed3` and this
candidate — 8,110 bytes, sha16 `1c5cafa9673855f8` on my slice boundaries — and behaviourally
unchanged on D53, D61, D88, D92, D98 and D114. *(Ledger #86 records "7,995 bytes / sha16
`394e7666d501f8f1`" for the same invariant. That figure is not reproducible under my boundaries;
the slice is byte-identical across all three SHAs either way, so this is a slice-definition
difference, not a code change — but it is a magic number a later verifier cannot re-derive, and it
should be replaced with the boundaries it was measured on.)*

**No `(?-i:` or `(?i:` modifier group is shipped** on any non-comment line. **No new `const`** —
the belt's named-const set is unchanged and `run15` executes its full **57** assertions.
**A variable-length lookbehind IS shipped** (`FIRST_PERSON_MAIN_CLAUSE_COMPLETION`, `\w{1,24}`
inside the lookbehind), it is present at every SHA, it is harmless under V8/Deno, and it is now
**disclosed rather than denied** — run26 pins it TRUE with a detector that actually walks to the
matching depth-0 `)`. I re-implemented that detector independently and it agrees. **D162c is
correctly closed.**

**Degenerate spans and `.pop() ?? ''`: safe.** `String.prototype.split` with a regex separator
always returns at least one element, so the `?? ''` is defensive rather than load-bearing; both
split regexes are fully non-capturing. **20,000 fuzzed strings built from negators, linkers,
evidentials, dashes, parentheses and punctuation: 0 throws.**

**Battery, run from the filesystem by my own runner:** **32 `.mjs` files = 31 executable suites +
`_gate_extract.mjs` (an importable helper with no output by design). 0 non-zero exits, 0
output-text `FAIL` lines.** `run15` = **57**. **`run25` is gone** (retired, file deleted);
`run20`–`run25` absent. **`run26` is present, 145 assertions, and genuinely assertion-bearing** —
proved by mutation, not by reading: re-adding `|be` `exit=1, 6 FAIL`; reverting FIX-F to the
name-blind split `exit=1, 7 FAIL`; removing the last-segment split entirely `exit=1, 26 FAIL`;
neutralising the modal guard `exit=1, 10 FAIL`. **No `.sql` is executed by any suite** (60 `.sql`
files present, none invoked). **Five of the 31 are self-declared `SUPERSEDED (prose-era)` stubs**
that exit 0 having asserted nothing (`claim_segmentation_and_present_tense_fp`,
`d3_past_completion_gate_not_shortcircuited_by_pending_action`, `mixed_claim_grounding`,
`past_completion_gate_behavior`, `per_resource_grounding_contract`) — disclosed, pre-existing, and
honest about it. **No suite is a silent stub pretending to pass.**

**Founder-directed lexical-branch scenario (as #75–#86): 0 truthful answers destroyed.** Twenty-two
canonical completion words × a real-shaped name each (28 names, including six with an internal
`and`, two with an internal `but`, four negator-initial, and the assertion-shaped `Was Archived
Holdings`) × 8 belt branches = 176 cases. Every truthful branch survives — `There is no record
<Name> was <word>.` per word AND per and-name is 66/66 clean. The only fabrication branches that
do not fire are the 10 explained by D165's lexicon gap and the 4 explained by the disclosed
negator-initial-name residual; both are pinned, neither is new.

**Mutation test, my own harness — 4/4 load-bearing, each breaking NAMED cases**, every mutation
applied to an in-memory string and a temp copy only, `index.ts` sha256 asserted before and after
each and at the end.

---

### Claims that need correcting

1. **Postscript correction 1: "on the verifier's corpus, run26 vs 4476c92 is truthful-destroyed 4
   vs 21 (better) AND, after FIX-G, fabrications-missed 0 vs 0 (equal)."** The truthful half is
   consistent with what I measure. **The fabrication half is FALSE outside the corpus it was
   measured on** — on mine the candidate misses **15** fabrications `4476c92` catches (10 D163 +
   5 D164) — **and it is irreconcilable with the Evidence line in the same postscript**, which
   reads *"collateral 0/75 truthful destroyed & 4/50 fabrications missed."* Zero and four cannot
   both describe this candidate's fabrication axis without naming which corpus each belongs to,
   and neither statement names a corpus size next to its number. **This is the sixth consecutive
   campaign on this claim shape, and the first where the postscript contradicts itself.** A
   collateral figure must carry, in the same sentence: the SHA compared against, the corpus size,
   the direction, and the shape the *new* change put at risk — which for FIX-G is a clause where a
   modal governs one predicate and a perfect passive follows, and for FIX-F is a positive
   evidential clause after a subordinator.
2. **"D162a … 5/5 fabrications recovered"** is true as far as it goes, but it is reported as the
   closure of D162a, whose stated root cause was that the guard *"never checks that the modal
   governs the completion verb."* **Deleting one alternative does not anchor a guard.** The
   correct statement is: *the copular reach is removed (12/12); the guard remains unanchored and
   still swallows `modal + verb + one-token-name + perfect passive` (D163).*
3. **`run26`'s `fixEModalHedgeGuardPresent` is a BYTE pin on `(?:[a-z]+\s+){0,2}?`** — the very
   construct that has to change for D163 to close. Its sibling four lines above
   (`evidentialTestRunsOnTheLastLinkerDelimitedSegment`) was deliberately written after #26 asked
   for *"the last-segment property stated as a PROPERTY rather than as bytes so a correct fix does
   not fail its own contract."* **The same treatment was not given to the guard pin**, and it is
   now the only battery failure produced by an otherwise-clean fix. Restate it as a property
   (*"the modal guard exists and admits only hedging material between the modal and the perfect
   passive"*).
4. **`run26`'s D161 `[CONTRACT]` block is scoped so it cannot fail.** Its header says *"hedges
   survive in BOTH directions of the {0,2} window"*; the six fabrication cases beneath it all use
   a two-token name and `was`, and the single window probe is the 3-word (closed) end. A corpus
   that can only pass is a decorative contract — the class this ledger has logged at #61/D2,
   #63/D10, #63/D12, #64/D19 and #86/D162c. Add the one-token perfect-passive shape.
5. **"battery 32 files (31 executable + helper) / 0 failures (run15 57/0, run25 retired, run26
   added)."** **TRUE, and re-derived exactly.** Correction 5 landed; the number is now honest for
   the first time in four campaigns. Corrections 3 (D158d in the residual list), 4 (run26 header
   pinned at this sha; grep for the prior sha and for "MISSED here" both return 0) and 6 (the
   variable-length-lookbehind retraction, with a working detector pinned TRUE) **also landed and
   are re-verified here.**
6. **"deno check: run here via `npx deno@2` = 23 == baseline."** **NOT RE-DERIVED — `BLOCKED`.**
   No `deno` on this machine's PATH, and this session cannot invoke `npx deno@2` or any TypeScript
   compiler. Recorded as a coverage gap, not a confirmation — the **fourth** campaign running. The
   postscript is honest that #26 could not confirm it either. Practical weight remains low and is
   partly discharged from the other side: both changed regex literals construct and execute under
   V8 here (the same engine Deno runs), no modifier group is shipped, and the specific TS2532 the
   `?? ''` was added for is compile-time only — the runtime property it stands for
   (`split().pop()` never yields `undefined`) is proven by 20,000 fuzzed strings with 0 throws.
7. **Ledger #86's question-belt figure (7,995 bytes / `394e7666d501f8f1`)** is not reproducible.
   See above — the invariant holds, the number does not travel.

### Verified, and worth keeping

`qa/verification/proposed/v27_regression_additions.mjs` — **146 pass, 15 fail on this candidate:
15 `[DEFECT]` reproductions (10 D163 + 5 D164), 0 `[RESIDUAL]` moves, 0 `[CONTRACT]` failures.**
Every guarantee this candidate genuinely provides holds; both new defects reproduce. **On
FIX-H + FIX-I it goes to 159/2**, the 2 being the two D164 `[RESIDUAL]` pins moving in the GOOD
direction (FIX-I closes the pre-existing plain-name half as well, so they must be re-pinned
closed in the promoting commit), **with the whole battery green except `run26`'s
`fixEModalHedgeGuardPresent` byte pin, which has to move with the fix (item 3 above).** It carries
the FIX-F corpus in both directions with paired name-internal-linker controls, the FIX-G copular
corpus and the D161 hedge corpus, a 20,000-case degenerate-span fuzz, the D163/D164
reproductions with their three paired controls each, the 34-case prior-belt-closure matrix, the
16-case matcher closure matrix, the byte-identity and behaviour of the question belt, the
176-case founder-directed lexical branch, eighteen pinned `[RESIDUAL]` assertions (including D165,
the lowercase-name-with-`and` case, and the pre-existing linker-free half of D164) and seven source invariants (no modifier group, `|be` gone, the
FIX-F name guard present WITH its `(?:^|\s)` anchor, the null-safe leading pop, the FIX-C
lookbehind chain still absent, the belt const set, and a working
variable-length-lookbehind detector asserted TRUE rather than FALSE).

---

### FIX-H — measured, one line, and it ANCHORS the guard instead of shrinking it

Replace the guard's `(?:[a-z]+\s+){0,2}?` — which admits an arbitrary subject — with a hedging
lexicon, so the modal can only be separated from the perfect passive by material that is part of
the hedge. No new `const`, no lookbehind, no modifier group, still one statement.

```
-  && !/\b(?:may|might|could|can|would|should)\s+(?:[a-z]+\s+){0,2}?(?:have been|has been|had been)\b/i.test(c)
+  && !/\b(?:may|might|could|can|would|should)\s+(?:(?:not|never|also|already|just|now|still|well|very|quite|really|truly|indeed|perhaps|possibly|probably|conceivably|previously|recently|actually|certainly|definitely|surely|maybe|in|fact|and|or|by|then|somehow|otherwise)\s+){0,3}(?:have been|has been|had been)\b/i.test(c)
```

Measured on the candidate vs the identical candidate with only that replacement: **D163 0 → 10 of
10 recovered, D161 hedges 15 → 15 still survive (the 16th was already destroyed before the fix, at
`4476c92` too), D162a 12 → 12 still caught, D162b 12 → 12 still survive, D164 unchanged, and
`run15`/`run16`/`run17`/`run18`/`run19`/`past_completion_claim_regex`/`source_invariants_drift_guard`
all still green.** The one battery casualty is `run26`'s byte pin (item 3), which must be restated
as a property in the same change.

### FIX-I — measured, one line, and it asks WHOSE evidential it is

The evidential only subordinates the completion when its subject is the NEGATED noun phrase. A
determiner-led subject introduced between the negator and the evidential is a new positive clause.

```
-  || /\b(?:show(?:s|ed)?|…)\b/i.test((c.slice(n, m.index).split(/…/i).pop() ?? '').split(/…/).pop() ?? '')
+  || /^(?!.*\b(?:the|a|an|this|that|these|those|our|its|his|her|their|my|your)\s+\w+\s+(?:show|prove|indicate|say|state|record|confirm|establish|suggest|report|mention|note)\w*\b)[^]*\b(?:show(?:s|ed)?|…)\b/i.test((c.slice(n, m.index).split(/…/i).pop() ?? '').split(/…/).pop() ?? '')
```

Measured: **D164 0 → 5 of 5 recovered, and the pre-existing linker-free half 0 → 2 of 2 recovered
as well; D156/D162b 12 → 12 still survive** (including `No system record confirms Delta Ltd was
renamed.`, `No evidence though shows the approval was granted.`, `No entry although it is old
notes Delta Ltd was archived.` and `No record of the audit shows ACME was archived.`, which arm 4
carries), **D160 and D160b still caught, `run26`'s `evidentialTestRunsOnTheLastLinkerDelimitedSegment`
byte pin still satisfied** (the split expressions are untouched), and the whole battery green.

**Both together: `v27_regression_additions.mjs` 146/15 → 159/2** (two `[RESIDUAL]` pins to re-pin
closed), **battery green except the one `run26` byte pin, `index.ts` byte-identical outside those
two lines.** Neither introduces a regexp construct the file does not already ship. FIX-I does add
a negative lookahead, which the file already uses elsewhere and which is fixed-width-free but
lookAHEAD, not lookbehind — no ES2018 dependency beyond what is already shipped.

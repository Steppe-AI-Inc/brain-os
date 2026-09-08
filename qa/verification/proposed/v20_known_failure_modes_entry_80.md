## #80 — verifier #20, independent verification of the run19 D134–D138 + D131/R9b closure (`f27f6b7` / `b32e0e4`)

**Candidate:** `b32e0e48566934741093ad3407f093fc1aa8b01b` (closure commit `f27f6b7`; the rotation
commit on top touches only `qa/verification` bookkeeping — verified by diff, `git diff f27f6b7
b32e0e4 -- supabase/functions/sem-ai-command/index.ts` is empty).
**index.ts sha256:** `6407d95cc846e638d1229559b2622323072028876c8844ce2b1045eade050a6c`,
asserted before the run, after every temporary source mutation, and at the end. The
implementation tree was never written to (`git status --porcelain supabase/` empty throughout).
**Baselines for every comparison, each extracted from git by my own extractor:** `d34af15`
(the #79 candidate), `fbafded` (#78), `a559f8f`, `9535f0b` (#77), `52e830f` (#76), and
pre-negation `d724d8c`.
**Verdict: FAIL** — **two P1 regressions**, one P2 pre-existing gap, one P3 coverage loss, plus
one overstated residual count. D132, D133, D134, D135, D136, D137 and D138's own shape are
genuinely closed. This is the **ninth consecutive change to this drift belt and the seventh to
close one direction by reopening another** — and this time it reopened *both* directions at once.

**Production, read-only, re-derived myself (not carried forward from #79):**
`npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk` → `sem-ai-command` is
**version 92, ACTIVE**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at`
1788239725518. Byte-identical to what #75–#79 recorded, so **nothing has been deployed since**
and **none of D58–D144 is live**. Everything below concerns a candidate branch, not what the
founder is running today. (`ezbr_sha256` is a deployed-bundle hash and is not comparable to an
index.ts source hash.)

### D139 (P1, NEW IN THIS CANDIDATE) — R9b's auxiliary arm destroys the ordinary zero-relativizer truthful negative

R9b added a third disjunct to `completionIsNegated` (index.ts:5551):

```
return n >= m.index || /\b(?:that|which|who|whom)\b/i.test(c.slice(n, m.index)) || !NEGATION_AUX.test(c.slice(0, n));
```

The last term encodes "if a finite auxiliary already occurred before the negator, the negator
belongs to a subordinate clause and does not scope over the completion verb." English does not
work that way. **"There is no record ACME was archived."** is the ordinary zero-relativizer
complement clause — `is` is the matrix auxiliary, `no` is the matrix negator, and it scopes over
everything. The rule reads it as an asserted completion, the belt fires, and `legacyProseFallback`
(index.ts:5739) **replaces the founder's correct answer** with *"I can't actually do that from
chat — nothing was changed. Please use the relevant page in the app…"* — a mutation refusal
returned to a read-only question. That is the D112 class again, in the direction index.ts's own
comment (5502-5512) calls the worse one.

Measured on my own 75-case truthful-negative corpus (real names, names containing completion
words, names beginning/ending with a negator, names with digits/parentheses/colons):
**18/75 destroyed, and all 18 survive at `d34af15`, `fbafded`, `a559f8f`, `9535f0b` and
`52e830f`.** Only pre-negation `d724d8c` also destroys them. Independently re-derived a second
time with a freshly written harness and a **hand transcription** of index.ts:5524-5551 (0
mismatches against the extracted predicate): 11/12 destroyed on a clean probe set, with both
control groups — the same sentences carrying a relativizer, and the same sentences with a
non-auxiliary lead-in — correctly surviving, which isolates the aux arm as the sole cause.

The founder-directed lexical scenario makes the reach concrete: for a real company name built
around **each of the 24 canonical completion words** (`Archived Media Group`, `Deleted Scenes
Studio`, `Restored Furniture Co`, `Closed Loop Systems`, …), `"There is no record <Name> was
archived."` is destroyed for **24 of 24**. `"<Name> was not archived."` still survives for all
24, so the regression is precisely the zero-relativizer shape, not negation generally.

Mutation proof: reverting only that arm (`!NEGATION_AUX.test(...)` → `true`, i.e. back to
run18) flips exactly these cases and nothing else on the targeted probe set.

### D142 (P1, NEW) — D138's label strip erases the founder's own command verb and arms the destructive field

D138 made the contradiction check ignore words inside the matched option's name
(index.ts:2713-2715):

```
const commandForContradiction = matchedOption && typeof matchedOption.label === 'string'
  ? command.replace(new RegExp(escaped(matchedOption.label), 'ig'), ' ') : command;
```

The strip is **unconditional**. When the label *is itself* an opposite-family command verb — a
company named **"Restore"**, **"ReStore"** (a real chain), "Unarchive", "Archive", "Delete" —
the strip removes the founder's only expressed intent, `commandContradictsActionType` sees an
empty command, and the reply **binds**. Concretely, against a pending **archive** disambiguation
whose options include a company named "Restore", the founder typing `restore` — a restore
command — arms **`archiveCompanyIds`**: a destructive mutation on the exact opposite intent,
with no LLM in the loop. `d34af15`, `fbafded` and `9535f0b` all return `null` here. Five shapes
reproduce (`restore`/`ReStore`/`unarchive` on a pending archive; `archive`/`delete` on a pending
restore).

This is the D116/D123/D127 wrong-destructive-bind class, and the fix is already written **in
this same commit**: D136 dead-ends the ordinal path when a reply is genuinely ambiguous between
a reference and a real name ("option 2" with a company named "Option 2 Ltd"). The identical rule
was simply not applied to the label path. Everything D138 was built for still works — a real
name *containing* a verb ("Restored Furniture Co", "Unarchived Records Ltd", "Reactivated Metals
LLC") remains selectable, and a real opposite verb *outside* the name ("restore Restored
Furniture Co") still dead-ends — so a fix does not have to trade D138 away.

### D141 (P2, PRE-EXISTING at every SHA — a gap, not a regression) — the negator lexicon

`NEGATED_CLAUSE` lists `not|never|no|nothing|none|pending|awaiting|…` and has **no `nobody`,
`neither`, `nowhere`, `nor`, `few`, `hardly`**. So `"Nobody was assigned to that task."`,
`"Neither company was archived."`, `"Nor was the Fleet unit deleted."` and `"Hardly anything was
archived."` are all read as completions and destroyed. Worst of these:

> "The company was not archived, nor was it deleted."

The comma splits off `"nor was it deleted"`, whose negator is not in the list, so a sentence that
is negated **twice** reads as a completion. Verified destroyed at **all seven** revisions
(`d724d8c`, `52e830f`, `9535f0b`, `a559f8f`, `fbafded`, `d34af15`, candidate) — no verifier has
pinned it before. Every belt generation has tuned the *scope* rule while the *lexicon* it
depends on went unexamined.

### D144 (P3, NEW) — one fabrication d34af15 caught and this candidate misses

> "ACME is archived, and I also deleted Beta Corp."

Caught at `d34af15`, missed here. R9b's and/but boundary only fires before a **lowercase
non-auxiliary** token, so `", and I also…"` is split by the comma alone; clause 1 is present
tense (D137 deliberately removed it from the progressive arm) and clause 2 is a bare participle
with no auxiliary, so `LEGACY_PAST_COMPLETION` matches neither. The net fabrication residual on
my 50-case corpus is therefore **7, not 4**.

### D140 (P3) — the residual count is honestly *labelled* but numerically overstated as an improvement

The ledger and `run19_defect_closure_contract.mjs` describe the remainder correctly as *"a
documented residual, disclosed not proven-irreducible"* — that wording is **true and is an
improvement over run18's "irreducible"**, and the "0 real names destroyed, 0 new false positives"
claim is properly scoped to "the verifier's 61-case corpus". Two caveats belong on the record:

1. **"9 → 4" understates the real residual.** Four is the count *within run18's pin set*. On an
   independent 50-case fabrication corpus the candidate misses **7**, one of which (D144) is a
   *new* miss the pin set cannot see. A residual measured only against the pins it was tuned on
   is not a measure of the residual.
2. **The remaining 4 are not "genuinely hard" either.** I measured a name-safe clause-linker
   rule (R-ZR2): **0/75 truthful destroyed, 0 fabrication coverage lost, all 5 D131-separable
   fabrications still caught, all 9 paired real names intact.** Adding an idiom rule (R-IDIOM)
   catches **2 of the 4** remaining pins ("No problem — ACME was archived.", "Not to worry —
   ACME was archived.") with **0 collateral**. So the residual is 2, corpus-relative, not 4 and
   not a property of the code. The same lesson as run19's own — "proven irreducible is a claim
   about all possible rules, so it needs a search, not an example" — applies one generation on.

### Also found

* **`safeOptionLabel` returns `null` for a real name that begins with a completion word** —
  "Archived Media Group", "Deleted Scenes Studio", "Confirmed Freight Ltd", "Done Deal Trading"
  are **suppressed as option labels entirely**, so the option cannot be shown to the founder.
  Identical at `9535f0b`, `fbafded`, `d34af15` and the candidate — **pre-existing, not a
  regression** — but it means D138 closed only the *matcher* half of "a real name contains a
  lifecycle verb"; the *rendering* half is still open, and a company literally cannot appear in
  its own disambiguation list.
* **Vacuous guard (harmless):** `ordN <= options.length` (index.ts:457) is fully subsumed by the
  `options[ordN - 1]` truthiness test beside it — removing it changes nothing across 27
  out-of-range probes on 1-, 2- and 3-option lists. This is the ledger's own recorded
  vacuous-guard class; noted so it is not mistaken for coverage.

### Verified genuinely closed / not reopened

* **D132 — closed, and the guard is load-bearing.** Removing the `hasOwnProperty` guards makes
  `matchDisambiguationOption` throw `TypeError` on **15 of 15** prototype-key probes
  (`constructor`/`__proto__`/`toString`/`valueOf`/`hasOwnProperty` × actionType/entityType/both),
  while the shipped code returns a normal result. `resolveClarificationField` returns `undefined`
  for all 16 prototype-key combinations and never throws. (My first mutation pass wrongly called
  this guard vacuous — that was **my own probe gap**, corrected by feeding prototype-key options
  to the mutant; recorded here so the correction, not the wrong first answer, is what carries.)
* **D133 — closed.** Ordinal-only replies (`option 2`, `#2`, `number 2`, `the second one`, bare
  `2`) select in range against 1-, 2- and 3-option lists; out-of-range binds nothing; `acme 2`
  still dead-ends (D129 preserved); the option's own number is clean, another's is not.
* **D134, D135, D136, D137, D138's own shape — closed**, each re-derived against the shipped
  predicates rather than accepted from the suites.
* **Question belt untouched** — 0 drift across `b32e0e4`, `d34af15`, `fbafded`, `9535f0b`,
  `52e830f` on 23 question shapes, and no hunk of the code diff touches it.
* **D112/D116/D117/D118/D119/D123/D124/D126/D127/D128/D129** contracts re-derived independently
  and holding; `run15`–`run19` closure suites re-run from the filesystem, 0 output-text failures.

### Full battery (re-run from the filesystem, not from any claim)

**31 `.mjs` suites: 0 output-text failures, 0 nonzero exits.** Of these, **7 assert nothing**
(`_gate_extract.mjs` is a library; `claim_segmentation_and_present_tense_fp`,
`d3_past_completion_gate_not_shortcircuited_by_pending_action`,
`issue5_confirmation_action_type_binding`, `mixed_claim_grounding`,
`past_completion_gate_behavior`, `per_resource_grounding_contract` are SUPERSEDED stubs). The
**60 `*.sql` suites were NOT run** — they need a live DB session and this campaign has no
production write authority; the change under test is pure Edge-Function source.

**The battery is green and both P1s are real.** No suite in the repository exercises the
zero-relativizer truthful-negative shape, and none feeds a prototype-key or verb-shaped option
label through the resolution branch. A green battery is evidence about the battery.

### Regression tests added

`qa/verification/proposed/v20_regression_additions.mjs` — **102 cases**, CONTRACT/DEFECT
convention, ANY failure exits nonzero, own extractor, resolving index.ts as
`../../../supabase/functions/sem-ai-command/index.ts`. On this candidate: **72 pass, 30 fail —
all 30 are DEFECT cases reproducing D139 (16), D142 (5), D141 (8) and D144 (1) by design, and
0 CONTRACT failures**, i.e. every guard I pinned genuinely holds. It drives the REAL
`readsAsCompletion`, the REAL `matchDisambiguationOption`, the REAL contradiction guard and the
REAL field resolution, so a mis-bind is reported as the destructive field it actually arms.

**No fix applied — no write authority on the implementation branch; index.ts restored
byte-identically (`6407d95c…`, asserted at the end).** The measured direction for D139 is to
drop or narrow the auxiliary arm (reverting it alone restores all 18 without touching the
relativizer arm or the trailing-negator rule); for D142, to apply D136's own ambiguity dead-end
to the label path — dead-end when the stripped label leaves the command empty *and* the raw
command is an opposite-family verb.

**Lesson.** R9b was adopted because verifier #19 measured it — which was right — but it was
adopted as a *rule* when what had been measured was its *score on one 61-case corpus*. Its third
disjunct was never separately probed against the shape it breaks, because no corpus in the
repository contained that shape. The rule this generation adds: **a disjunct added to a guard
needs its own adversarial corpus, not a share of the corpus that motivated the guard** — a
three-term rule that scores well overall can still have one term that is simply wrong, and
averaging hides it. And a second, from D142: **when a fix strips founder input to protect a
name, prove the strip cannot remove the founder's own verb** — the same commit already knew that
lesson on the ordinal path and did not carry it one function over.

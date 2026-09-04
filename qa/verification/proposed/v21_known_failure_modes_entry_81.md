## #81 — verifier #21, independent verification of the run20 D139/D141/D142/D144 closure (`54ebecc` / `0ba51a1`)

**Candidate:** `0ba51a1cc858d565b1166e0909e93f54f92b17ce` (closure commit `54ebecc`; the campaign
rotation commit on top touches only `qa/verification` bookkeeping — verified by diff, `git diff
54ebecc 0ba51a1 -- supabase/functions/sem-ai-command/index.ts` is empty).
**index.ts sha256:** `c45593237dc1862f530e223b6399b47a4c5a0d536c77aa01a9ac3d4937377dc2`,
asserted at preflight, after every in-memory mutation, and at the end. The implementation tree
was never written to (`git status --porcelain supabase/` empty throughout; the mutation harness
mutates a STRING and re-asserts the on-disk hash itself).
**Baselines, each extracted from git by my own extractor:** `b32e0e4` (the #80 candidate),
`d34af15` (#79), `9535f0b` (#77), `52e830f` (#76).
**Verdict: FAIL** — **two P1s** (one brand-new truthful-answer destruction, one P1 the closure
claims to have closed and has not), **two P2s**, plus a **false battery claim** that hid 57
disabled assertions. D139's headline shape, D141's own truthful negatives, D144's headline
fabrication and D142's five bare-verb shapes are all genuinely closed. This is the **tenth
consecutive change to this drift belt and the eighth to close one direction while opening
another.**

**Production, read-only, re-derived myself:** `supabase functions list --project-ref
pvphxgrtdfrudejjhzjk` → `sem-ai-command` **version 92, ACTIVE**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at`
1788239725518 — byte-identical to what #75–#80 recorded. **Nothing has been deployed; none of
D58–D149 is live.** Everything below concerns a candidate branch, not what the founder runs
today. Nothing was written to production.

**Method note.** Every measurement below drives the REAL shipped predicates, sliced out of
index.ts by an extractor I wrote for this campaign (`readsAsCompletion` /
`completionIsNegated` from `const LEGACY_PAST_COMPLETION` to `const legacyProseFallback`; the
disambiguation branch re-composed from `matchDisambiguationOption` +
`commandForContradiction` + `contradicted` + `resolveClarificationField`, so a mis-bind is
reported as the destructive field it actually arms). The extractor was cross-checked against a
**hand transcription of `completionIsNegated` (index.ts:5491–5573)** over **444 inputs with 0
disagreements** before any number below was believed. `run20_defect_closure_contract.mjs` and
`v20_mutation_proof.mjs` were re-run but not relied on — they are the implementing session's.

---

### D145 (P1, NEW IN THIS CANDIDATE) — D144's active-voice arm destroys ordinary non-assertive prose

D144 added an active-voice arm to `LEGACY_PAST_COMPLETION` (index.ts:5398):

```
|\b(?:i|we|they)\s+(?:just\s+|already\s+|then\s+|also\s+|now\s+|recently\s+|successfully\s+)*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\s+\S
```

It carries **no assertion-position constraint**. `I/we/they + <past lifecycle verb> + <object>`
occurs constantly in prose that claims nothing: an echoed question, a subordinate clause, a
conditional, reported speech. Every one of those now reads as a completion claim, and on an
ordinary ungrounded read-only turn `legacyProseFallback` (index.ts:5761–5771) **replaces the
reply** with *"I can't actually do that from chat — nothing was changed…"* — a mutation refusal
returned to a question, and itself false. That is the D112/D128/D139 class, in the direction
index.ts's own comment (5466-5468) calls the worse one.

**12 of 15** realistic replies are destroyed, and **none of the 12 is destroyed at `b32e0e4`,
`d34af15`, `9535f0b` or `52e830f`** — this defect exists only on this candidate. Proven
end-to-end through the shipped gate block, not just as a predicate boolean:

| model draft (ordinary read-only turn) | founder actually sees |
|---|---|
| `You asked whether I archived ACME. I did not.` | *I can't actually do that from chat — nothing was changed…* |
| `Are you asking whether I deleted Beta Corp?` | *I can't actually do that from chat — nothing was changed…* |
| `I can check whether they archived it, if you want.` | *I can't actually do that from chat — nothing was changed…* |
| `The founder asked if we archived ACME.` | *I can't actually do that from chat — nothing was changed…* |
| `If I archived it by mistake, tell me and I will restore it.` | *I can't actually do that from chat — nothing was changed…* |

`Are you asking whether I deleted Beta Corp?` is a **clarifying question** — one of the
gold-standard shapes `sem_ai_command_past_completion_claim_regex.mjs` exists to protect. The
belt now eats it.

The assertive form the arm was built for is unaffected and must stay caught: `I deleted Beta
Corp.`, `We archived ACME.`, `I just archived ACME.`, `I successfully deleted the company.`,
`ACME is archived, and I also deleted Beta Corp.` (the D144 headline) — 10/10 still caught, and
the negated active forms (`I archived nothing.`) still survive. **Mutation proof:** removing the
arm flips `Are you asking whether I deleted Beta Corp?` to survive *and* flips the D144 headline
to escape — the arm is doing both jobs, which is precisely the problem. A fix has to constrain
the arm to a main-clause assertion (index.ts already has the machinery:
`FIRST_PERSON_MAIN_CLAUSE_COMPLETION` at 5003 carries exactly the lookbehind discipline this arm
lacks), not be reverted.

### D148 (P1) — D142 is NOT closed: the dead-end is corpus-fitted to a bare one-token reply

The new dead-end (index.ts:2725-2731) requires

```
&& commandForContradiction.trim().length === 0
```

i.e. it only fires when the label strip leaves the command **completely empty** — a reply that is
*exactly* the one word. Anything a founder actually types alongside the verb (a full stop, an
exclamation mark, "please", "it", "that", "yes", an object noun) leaves a residual, the dead-end
never fires, `cleanSelection()` still accepts the reply as a clean selection because every
residual word is selection filler, and **D138's unconditional label strip still erases the
founder's own verb before `commandContradictsActionType` ever sees it**. The root cause D142
named is untouched.

Pending **archive** disambiguation, one option a company literally named **"Restore"**, founder
means the verb:

| reply | shipped result |
|---|---|
| `restore` | dead end ✓ (the one shape the fix covers) |
| `restore.` | **arms `archiveCompanyIds`** |
| `restore!` | **arms `archiveCompanyIds`** |
| `restore it` | **arms `archiveCompanyIds`** |
| `please restore` | **arms `archiveCompanyIds`** |
| `restore that` / `restore this one` / `yes restore` / `restore, please` / `ok restore it` / `restore the company` | **arms `archiveCompanyIds`** |

**10 of 11 ordinary phrasings still archive the company the founder asked to restore, with no
LLM in the loop.** Mirror direction (pending restore, option named "Archive"): 4 of 6.
Across the lineage: **`d34af15` 0/11, `9535f0b` 0/11, `52e830f` 0/11, `b32e0e4` 11/11,
candidate 10/11.** The closure moved the number by one.

Note the substitution: **#80's measured direction was "dead-end when the stripped label leaves
the command empty *and* the **raw command** is an opposite-family verb."** The implementation
kept the empty-command requirement but swapped the second half to "*and the **label*** is a bare
opposite-family verb". The label test is right; keeping the empty-command test is what fits the
fix to a single sentence.

**Measured fix direction (prepared, NOT applied — no write authority on the implementation
branch).** When the option's label *is itself* a bare opposite-family verb, do not strip it at
all — run the contradiction check on the RAW command. Measured on the shipped bytes with the
change applied in memory: `please restore` / `restore it` / `restore.` / `please archive` all
dead-end (4/4 closed); **D138 fully preserved** — `Restored Furniture Co` and `Unarchived
Records Ltd` still selectable by their own names, `restore Restored Furniture Co` still dead-ends
— and a company literally named "Restore" **remains selectable by ordinal** (`option 1`), so
nothing becomes unreachable. Evidence: `qa/verification/proposed/v21_mutation_proof.mjs`, section
"MEASURED FIX DIRECTION for D148", 8/8.

### D146 (P2) — R-ZR2's linker terms destroy the very shape D139 is about

The new fourth disjunct (index.ts:5573) treats `and|but|or|so|yet` (after a lowercase token) and
`because|since|although|though|while|after|before|however|therefore` as clause linkers. Half
those terms are not clause linkers in the position that matters:

* **`or` / `and` coordinate a NOUN PHRASE inside the negated existential.** *"There is no record
  **or evidence** ACME was archived."* — `record or` matches the coordinator test, the negation is
  discarded and the true answer is destroyed. Same for `no log or ticket`, `no note or memo`,
  `no record or log entry showing`.
* **`before` / `after` / `since` are PREPOSITIONS in a temporal modifier.** *"There is no record
  **before** ACME was created."*, *"There is no activity **since** the company was created in
  2019."*
* **only the FIRST negator is considered**, so *"There is no entry **since/because** nothing was
  archived."* — negated twice — reads as a completion.

**12 truthful negatives destroyed on this candidate; all 12 survive at `d34af15` and `52e830f`.**
This is the same defect class #80 named — *a rule widened without an adversarial corpus for the
term it adds* — recurring **inside the fix written for it**. `and`/`but`/`because`/`although`/
`however`/`therefore` are the terms that earn their place (the coordinated and subordinated
fabrications they catch are all still caught); `or`, `so`, `yet`, `before`, `after`, `since`,
`while`, `though` were added without a case for or against them.

D139's own headline is genuinely closed, and I confirmed it across the full lexical branch:
`"There is no record <Name> was archived."` for a real company name built on **each of the 24
canonical completion words** — **0/24 destroyed** (24/24 destroyed at `b32e0e4`) — plus
name-internal coordinators (`Salt and Pepper Co`, `Bed Bath and Beyond`, `Barnes and Noble`,
`Procter and Gamble`) and em-dash place names (`Ulaanbaatar — Sansar Branch`,
`Erdenet – Nomin Center`), all surviving. The name-safe lowercase-token rule works.

### D147 (P2) — D141's added negators create five NEW fabrication-disarm vectors

`completionIsNegated`'s third disjunct disarms any clause whose negator has no finite auxiliary
before it — i.e. **a clause-initial negator always disarms**. Every word added to
`NEGATED_CLAUSE` therefore widens that hole. The five new words do exactly that:

> `Few issues remained and ACME was archived.` · `Hardly anything else changed and ACME was
> archived.` · `Nobody objected and ACME was archived.` · `Neither of us hesitated and ACME was
> archived.` · `Nowhere else changed and ACME was archived.`

All five **ship the fabrication uncorrected on this candidate and are caught at all four
baselines.** The closure commit reports *"fabrications missed 6/50 (was 7 — D144 caught one
more, **zero new misses**)"*. There are five new misses; the 50-case corpus predates the words
that create them. This is #80's own D140 lesson — *a residual measured only against the pins it
was tuned on is not a measure of the residual* — one generation on.

D141's purpose is genuinely served: `Nobody was assigned to that task.`, `Neither company was
archived.`, `Nowhere in the record was the company deleted.`, `The company was not archived, nor
was it deleted.`, `Few tasks were completed this week.`, `Hardly any goals were completed.` all
survive (7/7), and mutation-reverting the lexicon destroys them again. The lexicon is right; the
disjunct-3 hole it feeds is what needs the guard.

### D149 (P2) — the closure silently disabled its own regression suite, and recorded it as pre-existing

`run15_defect_closure_contract.mjs:121` pins the product literal
`"(?:not|never|no|nothing|none|pending|awaiting"` and **throws** rather than report on a slice
that is not the product — correct discipline. D141 inserted `nobody` after `no` and did not
update the pin, so **run15 now throws and its 57 assertions never run**: D113 (canonical label
replacement), D114 (question belt), **D116 and D123 (the wrong-entity DESTRUCTIVE bind guards)**,
D117/D118 (per-clause negation), D119, D122.

* At `b32e0e4`: run15 = **57 pass, 0 fail**. On the candidate: **exit 1, 0 assertions run.**
* Re-run on the candidate with only the pin literal relaxed: **57 pass, 0 fail** — so the
  *contracts* still hold; what was lost is the *coverage*, silently.
* The closure commit and `CURRENT_CAMPAIGN.json` both record this as *"run15 exit-1 is the
  **pre-existing** superseded stub"*. It is neither pre-existing nor a stub. A regression suite
  that stops running is the only thing standing between this belt and its next reopening, and it
  was written off in one parenthesis.

### Same-class search (D145's design error, everywhere else in the belt)

D145's root cause is *a lexical arm with no assertion-position constraint*. Searching the rest of
`readsAsCompletion` for the same error: **every arm has it, at every SHA.** Each of these is a
question, a conditional or reported speech, and each makes `readsAsCompletion` return `true`
identically on the candidate, `b32e0e4` and `d34af15`:

> `Was ACME archived last year?` · `Was the company archived successfully?` · `If ACME was
> archived, tell me when.` · `You said ACME was archived — the record disagrees.` · `Are you about
> to archive ACME, or should I wait?` · `You said you were going to archive it — did you?` ·
> `Did you think I am archiving it right now?` · `Am I processing the request correctly?`

So the belt has **no interrogative / conditional / subordinate guard at all** — while the
question belt one screen away *does* (`INTERROGATIVE_LEAD`, index.ts:4987;
`FIRST_PERSON_MAIN_CLAUSE_COMPLETION`, index.ts:5003). The machinery exists in this same file and
was never applied to `readsAsCompletion`.

**This is pre-existing and is NOT a regression in this candidate** — recording it because it is
the class D145 belongs to, and because it explains why D145 happened: D144 did not introduce a
new blindness, it made an existing one reachable through *first-person prose*, which a model
writes constantly. Fixing D145 by bolting a lookbehind onto one arm would leave the class open;
the guard belongs at the `readsAsCompletion` clause level, once, for every arm — the same
"one predicate, both arms" discipline run13/D100 already imposed on this function.

### Also found / re-derived

* **`safeOptionLabel` suppresses 20 of 24 real names built on a completion word** — `Archived
  Media Group`, `Deleted Scenes Studio`, `Approved Auto Parts`, `Confirmed Logistics Co` … all
  render as `null`, so the option cannot be shown to the founder at all. Identical at `b32e0e4`,
  so **pre-existing, not a regression** — but #80 recorded it and this closure did not address
  it. D138 still closed only the *matcher* half of "a real name contains a lifecycle verb"; the
  *rendering* half is open, and a company literally cannot appear in its own disambiguation list.
* **`extractGateSlice()` in `qa/scenarios-runner/_gate_extract.mjs` is dead against this
  source.** It anchors on `if (claimsPastCompletionWithNoGrounding)`, which no longer exists (the
  block is `if (rewriteFromStructure) { … } else if (legacyProseFallback) { … }`). It throws. The
  three suites importing it are all SUPERSEDED stubs that exit before calling it, so nothing goes
  red — but the shared helper the repo advertises as "the only way a harness can catch a false
  positive" cannot currently extract the gate.
* **`commandContradictsActionType`'s own `actionType || 'archive'` (index.ts:242) is a
  conservative default and is NOT the forbidden field default** — it makes an unknown pending
  action treat a restore verb as a contradiction. The field-default source invariant is intact at
  both call sites (2735 and 2687): `resolveClarificationField(…, matchedOption.actionType)` with
  no `|| 'archive'`, and `resolveClarificationField` returns `undefined` for an absent
  actionType. Verified behaviourally (3/3 fail-closed) and as a source assertion.

### Verified genuinely closed / not reopened

* **D139's headline shape — closed.** 0/24 completion-word names destroyed, 0/6 coordinator and
  em-dash names destroyed, and the genuine linked fabrications (`There were no errors and ACME
  was archived.`, `… but …`, `… although …`, `… however …`) all still caught (5/5).
* **D142's five bare-verb shapes — closed** (`restore`/`ReStore`/`unarchive` on a pending
  archive, `archive`/`delete` on a pending restore all dead-end), with **D138 preserved** (real
  names containing a verb still selectable, with filler; a real opposite verb outside the name
  still dead-ends).
* **D144's headline fabrication — closed** (`ACME is archived, and I also deleted Beta Corp.`),
  and **`PAST_COMPLETION_CLAIM_PATTERN` (index.ts:4737) was left alone** — confirmed by diff, the
  active arm is in `LEGACY_PAST_COMPLETION` only.
* **D137 — not reopened**: `test3 is archived. Should I restore it?` and `ACME is archived but was
  not deleted.` both survive.
* **D112 / D116 / D118 / D123 / D125 / D128 / D129 / D130 / D131 / D132 / D133 / D134 / D136** —
  each re-derived against the shipped predicates in `v21_regression_additions.mjs`, all holding
  (0 CONTRACT failures out of 92 passing assertions).
* **Question belt untouched.** The `safeQuestionFragment` region is **byte-identical
  (`95332b5c434abab3`, 9389 bytes) at all five SHAs**, no diff hunk touches it, and its behaviour
  is identical across all five SHAs on every probe. (Two of my seven probes were mis-specified —
  the belt scopes to the last question clause, so a completion in an earlier sentence is
  correctly irrelevant; recording that as my error, not a product finding.)

### Full battery (re-run from the filesystem)

**31 `.mjs` suites discovered on disk** (32 files including `_gate_extract.mjs`, which is a
library, not a suite). **25 assertion-bearing, 0 output-text failures across every suite that
runs. 1 nonzero exit: `run15_defect_closure_contract.mjs` — which is D149, and is an
assertion-bearing suite that now throws, not a stub.** Five genuine SUPERSEDED no-assert stubs
(`claim_segmentation_and_present_tense_fp`, `mixed_claim_grounding`,
`past_completion_gate_behavior`, `per_resource_grounding_contract`,
`d3_past_completion_gate_not_shortcircuited_by_pending_action`).
`run20_defect_closure_contract.mjs` is present and genuinely
assertion-bearing: **102 pass, 0 fail**, driving real product bytes — but it is #80's corpus
promoted verbatim, so it contains no non-bare D142 reply and no non-assertive active-voice case,
which is why it is green while D145 and D148 are open. **The 60 `*.sql` suites were NOT run** —
they need a live DB session and this campaign has no production write authority; the change under
test is pure Edge-Function source.

**A green battery is evidence about the battery.**

### Not verified in this campaign (stated, not skipped)

* **`deno check`** — `deno` is not installed in this environment. The closure's *"23 errors == the
  pre-existing baseline, 0 new"* is **UNVERIFIED**, neither confirmed nor refuted.
* **Live UI and live AI-chat truth checks — BLOCKED, and blocked by construction:** the candidate
  is not deployed (production is v92), so no browser or chat session can exercise these bytes.
  No browser tooling was available in this session type either. Every finding above is
  CODE-EXECUTED against the shipped bytes, not LIVE VERIFIED.

### Regression tests added

* `qa/verification/proposed/v21_regression_additions.mjs` — **136 cases**, CONTRACT/DEFECT
  convention, ANY failure exits nonzero, own extractor, index.ts resolved as
  `../../../supabase/functions/sem-ai-command/index.ts` or via `SEM_INDEX_SRC`. On this
  candidate: **92 pass, 44 fail — all 44 are DEFECT reproductions (D145 ×12, D146 ×12, D147 ×5,
  D148 ×14, D149 ×1) and 0 CONTRACT failures**, i.e. every guard I pinned genuinely holds.
* `qa/verification/proposed/v21_mutation_proof.mjs` — **17/17**, written from scratch, does not
  use `v20_mutation_proof.mjs`. Mutates index.ts **in memory only** and re-asserts the on-disk
  sha256 itself. Coverage mutations (linker always-false → coordinated fabrication missed;
  dead-end neutralised → opposite field armed; D141 lexicon reverted → truthful negatives
  destroyed; D144 arm removed → headline fabrication missed) and LIMITS mutations (linker
  always-true → zero-relativizer destruction reopens; label empty-remainder test dropped →
  `Restored Furniture Co` becomes unselectable; D144 arm removed → the D145 over-catch
  disappears) each break a NAMED case. Plus the 8-probe measured fix direction for D148.

**No fix applied — no write authority on the implementation branch. index.ts restored
byte-identically (`c4559323…`, asserted at the end).**

### Lesson

#80's lesson was *"a disjunct added to a guard needs its own adversarial corpus, not a share of
the corpus that motivated the guard."* This candidate **adopted that lesson's remedy and repeated
its mistake three times in one commit**: R-ZR2's eight extra linker terms (D146), D141's five
extra negators (D147) and D144's active-voice arm (D145) were each added as a *term* while what
had been measured was a *score* — on a corpus that, by construction, contained no sentence
exercising the new term. The sharper rule this generation earns:

**A term added to a pattern must be justified by a case FOR it and a case AGAINST it, and the
suite that pins that pattern must be updated in the same commit — a closure that makes its own
regression suite throw has not been verified at all, it has been silenced.** And, from D148:
**closing the exact sentence a verifier reported is not closing the defect the verifier found.**
The D142 report named the mechanism (an unconditional label strip erasing the founder's verb);
the fix guarded the one reply shape that mechanism was demonstrated with.

## #77 — verifier #17, independent verification of the run16 D123–D126 closure (`f232975` / `9535f0b`)

**Candidate:** `9535f0b4d094570ac871c3ec85b78830324b03bc` (closure commit `f232975`; the
rotation commit on top touches only `qa/verification` bookkeeping — verified by diff, index.ts
byte-identical, `git diff f232975 9535f0b -- supabase/functions/sem-ai-command/index.ts` is empty).
**index.ts sha256:** `e5ccf63b26b833f4cc5d9596e7417d7b5744bef6be919982740b1c4f165b6d69`,
asserted before the run, after every one of 28 temporary source mutations, and at the end.
**Baselines for every comparison:** `52e830f` (the #76 candidate) and `d724d8c`.
**Verdict: FAIL** — one P1 regression, one P2, one P3, one coverage gap. Three of the four
claimed closures are real and well made; the fourth closed one direction by reopening the other.

**Production, read-only, re-checked myself (not carried forward from #76):**
`npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk` → `sem-ai-command` is
**version 92, ACTIVE**, `ezbr_sha256` `33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`,
`updated_at` 1788239725518. Byte-identical to what #75 and #76 recorded, so **nothing has been
deployed since** and **none of D58–D129 is live**. Everything below is about a candidate
branch, not about what the founder is running today. `ezbr_sha256` is a deployed-bundle hash
and is not comparable to an index.ts source hash.

**Scope of this run:** source-level and behavioural verification of the `sem-ai-command`
Edge Function only. The 60 `*.sql` suites in `qa/scenarios-runner/` were **NOT run**;
DB/RLS/lifecycle truth, UI truth and live AI-chat truth are **OUT OF SCOPE / BLOCKED** for
this campaign and are not claimed either way. Browser/MCP tooling was not available in this
process, so UI and live-AI-chat checks are **BLOCKED**, not silently skipped.

### What genuinely closed

* **D123 — CLOSED, and the inversion is the right call.** Measured over 289 probes through
  the REAL `matchDisambiguationOption` extracted from all three SHAs: **zero replies bind
  under the candidate that dead-ended on `52e830f` or `d724d8c`.** The rule is strictly
  tighter, and provably so — no word from the retired `NEGATED_MENTION` list is in
  `SELECTION_FILLER`, so every reply the blocklist dead-ended still dead-ends. All 24
  exclusion replies #16 recorded (`exclude acme`, `cancel acme`, `acme, no`, `acme? no, the
  holdings one`, the punctuation inversion) now dead-end, on all three paths (single match,
  D106 specificity, D102 raw tie-break — 3 call sites, verified in source).
* **D124 — CLOSED, thoroughly, and it fails closed on every hostile input I could build.**
  Driving the REAL full gating pipeline: `employee`→`person`, `organization`→`company`,
  `okr`→`goal`, `ticket`→`task` all resolve the real canonical name where `52e830f` rendered
  "the employee". And the drop still fires for: an id known under the ORIGINAL type but not
  the alias (`employee` with a `company|` row, `organization` with a `person|` row, a row
  keyed literally `employee|`/`ticket|`); 13 unlisted or hostile entityTypes including the
  prototype keys `__proto__`/`constructor`/`toString`/`valueOf`/`hasOwnProperty` (the alias
  table is a bare object literal, so those lookups really do return prototype members — every
  one of them still fails the `canonicalById` key test and the typed-fallback regex); a
  non-string entityType; an absent entityType; an absent or empty id. Runtime labels resolve
  under the CANONICAL type key (`person|`) and correctly do NOT resolve under the alias key
  (`employee|`). MIXED lists drop only the unresolvable member in all three orderings.
  All-unresolvable yields an EMPTY option list and the next turn cannot bind anything.
  **A fabricated label reaches the founder by exactly one path and no other: when the
  canonical row's own name IS that exact string** — checked across 8 fabrication shapes.
* **D126 — CLOSED, and confirmed by mutation rather than by reading the suite.** `run15`
  now fails BEHAVIOURALLY (assertion failures, not extraction refusals) under every drop
  mutant that preserves the pinned literals: drop-only-when-ALL-unresolvable (the exact
  mutant #16 said passed the whole battery) = 1 behavioural failure in run15 and 1 in run16;
  over-broad drop = 1 and 1; no-op drop = 6 and 11; first-index-only drop = 4 suites. run16
  is committed with 53 cases, all passing, and its cases execute the product (they fail
  under 7 different gate/matcher mutations).
* **D125 — the false-negative direction is genuinely closed.** 0/30 fabrications escape the
  belt, against 15/30 at `52e830f` and 3/30 at `d724d8c`. All four shapes #16 recorded
  ("archived – no undo available", "archived (no undo available)", "archived without
  incident", "archived and no errors occurred") are caught, plus eleven more I added.

### D128 (P1) — the D125 splitter closed one direction by reopening the other, and the disclosure does not say so

`readsAsCompletion`'s clause splitter gained `and`/`but`/`without`, parentheses, colon,
newline and dashes as boundaries. **Those are not clause boundaries when they occur inside a
NOUN PHRASE**, so the negator is severed from the completion verb it scopes over:

```
"No company named Salt and Pepper Co was archived."
  -> ["No company named Salt", "Pepper Co was archived"]
     first clause: negated, skipped.  second clause: no negator, LEGACY_PAST_COMPLETION fires.
  => readsAsCompletion === true.  52e830f: false.
```

| corpus | candidate `9535f0b` | `52e830f` |
|---|---|---|
| 30 fabricated completions — false NEGATIVES | **0 / 30** | 15 / 30 |
| 39 mixed truthful negatives — false POSITIVES | **6 / 39** | 0 / 39 |
| 130 realistic truthful negatives whose entity names carry a new boundary token — false POSITIVES | **97 / 130 (75%)** | **0 / 130** |

Boundary attribution over that 130: `and` 50/60, `without` 15/18, `but` 10/18, dash 10/12,
parenthesis 10/12, prose 2/10 (a time — "Nothing in the 14:30 batch was archived"; a
parenthetical — "No entity (including ACME) was archived").

**What the founder actually receives.** `readsAsCompletion` feeds both correction arms:
`legacyProseFallback` (index.ts:5583) replaces the entire truthful answer with *"I can't
actually do that from chat — nothing was changed. Please use the relevant page in the app…"*,
and `structuredProseDrift` → `rewriteFromStructure` (index.ts:5466) discards the prose and
re-renders from structure. Only read-only / ungrounded turns are affected — which is exactly
the truthful-answer channel. So the founder asks "did we archive Salt and Pepper Co?", the
model answers correctly, and the belt replaces the correct answer with a false statement.

**This is the class index.ts records against itself.** Line 5362, verbatim: *"nine truthful
founder-facing answers of sixteen, each replaced with 'I can't actually do that from chat',
which is itself false. Destroying a true answer and substituting a false one is a worse
outcome than the fabrication this belt exists to catch."* That is run14/D112 and ledger
#4905. This is its sixth-consecutive-change recurrence.

**The disclosure is wrong, not merely thin.** The #76 postscript and the index.ts comment
both state the residual as *"a negator inside one bare clause with no separator at all"* —
the false-negative direction only. The false-positive direction is not mentioned. And the
postscript's own closing lesson is *"When a guard has a limit, pin BOTH directions of it, or
the destructive one is the one that goes unobserved."* D125 pinned only the false-negative
direction. My mutation battery confirms the gap mechanically: **adding `or` to the splitter
is caught by NO committed suite** — the battery has zero false-positive coverage for splitter
widening, which is precisely how this shipped.

**Root cause and the shape of a fix (not applied — I have no write authority on the
implementation branch):** the conjunction arm is the whole problem. `and`/`but`/`without`
between two noun-phrase fragments is not a clause boundary. Options, in increasing order of
how much of D125 they keep: (a) drop the `\s+(?:and|but|without)\s+` arm and re-catch
"archived and no errors occurred" by testing the negator's SCOPE rather than its clause
(a negator anywhere BEFORE the completion verb in the same sentence disarms it); (b) keep
the conjunction arm only when the following fragment starts with a subject pronoun or an
auxiliary ("and no errors occurred") rather than a capitalised name fragment; (c) require
the clause to contain a completion verb AND its subject before splitting. Whatever is
chosen, `D128.rateVsPrior` in `qa/verification/proposed/v17_regression_additions.mjs` is
the acceptance test, and `D128.hold.newFabricationsStillCaught` is the LIMIT that stops the
fix from simply reverting D125.

### D127 (P2) — `SELECTION_FILLER` is not what the comment and the postscript say it is

Both the index.ts comment and the #76 postscript describe the allowlist as containing *"the
pending action's own verbs"*. It is in fact a **static union of every lifecycle verb and
every entity-type noun, independent of which action is pending**. Executed end-to-end
through the real `matchDisambiguationOption` + `commandContradictsActionType` +
`resolveClarificationField`:

| reply | pending action | result |
|---|---|---|
| `activate acme` | company / archive | **ARMS `archiveCompanyIds`** |
| `reject acme` | company / archive | **ARMS `archiveCompanyIds`** |
| `reject bob smith` | person / archive | **ARMS `endEmploymentPersonIds`** |
| `rename acme` / `assign acme` / `approve acme` | company / archive | **ARMS `archiveCompanyIds`** |
| `archive acme tasks` / `archive acme employees` | company / archive | **ARMS `archiveCompanyIds`** (the COMPANY) |
| `restore acme` | company / archive | refused — D32's contradiction guard, working |

Two distinct holes. **(a) A verb-family gap:** `activate` is selection filler but is absent
from `RESTORE_VERB_PATTERN`, which knows only `reactivat(e|ed|ing)` — so a make-active
intent is not a contradiction and performs an archive. **(b) A target flip:** the
entity-type nouns let a reply name a DIFFERENT thing belonging to the option
("acme tasks", "acme employees") while the pending action still fires on the parent.

**Both are PRE-EXISTING at `52e830f` and `d724d8c`** — I measured all 30 residual mis-binds
against both and they are identical, and the candidate is strictly tighter overall. They are
recorded here because this is the campaign that turned "not on the negator blocklist" into
"positively affirmed as selection filler", and because the stated rule and the implemented
rule differ. This is the same shape as D32 (a live-reproduced production incident: a fresh,
unrelated command absorbed as a stale confirmation), just with a verb outside the two
families the contradiction guard knows.

### D129 (P3) — the D95 seam: the product numbers the options and then refuses the numbered reply

`SELECTION_FILLER` contains the words `option` and `number`, but **no digit is filler**.
The D95 numbering renders colliding options as `the company (option 1)` / `(option 2)`, and
then `acme (option 1)`, `option 1, acme`, `acme option 1` and `acme #1` all dead-end. As
written, `option` and `number` are dead weight in the allowlist. Over-refusal measured on a
78-reply realistic corpus of legitimate naming replies: **the candidate binds 57/78 against
78/78 on BOTH priors.** The 21 lost replies are contractions and possessives ("acme, that's
it", "acme's the one", "let's do acme"), plain adverbs ("acme now", "just acme", "only acme",
"definitely acme", "acme works"), and every digit form. A dead-end costs one LLM round-trip
and the founder is not blocked, so this is a P3 usability finding, not a truth defect — but
the numbered-reply case is a seam between two of this file's own fixes and should be closed
shape-scoped (`(option N)` / `option N` / `#N`), never by adding digits to the allowlist:
`D129.hold.bareDigitStillDeadEnds` pins that "acme 2" must keep dead-ending.

### Coverage gap — the second-option guard inside `cleanSelection`

My own 28-mutant battery (20 + 8 literal-preserving) found **19 of 20 and 7 of 8 caught, and
0 caught only by an extraction refusal**. LIMITS were mutated, not only coverage:
over-broadened `SELECTION_FILLER` with negators (caught, 17 failures), `.every`→`.some`
(caught, 23), emptied the filler set, emptied the alias table partially and entirely,
`canonicalKnowsIt` ignoring `lastKnownLabel` (caught by run16 ONLY) and ignoring
`canonicalById` (caught by 9 suites), the D124 `typedFallback` comparison restored, the drop
made over-broad / no-op / first-index-only, D95 numbering removed, the `confirmed` lookbehind
dropped, the splitter reverted to `52e830f`, `NEGATED_CLAUSE` removed, split-on-every-space.

**One survivor: removing `cleanSelection`'s second-option guard passes all 22
assertion-bearing suites.** It is NOT a thirteenth vacuous guard — a differential fuzz over
**4,942,140** (reply × option-set) combinations shows it changes the outcome in 264 of them.
But it is unreachable-as-true on the single-match path (`matches.length === 1`), exactly
duplicated by the very next statement on the specificity path, and only decides the D102 raw
tie-break path when a third, shorter option whose whole label is `SELECTION_FILLER` survives
in the residual. Pinned in `D123.coverage.secondOptionGuardOnTieBreakPath`.

### Prior closures — none reopened

20 D72/D78/D95/D103/D113 cases across run8/run10/run12/run13/run14, **0 failing** (counted
from OUTPUT TEXT, never from an exit code). Every re-pin is explicit on the record: D72b
RETIRED, D95 and D103.hold.numbered re-pinned to "out-of-context options are dropped",
D113.hold.absentId re-pinned from "falls back to the typed reference" to "is dropped". The
one contract this candidate changed, run15's `D116.hold.negatorInAnotherClauseStillBinds`,
was not deleted but **replaced by its inverse** with the reason recorded inline, plus a new
LIMIT case in the other direction — I read the diff, not the claim.

**The question belt is untouched**, proven two ways: nine constructs
(`safeQuestionFragment`, `INTERROGATIVE_LEAD`, `FIRST_PERSON_MAIN_CLAUSE_COMPLETION`,
`COMPLETION_WORD`, `safeProseFragment`, `safeOptionLabel`, `safeDisplayLabel`,
`PAST_COMPLETION_CLAIM_PATTERN`, `safePendingSummary`) are **byte-identical across
`d724d8c` → `52e830f` → the candidate**, and 0/16 behavioural drift on a question corpus.

### Battery

**28 `.mjs` suites enumerated from the filesystem** = 1 library (`_gate_extract`, no output)
+ 5 self-labelled SUPERSEDED stubs that print one line and never reach their assertions
+ **22 assertion-bearing**. Every suite exits 0; **failures counted from OUTPUT TEXT = 0**
across 668 OK/PASS marks. The 60 `*.sql` suites were NOT run.

**Bookkeeping correction:** the #76 closure postscript states *"Full battery: 27 suites
(21 assertion-bearing, 5 stubs, 1 library) — the verifier's count, adopted."* That count was
correct at `52e830f` (27 `.mjs`), but the same commit ADDED `run16_defect_closure_contract.mjs`,
so the real battery at the candidate is **28 = 22 + 5 + 1**. A pre-change count adopted after
making the change. No failure is hidden by it.

### Regression tests added

`qa/verification/proposed/v17_regression_additions.mjs` — 39 cases, same CONTRACT/DEFECT
convention and the same exit guard (ANY failure exits nonzero). On this candidate:
**19 pass, 20 fail — all 20 are DEFECT cases reproducing D127/D128/D129 by design, and
0 CONTRACT failures**, i.e. every guard I pinned genuinely holds. It drives the REAL matcher,
the REAL deterministic-disambiguation decision (matcher + contradiction guard + field
resolution, so a mis-bind is reported as the destructive field it actually arms), the REAL
`readsAsCompletion`, and the REAL full gating pipeline including the drop.

**Lesson:** D125 is the sixth consecutive change to this drift belt, and the fourth to close
one direction by reopening the other. A lexical clause splitter has no way to know whether a
conjunction joins two clauses or two words of a company's name — the boundary set cannot be
extended safely without a corpus of REAL entity names in the false-positive direction, and
the battery has never had one. Until a change to `readsAsCompletion` is measured on both
corpora in the same run, "closed" for this belt means "closed in the direction we happened
to test."

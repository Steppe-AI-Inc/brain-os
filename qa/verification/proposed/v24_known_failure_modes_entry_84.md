## #84 — verifier #24, independent verification of the run23 D155/D156/D157 closure (`e6a4d02` / `89a1ac9`)

**Candidate:** `89a1ac9d149819004d5f00e7519bc34d7d877f00` (closure commit `e6a4d02`; the campaign
rotation commit on top touches only `qa/verification` bookkeeping — verified by diff,
`git diff e6a4d02 89a1ac9 -- supabase/ web/` is empty).
**index.ts sha256:** `bf5e757f4e813b20a11a074d894192685946e1ef469b8e59647cc67c54118066`,
asserted at preflight, before and after every mutation, and at the end. **index.ts was never
written.** Every measurement ran either on an in-memory string or on a TEMP COPY handed to my
extractor / to a suite by explicit path.
**Note on the file's own bytes:** this candidate is now **100% CRLF** (5,934 CRLF, 0 bare LF,
458,953 bytes). `4476c92` had 40 bare-LF lines in exactly the two regions this change touches, so
`git diff 4476c92 e6a4d02` *shows* two large hunks that are almost entirely line-ending
normalisation. **The real surface is 4 changed non-comment lines and 7 added comment lines** —
confirmed by a whole-file diff after CRLF normalisation. Nothing is hidden in those hunks, but the
raw diff overstates the change by ~40 lines and a reviewer skimming it will not see that.
**Baselines, each extracted from git by my own extractor:** `b32e0e4` (#80), `54ebecc` (run20 /
#81), `4476c92` (run22 / #83's candidate — the correct immediate predecessor).

**Verdict: FAIL** — **one new truth-degradation regression against `4476c92`** (D158, P2), in the
fabrication-survives direction, and it is a **partial reopening of D147b**, which the run22
postscript records as CLOSED and which `run23_defect_closure_contract.mjs` itself pins as a
`[CONTRACT]`. **D155, D156 and D157 are all genuinely closed** and I re-derived every one of them
independently, cross-SHA, on a corpus I wrote. **A safe close for D158 exists, is measured, closes
it completely with zero collateral on every corpus I have, keeps the whole 32-suite battery green,
and introduces no regexp construct the candidate does not already ship** (FIX-C, below). This is a
fixable candidate. It is the thirteenth consecutive change to this belt and the eleventh to close
one direction while opening another — and, for the third campaign running, the collateral was
measured on a corpus that did not contain the shape the change put at risk.

**Production, read-only, re-derived myself:** `supabase functions list --project-ref
pvphxgrtdfrudejjhzjk` → `sem-ai-command` **version 92, ACTIVE**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at`
1788239725518 — byte-identical to what #75–#83 recorded. **Nothing has been deployed; none of
D58–D159 is live.** Everything below concerns a candidate branch, not what the founder runs today.
**Nothing was written to production, and nothing was written outside my own worktree.**

**Method note.** Every measurement drives the REAL shipped predicates, sliced out of index.ts by an
extractor I wrote for this campaign (`readsAsCompletion`/`completionIsNegated` from
`const LEGACY_PAST_COMPLETION` to `const legacyProseFallback`; the verbatim `contradicted`
statement re-hosted as a function of `(matchedOption, command, commandForContradiction,
commandContradictsActionType)`, so a mis-bind is reported as the destructive FIELD it actually
arms; `ARCHIVE_VERB_PATTERN`/`RESTORE_VERB_PATTERN` from their own declaration lines). It imports
nothing from `qa/scenarios-runner` and nothing from `v23_*.mjs` — all of those are artefacts under
test. The extractor refuses to run unless every named belt const survives the slice, unless no
TypeScript annotation survives stripping, and — for the matcher — unless the D157 unified test is
present verbatim.

---

### D158 (P2, NEW IN THIS CANDIDATE — REGRESSION vs `4476c92`) — FIX-A's evidential-verb list is matched in PASSIVE/reported position too, so a linked fabrication is disarmed and ships

FIX-A widened `completionIsNegated`'s relativizer disjunct from `that|which|who|whom` to also
admit twelve evidential/reporting verbs. The test is applied to **the whole span between the
negator and the completion verb** (`c.slice(n, m.index)`), with **no requirement that the verb be
an active, complement-taking predicate**. So the same twelve verbs used *passively, as the thing
that did not happen* — the most ordinary way English writes an all-clear — now disarm the belt:

| founder-facing summary | `b32e0e4` | `54ebecc` | **`4476c92`** | **candidate** |
|---|---|---|---|---|
| `No errors were reported and ACME was archived.` | missed | missed | **CAUGHT** | **MISSED** |
| `No issues were noted and Beta Corp was deleted.` | missed | missed | **CAUGHT** | **MISSED** |
| `Nothing was mentioned and ACME was restored.` | missed | missed | **CAUGHT** | **MISSED** |
| `No delay was recorded and ACME was archived.` | missed | missed | **CAUGHT** | **MISSED** |
| `No dispute was confirmed and Beta Corp was deleted.` | missed | missed | **CAUGHT** | **MISSED** |
| `No downtime was indicated and ACME Holdings was archived.` | missed | missed | **CAUGHT** | **MISSED** |
| `No objection was stated and Beta Corp was removed.` | missed | missed | **CAUGHT** | **MISSED** |
| `No exception was suggested and ACME was restored.` | missed | missed | **CAUGHT** | **MISSED** |
| `No change was noted although ACME was archived.` | missed | missed | **CAUGHT** | **MISSED** |
| `No error was reported however Beta Corp was deleted.` | missed | missed | **CAUGHT** | **MISSED** |
| `No issue was recorded therefore ACME was archived.` | missed | missed | **CAUGHT** | **MISSED** |

**11 of 12** on my set; the twelfth (`No warnings were shown and Beta Corp was archived.`) survives
only by accident — `shown` is not one of the twelve spellings (`show|shows|showed` are).

**Root cause.** `completionIsNegated` decides "the negator scopes over the completion verb" from a
bag of words, not from position. `that|which|who|whom` are *unambiguously* subordinating, so the
old disjunct was safe. An evidential verb is not: `shows` in `No log however SHOWS ACME was
archived` takes the completion clause as its complement, but `reported` in `No errors were REPORTED
and ACME was archived` is the main verb of the *negated* clause and the completion is a second,
independent, asserted clause. The candidate cannot tell them apart, so it treats both as
subordination.

**Why the suites did not see it.** `run23_defect_closure_contract.mjs` pins D147b as a `[CONTRACT]`
with six cases — `occurred`, `were pending`, `are pending`, `failed`, `remained`, `None remained`.
**Not one of them uses a verb from the list FIX-A added**, so the contract that exists precisely to
detect this cannot. This is the same failure verifier #22 recorded as D153 and verifier #23
recorded as claim 1: the collateral corpus does not contain the shape the change put at risk.
A closure that adds a lexicon must add its collateral cases *from that lexicon*.

**Founder impact.** `legacyProseFallback` and `structuredProseDrift` are the two consumers of
`readsAsCompletion`, both live on ordinary turns. A miss here means the raw model prose ships: the
founder reads `No errors were reported and ACME was archived.` on a turn where **nothing was
archived**, with no correction and no evidence behind it. This is the exact class BUG-002 opened.

**FIX-C — measured, one line, no new regexp construct.** Require the evidential verb not to be
immediately preceded by a passive/perfect auxiliary; the four true relativizers stay
unconditional:

```
-  /\b(?:that|which|who|whom|show(?:s|ed)?|…|note(?:s|d)?)\b/i
+  /\b(?:that|which|who|whom)\b|(?<!was )(?<!were )(?<!is )(?<!are )(?<!am )(?<!be )(?<!been )(?<!being )(?<!has )(?<!have )(?<!had )\b(?:show(?:s|ed)?|…|note(?:s|d)?)\b/i
```

Measured on the candidate vs the identical candidate with only that replacement:
**D158 11 → 0 caught, D156 0 → 0 destroyed (13/13 still survive), D147b 0 → 0 (6/6 still caught),
my 32-case truthful / 25-case first-person corpora unchanged at 0, and the whole 32-suite battery
stays green (0 failing suites).** `v24_regression_additions.mjs` goes **196/11 → 207/0**.
Every lookbehind group is FIXED-LENGTH — the same ES2018 construct `LEGACY_PAST_COMPLETION` already
ships four of (`(?<!may )(?<!might )(?<!could )(?<!can )`), so if lookbehind were unsupported the
candidate would already fail to load. **No variable-length lookbehind and no modifier group**, so
FIX-C carries none of the Deno risk that made FIX-B unadoptable.

### D158b (P3, disclosure) — the D155 object narrowing is a two-way trade, and the trade is not disclosed by shape

Closing D155 by requiring the object to be `(?:[A-Z]|<entity noun>)` is the right call and I
endorse it. But it is a trade, and the postscript reports only the winning side ("15/15",
"4/50 fabrications missed"). Five real first-person completions that `4476c92` **caught** are now
**missed**, and they are a nameable family — an object that is neither capitalised nor one of the
26 listed nouns:

| founder-facing summary | `4476c92` | candidate |
|---|---|---|
| `I deleted my account.` | CAUGHT | **MISSED** |
| `I archived his tasks.` | CAUGHT | **MISSED** |
| `I removed 3 tasks.` | CAUGHT | **MISSED** |
| `I deleted them.` | CAUGHT | **MISSED** |
| `I archived acme corp.` | CAUGHT | **MISSED** |

`my`/`his`/`their`/`your` are absent from the determiner list (`the|that|this|its|our`), a cardinal
is not matched, a pronoun object is not matched, and a lowercase-typed company name is not matched.
Two of these are cheap to close inside the existing shape (add `my |your |his |her |their ` to the
determiner set; add `\d` to the object alternation) without touching the case-sensitivity that
makes D155 work — I did not fold them into FIX-C because they are a widening, not a regression
close, and they deserve their own measurement. Pinned `[RESIDUAL]` in
`v24_regression_additions.mjs` so a later widening is observed rather than assumed.

### D158c (P4, NEW IN THIS CANDIDATE — undisclosed behaviour change, and it falsifies a comment left in the file) — the D157 unification also imports the -ed/-ing forms and "bring back" into the imperative test

D157's fix replaces the inline `/\b(?:restore|unarchive|reactivate|activate)\b/i` with
`RESTORE_VERB_PATTERN`, which is wider in a second way nobody mentions: it also matches
`restored|restoring|reactivated|bring back|un-archive` (and, on the archive side,
`archived|archiving|deleted|deleting|removed|removing|ended|ending`). A company whose label **is**
one of those participial/phrasal forms is already "bare" under the D150 label gate, so the founder
typing that company's own name now **dead-ends** where `4476c92` selected it — 8/8 measured:

| pending | label | founder types | `b32e0e4` | **`4476c92`** | **candidate** |
|---|---|---|---|---|---|
| archive | `Restored` | `Restored` | SELECT | SELECT | **DEAD-END** |
| archive | `Restoring` | `Restoring` | SELECT | SELECT | **DEAD-END** |
| archive | `Reactivated` | `Reactivated` | SELECT | SELECT | **DEAD-END** |
| archive | `Bring Back` | `Bring Back` | SELECT | SELECT | **DEAD-END** |
| restore | `Archived` | `Archived` | SELECT | SELECT | **DEAD-END** |
| restore | `Deleting` | `Deleting` | SELECT | SELECT | **DEAD-END** |
| restore | `Ended` | `Ended` | SELECT | SELECT | **DEAD-END** |
| restore | `Removed` | `Removed` | SELECT | SELECT | **DEAD-END** |

**This is the fail-closed direction** — the founder is handed back to the LLM instead of a
destructive field arming on an ambiguous name, which is the D136 answer and is defensible. It is
**not a security defect** and I am not asking for it to be reverted. But it is an undisclosed
behaviour change, and it makes the D148 comment **still present in the file** factually false:

> *"Those word-boundary base forms never match the -ed/-ing forms in a real NAME ('Restored
> Furniture Co', 'Reactivated Metals LLC'), so a participial-name selection is untouched"*

That sentence is now true only for MULTI-word participial names (which survive because stripping
leaves a remainder — I confirmed `Restored Furniture Co` and `Reactivated Metals LLC` still select,
9/9 across the D150/D138 family). For a single-token participial name it is exactly backwards. Per
the D149 rule, a comment that a change falsifies must be corrected in the same commit.

### D159 (P4, PRE-EXISTING at every SHA measured — a decorative guard, found while probing the splitter)

`LEGACY_PAST_COMPLETION` ships an arm `\brenamed:\s*.+(→|->)`. `readsAsCompletion` splits clauses
on `:\s` **before** testing it, so on the natural rendering the arm is **unreachable**:

- `Renamed: ACME -> Beta Corp` → splits to `["Renamed", "ACME -> Beta Corp"]` → **quiet** at
  `b32e0e4`, `54ebecc`, `4476c92` and this candidate.
- `Renamed:ACME -> Beta Corp` (no space after the colon) → **fires**.
- `The company was renamed: ACME -> Beta Corp` → fires, but via the `was …renamed` arm, not this one.

Not introduced here and not a regression — but it is a guard that reads as coverage and provides
none, and `sem_ai_command_past_completion_claim_regex.mjs` tests the raw regex rather than
`readsAsCompletion`, which is why it has never been noticed. Pinned `[RESIDUAL]` at its current
behaviour. **Defect class: a guard tested against the regex in isolation rather than against the
predicate the product actually calls.** Worth a sweep of the other belt arms on the same basis.

---

### What is genuinely closed — re-derived independently, not taken on trust

**D155 (P2) — CLOSED.** On my own 32-case truthful first-person corpus and 25-case first-person
completion corpus, driven through the real extracted `readsAsCompletion` at four SHAs:

| | truthful DESTROYED | real completions MISSED |
|---|---|---|
| `b32e0e4` | 0/32 | **23/25** |
| `54ebecc` | **17/32** | 2/25 |
| `4476c92` | **13/32** | 0/25 |
| **candidate** | **0/32** | **0/25** |

The candidate is the only SHA that holds both directions. Both of #23's headline sentences survive
(`I removed it from my draft, not from the database.`, `I restored order to the report layout.`)
and the D144 headline is still caught (`I deleted Beta Corp.`, `We archived ACME.`, `I deleted the
company.`). Interrogative (`Have I deleted the company yet?`), conditional (`If I deleted the
company, …`), embedded (`You asked whether I deleted the company.`) and negated (`I have not
deleted the company.`) first-person forms all survive — the `^`-anchoring and the negator check do
that, and I confirmed each independently. Lowercase `i`/`we` subjects are still caught (the arm
lists `I|We|i|we` explicitly), so making the arm case-sensitive did not create a lowercase hole.

**No `(?-i:` or `(?i:` modifier group is shipped.** I checked the whole file: exactly **one**
occurrence of that byte sequence, and it is inside the `//` comment that explains why it was
avoided. Every non-comment line is free of it. **The DEPLOY NOTE is TRUE.**

**The arm really is inline and adds no new `const`.** The belt's named-const set is byte-for-byte
what run15–run18 expect (`LEGACY_PAST_COMPLETION, PROGRESS_VERBS, EXECUTION_IN_PROGRESS,
CONFIRMED_COMPLETION, NEGATED_CLAUSE, REFERENCELESS_CONFIRMATION, COMPLETION_PARTICIPLE,
COMPLETION_VERB, NEGATION_AUX`), and run15 (57), run16 (53), run17 (43) and run18 (51) all
execute their full assertion counts. Pinned as a `[CONTRACT]` in `v24_regression_additions.mjs`.

**D156 (P3) — CLOSED, but see D158.** All 13 evidential-complement shapes I could construct
(`shows|proves|indicates|suggests|says|states|confirms|establishes|records|reports`, with
`however|therefore|though|although` and with a lowercase-token `and` link) survive here and are
**13/13 destroyed at `4476c92`**. My mutation test confirms removing the twelve verbs reopens 3/3
named cases. The fix works — it is only too wide.

**D157 (P2) — CLOSED.** All four of #23's arming cases now dead-end instead of arming
`archiveCompanyIds`, and the change is in the safe direction only (the unification can only make
`contradicted` MORE true, never less):

| pending | label | reply | `b32e0e4` | `4476c92` | **candidate** |
|---|---|---|---|---|---|
| archive | `Bring Back` | `bring back` | arms | arms | **DEAD-END** |
| archive | `Bring It Back` | `bring it back` | arms | arms | **DEAD-END** |
| archive | `Un-Archive` | `un-archive it` | arms | arms | **DEAD-END** |
| archive | `Un-Archive` | `un-archive` | arms | arms | **DEAD-END** |

**D148 is not traded away for it** (13/13 bare-verb imperative phrasings still dead-end, including
`RESTORE`, `  Restore  `, `Restore Activate`) and **D150/D138 are not traded away** (14 real names ×
3 reply forms = 42/42 still selectable, both pending families). See D158c for what else the
unification changed.

**D154 — CONFIRMED still open, and correctly pinned `[RESIDUAL]`.** `Revive`, `Reopen` and
`Undelete` as bare labels still SELECT and arm the destructive field on the opposite intent —
identical at `b32e0e4`, `54ebecc`, `4476c92` and here. Not a regression; the run23 postscript
discloses it; run23 pins it. Agreed with the disclosure, and agreed that the D136 ambiguity
dead-end refactor is the right answer rather than a longer blocklist.

**The other three declared residuals are real and correctly pinned.** D156b (subject-NP,
`That ACME was archived cannot be confirmed.` fires at all four SHAs), D153 (dropped-linker,
`No issues, ACME was archived.` fires — the trade is intact) and D146b are each present in run23
as `[RESIDUAL]`, and I reproduced each at its pinned behaviour. `safeOptionLabel`'s 20-of-24
suppression is also still pinned.

**No prior closure reopened.** Re-derived here rather than trusted from run23: D112, D118, D125,
D128, D130, D131, D134, D137, D139 (em-dash and hyphenated place names, name-internal
coordinators), D146, D151 (all six re-added negators — and `b32e0e4` fails 5/5 of them, which
proves the pin is load-bearing), D153, D156b on the belt; D127, D136, D138, D142, D148, D150 on the
matcher. **41-case belt corpus and 12-case matcher corpus: 0 regressions vs `4476c92`.**
D147b is the sole exception and is D158 above. The **question belt (`safeQuestionFragment`) is
byte-identical** (`1e3d374db34fa084…`, 8,001 bytes after CRLF normalisation) across `b32e0e4`,
`54ebecc`, `4476c92` and the candidate.

**The diff surface is smaller than it looks, and nothing is hidden.** Whole-file comparison against
`4476c92` after CRLF normalisation: **4 non-comment lines changed, 7 comment lines added, nothing
else.** The three declared hunks are all of it.

**Battery, run from the filesystem by my own runner** (per-suite exit code AND output-text failure
count, counted separately): **32 suites, 0 non-zero exits, 0 output-text FAIL lines, 1,140 `OK`
lines.** `run15` = **57**. **`run22` is gone** (retired, file deleted); `run20`/`run21` absent.
**`run23` is present, 316 assertions, and genuinely assertion-bearing** — I proved that by
mutation, not by reading it: reverting D155 makes it `exit=1, 25 FAIL`, reverting D156 `exit=1,
13 FAIL`, reverting D157 `exit=1, 30 FAIL`. **No `.sql` is executed by any suite** — `child_process`
appears in **zero** `.mjs` files, and the two files that mention `.sql` do so only in prose.
Twelve suites emit no `^OK` line: **five are self-declared `SUPERSEDED (prose-era)` stubs**
(`claim_segmentation_and_present_tense_fp`, `d3_past_completion_gate_not_shortcircuited_by_pending_action`,
`mixed_claim_grounding`, `past_completion_gate_behavior`, `per_resource_grounding_contract`), one is
`_gate_extract.mjs` (an importable helper, no output by design), and **six genuinely assert in a
different output format** (`sem_ai_command_company_restore_truth` 51 PASS,
`sem_ai_command_confirmation_truth` 38, `sem_ai_command_execution_plan_truth` 25,
`sem_ai_command_named_person_lookup_truth` 11, `sem_ai_command_factory_verification_selection` 7,
`issue5_confirmation_action_type_binding` 10/10). **No suite is a silent stub pretending to pass.**

**Founder-directed lexical-branch scenario (as #75–#83): 450/450, 0 regressions vs `4476c92`.**
One real company name per canonical completion word (22) plus the eight base-form-verb names,
driven through both branches the founder actually meets: `There is no record <Name> was archived.`
survives for all 30, as do `No record shows <Name> was archived.`, `<Name> was not archived.`,
`<Name> is archived. Should I restore it?`, the clarifying question and the honest refusal (180
cases); a real fabrication about each name still fires in three shapes (90); and the founder's
typed name selects the option in both pending families, plain / `yes, `-prefixed /
`(option 1)`-suffixed (180).

**Mutation test, my own harness — 6/6 load-bearing, each breaking NAMED cases.** Widening the D155
object back to `\S` breaks D155 3/3 while D144 still holds; adding `/i` to the arm breaks D155 3/3
while D144 still holds (so the case-sensitivity itself is load-bearing, not decorative); removing
the twelve evidential verbs breaks D156 3/3 while D147b still holds; reverting D157 to the inline
base-verb list breaks D157 3/3 while D148 and D150 both still hold; neutralising the D150 bare-label
gate breaks D148 and D157; deleting the whole new arm breaks D144 3/3 while D155 still holds.
`index.ts` sha256 asserted before and after every mutation, unchanged; every mutation applied to a
temp copy only.

---

### Claims that need correcting

1. **"collateral 0/75 truthful destroyed & 4/50 fabrications missed (BETTER than the b32e0e4
   baseline of 7)."** The comparison SHA is wrong and the direction it implies is wrong.
   `b32e0e4` predates the first-person arm entirely — it misses **23 of 25** first-person
   completions on my corpus, so "better than b32e0e4" is not a meaningful floor for this belt. The
   correct baseline is `4476c92`, the candidate this one is derived from. Against it, on my
   corpora, this candidate **destroys 13 fewer truthful answers and misses 8 more fabrications**
   (5 × D158b + 3 × D158). The D155 half of that (−13 / +5) is a defensible trade in the direction
   index.ts itself prefers. The D156 half is not a trade at all: **every one of my 12
   linker-free evidential truthful negatives already survived at `4476c92`**, so on that corpus
   FIX-A bought nothing and cost 3 fabrication misses. A collateral number must state the SHA it is
   measured against and the shapes it covers.
2. **"D156 … so 'No log shows ACME was archived.' is the truthful negative it is."** True, and it
   closes 13/13. But the same twelve verbs used passively re-open D147b for 11/12 shapes — D158.
   "Closed" needs the collateral half stated with it.
3. **"D157 … a company named 'Bring Back' no longer arms archive on a restore intent."** True, and
   confirmed 4/4. Not stated: the same unification imports the -ed/-ing forms, so eight bare
   participial company NAMES now dead-end where `4476c92` selected them (D158c) — and the D148
   comment left in the file now asserts the opposite.
4. **`run23_defect_closure_contract.mjs`'s own header is stale — the exact defect #23 recorded
   against run22 (its claim 4), repeated verbatim one campaign later.** It still declares itself
   pinned against `4476c92` / `82d4d77` / sha `e802227b…` and says *"A green run on THIS candidate
   would mean this file is not doing its job — D155/D156 are open here."* It was promoted into
   `qa/scenarios-runner/` on **this** candidate, where it is green by design (316/0). #23 asked for
   exactly this to be fixed in the promoting commit. It was not.
5. **"deno check 23 == baseline (0 new, run here via `npx deno@2`)." NOT RE-DERIVED — `BLOCKED`.**
   There is no `deno` on this machine's `PATH` and this session cannot invoke `npx deno`. Recorded
   as a coverage gap, not as a confirmation. Its practical weight is low here: I verified directly
   that **no modifier group is shipped**, and the only regexp constructs in the changed lines
   (fixed-length lookbehind, non-capturing groups, character classes) are already shipped elsewhere
   in the same file. FIX-C deliberately adds nothing beyond fixed-length lookbehind for the same
   reason.
6. **The raw `git diff` against `4476c92` overstates the change.** Two of its hunks are ~40 lines of
   LF→CRLF normalisation. Real surface: 4 non-comment lines + 7 comment lines. Worth saying in the
   commit message so the next reviewer does not have to re-derive it.

### Verified, and worth keeping

`qa/verification/proposed/v24_regression_additions.mjs` — **196 pass, 11 fail on this candidate:
11 `[DEFECT]` reproductions (all D158), 0 `[RESIDUAL]` moves, 0 `[CONTRACT]` failures.** Every
guarantee this candidate genuinely provides holds; the one new defect reproduces. **On FIX-C
(driven via `SEM_INDEX_SRC`) it goes to 207 pass, 0 fail** — D158 fully closed, still 0
`[CONTRACT]` failures and 0 `[RESIDUAL]` moves — and the full 32-suite battery under FIX-C is
**0 failing suites**, so unlike the last two campaigns there is no pin that has to move in the same
commit. It carries the D155 corpus in both directions, the D157 matrix, the D148/D150/D138
non-trade proof, the four pinned residuals plus D158b/D158c/D159, and six source invariants
(no modifier group, the belt const set, the arm's case-sensitivity, the arm's removal from
`LEGACY_PAST_COMPLETION`, the D157 lexicon reuse, and the question-belt hash).

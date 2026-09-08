## #86 — verifier #26, independent verification of the run25 D160/D160b (FIX-D) + D161 (FIX-E) closure (`7c5e610` / `415fed3`)

**Candidate:** `415fed37bbc6b266e0dcae8b64ca68195ac88475` (closure commit `7c5e610`; the campaign
rotation commit on top touches only `qa/verification` bookkeeping — verified by diff,
`git diff 7c5e610 415fed3 -- supabase/ web/` is empty).
**index.ts sha256:** `3b5baa2c268ccb6c1ecb5e2eac0ac0f20ccfafc991af28af3b090416961f7602`, asserted at
preflight, before and after every mutation, and at the end. **index.ts was never written.** Every
measurement ran on an in-memory string or on a TEMP COPY handed to a suite by explicit path
(`SEM_INDEX_SRC`).
**Baselines, each extracted from git by my own extractor:** `0e72ced` (run24 / #85's candidate),
`e6a4d02` (run23 / #84's candidate — the SHA where D156 was closed), `4476c92` (run22 — the
collateral baseline this closure claims to beat), `b32e0e4` (#80).
**Real surface of the change:** exactly **2 non-comment lines** vs `0e72ced` — the FIX-D
replacement of the evidential disjunct (which deletes the 11 FIX-C lookbehinds) and the added
FIX-E modal-hedge guard. Nothing else in `supabase/` or `web/` moved.

**Verdict: FAIL** — **FIX-D and FIX-E each close their target and each open a new hole on the
axis the closure claimed it had secured, and the closure's central bookkeeping claim is false in
the same shape it was written to correct.** FIX-E's modal guard drops the **whole clause** when
it matches, and its `be` alternative is unanchored — it never checks that the modal governs the
*completion* verb — so ordinary copular English (`can be confident`, `should be visible`,
`may be`, `would be`) swallows a genuine completion asserted beside it: **D162a, P2, a
REGRESSION vs `4476c92` AND `e6a4d02` AND `0e72ced`, i.e. vs every SHA measured.** FIX-D's
last-segment split has **no lowercase-token guard**, unlike the disjunct four lines below it that
has one for exactly one reason — an `and` inside a NAME is not a clause linker (run17/D128, pinned
in this very file as `Salt and Pepper Co`) — so a real company name containing `and` pushes the
evidential out of the last segment and, with a subordinator also present, destroys the truthful
negative: **D162b, P3, a REGRESSION vs `e6a4d02`/`0e72ced`, the SHAs where D156 was closed.**
The postscript's *"For run25 the comparison is genuinely better on BOTH axes"* is **FALSE** on my
corpus (**truthful destroyed 4 vs `4476c92`'s 21 — genuinely better; fabrications missed 5 vs
`4476c92`'s 0 — worse**), and *"FIX-E … 0 collateral"* is false for the same reason. **This is the
fifth consecutive campaign in which a two-directional trade was reported as a one-directional
improvement, and the second in a row in which the exact claim the previous verifier ordered
corrected was reissued about the replacement fix.** **D160 (15/15), D160b (8/8), D156's
same-segment core (12/12), D161's hedges (9/9) and all thirteen prior belt/matcher closures ARE
genuinely intact** — I re-derived every one of them cross-SHA on corpora I wrote. **Both defects
have a measured one-line fix that takes my suite from 135/11 to 145/1 and keeps the entire
31-suite battery green with no `[RESIDUAL]` move** (FIX-F and FIX-G, below). This is a fixable
candidate.

**Production, read-only, re-derived myself:** `supabase functions list --project-ref
pvphxgrtdfrudejjhzjk` → `sem-ai-command` **version 92, ACTIVE**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at` 1788239725518 —
byte-identical to what #75–#85 recorded. **Nothing has been deployed; none of D58–D162 is live.**
Everything below concerns a candidate branch, not what the founder runs today. **Nothing was
written to production, and nothing was written outside my own worktree.**

**Method note.** Every measurement drives the REAL shipped predicates, sliced out of index.ts by
an extractor I wrote for this campaign (`readsAsCompletion`/`completionIsNegated` from
`const LEGACY_PAST_COMPLETION` to `const legacyProseFallback`; a matcher module built from the
verbatim `matchDisambiguationOption`, `commandContradictsActionType`, `commandForContradiction`
and `contradicted` sources). It imports nothing from `qa/scenarios-runner` and nothing from any
`v25_*.mjs` — all of those are artefacts under test. Both extractors refuse to run unless every
named belt const survives the slice, unless no TypeScript annotation survives stripping, and —
for the matcher — unless the D157 unified test is present verbatim.

---

### D162a (P2, NEW — a REGRESSION vs `4476c92`, `e6a4d02` AND `0e72ced`) — FIX-E's bare `be` alternative is not anchored to the completion verb, so an ordinary copular modal swallows a real fabrication

FIX-E adds `&& !/\b(?:may|might|could|can|would|should)\s+(?:[a-z]+\s+){0,2}?(?:have been|has
been|had been|be)\b/i.test(c)` to the `.some()` arm. When it matches, the **entire clause** is
dropped before any completion arm sees it. The `have been|has been|had been` alternatives are
sound — those attach to the participle the hedge is about. **The bare `be` alternative does not
attach to anything.** `modal + (0-2 words) + be` is ordinary copular English about a *different*
predicate, and the guard then discards the completion that follows it in the same clause. The
clause splitter cannot rescue it: ` and ` and ` — ` only split before a **lowercase** word, so a
capitalised entity name after the linker keeps the fabrication inside the guarded clause.

| founder-facing summary | `b32e0e4` | `4476c92` | `e6a4d02` | `0e72ced` | **candidate** |
|---|---|---|---|---|---|
| `You can be confident ACME Holdings was archived.` | CAUGHT | **CAUGHT** | CAUGHT | CAUGHT | **MISSED** |
| `It should be visible now — ACME Holdings was archived.` | CAUGHT | **CAUGHT** | CAUGHT | CAUGHT | **MISSED** |
| `That may be why Beta Corp was deleted.` | CAUGHT | **CAUGHT** | CAUGHT | CAUGHT | **MISSED** |
| `The change can be seen in the list — ACME Holdings was archived.` | CAUGHT | **CAUGHT** | CAUGHT | CAUGHT | **MISSED** |
| `This can be confirmed and ACME Holdings was archived.` | CAUGHT | **CAUGHT** | CAUGHT | CAUGHT | **MISSED** |

**The `{0,2}?` window is exactly as advertised and that is what makes it reachable:** 0, 1 and 2
intervening words all match (`can be`, `can definitely be`, `can quite definitely be`); 3 words
does not (`You can quite very definitely be confident ACME Holdings was archived.` is still
CAUGHT). So the miss is not an exotic corner — it is the *common* end of the window.

**The `be` alternative buys nothing it was added for.** Every hedge in #85's own D161 table uses
`have been`. A bare-`be` hedge (`ACME may be archived.`) is not reachable by the belt at all —
`LEGACY_PAST_COMPLETION` requires `has been|have been|was|were`, and `EXECUTION_IN_PROGRESS`
requires `is/are being|getting`. Removing `|be` recovers all five fabrications above and keeps
**9/9** hedges alive (measured, FIX-G below).

**Founder impact.** `legacyProseFallback` and `structuredProseDrift` are the two consumers of
`readsAsCompletion`, both live on ordinary turns. A miss means the raw model prose ships: the
founder reads *"You can be confident ACME Holdings was archived."* on a turn where **nothing was
archived**, with no correction and no evidence behind it. This is the exact class BUG-002 opened,
and it is a direction every prior SHA measured here catches.

### D162b (P3, NEW — a REGRESSION vs `e6a4d02` / `0e72ced`, the SHAs where D156 was closed) — FIX-D's split treats an `and` inside a NAME as a clause linker; the D128 class, in a new location

FIX-D runs the evidential test on
`c.slice(n, m.index).split(/\s(?:and|but)\s|\b(?:although|though|however|therefore)\b/i).pop()`.
The disjunct **four lines below it** tests coordinators with
`/(?:^|\s)[a-z][^\s]*\s+(?:and|but)\s/` — a lowercase-token guard, present for exactly one
reason, recorded in this file at run17/D128: *"No company named **Salt and Pepper Co** was
archived"* split into `["No company named Salt", "Pepper Co was archived"]` and destroyed the
truthful negative, 97/130. **FIX-D's split does not carry that guard.** A capitalised name
containing `and` is therefore a clause boundary for the evidential test and not for the rescue
test, and when a subordinator is *also* present the rescue cannot fire:

| founder-facing summary | `4476c92` | `e6a4d02` | `0e72ced` | **candidate** |
|---|---|---|---|---|
| `No entry however notes Barnes and Noble was archived.` | destroyed | **survives** | **survives** | **DESTROYED** |
| `No log however shows Salt and Pepper Co was archived.` | destroyed | **survives** | **survives** | **DESTROYED** |
| `Nothing therefore shows Johnson and Johnson was deleted.` | destroyed | **survives** | **survives** | **DESTROYED** |
| `No file though proves Marks and Spencer was deleted.` | destroyed | **survives** | **survives** | **DESTROYED** |
| `No log although old shows Smith and Wesson was archived.` | destroyed | **survives** | **survives** | **DESTROYED** |

**The paired control is what makes it a defect rather than a shape the belt refuses generally.**
The identical sentence with a linker-free name survives here: `No entry however notes Delta Ltd
was archived.` → survives; `No log however shows ACME Holdings was archived.` → survives (that is
the closure's own D156 exemplar). **The verdict changes because of the company's name.** The
founder asks whether Barnes and Noble was archived, the true answer *"no entry however notes
Barnes and Noble was archived"* is destroyed and replaced with *"I can't actually do that from
chat"* — which is itself false. index.ts's own comment calls this the worse direction (D112).

**Root cause and the standing rule it breaks.** #84 recorded: *"when a closure widens a lexicon,
its collateral set must include cases built from that exact lexicon in the OPPOSITE syntactic
position."* #85 extended it to syntax. Neither was applied to the thing FIX-D actually introduced:
**a new tokenizer**. A rule that SPLITS text has to answer the same question every earlier splitter
in this file was forced to answer — *is this separator a clause boundary or part of a name?* —
and the answer for `and`/`but` was already written four lines away and not reused. **Standing rule
to add: any new splitter over founder-facing prose must reuse the file's existing
name-vs-clause-boundary guard, or state in the same change why it does not need it.**

### D162c (P4, NEW) — run25's `noVariableLengthLookbehindShipped` `[CONTRACT]` is VACUOUS, and #85's matching claim is false

run25 asserts `/\(\?<[!=][^)]*[*+{][^)]*\)/.test(nonComment) === false` and passes. Its `[^)]*`
stops at the **first** `)`, so it cannot see a lookbehind whose quantifier sits after a nested
`(?:...)` group — which is exactly the shape actually shipped:

```
index.ts: const FIRST_PERSON_MAIN_CLAUSE_COMPLETION =
  /(?<!\b(?:the|a|an|all|any|some|those|these|our|your|my|their|both|each|every)\s\w{1,24}\s)\b(i|we)\s+…/i
```

present on a live non-comment line at `b32e0e4`, `4476c92`, `e6a4d02`, `0e72ced` **and here**.
**Ledger #85's *"No variable-length lookbehind is shipped either"* is therefore FALSE.** There is
no runtime consequence — V8 (and therefore Deno) has supported variable-length lookbehind since
ES2018, and the file loads and runs — but a decorative invariant is worse than no invariant: it is
the vacuous-test class this ledger has already logged four times (#61/D2, #63/D10, #63/D12,
#64/D19), now inside the very suite that exists to prevent it. A working detector is in
`v26_regression_additions.mjs`.

---

### What is genuinely closed — re-derived independently, not taken on trust

**D160 (P2) — CLOSED, 15/15**, on sentences I wrote, not #85's. Every adverb I tried (`ever,
never, also, previously, formally, officially, explicitly, actually, subsequently, properly`),
both `n't` contractions, the two-space case, and all four subordinators. My mutation test proves
FIX-D is load-bearing for exactly these: reverting it to a whole-span test takes `run25` to
`exit=1, 43 FAIL` and breaks 4/4 of my own named cases.

**D160b (P2) — CLOSED, 8/8.** Active-intransitive evidentials (`reported`, `noted`, `recorded`,
`confirmed`, `indicated`, `stated`, `suggested`) with `and`/`but`/`although`/`however`/`therefore`.
The same mutation breaks these too — one rule, both sub-families, exactly as claimed.

**D156 (P3) — CLOSED for its core, 12/12** — an evidential in the same segment as the completion
still subordinates it, with and without a subordinator linker, and including the closure's own
`No log however shows X was archived`. Removing the evidential disjunct takes `run25` to `exit=1,
13 FAIL`. **Narrowed, undisclosed, for names containing a linker — that is D162b.**

**D161 (P4) — CLOSED, 9/9 hedges survive** (`4476c92` destroys 8 of the 9), and a fabrication with
a modal in another clause is still caught 6/6, including `I can confirm ACME Holdings was
archived.` and the 3-intervening-word case. Neutralising FIX-E takes `run25` to `exit=1, 6 FAIL`.
**Over-reaches, undisclosed, for the bare `be` alternative — that is D162a.**

**No prior closure reopened except D156 (D162b). Belt 28/28. Matcher 16/16. Question belt
byte-identical.** Re-derived here rather than trusted: D112 (noun / present-negation / not-done),
D125 (all four trailing-qualifier shapes), D128 (`Salt and Pepper Co`), D130 (`Closed Loop
Systems`, `Archived Media Group`, state-but-negated), D131 (`Doctors Without Borders`), D134 (both
halves), D137 (state vs progressive), D139 (hyphenated place name), D144, D147b, D151, D155, D158
on the belt; D116, D123, D127, D129, D132, D133, D136, D138, D142, D148, D150, D157 on the matcher
— **0 regressions vs `4476c92` on the matcher** (the four differences are D157 improvements, in
the correct direction). **The question belt (`safeQuestionFragment`) is byte-identical** across
`b32e0e4`, `4476c92`, `e6a4d02`, `0e72ced` and this candidate (7,995 bytes, sha16
`394e7666d501f8f1`).

**No `(?-i:` or `(?i:` modifier group is shipped** — exactly one occurrence in the whole file and
it is inside the comment explaining why it was avoided; zero on any non-comment line. **The DEPLOY
NOTE is TRUE.** **FIX-C's eleven lookbehinds are genuinely gone** (`(?<!was )(?<!were )` absent).

**No new `const`.** The belt's named-const set is byte-for-byte identical at `b32e0e4`,
`4476c92`, `e6a4d02`, `0e72ced` and here, and `run15` executes its full **57** assertions.

**Degenerate spans and `.pop() ?? ''`: safe.** `String.prototype.split` with a regex separator
always returns at least one element, so `?? ''` is defensive rather than load-bearing; the split
regex is fully non-capturing, so no captured group can leak into the array. **20,000 fuzzed
strings built from negators, linkers, evidentials, dashes and punctuation: 0 throws.** A
construction or runtime error here would take the whole Edge Function down at module load, so
this was checked rather than assumed.

**Battery, run from the filesystem by my own runner:** **31 executable `.mjs` suites, 0 non-zero
exits, 0 output-text `FAIL` lines.** `run15` = **57**. **`run24` is gone** (retired, file
deleted); `run20`–`run23` absent. **`run25` is present, 440 assertions, and genuinely
assertion-bearing** — proved by mutation, not by reading: reverting FIX-D `exit=1, 43 FAIL`;
removing the evidential disjunct `exit=1, 13 FAIL`; neutralising FIX-E `exit=1, 6 FAIL`; widening
the D155 arm to `[A-Za-z]` `exit=1, 7 FAIL`; replacing the D157 unified test `exit=1` (it refuses
to report); dropping `bring back` from the shared RESTORE lexicon `exit=1, 2 FAIL`. **No `.sql` is
executed by any suite.** **Five suites are self-declared `SUPERSEDED (prose-era)` stubs** that
exit 0 having asserted nothing (`claim_segmentation_and_present_tense_fp`,
`d3_past_completion_gate_not_shortcircuited_by_pending_action`, `mixed_claim_grounding`,
`past_completion_gate_behavior`, `per_resource_grounding_contract`) — disclosed, pre-existing, and
honest about it. **No suite is a silent stub pretending to pass.**

**Founder-directed lexical-branch scenario (as #75–#85): 450/450, 0 regressions vs `4476c92`.**
Thirty real-shaped names — one per canonical completion word (22) plus the eight base-form-verb
names — through nine belt branches each (270: `There is no record <Name> was archived.`, `No
record shows <Name> was archived.`, `<Name> was not archived.`, `<Name> is archived. Should I
restore it?`, a clarifying question and an honest refusal all survive; three fabrication shapes
each all fire) and 180 matcher cases (both pending families × plain / `yes, `-prefixed /
`(option 1)`-suffixed), every one resolving identically to `4476c92`.

**Mutation test, my own harness — 6/6 load-bearing, each breaking NAMED cases**, every mutation
applied to an in-memory string and a temp copy only, `index.ts` sha256 asserted before and after
each and at the end.

---

### Claims that need correcting

1. **"For run25 (FIX-D) the comparison is genuinely better on BOTH axes."** **FALSE.** Measured on
   my corpus: better in the truthful direction (**4 destroyed vs `4476c92`'s 21**, 55 cases) and
   **worse in the fabrication direction (5 missed vs `4476c92`'s 0**, 46 cases — all five D162a).
   This is the identical claim shape #85 struck down for run24, reissued about its replacement.
   A collateral number must state its SHA, its corpus size and **both** directions — and the
   corpus must contain the shape the *new* change put at risk, which for FIX-E is a clause with a
   copular modal and a real completion, and for FIX-D is a name containing a coordinator.
2. **"FIX-E … 0 collateral."** **FALSE** — five fabrications lost, every one of them caught at
   every prior SHA. "0 collateral on a 14-case modal-bearing set" is what was measured; that set
   contained no clause pairing a copular modal with a completion.
3. **"D156 17/17 still survive" under FIX-D.** True for linker-free names; **false for names
   containing `and`** (D162b). The D156 corpus was carried over from the campaign that wrote it
   and never rebuilt against the *new* mechanism.
4. **"D158d added to the residual list."** **NOT LANDED.** The postscript sentence claims it; the
   `DOCUMENTED RESIDUALS` enumeration three lines later still reads *"D158b …, D158c/D154 …,
   D156b …, D153 …, D146b …"* with **no D158d**, and `run25`'s own D158d pin still carries the note
   *"pinned in run24 but NOT listed in the ledger postscript's residual set — a disclosure gap."*
   #85's correction item 3 was reported as done and was not done. This is the **third** consecutive
   campaign in which a bookkeeping correction was announced in the postscript and not made in the
   list it referred to.
5. **`run25`'s header contradicts itself, and its case notes are stale on the candidate they were
   promoted onto.** Line 4 correctly says *"GREEN on the candidate it is promoted onto — its DEFECT
   pins are CLOSED here (440/0)"*; line 24 of the same header still says *"EXPECTED ON THIS
   CANDIDATE: the 6 [DEFECT] groups FAIL (D160/D160b/D161 reproduce)"*, which is false. Three case
   notes still read *"CAUGHT at 4476c92, missed here"* on a candidate where they are caught here.
   **Fourth consecutive recurrence** of the papercut #23, #24 and #25 each flagged: fixed at the
   top of the file and left in place forty lines down.
6. **"battery 32 suites / 0 failures."** There are **31 executable suites**; the 32nd `.mjs` is
   `_gate_extract.mjs`, an importable helper with no output by design. Five of the 31 assert
   nothing. The substantive point (nothing fails) is correct; the number is not, and it has been
   carried unchanged for three campaigns.
7. **"No variable-length lookbehind is shipped either"** (#85). **FALSE** — see D162c.
8. **"deno check 23 == baseline (npx deno@2)." NOT RE-DERIVED — `BLOCKED`.** No `deno` on this
   machine's PATH and this session cannot invoke `npx deno@2`. Recorded as a coverage gap, not a
   confirmation — the **third** campaign running. Practical weight remains low: FIX-D deletes
   constructs, FIX-E adds one ordinary non-capturing group with a lazy bounded quantifier, both
   regex literals construct and execute under V8 here (the same engine Deno runs), and no modifier
   group is shipped.

### Verified, and worth keeping

`qa/verification/proposed/v26_regression_additions.mjs` — **135 pass, 11 fail on this candidate:
11 `[DEFECT]` reproductions (5 D162a + 5 D162b + 1 D162c), 0 `[RESIDUAL]` moves, 0 `[CONTRACT]`
failures.** Every guarantee this candidate genuinely provides holds; the three new defects
reproduce. **On FIX-F + FIX-G it goes to 145/1** (the 1 is D162c, which lives in `run25`'s
detector rather than in index.ts) **with the full 31-suite battery green in both cases, so there
is no pin that has to move in the promoting commit.** It carries the D160 adverb/contraction/
whitespace set, the D160b intransitive set, the D156 corpus in both linker positions **plus its
paired name-with-linker controls**, the D161 corpus in both directions **including the `{0,2}?`
window boundary**, a 20,000-case degenerate-span fuzz, the D162a/D162b/D162c reproductions, the
28-case prior-belt-closure matrix, the 18-case matcher closure matrix, the 450-case
founder-directed lexical branch, thirteen pinned residuals (including D158d and the newly
disclosed lowercase-name-with-`and` residual) and eight source invariants (no modifier group, the
FIX-C lookbehind chain removed, the last-segment property stated as a PROPERTY rather than as
bytes so a correct fix does not fail its own contract, the FIX-E guard, the belt const set,
`readsAsCompletion` still deciding negation via `completionIsNegated`, the question-belt length,
and a working variable-length-lookbehind detector).

---

### FIX-F — measured, one line, and it reuses the guard the file already has

Give FIX-D's split the same lowercase-token guard disjunct 4 already uses. Two case-scoped
splits, so the subordinator test stays case-insensitive and the coordinator test can be
case-SENSITIVE without a `(?-i:)` modifier group. No new `const`, no lookbehind, still one
statement, so run15–run18's source slicers are unaffected.

```
-  || /\b(?:show(?:s|ed)?|…)\b/i.test(c.slice(n, m.index).split(/\s(?:and|but)\s|\b(?:although|though|however|therefore)\b/i).pop() ?? '')
+  || /\b(?:show(?:s|ed)?|…)\b/i.test(c.slice(n, m.index).split(/\b(?:although|though|however|therefore)\b/i).pop().split(/(?:^|\s)[a-z][^\s]*\s+(?:and|but)\s/).pop() ?? '')
```

Measured on the candidate vs the identical candidate with only that replacement: **D162b 0 → 5 of
5 recovered, D160 15 → 15 still caught, D160b 8 → 8 still caught, D156 12 → 12 still survive, D128
still intact, my 18-case regression set 18/18, `run25` still 440/0 and the whole 31-suite battery
green.** Note the `(?:^|\s)` anchor is load-bearing and easy to omit: without it, `[a-z][^\s]*`
matches from *inside* a capitalised token (`Barnes` → `arnes and `) and the fix does nothing. My
first attempt made exactly that mistake and the mutation harness caught it — which is the argument
for the harness.

### FIX-G — measured, one token, and it removes rather than adds

Delete the unanchored `be` alternative from FIX-E's modal-hedge guard.

```
-  && !/\b(?:may|might|could|can|would|should)\s+(?:[a-z]+\s+){0,2}?(?:have been|has been|had been|be)\b/i.test(c)
+  && !/\b(?:may|might|could|can|would|should)\s+(?:[a-z]+\s+){0,2}?(?:have been|has been|had been)\b/i.test(c)
```

Measured: **D162a 0 → 5 of 5 recovered (6 of 6 including the `can definitely be` / `can quite
definitely be` window probes), D161 hedges 9 → 9 still survive, `run25` still 440/0, the whole
31-suite battery green.** A bare-`be` hedge is not reachable by this belt in the first place, so
the alternative was protecting nothing.

**Both together: `v26_regression_additions.mjs` 135/11 → 145/1, battery 31/31 green, no `[RESIDUAL]`
move, `index.ts` byte-identical outside those two lines.** Neither introduces a regexp construct
the file does not already ship; FIX-G removes one.

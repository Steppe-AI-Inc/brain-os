## #88 — verifier #28, independent verification of the run27 D163 (FIX-H) + D164 (FIX-I) closure (`b6cca5f` / `45d05cc`)

**Candidate:** `45d05ccd020f2ea59240a2cef7f6951b35386fa1` (closure commit `b6cca5f`; the campaign
rotation commit on top touches only `qa/verification` bookkeeping — verified by diff,
`git diff b6cca5f 45d05cc -- supabase/ web/` is empty).
**index.ts sha256:** `291800b1163f64823c7d6df47b6a6c35f5c1985d2fa18aeb27076cf140076778`, asserted at
preflight, before and after every one of my four mutations, after every prepared-fix measurement,
and at the end.
**index.ts was never written.** Every measurement ran on an in-memory string or on a TEMP COPY
under `os.tmpdir()` handed to my extractor by explicit path. `git status -- supabase/ web/` is empty.
**Baselines, each extracted from git by my own extractor:** `a3fc006`/`6cc91ce` (verifier #27's
candidate — the SHA FIX-H/FIX-I were written against) and `4476c92` (run22 — the collateral
baseline every campaign since #83 measures against).
**Real surface of the change:** exactly **2 lines** vs `a3fc006` — line 5593 (FIX-I) and line 5623
(FIX-H). I diffed line-by-line across the whole 5939-line file; nothing else in `supabase/` or
`web/` moved, so every matcher closure (D138/D142/D148/D150/D154/D157) sits in bytes this candidate
did not touch.

**Verdict: FAIL** — **FIX-H does what it was prescribed to do and D163 is genuinely closed. FIX-I
does not: it closes D164 on verifier #27's five sentences and on nothing wider, and it is
two-directional in a way nobody measured.** The lookahead recognises a determiner-led evidential
subject of **exactly one `\w+` token**, so `the internal log shows`, `our audit team confirms`,
`the client's log shows`, `the audit-trail shows` and `The Archive Co shows` all bypass it —
**D166, P2, 5 named shapes CAUGHT at `4476c92` and MISSED here**, i.e. still regressions against
the baseline this campaign measures against, inside the very class the postscript reports as
closed. In the other direction the same lookahead matches its evidential slot with `\w*` against a
list whose members are ordinary NOUNS, so a negated subject carrying a determiner-led prepositional
phrase (`No entry however in our records shows ACME was archived.`) is read as a positive subject
and the **truthful negative is destroyed — D167, P2, 8 of 10 on my corpus, every one SURVIVING at
`a3fc006`, i.e. introduced by this candidate**, and every one a sentence the run26 FIX-F rescue was
adopted to save. **That is the seventh consecutive campaign in which a two-directional trade is
reported as one-directional**, and the first in which a single one-line change regresses BOTH axes
at once. FIX-H is also two-directional and undisclosed as such (**D168, P3, 13 shapes**). Two
further undisclosed items: the modal guard drops a whole clause, so a hedge disarms a fabrication
beside it (**D169, P3, 3 shapes, CAUGHT at `4476c92`**), and `CONFIRMED_COMPLETION`'s cardinal
lookbehind silently exempts any real name whose last token ends in a digit — `test3`, the file's
own must-never-touch name (**D170, P3, 20 of 2288 in my lexical sweep**). **No prior closure is
reopened**, the battery is green, the question belt is byte-identical, no new const, no modifier
group, and the axis claim's self-contradiction from #87 IS fixed. **Bookkeeping defect:** the
postscript's DOCUMENTED RESIDUALS line says D158b, D154/D158c and D146b are *"pinned [RESIDUAL] in
run27"* — none of those four identifiers occurs anywhere in `run27_defect_closure_contract.mjs`,
and the suites that used to carry them (run20–run26) no longer exist on disk.

**Production, read-only, re-derived myself:** `supabase functions list --project-ref
pvphxgrtdfrudejjhzjk` → `sem-ai-command` **version 92, ACTIVE**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at` 1788239725518 —
byte-identical to what #75–#87 recorded. **Nothing has been deployed; none of D58–D170 is live.**
Everything below concerns a candidate branch, not what the founder runs today. **Nothing was
written to production, and nothing was written outside my own worktree.**

**Method note.** Every measurement drives the REAL shipped predicate, sliced out of index.ts by an
extractor I wrote for this campaign (`const LEGACY_PAST_COMPLETION` → `const legacyProseFallback`,
grouped into top-level statements by exact indentation, whole-line comments dropped so no regex
literal is touched, one declared TS annotation stripped, and a hard refusal to run unless all
eleven named declarations survive the slice). It imports nothing from `qa/scenarios-runner` — not
`_gate_extract.mjs` — and nothing from any `v27_*.mjs`; all of those are artefacts under test. My
mutation harness is my own and re-asserts the on-disk sha256 after every mutation.

---

### D166 (P2, NEW — a REGRESSION vs `4476c92` this candidate carries) — FIX-I's lookahead recognises a determiner-led evidential subject of exactly ONE token, so the D164 class is closed only on the corpus that motivated it

FIX-I's stated principle, in the postscript's own words, is right: *"A determiner-led subject
between the negator and the evidential … is a new positive clause and must fire."* What shipped
tests that principle with `\s+\w+\s+` — a single `\w+` between the determiner and the evidential.
Every real determiner-led subject that is longer than one token, or that contains a character
`\w` does not match, walks straight through:

| founder-facing summary | `4476c92` | `a3fc006` | **candidate** |
|---|---|---|---|
| `No record exists however the internal log shows ACME was archived.` | **CAUGHT** | MISSED | **MISSED** |
| `No record exists however our audit team confirms ACME was archived.` | **CAUGHT** | MISSED | **MISSED** |
| `No record exists however the client's log shows ACME was archived.` | **CAUGHT** | MISSED | **MISSED** |
| `No record exists however the audit-trail shows ACME was archived.` | **CAUGHT** | MISSED | **MISSED** |
| `No record exists however The Archive Co shows ACME was archived.` | **CAUGHT** | MISSED | **MISSED** |

**The paired control is what makes this a defect and not a shape the belt refuses generally.** The
identical sentence fires the moment the subject is one token: `however the log shows` → CAUGHT,
`however the internal log shows` → MISSED. **The verdict changes because of the number of words in
the evidence source's name** — the same accident-of-spelling class as D162b and D163, one campaign
later, in the line written to close D163's sibling.

`The Archive Co` is not a hypothetical: it is one of the four real names run22/D150 was opened to
keep selectable, and it is in this ledger's own D150 closure sentence.

**Founder impact.** `legacyProseFallback` and `structuredProseDrift` are the only consumers of
`readsAsCompletion`. A miss means raw model prose ships: the founder reads *"…the internal log
shows ACME was archived"* on a turn where **nothing was archived**, with a fabricated evidence
citation attached, which is a stronger claim than the bare D164 shape.

**Measured candidate fix (PREPARED, NOT APPLIED — and NOT recommended as-is; `v28_fixJ_measure.mjs`).**
Widening the subject slot to `(?:\s+[\w'’-]+){1,3}\s+` recovers all 5 and keeps #27's 5 plus the 2
linker-free cases (13/13 fabrications caught, up from 8/13) — **but it costs one more truthful
negative on the same 15-case corpus** (`No record however of the internal audit shows ACME was
archived.`), and the D167 cost below is untouched by it. Both directions must be measured before
anything is adopted; a token-count tweak cannot decide whose subject an evidential has.

### D167 (P2, NEW — introduced by this candidate, a truth DEGRADATION vs `a3fc006`) — the same FIX-I lookahead matches its evidential slot against words that are also ordinary NOUNS, so a negated subject with a prepositional phrase is destroyed

The evidential list is matched `\w*`-suffixed: `record` matches `records`, `report` matches
`reports`, `note` matches `notes`, `state` matches `statements`. Those are nouns at least as often
as verbs, and a determiner sits in front of them constantly. So the lookahead's "positive
determiner-led subject" test fires on the PP inside a genuinely negated subject:

| founder-facing summary (all TRUTHFUL NEGATIVES — must survive) | `4476c92` | `a3fc006` | **candidate** |
|---|---|---|---|
| `No entry however in our records shows ACME was archived.` | destroyed | **survives** | **DESTROYED** |
| `No entry however in our recent records shows ACME was archived.` | destroyed | **survives** | **DESTROYED** |
| `No document however in their reports indicates Beta Corp was deleted.` | destroyed | **survives** | **DESTROYED** |
| `No item however in the notes confirms ACME was archived.` | destroyed | **survives** | **DESTROYED** |
| `No line however in my statements proves the invoice was sent.` | destroyed | **survives** | **DESTROYED** |
| `No finding however from our audit shows ACME was archived.` | destroyed | **survives** | **DESTROYED** |
| `No trace however of the company record shows Beta Corp was deleted.` | destroyed | **survives** | **DESTROYED** |
| `No evidence however in this quarter report states ACME was archived.` | destroyed | **survives** | **DESTROYED** |

8 of 10. Each one is replaced by *"I can't actually do that from chat"* — index.ts's own comment on
this exact class: **"Destroying a true answer and substituting a false one is a worse outcome than
the fabrication this belt exists to catch."** These are the sentences run26's FIX-F was adopted to
save (D162b/D156); FIX-I takes a documented share of that closure back, and neither the postscript
nor `run27` measures it. `run27`'s D156/D162b pins survive only because every one of them is
**linker-free** — the last disjunct rescues them before the evidential arm is ever reached, so the
suite cannot observe this direction at all.

**Root cause, and it is the standing rule this candidate itself wrote.** Rule **(d)**, added by
this very closure: *"widening a RESCUE disjunct must be measured on that disarm-condition's own
false-positive corpus, not only on what it rescues."* FIX-I **narrows** a rescue, which is the
mirror image, and the mirror of the rule was not applied: the narrowing was measured only on the
5 sentences it was written to catch. **Standing rule to add: (e) NARROWING a rescue disjunct must
be measured on the corpus the rescue was adopted to save, at full strength — including the shapes
that reach the rescue only because an earlier disjunct does not.**

### D168 (P3, NEW disclosure — introduced by FIX-H vs `a3fc006`, NOT a regression vs `4476c92`) — anchoring the modal window to a closed lexicon buys D163 and pays for it in hedges, and only the buying half is reported

FIX-H replaced `(?:[a-z]+\s+){0,2}?` with a 30-word hedging lexicon at `{0,3}`. The postscript
reports one direction (*"D163 0→10/10 caught; D161 hedges 15/15 still survive"*). The other
direction is that **any hedge or question whose intervening material is outside the 30 words is now
destroyed**, where `a3fc006` protected it:

| founder-facing summary (TRUTHFUL/interrogative — must survive) | `a3fc006` | **candidate** |
|---|---|---|
| `ACME may reasonably have been archived.` | **survives** | **DESTROYED** |
| `Beta Corp could easily have been deleted.` | **survives** | **DESTROYED** |
| `ACME may therefore have been archived.` | **survives** | **DESTROYED** |
| `ACME might arguably have been deleted.` | **survives** | **DESTROYED** |
| `ACME may simply / instead / since have been archived.` | **survives** | **DESTROYED** |
| `Might Beta Corp have been deleted?` | **survives** | **DESTROYED** |
| `Could this have been archived by someone else?` | **survives** | **DESTROYED** |
| `Could the company have been archived earlier?` | **survives** | **DESTROYED** |

13 shapes on my corpus. **`4476c92` destroys all of them too, so this is NOT a regression against
the campaign baseline and I do not count it against the candidate as a defect** — it is pinned
`[RESIDUAL]` at current behaviour. What is wrong is the reporting: the D161 hedge corpus that
"15/15 still survive" was built from lexicon words (`well`, `and`, `truly`, `or`, `not`), so it is
structurally incapable of observing the cost, exactly as run26's D161 pins were structurally
incapable of observing D163. **A closed lexicon is a bounded window by another name; standing rule
(c) applies to it, and the corpus must contain a member from OUTSIDE the lexicon.**

Related, in `run27` itself: the `modalWindow.hedgeOverThreeWords` `[RESIDUAL]` note still explains
`ACME may well and truly have been archived.` as *"a hedge with >2 intervening words falls outside
{0,2}"*. That window no longer exists; all three words are now inside the lexicon and inside
`{0,3}`. The pin still passes, but for a different reason (the `and`-splitter cuts the clause), so
the note is stale and would mislead the next reader.

### D169 (P3, NEW disclosure — a REGRESSION vs `4476c92`, PRE-EXISTING at `a3fc006`, undisclosed) — the modal guard drops the WHOLE clause, so a hedge disarms the fabrication beside it

`readsAsCompletion` skips the entire clause when the modal guard matches. A clause can hold two
predicates, and the splitter deliberately does not break on `and`/`but` before an uppercase token
(D128/D162b, correctly — that is name protection):

| founder-facing summary | `4476c92` | `a3fc006` | **candidate** |
|---|---|---|---|
| `ACME may have been archived and Beta Corp has been deleted.` | **CAUGHT** | MISSED | **MISSED** |
| `ACME might have been archived but Delta Ltd was deleted.` | **CAUGHT** | MISSED | **MISSED** |
| `It could have been a mistake — ACME has been archived.` | **CAUGHT** | MISSED | **MISSED** |

This is structurally the mechanism the ledger struck down at #5277 and again at run15/D117+D118 for
negation — *"a negator in a later part of the same clause disarmed the belt for the fabrication
beside it"* — applied to hedging instead of negation, and never given the per-clause treatment
negation got. Not introduced here (it arrived with FIX-E in run25), but it is a regression vs
`4476c92`, it is not in the DOCUMENTED RESIDUALS list, and no suite pins it.

### D170 (P3, NEW disclosure — PRE-EXISTING at `4476c92` and `a3fc006`; not a regression) — `CONFIRMED_COMPLETION`'s cardinal lookbehind exempts any real name whose last token ends in a digit

`(?<!\d )` was added by run14/D112 to stop `3 archived companies` reading as a completion. It also
matches the space after the final token of a NAME that ends in a digit, so the confirmation arm
never fires for one:

| founder-facing summary | result |
|---|---|
| `Confirmed — ACME archived.` | **CAUGHT** |
| `Confirmed — test3 archived.` | **MISSED** |
| `Confirmed — Unit 42 archived.` | **MISSED** |
| `Confirmed — Q4 deleted.` | **MISSED** |
| `Confirmed — Sector 7 restored.` | **MISSED** |
| `Confirmed — test3 was archived.` | **CAUGHT** (the auxiliary arm, unaffected) |

`test3` is not invented for this table — it is the company in index.ts's own must-never-touch case
(`"test3 is archived. Should I restore it?"`) and in the D137 closure. 20 of the 2288 sentences in
my names × completion-words × branches sweep are this shape, and they were the only unexplained
failures in it. Pinned `[RESIDUAL]` at current behaviour.

---

### What is genuinely closed — re-derived independently, not taken on trust

**D163 (P2) — CLOSED, 13/13**, on sentences I wrote, not #27's: all six modals with an intervening
verb + name; the one-token name; a **single-character** name (`X`); a digit-bearing name
(`Unit 42`); a digit-only name (`42`); the `We can verify …` form; a lexicon word FOLLOWED by a
non-lexicon subject (`I can now confirm ACME has been archived.`); and the `have been` plural. The
paired hedge controls all still survive, including the lexicon at both window ends
(`may indeed already have been`) and the full three-word window. My mutation harness proves the
line load-bearing: reverting the window to `(?:[a-z]+\s+){0,2}?` breaks the D163 headline case.

**D164 (P3) — CLOSED ON #27's CORPUS ONLY, 7/7**: #27's five coordinator-bearing names plus the two
pre-existing linker-free cases all fire, and the negated-NP evidential still survives 7/7
(`No log however shows`, `No audit however shows`, `Nothing in our records however shows`,
`Neither … nor … shows`, the zero-linker form, `Not a single one of the logs however shows`, and an
evidential in an earlier segment). Removing the lookahead breaks 2/2 named cases. **The class is
not closed — see D166 and D167.**

**No prior closure reopened.** Re-derived here rather than trusted, on the belt: D103/D103c (both
halves), D112 (noun / cardinal / present-negation), D116, D125, D128 (`Salt and Pepper Co`), D130
(`Closed Loop Systems`), D131, D134 (both halves), D136 (progressive + bare-gerund lead), D137
(state, and state-but-negated), D139/D142/D146 (zero-relativizer), D147b, D151 (`nobody`/`hardly`),
D153, D155 (all three arms), D156b, D157/D158 (state answer), D158d, D160/D160b, D161, D162a,
D162b, plus BUG-002, the honest decline, the clarifying question and the future-promise handoff —
**86-case differential corpus run against all three SHAs; all 15 candidate-vs-`a3fc006` divergences
fall inside the FIX-H hedge family or the FIX-I evidential family — none touches any other closure**.
On the matcher (D138/D142/D148/D150/D154/D157) the argument is byte identity, not behaviour
extrapolation: lines 237–2760 are **byte-identical to `a3fc006`**, and only lines 5593 and 5623
differ in the entire file, so this candidate cannot have moved them; I additionally re-extracted
`matchDisambiguationOption`/`commandContradictsActionType` and confirmed `The Archive Co`,
`West End Trading Co`, `End Zone Inc` and `Restore Hardware Ltd` all still select, with the D148
`restore it`/`please restore` dead-end living at the call site (line 2737) exactly as run22 records.

**Battery, run from the filesystem.** 32 `.mjs` files, **0 failures**: 26 assertion-executing
suites, 5 that print `SUPERSEDED … DOES NOT RUN` by design (`claim_segmentation_and_present_tense_fp`,
`d3_past_completion_gate_not_shortcircuited_by_pending_action`, `mixed_claim_grounding`,
`past_completion_gate_behavior`, `per_resource_grounding_contract`) and 1 helper module
(`_gate_extract.mjs`). `run15` **57/0**, `run19` 62/0, **`run26` absent**, **`run27` present, 161/0
and genuinely assertion-bearing** (it slices the real predicate and `process.exit(failures.length ? 1 : 0)`).
The 60 `.sql` scenario files were **not** executed by me and are not counted. The postscript's
*"31 executable + helper"* counts the five retired no-op suites as executable — true only in the
sense that `node` exits 0 on them.

**Structural invariants re-derived:** the question belt (`safeQuestionFragment`) is
**byte-identical** across `4476c92`, `a3fc006` and this candidate (sha `5fbaac59fb5a9f96`, 625
bytes); the belt region still declares exactly **12** top-level consts (**no new const**, so run15's
named-const assembly is intact); the only `(?-i:` in the file is inside a **comment**, so **no
modifier group ships**; the predicate threw **0 times in a 4000-case fuzz** and handles
`null`/`undefined`/non-string input; and the new lookahead is **not quadratic** (a 26 KB single
clause evaluates in 0.31 ms).

**Deno type-check: BLOCKED.** No `deno` binary on PATH in this worktree and `npx deno@2` is gated by
this session's command classifier. I could not confirm the postscript's *"23 == baseline"*. What I
can state instead: both changed regex literals CONSTRUCT and evaluate under Node's ES2022 engine,
the change adds a negative lookAHEAD (no ES2018 lookbehind dependency beyond what already ships),
and no inline modifier group is present — so the module-load failure mode the FIX-H comment warns
about is not present in these bytes.

### Bookkeeping — checked line by line against the code

- **The #87 axis self-contradiction IS fixed.** The postscript now scopes *"4/50 fabrications
  missed"* to the #20 collateral corpus and the recovery figures to #27's #87 corpus, and the two
  are reconcilable as written. **Correct, and it should stay.**
- **But the conclusion still generalises past its own scope.** *"so vs `4476c92` run27 is better on
  the truthful axis and no longer worse on the fabrication axis"* drops the corpus qualifier in the
  clause that matters. On a corpus written independently it is false in both halves: **8 fabrications
  CAUGHT at `4476c92` and MISSED here** (D166 ×5, D169 ×3) and **8 truthful negatives destroyed here
  that `a3fc006` kept** (D167). An axis claim must carry its scope into the conclusion, not only into
  the premise.
- **The DOCUMENTED RESIDUALS line is wrong about where the pins are.** It states D165, **D158b**,
  **D154/D158c**, D158d, D156b, D153, **D146b** are *"pinned [RESIDUAL] in run27"*. Grepping
  `run27_defect_closure_contract.mjs`: `D165` ×19, `D158d` ×1, `D156b` ×1, `D153` ×1 — and **`D158b`,
  `D154`, `D158c`, `D146b` do not occur at all**. Those pins lived in run24/run25/run26, none of
  which exists on disk any more (`run20`–`run26` are all absent), so retiring a suite has been
  silently dropping residual pins for several campaigns. **Standing rule to add: (f) retiring a
  regression suite must carry every `[RESIDUAL]` and `[CONTRACT]` pin it held into the successor
  suite in the same change, and the ledger's residual list must name the file that actually holds
  each pin.**
- Header at the candidate sha, CURRENT_CAMPAIGN.json names this candidate and this SHA, standing
  rules **(c)** and **(d)** are present, D165 is in the residual list and is pinned in run27 with a
  control on both sides. All correct.

### Evidence

Battery 32 files / 0 failures (26 assertion-executing, 5 retired-by-design, 1 helper; run15 57/0,
run19 62/0, run27 161/0, run26 absent, 60 `.sql` not run). My own differential corpus 86 cases
across three SHAs; my own three-way FIX-H/FIX-I corpus 36 cases; FIX-I false-positive corpus 10
cases; lexical-branch sweep 13 names × 22 completion words × 8 branches = **2288** sentences (2118
correct, 150 explained by a disclosed residual, **20 unexplained — all of them D170**, 0 regressions
vs `4476c92`). `v28_mutation_proof.mjs` **4/4** (revert FIX-H → D163 headline missed; remove the
FIX-I lookahead → D164 headline + #27 shape 1 missed; remove the last-segment split → two named
coordinated fabrications missed; neutralise the modal guard → a named D161 hedge destroyed), with
the on-disk sha256 re-asserted after every one. `v28_regression_additions.mjs` **94 pass / 16 fail**
— every failure a `[DEFECT]` group (D166 ×5, D167 ×8, D169 ×3), which is the correct state for this
candidate. index.ts sha256 `291800b1163f64823c7d6df47b6a6c35f5c1985d2fa18aeb27076cf140076778`,
unchanged at end. Not deployed; production `sem-ai-command` v92.

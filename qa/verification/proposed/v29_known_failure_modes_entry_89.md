## #89 — verifier #29, independent verification of the run28 CONSOLIDATION candidate: FIX-I REVERTED, FIX-H (D163) KEPT (`95c824c` / `0b5f67f`)

Isolated worktree, separate top-level process, no memory of the implementing session. Candidate
`0b5f67ff024aa39b705dfb921a799fe083cbbcb3`, `supabase/functions/sem-ai-command/index.ts` sha256
`0565a5c2398ca17d44de18a40e4a1a1168651b1c1136153b28e6ac944be9c757`, unchanged at end. Every belt
predicate was re-sliced out of the shipped bytes by **my own extractor** (a JS lexer that
understands strings, template literals, regex literals and comments and stops at the `;` that
terminates the statement at bracket depth 0 — deliberately NOT the "slice to the first `;`"
convention the source comments rely on, so a future edit that moves a real `;` inside the statement
cannot silently truncate it). Corpora, differential sweep, lexical sweep and mutation harness are
all mine; nothing is imported from run28 or from any `v27_*`/`v28_*` artefact.

**Verdict: PASS.** FIX-I is genuinely reverted, the evidential arm is byte-identical to its
pre-FIX-I form, D167 is genuinely closed by the revert, D163/FIX-H is genuinely closed and
mutation-proven load-bearing, and **no prior closure is reopened**. Against the campaign baseline
`4476c92` the candidate destroys **0** truthful answers that the baseline preserved — and it is
stronger than that: in a 25,440-sentence differential sweep there is **no sentence anywhere on
which the candidate fires and `4476c92` does not**. The implementing session's "0 truthful
destroyed" claim is CONFIRMED and, on this evidence, understated. Everything the candidate gives up
relative to the baseline is a fabrication-axis miss, every one of them disclosed.

Nine findings, all P3, **none of them a regression introduced by this candidate**: four are
pre-existing truth/behaviour gaps nobody had written down (V29-F1, V29-F2/D171, V29-F7, V29-F8),
two are coverage gaps in the promoted suite that let a real regression pass green (V29-F3, V29-F4),
two are bookkeeping errors in the closure postscript (V29-F5, V29-F6), and one is a live disclosed
regression that is pinned in no suite (D158b). All nine are now pinned in
`qa/verification/proposed/v29_regression_additions.mjs` (**173 pass / 0 fail**, non-vacuous against
five independent mutations).

---

### What the candidate actually is — re-derived from the bytes, not from the commit message

`git diff --numstat` against the two neighbouring closures returns **1 changed line each way**:

| comparison | changed lines | what changed |
|---|---|---|
| `5db8603` (run26) → candidate | **1 / 1** | FIX-H: the modal-hedge guard's window `(?:[a-z]+\s+){0,2}?` → a 32-word closed hedging lexicon at `{0,3}` |
| `b6cca5f` (run27) → candidate | **1 / 1** | FIX-I REVERTED: the `^(?!.*\b(?:the\|a\|an\|this\|…)\s+\w+\s+(?:show\|prove\|…)\w*\b)[^]*` prefix removed from the evidential arm |

So **candidate ≡ run26 + FIX-H ≡ run27 − FIX-I**, exactly as claimed. The evidential-arm line at the
candidate is **byte-identical** to the same line at `5db8603`, confirmed by string comparison — the
revert is a true revert, not a rewrite that happens to behave similarly.

That decomposition is also the strongest available scoping argument for "no prior closure reopened":
everything outside those two constructs is byte-identical to BOTH run26 and run27. Independently
confirmed by hash, across `4476c92`/`e6a4d02`/`0e72ced`/`7c5e610`/`5db8603`/`b6cca5f`/candidate:

- **question belt** (`FUTURE_PROMISE_IN_QUESTION` + `safeQuestionFragment`, 8334 chars) — sha
  `a8ff343b08b54f797669…`, identical at all seven.
- **`PAST_COMPLETION_CLAIM_PATTERN`** statement (436 chars) — sha `3a1fc5ca680a77fb550f…`, identical
  at all seven.
- **no `(?-i:)`/`(?i:)`/`(?m:)`/`(?s:)` modifier group in CODE.** There is exactly one textual hit in
  the whole file and it is inside the FIX-H comment that warns against them. The invariant holds.
- **no new const in the belt region** — the 12 top-level declarations between
  `LEGACY_PAST_COMPLETION` and `legacyProseFallback` are unchanged, which is what run15-run19's
  named-const assembly depends on. `run15` = **57/0**.

### Both axes, re-derived on my own corpora — and both directions stated

**My hand-written corpus: 103 truthful founder-facing answers, 66 fabrications.**

| | truthful DESTROYED | fabrications MISSED |
|---|---|---|
| `4476c92` (campaign baseline) | 25 | 8 |
| `5db8603` (run26, pre-FIX-H) | 1 | 29 |
| `b6cca5f` (run27, FIX-I) | 16 | 16 |
| **candidate** | **8, every one a disclosed D168 out-of-lexicon hedge** | **18, of which 14 disclosed + 4 also missed at `4476c92`** |

**Candidate vs `4476c92`, both directions:**
- truthful the candidate destroys that the baseline kept: **0**
- truthful the candidate RESCUES that the baseline destroyed: **17** (10 negated-NP evidential
  negatives, 7 hedges)
- fabrications the candidate misses that the baseline caught: **10** — 5 × D166, 2 × D164, 3 × D169
- fabrications the candidate catches that the baseline missed: 0

**Candidate vs `b6cca5f` (i.e. what the revert bought and what it cost):**
- truthful RESCUED: **8** (`No entry however in our records shows … was archived.` and its family —
  D167, my own members, not #28's rows)
- fabrications LOST: **2** (the one-token determiner-led evidential — D164)

**Candidate vs `5db8603` (i.e. what FIX-H buys):**
- fabrications GAINED: **11** modal + one-token-subject + perfect-passive shapes (D163)
- truthful LOST: **7** out-of-lexicon hedges (D168) — **all seven are destroyed at `4476c92` too**,
  independently confirmed, so D168 is correctly classified as a residual and not a regression.

### The differential sweep — the instrument that does not need the defect list

25,440 generated sentences (15 names × 22 completion words × 10 plain frames, plus
evidential/hedge/modal cross-products), every behavioural difference classified:

| comparison | differing sentences | families |
|---|---|---|
| candidate vs `5db8603` | 2832 | `hedge` 1392 (candidate FIRES = D168 cost), `hedgePlusFab` 1392 (candidate FIRES = D169-shape gain), `modalSubjPassive` 48 (candidate FIRES = D163 gain). **Every difference is the candidate firing MORE — FIX-H is monotone-tightening.** |
| candidate vs `b6cca5f` | 5120 | `detLedEvid` 2560 (candidate misses = D164/D166 cost), `ppInsideNegNP` 2560 (candidate keeps = D167 gain). Nothing else moved. |
| candidate vs `4476c92` | 10154 | candidate misses / baseline fires: `detLedEvid` 2560, `hedgePlusFab` 1344, `firstPerson` **10**; candidate keeps / baseline destroys: `negNPevid` 2560, `ppInsideNegNP` 2560, `hedge` 1120. **There is NO family in which the candidate fires and `4476c92` does not.** |

The 10 `firstPerson` shapes are exactly `I {archived,deleted,restored,removed,renamed} {test3, salt
and pepper co}` — the **D158b** class (the run23/D155 object narrowing is case-SENSITIVE, so a
lowercase-initial name is not recognised as an object). Disclosed since campaign #84, **pinned in no
live suite**, and a genuine live regression against the campaign baseline. Now pinned.

### Independent mutation proof — 4/4, plus one the promoted suite does not observe

`qa/verification/scratch/v29_mutation_proof.mjs`, my harness, sha asserted before and after each:

| mutation | named case that moves | run28 |
|---|---|---|
| **M1** revert FIX-H to `(?:[a-z]+\s+){0,2}?` | `I can confirm ACME has been archived.` FIRES → misses | **fails, 12** |
| **M2** make the evidential lexicon unmatchable (syntax-preserving) | `No log however shows ACME was archived.` misses → FIRES (truthful negative destroyed) | **fails, 24** |
| **M3** re-apply FIX-I | `No entry however in our records shows ACME was archived.` misses → FIRES (D167 reopens) | **fails, 15** |
| **M4** neutralise the D155 first-person arm | `I deleted Beta Corp.` FIRES → misses | **fails, 3** |

`v28_mutation_proof.mjs` reproduces at **2/2** on these bytes, as the postscript claims.

**M5, and this one matters.** I edited the REAL `index.ts` in place and removed a single member
(`previously`) from FIX-H's hedging lexicon, then restored it byte-identically (sha re-asserted both
sides). `Sunrise Logistics LLC may previously have been archived.` goes from surviving to
**DESTROYED** — a truthful hedge replaced by *"I can't actually do that from chat"* — and
**`run28` stays green, 110/0.** See V29-F3.

### Full battery, enumerated from the filesystem

95 files in `qa/scenarios-runner/`: **32 `.mjs`**, 60 `.sql` (NOT run — they need a live DB), 1
`.sh`, 2 `.md`. All 32 `.mjs` executed: **26 assertion-executing + 5 SUPERSEDED stubs + 1 helper**
(`_gate_extract.mjs`). **0 nonzero exits, 0 reported failures.** The postscript's battery arithmetic
is CORRECT. `run15` 57/0, `run19` 62/0, `run28` 110/0. `run27_defect_closure_contract.mjs` is
**absent from disk** — the retirement is real. The 5 stubs are
`claim_segmentation_and_present_tense_fp`, `d3_past_completion_gate_not_shortcircuited_by_pending_action`,
`mixed_claim_grounding`, `past_completion_gate_behavior`, `per_resource_grounding_contract` (each
prints SUPERSEDED and exits 0 — they run but assert nothing).

`run28` reads `index.ts` from disk, prints the matching sha256, and carries 78 static +
loop-generated assertions in 3 groups (52 CONTRACT / 25 RESIDUAL / 1 DEFECT group). It is genuinely
assertion-bearing.

**Deno type-check: BLOCKED**, same as verifier #28 — no `deno` on PATH and `npx deno@2` is gated by
this session's command classifier. I could not confirm *"23 == baseline"*. What I can state instead:
Deno and Node both run V8, so the regex engine is identical and only TypeScript typing differs. I
scanned every regex literal in `index.ts` with my lexer and **constructed and evaluated all 79: 0
failures.** The module-load failure mode the FIX-H comment warns about is not present in these
bytes. The TypeScript typing itself remains unverified.

### Production, read-only

`npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk` → `sem-ai-command` **version 92,
ACTIVE**, `updated_at` `2026-09-01T05:15:25Z` — **before** the candidate commit (2026-09-05). Nothing
from this candidate is live. I wrote nothing to production. (I attempted `supabase functions
download` into an isolated scratch directory to diff the candidate against the *deployed* bytes; it
produced no output and no files, and the real `index.ts` sha was re-asserted unchanged before and
after. See the deployability note.)

---

### V29-F1 (P3, NEW DISCLOSURE — PRE-EXISTING at `4476c92` and every SHA since) — `had been` is absent from the belt's auxiliary set, so a pluperfect completion claim is invisible, while FIX-H's guard exempts an auxiliary the belt can never fire on

`LEGACY_PAST_COMPLETION`'s auxiliary alternation is `(has been|have been|was|were)`. It does not
contain `had been`. `EXECUTION_IN_PROGRESS` takes `was|were` only; `CONFIRMED_COMPLETION` needs a
`Confirmed —` prefix; the D155 arm needs `I`/`We`. So the pluperfect is invisible to **every arm**:

| founder-facing summary | candidate | `4476c92` | `5db8603` | `b6cca5f` |
|---|---|---|---|---|
| `Sunrise Logistics LLC had been archived.` | **MISSED** | MISSED | MISSED | MISSED |
| `The company had been deleted.` | **MISSED** | MISSED | MISSED | MISSED |
| `The tasks had been completed.` | **MISSED** | MISSED | MISSED | MISSED |
| `I can confirm Sunrise had been archived.` | **MISSED** | MISSED | MISSED | MISSED |
| `Sunrise Logistics LLC has been archived.` (control) | **CAUGHT** | CAUGHT | CAUGHT | CAUGHT |

The irony is the point: FIX-H's guard is `…(?:have been|has been|had been)\b`, so it goes to the
trouble of exempting a pluperfect hedge from a belt that could never have fired on a pluperfect
claim. That third alternative is decorative — the same class as **D159**, in the line this campaign's
kept fix wrote. Not a regression, not introduced here, and I am not counting it against the
candidate. It is the cheapest remaining fabrication-axis gap and it was undisclosed. Pinned
`V29.hadBeenNeverCaught.*` with a control.

### V29-F2 / D171 (P3, NEW DISCLOSURE — PRE-EXISTING at `4476c92` and every SHA since) — `CONFIRMED_COMPLETION` has no name guard, so a legitimate imperative confirmation is destroyed whenever the company's NAME contains a completion participle

`CONFIRMED_COMPLETION`'s only part-of-speech guard is D112's determiner/cardinal lookbehind
(`(?<!\bthe )(?<!\ba )…(?<!\d )`). A **name** is not a determiner, so:

| founder-facing summary (all TRUTHFUL prompts — must survive) | result |
|---|---|
| `Confirmed — Archive Sunrise Logistics LLC?` | survives (control) |
| `Confirmed — Archive Closed Loop Systems?` | survives (control — `closed` is not in the participle list) |
| `Confirmed — Archive Archived Media Group?` | **DESTROYED** |
| `Confirmed — Restore Restored Furniture Co?` | **DESTROYED** |
| `Confirmed — Delete Deleted Scenes Films?` | **DESTROYED** |
| `Confirmed — Archive Approved Vendors Co?` | **DESTROYED** |

**440 of the 13,530 sentences in my lexical-branch sweep** are this shape (20 participle-bearing
names × 22 completion words). `index.ts`'s own comment says exactly this shape *"is unaffected"*:
*"a legitimate imperative confirmation summary ('Confirmed — Archive ACME?') is unaffected."* It is
unaffected for `ACME`. **The verdict changes because of how the company is spelled** — the same
accident-of-spelling class as D130 (which fixed it for the LEGACY order rule and not for this arm),
D162b and D163.

Reachability, honestly: `legacyProseFallback` excludes `deterministic-*` models, so a genuine
deterministic confirmation turn does not reach the belt. **`structuredProseDrift` has no model
exclusion** (`unaccountedCompletionProse && (rawClaims !== null || deterministicPrefix.length > 0 ||
claimExecutionEvidence.length > 0)`), so the exposure is real but narrow — which is what the #75
ledger note about D112 already said, and this is the un-enumerated half of it. Pinned
`V29_D171.imperativeConfirmationDestroyedByNameParticiple.*` with two controls.

### V29-F3 (P3, SUITE COVERAGE — the promoted suite passes green through a real truthful destruction) — `run28` pins 6 of the 32 FIX-H lexicon members, so removing any of the other 26 is invisible

FIX-H's whole safety story is a **closed** 32-word lexicon. `run28`'s D161 group exercises `may`,
`might`, `could` bare, `well`, `indeed already`, `possibly already recently` and `in fact` — 6
distinct members. **26 members are pinned nowhere.** Proven, not argued: I removed `previously` from
the lexicon in the real `index.ts`, and

- `Sunrise Logistics LLC may previously have been archived.` → survives → **DESTROYED**
- `run28` → **110 passed, 0 failed, exit 0**

A source-*derived* test cannot see this either (it reads the mutated lexicon back out and tests the
mutated word), which is why `v29_regression_additions.mjs` pins the lexicon **by value** as well as
looping over it. Both halves fail on M5. This is standing rule **(g)**'s other direction: a closed
lexicon needs a corpus member from OUTSIDE it (D168, already recorded) **and** one for every member
INSIDE it.

### V29-F4 (P3, SUITE COVERAGE) — 11 of `run28`'s 13 `D163` CONTRACT pins do not observe FIX-H

The postscript says *"run28 pins all seven FIX-H shapes CONTRACT"*. `run28` has 13 D163 CONTRACT
assertions. Under M1 (FIX-H reverted to `(?:[a-z]+\s+){0,2}?`) **only two of them fail**:
`D163.oneTokenName` and `D163.singleCharName`. The other eleven pass identically with FIX-H present
or absent, because their intervening material is already outside the pre-FIX-H `{0,2}` window:

| `run28` pin | intervening tokens | observes FIX-H? |
|---|---|---|
| `D163.modal.{may,might,could,can,would,should}` — `I may confirm ACME Holding has been archived.` | `confirm`,`ACME`,`Holding` = 3 | **no** |
| `D163.weForm` — `We can verify Beta Corp has been deleted.` | `verify`,`Beta`,`Corp` = 3 | **no** |
| `D163.digitInName` — `… confirm Unit 42 has been …` | `confirm`,`Unit`,`42` = 3 | **no** |
| `D163.digitOnlyName` — `… confirm 42 has been …` | `42` does not match `[a-z]+` | **no** |
| `D163.lexiconWordThenSubject` — `I can now confirm ACME has been …` | 3 | **no** |
| `D163.haveBeenPlural` — `… confirm the tasks have been …` | 3 | **no** |
| `D163.oneTokenName`, `D163.singleCharName` | 2 | **yes** |

FIX-H is genuinely load-bearing — two pins prove it, and my M1 confirms it independently. The defect
is in the *evidence*: a group of 13 that fails 2 under its own removal is 85% decoration, and a
reader would conclude the closure is far more thoroughly pinned than it is. `v29_regression_additions`
replaces it with 14 pins that all move under M1 (all six modals in both `I`- and `We`-form with a
one-token subject, plus `singleCharName` and `pronounObject`).

### V29-F5 (P3, BOOKKEEPING) — the postscript's residual-pinning admission is substantially TRUE and errs toward self-deprecation, but it is wrong in both directions

The prompt asked me to decide whether this admission hides a regression. **It does not.** It is,
however, inaccurate on both sides:

| postscript claim | reality (grepped from `run28_defect_closure_contract.mjs`) |
|---|---|
| *"the residuals PINNED IN run28 are D164r/D166r/D168/D169r/D170 and D156b"* | **Incomplete.** `run28` also pins `D116`, `D153`, `D158d`, `D165`, `D166b` and `lowercaseNameWithAnd` as `[RESIDUAL]` — 25 RESIDUAL assertions in 12 groups, not 6. |
| *"The OLDER residuals (D158b, **D153**, D154, D146b) … are NOT currently pinned in any live suite"* | **Wrong about D153** — `D153.droppedLinker` is pinned in `run28` at line 243. |
| *"D158b, D154, D146b … NOT pinned in any live suite"* | **TRUE**, verified by grep across all 32 `.mjs`. `D159` is also unpinned and is in neither list. |

Both errors run in the harmless direction (claiming less coverage than exists). I checked whether
the genuinely-unpinned set conceals a moved behaviour: **it does not.** `D146b`, `D153`, `D159`,
`D165`, `D156b`, `D158d`, `D116`, `D166b` all behave **identically** at `4476c92`, `5db8603`,
`b6cca5f` and the candidate. The one member of that set that HAS moved is `D158b`, and it moved at
run23 (`I archived test3.` — CAUGHT at `4476c92`, MISSED at run26/run27/candidate alike), which is
disclosed in the ledger and named in the admission. Nothing is hidden. I have pinned `D158b`,
`D146b`, `D153` and `D159` so the next rotation cannot drop them again.

### V29-F6 (P3, DOCUMENT TRUTH — the stale-rationale class, one campaign after it was ruled on) — `run28`'s header and its D164/D166/D167 group comments still describe FIX-I, which no longer exists

`run28_defect_closure_contract.mjs` is `v28_regression_additions.mjs` promoted verbatim. Its header
still reads *"Candidate under test: `45d05ccd…` / index.ts sha256: `291800b1…`"* — the campaign #88
candidate, not this one. Its console headers still print *"[DEFECT] D166 (P2): FIX-I closes only a
ONE-TOKEN determiner-led evidential subject"* and *"[DEFECT] D167 (P2): FIX-I destroys a negated
subject carrying a determiner-led PP"*, and the `D166r` note still says *"the lookahead's single
`\w+` slot"*. **There is no lookahead in these bytes.** With FIX-I reverted, `D166r`'s rows are
missed for a *different and broader* reason (ALL determiner-led evidentials are missed now, not only
multi-token ones), and D167 is a closure, not a defect.

This is the exact class the ledger has now ruled on twice — run24 corrected a *"stale header"*, and
verifier #28 wrote that run27's `hedgeOverThreeWords` note *"still passes, but for a different
reason … so the note is stale and would mislead the next reader."* It recurs here, in the suite
promoted by the fix for it. The assertions themselves are correct and green; only the prose lies.
Corrections are listed in `v29_PROMOTION_NOTE.md` — no assertion needs to change.

### V29-F7 (P3, DOCUMENT TRUTH — PRE-EXISTING at `4476c92`) — the clause-splitter comment's own first example is still shielded

`index.ts`'s clause-boundary comment states that a *"filler negator set off by punctuation ('No
problem — ACME was archived', 'Nothing failed: ACME was archived') no longer shields the fabrication
beside it."* Measured on the candidate:

| | result |
|---|---|
| `Nothing failed: ACME was archived` | **CAUGHT** — the `:\s` boundary works |
| `No problem — ACME was archived` | **MISSED** — still shielded |
| `No problem — Sunrise Logistics LLC was archived.` | **MISSED** |

The spaced-dash boundary is `\s[—–-]\s+(?=(?!(?:was\|were\|is\|are\|has\|have\|had\|been\|being\|not)\b)[a-z])`
— it requires a **lowercase** token after the dash, and a real company name is capitalised. The
comment is half-true and its cited example is the half that is false. Pre-existing at `4476c92`;
pinned `V29.fillerNegatorDashUppercaseName` with the colon control beside it. The comment should be
corrected in the same change that next touches the splitter.

Related, same shape, same pre-existing status: `Deleted Gobi Freight Co, nothing else was changed.`
is **MISSED**. The comment says the comma splitter *"keeps its fabrication in a clause of its own"*,
which is true and useless — no arm matches a bare participle-initial clause without a `Confirmed —`
prefix, so isolating the clause buys nothing. Pinned
`V29.bareParticipleInitialNoConfirmedPrefix`.

### V29-F8 (P3, NEW DISCLOSURE — PRE-EXISTING at `4476c92`) — a hedge containing ` and ` is split by the clause splitter and destroyed, so FIX-H's `and` lexicon member is unreachable through that route

`Sunrise Logistics LLC may well and truly have been archived.` → the ` and ` boundary cuts before the
lowercase `truly`, the second clause `truly have been archived.` carries no modal, `LEGACY` fires,
and a truthful hedge is **DESTROYED** — at `4476c92`, `5db8603`, `b6cca5f` and here alike. The
control shows the boundary is the whole story: the same hedge with `or`
(`may possibly or probably have been archived`) **survives**, because ` or ` is not a boundary.

This is why run27's `modalWindow.hedgeOverThreeWords` pin passed for the wrong reason (verifier #28's
observation), and it is why I excluded `and` from the by-member lexicon CONTRACT loop and pinned it
`[RESIDUAL]` instead. Same direction as D168.

### V29-F9 (P3, PIN GAP) — D116's destroying direction is pinned nowhere

`run28` pins D116 in the direction where a negator-initial NAME **disarms** the belt
(`Nothing Bundt Cakes was archived.` → missed fabrication). The identical root cause also **destroys
a truthful answer**, and that direction is pinned in no suite:

| | result |
|---|---|
| `Sunrise Logistics LLC is archived but was not deleted.` (run28's `D137.stateButNegatedPast` shape) | survives |
| `Nothing Bundt Cakes is archived but was not deleted.` | **DESTROYED** |

22 of my 13,530 lexical-branch sentences. Pre-existing at `4476c92`. Same for the
`lowercaseNameWithAnd` residual, which `run28` also pins only in the fabrication direction while
`No company named salt and pepper co was archived.` is destroyed. Both directions are now pinned.

---

### Founder-directed lexical-branch scenario — the bar is 0, and it is met

13,530 truthful founder-facing sentences: **41 names** (a real company built on every one of the 22
completion words — `Archived Media Group`, `Deleted Scenes Films`, `Restored Furniture Co`,
`Closed Loop Systems`, `Granted Wishes NGO`, `Added Value Consulting` … — plus every pathological
name this ledger has collected: `Salt and Pepper Co`, `The Archive Co`, `Nothing Bundt Cakes`,
`test3`, `Unit 42`, `Q4`, `Sector 7`, `X`, `Restore`, `Archive`, `Delete`, `Restore Hardware Ltd`,
`West End Trading Co`, `End Zone Inc`, `Doctors Without Borders`, `Acme and Sons`,
`salt and pepper co`) × 22 completion words × **15 branches** (plain negative, perfect negative,
`No company named …`, state answer, checked-nothing, disambiguation, permission question, imperative
confirmation, noun count, hedge, neither/nor, negated-NP evidential, refusal, future promise,
state-then-negated-past).

**Destroyed: 506 at the candidate, 506 at `4476c92`, 506 at `b6cca5f` — the identical set.**
**0 truthful answers destroyed relative to the baseline. Bar met.**

The 506 absolute, fully accounted: 440 = V29-F2/D171, 44 = the lowercase-name-with-`and` residual (22
`namedNegative` + 22 `negatedNPevidential`), 22 = V29-F9. **0 unexplained.**

### What is genuinely closed — re-derived, not taken on trust

- **D163 (FIX-H) — CLOSED and load-bearing.** 14 of my own CONTRACT pins (six modals × `I`/`We` with
  a one-token subject, single-char name, pronoun object) all fail under M1 and pass here. The paired
  in-lexicon hedge controls all survive, including all 31 reachable lexicon members individually.
- **D167 — CLOSED by the revert.** 13 of my own negated-NP evidential negatives survive, 8 of them
  shapes `b6cca5f` destroyed. Mutation-proven load-bearing twice over (M2 destroys them by breaking
  the arm; M3 destroys 8 of them by re-applying FIX-I).
- **D164 / D166 — correctly RE-OPENED as RESIDUAL**, pinned MISSED, and the postscript's claim that
  the `and`-linker sub-case is *still caught by the splitter* is **TRUE**
  (`No errors occurred and the log shows … was archived.` → CAUGHT).
- **D168 / D169 / D170 — correctly pinned RESIDUAL at current behaviour**, and D168's *"also
  destroyed at 4476c92, not a regression"* qualifier is **independently CONFIRMED** (8/8).
- **No prior closure reopened.** D112, D116, D125, D128, D130, D131, D134, D137, D139, D146, D147b,
  D151, D155, D160, D162a, D162b, D103, D103c, D87, D92, D94, D100 and BUG-002 all re-derived on my
  own sentences: **173 pass / 0 fail**. The clarification-path closures (D136, D139, D142, D148,
  D150, D154, D157, D158c) are byte-identical to run26 and run27 and are covered by
  `run19` 62/0, `run28`'s `D136`/`D139_D142_D146`/`D157_D158` groups and
  `issue5_confirmation_action_type_binding` 10/10.

### Deployability — my engineering judgment, plainly

**As a change relative to its predecessors: yes, ship it into the branch.** It is the cleanest
candidate in this chain I have evidence for. One line each way, a true byte-identical revert, the
regression verifier #28 found is gone, the fix that survived is mutation-proven, and against the
campaign baseline it destroys nothing at all while rescuing 17 truthful answers on my corpus and
1,120 + 2,560 + 2,560 in the sweep. The residuals it re-opens are all on the fabrication axis, all
disclosed, and the belt is explicitly defense-in-depth with evidence primary. **That is the correct
direction of trade** and it is the one `index.ts` and `CLAUDE.md` §26 both prescribe.

**As a decision to deploy to production: not on this evidence, and the reason is not this
candidate.** Production runs `sem-ai-command` **v92**, the prose-era build. Every campaign in this
chain — #75 through #89, including mine — measures against **`4476c92`, an in-chain SHA**, not
against the bytes that are actually live. The ledger's own #64 and #65 entries record that this
branch was at one point a *net regression against deployed v92* on twelve fabrication-escape shapes,
and I have not measured whether that is still true. Three suites do assert **named** v92-parity
shapes and all three are green (`structured_claim_verification` L222-244,
`structured_claim_laundering_contract` L1/C6, `lifecycle_evidence_and_output_persistence_contract`
X1b) — that is real evidence, but it is a sample of shapes, not a corpus-level differential against
the deployed source. My attempt to download the v92 bytes into an isolated scratch directory
produced nothing.

So: **`VERIFIED IN PREVIEW` for the belt change; the deploy gate that is still missing is a
candidate-vs-deployed-v92 differential, not another belt campaign.** Concretely, before a deploy:
(1) obtain the deployed v92 source (`supabase functions download` into a throwaway directory, or the
commit that produced v92) and run the same both-directions corpus + differential sweep against it;
(2) if that comes back clean, deploy behind the founder's explicit `ALLOW_FUNCTIONS_DEPLOY=1` and
byte-verify with `functions download` + `diff`. Nothing about the residuals in this candidate blocks
a deploy — none of them is a truthful-destruction the candidate introduces; the missing v92
differential is what blocks it.

**Smallest still-open residual with real founder-facing consequence: D170** — `CONFIRMED_COMPLETION`'s
`(?<!\d )` cardinal lookbehind (added by D112 to stop `3 archived companies`) also matches the space
after the final token of a NAME ending in a digit, so `Confirmed — test3 archived.` ships while
`Confirmed — ACME archived.` is caught. One lookbehind, four pinned shapes, pre-existing at every
SHA, and `test3` is `index.ts`'s own must-never-touch company. (Smallest in absolute terms is
**D159** — `LEGACY_PAST_COMPLETION`'s `\brenamed:\s*.+(→|->)` arm, unreachable inside
`readsAsCompletion` because the splitter cuts on `:\s` first. It is pure decoration and costs
nothing; **V29-F1**'s `had been` gap is the same shape and is the cheapest real gap left.)

### Evidence

index.ts sha256 `0565a5c2398ca17d44de18a40e4a1a1168651b1c1136153b28e6ac944be9c757`, asserted before,
after every temporary edit, and at end — **byte-identical throughout**; the one in-place edit (M5)
was restored via `git checkout --` and re-asserted. Battery **32 `.mjs` / 0 failures** (26 executing
+ 5 stubs + 1 helper; run15 57/0, run19 62/0, run28 110/0, run27 absent, 60 `.sql` not run).
`v29_regression_additions.mjs` **173 pass / 0 fail**, non-vacuous against five mutations (M1 22 fail,
M2 20, M3 11, M4 3, M5 2 — `run28` scores 12 / 24 / 15 / 3 / **0** on the same five). `v29_mutation_proof.mjs`
**4/4**. `v28_mutation_proof.mjs` **2/2** reproduced. My corpora: 103 truthful + 66 fabricated
hand-written; 25,440-sentence differential sweep across four SHAs; 13,530-sentence lexical-branch
sweep across three SHAs; 79 regex literals construct+evaluate, 0 failures. Deno type-check
**BLOCKED — command classifier**. Production read-only: `sem-ai-command` **v92 ACTIVE**, unchanged.
**Nothing deployed; none of D58–D171 is live.**

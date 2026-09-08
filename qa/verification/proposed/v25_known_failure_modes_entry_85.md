## #85 — verifier #25, independent verification of the run24 D158/FIX-C closure (`0e72ced` / `164b3ee`)

**Candidate:** `164b3ee08b0f394eeda37a7e5dd39ff860616967` (closure commit `0e72ced`; the campaign
rotation commit on top touches only `qa/verification` bookkeeping — verified by diff,
`git diff 0e72ced 164b3ee -- supabase/ web/` is empty).
**index.ts sha256:** `e88370a92f5dc2e89d2014e3ec2f1267056ba0021732e423736b4065884f5834`, asserted
at preflight, before and after every mutation, and at the end. **index.ts was never written.**
Every measurement ran on an in-memory string or on a TEMP COPY handed to a suite by explicit path
(`SEM_INDEX_SRC`).
**Baselines, each extracted from git by my own extractor:** `e6a4d02` (run23 / #84's candidate),
`4476c92` (run22 / #83's candidate — the correct collateral baseline), `b32e0e4` (#80).
**Line endings:** this candidate is 100% CRLF (5,937 CRLF, 0 bare LF, 459,374 bytes), as is
`e6a4d02`; `4476c92` still carries 40 bare-LF lines, so a raw `git diff` against it overstates the
change. Real surface after CRLF normalisation: **vs `e6a4d02` exactly 1 non-comment line
(FIX-C) + 7 comment lines; vs `4476c92` 4 non-comment lines.**

**Verdict: FAIL** — **FIX-C does not close D158. It closes the eleven sentences verifier #24 wrote,
and leaves the rest of the same regression against `4476c92` wide open.** A fixed-length
lookbehind can only see the ONE token in front of the evidential verb, so one adverb, one
contraction or one extra space walks straight through it (**D160, P2**), and an ACTIVE
evidential with no auxiliary at all was never in scope of the lookbehind in the first place
(**D160b, P2**). Measured on my own corpus: **the D158 defect class is 5/62 caught here and
62/62 at `4476c92`**; D160b is **0/28 here and 28/28 at `4476c92`**. Neither is disclosed. The
same construct fails the same way in the belt's *other* lookbehind guard, destroying hedged
non-claims (**D161, P4, pre-existing at every SHA**). **D158's directly-adjacent half, D155,
D156, D157 and every one of the thirteen prior belt/matcher closures are genuinely intact** —
I re-derived all of them cross-SHA on corpora I wrote. **A safe close exists, is measured,
closes D160 62/62 and D160b 28/28 with ZERO collateral on every corpus I have, keeps the whole
32-suite battery green, and REMOVES eleven lookbehinds instead of adding any** (FIX-D, below;
FIX-E closes D161 too). This is a fixable candidate. It is the fourteenth consecutive change to
this belt and the twelfth to close one direction while leaving or opening another — and, for the
**fourth** campaign running, the collateral was measured on a corpus that did not contain the
shape the change put at risk. This time the corpus that missed it was the *verifier's* own from
one campaign earlier, adopted verbatim as the closure's acceptance criteria.

**Production, read-only, re-derived myself:** `supabase functions list --project-ref
pvphxgrtdfrudejjhzjk` → `sem-ai-command` **version 92, ACTIVE**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at` 1788239725518 —
byte-identical to what #75–#84 recorded. **Nothing has been deployed; none of D58–D161 is live.**
Everything below concerns a candidate branch, not what the founder runs today. **Nothing was
written to production, and nothing was written outside my own worktree.**

**Method note.** Every measurement drives the REAL shipped predicates, sliced out of index.ts by
an extractor I wrote for this campaign (`readsAsCompletion`/`completionIsNegated` from
`const LEGACY_PAST_COMPLETION` to `const legacyProseFallback`; a matcher module built from the
verbatim `matchDisambiguationOption`, `commandContradictsActionType`, `commandForContradiction`
and `contradicted` sources, so SELECT-vs-DEAD-END is decided by shipped code). It imports nothing
from `qa/scenarios-runner` and nothing from `v24_*.mjs` — all of those are artefacts under test.
Both extractors refuse to run unless every named belt const survives the slice, unless no
TypeScript annotation survives stripping, and — for the matcher — unless the D157 unified test is
present verbatim.

---

### D160 (P2, NEW — a REGRESSION vs `4476c92` this candidate carries) — FIX-C's fixed-length lookbehind sees exactly one token, so one adverb re-opens D158

FIX-C gates the twelve evidential verbs behind eleven fixed-length lookbehinds
(`(?<!was )(?<!were )(?<!is )(?<!are )(?<!am )(?<!be )(?<!been )(?<!being )(?<!has )(?<!have )(?<!had )`).
A fixed-length lookbehind is a **one-token** test. Put anything at all between the auxiliary and
the verb and it cannot see the auxiliary:

| founder-facing summary | `b32e0e4` | `4476c92` | `e6a4d02` | **candidate** |
|---|---|---|---|---|
| `No errors were ever reported and ACME Holdings was archived.` | missed | **CAUGHT** | missed | **MISSED** |
| `No errors were never reported and ACME Holdings was archived.` | missed | **CAUGHT** | missed | **MISSED** |
| `No issues were also noted and Beta Corp was deleted.` | missed | **CAUGHT** | missed | **MISSED** |
| `No delay was previously recorded and ACME Holdings was archived.` | missed | **CAUGHT** | missed | **MISSED** |
| `No dispute was formally confirmed and Beta Corp was deleted.` | missed | **CAUGHT** | missed | **MISSED** |
| `No downtime was officially indicated and ACME Holdings was archived.` | missed | **CAUGHT** | missed | **MISSED** |
| `The incident wasn't reported and ACME Holdings was archived.` | missed | **CAUGHT** | missed | **MISSED** |
| `The incidents weren't noted and Beta Corp was deleted.` | missed | **CAUGHT** | missed | **MISSED** |
| `No errors were  reported and ACME Holdings was archived.` (two spaces) | missed | **CAUGHT** | missed | **MISSED** |

**47 of 52** shapes on my prose corpus; **62 of 62** at `4476c92`. Any adverb works — I measured
`ever, never, also, only, formally, previously, officially, actually, subsequently, still,
initially, publicly, explicitly, properly, not, yet` — as does every `n't` contraction of the
excluded auxiliaries, because the lookbehind chain lists `was ` and `were `, not `wasn't ` or
`weren't `.

**Mechanically, at the regex level** (the evidential disjunct sliced verbatim out of the source
and driven directly): across all 11 excluded auxiliaries × 12 verbs, **132/132 pairs are blocked
when the aux is directly adjacent**, and **121/132 are NOT blocked with a single adverb between
them**. The 11 that stay blocked are the `say` row — `said` is simply not one of the twelve
spellings, so it can never match at all.

### D160b (P2, NEW) — an ACTIVE *intransitive* evidential has no auxiliary for the lookbehind to exclude, and disarms the belt

FIX-C's premise is that "active" means "safe". It does not. An evidential can be active, finite
and still not take the completion clause as its complement:

| founder-facing summary | `4476c92` | **candidate** |
|---|---|---|
| `No auditor reported and ACME Holdings was archived.` | **CAUGHT** | **MISSED** |
| `No auditor noted and ACME Holdings was archived.` | **CAUGHT** | **MISSED** |
| `No auditor recorded and ACME Holdings was archived.` | **CAUGHT** | **MISSED** |
| `No reviewer noted but ACME Holdings was archived.` | **CAUGHT** | **MISSED** |

**0/28 caught here (and at `e6a4d02`), 28/28 at `4476c92`.**

**Root cause, and it is the one verifier #24 already named without following it through.**
`completionIsNegated` decides "the negator scopes over the completion verb" from a bag of words
rather than from position. #24 wrote: *"`completionIsNegated` decides … from a bag of words, not
from position"* — and then fixed the **voice** of the verb instead of its **position**. Voice is
the wrong axis. What actually makes an evidential subordinate the completion is that **no clause
linker sits between the evidential and the completion verb**: in `No log HOWEVER SHOWS X was
archived` the evidential still governs when the completion arrives; in `No errors were REPORTED
AND X was archived` the `and` has already closed its clause. Both `were reported` (passive) and
`reported` (active intransitive) fail on exactly that axis, which is why fixing voice catches one
and not the other.

**Why the suites did not see it.** `run24_defect_closure_contract.mjs` pins D158 as a `[DEFECT]`
with **the same eleven sentences from #84's table, verbatim** — every one of them has the
auxiliary directly adjacent to the verb, because that is how #24 happened to write them. The
closure adopted the verifier's eleven examples as its acceptance criteria and measured "11 → 0".
**A closure measured only on the reporter's own sentences is not a closure of the class.** This
is the fourth consecutive campaign in which the collateral corpus did not contain the shape the
change put at risk (#82 D153, #83 claim 1, #84 D158 — and now the standing rule #84 itself
recorded, *"when a closure widens a lexicon, its collateral set must include cases built from
that exact lexicon in the OPPOSITE syntactic position"*, was followed for the lexicon and not for
the **syntax** the fix actually turns on).

**Founder impact.** Unchanged from D158, because it is D158: `legacyProseFallback` and
`structuredProseDrift` are the two consumers of `readsAsCompletion`, both live on ordinary turns.
A miss means the raw model prose ships — the founder reads `No errors were ever reported and ACME
Holdings was archived.` on a turn where **nothing was archived**, with no correction and no
evidence behind it. This is the exact class BUG-002 opened.

### D161 (P4, PRE-EXISTING at `b32e0e4` / `4476c92` / `e6a4d02` and here — not a regression, undisclosed, and the SAME defect class) — the belt's other fixed-length lookbehind destroys hedged non-claims

`LEGACY_PAST_COMPLETION` opens with `(?<!may )(?<!might )(?<!could )(?<!can )`. Same construct,
same one-token blindness, opposite direction — here it destroys a truthful hedge instead of
letting a fabrication through:

| founder-facing summary | every SHA measured |
|---|---|
| `ACME may have been archived.` | quiet (correct) |
| `ACME may possibly have been archived.` | **belt FIRES — the hedge is destroyed** |
| `ACME might well have been archived.` | **belt FIRES** |
| `ACME could conceivably have been archived.` | **belt FIRES** |
| `ACME may already have been archived.` | **belt FIRES** |
| `ACME may  have been archived.` (two spaces) | **belt FIRES** |

`sem_ai_command_past_completion_claim_regex.mjs` already asserts that `may have been` /
`might have been` / `could have been` must NOT match. **This is that existing contract, one word
wider, and it fails.** Defect class: **a fixed-length lookbehind used to decide scope** — it
answers "what is the single token before this word", never "what governs this word". Every place
that construct is used to make a syntactic decision is suspect; there are now two confirmed.

---

### What is genuinely closed — re-derived independently, not taken on trust

**D158's directly-adjacent half (P2) — CLOSED, 11/11.** All eleven of #84's shapes are caught
here and missed at `e6a4d02`. My mutation test proves the lookbehind chain is load-bearing for
exactly those: reverting FIX-C takes `run24` to `exit=1, 11 FAIL` and breaks 3/3 of my own named
cases.

**D156 (P3) — CLOSED, 17/17.** Every active complement-taking evidential I could construct
survives here, with and without a `however/therefore/though/although` linker, and 13/17 of them
are destroyed at `4476c92`. Removing the twelve verbs takes `run24` to `exit=1, 13 FAIL`. Worth
recording precisely: on the LINKER-FREE cases the evidential list buys nothing — the third
disjunct already preserves them — which independently confirms #84's claim 1.

**D155 (P2) — CLOSED. 0 of 49 truthful answers destroyed** on my corpus (`4476c92` destroys 5),
and **D144 is 15/15 caught**, including the lowercase `i`/`we` subjects. Interrogative,
conditional, embedded and negated first-person forms all survive. Making the arm case-insensitive
takes `run24` to `exit=1, 20 FAIL` — the case-sensitivity is load-bearing, not decorative.

**D157 (P2) — CLOSED, 4/4**, and D148 (3/3) and D138/D150 (5/5) are not traded away. Reverting
the unification to the inline base-verb list takes `run24` to `exit=1, 13 FAIL`.

**No prior closure reopened. Belt: 50/50. Matcher: 24/24. 0 regressions vs `4476c92` on either.**
Re-derived here rather than trusted: D112 (noun/cardinal/present-negation/not-done), D116, D118,
D125 (all four trailing-qualifier shapes), D128 (`Salt and Pepper Co`), D130 (`Closed Loop
Systems`, `Archived Media Group`, state-but-negated), D131 (`Doctors Without Borders`), D134 (both
halves), D137 (state vs progressive), D139 (hyphenated place name, em-dash parenthetical), D147b
(all four), D151 (all six re-added negators), D144, D155, D156 on the belt; D116, D123, D127,
D129, D132 (both prototype keys), D133, D136, D138, D142, D148, D150, D157 on the matcher.
**The question belt (`safeQuestionFragment`) is byte-identical** across `b32e0e4`, `4476c92`,
`e6a4d02` and this candidate.

**Declared residuals: 9/9 pinned at their stated behaviour** — D158b (all four out-of-lexicon
first-person objects), D158d, D153, D156b, D146b, D159 (both halves — the `renamed: … ->` arm is
unreachable through `readsAsCompletion` and fires only without the space), D158c (both bare
participial names), D154 (`Revive`/`Reopen`/`Undelete` still arm the opposite field).

**No `(?-i:` or `(?i:` modifier group is shipped** — exactly one occurrence in the whole file and
it is inside the comment that explains why it was avoided; zero on any non-comment line. **The
DEPLOY NOTE is TRUE.** **No variable-length lookbehind is shipped** either.

**No new `const`.** The belt's named-const set is byte-for-byte what run15–run18 expect, identical
at all four SHAs, and run15 (**57**), run16 (53), run17 (43) and run18 (51) all execute their full
assertion counts.

**Battery, run from the filesystem by my own runner** (per-suite exit code AND output-text failure
count, counted separately): **32 suites, 0 non-zero exits, 0 output-text FAIL lines, 1,031 `OK`
lines.** `run15` = **57**. **`run23` is gone** (retired, file deleted); `run20`/`run21`/`run22`
absent. **`run24` is present, 207 assertions, and genuinely assertion-bearing** — proved by
mutation, not by reading: reverting FIX-C `exit=1, 11 FAIL`; removing the evidential verbs
`exit=1, 13 FAIL`; adding `/i` to the D155 arm `exit=1, 20 FAIL`; reverting D157 `exit=1, 13 FAIL`.
**No `.sql` is executed by any suite** — no `.mjs` imports `child_process`, and the two files that
mention `.sql` do so only in prose comments. Seven suites emit no `^OK`/`PASS` line: **five are
self-declared `SUPERSEDED (prose-era)` stubs**, one is `_gate_extract.mjs` (an importable helper,
no output by design), and one (`issue5_confirmation_action_type_binding`) prints `10/10 passed` in
its own format; five more assert in a different output format (51/38/25/11/7 PASS). **No suite is
a silent stub pretending to pass.**

**Founder-directed lexical-branch scenario (as #75–#84): 450/450, 0 regressions vs `4476c92`.**
One real company name per canonical completion word (22) plus the eight base-form-verb names,
driven through both branches the founder actually meets: `There is no record <Name> was archived.`
survives for all 30, as do `No record shows <Name> was archived.`, `<Name> was not archived.`,
`<Name> is archived. Should I restore it?`, the clarifying question and the honest refusal (180
cases); a real fabrication about each name still fires in three shapes (90); and the founder's
typed name resolves identically to `4476c92` in both pending families, plain / `yes, `-prefixed /
`(option 1)`-suffixed (180).

**Mutation test, my own harness — 4/4 load-bearing, each breaking NAMED cases**, every mutation
applied to a temp copy only, `index.ts` sha256 asserted before and after each.

---

### FIX-D — measured, one line, and it REMOVES eleven lookbehinds rather than adding any

Stop asking about voice; ask about position. Run the evidential test on the **last
linker-delimited segment** of the negator→completion-verb span instead of on the whole span. The
four true relativizers stay unconditional on the whole span, exactly as now.

```
-  return n >= m.index || /\b(?:that|which|who|whom)\b|(?<!was )…(?<!had )\b(?:show(?:s|ed)?|…)\b/i.test(c.slice(n, m.index))
-    || !(/(?:^|\s)[a-z][^\s]*\s+(?:and|but)\s/.test(c.slice(n, m.index)) || /\b(?:although|though|however|therefore)\b/i.test(c.slice(n, m.index)));
+  return n >= m.index || /\b(?:that|which|who|whom)\b/i.test(c.slice(n, m.index))
+    || /\b(?:show(?:s|ed)?|…|note(?:s|d)?)\b/i.test(c.slice(n, m.index).split(/\s(?:and|but)\s|\b(?:although|though|however|therefore)\b/i).pop() ?? '')
+    || !(/(?:^|\s)[a-z][^\s]*\s+(?:and|but)\s/.test(c.slice(n, m.index)) || /\b(?:although|though|however|therefore)\b/i.test(c.slice(n, m.index)));
```

Measured on the candidate vs the identical candidate with only that replacement:
**D160 5 → 62 of 62 caught, D160b 0 → 28 of 28 caught, D158 11 → 11 still caught, D156 17 → 17
still survive, my 50-case truthful corpus 0 → 0 destroyed, the 450-case founder-directed scenario
450 → 450, and the whole 32-suite battery stays green (0 failing suites, `run24` still 207/0
including its `beltConstSetUnchanged` invariant).** `v25_regression_additions.mjs` goes
**402/38 → 434/6** (the 6 remaining are D161, which FIX-D does not address).
**It introduces no regexp construct at all and DELETES eleven lookbehinds**, so it strictly
reduces the Deno-runtime surface the last three campaigns have been worried about. No new
`const` — the expression stays a single statement, so run15/16/17/18's source slicers are
unaffected.

### FIX-E (optional, on top of FIX-D) — closes D161, same class, same file

Add an explicit modal-hedge guard to the `.some()` arm (no new const, still one statement, no
lookbehind): a clause whose completion verb is governed by a modal within two intervening words is
a HEDGE, not an assertion.

```
+  && !/\b(?:may|might|could|can|would|should)\s+(?:[a-z]+\s+){0,2}?(?:have been|has been|had been|be)\b/i.test(c)
```

Measured: **5 hedges recovered, 0 fabrications lost** on a 14-case modal-bearing fabrication set
(including `I can confirm ACME was archived.`, `ACME was archived and you may verify it in the
log.`). With FIX-D + FIX-E: **`v25_regression_additions.mjs` 440/0 and the full 32-suite battery
32/32 green.**

---

### Claims that need correcting

1. **"against it [`4476c92`] the belt is now strictly better."** FALSE, and the postscript's own
   residual list contradicts it three paragraphs later. Measured on my corpora: better in the
   truthful direction (**0 vs 5 destroyed**, 49 cases) and **worse in the fabrication direction
   (13 vs 0 missed**, 51 cases — 8 × D160 + 5 × D158b). "Strictly better" is not what a
   two-directional trade is called. A collateral number must state its SHA, its corpus size and
   **both** directions.
2. **"D158 … CLOSED at this candidate, mutation-proven, 11 → 0."** True for the eleven sentences,
   false for the class: **5/62 on mine, 62/62 at `4476c92`.** `run24` pins D158 with #84's eleven
   sentences copied verbatim, and all eleven place the auxiliary directly against the verb. The
   defect was closed against its report, not against its cause.
3. **D158d is pinned `[RESIDUAL]` in `run24` but is absent from the postscript's DOCUMENTED
   RESIDUALS list** (which names D158b, D158c/D154, D159, D156b, D153, D146b). A residual that
   exists in the suite and not in the ledger is a residual the next campaign will re-discover.
4. **`run24`'s D158 case notes are stale on the candidate they were promoted onto.** The header
   was correctly re-pointed at `e88370a9…` and the "green means broken" line was correctly
   dropped — but the block below still reads *"Caught 12/12 at 4476c92; missed 11/12 here"* and
   every pin still carries *"caught at 4476c92, missed here"*, on a candidate where they are
   caught. This is the same stale-text papercut #23 and #24 each flagged, fixed at the top of the
   file and left in place forty lines down.
5. **"Fixed-length lookbehind only (the file already ships 12)."** The **belt** ships 12
   (`LEGACY_PAST_COMPLETION` 4 + `CONFIRMED_COMPLETION` 8). The **file** ships 17 on non-comment
   lines at `e6a4d02`, and 28 here. The substantive point (the construct is already in
   production-shaped code, so it carries no new load-time risk) is correct; the number is not.
6. **"deno check 23 == baseline (npx deno@2)." NOT RE-DERIVED — `BLOCKED`.** There is no `deno`
   on this machine's PATH and this session cannot invoke `npx deno`. Recorded as a coverage gap,
   not as a confirmation — the second campaign running. Practical weight here is low: I verified
   directly that no modifier group and no variable-length lookbehind are shipped, and FIX-D
   removes constructs rather than adding them.

### Verified, and worth keeping

`qa/verification/proposed/v25_regression_additions.mjs` — **402 pass, 38 fail on this candidate:
38 `[DEFECT]` reproductions (21 D160 + 11 D160b + 6 D161), 0 `[RESIDUAL]` moves, 0 `[CONTRACT]`
failures.** Every guarantee this candidate genuinely provides holds; the three new defects
reproduce. **On FIX-D it goes to 434/6, and on FIX-D + FIX-E to 440/0**, with the full 32-suite
battery green in both cases, so there is no pin that has to move in the promoting commit. It
carries the D158 adjacent-passive set, the D156 corpus in both linker positions, the D144/D155
corpora, the 24-case matcher closure matrix, the 450-case founder-directed lexical branch, eleven
pinned residuals (including D158d, which the ledger does not currently list) and eight source
invariants (no modifier group, **no variable-length lookbehind**, the belt const set, the D155
arm's case-sensitivity, its removal from `LEGACY_PAST_COMPLETION`, the D157 lexicon reuse, the
question-belt hash, and that `readsAsCompletion` still decides negation via `completionIsNegated`).

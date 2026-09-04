## #82 — verifier #22, independent verification of the run21 D148/D146/D149 closure + the D141/D144 reverts (`0969852` / `be8d9ca`)

**Candidate:** `be8d9ca9fe4d99199b448a3a129dcb2cea21873d` (closure commit `0969852`; the campaign
rotation commit on top touches only `qa/verification` bookkeeping — verified by diff,
`git diff 0969852 be8d9ca -- supabase/` is empty).
**index.ts sha256:** `272de3a43cbfa685e144376b52c07cb30fa63d72615390ce529dca0b841bfbd2`,
asserted at preflight, after every mutation and at the end. The implementation tree was never
written to (`git status --porcelain supabase/ web/` empty throughout). Every mutation ran either
on an in-memory STRING or on a TEMP COPY handed to a suite via `SEM_INDEX_SRC`.
**Baselines, each extracted from git by my own extractor:** `b32e0e4` (#80 candidate), `54ebecc`
(run20 / #81 candidate), `d34af15` (#79). `9535f0b` and `52e830f` predate `completionIsNegated`
and cannot be driven by a belt-slicing extractor at all — recorded as N/A, not as a zero.

**Verdict: FAIL** — **one new P2 regression against BOTH `b32e0e4` and `54ebecc`** (D150: a real
entity name carrying a base-form lifecycle verb is now unselectable by its own name — D138's
class, reopened), **one new undisclosed coverage regression** (D153), and **one of the two
"cannot be safely closed" residual judgments is refuted by a mutation-proven safe close**
(D151). **D148, D146's truthful side and D149 are genuinely closed**, and I re-derived every one
of them independently. This is the **eleventh consecutive change to this belt and the ninth to
close one direction while opening another** — but it is also the first in three campaigns whose
headline P1s are both actually closed.

**Production, read-only, re-derived myself:** `supabase functions list --project-ref
pvphxgrtdfrudejjhzjk` → `sem-ai-command` **version 92, ACTIVE**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at`
1788239725518 — byte-identical to what #75–#81 recorded. **Nothing has been deployed; none of
D58–D154 is live.** Everything below concerns a candidate branch, not what the founder runs
today. Nothing was written to production.

**Method note.** Every measurement drives the REAL shipped predicates, sliced out of index.ts by
an extractor I wrote for this campaign (`readsAsCompletion`/`completionIsNegated` from
`const LEGACY_PAST_COMPLETION` to `const legacyProseFallback`; the disambiguation branch
re-composed from `matchDisambiguationOption` + the verbatim `commandForContradiction` /
`contradicted` / `field` statements, so a mis-bind is reported as the destructive FIELD it
actually arms; `safeOptionLabel` with its real `safeProseFragment`/`COMPLETION_WORD`
dependencies). It does not import `_gate_extract.mjs`, `run21_defect_closure_contract.mjs` or
`v21_*.mjs` — all three are artefacts under test. Any extraction miss THROWS rather than
reporting on a slice that is not the product.

---

### D150 (P2, NEW IN THIS CANDIDATE — regression vs `b32e0e4` AND `54ebecc`) — the D148 fix made every real name carrying a BASE-FORM verb unselectable

The new dead-end (index.ts:2734-2737) is:

```
const contradicted = !!matchedOption
  && (matchedOption.actionType === 'restore' || matchedOption.actionType === 'archive')
  && (commandContradictsActionType(commandForContradiction, matchedOption.actionType)
    || (matchedOption.actionType === 'restore' ? /\b(?:archive|delete|remove|end)\b/i
                                               : /\b(?:restore|unarchive|reactivate|activate)\b/i).test(command));
```

The second arm tests the **RAW `command`**, which still contains the matched option's own label,
and it is **not gated on the label being a bare verb**. The closure's justification — *"those
word-boundary base forms never match the -ed/-ing forms in a real NAME"* — is true for
PARTICIPIAL names and silent about the far larger class of real names carrying the BASE form.

Every one of these SELECTS at `b32e0e4` and at `54ebecc` and **dead-ends here**:

| pending | option label (a real company) | founder types | b32e0e4 / run20 | candidate |
|---|---|---|---|---|
| archive | Restore Hardware Ltd | `restore hardware ltd` | `archiveCompanyIds` | **dead end** |
| archive | Restore Point Systems | `restore point systems` | `archiveCompanyIds` | **dead end** |
| archive | Activate Media Group | `activate media group` | `archiveCompanyIds` | **dead end** |
| archive | Reactivate Wellness Inc | `reactivate wellness inc` | `archiveCompanyIds` | **dead end** |
| restore | West End Trading Co | `west end trading co` | `restoreCompanyIds` | **dead end** |
| restore | High End Motors | `high end motors` | `restoreCompanyIds` | **dead end** |
| restore | Front End Systems LLC | `front end systems llc` | `restoreCompanyIds` | **dead end** |
| restore | Book End Cafe | `book end cafe` | `restoreCompanyIds` | **dead end** |
| restore | End Zone Inc | `end zone inc` | `restoreCompanyIds` | **dead end** |
| restore | Archive Media Group | `archive media group` | `restoreCompanyIds` | **dead end** |
| restore | Delete Key Software | `delete key software` | `restoreCompanyIds` | **dead end** |
| restore | Remove Rust Inc | `remove rust inc` | `restoreCompanyIds` | **dead end** |
| restore | The Archive Co | `the archive co` | `restoreCompanyIds` | **dead end** |

**14 of 14** (the 13 above plus `yes, restore hardware ltd`). `\bend\b` alone covers an enormous
share of ordinary English company names.

**Why it is user-visible, not theoretical.** `safeOptionLabel` **renders all eight of the names I
checked verbatim** (they carry no completion PARTICIPLE, so the label belt does not touch them).
So the founder is shown the option, types its exact name, and the turn falls through to the LLM
with nothing bound. It is **fail-safe** (a dead end, never a wrong mutation) and the ordinal
escape hatch still works — `option 1`, `#1`, `1`, `the first one` all still select these options,
verified — which is why this is **P2, not P1**. It is nonetheless the exact defect D138 was
opened for: *"a real name that merely CONTAINS a verb leaves a non-empty remainder, so it stays
selectable"* — index.ts's own comment at 2723-2724, now false for base forms.

**This is a substitution, and #81 had already published the right shape.** #81's measured fix
direction was: *"when the option's label **is itself** a bare opposite-family verb, do not strip
it at all — run the contradiction check on the RAW command."* The closure kept the raw-command
test and **dropped the label gate**, which is the half that bounded it. Same pattern #81 named one
generation earlier ("closing the exact sentence a verifier reported is not closing the defect the
verifier found"), inverted: closing more than the verifier reported, without a case AGAINST.

**Measured fix direction (PREPARED, NOT APPLIED — no write authority on the implementation
branch; `qa/verification/proposed/v22_mutation_proof.mjs`, 3/3).** Restore the label gate around
the new imperative test:

```
|| (typeof matchedOption.label === 'string'
  && (matchedOption.actionType === 'restore' ? ARCHIVE_VERB_PATTERN : RESTORE_VERB_PATTERN).test(matchedOption.label)
  && matchedOption.label.replace(new RegExp((… ).source, 'ig'), ' ').trim().length === 0
  && (matchedOption.actionType === 'restore' ? /\b(?:archive|delete|remove|end)\b/i
                                             : /\b(?:restore|unarchive|reactivate|activate)\b/i).test(command)));
```

i.e. run21's imperative test **without** run20's `commandForContradiction.trim().length === 0`
(that was D148) and **with** run20's label test (that is what bounds it). Measured on the shipped
bytes with the change applied in memory: **13/13 D150 names select again**, **11/11 D148
phrasings still dead-end** and the mirror direction stays closed, **D138 fully preserved**
(participial names selectable, a real opposite verb outside the name still dead-ends), and the
**blast radius is zero** — `run8, run10, run11, run12, run13, run14, run15, run16, run17, run18,
run19, run21` all still exit 0 against a temp copy carrying the change.

### D153 (P3, NEW IN THIS CANDIDATE) — the D146 narrowing has an undisclosed fabrication cost, and the closure records it as "no coverage regression"

Narrowing R-ZR2's linkers to `and|but` + `although|though|however|therefore` restores 10/10 of the
truthful negatives run20 destroyed — genuinely closed, and I re-derived it. What is not disclosed
is that the eight dropped terms were also catching real fabrications in **exactly the
aux-preceded shape where the retained terms still fire**:

> `There were no blockers **so** ACME was archived.` · `There was no objection **because** ACME was
> archived.` · `… **since** …` · `… **while** …` · `… **before** …` · `… **after** …` ·
> `There was no approval **yet** ACME was archived.` · `There was no error **or** ACME was archived.`

**8/8 caught at `b32e0e4` and at `54ebecc`, 8/8 missed here.** The closure commit and the
postscript both record *"collateral 0/75 truthful destroyed & 7/50 fabrications missed (== the
b32e0e4 baseline, **no coverage regression**)"*. On a corpus that actually contains the dropped
terms there is one. This is #80's own D140 lesson again — *a residual measured only against the
pins it was tuned on is not a measure of the residual* — and run21's own `D146.limit.*` block
contains no sentence exercising a dropped term, which is why it is green.

**Judgement: the trade itself is defensible, the disclosure is not.** On my own corpus the
candidate destroys **1/84** truthful negatives vs `b32e0e4`'s **37/84** and run20's **10/84**,
while missing **24/47** fabrications vs 23 and 19. Destroying a true answer is the worse outcome
by index.ts's own statement (5472-5474), so trading 8 fabrication shapes for 36 truthful answers
is the right call. It just has to be written down as a trade.

### D151 (P2) — the D141 revert is defensible ONLY because the wrong hole was blamed; a safe close exists and is strictly better on BOTH axes

Reverted state, re-derived: `nobody|neither|nowhere|nor|few|hardly` are out of `NEGATED_CLAUSE`,
so **8/8** of these TRUE answers read as completion claims and are replaced with *"I can't
actually do that from chat — nothing was changed"*, which is itself false:

> `Nobody was archived.` · `Nobody was removed from the company.` · `Neither company was archived.`
> · `Neither ACME nor Beta Corp was deleted.` · `Nowhere in the audit log was ACME archived.` ·
> `ACME was not archived, nor was Beta Corp deleted.` · `Few records were deleted.` · `Hardly any
> records were deleted.`

All 8 survive at `54ebecc`. Pre-existing at `b32e0e4`, so not a regression — but the postscript's
stated reason for reverting is wrong on the merits.

**D147 is not caused by D141's words.** `completionIsNegated`'s third disjunct,
`!NEGATION_AUX.test(c.slice(0, n))`, gives a **free pass to any clause-initial negator** — so the
hole is already wide open with the CURRENT lexicon (**D147b**, below): `No errors occurred and
ACME was archived.`, `No approvals were pending but Beta Corp was deleted.`, `No approvals are
pending although ACME was archived.`, `Nothing failed however ACME was archived.` are **missed at
every SHA**, including `b32e0e4` and `54ebecc`. Adding `nobody`/`neither`/`few` does not create a
class; it adds instances to one that is already leaking.

**Measured safe close (PREPARED, NOT APPLIED; `v22_mutation_proof.mjs`, 3/3).** Re-add the
lexicon **and** delete the clause-initial free pass, letting the (now correctly narrow) R-ZR2
linker test decide instead:

```
return n >= m.index || /\b(?:that|which|who|whom)\b/i.test(c.slice(n, m.index))
  || !(/(?:^|\s)[a-z][^\s]*\s+(?:and|but)\s/.test(c.slice(n, m.index))
       || /\b(?:although|though|however|therefore)\b/i.test(c.slice(n, m.index)));
```

Measured on the shipped bytes, on my 101-truthful / 61-fabrication union corpus:
**truthful destroyed 11 → 1**, **fabrications missed 32 → 27**. It closes D141's 8, closes 4 of
D147b's clause-initial leaks, destroys **nothing** new, and loses **no** previously-caught
fabrication. Blast radius: `run8/10/11/12/13/14/16/17/18/19` unaffected; **run15 throws** (its
`NEGATED_CLAUSE` pin must be updated in the same commit — which is precisely the D149 rule this
ledger just wrote) and **run21 reports 8 failures, all of them its own `[RESIDUAL]` pins plus the
`D149` pin, with 0 CONTRACT failures**, i.e. the residual moved and the suite correctly noticed.

### D152 (P3) — the D144 revert's stated blocker is half true; the arm CAN be made assertion-safe without a new const

The postscript says the active-voice arm *"cannot be made assertion-safe inside the `/i` belt
regex without either breaking the extraction suites (a new case-sensitive const) or a 'restored
order' false positive."* I tested both halves.

* **"a new const breaks the extraction suites" — TRUE, and measured.** I inserted a probe const
  into the belt and ran the suites against a temp copy: **run15, run16, run17, run18 all exit 1**
  (they assemble the belt from a hand-maintained NAMED LIST of consts, so a new one is simply
  absent and `readsAsCompletion` throws on an undefined identifier); run19 and run21 slice the
  whole region and are unaffected. Real constraint, correctly identified.
* **But the arm needs no new const.** Added *inside* the existing `LEGACY_PAST_COMPLETION` with a
  clause-position anchor (`readsAsCompletion` already tests it per clause, so `^` means
  "clause-initial"), restricted to `i|we`, with an optional leading coordinator so D144's headline
  `ACME is archived, and I also deleted Beta Corp.` still lands:

  ```
  |(?:^|\bconfirmed\s*[—–-]\s*)(?:and\s+|but\s+|so\s+|then\s+)?(?:i|we)\s+(?:just\s+|already\s+|also\s+|now\s+|recently\s+|successfully\s+|have\s+|had\s+)*(?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\s+\S
  ```

  Measured: **0 of 12** of D145's truthful shapes destroyed (including `Are you asking whether I
  deleted Beta Corp?` and `They restored order after the outage last month.`), **7 of 7** of
  D144's fabrications caught, and on my union corpus fabrications missed **32 → 27**.
* **The "restored order" FP is real and survives** — first-person `I restored order to the report
  layout.` is caught, one new truthful destruction. That is the honest reason to defer, and it is
  a one-idiom cost, not an impossibility.

**Judgement: the revert is DEFENSIBLE, the stated impossibility is not.** Deferring on a 1-FP /
5-catch trade is a legitimate call; recording it as "cannot be made assertion-safe" overstates it,
and the "new const" half would have been closable by updating the four named-list suites — which
is the rule this same commit's lesson demands.

### D147b (P2, PRE-EXISTING at every SHA, newly disclosed) — the clause-initial negator free pass

Recorded separately because D151's remedy depends on it and because it is the actual mechanism
behind D147. `completionIsNegated` returns "negated" for ANY clause whose first negator has no
finite auxiliary before it. Four fabrications linked by the RETAINED linkers are therefore missed
at the candidate, `b32e0e4`, `54ebecc` and `d34af15` alike (listed above). Not a regression;
disclosed here so the next iteration does not re-diagnose it as a lexicon problem.

### D154 (P3, PRE-EXISTING at every SHA) — the imperative test's vocabulary is a 4-word list, and opposite intent is not

D148 closes the four base forms per direction. An opposite-intent reply that uses any other verb
still binds, whenever the option is literally named that word:

> pending archive, option named `Revive` → `revive it` **arms `archiveCompanyIds`**. Same for
> `Reopen`/`reopen it`, `Undelete`/`undelete it`, `Restoring`/`restoring it`, `Restores`/`restores`.
> Mirror direction (lower harm): `Close`/`close it`, `Deactivate`/`deactivate it`,
> `Deleting`/`deleting it`, `Drop`/`drop it`, `Terminate`/`terminate it`, `Kill`/`kill it` all arm
> `restoreCompanyIds`.

**11 of 16 probes, identical at the candidate, `b32e0e4` and `54ebecc` — pre-existing, NOT a
regression.** Noted because it bounds what D148 actually bought: a blocklist of opposite verbs can
never be complete, exactly as run16/D123 concluded about a blocklist of negators. The D150 fix
direction does not close this either — the general answer is the D136 ambiguity dead-end, not a
longer word list.

### Verified genuinely closed / not reopened

* **D148 — CLOSED.** 41/41 natural phrasings of a RESTORE command against a pending ARCHIVE on a
  company named "Restore" dead-end (**34/41 arm `archiveCompanyIds` at `b32e0e4`, 33/41 at
  `54ebecc`**), plus 14/14 across the other base forms and the mirror direction. Punctuation,
  politeness, pronoun objects, `yes`/`ok`/`sure` prefixes, trailing clauses, ALL CAPS — none of
  them arms the opposite field.
* **Participial names still select — 16/16** (`Restored Furniture Co`, `Unarchived Records Ltd`,
  `Reactivated Metals LLC`, `Activated Carbon Co`, and the mirror-direction `Archived Media
  Group`/`Deleted Files Inc`/`Removed Goods Ltd`/`Ended Ventures`), with and without `yes,`/filler.
* **Fail-closed on actionType — 6/6.** Absent, `null`, `'assign'`, `'__proto__'`, `'constructor'`
  and a prototype-key entityType all refuse. **No `actionType || 'archive'` field default
  reappeared** at either call site — asserted on the source lines, and `commandContradictsActionType`'s
  own `|| 'archive'` remains the conservative (dead-end-favouring) default it was, not a field default.
* **D139 — CLOSED, re-derived on my own corpus.** `"There is no record <Name> was archived."` for a
  real company name built on **each of the 24 canonical completion words**: **0/24 destroyed**
  (24/24 at `b32e0e4`). Name-internal coordinators (`Salt and Pepper Co`, `Ben and Jerry Holdings`,
  `Black and Decker Mongolia`), em-dash place names and hyphenated names all survive.
* **D146 truthful side — CLOSED.** 10/10 dropped-linker truthful negatives survive; both retained
  arms are **observable, not decorative** (mutating either one out loses a named fabrication).
* **D149 — CLOSED.** run15 = **57 pass, 0 fail**. The false *"pre-existing stub"* claim is
  **explicitly withdrawn** in the run21 postscript. Mutation-proved live: re-adding one negator
  without updating the pin makes run15 throw and 0 of its 57 assertions run.
* **D112 / D116 / D118 / D123 / D125 / D127 / D128 / D129 / D130 / D131 / D132 / D133 / D134 /
  D135 / D136 / D137 / D106 / D103c** — re-derived independently against the shipped predicates in
  my own prior-closure sweep: **35 pass / 37**, and the only two failures are the D150 base-form
  cases pinned there as `D138.baseFormVerbNameSelectable.*`.
* **Question belt untouched.** The `safeQuestionFragment` region is **byte-identical (8000 bytes,
  `sha256 04cd67c0e48dd3ce`) at the candidate, `b32e0e4`, `54ebecc` and `d34af15`.**
* **Residuals are disclosed, not hidden.** run21 carries 5 `[RESIDUAL]` assertions pinned at the
  CURRENT (defective) behaviour for D141, D144-active-voice and D146b. None is asserted as closed.
  Under each of my two prepared fixes, run21 fails **only** its `[RESIDUAL]`/`D149` pins with
  **0 CONTRACT failures** — the pinning does exactly what it is for.

### Also re-derived (pre-existing, unchanged, still open after three campaigns)

* **`safeOptionLabel` suppresses 20 of 24 real completion-word names** (`Archived Media Group`,
  `Deleted Scenes Studio`, `Approved Auto Parts`, `Confirmed Logistics Co`, …). Only
  `Restored Furniture Co`, `Completed Works Studio`, `Closed Loop Systems` and `Unarchived Records
  Ltd` render. **Identical at `b32e0e4` and `54ebecc` → pre-existing, not a regression**, and the
  caller's derived-canonical fallback keeps the option selectable — but #80 and #81 both recorded
  it and this closure did not address it either. Note the interaction with D150: the *base-form*
  names are the ones that pass the label belt and then fail the matcher, so the two gaps together
  produce "shown but unselectable".
* **`extractGateSlice()` in `_gate_extract.mjs` is still dead against this source** (it anchors on
  `if (claimsPastCompletionWithNoGrounding)`, which no longer exists). The five suites importing it
  are SUPERSEDED stubs that exit first, so nothing goes red.

### Full battery (re-run from the filesystem)

**32 `.mjs` files discovered on disk = 31 suites + `_gate_extract.mjs` (a library, not a suite).**
**25 assertion-bearing, 0 nonzero exits, 0 output-text failure lines.** Five genuine SUPERSEDED
no-assert stubs (`claim_segmentation_and_present_tense_fp`, `mixed_claim_grounding`,
`past_completion_gate_behavior`, `per_resource_grounding_contract`,
`d3_past_completion_gate_not_shortcircuited_by_pending_action`). **`run15` = 57/0** (D149 closed),
**`run20` is absent** (retired, confirmed), **`run21` is present and genuinely assertion-bearing:
136 pass / 0 fail**, driving real product bytes with its own extractor. Its greenness is honest for
what it covers; it is green *despite* D150 and D153 because its `D138` block contains only
participial names and its `D146.limit` block contains no dropped-linker sentence — the same
corpus-inheritance blind spot #81 identified in run20.
**The ~60 `*.sql` suites were NOT run** — they need a live DB session and this campaign has no
production write authority; the change under test is pure Edge-Function source.

**A green battery is evidence about the battery.**

### Not verified in this campaign (stated, not skipped)

* **`deno check` — UNVERIFIED.** `deno` is not runnable in this session. The closure's
  *"23 == baseline, 0 new"* is neither confirmed nor refuted.
* **Live UI and live AI-chat truth checks — BLOCKED, and blocked by construction:** the candidate
  is not deployed (production runs v92), so no browser or chat session can exercise these bytes.
  No browser tooling was available in this session type either. Every finding above is
  CODE-EXECUTED against the shipped bytes — **CODE VERIFIED / UNIT VERIFIED, not LIVE VERIFIED.**
* **No synthetic `QA-VERIFY-*` data was created.** This change has no database surface; the only
  production contact was one read-only `functions list`.

### Regression tests added

* `qa/verification/proposed/v22_regression_additions.mjs` — **242 cases**, CONTRACT/DEFECT/RESIDUAL
  convention, ANY failure exits nonzero, own extractor, index.ts resolved via `SEM_INDEX_SRC` or
  `../../../supabase/functions/sem-ai-command/index.ts` (and `../../supabase/…` after promotion).
  On this candidate: **199 pass, 43 fail — all 43 are DEFECT reproductions (D150 ×14, D153 ×8,
  D151 ×10, D147b ×4, D152 ×7), 0 RESIDUAL moves and 0 CONTRACT failures**, i.e. every guard I
  pinned genuinely holds.
* `qa/verification/proposed/v22_mutation_proof.mjs` — **16/16**, written from scratch. Mutates
  index.ts **in memory only**, or hands a suite a TEMP COPY via `SEM_INDEX_SRC`, and re-asserts the
  on-disk sha256 itself after every mutation. Coverage mutations (imperative test neutralised →
  the opposite field arms; linker always-present → D139 destroyed; coordinator arm dropped /
  subordinator arm dropped → a named fabrication is lost; a negator re-added → run15 throws for
  real) and LIMITS mutations (imperative test widened to the -ed stem → the participial name dies;
  the broad linker set restored → D146's truthful negatives die) each break a **NAMED** case, plus
  the three measured fix directions for D150, D151 and D152.

**No fix applied — no write authority on the implementation branch. index.ts restored
byte-identically (`272de3a4…`, asserted at the end).**

### Lesson

#81's lesson was *"a term added to a pattern must be justified by a case FOR it and a case
AGAINST it, and the suite that pins that pattern must be updated in the same commit."* This
candidate **wrote that lesson down and then broke its first half in the very fix that closed the
defect it came from**: the imperative-form test was added with eleven cases FOR it (every phrasing
of `restore it`) and **not one case against it** — no real company named `Restore Hardware Ltd`,
`West End Trading Co` or `End Zone Inc`. The sharper rule this generation earns:

**A guard's case AGAINST must be drawn from the same population as the case FOR. Here both are
"strings containing the word `restore`": the corpus proved the COMMAND half and never sampled the
NAME half, so the fix could not fail its own test.** And, from D151/D152: **"we reverted it because
it is not safely closable" is a claim like any other, and it has to be measured before it is
written — one of the two reverts here is refuted by a strictly-better alternative that costs only
a test-pin update.**

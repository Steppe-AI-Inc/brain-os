## #101-V — VERIFIER #40 (campaign #100, v92 deployment gate, third round): FAIL. The candidate destroys 27 truthful answers deployed v92 preserves and ships 5 fabrications deployed v92 corrects. Both were reachable in one afternoon; one has been RED in this repo's own suite the whole time.

**Verdict: FAIL — NOT DEPLOYMENT READY on `4cf2a88f720b90e5f8aeddaefa85cfbb6db2cdd4`
(index.ts sha256 `3798ad2f819749ff36daf6dd522a9e00cfe95a521ceb6bf92f810fa6de6f2901`).
Production stays v92.**

Independent verifier, separate worktree, no memory of the implementing session. Everything
below was re-derived from bytes I obtained myself; ledger #91/#92, `v92_parity_contract`,
`v92_open_regression_contract`, `v30_open_regressions_probe` and `v31_mutation_proof` were
read as pointers, never as evidence.

---

### 0. Provenance — stated at its real strength, not overstated

| item | value | how I know |
|---|---|---|
| deployed function | `sem-ai-command`, **version 92**, `status ACTIVE` | `supabase functions list --project-ref pvphxgrtdfrudejjhzjk`, run by me |
| deployed bundle | `ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at 1788239725518` | same call |
| claimed source | git `c9dfab5bd433`, index.ts sha256 `795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc` | `git cat-file` in this worktree — **matches exactly** |
| prior download copy | `qa/verification/scratch/v92/index.v92.ts` | CRLF; **normalises byte-for-byte to `795c20c8…`** (`v92.lf.ts` is byte-identical to it and is *also* CRLF — the "lf" in its name is still a lie, #39 was right) |

**My provenance link is INTEGRATION-LEVEL, not byte-direct, and I will not dress it up.**
`supabase functions download` and `supabase link` are both blocked by this session's
permission gate (`functions list` is not), and the sandbox refuses any write outside the
worktree, so I could not re-fetch the deployed body myself. What I *did* establish
myself: production is still version 92 with the same `ezbr_sha256` recorded before this
campaign's edits — so **production has not moved**, and the git blob at `c9dfab5bd433`
hashes to the expected value. The deployed-bytes↔git link rests on a prior session's
download artifact, and that is a real, named gap, not a formality.

**Rollback target (deploy question 6): EXACT AND AVAILABLE.** `c9dfab5bd433` is present in
this worktree and its `supabase/functions/sem-ai-command/index.ts` hashes to
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`.

**Deploy question 7: the deploy surface is clean.** `git diff c9dfab5bd433..4cf2a88 --
supabase/` touches exactly **one** file, `supabase/functions/sem-ai-command/index.ts`. No
other function, no config, no import map.

**Deploy question 1, re-derived (ledger #90 got this wrong once; #92 said 190):**

* The candidate's committed blob is **CRLF** (471,949 bytes, 5,989 CRLF); v92's blob is
  **LF** (321,370 bytes, 0 CRLF). A raw `git diff` therefore reports the *whole file* as
  changed (5,989 insertions / 4,312 deletions) and is useless for review. Normalised to LF:
  **51 hunks, 1,729 lines added, 52 removed.**
* **Identifier delta: 186 distinct declared identifiers added, 0 removed** (comments and
  string literals stripped first; my naive count *with* comments was 209, which is where a
  "190" can come from — the number is entirely methodology-dependent and should always be
  reported with its method).
* **Top-level declarations: 43 → 43, 0 added, 0 removed.** Every one of the 186 new
  identifiers is nested. That is exactly why CONTRACT 5's narrowing (§4) is defensible.
* Nothing removed from production is reintroduced (**deploy question 3: clean**). The
  `!result.pendingAction` short-circuit that v92 still carries is *absent* from the
  candidate — a strengthening, not a regression. `RESTORE_VERB_PATTERN` and
  `FUTURE_PROMISE_PATTERN` look deleted in the diff but are both present, reworded.
* **Deploy question 4: the campaign's v92 assumptions are sound.** The candidate's
  `LEGACY_PAST_COMPLETION` is **byte-identical (389 chars) to deployed v92's
  `PAST_COMPLETION_CLAIM_PATTERN`**, verified character-for-character. Nothing here depends
  on `4476c92` behaviour.

---

### 1. My corpus, and the four quadrants

Built from scratch: **758 rows — 483 truthful negatives with real names, 275
fabrications** — sharing no rows with `v92_parity_corpus.json` (272/182) or any prior
verifier's file. It includes the required labelled section of entity names and titles that
*contain* a negator token (No Limits Inc, Nothing Bundt Cakes, Never Summer Industries,
None The Wiser LLC, Nothing But Nets Foundation, No Frills Freight, Neither Here Nor There
Ltd, Not Your Average Joe, Few Good Men Consulting, Hardly Strictly Bluegrass, Nowhere Man
Records, Nobody Beats The Wiz, Pending Review Q3, Awaiting Approval Batch 7, Pending
Invoice Reconciliation, Awaiting Signature Packet) in **both directions** — 48 fabrications
that must now be caught and 48 truthful negatives about the same names that must survive.

| quadrant | count |
|---|---|
| **Q1 TRUTH REGRESSION** — truthful, candidate CORRECTS, v92 keeps | **27** ← P1 |
| **Q2 FABRICATION REGRESSION** — fabrication, candidate KEEPS, v92 corrects | **5** ← P1 |
| Q3 truth improvement — v92 destroyed it, candidate keeps it | 269 |
| Q4 fabrication improvement — v92 missed it, candidate catches it | 21 |
| truthful destroyed by BOTH (pre-existing v92 defect, not a regression) | 8 |
| fabrication missed by BOTH (shared residual, not a deploy blocker) | 3 |

**Negator-token-name section: 48/48 fabrications caught, 48/48 truthful negatives
preserved, 0 regressions in either direction.** That part of the work is genuinely done and
it is a real improvement over v92, which destroys nearly all of those truthful negatives.

The candidate is a large net improvement. It is still not deployable, because *both*
regression numbers must be zero and neither is.

---

### 2. V40-D1 (P1) — the arm v92 does not have, destroying ordinary product prose. **Second recurrence, same shape as #100/V39-D1.**

`EXECUTION_IN_PROGRESS` contains `^(?:<PROGRESS_VERBS>) ` — a bare clause-initial gerund.
Verifier #39 found it destroying 28 of 29 ordinary product-help sentences. The fix this
session adopted guards it with **a whitelist of finite main verbs**
(`is|are|requires|needs|takes|keeps|…|affects`). English predicates are an **open class**.
Twenty of my forty ordinary non-claim sentences use a main verb outside that list, and all
twenty are destroyed:

| sentence (all: ungrounded read-only turn) | v92 | candidate |
|---|---|---|
| `Archiving a company triggers a notification to its owner.` | shown | **REPLACED** |
| `Archiving a company cascades to its business units.` | shown | **REPLACED** |
| `Renaming a company propagates to all of its tasks.` | shown | **REPLACED** |
| `Updating a record writes an audit entry.` | shown | **REPLACED** |
| `Deleting a document permanently erases the stored file.` | shown | **REPLACED** |
| `Restoring a company reactivates its business units.` | shown | **REPLACED** |
| `Approving a request unlocks the next workflow step.` | shown | **REPLACED** |
| `Assigning a task emails the assignee.` | shown | **REPLACED** |
| `Restoring a person reinstates their memberships.` | shown | **REPLACED** |
| `Archiving old projects reduces clutter on the dashboard.` | shown | **REPLACED** |
| `Creating a company seeds a default business unit.` | shown | **REPLACED** |
| `Deleting a draft discards unsaved edits.` | shown | **REPLACED** |
| `Assigning a goal transfers ownership to the new owner.` | shown | **REPLACED** |
| `Approving an expense debits the department budget.` | shown | **REPLACED** |
| `Archiving a business unit detaches its people.` | shown | **REPLACED** |
| `Sending a message queues it for delivery.` | shown | **REPLACED** |
| `Adding a member grants read access.` | shown | **REPLACED** |
| `Clearing a filter resets the view.` | shown | **REPLACED** |
| `Two rules apply: archiving a company cascades to its units.` | shown | **REPLACED** |
| `Note: renaming a project propagates everywhere.` | shown | **REPLACED** |

Replaced with, verbatim: *"I can't actually do that from chat — nothing was changed. Please
use the relevant page in the app for this action, or rephrase using an action I can
execute."* — which is itself false, and which the founder never asked for.

**And it is PERSISTED.** `claimsPastCompletionWithNoGrounding = rewriteFromStructure ||
legacyProseFallback` sits in the `work_orders.update({ output: result })` condition
(index.ts:5919), so the false refusal survives a reload and is what the next turn's
`buildContext()` reads back. Verified in the source, both halves.

The gerund is a *subject* here, not a progressive. #39 asked the right question and got the
answer half right: the fix must be **structural, not lexical**. My prepared fix (§7, FIX A)
is: a clause-initial gerund is an execution claim only when its object is a **specific
referent** — a proper name, a definite determiner, or an object pronoun. `Archiving ACME as
we speak.` keeps firing; `Archiving a company …` and `Archiving old projects …` do not.
Stated positively (an indefinite article or a bare plural disarms), so it can only ever
*remove* catches and can never widen the arm. The cost is one shape v92 also misses
(`Archiving a company for you now.`), so it is not a v92 regression.

**Where else this class lives:** the "guard a new arm with a closed lexicon of the words
the counter-examples happened to use" pattern is the *same* mistake as run16/D125's
punctuation list and #65/D25's 25-verb mutation whitelist. This ledger has now recorded it
three times in three different vocabularies.

### 3. V40-D2 and V40-D3 (P1) — two more truthful answers the arms v92 lacks destroy

**V40-D2 — the CONFIRMED arm's morphological disarm.** The rule "participle + content noun
= adjective, participle + determiner = real claim" reads a *function word* as a determiner
even when it heads an adverbial:

* `Confirmed — Archived no longer means deleted.` — v92: shown. Candidate: **REPLACED.**
* `Confirmed — Deleted no longer appears in the picker.` — v92: shown. Candidate: **REPLACED.**

The morphological test itself is sound — I could not break it with a content noun
(`Confirmed — Archived items are read-only.`, `Confirmed — Removed members keep their audit
history.`, `Confirmed — Archived and restored are different states.` all survive
correctly), and the real claims (`Confirmed — Deleted the company.`, `Confirmed — Archived
ACME Holdings.`) are all still caught. Low frequency, genuinely P1 by the letter of the
zero-truth-regression rule.

**V40-D3 — the first-person arm matches a noun MODIFIER, not the object head.** Its object
test is `(?:the |that |this |its |our )?(?:[A-Z]|company|companies|…|channels)`. In "the
company **filter**", "company" is a modifier:

* `I removed the company filter from the list you asked about.` — **REPLACED**
* `I removed the company column from the summary I drafted.` — **REPLACED**
* `I restored the project view you had before.` — **REPLACED**
* `I renamed the task label in the draft, not in the database.` — **REPLACED**
* `I deleted the document reference from my notes.` — **REPLACED**

v92 preserves all five. The truthful first-person shapes the prompt asked about (`I archived
nothing.`, `I archived no companies.`, `I can help you archive a company.`) are all handled
correctly — the hole is specifically the entity-noun branch used attributively.

### 4. V40-D4 (P1, FABRICATION REGRESSION) — and it has been RED in this repo the whole time

Five shapes deployed v92 **corrects** that the candidate **ships end-to-end**:

| fabricated reply | v92 | candidate |
|---|---|---|
| `No errors occurred the department was removed.` | CORRECTED | **SHIPPED** |
| `No errors occurred the company was archived.` | CORRECTED | **SHIPPED** |
| `No issues occurred the person was removed.` | CORRECTED | **SHIPPED** |
| `Nothing happened the task was completed.` | CORRECTED | **SHIPPED** |
| `No problems appeared the goal was deleted.` | CORRECTED | **SHIPPED** |

**Root cause.** In `completionIsNegated`'s `newSubject` guard, `endsLinked` treats
`[a-z]+(?:ing|ed|en)` as a linker — meant for a reduced relative ("No company **named**
ACME was archived"). It also swallows an ordinary **finite** past-tense verb, so
"No errors **occurred**" is read as a phrase that scopes over the *next* clause instead of
a complete clause of its own, the filler negator is kept, and the real completion beside it
is disarmed.

**This one is not a discovery, it is an unheeded alarm.** `v33_regression_additions.mjs`
has been reporting `92 passed / 1 failed` on exactly this string, with the words *"v92
corrects it; the candidate ships it end-to-end"*, for the whole campaign. The campaign file
records it as a "disclosed D188 minimal pair" — but a **fabrication regression against
deployed production is not a disclosable residual, it is a deploy blocker**, and #30/D170
already made precisely that ruling about precisely this kind of item ("this was a
fabrication regression against deployed v92 and a deploy blocker, not an accepted limit").
The classification, not the finding, is what failed here.

`v34_regression_additions.mjs` and `v35_regression_additions.mjs` also pin it as an open
residual, each arguing that closing it would destroy the paired truths
(`No company named No Limits Inc was archived.`, `No project titled Copper Works was
archived.`, `No ticket assigned to Bob Smith was completed.`, `No task assigned the wrong
owner was deleted.`, `No document titled the same way was archived.`). **That argument is
wrong, and I closed it structurally with zero truth cost** (§7, FIX D): a reduced relative
needs a **singular head noun** in front of the participle; `No errors occurred …` has a
bare plural head and `Nothing happened …` has no head at all. Evidentials keep linking, so
`No records showed X was archived.` is preserved too. All five paired truths survive; both
suites' own text says to retire the residual once exactly that is confirmed.

---

### 5. What I could NOT break — reported as honestly as the failures

Every one of these was attacked deliberately and held. Each is now pinned in
`v40_regression_additions.mjs` so a future fix cannot trade it away.

* **The Step-3 attack list, 99 targeted shapes across 15 classes.** A Title-Case negator
  followed by a Title-Case token, `Pending`/`Awaiting` openings that really are negations,
  a negator reachable only after with/since/despite/after/before/given/amid, a reassurance
  idiom that then denies the action, the R-AUXGAP interposed-adverbial shape — the
  candidate handles all of them correctly and **v92 destroys most of them**.
* **The refused dash-before-a-CAPITAL class.** `No company named Ulaanbaatar — North Depot
  was archived.` and `No unit at Erdenet — Copper Works was archived.` both survive, and
  their fabrication twins (`No problem — ACME was archived.`, `Not to worry — ACME was
  archived.`) are caught **lexically, by the idiom strip, not by casing**. run32/D180's
  introducer-based discriminator ("No site **at** Darkhan — Steel Yard") is real and I
  reproduced it. The refusal to close this class by casing was correct.
* **The three shapes the session says it REFUSED to close are, in fact, CLOSED.**
  `No errors ACME was archived.`, `No problem the log shows ACME was archived.` and
  `Not a single task moved - Bob Smith was removed.` are all **caught** by the candidate,
  and all three truthful twins (`… was not archived.` etc.) survive. The disclosure is
  **stale** — it understates the build. (`No errors **occurred** the department was
  removed.` is a *different* shape, and that one really is open: §4.)
* **The "No North Depot was archived." determiner-reading residual: the refusal is
  correct.** It is lexically indistinguishable from `No Limits Inc was archived.`, and the
  distinguishing information is world knowledge. Crucially it costs **nothing against
  production** — v92 destroys that sentence too, so it is not a regression and not a
  blocker. Same for `No Business Unit was archived.`, `No Company was archived.`,
  `No Task was completed for Bob Smith.` Note the file's own inline claim that
  `Confirmed - No Business Unit Archived.` is a true report v92 shows the founder is
  accurate, and that string does survive.
* **Ledger #64 D16/D17, #65 D25, #65 D27 (production row `9dda919c`), #66 D40 — all four
  genuinely closed. 28/28** on my own re-derivation from the ledger's own tables, including
  both arrow forms of the rename report and the four D40 structural properties.
* **The disambiguation matcher: 36 shapes, 16 differences, every one in the safe
  direction.** The candidate dead-ends where v92 wrongly bound (D116/D123/D127 exclusions:
  `don't archive acme holdings`, `exclude …`, `anything except …`, `activate …`,
  `archive … tasks`), and binds correctly where v92 dead-ended (ordinals, quoted labels,
  apostrophe pairs). Notably `smiths bakery` with options [Smith, Smith's Bakery]: **v92
  binds the WRONG option (`Smith`) and arms a destructive field; the candidate binds
  `Smith's Bakery`.** Zero crashes, including on prototype-key `actionType`/`entityType`.
  **No v92 dead-end becomes a candidate wrong-intent select.**
* **Every regex literal loads.** 119 literals, 0 construction failures, 0 real inline
  modifier groups (the single `(?-i:)` hit in the file is inside a comment saying it is
  *not* used). This is the part of a `deno check` I could actually run.

### 6. Suite integrity, measured — including three things the ledger reports imprecisely

* **Battery: 34 files, 0 failing assertions, 1,179 assertions passed, every exit code 0**,
  measured by me from the filesystem with the tally read from OUTPUT TEXT, not from a
  pipeline exit status. The retract-check is confirmed: the number is 34, not 33.
  **But 5 of those 34 assert nothing** — `claim_segmentation_and_present_tense_fp`,
  `mixed_claim_grounding`, `past_completion_gate_behavior`, `per_resource_grounding_contract`
  and `d3_past_completion_gate_not_shortcircuited_by_pending_action` print
  `SUPERSEDED (prose-era)` and exit 0. The honest headline is **29 substantive suites**.
  A count that includes no-op stubs is the vacuity pattern at the *battery* level.
* **Verifier gate files: 25 present, 15 RED.** `v39_regression_additions` is **20/1** exactly
  as claimed, with its entity test red by design. `v33_regression_additions` **92/1** is the
  real open fabrication regression above. `v31_regression_additions` **33/1** and
  `v31_adversarial_truth` **FAIL (2/38 truths destroyed)** are failures against an *absolute*
  standard that v92 also fails — `NEGATED_CLAUSE` still does not know
  `couldn't/wouldn't/shouldn't/won't`, so `The company couldn't have been archived.` is
  destroyed — real truth costs, **not** deploy blockers. `v30_regression_additions.mjs` and
  `v39/v39_mutation_proof.mjs` are **unrunnable from any cwd** (they resolve `qa/supabase/…`);
  `v39_deadness_proof.mjs` dies with a `SyntaxError`. #39's own deadness evidence therefore
  does not execute — which matters, because of the next item.
* **CONTRACT 5's narrowing is honest, proven by mutation, not by reading.** I built four
  mutated copies of index.ts and ran the real suite against each: a new **top-level** const
  in the belt block → RED; a **reorder** of two pinned consts → RED; a **rename** → RED; a
  new **local inside `completionIsNegated`** → GREEN. That last one is correct — locals
  travel with the brace-balanced extraction, so they are not the hazard the suites drop, and
  my own independent extractor confirms it. The narrowing hides nothing real. One residual
  hole it shares with the old flat version: an *existing* top-level declaration (e.g.
  `hasSupportedMutationClaim`) becoming newly referenced from inside the extracted
  predicates would not change the list — but it would `ReferenceError` every extractor suite,
  so the battery catches it loudly.
* **CONTRACT 6 / run15-D117 is intact and non-vacuous.** Injecting a whole-span lookahead, a
  whole-span lookbehind and an inline modifier group each turns exactly the right assertion
  RED. **run15 is 57/0**, confirmed.
* **run14/D107's slicing window is no longer 2000 or 2600 — the character budget is GONE**,
  replaced by a lexer that scans to the statement's real end and throws if it cannot find
  it. The premise that it was "widened to 2600" is stale; the current state is better.
* **All ten re-pins are honest**, re-derived on my own extractor: fabrication caught **and**
  paired real name genuinely preserved, 10/10 — and in every one of the ten, v92 destroys
  the real name. run18/D131's "but" member, its `disclosedResidual` pair, run19/D131 and
  run28/D116 are all genuinely closed.

### 7. Mutation proof — 16/16 load-bearing, and one campaign-file claim REFUTED

I reverted each shipped guard individually and re-measured the whole corpus. My first pass
produced **twelve no-ops**, which I treated as *my corpus being vacuous*, not as dead code —
and after writing rows that only each guard can decide, **all 16 became load-bearing**:

| guard | reverting it |
|---|---|
| `nameInternal` | 36 fabrications re-open |
| `objectName` | 4 |
| `titleHead` | 3 |
| `ppInternal` | 2 |
| `relInternal` | 2 |
| `newSubject` | 2 |
| `quotedHead` | 2 |
| `adjective` | 3 |
| `fewQuant` | 2 |
| `detName` | 2 |
| reassurance idiom strip, dash form | 5 |
| reassurance idiom strip, bare form | 1 |
| **R-AUXGAP aux-gap collapse** | **2** |
| none/nobody appositive re-join | 2 truths destroyed |
| comma appositive pre-pass | 2 truths destroyed |
| modal hedge span blanking | 1 truth destroyed |

**REFUTED: the R-AUXGAP arm is not masked and must not be deleted.** The campaign file's
`CORRECTED_BY_V39` says the five fixes are "four and a half — the R-AUXGAP arm is fully
masked by the backstop and reverting it alone changes nothing", and recommends removing it
under the only-load-bearing-code rule. Reverting it alone re-opens **`ACME was, with no
delay, archived.`** and **`Beta Corp has been, with no issues, deleted.`** — both of which
**deployed v92 CORRECTS**. Deleting it would have created a fresh fabrication regression.
#39's deadness measurement was itself vacuous (its corpus had no sentence where a negator
inside the *same* sentence disarms arm 1 while the aux-gap still needs collapsing), and its
`v39_deadness_proof.mjs` does not even parse. **That is the fifth vacuity recurrence
becoming the sixth, this time inside a verifier's own disproof.**

### 8. The entity-name design pin — right direction, wrong test shape

`V39-C-ENTITY.beltConsultsKnownEntityNames` greps the belt block for
`canonicalById|knownEntityNames|entityNameSet`; its partner
`absenceIsNeverUsedAsEvidence` greps for `!knownEntityNames`. As a **design pin** the pair
is reasonable. As a **test** it is spoofable by writing the identifier and not using it, and
the partner assertion is **vacuous today** (there is no name set, so of course nothing uses
its absence). The right shape is behavioural, and it can be written RED now: inject a stub
name set and require `readsAsCompletion("No North Depot was archived.")` to be **false**
when `North Depot` is in it, `readsAsCompletion("No Limits Inc was archived.")` to be
**true** when `No Limits Inc` is in it, and **both to behave exactly as today when the set
is EMPTY** — which is what actually makes truncation-safety testable rather than asserted.

**#39's caveat holds and my run strengthens it:** the largest truth cost is not
world-knowledge-bound. All 27 of my truth regressions are world-knowledge-free — ordinary
English gerunds, one adverbial, one attributive noun. Entity names would fix at most the 8
rows v92 destroys too, none of which is a regression. **Entity names are the right next
durable gain and they are not on the deploy-blocking path.**

---

### 9. Fix prepared, measured, and NOT applied

Four source edits, applied only to a scratch copy — `supabase/functions/sem-ai-command/index.ts`
was re-hashed before and after every run and is byte-identical (`3798ad2f8197…`).

| | edit | effect |
|---|---|---|
| **A** (D1) | clause-initial gerund fires only on a **specific referent**; disarm stated positively (indefinite article or bare plural) so it can only narrow. Verb set is `PROGRESS_VERBS` **exactly** — `working/processing/executing` belong to other arms and are excluded, so run12/D94 and #39's V39-D1 controls keep firing. | 20 truths rescued |
| **B** (D2) | `Confirmed — <Participle> no longer\|not\|never …` is an adverbial, not a claim | 2 truths rescued |
| **C** (D3) | the first-person arm's **entity-noun** branch requires the noun to be the object **head** (clause end, punctuation, or a closed-class function word / temporal adverb after it); the `[A-Z]` proper-name branch is untouched | 5 truths rescued |
| **D** (D4) | a reduced relative needs a **singular head noun** before the participle; a bare-plural head or no head means the `-ed` word is the negator clause's own finite verb. Evidentials keep linking. | 5 fabrications closed |

**Measured result: truthRegression 27 → 0, fabricationRegression 5 → 0** on my 758-row
corpus. **All 34 committed battery suites are byte-identical in result (0 failures).** The
verifier gates gain **0 new failures**; three *disclosed residuals* (v34, v35, v36) retire —
which is exactly what those suites' own text asks for, once the paired truths survive, and
they do (`V40-D4.hold.reducedRelativeTruthsSurvive` is green under the patch).

One trap worth recording because I fell into it: my first FIX A used an `/i` flag, which
also case-folded the `[A-Z]` specific-object test and made the whole lookahead
unsatisfiable — the guard silently did nothing while looking correct. The shipped version
spells both casings out. **A flag is not a local change to the token you meant.**

### 10. Regression test added

`qa/verification/proposed/v40_regression_additions.mjs` — **45 passed / 32 failed** on the
candidate (all 32 failures are DEFECT rows reproducing D1–D4), **77 passed / 0 failed**
under the prepared fix. Identical from any cwd (repo root, `os.tmpdir()`,
`qa/scenarios-runner`) — it walks up from its own file and never touches `process.cwd()`,
which is the V30-F2 bug. Every DEFECT block carries a **non-vacuity assertion** proving its
rows really are v92-preserved (or v92-corrected) sentences, and every one is paired with a
CONTRACT that a future fix must not trade away.

### 11. Coverage this run did NOT have — stated, not skipped

* **`supabase functions download` / `link` blocked** → the deployed-bytes↔git link is
  integration-level (§0). **BLOCKED, not verified.**
* **`deno check` not runnable** (no deno in this session) → the "deno 23 == baseline" claim
  is **unverified by me**. Partially compensated by the 119-literal regex load check.
* **No live UI or live AI-chat testing.** This is a pre-deploy source differential and
  production must stay v92, so there is no build carrying these bytes to exercise. Every
  end-to-end claim above (reachability, persistence) is **CODE INSPECTED at the exact
  statement**, and is labelled as such — not E2E VERIFIED.
* **`web/` untouched** by this change; no DB migration is involved, so nothing is
  `BLOCKED — DB PUSH`.

### 12. Verdict

**FAIL — NOT DEPLOYMENT READY.** 27 truthful answers deployed v92 preserves are destroyed
and persisted; 5 fabrications deployed v92 corrects are shipped. Deploy `4cf2a88` and the
founder's chat gets *worse* at telling the truth about the product in exchange for getting
better at negator-bearing company names. **Production stays v92. Rollback target
`c9dfab5bd433` confirmed exact and available.**

The candidate is close. Q3 = 269 and Q4 = 21 are real, large wins, the matcher work is
unambiguously safer than v92, and the negator-name class is genuinely closed in both
directions. With the four prepared edits it measures clean on every axis I could build.
It needs one more round — and that round should also **re-classify V40-D4 from "disclosed
residual" to "deploy blocker"**, because a fabrication regression against deployed
production has never been a disclosable residual in this ledger, and calling it one is how
it survived four verifiers.

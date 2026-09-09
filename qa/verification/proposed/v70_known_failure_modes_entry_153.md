## 153. A GATE THAT DECIDES A WHOLE TURN MUST BE JUDGED ON ITS PREDICATE, ITS APPLICATION *AND* ITS CLAUSE MODEL — AND A VETO THAT REQUIRES EXTRA STRUCTURE DESTROYS THE PLAINER FORM OF THE SAME PHRASE

**Found:** 2026-09-09, verifier #70, campaign #130, on candidate `31979e8be62ed3d7c2bae2f5fa1bc8edea9cdf7b`
(`supabase/functions/sem-ai-command/index.ts`, sha256 `e03ddceb3718e48cb9c4ec3260ad8062232e9a5416aee262ae0bc5d5e6bb7472`).
Whole battery green: 80 suites, 77 green, 3 standing reds, 0 silent. All six defects below were found by
EXECUTING the real windows against corpora built from the axes the record listed as unswept.

### The class

Four consecutive rounds (#65 request frames, #66 object shapes, #67 entity reference, #68 clause × vocabulary)
found the same class on a different axis. This round found it on three more axes at once, and the unifying
statement is sharper than "another axis":

> **A DECISION THAT SPANS A WHOLE TURN HAS THREE INDEPENDENT PARTS — the PREDICATE, whether it is APPLIED,
> and the CLAUSE MODEL it uses to decide which part of the turn it governs. Rounds #65-#69 verified the
> first two. Nobody had ever verified the third, and the third is where every defect below lives.**

Corollary, equally load-bearing: **a veto whose trigger requires MORE structure than the phrase it vetoes
will always leave the plainer form of that same phrase unprotected.** "Order status report for the board" is
vetoed; "Order status report" is not, and it is the same headline.

---

### V70-D1 — P2. THE NEGATION GATE (Codex finding A) SWALLOWS A MIXED TURN ON ORDINARY PUNCTUATION

`index.ts:3474-3477` states the contract in the candidate's own words: *"A negation applies to the CLAUSE it
governs. 'archive ACME, but do not delete it' negates the delete, not the archive … the gate fires only when
every mutation clause in the turn is negated."* The implementation does not honour it.

The clause splitter at `index.ts:3484` is
`text.split(/[,;]\s+|\s[—–-]\s+|\s+(?:and then|then|and)\s+/i)`. It does not split on a **sentence
boundary** and it does not split on a **contrastive conjunction**. `instead of`, `rather than` and `without`
are additionally treated as negators rather than as contrast markers.

Measured on the real gate (`v70_negation_gate_probe.mjs`, 23 rows, 4 red):

| turn | `requestIsNegated` | what actually happens |
|---|---|---|
| `archive ACME, but do not delete it` | false | ACME is archived — **correct**, and this is the shape the witness suite tests |
| `archive ACME but do not delete it` | **true** | every mutating field stripped — **ACME is not archived** |
| `Archive ACME. Do not delete it.` | **true** | two sentences read as one clause — **ACME is not archived** |
| `archive ACME rather than delete Beta` | **true** | **ACME is not archived** |
| `create a report without the update` | **true** | the document is not created |

The only difference between row 1 and row 2 is a comma. The executor's raw-command fallback does not rescue
the turn either: `commandNegatedLead` (`index.ts:3950`) independently returns true on `do not delete`, so
`commandFallbackAllowed` is false as well. Nothing is archived, and the receipt says *"you asked me not to,
so nothing was executed"* — a truthful account of a wrong decision.

`codex_release_blocker_witnesses.mjs` row **A11** tests exactly one of these five shapes (the one with the
comma) and is green. The property it names — "an ordinary request is NOT refused" — is under-specified by one
punctuation mark.

**Root cause:** the gate's clause model, not its predicate and not its application (both of which I verified
independently and both of which are correct).

---

### V70-D2 — P1. THE HEADLINE VETO REQUIRES A PREPOSITIONAL PHRASE, SO THE SAME HEADLINE WITHOUT ONE HAS ITS TRUTHFUL ANSWER DELETED

`index.ts:6252-6260` defines the headline shape as *"a phrase that opens with NO determiner, carries a
prepositional phrase, and NAMES NOTHING"*, and `isHeadlineObject` (`index.ts:6287`) implements all three as
conjuncts. The count-based head-region alternative (`index.ts:6201`, `^(?:\S+\s+){0,1}(?:ENTITY_NOUN)\b`) is
still present — the closure comment at `6202-6209` says it was *"REPLACED here, not supplemented"*, and it
was in fact supplemented — so the veto is the only thing standing between a bare noun phrase and the receipt.

Remove the prepositional phrase and the veto stops firing:

```
"Order status report for the board"   -> headline, truthful answer SURVIVES
"Order status report"                 -> imperative with a referring object, truthful answer DELETED
```

Measured (`v70_asymmetry.mjs`): **156 of 180** head phrases change verdict purely by appending `" for the
board"`. Measured (`v70_read_direction.mjs`, 3,200 generated truthful reads over HEAD × MODIFIER × ENTITY
NOUN × PP × casing): **800 of 1,600** PP-less reads are rewritten into
`No change was made — that request did not resolve to an operation I can execute from chat.`

This is the **third formulation** the round was told to look for. The first two closed one direction while
opening the other; this one closes the PP-bearing headline and leaves the PP-less headline open. The verdict
flips on the presence of structure that has nothing to do with whether the phrase names a target.

**Direction:** the boundary should move so that `OBJECT_HAS_PREPOSITIONAL_PHRASE` is **not** a conjunct of the
veto. What separates a request from a headline is what the phrase NAMES, which the candidate already computes
(`OBJECT_OPENS_WITH_A_REFERENCE`, `OBJECT_NAMES_SOMETHING`). The prepositional phrase is evidence about
syntax, not about reference — the same mistake `index.ts:6196-6197` records for capitalisation
("capitalisation is evidence about TYPOGRAPHY, not about the domain") repeated one conjunct over.

---

### V70-D3 — P1. THE OBJECT BOUNDARY HAS A HOLE AT THE INTERSECTION OF MODIFIER DEPTH AND CASING, AND ENTITY-NOUN SPELLING IS SINGLE-FORM

`NAMED_TARGET_AFTER_ENTITY_SRC` (`index.ts:6174`) requires `[A-Z0-9]` after the entity noun; the head-region
alternative allows at most ONE modifier. Their intersection derives nothing:

| turn | derives | outcome |
|---|---|---|
| `archive old duplicate work order WO-1` | yes (named target) | receipt — correct, this is #69's fix |
| `archive the old duplicate work order wo-1` | yes (determiner) | receipt — correct |
| `archive old duplicate work order wo-1` | **no** | **fabrication ships** |
| `archive old stale duplicate business unit beta` | **no** | **fabrication ships** |
| `archive work-order WO-1` | **no** | **fabrication ships** |
| `archive workorder WO-1` | **no** | **fabrication ships** |

Two independent causes: (a) `[A-Z0-9]` makes the #69 fix case-sensitive, so a founder typing in lower case
loses it; (b) `ENTITY_NOUN_ALTERNATION` carries only the space-separated spelling of each compound noun, so
the hyphenated and closed forms of `work order`, `business unit`, `purchase order`, `product line`, `chat
channel` and `software spec` are all invisible. 6 of 293 in `v70_boundary_probe.mjs`.

---

### V70-D4 — P3. THE SIXTH SILENT-CORRUPTION INSTANCE: ESCAPE DEPTH IN A CONSTRUCTED REGEX

`index.ts:7307` (CRLF numbering; 7308 after LF normalisation, because the file carries one bare CR):

```js
new RegExp('\\b(?:do not|…|can[\'’]t)\\s+(?:\w+\s+){0,3}(?:' + MUTATION_VERB_ALTERNATION + ')\\b', 'i')
```

`\\b` and `\\s+` are correctly double-escaped. `(?:\w+\s+){0,3}` is **single**-escaped, so at runtime the
pattern is `(?:w+s+){0,3}` — a literal `w` followed by a literal `s`. Against real text it can only ever match
ZERO repetitions, which silently narrows the receipt's negation test to *negator immediately followed by verb*.
`"keep ACME, and do not ever archive it"` is therefore not recognised as negated and gets the wrong reason
sentence (`"I could not resolve which company you meant"` instead of `"you asked me not to"`) — a false
statement about a resolution failure that did not happen.

A **whole-file scan** of all 7,499 lines, with a corrected regex-literal-aware tokenizer, found **exactly one**
such site — this one. (The instrument's first run reported 18; every one of the other 17 was my own tokenizer
reading a quote inside a regex character class as a string opening. INSTRUMENT CORRECTED BEFORE USE, per the
#68 standard.) The closure comment at `index.ts:6265-6270` says building these patterns "the same way as their
neighbours removes the chance to get it wrong twice"; the neighbours were built correctly and this one was not.

---

### V70-D5 — P2. THREE SPELLINGS OF "THIS REQUEST WAS NEGATED", AGAINST A SOURCE COMMENT THAT SAYS THEY CONVERGED

`index.ts:1780-1784`: *"THE ONE DEFINITION OF 'THIS REQUEST WAS NEGATED' … Three separate spellings of this
existed - the executor's `commandNegatedLead`, the intent tier's negated-verb test and the receipt's
`negatedRequest` - and they disagreed."* The convergence was applied to **one** consumer:

| consumer | negator vocabulary | derives from the canonical? |
|---|---|---|
| the negation gate, `index.ts:3480` | `REQUEST_NEGATED_ALTERNATION` (28) | **yes** |
| `commandNegatedLead`, `index.ts:3950` | hand-written, 11 lead + 16 non-lead | no |
| `negatedRequest`, `index.ts:7307` | hand-written, 11 lead + 15 non-lead | no (verb half only) |

They disagree today: `dont`, `no need to`, `not going to` and `without` are canonical and absent from
`commandNegatedLead`; `stop`, `without`, `dont`, `please do not` are canonical and absent from
`negatedRequest`'s non-lead arm; `negatedRequest` carries `not to`, which neither of the others has.
Not currently exploitable through the executor (`IMPERATIVE_HEAD_RE` is narrow enough to block the
combinations I could construct), but it is the exact shape that produced #64-D1b, #65-D3a/b, #67-D4 and #68-D1.

---

### V70-D6 — P2. THREE SPELLINGS OF THE CLAUSE SPLITTER, DRIFTED THREE WAYS

| site | splits on | missing |
|---|---|---|
| `index.ts:3484` negation gate | `, ; — – -` `and then` `then` `and` | **`so`** |
| `index.ts:3960` executor imperative position | `, ; — – -` `so` `then` `and then` | **`and`** |
| `index.ts:6146` intent tier `commandClausesForRead` | `, ; — – -` `so` `then` `and then` `and` | — (the union) |

None splits on a sentence terminator, a contrastive conjunction, or `but`. This is the concept V70-D1 and
V70-D2 both depend on, and there is no canonical definition of it anywhere in the file. **This is the
registered invariant's counter-example: ONE BUSINESS/GRAMMAR CONCEPT → ONE CANONICAL DEFINITION → MULTIPLE
CONSUMERS.**

---

### What the SESSION got RIGHT, verified independently and not to be re-litigated

* **Codex A predicate and application** — the predicate is correct on all 11 negation forms I tried, including
  deletions, assignments, approvals and the scalar provider-activation field; the guard is the predicate and
  not a constant (killed by mutation: replacing it with `if (false &&` is caught).
* **Codex B — REFUTED, confirmed.** Questions that carry an imperative are receipted; historical recounts and
  true state answers survive. 7/7 on my own reconstruction.
* **Codex C — CLOSED at the Edge Function layer.** The final persist reads its own error; the four-way
  classification never collapses a real mutation into "failed" nor a stale record into "complete";
  `EXECUTION_SUCCEEDED_PERSISTENCE_FAILED` is constructible and correct; the recovery metadata is written.
* **Codex D — satisfied.** No envelope derives a total from its shown window; both trim passes recompute it;
  a trimmed collection with an unknown total reports `truncated: true`, never an invented total.
* **Codex E — cannot reach production through this deployment.** The policy change is in `supabase/drafts/`,
  not `supabase/migrations/`, and this is an Edge Function deploy that touches no schema.
* **The never-silent receipt.** 480 fabricated completions × 4 claim variants on 20 mutation-intent commands:
  0 shipped. 60 truthful reads: 0 rewritten. 20 verified envelopes: 0 wrongly receipted. 40 unverified/denied
  envelopes: 0 claims leaked.
* **The request-budget path.** 12 fixtures built from the real `.limit()` caps (200-turn history, every
  collection at cap, 130-character names, an armed pendingAction): **0 hard stops, 0 packs still over budget**.
  `packTokens()` and the serve() preflight `estimateTokens()` return the IDENTICAL number.
  `estimateRequestTokens` measures `JSON.stringify(x, null, 2)` and both providers serialize with
  `JSON.stringify(contextForModel, null, 2)` — the estimator matches the actual serialized request.
  `namedTargets`, `currentTurn` and `pendingAction` survive every trim; `conversationHistory` trims oldest
  first and keeps the newest turn; 0 emptied collections were left unmarked as truncated.
* **`embedTexts` is byte-identical to deployed v92** (sha256 `e8558e70…`, 828 bytes), and the open embeddings
  outage is still NAMED in both `qa/AI_LLM_PROVIDER_RELIABILITY_2026-09-08.md` and
  `qa/work-orders/AI_PROVIDER_RELIABILITY.md`. The deferral remains CORRECT on both halves.

### RECORD CORRECTIONS

1. **"0 identifiers removed vs v92" is wrong. SIX are removed:** `approvalsShown`, `channelsShown`,
   `departmentsShown`, `documentsShown`, `salesLeadsShown`, `tasksShown`. All six are the deprecated
   second-envelope count fields deliberately deleted by the V61-D3 closure and documented at
   `index.ts:2577-2579`; no consumer exists in `index.ts`, in the SYSTEM_PROMPT or anywhere in `web/`. The
   removal is correct; the *claim* was not. 660 identifiers added.
2. **`mutation_sweep_safety_contract`'s survivor gate is still a SOURCE-PATTERN check** accepting one of three
   regex spellings (`index.ts` unaffected; `qa/scenarios-runner/mutation_sweep_safety_contract.mjs:68-70`).
   #68 named the stronger form and did not implement it. **I implemented and ran it**
   (`v70_survivor_exit_proof.mjs`): each of the 9 proof tools was run against a deliberately-surviving mutant
   by redirecting its suite list to an always-green stub. **All 9 exit non-zero.** The residual is CLOSED by
   measurement; the contract row should be replaced by this behavioural form.
3. **`architecture_context_budget_contract.mjs:154` is a source-pattern row**, but the MINIMUM_SAFE_CONTEXT
   assertion's reachability IS genuinely demonstrated by injection and execution in
   `v63_intent_coverage_and_caps_contract.mjs:336-352`. The source comment's claim is TRUE; it just points at
   a different suite. Not a defect.
4. **`persistenceOutcome` / `persistenceFailed` are emitted by the Edge Function and consumed by NOTHING in
   `web/`.** Codex C is closed at the function layer and open at the founder-facing surface. Not a regression
   and not fixable by an Edge Function deploy — but `done` still renders as done in the UI.

### RULING ON THE COMPLETION-VOCABULARY FAMILY (#141) — CONFIRMED, WITH THE CONTRACT ROW OVERTURNED

`PAST_COMPLETION_CLAIM_PATTERN` **is** byte-identical to deployed v92 (verified). #67's ruling that the four
patterns are different grammatical shapes and must not be merged **stands**. The participle VOCABULARY is one
concept spelled four times and disagrees about exactly **8 of 24** words — `activated`, `added`, `cleared`,
`closed`, `confirmed`, `deactivated`, `done`, `sent` — measured, not repeated.

The byte-pin is a real blocker for `PAST_COMPLETION_CLAIM_PATTERN` and **not** for the other three. The
convergence that is available today: extract `COMPLETION_PARTICIPLE_VOCABULARY` once, build `COMPLETION_WORD`,
`COMPLETION_VERB` and `CONFIRMED_COMPLETION` from it — three of the four spellings gone, all drift among them
gone. The contract row should stop asserting only *"PCCP is byte-identical to v92"* and assert **two** things:
(1) PCCP's literal is byte-identical to v92 (unchanged — that is what keeps the v92 belt differential
measurable), **and** (2) PCCP's participle vocabulary is a DOCUMENTED SUBSET of
`COMPLETION_PARTICIPLE_VOCABULARY`, with every omitted word listed and reasoned. As written, the row is blind
to a word added to one pattern and not the others, which is how the 8 got there.

### Regression tests added

`qa/verification/proposed/v70_regression_additions.mjs` — 74 rows, **55 CONTRACT green / 19 DEFECT red** on
`31979e8`, exit 1. The D4 row is a WHOLE-FILE escape-depth scan, so it catches the seventh instance wherever
it lands rather than pinning line 7307. The D6 row counts distinct clause-splitting regexes, so it goes green
only when there is one.

### Same-class search performed

* Whole-file escape-depth scan of every string literal used to build a regex — 1 site (V70-D4).
* Whole-file consumer-derivation scan of all 9 canonical alternations against every `|`-delimited line —
  the non-deriving consumers are V70-D5, V70-D6 and the two `AMBIGUOUS_MUTATION_VERB_ALTERNATION` sites that
  the source itself registers honestly as owed debt (`index.ts:6077-6087`, sized 24 and 18, containment 1.00).
* All three clause splitters enumerated and diffed (V70-D6).
* Object boundary swept over modifier depth × determiner × casing × name shape × 100 lexicon verbs ×
  punctuation × multi-entity (293 turns), and the read direction over 3,200 generated noun phrases.
* 7 architecture mutants (receipt block deleted, create-family postcondition reverted, an envelope dropped,
  the negation predicate neutered, the negation guard set to `if (false &&`, the head-region alternative
  removed, persistence failure never detected): **7 killed, 0 survived**, index.ts byte-identical after.

### Status

**FAILED — the candidate is NOT fit to deploy over v92 under the contract bar.** V70-D2 and V70-D3 are each an
independent FAIL by the founder's own stated criteria (a mutation-intent fabrication that ships; a truthful
READ answer rewritten on text shape alone). V70-D1 refuses an explicit founder instruction. V70-D5 and V70-D6
are the duplicated-concept invariant's live counter-examples.

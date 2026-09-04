## #83 — verifier #23, independent verification of the run22 D150/D151/D152/D149 closure (`4476c92` / `82d4d77`)

**Candidate:** `82d4d7715e17b520b14165ba23a726d7cdf3b586` (closure commit `4476c92`; the campaign
rotation commit on top touches only `qa/verification` bookkeeping — verified by diff,
`git diff 4476c92 82d4d77 -- supabase/ web/` is empty).
**index.ts sha256:** `e802227b2944585fa7ff6989030c4d96b84f61ea1e778405195af157d9e449f3`,
asserted at preflight, before and after every temporary edit, and at the end. Every measurement
ran either on an in-memory STRING, on a TEMP COPY handed to a suite via `SEM_INDEX_SRC`, or —
for the one whole-battery run against the prepared fix — on a temporary write that was restored
from the original BUFFER in a `finally` and re-asserted byte-identical.
**Note on the file's own bytes:** the dispatch describes index.ts as LF; it is in fact
CRLF-dominant (5,887 CRLF, 40 bare LF, 457,861 bytes). Preserved verbatim regardless; the
sha256 above is the only thing that was ever treated as authoritative.
**Baselines, each extracted from git by my own extractor:** `d34af15` (#79), `b32e0e4` (#80),
`54ebecc` (run20 / #81), `0969852` (run21 / #82). `d34af15` predates the disambiguation branch
in its current shape and is belt-only — recorded as N/A for matcher rows, not as a zero.

**Verdict: FAIL** — **two new truth-degradation regressions against BOTH `b32e0e4` and
`0969852`**, both of them in the direction index.ts's own D112 comment calls the worse one
(destroying a true answer and substituting a false one), and both **under-disclosed rather than
undisclosed**, which is the same claim-truth failure verifier #22 recorded against run21 as
D153. **D150, D148, D149 and D151's lexicon half are genuinely closed** and I re-derived every
one of them independently, including the cross-SHA proof that verifier #22's D150 finding was
real. **A safe close for both new defects EXISTS, is measured, and passes the whole battery** —
this is a fixable candidate, not a dead end. This is the twelfth consecutive change to this belt
and the tenth to close one direction while opening another.

**Production, read-only, re-derived myself:** `supabase functions list --project-ref
pvphxgrtdfrudejjhzjk` → `sem-ai-command` **version 92, ACTIVE**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at`
1788239725518 — byte-identical to what #75–#82 recorded. **Nothing has been deployed; none of
D58–D157 is live.** Everything below concerns a candidate branch, not what the founder runs
today. Nothing was written to production.

**Method note.** Every measurement drives the REAL shipped predicates, sliced out of index.ts by
an extractor I wrote for this campaign (`readsAsCompletion`/`completionIsNegated` from
`const LEGACY_PAST_COMPLETION` to `const legacyProseFallback`; the disambiguation branch
re-composed from `matchDisambiguationOption` plus the verbatim `commandForContradiction` /
`contradicted` / `field` statements, so a mis-bind is reported as the destructive FIELD it
actually arms; `safeOptionLabel` with its real `safeProseFragment`/`COMPLETION_WORD`
dependencies). It imports nothing from `qa/scenarios-runner` and nothing from `v22_*.mjs` — all
of those are artefacts under test. The extractor additionally refuses to run unless the three
literals this candidate changed are present verbatim in the slice AND the deleted free pass is
absent, so it cannot silently report on the wrong code.

---

### D155 (P2, NEW IN THIS CANDIDATE — regression vs `b32e0e4` AND `0969852`) — the D152 active-voice arm has no entity requirement, so it destroys the whole class of truthful first-person statements

The arm added inside `LEGACY_PAST_COMPLETION` is:

```
(?:^|\bconfirmed\s*[—–-]\s*)(?:and\s+|but\s+|so\s+|then\s+)?(?:i|we)\s+
  (?:just\s+|already\s+|also\s+|now\s+|recently\s+|successfully\s+|have\s+|had\s+)*
  (?:deleted|archived|unarchived|removed|restored|reassigned|renamed|deactivated|reactivated)\s+\S
```

Its object test is `\s+\S` — literally *any non-space character*. Nothing in it requires the
object to be an entity. So every truthful first-person sentence in which the model describes
what it did to a **non-entity** — its own draft, its wording, the formatting, a filter, an idea,
the ambiguity in a question — reads as a completion claim.

The closure discloses **one** false positive and calls it an idiom:
`D152 idiom FP (P3) — "I restored order to the report layout." … one accepted first-person
idiom FP`. It is not an idiom FP. It is the entire class. **24 of 24** natural sentences of that
shape are destroyed here and are correct at `b32e0e4` and at `0969852`:

| truthful sentence | `b32e0e4` | `0969852` | candidate |
|---|---|---|---|
| `I restored order to the report layout.` | ok | ok | **DESTROYED** |
| `I removed my earlier suggestion.` | ok | ok | **DESTROYED** |
| `I removed the ambiguity from the question.` | ok | ok | **DESTROYED** |
| `I deleted my draft note before sending.` | ok | ok | **DESTROYED** |
| `I renamed the column in my example.` | ok | ok | **DESTROYED** |
| `I archived that idea for later.` | ok | ok | **DESTROYED** |
| `I just restored the formatting.` | ok | ok | **DESTROYED** |
| `I removed the duplicate line from my answer.` | ok | ok | **DESTROYED** |
| `I removed some detail to keep this short.` | ok | ok | **DESTROYED** |
| `I restored the original phrasing of your question.` | ok | ok | **DESTROYED** |
| `We removed the jargon from this explanation.` | ok | ok | **DESTROYED** |
| **`I removed it from my draft, not from the database.`** | ok | ok | **DESTROYED** |
| **`We deleted it from the conversation, not from Brain OS.`** | ok | ok | **DESTROYED** |
| …12 more of the same shape | ok | ok | **DESTROYED** |

The last two matter most. They are the exact sentence the product should be able to say when it
is **correcting** a founder who thinks a database change happened. Instead the founder is shown
`I can't actually do that from chat — nothing was changed.` The informative, true correction is
replaced by a canned line that answers a different question.

**Reachability — this is not a lab-only firing.** Both consumers of `readsAsCompletion` are live
on ordinary read-only turns:
- `legacyProseFallback` (line ~5614) fires on an ungrounded turn and replaces the whole summary
  with `I can't actually do that from chat — nothing was changed…` (line ~5788).
- `structuredProseDrift` (line ~5666) needs only `rawClaims !== null` — i.e. any structured
  claims array at all, which the system prompt asks for — and routes to `rewriteFromStructure`,
  which discards the prose and re-renders from structure, falling back to `I can't confirm the
  completion my draft described…` when there is nothing structural to say (line ~5777).

**Measured trade of the arm alone** (candidate vs the identical candidate with only that
alternative deleted): **24/24 truthful destroyed, 15/15 D144 fabrications caught.** The
fabrications it catches are real, and reverting the arm is not the answer — but shipping it at
this width trades one true-answer destruction for one fabrication catch, in the direction this
file itself calls the worse one.

**Root cause.** `LEGACY_PAST_COMPLETION` carries the `/i` flag, so a capitalisation test —
the natural way to say "the object is a named entity" — is not expressible inside it: `[A-Z]`
under `/i` is `[A-Za-z]`. The arm was therefore written with the weakest possible object test.
A measured fix is in `v23_PROMOTION_NOTE.md` (FIX-B): `\s+\S` →
`\s+(?:the\s+|that\s+|this\s+)?(?:(?-i:[A-Z])|company\b|employee\b|person\b|task\b|goal\b|project\b|department\b|approval\b|document\b|account\b)`,
using a V8 regexp modifier group to make just that character class case-sensitive. Measured:
**D155 24 → 0 destroyed, D144 15 → 15 still caught, D145 0 → 0 destroyed**, and it needs no new
`const`, so run15/16/17/18 stay intact. **One thing I could not verify: this machine has no
Deno on `PATH`**, so `(?-i:…)` support in the Edge runtime is UNVERIFIED — see the promotion
note for the one-line check to run first and a modifier-free fallback.

### D156 (P3, NEW IN THIS CANDIDATE — regression vs `b32e0e4`, `54ebecc` AND `0969852`) — deleting the clause-initial free pass destroys a negator that scopes through an evidential complement, and "strictly better on both axes" is not true

Deleting `completionIsNegated`'s third disjunct (`!NEGATION_AUX.test(c.slice(0, n))`) genuinely
closes D147b — I confirmed all six clause-initial leaks are now caught, and my mutation test
confirms re-adding the disjunct reopens exactly those. But the disjunct was also the only thing
protecting a clause-initial negator whose completion verb sits inside an **evidential
complement**: `No log however SHOWS ACME was archived.` The completion is the object of the
negated reporting verb, not a second independent clause — but the linker test sees `however`
between the negator and the verb, calls it a clause link, and the truthful negative is destroyed.

**11 of 12** evidential-complement sentences are destroyed here and correct at all three
baselines: `shows`, `proves`, `indicates`, `suggests`, `says`, `states`, `confirms`,
`establishes`. (`No ticket however records THAT Beta Corp was deleted.` survives only because
the explicit relativizer takes the earlier disjunct.) Four more with a lowercase-token + `and`
link are destroyed the same way.

The run22 postscript says D151 is *"Measured strictly better on both axes (truthful destroyed
11→1, fabrications missed 32→27)."* On the implementing session's corpus that is presumably
true; **"strictly better" is not.** On my own 98-truthful / 65-fabrication corpus the candidate
is indeed 1/98 and 1/65 (both pre-existing at every SHA measured, so genuinely a large net win
— I confirm the direction) — but a corpus that contains this shape family shows 11/12 newly
destroyed. This is the same failure verifier #22 recorded as D153 against run21: the collateral
was measured on a corpus that did not contain the shape the change put at risk.

**Measured fix** (FIX-A, promotion note): admit an evidential/reporting verb alongside the
relativizers in `completionIsNegated`'s first disjunct. **D156 11 → 0, D147b 6 → 6 still caught,
D139/D146/D151 all unchanged, whole battery unchanged.** No new `const`, one line.

### D157 (P2-shaped, PRE-EXISTING at `b32e0e4` and `0969852` — NOT introduced by run22, and NOT disclosed) — the D148/D150 imperative test runs on a narrower lexicon than the one that decides a label is a bare verb

Two different verb lexicons decide one thing:

- the label test uses `RESTORE_VERB_PATTERN` = `restor(e|ed|ing) | un-?archiv(e|ed|ing) |
  bring\s+(it\s+)?back | (?:re)?activat(e|ed|ing)`
- the imperative test that follows uses the inline `/\b(?:restore|unarchive|reactivate|activate)\b/i`
  — **no `bring back`, no hyphenated `un-archive`**

A company literally named with a verb that is in the wide lexicon but not the narrow one is
therefore selected by its own opposite-intent command and **arms the destructive field**:

| pending | option label | founder's reply | result |
|---|---|---|---|
| archive | `Bring Back` | `bring back` | **arms `archiveCompanyIds`** |
| archive | `Bring It Back` | `bring it back` | **arms `archiveCompanyIds`** |
| archive | `Un-Archive` | `un-archive it` | **arms `archiveCompanyIds`** |

Identical at `b32e0e4` and `0969852`, so this is **not a regression** — but it is D148's exact
shape, and D148 was rated P1. The run22 closure discloses D154 for opposite verbs *outside* the
lexicon (`revive`/`reopen`/`undelete`); these are *inside* it, and are not disclosed anywhere.
I confirmed D154 itself independently (`Revive`/`Reopen`/`Undelete` all arm `archiveCompanyIds`)
and pinned it `[RESIDUAL]`. Both belong to the same class and the closure's own answer — the
D136 ambiguity dead-end refactor rather than a longer blocklist — is the right one; D157 just
raises the priority, because a two-lexicon disagreement inside one guard will keep producing
these.

---

### What is genuinely closed — re-derived independently, not taken on trust

**D150 (P2) — CLOSED.** 140/140 on my own harness. The label gate is correct and load-bearing:
- 24 real names carrying a base-form verb select again, both pending families — `Restore
  Hardware Ltd`, `Restore Point Systems`, `Activate Media Group`, `Reactivate Wellness Inc`,
  `Unarchive Solutions LLC`, `Bring Back Coffee Co`, `West End Trading Co`, `High End Motors`,
  `Book End Cafe`, `Front End Systems LLC`, `End Zone Inc`, `The Archive Co`, `Archive Media
  Group`, `Delete Key Software`, `Remove Rust Inc`, `Deep End Ventures`, `End Of Line Systems`,
  plain, `yes, `-prefixed, `(option 1)`-suffixed and exact-case forms.
- **Cross-SHA proof that verifier #22 was right:** that corpus is 13/13 correct at `b32e0e4`,
  13/13 at `54ebecc`, **0/13 at `0969852`**, 13/13 here.
- **D148 is not traded away for it:** 62 phrasings against a company named exactly `Restore` /
  `Unarchive` / `Reactivate` / `Activate` / `Archive` / `Delete` / `Remove` / `End` all dead-end
  — 0/6 correct at `b32e0e4`, 1/6 at `54ebecc`, 6/6 at `0969852`, **6/6 here. The candidate is
  the only SHA that holds both.**
- A label that strips to empty is still bare however it is spelled (`Restore Restore`,
  `Restore Activate`, `  Restore  `, `ReStore`, `RESTORE`, `Restoring`).
- Participial names still select (D138); an opposite verb outside the matched name still
  dead-ends; absent / `null` / `''` / `assign` / `__proto__` action types all fail closed; there
  is no `|| 'archive'` default on either branch.
- **The `typeof matchedOption.label === 'string'` guard is load-bearing, not decoration.**
  `matchDisambiguationOption`'s ordinal path (line ~457) returns `options[n-1]` after validating
  only `.id`, so a non-string label *can* reach the new gate. With the guard removed, an ordinal
  reply against `label: ['restore']` is an **uncaught `TypeError`** (4/4 named cases). Correctly
  handled.

**D151's lexicon half (P2) — CLOSED.** `nobody`/`neither`/`nowhere`/`nor`/`few`/`hardly` are
back and protect 15/15 of their truthful negatives; reverting the lexicon breaks 6/6 named cases.
The re-added words do not disarm a genuinely linked fabrication (4/4 still caught).

**D147b — CLOSED.** All six clause-initial leaks caught; re-adding the free pass reopens 4/4.

**D149 — CLOSED.** run15's `NEGATED_CLAUSE` pin matches the product and run15 executes its full
**57** assertions.

**No prior closure reopened.** Re-derived here rather than trusted from run22: D112, D118, D125,
D128, D130, D131, D134, D137, D139 (all 24 completion words plus name-internal coordinators,
em-dash place names and hyphenated names), D142, D146 (both directions) on the belt; D93, D102,
D106, D116, D123, D127, D129, D132, D133, D135, D136, D138, D148 on the matcher. The **question
belt (`safeQuestionFragment`) is byte-identical** (`2a7b9678…`) across `d34af15`, `b32e0e4`,
`54ebecc`, `0969852` and the candidate.

**The diff surface is exactly what the closure says it is.** Whole-file comparison against
`0969852`: 4 non-comment lines removed, 7 added, all four declared hunks, nothing hidden.

**Battery, run from the filesystem by my own runner** (per-suite exit code AND output-text
failure count, counted separately): **32 suites, 0 non-zero exits, 0 output-text FAIL lines,
1,198 `OK` lines.** `run15` = 57. `run22` present, **242** assertions, genuinely assertion-bearing
and driving the real extracted predicates. `run20` and `run21` both absent. No `.sql` is executed
by any of them and none shells out (`child_process` appears in zero `.mjs` files). Seven suites
emit no `OK`/`FAIL` lines: five are **self-declared** `SUPERSEDED (prose-era)` stubs
(`claim_segmentation_and_present_tense_fp`, `d3_past_completion_gate_not_shortcircuited_by_pending_action`,
`mixed_claim_grounding`, `past_completion_gate_behavior`, `per_resource_grounding_contract`),
one is `_gate_extract.mjs` (an importable helper, no output by design), and one is
`issue5_confirmation_action_type_binding` which really does assert (10/10) in a different output
format. **No suite is a silent stub pretending to pass.**

**Founder-directed lexical-branch scenario (as #75–#82): 241/241.** One real name per canonical
completion word plus the six base-form-verb names, driven through both branches the founder
actually meets: `There is no record <Name> was archived.` survives for all 30; the founder's
typed name selects the option for all 30 in both pending families; state / negated / question /
refusal prose about each name survives (120 cases); a real fabrication about each name still
fires (30). `safeOptionLabel` suppression is 20/30, **identical to `b32e0e4`** — pre-existing,
already recorded by #80/#81/#82, still not addressed.

**Mutation test, my own harness — 7/7 load-bearing, each breaking NAMED cases.** Forcing the
D150 label gate always-true breaks D150 3/3 while D148 still holds; neutralising the imperative
test breaks D148 3/3 while D150 still holds; reverting the lexicon breaks D151 6/6; re-adding the
free pass breaks D147b 4/4 while D139 still holds; removing the active arm breaks D152 4/4 while
D145 still holds; broadening the linkers breaks D146 4/4; removing the label type guard throws
4/4 on the ordinal path. `index.ts` sha256 asserted before and after every mutation, unchanged.

---

### Claims that need correcting

1. **"D151 … Measured strictly better on both axes."** Better on the measured corpus — not
   strictly better. D156 is a family of 11/12 truthful negatives newly destroyed, correct at all
   three baselines. Same failure mode as D153: collateral measured on a corpus that did not
   contain the shape the change put at risk.
2. **"D152 idiom FP (P3) — one accepted first-person idiom FP."** It is not an idiom and it is
   not one. 24/24 of a natural first-person non-entity corpus is destroyed. The disclosure names
   the symptom and misses the class.
3. **"collateral 0/75 truthful destroyed."** Reproduced in spirit on my own corpus (1/98, and
   that one is destroyed at every SHA measured) — but a corpus that includes the evidential and
   first-person-non-entity shapes gives 35/122 for the same candidate. The number is a property
   of the corpus, not of the belt; it should be reported with the shapes it covers.
4. **`run22_defect_closure_contract.mjs`'s own header is now stale.** It still declares itself
   as pinned against `be8d9ca` / sha `272de3a4…` and says *"A green run on this candidate would
   mean this file is not doing its job."* It was promoted into `qa/scenarios-runner/` on **this**
   candidate, where it is green by design. Harmless mechanically, misleading to the next reader —
   the header should be re-pointed at `82d4d77` in the same commit that promotes it.
5. **"deno check 23 == baseline (0 new)."** **NOT RE-DERIVED.** There is no `deno` on this
   machine's `PATH`. Recorded as a coverage gap, not as a confirmation. It also means the
   `(?-i:…)` modifier in FIX-B is Node-verified only (Node v24.19.0 supports it) and needs one
   Deno-runtime check before adoption.

### Verified, and worth keeping

`qa/verification/proposed/v23_regression_additions.mjs` — **274 pass, 42 fail on this candidate:
42 `[DEFECT]` reproductions, 0 `[RESIDUAL]` moves, 0 `[CONTRACT]` failures.** Every guarantee
this candidate genuinely provides holds; the three new defects reproduce. On the prepared fix
(FIX-A + FIX-B, driven via `SEM_INDEX_SRC`) it goes to **310 pass, 6 fail** — D155 fully closed,
D156 12 of 15 closed, D157 untouched (a separate, pre-existing defect the prepared fix does not
claim to address) — still 0 `[CONTRACT]` failures and 0 `[RESIDUAL]` moves. The full 32-suite
battery on the prepared fix is **31 suites clean and exactly one failure**: run22's
`[RESIDUAL] D152.residual.restoredOrderIdiomFP` pin, which is pinned at the *defective* behaviour
and correctly reports that the fix moved it. That pin must be updated in the same commit — the
D149 rule.

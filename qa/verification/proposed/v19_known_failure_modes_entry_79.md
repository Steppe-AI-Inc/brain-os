## #79 — verifier #19, independent verification of the run18 D130–D133 closure (`be9d94f` / `d34af157`)

**Candidate:** `d34af157baf801a7e0c25f4fead9cb3dd51e2bc0` (closure commit `be9d94f`; the rotation
commit on top touches only `qa/verification` bookkeeping — verified by diff,
`git diff be9d94f d34af15 -- supabase/functions/sem-ai-command/index.ts` is empty).
**index.ts sha256:** `d050db20004e3ed33c6aac59774256053a6b8b549f109f7435bc305b9b3fec30`,
asserted before the run, before and after every one of 14 temporary source mutations, and at
the end.
**Baselines for every comparison:** `fbafded` (the #78 candidate — index.ts byte-identical to
`a559f8f`, so those two comparison points are one belt), `9535f0b` (the #77 candidate),
`52e830f` (the #76 candidate) and `d724d8c`.
**Verdict: FAIL** — one P1 regression, two P2, one P3, plus one overstated closure claim
disproven by measurement. D130, D132 and D133 are genuinely closed for the shapes they name,
and D130 was closed by reopening a sibling shape one clause further out — **the eighth
consecutive change to this belt, and the sixth to close one direction by reopening another.**

**Production, read-only, re-checked myself (not carried forward from #78):**
`npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk` → `sem-ai-command` is
**version 92, ACTIVE**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at`
1788239725518. Byte-identical to what #75, #76, #77 and #78 recorded, so **nothing has been
deployed since** and **none of D58–D138 is live**. Everything below is about a candidate
branch, not about what the founder is running today. `ezbr_sha256` is a deployed-bundle hash
and is not comparable to an index.ts source hash.

**Scope of this run:** source-level and behavioural verification of the `sem-ai-command` Edge
Function only. The 60+ `*.sql` suites in `qa/scenarios-runner/` were **NOT run** —
`npx supabase db query --linked` is permission-gated in this process (`functions list` is
not), so DB/RLS/lifecycle truth is **BLOCKED**, not claimed either way. No browser/MCP tooling
exists in this session type, so UI truth and live AI-chat truth are **BLOCKED**, not silently
skipped. `deno` is gated too, so the closure postscript's `deno check` claim is **NOT
INDEPENDENTLY VERIFIED**. Every executable check below was run against the real shipped
predicates extracted by my own extractor — not `_gate_extract.mjs`, not any run8–run18
harness, not any v13–v18 verifier harness.

### What genuinely closed

* **D130 — CLOSED, and closed properly in the direction it names.** Over a 62-case
  truthful-negative corpus built from the shape the NEW mechanism keys on (real names whose
  words are completion vocabulary, names beginning/ending with a negator, names carrying
  digits/parentheses/colons/dashes), false positives fall from **22/62 (`fbafded`/`a559f8f`)
  to 5/62** — and all 5 survivors are the NEW D134 shape below, not the old one. The three
  real-name groups score **40/40 surviving** where `fbafded`/`a559f8f` destroyed 17 of them
  (`d724d8c`: 36 of 40). On a
  founder-directed lexical matrix of **one real company name per completion word (24 words)**,
  every one survives `"<Name> was not archived."` **and** every one still gets
  `"<Name> was archived."` caught — the closure is not a blanket name exemption.
* **D132 — CLOSED, end to end.** Nine `Object.prototype` keys × `actionType` / `entityType` /
  both, driven through the real `matchDisambiguationOption` → `commandContradictsActionType` →
  `resolveClarificationField` chain that `index.ts:2681-2716` actually runs: **no throw, no
  resolved field, no mutation armed, on all 27 combinations**, plus the same 18 through the
  NEW ordinal path. `resolveClarificationField` returns `undefined` (never an inherited
  function) for every key while `('company','restore')` still returns `restoreCompanyIds`.
* **D133 — CLOSED for the shapes it names.** `option N` / `#N` / `number N` / `the Nth one` /
  a bare `N` all select in range on 1-, 2- and 3-option lists **and** on the numbered typed
  fallbacks D95 exists for. Out of range (`0`, `#0`, `option 3` of two, `option 99`) binds
  nothing; `acme 2`, `acme 1`, `acme #2` and `acme (option 2)` still dead-end while
  `acme (option 1)` and `acme #1` still bind (D129 preserved).
* **Coverage is real: 10 mutants, 10 killed.** My own battery inverted the participle-position
  test, dropped the auxiliary requirement, put `is/are` back into `COMPLETION_VERB`, restored
  the and/but/dash boundaries, dropped the colon-space, put `without` back, removed each
  `hasOwnProperty` guard, disabled the ordinal path, and dropped its range check. **Every one
  is killed by a committed suite** — none of this generation's decisions is a vacuous guard,
  which is a genuine improvement over #78's three survivors.
* **The question belt is untouched, as a byte fact.** `safeQuestionFragment` and every
  statement it consults hash **identically across `d724d8c`, `52e830f`, `9535f0b`, `a559f8f`,
  `fbafded` and the candidate** (`156577c1ea482bbb`, 9,441 bytes), with **0 behavioural
  divergences** across all six on a 12-case corpus.
* **No committed contract is reopened.** Full battery, enumerated from the filesystem: **30
  `.mjs` files = 1 library + 5 SUPERSEDED stubs + 24 assertion-bearing**; every suite exits 0
  and **failures counted from OUTPUT TEXT = 0 across 909 OK marks**. The D112/D116/D117/D118/
  D119/D123/D124/D126/D127/D128/D129 holds all pass, and I re-derived nine of the belt ones
  independently (0 broken).

### D134 (P1) — the CONFIRMED arm now matches the WHOLE summary but tests negation on the FIRST CLAUSE ONLY

The D130 fix moved `CONFIRMED_COMPLETION` out of the per-clause `.some()` loop into its own
whole-string test (index.ts:5518):

```
|| (CONFIRMED_COMPLETION.test(String(s)) && !completionIsNegated(String(s).split(/[.!?,\x3b\n]/)[0]))
```

`CONFIRMED_COMPLETION` is `^confirmed\s*[—–-]\s*[^]*?…` — `[^]*?` crosses commas, semicolons
and sentences — while the negation test reads `clause[0]`. So any truthful "Confirmed — …"
answer whose negator lives past the first clause is scored as a completion:

```
"Confirmed — I checked, nothing was archived."
   CONFIRMED_COMPLETION matches (…"archived" at the end)
   completionIsNegated("Confirmed — I checked")  -> no negator -> false
=> readsAsCompletion === true.   fbafded: false.  a559f8f: false.  9535f0b: false.  52e830f: false.
```

**12 of 12** such shapes are destroyed on the candidate and **0 of 12** on every prior
revision. Driven through the real gate slice, the founder-visible outcome is exactly the harm
index.ts:5420-5423 itself calls worse than the fabrication this belt exists to catch:

| turn | candidate | fbafded / 9535f0b |
|---|---|---|
| ordinary read-only turn with a claims array (`structuredProseDrift` → `rewriteFromStructure`) | *"I can't confirm the completion my draft described … nothing verifiable was changed."* | the true answer, kept |
| ungrounded, no claims (`legacyProseFallback`) | *"I can't actually do that from chat — nothing was changed."* | the true answer, kept |

This is the **same class the ledger recorded at #5277** (a whole-summary negation test), in
mirror image: a whole-summary MATCH with a single-clause negation test. run15's D117/D118
contracts still pass verbatim — *"Confirmed — the company is not archived."*, *"Confirmed —
you have 3 archived companies."* — because their negator happens to sit in clause 0. **The
contracts hold; the class does not.** Add one leading clause and the same sentence is
destroyed: *"Confirmed — I counted them, you have 3 archived companies."* survives only
because it carries no negator at all, while *"Confirmed — the company exists, but it is not
archived."* is destroyed.

What the move bought is exactly **one** shape — *"Confirmed — as requested, Restored Bob
Smith."*, caught by the candidate and missed by all three prior belts. That gain is
recoverable without the P1: see the prepared fix.

### D135 (P2) — the new ordinal path admits `no` as filler, so a NEGATED ordinal reply arms a destructive field

`ORD_FILLER` (index.ts:439) contains `no`. An ordinal-only reply is decided by "every
remaining word is filler", so:

| reply | candidate | fbafded / a559f8f / 9535f0b / 52e830f |
|---|---|---|
| `no option 2` | **binds option 2, arms `archiveCompanyIds`** | null |
| `option 2, no` | **binds option 2, arms `archiveCompanyIds`** | null |
| `no the second one` | **binds option 2, arms `archiveCompanyIds`** | null |
| `acme, no` (same intent, LABEL path) | null | null |
| `not option 2`, `cancel option 2`, `exclude option 2`, `option 2? no, the other one` | null | null |

`option 2, no` is the **exact adjacent-clause shape run16/D123 exists to close** — its own
example is `"acme, no"`, which still correctly dead-ends on the label path forty lines below.
The rule stated there is *"once the chosen label is removed, every remaining word must be
selection filler … a negator, an exclusion, a correction … dead-ends to the LLM path"* and
*"a false dead-end costs one round-trip; a false bind costs a wrong destructive mutation."*
The new path is the one place in the function that admits a negator, and it does so with no
LLM in the loop. `no` was presumably admitted for the abbreviation `"no. 2"`; that reading is
not worth a wrong-entity archive, and `no. 2` is not even accepted today (`2.` and `2)` both
dead-end).

### D136 (P3) — the ordinal path preempts a real NAME

The ordinal branch runs BEFORE label matching and wins outright:

```
options = [ "Option 2 Ltd" (option 1), "Beta Corp" (option 2) ]
reply "option 2"  ->  binds BETA CORP, arms archiveCompanyIds
reply "number 2"  ->  same, for a company named "Number 2"
reply "option 2 ltd" -> correctly binds "Option 2 Ltd"
```

A founder typing what is genuinely the company's own name gets the other company armed for
archive, deterministically, with no LLM in the loop. Numbered depots/units are ordinary
naming in this business ("Number 2 Depot"). Low likelihood, wrong-entity severity, and the
same D106/D116 family: an ambiguous reply must dead-end, never guess.

### D131 (P2) — the residual is real, but "proven irreducible" is not

`run18_defect_closure_contract.mjs` pins nine fabrications as `D131.irreducibleResidual`
CONTRACT cases, each paired with a real name, and the closure postscript states that *"no
regex separates the two"* and that catching them *"would reopen D130"*. Measured, that is
false for **5 of the 9**. One alternative rule — negation SCOPE (a negator disarms the verb
only when no finite auxiliary/modal already occurred before it, with an explicit exception for
a relative/complement clause: *"…no record THAT Black and Decker Holdings was archived"*), plus
a boundary on `and`/`but`/spaced dash that fires **only when the token to its right is
lowercase and is not an auxiliary** (inside a real name that token is capitalised — "Salt and
**P**epper", "Ulaanbaatar — **N**orth Depot", "But **F**irst Coffee"; in a VP coordination it
is an auxiliary — "ACME is archived but **was** not deleted") — gives:

| measured on the candidate's own corpora | result |
|---|---|
| the 9 pinned "irreducible" fabrications | **5 caught** |
| the 9 paired required-survive real names | **0 destroyed** |
| my 61-case truthful-negative corpus | **0 new false positives** |
| my 44-case fabrication corpus | false negatives 15 → 4 |
| the full committed battery | green except the 5 `D131.irreducibleResidual` pins that encode the residual itself, plus `run14/D107`, whose 500-character source-slicing window cannot span the longer statement (a harness length limit, not behaviour) |

For balance, because a bare fabrication count would mislead: `9535f0b` catches more of these
fabrications than the candidate (5/45 misses vs 15/45 on my corpus) and pays for it by
**destroying all 8** of the D128 noun-phrase truthful negatives the candidate and `52e830f`
both answer correctly (*"No company named Salt and Pepper Co was archived."*, *"I did not find
any record that Black and Decker Holdings was archived."*, …). The candidate is genuinely
better than `9535f0b` in the direction this project says matters more. The point of D131 is
not that `9535f0b` was better overall — it is that the trade was presented as forced when it
is not.

The other 4 are genuinely hard for the reason the postscript gives — the separator is followed
by a **capitalised** token, so casing cannot tell a name boundary from a clause boundary — and
those four are pinned in my file as an honest, still-open residual. Two further points:

* The residual is not merely disclosed, it is **enforced**. Pinning a fabrication as a
  CONTRACT (`readsAsCompletion(fab) === false`) inverts the ratchet: the next generation that
  catches it FAILS the suite. Five of those pins fail under a strictly better rule.
* The "internally contradictory suite" argument in the postscript
  (`D128.hold.nounPhraseNegativesSurvive` forbids splitting on `and`; `D131` requires it) only
  proves that no *unconditional* `and` splitter separates them. It does not prove no rule does,
  and the measurement above is the counterexample.

### D137 (P2, INHERITED and undisclosed) — a present-tense STATE answer is destroyed

The closure states *"Present-tense 'is/are archived' is a STATE, not a completion event, so it
is deliberately excluded"*. It is excluded from `COMPLETION_VERB` — the negation reference —
only. `EXECUTION_IN_PROGRESS` still carries `(?:is|are|was|were) (?:being |getting )?
(?:archived|…)`, so:

```
"ACME is archived."                          -> readsAsCompletion === true
"test3 is archived. Should I restore it?"    -> readsAsCompletion === true
"The task is completed." / "The goal is closed." / "Bob Smith is assigned to ACME." -> true
"The company is currently archived."         -> false   (one adverb is the whole difference)
```

The second line is the verbatim live case index.ts:5586-5591 records as *"a plain, correct,
truthful read-only answer … accurate, should never be touched"*. Present on `52e830f`,
`9535f0b` and `fbafded` too — inherited since run12/D94, **not** a regression of this
candidate — but it is nowhere disclosed, and this closure's own wording implies the opposite.
What limits the blast radius today is the arms around the belt (a resolution-grounded
read-only turn with no claims array reaches neither correction path), not the belt itself.

### D138 (P3, INHERITED) — a real company whose NAME contains a lifecycle verb cannot be selected

`commandContradictsActionType` reads the reply for verb families. The reply that names the
company IS the company's name:

```
"Restored Furniture Co"      -> matches RESTORE_VERB_PATTERN -> contradiction -> dead-end
"Activated Carbon Mongolia"  -> dead-end on the candidate, a559f8f and fbafded;
                                SELECTABLE on 9535f0b and 52e830f (run17/D127 added `activat`)
"Reactivated Metals LLC", "Unarchived Records Ltd" -> dead-end
"Closed Loop Systems"        -> selectable
```

Fail-closed direction (one extra LLM round-trip, never a wrong bind), so it is a P3 — but it
is the same family this whole campaign is about (a lexical rule cannot tell a NAME from a
VERB), it is undisclosed, and run17/D127's comment says only *"same family, one more spelling"*.

### Bookkeeping — the pre-change suite count is wrong for the THIRD consecutive generation

The closure postscript states *"Full battery: 29 suites, 0 failures."* Counted from the
filesystem at the candidate: **30 `.mjs` files**, because the same commit added
`run18_defect_closure_contract.mjs` — 1 library + 5 stubs + **24 assertion-bearing**. #77
diagnosed this error, #78 diagnosed it again ("*No failure is hidden by it, twice in a row*"),
and it has now been made a third time in the same way. No failure is hidden by it.

Two in-source comments are also false as written:

* **index.ts:5507-5509** — *"Boundaries: sentence punctuation, comma, semicolon, newline, a
  SPACED dash, and a colon FOLLOWED BY SPACE — so a filler negator set off by punctuation
  ('No problem — ACME was archived', 'Nothing failed: ACME was archived') no longer shields the
  fabrication beside it."* The shipped splitter is `/[.!?,\x3b\n]+|:\s/`; **there is no dash
  alternative at all**. The colon half is true (`"Nothing failed: ACME was archived."` →
  caught); the dash half is false and its own named example is one of the nine residuals the
  same commit's ledger entry admits survives (`"No problem — ACME was archived."` → **not
  caught**). The comment and the ledger contradict each other inside one commit.
* **index.ts:5490-5492** — the present-tense claim, see D137.

Everything else checked was true: the promoted `run18_defect_closure_contract.mjs` really
carries **56 cases, all passing**; the #78 entry was promoted **verbatim with no dispatch
preamble leaked**; `CURRENT_CAMPAIGN.json` carried the correct `index_sha256`. One gap:
`CURRENT_CAMPAIGN.json` named only `closure_commit: be9d94f` and carried **no `base_commit`**
for the commit actually under test (`d34af157`) until this verifier added one.

### Regression tests added

`qa/verification/proposed/v19_regression_additions.mjs` — 61 cases, same CONTRACT/DEFECT
convention and the same exit guard (ANY failure exits nonzero), with its own extractor. On
this candidate: **28 pass, 33 fail — all 33 are DEFECT cases reproducing D134 (12), D135 (5),
D136 (2), D131-separable (5), D137 (5) and D138 (4) by design, and 0 CONTRACT failures**, i.e.
every guard I pinned genuinely holds. It drives the REAL `readsAsCompletion`, the REAL
`matchDisambiguationOption`, the REAL contradiction guard, the REAL field resolution (so a
mis-bind is reported as the destructive field it actually arms) and the REAL
`safeQuestionFragment`.

**Prepared fix (FIX PREPARED, not applied — no write authority on the implementation branch;
index.ts restored byte-identically).** Three edits close all nineteen D134/D135/D136 cases:
(F1) the CONFIRMED arm tests negation on **the clause containing the matched completion word**
(`String(s).slice(0, end-of-match).split(/[.!?,\x3b\n]|:\s/).pop()`) instead of `clause[0]` —
which keeps the whole-string match and therefore the one shape the move bought; (F2) `no`
leaves `ORD_FILLER`; (F3) an ordinal-only reply dead-ends when some option's label, with its
own `(option N)` suffix removed, contains that reply. Measured together: `v19_regression_
additions` goes **28 → 47 passing with 0 CONTRACT failures**, and the entire committed battery
stays at **909 OK / 0 failures / 0 nonzero exits**.

**Lesson.** This is the **eighth consecutive change to this drift belt and the sixth to close
one direction by reopening another** — and this time the reopening is not a new idea failing,
it is an OLD lesson being un-learned: #75's D117 established that negation must be decided per
CLAUSE for every arm, and D134 is that exact rule broken again for one arm, three generations
later, by a refactor that moved the arm rather than the rule. The rule this generation adds:
**a predicate and the negation test that guards it must have the SAME SCOPE — whole-string
pattern with clause-scoped negation is the #5277 defect wearing the other shoe.** And a second
one for the ledger's own hygiene: **"proven irreducible" is a claim about all possible rules,
so it needs a search, not an example.** Nine paired examples showed that one specific splitter
cannot separate them; a rule that keys on scope rather than on separators separates five of the
nine, on the candidate's own corpus, with the battery otherwise green.

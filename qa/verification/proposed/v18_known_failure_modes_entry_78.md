## #78 — verifier #18, independent verification of the run17 D127–D129 closure (`a559f8f` / `fbafded`)

**Candidate:** `fbafded912e0fef7ddc7d5119308df8ab8be72e9` (closure commit `a559f8f`; the
rotation commit on top touches only `qa/verification` bookkeeping — verified by diff,
`git diff a559f8f fbafded -- supabase/functions/sem-ai-command/index.ts` is empty).
**index.ts sha256:** `cf4b6f4defe9b5ed72cee29b08c4e2731651fac0d080f3ba30e1ed601e056deb`,
asserted before the run, after every one of 14 temporary source mutations, and at the end.
**Baselines for every comparison:** `9535f0b` (the #77 candidate — the SHA this closure is
fixing), `f232975` (**index.ts byte-identical to `9535f0b`**, `e5ccf63b…b6d69`, so those two
comparison points are one belt, not two), `52e830f` (the #76 candidate) and `d724d8c`.
**Verdict: FAIL** — one P1 regression, two P2, one P3, three surviving mutants, one
bookkeeping error repeated from the previous generation. D128 is genuinely closed for the
exact shape it names, and closed by reopening a sibling shape in the same direction.

**Production, read-only, re-checked myself (not carried forward from #77):**
`npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk` → `sem-ai-command` is
**version 92, ACTIVE**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`,
`updated_at` 1788239725518. Byte-identical to what #75, #76 and #77 recorded, so **nothing
has been deployed since** and **none of D58–D133 is live**. Everything below is about a
candidate branch, not about what the founder is running today. `ezbr_sha256` is a
deployed-bundle hash and is not comparable to an index.ts source hash.

**Scope of this run:** source-level and behavioural verification of the `sem-ai-command`
Edge Function only. The 60 `*.sql` suites in `qa/scenarios-runner/` were **NOT run** —
`npx supabase db query --linked` is permission-gated in this process (`functions list` is
not), so DB/RLS/lifecycle truth is **BLOCKED**, not claimed either way. Browser/MCP tooling
was not available, so UI truth and live AI-chat truth are **BLOCKED**, not silently skipped.
`deno` is also gated here, so the closure postscript's "`deno check`: the identical 23 errors
as d724d8c, 0 new" is **NOT INDEPENDENTLY VERIFIED**.

### What genuinely closed

* **D128 — CLOSED for the shape it names, and the mechanism is sound in that direction.**
  On the #77 corpus shape (a truthful negative whose entity name carries a boundary token)
  the candidate is right where `9535f0b` was wrong: over my 327-case truthful-negative
  corpus, false positives fall from **95/327 (`9535f0b`/`f232975`) to 13/327**, and all six
  of #77's named frames — `and`, `but`, `without`, dashes, parentheses, colon — survive.
  `52e830f` scores 0/327 and `d724d8c` 281/327 on the same corpus.
* **D125 stays closed in the false-negative direction.** The four shapes `d724d8c` caught
  and `52e830f` lost ("archived – no undo available", "archived (no undo available)",
  "archived without incident", "archived and no errors occurred") are still caught, with no
  phrase splitting at all. On my 19-case trailing / mid-clause / parenthesised-negator set
  **0/19 fabrications escape the candidate**, against 3/19 on `9535f0b` and 18/19 on
  `52e830f`. On run17's own ten D128 strings the candidate scores **0 false positives**,
  against 10/10 on `9535f0b`.
* **D127's entity-noun half — CLOSED.** `archive acme tasks`, `archive acme employees` and
  `the acme company task` all dead-end against an ARCHIVE-COMPANY option. Killed by mutation
  (M8) — a committed suite really does observe it.
* **D127's contradiction half — CLOSED.** Plain `activate` is a restore-family verb now, so
  `activate acme` against a pending archive is a contradiction, on both axes. Killed by
  mutation (M13).
* **D129's stated LIMIT — half closed.** Another option's number is genuinely not filler
  (`acme (option 2)` / `acme #2` dead-end; killed by mutation M11).
* **The question belt is untouched, as a byte fact.** `safeQuestionFragment` hashes
  **identically across `d724d8c`, `52e830f`, `9535f0b` and the candidate**
  (`04cd67c0e48dd3ce`), and driving it on an 8-case corpus gives **0 behavioural
  divergences across all four revisions**. The whole diff `9535f0b → a559f8f` is three code
  sites plus comments: `RESTORE_VERB_PATTERN`, the `SELECTION_FILLER`/`ACTION_FAMILY_VERBS`/
  `ENTITY_NOUNS`/`ownNumber` block, and `COMPLETION_VOCAB` + the `readsAsCompletion` line.
* **No committed contract is reopened.** Full battery, from the filesystem: **29 `.mjs`
  files = 1 library + 5 SUPERSEDED stubs + 23 assertion-bearing**; every suite exits 0 and
  **failures counted from OUTPUT TEXT = 0 across 711 OK marks.** D72-class, D106, D112,
  D116, D117/D118, D119, D123, D124, D126 and the new D127/D128/D129 holds all pass.

### D130 (P1) — the ORDER rule destroys a truthful negative whenever a completion word sits before the negator

`readsAsCompletion` now disarms a clause only when
`c.search(NEGATED_CLAUSE) < c.search(COMPLETION_VOCAB)`. `COMPLETION_VOCAB` carries **no
part-of-speech guard** (`CONFIRMED_COMPLETION` has one — the `(?<!\bthe )(?<!\d )` lookbehinds
D112 added — and it is not consulted here), so a completion word used as a **noun**, as an
**adjective**, or sitting inside the **entity's own name** outranks the negator and the
clause is scored as an assertion:

```
"The archived list was not updated."
   first negator  "not"      at 24
   first vocab    "archived" at 4        4 < 24  -> NOT disarmed
   LEGACY_PAST_COMPLETION: "was ... not ... updated"  -> fires
=> readsAsCompletion === true.   9535f0b: false.   52e830f: false.   d724d8c: true.
```

`readsAsCompletion` feeds `legacyProseFallback` (index.ts:5454), whose correction replaces
the whole reply with *"I can't actually do that from chat — nothing was changed"*
(index.ts:5628), and `structuredProseDrift` → `rewriteFromStructure` (index.ts:5506), whose
floor is *"I can't confirm the completion my draft described…"* (index.ts:5617). Both destroy
a true answer and substitute a false one — the outcome index.ts:5388–5391 itself calls
**worse than the fabrication this belt exists to catch** (run14/D112, ledger #4905).

| corpus | candidate | `9535f0b`/`f232975` | `52e830f` | `d724d8c` |
|---|---|---|---|---|
| 25 truthful negatives with a completion word BEFORE the negator — false POSITIVES | **19 / 25** | 2 / 25 | **0 / 25** | 20 / 25 |
| 26 REAL names containing a completion word, frame `"<Name> was not archived."` | **24 / 26** | **0 / 26** | **0 / 26** | 26 / 26 |
| 17 promoted D130 cases | **17 / 17 destroyed** | 0 / 17 | 0 / 17 | 17 / 17 |

On this shape the candidate has regressed **all the way back to `d724d8c`** — the belt
generation that had no negation handling at all. The destroyed answers are not exotic:
*"The assigned tasks were not completed."*, *"The removed person was not reassigned."*,
*"The 3 archived companies were not deleted."*, *"Closed Loop Systems was not archived."*
Note also that run14's own committed D112 cases still pass (*"Confirmed — the archived list
is empty."*, *"Confirmed — you have 3 archived companies."*) — the **contracts hold, the
class does not**: add one auxiliary and the same sentence is destroyed. That intersection is
what no suite observes.

### D131 (P2) — the disclosed residual is much wider than the disclosure, and is a net regression against the SHA being fixed

index.ts:5443–5445 discloses *"a real name that itself begins with a negator word before the
verb ('Nothing Bundt Cakes was archived') disarms the belt"*. The rule is positional to the
**clause**, not to the name: **any** negator anywhere before the first completion verb
disarms — including one in ordinary prose with no exotic name at all.

| corpus | candidate | `9535f0b` | `52e830f` | `d724d8c` |
|---|---|---|---|---|
| 20 fabrications with a negator before the verb — false NEGATIVES | **19 / 20** | 9 / 20 | 19 / 20 | **0 / 20** |

Thirteen of those were **caught by `9535f0b`**, the SHA this closure is fixing, and are shipped
by the candidate — the widened splitter was doing real work here. Examples, none of which
involve an unusual entity name: *"There were no errors and ACME was archived."*, *"No problem
— ACME was archived."*, *"There is no undo but the company has been archived."*, *"Not the
task — the company was archived."* (a negator scoping a **different** verb than the one
asserted), *"Doctors Without Borders Mongolia was archived."* (a negator in the **middle** of
a real name, not at its start). The disclosed name-leads-with-a-negator residual itself is
shared with `9535f0b` and `52e830f`, so it is **not** a regression — it is pinned in the
regression file rather than accepted in prose.

### D132 (P2) — a model-authored `actionType`/`entityType` now CRASHES the matcher instead of failing closed

`ACTION_FAMILY_VERBS` and `ENTITY_NOUNS` are bare object literals indexed by a
model-authored string (index.ts:488–489):

```
(ACTION_FAMILY_VERBS[winner.actionType] || ACTION_FAMILY_VERBS.archive).split(' ')
```

For `actionType` `"constructor"` / `"__proto__"` / `"hasOwnProperty"` — or `entityType`
`"constructor"` / `"toString"` / `"valueOf"` — the lookup returns a prototype member, which is
truthy and has no `.split`, so `matchDisambiguationOption` throws
`TypeError: ... .split is not a function`. It is caught by the stream's outer handler
(index.ts:5754) and surfaces to the founder as `{type:'error'}` carrying a raw JS message;
the disambiguation reply is lost. **All three prior SHAs dead-end or bind harmlessly on the
identical input** — this is new. The option gate validates `entityType` (via
`CANONICAL_TYPE_ALIAS`) and `id`, but **never `actionType`**, so an option with a canonical
`entityType` and a hostile `actionType` survives the D119/D124 drop and is persisted.
run17's own `D124.coverage.prototypeKeysFailClosed` covers only the gate, not the matcher —
which is exactly why the new site went unobserved. Fail-closed is the rule D124 exists to
state; a throw is not fail-closed.

### D133 (P3) — D129's fix does not close the D95 seam it names

D95 numbers colliding typed fallbacks *"so every option stays uniquely selectable"*
(index.ts:5275). Driving the real matcher against the labels the product itself renders in
exactly that case:

| founder types | binds? |
|---|---|
| `the company (option 1)` | **yes** (verbatim copy of the whole label) |
| `option 1` | no |
| `1` | no |
| `#1` | no |
| `the first one` / `the first` | no |

The winner's-own-number rule only fires on a residual left over after the **label** is
removed, so it helps only a reply that *also* carries the entity name (`acme (option 1)`,
`acme #1`) — and by construction there is no name in the collision case, which is the only
case D95 numbering exists for. D129 is real for named options and inert for the seam it is
named after.

### Coverage — three mutants survived the whole battery

My own 14-mutant battery (`qa/verification/scratch/v18/s2_mutation.mjs`, each mutant run
against all 28 committed suites, sha asserted and restored byte-identically after every one):
11 killed, **3 survived**.

* **M3 — the newline.** The `\n` this candidate *added* to the clause splitter is observed by
  no committed suite. Removing it changes behaviour (`"No company was archived\nACME was
  deleted."`) and the battery stays green.
* **M10 — `ACTION_FAMILY_VERBS` scoping, the HEADLINE half of D127.** Union the two families
  back into one list and the entire battery still passes — while `reopen acme` against a
  pending **archive** binds and arms **`archiveCompanyIds`**, and `close acme` against a
  pending **restore** arms **`restoreCompanyIds`**. That is the D127 harm itself, and nothing
  observes it. run17's `D127.activateArmsArchive` is closed by the *`RESTORE_VERB_PATTERN`*
  change (M13), not by the scoping, so the scoping is currently decorative as far as the
  suite is concerned.
* **M12 — the winner's OWN bare digit.** run17's `D129.hold.bareDigitStillDeadEnds` pins
  `bind('acme 2', TWO)` and `bind('acme 7 tomorrow', TWO)`. With reply `acme …` the winner is
  option **1**, so the digit tested is never the winner's own number and the pin cannot
  observe the limit it claims to. `bind('acme 1', TWO)` is the case that matters; under M12
  it binds and arms `archiveCompanyIds`, and the battery stays green.

### Bookkeeping — the previous generation's correction was not learned

The closure postscript states *"Full battery: 28 suites, 0 failures (22 assertion-bearing —
the verifier's count, adopted)."* Counted from the filesystem at the candidate:
`git ls-tree a559f8f qa/scenarios-runner/` has **29 `.mjs` files**, because the same commit
added `run17_defect_closure_contract.mjs` — so the real battery is **29 = 1 library + 5
stubs + 23 assertion-bearing**. This is the *identical* error #77's own entry diagnosed one
generation earlier ("*That count was correct at `52e830f` (27 `.mjs`), but the same commit
ADDED `run16_defect_closure_contract.mjs` … A pre-change count adopted after making the
change*"). No failure is hidden by it, twice in a row.

Two smaller claims checked and true: the promoted `run17_defect_closure_contract.mjs` really
carries **43 cases, all passing**; the surviving `or`-boundary mutant #17 reported really is
pinned now (M4 is killed by run17). One claim checked and **false**: the postscript says of
D129 *"a bare digit and another option's number are not [filler], both pinned"* — only the
second is genuinely pinned (see M12 above).

### Regression tests added

`qa/verification/proposed/v18_regression_additions.mjs` — 56 cases, same CONTRACT/DEFECT
convention and the same exit guard (ANY failure exits nonzero). On this candidate:
**15 pass, 41 fail — all 41 are DEFECT cases reproducing D130/D131/D132/D133 by design, and
0 CONTRACT failures**, i.e. every guard I pinned genuinely holds. Every per-case claim in the
file's descriptions was cross-checked against the baseline belts before promotion
(`qa/verification/scratch/v18/crosscheck_claims.mjs`, 30/30 verified). It drives the REAL
`readsAsCompletion`, the REAL `matchDisambiguationOption`, the REAL contradiction guard and
the REAL field resolution (so a mis-bind is reported as the destructive field it actually
arms), with its own extraction — not `_gate_extract.mjs` and not any run8–run17 harness.

**Lesson.** This is the **seventh consecutive change to this drift belt and the fifth to
close one direction by reopening the other.** D128 replaced a lexical *boundary* problem with
a lexical *ordering* problem, and both are the same underlying error: the belt keeps trying
to infer sentence structure from a word list. Order is not scope — a completion word can
precede a negator as a noun, an adjective or part of a name, and a negator can precede a verb
it does not scope over. #77's lesson was "measure both corpora in the same run"; that was
necessary and not sufficient, because the candidate's own corpus was the *previous* defect's
corpus. The rule this generation adds: **a change to `readsAsCompletion` must be measured on
a false-positive corpus built from the shape the NEW mechanism keys on**, not the shape the
last one did — for an order rule that means real names and noun uses of every word in
`COMPLETION_VOCAB`, which is precisely the corpus that produced 24/26 above. And
`COMPLETION_VOCAB` needs D112's part-of-speech lookbehinds if it is going to outrank a negator.

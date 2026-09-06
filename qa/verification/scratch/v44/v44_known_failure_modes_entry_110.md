## #110-V — Verifier #44, campaign #104: FAIL on 3f6e05c. Four truthful-answer classes deployed v92 preserves are destroyed by the candidate, and two fabrication classes deployed v92 corrects are shipped. The negator-initial-name class (D-V92-R1) is closed for a SIMPLE subject only; a coordinated subject and a mid-clause name both leak.

**Candidate** `3f6e05cfb751aeaac5796defd10c37ea24075bf8`, `supabase/functions/sem-ai-command/index.ts`
sha256 `3e56dbd163bbfc89ae1a9107763dee2eea684dabedfa7301fcb40d21bc2ca717` (476,794 bytes, unchanged
before and after this run). **Deployed** production v92 = git `c9dfab5bd433`, index.ts sha256
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc` (321,370 bytes) — re-derived from
git by this verifier and confirmed byte-identical to all three committed reference copies
(`index.v92.ts`, `v92.lf.ts`, and my own `git show c9dfab5bd433:…`). The live-download link is
accepted from ledger #108; this session's command classifier refuses `supabase functions
download`/`list`, so my provenance is **git-to-reference-copy byte-direct, live-to-git inherited**.

**Verdict: FAIL. Do not deploy 3f6e05c over v92.**

---

### The one-paragraph version

Fifteen verifiers in a row have failed a candidate that looked ready. This one was the first with an
empty open-blocker list and a fully green battery, and the green was earned on the campaign's own
corpus (272 truthful / 182 fabrications). I built my own — 3,952 template rows across four name
halves, plus 484 generated product-help rows — and it separates immediately. **35 truthful rows and
19 fabrication rows move the wrong way on the base corpus; on the generated product-help corpus,
484 of 484 truthful sentences deployed v92 preserves are destroyed.** The two largest classes are
the same failure #39 found — an ordinary English gerund read as an execution claim — recurring in
arms #39 never looked at, because every guard that #39 and #40 installed is anchored `^<gerund>` and
a single leading adverbial walks past all three.

---

### V44-D1 (P1, TRUTH REGRESSION). `Now`/`Currently` + gerund. 352 of 352 destroyed.

`EXECUTION_IN_PROGRESS` has an arm `(?:now|currently) (?:PROGRESS_VERBS)`. It is protected by three
guards, and **all three begin `^\s*(?:assigning|reassigning|…)`** — they only recognise a clause whose
FIRST token is the gerund. `"Now archiving …"` starts with `Now`, so none of them fires.

```
v92 preserves / candidate destroys:
  "Now archiving is only available from the Companies page."
  "Currently removing someone ends their employment record."
  "Now renaming a company updates every reference automatically."
  "Currently approving a salary change is founder-only."
```
Every one is replaced with *"I can't actually do that from chat — nothing was changed."*, which is
itself false. Generated systematically over 22 gerunds × 8 predicate tails × {now, currently}: **352
rows, 352 destroyed, 0 destroyed by deployed v92.** This is the third recurrence of the class
`qa/KNOWN_FAILURE_MODES.md` already carries twice (#39 EXECUTION_IN_PROGRESS gerund; #40 D1 the same
arm re-opened after being closed with a whitelist over an open class).

### V44-D2 (P1, TRUTH REGRESSION). `working on <gerund>` with any subject. 66 of 66 destroyed.

The arm carries no subject test at all, so a sentence about somebody else's work is read as this
turn executing. `"Anyone working on archiving a company needs manager rights."`,
`"The team working on restoring the depot data finished last week."` Guard 1 rescues only the
clause-initial form (`"Working on archiving is a UI action"` survives) — which is exactly why this
went unseen: the shape that is tested is the shape that is guarded.

### V44-D3 (P2, TRUTH REGRESSION). `let me <verb>` on a DEFERRED offer. 39 of 39 destroyed.

`"Let me archive the company once you confirm."` / `"…if you approve."` / `"…only after your
approval."` run12/D94 aimed this arm at an imminent-action claim and that is defensible; an offer
explicitly conditioned on the founder's confirmation is not an imminent-action claim, and replacing
it strands the founder mid-clarification. Deployed v92 preserves all 39.

### V44-D4 (P2, TRUTH REGRESSION). `(is|are) (being|getting) <participle>` as a state. 27 of 27.

`"A company that is being archived still shows its history."`, `"Records are being archived nightly
by the platform, not by me."` run19/D137 fixed exactly this reading for bare `is/are <participle>`
and deliberately kept the progressive — but a relative clause and a generic habitual are not this
turn either. Guard 3 tests `NAME is/are <GERUND>`; a *participle* never matches it, so guard 3 is
structurally unable to reach this arm.

### V44-D5 (P1, FABRICATION REGRESSION). Coordinated negator-initial name. 13 of 15 names leak.

```
deployed v92 CORRECTS, candidate SHIPS:
  "No Limits Inc and Beta Corp were archived."
  "Nothing Bundt Cakes and Beta Corp were archived."
  "Never Summer Industries and Delta Ltd were archived."
  "No Doubt Trading and Gobi Cashmere have been archived."       (13 of the 15 negator-names tested)
```
`nameInternal`'s `subjectRun` requires a **contiguous** capitalised run immediately followed by an
auxiliary. A coordinator breaks the run, the opening negator is taken as a real one, and the whole
clause is treated as a truthful negative. `D-V92-R1 negator-initial real NAME or TITLE — closed
(0 of 7 ship)` in `v92_open_regression_contract.mjs` is measured on **seven simple-subject rows**;
the class is not closed. This is the seventh time this campaign that a closure claim was true of its
corpus and false of its class.

### V44-D6 (P1, FABRICATION REGRESSION). Negator-initial name that is not clause-initial. 6 rows.

```
  "The task No Limits Inc audit was archived."
  "The approval for Pending review of the Q3 ledger has been approved."
  "The employment record for Pending review of the Q3 ledger was ended."
  "Access for Pending review of the Q3 ledger was granted."
```
`titleHead` only fires clause-initially; `adjective` only fires with a determiner IMMEDIATELY before;
`detName` requires the determiner immediately before AND a capitalised token immediately after. A
title such as *Pending review of the Q3 ledger* — an entirely ordinary Brain OS task/approval title —
satisfies none of them, so any completion claim about it is uncatchable.

### V44-D7 (P2, SUITE INTEGRITY). Three of thirteen belt-building suites cannot reach the newest arm, and the guard that should notice is blind by alphabet.

The belt reads exactly one free identifier, `knownEntityNames`. The campaign record states that
*"EVERY extractor injects it as an EMPTY Set by default, which makes 'an empty set produces
byte-identical verdicts' the structural default of the whole battery."* **It is not true.**
`run18_defect_closure_contract.mjs`, `run28_defect_closure_contract.mjs` and
`v92_open_regression_contract.mjs` build the belt with no seed, and their belts throw
`ReferenceError: knownEntityNames is not defined` on the entire `Confirmed — <Participle> <Name>`
family — proven, not inferred. They pass today only because none of them contains a row of that
shape; adding one crashes the suite. And run28's `"predicate never throws (2000-case fuzz)"` — the
contract whose job is to notice — uses the 32-character alphabet `abcXYZ .,;:—-()'"0123456789\n\t?!`,
which **cannot spell the word `Confirmed`**. Eighth vacuity of the campaign, and the first one that
is a coverage hole rather than a false green.

*Not a production defect* — production defines the identifier. It is a measurement defect, and it
sits on the arm this campaign most recently added.

**Fix (one line each, the pattern run13–run19 already use):**
`globalThis.knownEntityNames = globalThis.knownEntityNames || new Set();`
I verified by differential that adding it changes **no** suite's output byte-for-byte today
(36 suites run with and without the global via `--require`; zero differ).

---

### What is genuinely closed — re-derived, not restated

| Claim | My measurement |
|---|---|
| ledger #64 D16, #65 D25, #65 D27 (production row 9dda919c), #66 D40, BUG-002 | **28 shapes I re-typed myself, 28 caught, 0 fabrication regressions.** Genuinely closed. |
| The three shapes the session says it REFUSED to close (`"No errors ACME was archived."`, `"No problem the log shows ACME was archived."`, `"Not a single task moved - Bob Smith was removed."`) | **All three are CAUGHT.** The refusal disclosure is stale — `newSubject` closes them, and the paired real names survive. |
| run28's 15 `[RESIDUAL] pinned at CURRENT behaviour` rows (D164r/D166r/D169r) | **All 15 are caught.** The test *names* say "Missed"; the behaviour is not. Stale naming, no defect. |
| run18 D131 `"but"` member + `disclosedResidual`, run19 D131, run28 D116 re-pinned CLOSED | **Honest.** Each pins the fabrication AND asserts the paired real name survives; I confirmed the paired names independently (`"No company named Salt and Pepper Co was archived."`, `"No unit at Erdenet — Copper Works was archived."`, `"No company named Ulaanbaatar — North Depot was archived."` all preserved; negname truth-regression quadrant = 0). |
| `v92_open_regression_contract` CONTRACT 5 narrowed to TOP-LEVEL declarations only | **Sound.** The hazard is real and specific (run15–run19 assemble the belt from a named-const list; `completionIsNegated` travels brace-balanced so its locals are not the hazard), and the narrowing carries two non-vacuous coverage assertions that I re-ran — an injected top-level `const nx` IS detected, an injected local is NOT. The narrowing hides nothing. |
| run14/D107's "slicing window widened from 2000 to 2600" | **Stale description — the current state is stronger.** run39 deleted the character budget entirely and replaced it with a real statement scanner that throws if the statement end is not found. Nothing to judge. |
| run15 57/0, D117 "no whole-span lookahead" | **Confirmed: 57 pass / 0 fail; no whole-span lookahead or lookbehind in the belt.** |
| "battery 33/0 was invalid because the exit status came from a pipeline" | **Retraction accepted, number re-derived: 36 files, 0 failing**, one `execFileSync` per file, exit status read per process. 31 asserting + 5 SUPERSEDED prose-era stubs (1,192 assertion lines total). No file is silently vacuous. |
| the entity signal is load-bearing | **Yes.** On its own space (20 participle-headed names × 3 suffixes) 51 of 60 rows are rescued ONLY by the signal; it re-opens none of the five fabrication twins I paired against it. |
| gate numbers | battery 36/0 · v43 40/0 · v42 12/1 · v41 22/0 · v40 77/0 · v39 21/0 · v38 29/0 · v37 21/0 · v36 61/0 · v35 55/0 · v34 57/0 · v33 93/0 · v32 101/0 · v31 33/1 · v30 25/1. **Exactly as expected. Nothing unexpected is red.** |
| matcher | 32 disambiguation shapes I chose myself: 32/32 correct, **0** v92-DEAD-END → candidate wrong-intent SELECT. v92's prototype-pollution bug (`actionType:"constructor"` → `SELECT:function Object() { [native code] }`) is FIXED by the candidate. |

### Mutation proof — 21 reverts, 0 dead fixes

Every shipped guard was reverted in memory against a 3,986-row corpus. `nameInternal` 216 verdicts ·
`CONFIRMED` arm 56 · `EXECUTION_IN_PROGRESS` 211 · `D27` rename arrow 17 · `newSubject` 15 ·
`objectName` 14 · `titleHead` 40 (4 of them truths — it is load-bearing in both directions) ·
`idiomStrip-dash` 3 · `V43-D6` lookbehinds 3 · `entity signal` 2 · `detName` 2 · `fewQuant` 2 ·
`R-AUXGAP` 2 · `ppInternal` 1 · `adjective` 1 · `V43-D5` narrowing 1. Five looked like no-ops on the
base corpus and each was proven load-bearing on a targeted probe instead: `relInternal` 3/8,
`quotedHead` 3/6, `V43-D6 second-sentence` 3/6, `modalBlank` 7/8, `idiomStrip-bare` 1/6. **No shipped
fix is dead.** (Note for the record: the bare-form idiom strip is load-bearing on exactly one shape I
could construct — `"No problem the company renamed successfully."` — because `newSubject` already
rescues every `was/were/has been` form. Ledger #37's reversal of its removal stands, but on a much
thinner margin than "R-IDIOM closed the class" implies.)

---

### Deploy-surface facts (Q1 / Q7), re-derived

* Only ONE file changes under `supabase/functions/`: `sem-ai-command/index.ts`. Nothing else on the
  deploy surface moves.
* LF-normalised diff v92 → candidate: **52 hunks, 1,738 lines added, 52 removed.** 155,424 bytes added.
* Declaration delta (name@indent, comment lines stripped): v92 486 → candidate 690, **204 added, 0
  removed**. Ledger #90's count is superseded by this one, which is derived here.
* **The candidate's git blob is 100% CRLF (5,998 CRLF, 0 bare LF); deployed v92's is 100% LF (4,312
  LF, 0 CRLF), and `.gitattributes` has no rule for this path.** The raw byte diff is therefore
  100% of lines, and `scripts/factory-runner/verify-deployed-bytes.sh` would report the deploy as
  "IDENTICAL AFTER LF NORMALISATION" rather than byte-identical. No functional risk found (there is
  no `new RegExp(\`…\`)` and no `split('\n')` anywhere in the file; every belt regex is a
  single-line literal) — the only real effect is `\r` inside the system-prompt template literals sent
  to the model, and a pinned sha256 that is machine-dependent under `core.autocrlf`, which is the
  exact fragility `.gitattributes` was already added to this repo to fix for two other paths.
  **P3, but fix it before pinning another sha:** add
  `supabase/functions/sem-ai-command/index.ts eol=lf`.

### Q3 — does the candidate reintroduce anything previously removed from production?

No declaration present in v92 is gone (0 removed). One **behaviour** of v92 is deliberately gone and
it widens the blast radius of everything above: v92's gate is
`… && !result.pendingAction && !groundedOutcomeThisTurn && PCCP.test(summary)`; the candidate's
`legacyProseFallback` drops `!result.pendingAction` (run8/D59, on purpose). So on **every turn that
carries a pendingAction** — every clarification, disambiguation and bulk-confirmation turn — the
candidate applies the gate where v92 exempts it. All four truth-regression classes above therefore
also destroy answers on those turns, and so do the 1,198 rows of my corpus that v92's regex matches
but v92's gate never sees. The suite named for exactly this class,
`d3_past_completion_gate_not_shortcircuited_by_pending_action.mjs`, is a SUPERSEDED prose-era stub
that asserts nothing. This is not a new defect, but it is an undisclosed multiplier on the ones above
and it belongs in the deploy conversation.

---

### PREPARED FIX (not applied — index.ts is byte-preserved)

`qa/verification/scratch/v44/v44_build_fix.mjs` → `qa/verification/scratch/v44/fix44.ts`. Five edits:

1. **V44-F1a/b** — both `^`-anchored EXECUTION_IN_PROGRESS product-help guards get an optional
   leading adverbial: `^\s*(?:(?:now|currently|just|also|then)[,]?\s+)?(?:assigning|…)`.
2. **V44-F2** — the `working on <gerund>` arm is bound to a first-person subject or the clause head.
3. **V44-F3** — the passive-progressive arm gets `(?<!\b(?:that|which|who)\s)`.
4. **V44-F4** — `subjectRun` tolerates a coordinator/particle inside the capitalised run:
   `(?:(?:[A-Z][\w&.’'-]*|and|&|of|the|for|de|von|van)\s+){0,5}?`.
5. **V44-F5** — `detName` sees a determiner + up to two lowercase nouns before the capitalised negator.

**Measured:** truth regression 35 → **0**; fabrication regression 19 → **6**; the 484-row generated
product-help corpus 484 → **48** (the 39 `let me` rows and 9 generic-habitual rows remain, both
disclosed above). **Every gate holds at its exact current number** — battery 36/0, v43 40/0, v42 12/1,
v41 22/0, v40 77/0, v39 21/0, v38 29/0, v37 21/0, v36 61/0, v35 55/0, v34 57/0, v33 93/0, v32 101/0,
v31 33/1, v30 25/1 — and no fabrication is released (3 more are newly caught). My own gate goes from
67 pass / 51 fail to 108 pass / 10 fail on the fix.

### Residuals I am NOT asking anyone to close

* `"No North Depot was archived."` is destroyed by the candidate **and by deployed v92**. The
  session's argument that it is indistinguishable from `"No Limits Inc was archived."` is correct on
  the evidence: both are `No <TitleCase run> was <participle>`, both readings are real, and no
  lexical rule I could construct separates them. It is not a regression and it is not a blocker.
* `Pending review of the Q3 ledger` mid-clause (V44-D6, 4 rows after the fix). Closing it needs a
  rule that treats a capitalised `Pending`/`Awaiting` after a preposition as a name; I did not find
  one I could prove costs zero truth, so I am pinning it rather than guessing.
* The `let me <verb>` deferred offer (V44-D3). Whether that arm should fire at all is a product
  decision, not a regex one, and it belongs to the founder.

### Not measured — say it plainly

* **`deno check` — BLOCKED.** No `deno` on PATH and this session's classifier refuses
  `npx deno@2 check`. The 23-error baseline is **unverified by me.** I did confirm every belt regex
  literal constructs in V8, that there is no inline modifier group, and that the predicate does not
  throw on 4,000 fuzzed strings including the `Confirmed —` shapes run28's own fuzz cannot reach.
* **Live `functions download` — BLOCKED** (classifier). Provenance inherited from ledger #108; my own
  link is git → reference copy, byte-direct.
* No browser, no live Edge invocation, no database. This was a source-differential run end to end.

### Artifacts

`qa/verification/proposed/v44_regression_additions.mjs` (118 checks; exits nonzero on any failure;
locates index.ts from `SEM_INDEX_SRC` or from any cwd) · `qa/verification/proposed/v44_PROMOTION_NOTE.md` ·
`qa/verification/scratch/v44/` (harness, corpus, four-quadrant measurement, mutation proof, six
adversarial probes, the prepared fix and its builder).

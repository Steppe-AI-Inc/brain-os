# v40 PROMOTION NOTE — campaign #100, verifier #40

**EDGE STATUS: NOT DEPLOYMENT READY. Production stays sem-ai-command v92.**

| field | value |
|---|---|
| candidate commit | `4cf2a88f720b90e5f8aeddaefa85cfbb6db2cdd4` |
| candidate index.ts sha256 | `3798ad2f819749ff36daf6dd522a9e00cfe95a521ceb6bf92f810fa6de6f2901` (unchanged before and after this run) |
| deployed function | `sem-ai-command` **v92**, ACTIVE, project `pvphxgrtdfrudejjhzjk` |
| deployed bundle | `ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at 1788239725518` |
| deployed source (claimed) | git `c9dfab5bd433`, index.ts sha256 `795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc` |
| rollback target | `c9dfab5bd433` — **EXACT AND AVAILABLE** in this worktree, hash re-derived |
| deploy surface | exactly one file: `supabase/functions/sem-ai-command/index.ts` |
| verdict | **FAIL** |

## Provenance strength — read this before quoting the table above

**INTEGRATION-LEVEL, not byte-direct.** I ran `supabase functions list` myself and read
version 92 + `ezbr_sha256` directly from the API, which proves **production has not moved**
since this campaign's baseline. `supabase functions download` and `supabase link` are both
refused by this session's permission gate (`list` is not), and the sandbox blocks writes
outside the worktree, so I could not re-fetch the deployed body. The deployed-bytes↔git link
therefore rests on a prior session's download artifact
(`qa/verification/scratch/v92/index.v92.ts`), which I did verify **normalises byte-for-byte
to git `c9dfab5bd433`**. Do not upgrade this to "byte-direct" in a later summary.

Note `qa/verification/scratch/v92/v92.lf.ts` is CRLF and byte-identical to `index.v92.ts`
— its filename is still wrong, and it is a duplicate.

## Why FAIL

Both regression counters must be zero. Neither is, on a corpus of **758 rows (483 truthful
negatives with real names, 275 fabrications)** built from scratch for this run.

* **27 TRUTH REGRESSIONS** — truthful answers deployed v92 shows the founder that the
  candidate replaces with *"I can't actually do that from chat — nothing was changed"*, and
  **persists** to `work_orders.output`.
  * **V40-D1 (20)** — `EXECUTION_IN_PROGRESS`'s clause-initial gerund arm, the arm v92 does
    not have. #39 closed this with a **whitelist of finite main verbs**; English predicates
    are an open class, so `Archiving a company triggers a notification.` and nineteen
    siblings are still destroyed. **Second recurrence of #100/V39-D1.**
  * **V40-D2 (2)** — the CONFIRMED arm's morphological disarm reads a function word heading
    an *adverbial* as a determiner: `Confirmed — Archived no longer means deleted.`
  * **V40-D3 (5)** — the first-person arm matches an entity noun used **attributively**:
    `I removed the company filter from the list you asked about.`
* **5 FABRICATION REGRESSIONS** — shapes deployed v92 **corrects** that the candidate ships.
  * **V40-D4** — `No errors occurred the department was removed.` and four siblings.
    `newSubject`'s `endsLinked` treats `[a-z]+(?:ing|ed|en)` as a linker and so swallows an
    ordinary **finite** past-tense verb. **This has been RED in `v33_regression_additions.mjs`
    (92/1) for the whole campaign**, mis-filed as a "disclosed residual". Per #30/D170's own
    ruling, a fabrication regression against deployed production is a **deploy blocker**, not
    a residual.

## What is genuinely good, and should not be lost in the FAIL

* **Q3 = 269 truthful answers rescued** that deployed v92 destroys, and **Q4 = 21**
  fabrications caught that v92 misses.
* **Negator-token entity names: 48/48 fabrications caught, 48/48 paired truthful negatives
  preserved, 0 regressions in either direction.** That class is closed.
* **Matcher: 36 shapes, 16 deltas, every one in the safe direction, 0 crashes.** No v92
  dead-end becomes a candidate wrong-intent select, and the candidate *fixes* a v92
  **wrong-option destructive bind** (`smiths bakery` → v92 binds `Smith`, candidate binds
  `Smith's Bakery`).
* **Ledger #64 D16/D17, #65 D25, #65 D27 (production row `9dda919c`), #66 D40: 28/28
  closed**, re-derived from the ledger's own tables.
* **All ten re-pins honest** — fabrication caught *and* paired real name preserved, 10/10.
* **The three shapes the session says it refused to close are actually closed.** That
  disclosure is stale and understates the build.
* **`LEGACY_PAST_COMPLETION` is byte-identical (389 chars) to deployed v92's
  `PAST_COMPLETION_CLAIM_PATTERN`** — which is what makes every v92 comparison here honest.

## Corrections to the campaign record

1. **`CORRECTED_BY_V39` is wrong about R-AUXGAP.** It is **not** masked and **must not** be
   deleted: reverting it alone re-opens `ACME was, with no delay, archived.` and `Beta Corp
   has been, with no issues, deleted.`, both of which **v92 corrects**. Removing it under
   the only-load-bearing-code rule would have created a new fabrication regression. #39's
   deadness measurement was vacuous and `v39_deadness_proof.mjs` does not even parse.
2. **Identifier delta: 186 added / 0 removed** (comments and strings stripped), **43 → 43
   top-level, 0 added**. The naive count including comments is 209. Always report the method.
3. **The candidate's committed blob is CRLF while v92's is LF**, so a raw `git diff` shows
   the entire file changed. Normalised: **51 hunks, +1,729 / −52**.
4. **"34 suites / 0 failures" is literally true but 5 of the 34 are `SUPERSEDED` no-op
   stubs.** The honest headline is **29 substantive suites**; my own measurement is 34 files,
   0 failing assertions, 1,179 assertions passed, all exits 0 (retract-check confirmed: 34,
   not 33, and read from output text, not a pipeline status).
5. **run14/D107's slicing window is not 2000 or 2600 — the budget is gone**, replaced by a
   lexer that fails loudly. That premise is stale; the current state is better.
6. **`v30_regression_additions.mjs` and `v39/v39_mutation_proof.mjs` are unrunnable from any
   cwd** (they resolve `qa/supabase/…`), and `v39_deadness_proof.mjs` throws `SyntaxError`.

## Suite-integrity judgments requested

* **CONTRACT 5's narrowing to top-level declarations: HONEST, and proven by mutation.**
  New top-level const → RED; reorder → RED; rename → RED; new local inside
  `completionIsNegated` → GREEN (correct — locals travel with the brace-balanced
  extraction, confirmed against my own independent extractor). It hides nothing real. Its
  one residual hole — an *existing* top-level decl becoming newly referenced from inside the
  extracted predicates — is shared with the old flat version and would `ReferenceError`
  every extractor suite anyway.
* **CONTRACT 6 / run15-D117: intact and non-vacuous.** Injecting a whole-span lookahead,
  lookbehind, or an inline modifier group each turns exactly the right assertion RED.
  **run15 = 57/0** confirmed.
* **`v39_regression_additions` = 20/1** confirmed, its entity test red by design.
* **`v31_regression_additions` 33/1 and `v31_adversarial_truth` FAIL (2/38)** are failures
  against an *absolute* standard v92 also fails (`NEGATED_CLAUSE` still doesn't know
  `couldn't/wouldn't/shouldn't/won't`). Real truth costs; **not** deploy blockers.

## Fix prepared (NOT applied — no write authority on the implementation branch)

Four edits in `qa/verification/scratch/v40/prepared_fix.mjs`, applied only to a scratch copy:

* **A (D1)** — a clause-initial gerund is an execution claim only when its object is a
  **specific referent**; the disarm is stated **positively** (indefinite article or bare
  plural) so it can only narrow. Verb set is `PROGRESS_VERBS` exactly, so
  `working/processing/executing` (other arms) keep firing.
  *Trap recorded: my first attempt used `/i`, which also case-folded the `[A-Z]` test and
  made the guard silently inert. A flag is never a local change.*
* **B (D2)** — `Confirmed — <Participle> no longer|not|never …` is an adverbial.
* **C (D3)** — the first-person arm's **entity-noun** branch must be the object **head**;
  the `[A-Z]` proper-name branch untouched.
* **D (D4)** — a reduced relative needs a **singular head noun**; a bare plural or no head
  means the `-ed` word is the negator clause's own finite verb. Evidentials keep linking.

**Measured: truthRegression 27 → 0, fabricationRegression 5 → 0. All 34 committed suites
byte-identical in result, 0 failures. 0 new gate failures. Three disclosed residuals
(v34/v35/v36) retire — which is precisely what those suites' own text asks for once the
paired truths survive, and all five paired truths do.**

## Coverage gaps — BLOCKED, not skipped

* `supabase functions download` / `link` blocked → provenance is integration-level.
* `deno` not invokable → **"deno 23 == baseline" is unverified by me.** Partially
  compensated: 119 regex literals scanned, 0 construction failures, 0 real inline modifier
  groups (the one `(?-i:)` hit is inside a comment saying it is not used).
* No live UI / live AI-chat evidence: production must stay v92, so no deployed build carries
  these bytes. Reachability and persistence of the substituted refusal are **CODE
  INSPECTED** at the exact statements (`legacyProseFallback`, index.ts:5919 persist
  condition, index.ts:5850 replacement text) — labelled as such, never as E2E VERIFIED.

## Artifacts

* `qa/verification/proposed/v40_regression_additions.mjs` — **45/32 on the candidate, 77/0
  under the prepared fix**, identical from any cwd. Every DEFECT block carries a
  non-vacuity assertion; every DEFECT is paired with a CONTRACT a fix must not trade away.
* `qa/verification/proposed/v40_known_failure_modes_entry_101.md` — the `#101-V` ledger entry.
* `qa/verification/scratch/v40/` — corpus, harness, differential, mutation proof, matcher
  differential, CONTRACT 5/6 probes, ledger-closure probe, prepared fix and its battery run.

## Next round

1. Close D1–D4 (the prepared edits measure clean; adopt or better them).
2. **Re-classify V40-D4 from "disclosed residual" to "deploy blocker"** in v33/v34/v35 —
   mis-classification, not blindness, is how it survived four verifiers.
3. Re-pin the R-AUXGAP arm as load-bearing and delete the `CORRECTED_BY_V39` claim.
4. Then the entity-name positive signal — right direction, but write the test
   **behaviourally** (stub the set; assert both directions **and** that an EMPTY set behaves
   exactly as today), because the current grep-for-an-identifier pin is spoofable and its
   partner assertion is vacuous until the wiring lands.

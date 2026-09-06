## #108-V — verifier #43, v92-differential deployment gate on `0007a02`: **FAIL**. The one suite that measures the entity signal is 4/5 vacuous, and the truth class everyone called world-knowledge-bound is closable with three regex edits

Isolated worktree, separate top-level process, no memory of the implementing session. Candidate
`0007a02abd1855f438ccf9e5c735ac0ea42ae4ff`, `supabase/functions/sem-ai-command/index.ts` sha256
`7b9fd136cdc0379b2efeb56e2adf0738df8c980e6b7153cea43900d65405c0cd`, **unchanged at end**. Belt,
matcher, corpora, mutation harnesses and the arity scanner are all mine; nothing is imported from
`v30_*`–`v42_*`, `v92_parity_contract` or `v92_open_regression_contract`.

**VERDICT: FAIL. EDGE STATUS = NOT DEPLOYMENT READY.** Production stays v92. Three prepared fixes
take it to ready; they are in `qa/verification/scratch/v43/` and are measured below.

---

### The three things that decide it

**V43-D4 (P0, suite integrity, THE SEVENTH VACUITY) — `entity_signal_positive_contract.mjs` is
4/5 vacuous, so the entity signal is completely unmeasured.** Its helper is declared
`check(kind, label, cond, detail)`. All four of `V43-E1`, `V43-E2`, `V43-E3` and `V43-E4` call it
with **five arguments** (three) or with a description string in the `cond` slot (one), so the
*description* is what gets evaluated as the condition and **every one of them passes
unconditionally**. Two independent proofs: the same file with `check()` made to reject a non-boolean
`cond` reports **1 passed, 4 VACUOUS**; and a mutant with the signal disabled outright
(`false && knownEntityNames.has(…)`) leaves the suite at **5 passed, 0 failed**. The only live
assertion is the NON-VACUITY check — and it is green *precisely when the signal does nothing*.
The checkpoint's `"entity_positive_contract: 5/0"` and the "v39 21/0, GREEN for the first time"
milestone both rest on this. Ledger #107's own words — *"if it is vacuous, the signal is
unmeasured"* — are correct, and it was. Mutation confirms the consequence: reverting the entity
signal turns **nothing** red anywhere in the estate except `standing_reds`, which is red at baseline
anyway. The corrected suite is at
`qa/verification/proposed/v43_entity_signal_positive_contract.FIXED.mjs`: 5/0 on the candidate, and
it **fails** on the disabled mutant, which is the property it never had. The scanner that finds the
whole class is `V43-D4.noAssertionHelperIsCalledOverArity` in `v43_regression_additions.mjs`; the
only other hit in the estate is inside a documented SUPERSEDED stub that never runs.

**V43-D1 (P1, DEPLOY BLOCKER) — the truth class is NOT world-knowledge-bound, and it is far larger
than one row.** `CURRENT_CAMPAIGN.json`'s `critical_path` says the D100 row "cannot be rescued by any
pattern rule without re-opening fabrications v92 corrects". **Refuted.** On a straightforward
generated space of `"Confirmed - <Participle> <Name>. <state continuation>"` the candidate destroys
**672 of 784** truthful answers deployed v92 preserves — not one. The candidate already rescues the
identical sentence, with no world knowledge at all, when the continuation sits in the SAME sentence
(`"Confirmed - Archived Media Group is still active."` survives today). The only difference is the
window `(?:[^.]|\.(?!\s|$)){0,80}?`, which cannot step over a full stop. A blind widening to `[^]`
was measured and **rejected** — it ships `run15/D117.suffixDisarms.4` and `.5`
(`"Confirmed — Removed Bob Smith. There is no undo."`). The accepted form adds a second, bounded
alternative instead: one sentence boundary, the next sentence must open with an ANAPHOR
(It/They/This/That), only the strong state verbs count, the negator block is case-insensitive there,
and the branch requires a Title-Case object so `"Confirmed - Archived the company. It is still
active."` is untouched. Result: **672 rescued, 0 new fabrications shipped** (140/1358 in both
builds, of which v92 catches 0), battery **36/36**, `standing_reds` **GREEN**.

**V43-D6 (P1, DEPLOY BLOCKER) — a second truth shape the entity signal cannot reach at all.**
`"Confirmed - the company you asked about is Archived Media Group."` — v92 preserves it, the
candidate destroys it, and a **fully populated** context pack changes nothing, because the signal's
capture regex requires the participle immediately after the dash. That is **12 of verifier #42's own
48 rows, unconditional**, and no round has named it. Closed by three copula lookbehinds in
`CONFIRMED_COMPLETION`: a completion participle immediately preceded by a present-tense copula is a
STATE, never the event — the asymmetry `COMPLETION_VERB` and run19/D137 already rely on.

---

### The entity signal, ruled on

**The unknown-entity case DOES block a deploy, and the reason is not the unknown-entity case.**
Measured on verifier #42's own 48-row class: the candidate destroys **36**; with all 12 names in the
pack it still destroys **12**; the prepared fixes destroy **12** with an EMPTY pack and **0** with the
pack populated. So the signal closes 24 of the 36 and never touches the other 12, while three regex
edits close 24 of the 36 with no world knowledge at all. On the wider generated space the signal's
reach is bounded by pack membership and degrades exactly as you would expect: with 0/1/6/12/30 of 112
names present, 672/665/630/588/462 rows stay destroyed. The pack is `companies .limit(12)`,
`people .limit(30)`, `tasks .limit(15)` plus a name-token lookup capped at `NAMED_LOOKUP_ROW_CAP = 5`
— and `knownEntityNames` is built from companies + people + tasks + `runtimeLabels` **only**, so a
project, goal, department, approval, document or proposal can never be rescued at all, which the
design note in `CURRENT_CAMPAIGN.json` does not say.

**V43-D5 (P2) — the rescue is keyed on a PREFIX but applied to the WHOLE REPLY.** `"Confirmed -
Archived Media Group and Beta Corp."`, `"… Deleted Beta Corp too."`, `"… Removed Bob Smith as
well."`, `"Confirmed - Sent Parcel Co. Deleted ACME Holdings too."` — **4 of 4 are excused only when
the set is populated**, i.e. only in production, where it never is empty. v92 misses them too, so it
is not a v92 regression, but it is a fabrication surface the signal *creates*, and `V43-E2` does not
test it: its five rows were chosen so the captured phrase is not a known name. Narrowed by fix F to
the span the rescue reasoned about.

---

### What I confirmed, against my own bytes

* **Provenance is INTEGRATION-LEVEL, not byte-direct, and I could not close it.** `functions list`
  runs: `sem-ai-command` **version 92**, `ezbr_sha256`
  `33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at`
  2026-09-01T05:15:25.518Z, entrypoint under a GitHub Actions runner path. `functions download`,
  `db query` and `projects list` are all refused by this session's command classifier — the same wall
  #38–#42 hit. `git c9dfab5bd433:…/index.ts` hashes to `795c20c8…`, both committed reference copies
  match it byte-for-byte, it is the last master commit to touch the file, and the deploy is 44
  seconds after it. Strong, not byte-direct. **Say so; do not upgrade it.**
* **Deploy surface, Q1/Q7.** Exactly one file under `supabase/functions/`. LF-normalised: **1,738
  insertions / 52 deletions over 78 hunks**. Top-level declaration SET **identical** (57 == 57, none
  added, none removed); code-only lexer over the whole file: **+203 / −0**. Nothing is removed, so
  nothing previously removed is reintroduced (Q3); the D3 `&& !result.pendingAction` short-circuit
  exists only on the FUTURE-promise gate, as intended, not on the completion gate.
* **A byte fact nobody has recorded.** The committed candidate blob is **CRLF** (476,361 bytes, 5,998
  CRLF, 0 bare LF) where v92's is LF (321,370 bytes) — every line differs at byte level. Inert for
  Deno (ECMAScript normalises `\r\n` inside template literals), but it means a post-deploy source
  hash will never equal a LF checkout's, and `.gitattributes` pins `eol=lf` for the v92 reference
  copies and **not** for `index.ts`.
* **Q2 belt, my corpus: 921 rows, 488 truthful / 433 fabrications**, with a labelled `NEG-NAME`
  section (No Limits Inc, Nothing Bundt Cakes, Never Summer Industries, None The Wiser LLC, Nothing
  But Nets Foundation, No Fear Clothing, Nowhere Bakery, No Frills Grocery, Not Your Average Joe, Few
  Good Men Ltd, Hardly Strictly LLC, None Such Foods, Pending Review Board, Awaiting Approval
  Committee) in **both** directions. Four quadrants: truthful 176 both-preserve / **2 rows = 1
  distinct shape truth-regression** / 299 rescued / 11 both-destroy; fabrications 255 both-catch /
  **0 fabrication regression** / 130 improvement / 48 residual v92 misses too. `NEG-NAME` is
  **0/168 truths destroyed and 0/168 fabrications lost against v92** — the class is genuinely closed
  in both directions. Disclosed: 28 of the 168 negator-name fabrications are missed in shapes v92
  also misses (`"Archived <Name> — no undo available."`, `"I'm now archiving <Name>."`), because
  `nameInternal` requires an auxiliary and the progressive arm never has one.
* **Q2 matcher, 32 shapes of my own: 0** v92 DEAD-ENDs become a candidate wrong-intent SELECT. Every
  divergence is the candidate being *more* correct. One real v92 defect surfaced on the way: with a
  prototype-polluting `actionType`, v92 returns `SELECT:function Object() { [native code] }:a`.
* **Q5.** D16/D25/D27 (production row 9dda919c, the `renamed: "X" → "Y"` arrow form)/D40, plus
  BUG-002 and the v92-differential fix: **26 pinned rows, 0 missed**, and each group re-checked
  **non-empty** so the assertion cannot be furniture.
* **Q6.** Rollback target is exact and available: `c9dfab5bd433`, `795c20c8…`, present in this repo
  and byte-identical to both committed reference copies.
* **STEP 3/3b.** The dash-before-a-capital refusal is correct and still holds: `"No company named
  Ulaanbaatar — North Depot was archived."` and `"No unit at Erdenet — Copper Works was archived."`
  both survive while their paired fabrications are caught **lexically**. `"I archived no companies."`,
  `"No log however shows ACME Holdings was archived."`, `"No entry however in our records shows …"`,
  the modal-hedge-plus-real-completion shapes, and `"Confirmed - No Business Unit Archived."` all
  survive. **The session's three "refused" residuals are no longer refused — all three are CAUGHT**
  (`"No errors ACME was archived."`, `"No problem the log shows ACME was archived."`, `"Not a single
  task moved - Bob Smith was removed."`); the disclosure is stale. `"No North Depot was archived."` is
  destroyed, and v92 destroys it too, so the session's "indistinguishable from `No Limits Inc`"
  argument is accepted: **shared, not a blocker.**
* **14 of 14 re-pins re-derive as honest** — run18/D131 "but" and dash and idiom members, run19/D131's
  five separables, run28/D116, and all four `disclosedResidual` rows — every one with the **paired
  real name checked in the other direction**.
* **CONTRACT 5's narrowing is honest.** Injecting a new TOP-LEVEL const into the belt block turns
  `v92_open_regression` and `run28` red (it still fails for the reason it exists); injecting a new
  LOCAL inside `completionIsNegated` turns **nothing** extra red, which is the evidence the narrowing
  does not hide a hazard. Its **second** coverage assertion is still `mutated === TEXT || …` and is
  one refactor from furniture; the anchor exists today, and `V43-C7` now makes that a measured fact.
* **V41-F1: the retraction is CONFIRMED.** Reverting it flips **0 of 17,160** sentences in a general
  product-help space and **22 of 352** in a space engineered for the bare-subject shape, all
  `"<Gerund> can be undone."`. Ledger #104's "144" is wrong; ledger #106's withdrawal is right; and
  the fix is **load-bearing and must not be removed** — pinned as `V43-C8`.
* **Mutation proof, mine, against the pinned estate** (excluding `standing_reds`, which is red at
  baseline and therefore carries no signal): M1 `nameInternal` → 5 suites red; M2 `titleHead` → 2;
  M3 `ppInternal` → 2; M4 the widened reassurance strip (2 anchors) → 2; M5 R-AUXGAP → 1. All five
  shipped fixes are load-bearing. M6, the entity signal → **0**. My first M5 anchor was wrong through
  two escaping layers and reported a false "not load-bearing"; re-run with an escape-free anchor
  (`new RegExp('(?<!`) and corrected here rather than left in the report.

---

### Counts, measured myself, and one correction

`qa/scenarios-runner` holds **37** `.mjs` files, one of which is the `_gate_extract.mjs` helper.
Running the other **36** as separate child processes and reading each child's own exit status —
never a pipeline's — gives **36 executed, 1 failing** (`standing_reds_classification_contract`,
derived-BLOCKER 1). Five are documented SUPERSEDED stubs with no assertions, so **31 assert**.
Ledger #101's "34 suites / 0 failures" and "#39 gate at 20/1" are both **not reproducible on these
bytes**: the file count is 36 and one fails, and the v39 gate reads **21/0**. The session's own
retraction of an earlier "battery 33/0" is therefore correct, and the replacement number is 36/1.
Verifier gates re-derived: v30 **25/1** (harness obsolescence, non-blocker), v31 **33/1** (V31-F3b,
shared), v32 **101/0**, v33 **93/0**, v39 **21/0**, v41 **22/0**, v42 **12/1** (V42-D2, a real
blocker), `v30_open_regressions_probe` PASS.

---

### The three prepared fixes, and what they measure

| fix | what it changes | evidence |
|---|---|---|
| **D3** `v43_build_fixD3.mjs` | a second, anaphor-bounded, strong-verb-only alternative to the state-continuation window in the CONFIRMED disjunct | 672 truths rescued, 0 new fabrications, battery 36/36, `standing_reds` green |
| **E** `v43_build_fixE.mjs` | three present-tense-copula lookbehinds on `CONFIRMED_COMPLETION` | v42's 48-row class 36 → 12 destroyed with an EMPTY pack, 0 with it populated |
| **F** `v43_build_fixF.mjs` | the entity rescue is narrowed to its own span: no other completion participle, and no coordinator + further proper name, after the matched phrase | ride-along fabrications 4/4 excused → 0/4, positive rescue unchanged (`stillDestroyed` 0/18) |

Stacked (`index.fixD3EF.ts`): **battery 36/36**, `v43_regression_additions` **39 passed / 1 failed**
(the remaining failure is V43-D4, which is a fix to a QA file, not to the Edge function), gates at
v30 25/1, v31 33/1, v32 101/0, v33 93/0, v39 21/0, v41 22/0, v42 12/1 — every one at its expected
state, none worse. My 921-row corpus: truth regression **0**, fabrication regression **0**, residual
unchanged at 48.

**None of these are applied.** `index.ts` is byte-identical at the end of this run:
`7b9fd136cdc0379b2efeb56e2adf0738df8c980e6b7153cea43900d65405c0cd`.

---

### Two things the next round must not repeat

1. **A green suite is not a measurement.** Seven times now a gate has been green because it could not
   fail. This one was green because JavaScript does not check arity — and it was the single suite the
   previous round designated as the only place the newest mechanism is measured. `V43-D4` pins the
   class, not the instance, and its own detector is proven non-vacuous against a synthetic call.
2. **"World-knowledge-bound" was an assumption, not a measurement.** Four rounds carried it. Three
   regex edits closed two thirds of the class with no world knowledge and no fabrication cost. Before
   the next residual is declared irreducible, generate the class and count it.

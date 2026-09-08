## #118-V — VERIFIER #54 (campaign #114): candidate `8eb8cbd` FAILS the deploy gate on a runtime crash the prose differential could not see. `V54-P0-TDZ`: the disambiguation branch reads `PAST_COMPLETION_CLAIM_PATTERN` and `COMPLETION_WORD` ~2000 lines before they are declared, in the same block, with no function boundary — every founder reply that MATCHES a disambiguation option throws `ReferenceError`. Deployed v92 does not have the construct. Latent since `f1722f2` (2026-09-03) and passed over by every verifier since, because `belt_extract.buildDecide()` HOISTS exactly those two declarations above the branch, and because the `deno` gate pins an error COUNT (23) instead of the error CLASSES — 4 of those 23 are `TS2448`/`TS2454`, which are the compiler naming this bug out loud.

### Verdict

**FAIL.** Not on the belt. The belt is, as far as I can measure, better than deployed v92 in
every direction I could construct. The candidate is unfit to deploy because it breaks a working
production feature outright.

### V54-P0-TDZ — the defect

`supabase/functions/sem-ai-command/index.ts` (LF-normalised line numbers):

```
:2620   try {                                              <- the declaring block
:2709     } else if (pendingAction.kind === 'disambiguation' && …) {
:2768       if (matchedOption && !contradicted && field) {
:2779         const readsAsAssertion = PAST_COMPLETION_CLAIM_PATTERN.test(replayLabel)
                                       || COMPLETION_WORD.test(replayLabel);   <- READ
…
:4778     const PAST_COMPLETION_CLAIM_PATTERN = /…/i;                          <- DECLARED
:5054     const COMPLETION_WORD = /…/;                                         <- DECLARED
```

Three independent proofs, none of them a code read:

1. **Scope.** A comment/string/regex-literal-aware block scanner gives the use site the chain
   `2542 serve( > 2616 new ReadableStream({ > 2617 async start( > 2620 try { > 2709 else-if >
   2768 if`. Both declarations sit directly in `2620`. `2709` and `2768` are plain `if`/`else if`
   blocks — **no function boundary defers the read**.
2. **Runtime.** `qa/verification/scratch/v54/tdz_runtime.mjs` lifts the real statements out of the
   real bytes, in the real order, into one block and executes it:
   `ReferenceError: Cannot access 'PAST_COMPLETION_CLAIM_PATTERN' before initialization`.
3. **Type checker.** `deno check` on the candidate: `TS2448 ×2` ("Block-scoped variable … used
   before its declaration") and `TS2454 ×2` ("… used before being assigned"), all four at `:2779`.
   `deno check` on deployed v92: **zero** of either.

Each declaration is declared exactly **once** in the file, so nothing shadows it and the dead zone
is unavoidable.

### What the founder would see

The `catch` at `:6002` swallows it: `mark_work_order_failed`, then `send({type:'error', …})`. So it
fails visibly and safely — no fabricated success, which is the one thing that goes right here. But
the founder's selection **never executes**. Every one of these is broken in the candidate and works
in deployed v92:

```
Brain: "Which one did you mean — ACME Corp or ACME Company?"
Founder: "ACME Corp"        -> ReferenceError, work order marked failed, nothing archived
Founder: "option 1"         -> same
Founder: "the first one"    -> same
```

On my 31 disambiguation shapes through the real extracted matcher, **21 reach the crashing branch**
— every plain-name selection, every ordinal selection, every "do the Bob Smith one". The 6 shapes
where the candidate differs from v92 are all intended (5 ordinal additions from #47's work, 1
fail-closed narrowing on `archive Restored Furniture Co`), and all 6 are moot because the branch
throws before any of it reaches the founder.

### Root cause, and it is written in the file

`:4776`, immediately above the declaration:

> `// (Moved inside the structured-claim window so the QA harnesses that re-execute this window in
> isolation see it; its only consumer is safeProseFragment below.)`

A declaration was **relocated to satisfy a test harness**, the relocation put it after a live use,
and the comment asserting "its only consumer is `safeProseFragment` below" is simply false — the
consumer at `:2779` is above it. `git log -S` dates the use site to `f1722f2` (2026-09-03, "Close
run13 D98–D103").

### Why eighteen rounds missed it — this is the reusable lesson

**The harness manufactures a scope production does not have.**
`qa/verification/lib/belt_extract.mjs` `buildDecide()`:

```js
const deps = [ …, extractConst(src,'COMPLETION_WORD'),
               extractConst(src,'PAST_COMPLETION_CLAIM_PATTERN'), … ].join('\n');
const body = mutate(deps) + '\nreturn function decide(command, options) {\n' + branch + '\n};';
```

It concatenates the dependencies **first** and the branch **second** — hoisting precisely the two
declarations whose ordering is the bug. No extractor-based suite can ever observe this, by
construction. Every green `run19`/`v92_open_regression`/`issue5` reading about the disambiguation
branch is a statement about a re-assembled program, not about the shipped one.

**And the `deno` gate is a count, not a diagnosis.** "deno 23 == baseline" was carried forward as
a pass condition for many rounds. The 23 decompose exactly as: v92's own 7 (`TS2322 ×6` +
`TS2339 ×1`, benign and identical in both files) + 12 benign implicit-`any`
(`TS7006 ×10`, `TS7034`, `TS7005`) + **4 runtime-fatal TDZ diagnostics**. A count-based baseline
cannot distinguish an implicit `any` from a guaranteed `ReferenceError`. Pin the CLASSES.

**This is the same failure mode as ledger #16 in a new costume:** a control that exists
(`deno check` did report it; `CONTRACT 5` exists to guard belt structure) but that nothing
converts into a blocking, class-aware assertion.

### Prepared fix — NOT applied (no write authority on `index.ts`; byte preservation required)

Move both declarations above the resolution block. Module top level is correct: both are pure
regex literals with no dependencies on anything in the request scope, which is where they lived
before `f1722f2`. Delete or correct the `:4776` comment; if a harness genuinely needs them inside
the window, the harness must be changed, not the file. Then re-run
`qa/verification/proposed/v48_regression_additions.mjs` (green on v92 today, 4 red on the
candidate) and re-run `deno check` expecting `TS2448`/`TS2454` to reach **zero**, not expecting the
total to stay at 23.

### Everything else I measured — the belt itself is genuinely good

Provenance closed **byte-direct by me**, not inherited: live `supabase functions list` on
`pvphxgrtdfrudejjhzjk` returns `sem-ai-command version 92, ACTIVE,
ezbr_sha256 33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475,
updated_at 1788239725518`; live `functions download` yields `index.ts` sha256
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc` = git `c9dfab5bd433`
**exactly**. (The download landed on the working tree — the hazard rule 4 warns about is real; the
tree was restored byte-identically and the candidate sha re-asserted.)

Deploy surface: only `supabase/functions/sem-ai-command/index.ts` differs `c9dfab5bd433..8eb8cbd`.
Zero migrations, zero other functions. Identifier delta re-derived: **221 added, 0 removed**.

Prose differential, my own corpus (346 rows: 230 truthful, 116 fabrications), modelled with the
**LIFECYCLE arm cancelled on both sides** (it is byte-identical in both binaries, so cancelling it
is the conservative choice — it can only expose belt-only differences a shared-arm model would
mask):

| pack | PARITY | TRUTH_RESCUE | FAB_RESCUE | TRUTH_REGRESSION | FAB_REGRESSION |
|---|---|---|---|---|---|
| populated (47 names) | 194 | 98 | 52 | **2** | **0** |
| empty | 230 | 98 | 17 | **0** | **1** |

Generated adversarial truthful sweep, **3,952 rows across 38 classes** — Title-Case negator +
Title-Case token, negator after `with/since/despite/after/before/given/amid`, `Pending`/`Awaiting`
that really is a negation, reassurance idiom then a denial, R-AUXGAP, evidential-after-linker
(`No log however shows …`), determiner readings, modal hedges, conditioned offers, punctuation
hazards: **TRUTH REGRESSIONS = 0. TRUTH RESCUES = 2,624.**

Fabrication-only corpus, 1,440 rows: populated pack **FR 0 / RESCUE 364**; empty pack
**FR 100 / RESCUE 172**, and the 100 are confined to **one form** — a negator-initial name in the
**possessive** (`No Limits Inc's record was archived.`). The parenthetical form regresses **0**.

### Rulings requested of me, answered

* **V53-O1 — CONFIRMED, and it is genuinely pack-conditional.** With `None of the above` in the
  pack, `"None of the above is being archived."` is destroyed; with it absent, preserved. v92
  preserves either way. Founder-level ambiguity, correctly classified, correctly disclosed.
* **V53-R3 — REFUTED in the founder's favour.** With the pack populated, **both** the parenthetical
  and the possessive fabrication are CAUGHT (`readsAsCompletion` true for each). They ship only
  with an EMPTY pack. The "2/2 ship" disclosure overstates the residual.
* **"No North Depot was archived." — the session's argument is CORRECT.** v92's PAST arm destroys
  it too (`was … archived` inside 30 chars). It is genuinely SHARED, not a differential loss, and
  0/104 of the determiner family regressed in my sweep.
* **The three refused shapes** (`No errors ACME was archived.`, `No problem the log shows ACME was
  archived.`, `Not a single task moved - Bob Smith was removed.`) — **refusal confirmed, and moot.**
  Both binaries correct all three. No rule is needed because there is no differential.
* **`Ulaanbaatar — North Depot` / `Erdenet — Copper Works`** — both truthful negatives survive in
  the candidate, and the paired fabrications are handled lexically. Confirmed.
* **The first-person history family** (`I archived ACME Corp yesterday.`) — 246 of 294 generated
  shapes are v92-preserve / candidate-destroy. **I do NOT count these as truth regressions**, and I
  want that on the record with its reason: per `CLAUDE.md` "False-execution truth" and this
  ledger's own D144/D155 ruling, a first-person entity completion on an ungrounded turn is a
  fabrication that must be caught. If the founder ever wants past-turn recall to survive, this is
  the number, and it is 246/294 — not a hidden cost, a chosen one.

### Independent mutation proof (marginal contribution, on the family each fix exists for)

| reverted | NEG_NAME_FAB shipped | IDIOM_FAB shipped | AUXGAP_FAB shipped | truth cost |
|---|---|---|---|---|
| baseline | 0/240 | 0/120 | 40/120 | 0 in all 4 truth families |
| `nameInternal` | **160/240** | **60/120** | **80/120** | 0 |
| `titleHead` | 0 (=) | 0 (=) | 40 (=) | 0 |
| `ppInternal` | 0 (=) | 0 (=) | 40 (=) | 0 |
| `namePrefixHit` 16→8 (revert V53-R2) | 0 (=) | 0 (=) | 40 (=) | 0 |
| V53-D1 prefix search | 0 (=) | **5/120** | 40 (=) | 0 |
| idiom strip | 0 (=) | **45/120** | 40 (=) | 0 |
| R-AUXGAP arm | 0 (=) | 0 (=) | **80/120** | 0 |

`nameInternal`, the idiom strip, the R-AUXGAP arm and the V53-D1 prefix search are **load-bearing**.
`titleHead`, `ppInternal` and **V53-R2 (cap 8→16)** show **no marginal effect on any family I could
construct** — they are subsumed or dead. Not defects; report them honestly rather than as wins.
The AUXGAP baseline residual (40/120, the `has, <adverbial>, been` form) is **v92 parity** — v92's
`has been` must be contiguous, so it ships there too.

### Residuals in the first-person arm (all v92 PARITY, none regressions)

* name containing an internal abbreviation period — `Confirmed — I removed Dr. Sarah Chen.` ships.
  The clause splitter cuts at `Dr.` (`\.(?=\s|$)`), so the object becomes `Dr` and the prefix search
  starts from a clause that no longer contains the name.
* apostrophe-glyph mismatch — a pack name stored with `'` and rendered by the model with `'` (or the
  reverse) does not match; `knownEntityNames` lowercases but does not normalise quote glyphs.
* lowercase-initial name — `I archived nomin holding.` / `eMart` never match: the first-person arm's
  object alternation requires `[A-Z]…` or a head noun, so "any casing" in the V53-D1 closure applies
  only to the words *after* the capitalised head, never to the head itself.

### Suite integrity

37 `.mjs` Edge/QA suites executed from the filesystem, one child process each, no pipelines:
**37 PASS / 0 FAIL** (`run15` **57/0** confirmed; `v92_parity_contract` 46/0;
`v92_open_regression_contract` 28/0; `run28` 117/0; `run19` 62/0; V53-H1 semicolon contract 4/0).
Five suites print one line only — they are self-declared `SUPERSEDED (prose-era)` stubs, honest
rather than vacuous. Two further files, `production_write_authority.regression.test.mjs` and
`factory_production_write_inventory.regression.test.mjs`, fail: those are **machine-posture**
assertions, red by design on a founder-credentialed host (their own headers say so), and are not
Edge-behaviour suites. Ledger #101's "34 suites" undercounts the current tree by three.

**CONTRACT 5's narrowing — judged.** The narrowing is defensible for the hazard it names and its
coverage assertion is genuinely non-vacuous (it injects a top-level `const nx` and requires
detection). But the whole CONTRACT-5 family guards the wrong half of the extraction risk. Its
hazard is "the suites DROP a declaration". The hazard that actually bit is the dual — "the suites
ADD a declaration, in a position the real file does not have it". CONTRACT 5 checks *which*
identifiers are declared, never *where they are declared relative to their uses*, and no narrowing
or widening of it would have caught `V54-P0-TDZ`.

### Regression test added

`qa/verification/proposed/v48_regression_additions.mjs` — resolves `index.ts` via `SEM_INDEX_SRC`
or by walking up, correct from any cwd, exits non-zero on any failure.

* `CONTRACT 1` — a general TDZ detector for the whole file, not a pin on this one site. Its
  non-vacuity is proved by running the **real detector** on three synthetic sources: it fires on
  the hazard, and stays quiet both when the declaration precedes the use and when the use is inside
  a closure.
* `CONTRACT 3` — pins the ABSENCE OF THE CLASS rather than a `deno` error count.
* `CONTRACT 4` — parity floor: `claimsLifecycleClaim` and `findEntityStateClaimContradiction` must
  stay byte-identical to v92, and the `PAST_COMPLETION_CLAIM_PATTERN` literal unchanged.
* `DEFECT V54-P0-TDZ` — the two confirmed instances.

Measured: **deployed v92 → 8 passed, 0 failed, exit 0. Candidate `8eb8cbd` → 5 passed, 4 failed,
exit 1.** Run against `f1722f2`, `4476c92`, `904bf19`, `416c14c`, `8eb8cbd`: **TDZ present in every
one**. Present in no deployed version.

### Instrument correction (fourth path) — for the next verifier

`qa/verification/lib/v92_reference.mjs` models three arms and its self-check is non-vacuous for
arm REMOVAL. It is still incomplete: v92 has a **fourth** prose-driven path,
`findEntityStateClaimContradiction` (`v92:496`, called at `:2957`/`:3037`), with two effects —
*contradicted* → an extra overwrite the instrument does not model (harmless, conservative), and
*confirmed-true* → it **SUPPRESSES** `claimsCompanyDeleted`/`claimsPersonDeleted` (`v92:2975`,
`cand:3401`). That second effect is in the dangerous direction: the instrument reports
"v92 destroys" for a row v92 actually preserves. It happens to cancel in this differential because
the function is byte-identical in both binaries (`CONTRACT 4` now pins that), but it will **not**
cancel against any future candidate that touches it. `qa/verification/scratch/v54/differential.mjs`
models it explicitly, with a witness that fails if the suppression ever goes vacuous.

### Not measured — stated as gaps, not skipped

No live browser session and no live authenticated chat turn: `V54-P0-TDZ` is proven at the source,
scope, type-check and JS-semantics level, **not** by observing the ReferenceError in a production
SSE stream. It could not be, without deploying the candidate — which is the thing being blocked.
Nothing was deployed; `functions list`/`functions download` only.

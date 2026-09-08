## #92-V — verifier #31, PRODUCTION-DEPLOYMENT GATE round 2 on `6774b52`: **FAIL — the candidate regresses against deployed v92 in BOTH directions**

Isolated worktree, separate top-level process, no memory of the implementing session. Candidate
`6774b52cf2eba8ca0b96d4c6951e7956ae2ad4dd`, `supabase/functions/sem-ai-command/index.ts` sha256
`2a7abef9c83cbbc19532aa742a73da71a40b597083a3287afb3fc0ed9de935a7`, **unchanged at end**
(temporarily mutated four times for suite-integrity probing, each time restored byte-identically
from a pre-taken byte copy and the sha re-asserted). Every predicate executed here was re-sliced
out of the shipped bytes by **my own extractor**; corpora, differential, class sweeps, mutation
harness and battery runner are all mine. Nothing is imported from `v92_parity_corpus.json`,
`v30_regression_additions.mjs`, `v31_mutation_proof.mjs` or any implementing-session artefact.

**Verdict: FAIL. EDGE STATUS = NOT DEPLOYMENT READY. Production stays on v92.**

The campaign's own headline claim is **half true and I confirm that half**: verifier #30's five
fabrication classes R1–R5 are genuinely closed, all five fixes are independently mutation-proven
load-bearing, and reverting all five reproduces 9b73e68's numbers exactly (fabrication regressions
69, truth regressions 2) — a fidelity cross-check on my own harness. But the gate was measured on
one axis against one list, and it fails on both axes once measured properly:

| axis | claimed | measured by me, on my own corpus (871 cases: 525 truthful / 346 fabrications) |
|---|---|---|
| fabrication regression vs deployed v92 | 0 | **0 on my corpus — CONFIRMED**, but **17** more exist that the *committed suites themselves* pin as "accepted residuals", every one of which v92 corrects and every one of which ships end-to-end |
| truth regression vs deployed v92 | 0 ("0 truth cost") | **19 on my corpus; 1144 + 330 + 12 in the generated class sweeps.** 17 of the 19 are introduced by *this campaign's own fixes* |

Truthful answers destroyed, same corpus, across the build history — this is the number that
matters and nobody measured it: **`4476c92` = 4, `9b73e68` = 2, this candidate = 33.** The
candidate bought its fabrication coverage with a 16× increase in truth destruction.

---

### Provenance — stated at its real strength, not overstated

`supabase functions download` is **gated by this session's execution policy** (returns "This command
requires approval"; not a provider error). I therefore could not hash the deployed bytes myself, and
the provenance link is **INTEGRATION-LEVEL, not byte-direct**. What I did establish, all first-hand:

| fact | value | source |
|---|---|---|
| deployed `sem-ai-command` | ACTIVE, **version 92** | `supabase functions list --project-ref pvphxgrtdfrudejjhzjk` |
| `ezbr_sha256` | `33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475` | same |
| `updated_at` | 1788239725518 = **2026-09-01T05:15:25.518Z** | same |
| `entrypoint_path` | `/home/runner/work/brain-os/...` → deployed by CI, not a laptop | same |
| only deploy path | `.github/workflows/supabase-functions.yml` (push to `master`, `supabase/functions/**`) | repo |
| latest run of that workflow | **33472871764**, headSha **`c9dfab5bd433…`**, 2026-09-01T05:15:04Z, success, **no later run** | `gh run list` |
| `git show c9dfab5bd433:…/index.ts \| sha256sum` | **`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`** | git |

Function `updated_at` is 21 s after that run started; the commit is 23 s before it; version 92 could
not be a later manual deploy (that would be 93). **Deployed v92 == git `c9dfab5bd433` is CONFIRMED
at integration level, REFUTED nowhere.** Byte-direct confirmation remains **BLOCKED**.

Independent check of the implementing session's own v92 artefact: `scratch/v92/index.v92.ts` raw
sha `49d53882…` (CRLF) LF-normalises to exactly `795c20c8…`. Consistent, not fabricated. Minor
hygiene defect: its sibling `scratch/v92/v92.lf.ts` is **byte-identical to the CRLF file** despite
its `.lf` name — the normalisation that name asserts never happened. Scratch-only, no suite reads
it.

### The delta, re-derived (ledger #90 reported the identifier count wrongly once — this is my count)

- Deploy surface: **exactly one file** changed, `sem-ai-command/index.ts`. No other function, no
  added or deleted file. **Q7 answered: only intended Edge changes.**
- Semantic delta (both LF-normalised): **+1716 / −52 lines, 51 hunks**; 4313 → 5977 lines.
- **Top-level declarations: 57 → 57. 0 added, 0 removed. Any-depth: 496 → 692, +196 / −0.**
  **Q3 answered: nothing v92 declares is removed or reintroduced.**
- Previously unreported: **v92's blob is LF (321370 B), the candidate's committed blob is CRLF
  (463839 B).** Functionally inert, but a raw `git diff` between them shows every line changed.
- **The entire campaign-#91 Edge delta is two hunks / five fixes** (`9b73e68` → candidate, LF-diff,
  52 lines): `nameInternal`, `titleHead`, `ppInternal` inside `completionIsNegated`; the R-AUXGAP
  whole-summary arm; the widened reassurance-idiom strip.

### What v92 actually is, and why that frames everything

v92's entire fabrication belt is **one flat regex on the whole summary**,
`PAST_COMPLETION_CLAIM_PATTERN`. The candidate keeps it **byte-identical** (verified: the two regex
sources are equal strings) renamed `LEGACY_PAST_COMPLETION`, and makes it one arm of a clause-split
`.some()` that `completionIsNegated` can disarm. So the clean differential is
`PAST_COMPLETION_CLAIM_PATTERN(s)` vs `readsAsCompletion(s)`, and a truth regression can only come
from an arm v92 does not have.

---

### V31-F1 (P1, **NEW this campaign**) — `nameInternal` destroys truthful negatives whose real negator is Title-Case

```js
const nameInternal = /^[A-Z]/.test(mm[0]) && /^\s+[A-Z]/.test(c.slice(mm.index + mm[0].length)) && !/\bnor\b/.test(c);
```
A capitalised negator followed by a capitalised token is declared to "open a proper name" and
**skipped**. But a clause-initial negator followed by this product's own capitalised domain nouns is
not a name: `"Confirmed — No Business Unit Archived."` → `"No"` + `" Business"` → skipped → no
negator found → `CONFIRMED_COMPLETION` fires unnegated → the true answer is replaced with
*"I can't actually do that from chat — nothing was changed."*

- Generated family `Confirmed — <NEGATOR> <Subject> <Verb>.` (11 negators × 13 subjects × 6 verbs):
  **1144 / 1144 destroyed by the candidate, 0 by `9b73e68`, 0 by deployed v92.**
- The verb's case is irrelevant — only the *subject* must be Title-Case, so
  `"Confirmed — No Company archived."` is hit too.
- **Ships end-to-end**: corrected on `claims:null` **and** on `claims:[]`, the latter via
  `rewriteFromStructure` — a path v92 does not have, so the blast radius is *wider* than v92's.
- Mutation-proven cost/benefit: reverting `nameInternal` closes 45 v92 fabrication regressions and
  removes 9 truth regressions. It is load-bearing and must not simply be reverted (that re-opens
  class R1). It needs a *correct* rule: a name-internal negator is one whose Title-Case run is the
  clause **subject of a verbal completion**, not one whose very next token is the completion word.

### V31-F2 (P1, PRE-EXISTING — present at `4476c92` and `9b73e68`, missed by verifiers #29 and #30)

`CONFIRMED_COMPLETION` treats a completion word **inside a proper name** as the completion.
`"Confirmed — Archived Media Group remains active."` → matches `Archived` → v92 preserves it (no
auxiliary) → the candidate destroys it. run18/D130 fixed exactly this class for the clause arm by
comparing against `COMPLETION_VERB` (an auxiliary governing a participle); **the CONFIRMED arm never
adopted that guard**, and run19/D134's "clause containing the match" tail-selection then reduces the
negation test to the fragment `" Archived"`, which carries no negator. 12 of 14 generated shapes
that v92 preserves are destroyed. `Archived Media Group` and `Closed Loop Systems` are already this
project's own corpus names.

### V31-F3 (P1, **NEW this campaign**) — the R-AUXGAP arm is a **net-negative** trade

```js
|| (new RegExp('\\b(?:was|were|has been|have been|had been)\\b\\s*[,—–]\\s*[^.]{0,40}?[,—–]\\s*' + COMPLETION_PARTICIPLE.source, 'i').test(String(s)) && !NEGATED_CLAUSE.test(String(s)))
```
Measured by isolating this arm alone on my corpus:

- fabrications it catches that the rest of the belt misses: **3 — and deployed v92 misses all three**
- **v92 fabrication regressions it closes: 0**
- **v92 truth regressions it opens: 8** (330 / 480 in the generated attributed-history family;
  `9b73e68` destroys 0 of them)

Two independent causes:
1. Its window is `{0,40}` where v92's is `{0,30}`, so it reaches shapes v92 never touched.
2. Its only guard is *"the whole summary contains no `NEGATED_CLAUSE` token"* — and that lexicon
   recognises **none of** `couldn't`, `wouldn't`, `shouldn't`, `won't`, `unable`, `refused`,
   `declined`, `unchanged`, `untouched` (`without` was deliberately removed at run18/D131). So an
   attributed or hedged **true** history report is destroyed:
   `"Erdenet Copper Works was, according to the current record, archived on 12 March by the founder."`
   → v92 shows it to the founder; the candidate replaces it with *"nothing was changed"*, which is
   itself false. This is the D112 class the file's own comments call the worse direction.

The stated justification — "closes the two shapes this campaign's own tight-dash fix F6 made worse
than baseline `4476c92`" — is a **self-inflicted** problem, not a v92 regression, and does not
justify 330 destroyed true answers.

### V31-F4 (P1, LONG-STANDING, **the class nobody had looked for**) — "accepted residuals" that production already corrects

Nobody ever tested the suites' **own** disclosed-residual lists against deployed v92. I did.
**17 shapes that `run18`/`run19`/`run28` assert the belt MAY MISS are fabrications deployed v92
CORRECTS, and all 17 reach the founder end-to-end** on `claims:null` and `claims:[]`:

- `run28` D164r (7) — `"No record exists however the log shows ACME was archived."` and kin
- `run28` D166r (4) — the multi-token evidential family; **run28's own comment says "CAUGHT at
  4476c92, MISSED here"**
- `run28` D169r (3) — `"ACME may have been archived and Beta Corp has been deleted."`
- `run28` D153, D166b (2) — `"No errors ACME was archived."`, `"No problem the log shows ACME was archived."`
- `run18`/`run19` D131 dash residual (1) — `"Not a single task moved — Bob Smith was removed."`

**14 of the 17 were CAUGHT at the campaign baseline `4476c92`** and are missed by both `9b73e68` and
this candidate. They were disclosed honestly *as residuals* — but a residual that production already
corrects is not a residual, it is a fabrication regression against production. That is the **exact
argument campaign #91 itself used** to re-pin D116 from `mustNotFire` to `mustFire`; it was applied
to one shape and not to the other seventeen. (7 further pinned residuals — D165 `activated`/`closed`,
D170 digit-final names — v92 also misses, so those are genuine residuals and are **not** blockers.)

---

### What I confirm, unreservedly

- **Verifier #30's classes R1–R5: genuinely CLOSED.** 0 fabrication regressions on my 346
  fabrications; 130 fabrications v92 misses are now caught; 274 truthful answers v92 destroys are
  now rescued. This is real work.
- **All five fixes mutation-proven load-bearing on my corpus** (M1 +45 fabReg, M2 +6, M3 +2, M4 +3
  shipped, M5 +2 fabReg on revert). Reverting all five reproduces `9b73e68` exactly.
- **Q5 — ledger #64 D16, #65 D25, #65 D27 (production row `9dda919c`), #66 D40: all genuinely
  closed**, re-derived on my own extraction, plus both BUG-002 production rows.
- **The refused class stays refused, correctly.** `"No company named Ulaanbaatar — North Depot was
  archived."` and `"No unit at Erdenet — Copper Works was archived."` both **survive** on the
  candidate (v92 destroys both), and the paired fabrications
  `"Ulaanbaatar — North Depot was archived."` / `"Erdenet — Copper Works has been deleted."` are
  caught **lexically**, not by casing. Refusing that fix was the right call.
- **Negator-bearing names, both directions: 166 cases, 0 truth regressions, 0 fabrication
  regressions.** **Disambiguation: 27 shapes, the belt fires on 0.**
- **Q6 — rollback target is exact and available**: `c9dfab5bd433`, sha `795c20c8…`, on `master`.

### Suite integrity — judged independently, not accepted

- **Battery = 33 / 0**, measured by me from `spawnSync`'s own exit status, never a pipeline. The
  session's retraction of its earlier pipeline-derived number was **correct to make**; but its
  replacement figure of "34 suites" **over-counts** — `_gate_extract.mjs` is a helper, not a suite.
  The honest number is **33/0**. `run15` = 57/0, `v92_parity_contract` = 46/0,
  `v92_open_regression_contract` = 28/0 — all confirmed.
- **No hidden vacuity.** Five suites emit zero assertions; all five *self-declare* `SUPERSEDED
  (prose-era)` and name their replacement. That is honest deprecation, not a silent pass.
- **CONTRACT 5's narrowing (flat identifier sequence → top-level declarations only) is JUSTIFIED
  and hides nothing.** Proven, not argued, by mutating the real `index.ts` and running the whole
  battery four times:

  | injected into the belt | battery | CONTRACT 5 |
  |---|---|---|
  | new **top-level** const, unreferenced | **31 / 2** | RED (+ run28 `constCount`) |
  | new **top-level** const, **referenced** | **27 / 6** (run15/16/17/18 red, run28 crashes) | RED |
  | new **local** in `completionIsNegated`, unreferenced | **33 / 0** | green |
  | new **local** in `completionIsNegated`, **referenced** | **33 / 0** | green |

  The narrowed contract still fails for the reason it exists, and the direction it now permits is
  empirically safe. Approved.
- **run14/D107's 2000 → 2600 widening is honest.** The real statement is **2116** chars; at 2000 the
  regex does not match and the suite **throws** ("readsAsCompletion not found") — a loud failure, not
  a silent pass. At 2600 the slice is 2110 chars and spans the statement; the four-belt check still
  passes and is still meaningful. The bound is a slicing window, never a complexity cap.
- **The D117 no-whole-span-lookaround invariant is intact.** The only `[^]*` in the belt is
  `CONFIRMED_COMPLETION`'s lazy `[^]*?`, not inside a lookaround. No inline modifier group.
- **The four re-pinned residuals are honest — but their paired real names are systematically biased
  toward the safe case.** Every one of the five paired real names re-pinned this campaign survives
  via a negator that is *not* Title-Case-followed-by-Title-Case (`"not"`, `"no "`, `"Nothing was"`).
  **Not one exercises the direction `nameInternal` actually made dangerous.** That bias is exactly
  why V31-F1 shipped green.

### Regression artefact

`qa/verification/proposed/v31_regression_additions.mjs` — CONTRACT/DEFECT, any failure exits
nonzero, `index.ts` via `SEM_INDEX_SRC` else a path correct from **any** cwd (verified from `C:/`).
On the candidate: **29 pass / 5 fail**. Proven non-vacuous **in both directions** by running it,
via `SEM_INDEX_SRC`, against three real product sources:

| source | result | which items move |
|---|---|---|
| candidate `6774b52` | 29 / 5 | the 5 DEFECTs fail; every CONTRACT passes |
| `9b73e68` | 24 / 10 | **V31-F1 and V31-F3 PASS there** (they do not exist yet) while the five verifier-#30 CONTRACTs fail |
| `4476c92` | 21 / 13 | provenance + ledger CONTRACTs fail too |

### What has to happen before this ships

1. **V31-F1** — make `nameInternal` require the Title-Case run to be the **subject of a verbal
   completion** (reuse `COMPLETION_VERB`, as run18/D130 already does for the clause arm), so
   `"No Limits Inc was archived"` still counts as name-internal but `"No Business Unit Archived"`
   does not. Reverting the fix is not acceptable — it re-opens class R1.
2. **V31-F2** — apply the same `COMPLETION_VERB` guard to the `CONFIRMED_COMPLETION` arm, and stop
   reducing its negation test to a clause fragment that can exclude the negator.
3. **V31-F3** — **remove the R-AUXGAP arm**, or narrow its window to v92's 30 characters and give it
   a real negation-position test instead of a whole-summary token scan. As shipped it buys nothing
   against production and costs 330 true answers. Separately, add `couldn't|wouldn't|shouldn't|won't`
   to `NEGATED_CLAUSE`.
4. **V31-F4** — re-classify the 17 pinned "residuals" as v92 fabrication regressions and close them,
   or state explicitly and in the ledger that production is being knowingly downgraded on 17 shapes.
5. Re-run this artefact until it is **34 / 0**, then re-gate with a fresh verifier.

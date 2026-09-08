## #99-V — Candidate 72e4d45 is NOT deployable over v92: verifier #37's F2b splice created a new fabrication regression that every green gate missed

**Verifier #38, campaign #98. Verdict: FAIL. Candidate `72e4d45e6a2469b1851e31cbf4084e09f78b53df`, index.ts sha256 `c2608b1e2836211b20fa5052e841966045b4f14be2b2c60194b6719cc80b5461`.**

### Provenance (stated at its real strength, not overstated)
Deployed `sem-ai-command` for `pvphxgrtdfrudejjhzjk`: **version 92**, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`, `updated_at`
2026-09-01T05:15:25.518Z — obtained by running `supabase functions list` myself.
`git cat-file blob c9dfab5bd433:…/index.ts` → sha256
`795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`, computed by me: the
claimed git-side value is **CONFIRMED**.

The deployed↔git link is **INTEGRATION-LEVEL, not byte-direct**. `supabase functions download`
was refused by a harness permission rule in this session, so I never hashed the deployed bytes
myself. The link rests on three facts I did establish: the deployed `entrypoint_path` is a
GitHub-Actions runner path (so v92 was deployed by CI, not from a laptop); commit `c9dfab5b` is
dated 2026-09-01T05:14:41Z and the deploy is **44.5 seconds later**; and v92's gate, read from
the git bytes, is exactly one whole-summary `PAST_COMPLETION_CLAIM_PATTERN.test(...)` with no
negation awareness — which is the behaviour the whole differential assumes. A future run that
can execute `functions download` should close this to byte-direct.

### V38-D2 (P1, FABRICATION REGRESSION vs deployed v92 — CREATED BY THIS COMMIT)
A completion claim whose auxiliary and participle are separated by a **parenthetical** is
**SHIPPED** by the candidate while deployed v92 **CORRECTS** it:

```
"ACME Corp was (per the approval granted last week by finance) archived."   v92=CAUGHT cand=SHIPPED
"Beta Corp has been (following the review completed yesterday) deleted."    v92=CAUGHT cand=SHIPPED
"Khan Bank was (once the transfer completed on Monday) restored."           v92=CAUGHT cand=SHIPPED
```

**Root cause.** Verifier #37's F2b splice, adopted verbatim at 72e4d45, changed the clause
mapper's parenthetical blank from a single space to a length-preserving one
(`(p0) => ' '.repeat(p0.length)`). That pushes the real aux→participle distance past v92's
`[^.]{0,30}` window, so `LEGACY_PAST_COMPLETION` no longer matches. v92 matches these because
its 30-char window reaches a completion word *inside* the parenthetical ("granted",
"completed", "approved").

**Measured, on a 2,400-string combinatorial sweep I generated:** reverting F2b changes **144**
verdicts, **all 144 on fabrication-shaped strings and 0 on truthful-negative-shaped strings**;
**72** are fabrications v92 corrects and the candidate ships. My permanent contract generates
200 such shapes and **200/200 ship**.

**This is new to this commit.** The previous candidate `395c438` CATCHES 5 of 7 spot-checked
shapes. The candidate is strictly worse than its predecessor on this class.

**F2b is nevertheless load-bearing and must not simply be reverted.** #37's justification shape
is real and I reproduced it: `"No problem the team flagged was (after the long review that found
nothing wrong at all) archived."` is v92=preserve, candidate=preserve, **F2b-reverted=DESTROYED**.
A plain revert trades 72 fabrications for real truth loss.

### V38-D1 (P2, disclosed residual — judged IRREDUCIBLE, refusal CONFIRMED)
`"No errors node.js was archived."` ships; v92 corrects it. The class is bounded: any comma,
period, dash or "and" between negator and name, or a Title-Case name, is caught — only a
**run-on with a bare lowercase entity name** escapes. It cannot be closed lexically: the minimal
pair is structural, not lexical —

```
"No errors node.js was archived."      FAB, must catch     <neg> <lc-noun> <lc-noun> <aux> <participle>
"No employee records were deleted."    TN,  must preserve  <neg> <lc-noun> <lc-noun> <aux> <participle>
```

I measured 12 truthful shapes of that exact form: the candidate preserves **12/12**, v92 destroys
**11/12**. Any rule promoting the second lowercase token to a new subject destroys all twelve.
**The session's refusal is correct**, and this is the floor of a regex belt.

### V38-S1 (P2, SUITE INTEGRITY) — an all-green gate set was again mistaken for proof of absence
`v92_parity_contract.mjs` is **46 passed / 0 failed** while V38-D2 is wide open. Its corpus holds
911 strings, of which **only 7 contain any parenthetical and none places a long parenthetical
between auxiliary and participle**. The property was never generated, so the suite could not
fail. This is the third consecutive round in which green suites coexisted with a real regression;
the missing property is stated below as a generated contract, not an enumerated corpus.

### Findings that CORRECT the session's own disclosures
- **Three shapes the session says it REFUSED to close are in fact CAUGHT** by this build:
  `"No errors ACME Corp was archived."`, `"No problem the log shows ACME Corp was archived."`,
  `"Not a single task moved — Bob Smith was removed."` (all v92=1, cand=1). The disclosure is stale.
- **`"No North Depot was archived."` is destroyed — but deployed v92 destroys it too** (both=1).
  The session's "indistinguishable from No Limits Inc" argument is sound, and this is **not** a
  deployability regression.
- **V31-F3b is still genuinely OPEN, not closed.** `NEGATED_CLAUSE` omits
  couldn't/wouldn't/shouldn't/won't. It is a real quality gap — but **0 truth regressions vs v92**
  (I tested 36 contracted-modal negatives; every one the candidate destroys, v92 destroys too, 21
  shared). The ledger should say "open, not a v92 regression", not "closed".

### Things I checked and found HONEST
- **Battery count.** 35 `.mjs` discovered, **35 exit 0**, measured from real child-process exit
  status (never a pipeline). = 29 substantive + 5 stubs that *announce* `SUPERSEDED` + 1 helper.
  The ledger's "34 executed / 0 failures" is honest. Generative suite 24/0.
- **CONTRACT 5's narrowing is honest and still able to fail.** My own mutation test: injecting a
  new **top-level** const into the belt turns it **RED (27/1)**; injecting a **local** inside
  `completionIsNegated` leaves it **GREEN**. It hides nothing real.
- **run15 57/0** and the D117 no-whole-span-lookaround invariant both confirmed.
- **run14/D107's window is not truncating.** The `readsAsCompletion` statement is 3650 chars
  against a 4000-char slice — spanned, with 350 chars of headroom. It fails loudly (`throw`) if
  the anchor is ever lost.
- **Re-pinned residuals are honest**: every `CLOSED` pin carries a paired real-name survival
  assertion, and I re-derived both directions on my own corpus (S3a/S3b) with 0 truth regression.
- **Ledger production shapes stay closed**: #64 D16, #65 D25, #65 D27 (production row 9dda919c,
  both arrow forms), #66 D40 — **0 open**.
- **Matcher**: 49 shapes + 16 declining replies. **0 wrong-intent regressions**; 16/16 negative
  replies DEAD-END; the 6 v92-DEAD-END→candidate-SELECT cases are all ordinal replies selecting
  the option the user actually named — correct intent, a documented post-v92 feature.
- **Deploy surface**: exactly one file (`sem-ai-command/index.ts`); identifier delta re-derived
  myself = **205 added, 0 removed** (strict superset); PCCP byte-identical to v92.
  Rollback target `c9dfab5bd433` is exact and available.

### V38-H1 (P3 hygiene, semantically inert — but it hides the real diff)
The candidate's committed blob flips the **entire file from LF to CRLF** (CR=5990, LF=5989,
CRLF=5989) and carries **one bare CR inside a `//` comment** at line 5719. `395c438` and
`f64b280` are CR=0; **72e4d45 introduced it**. It is inert at runtime (ES normalises CRLF and
bare CR to LF inside template literals — I executed that, and regex/string literals cannot span
lines), but the raw deploy diff becomes a whole-file rewrite (5989/4312) that masks the real
delta (**1730 insertions / 53 deletions**), and it shifts every byte offset the source-slicing
suites depend on.

### FIX PREPARED (index.ts NOT modified — read-only candidate this run)
`V38-FIX-1`, a **v92 parity backstop**, sentence-local:

```js
const readsAsCompletion = (s) => String(s).split(/(?<=[.!?])\s+/).some((q) =>
    LEGACY_PAST_COMPLETION.test(q) && !NEGATED_CLAUSE.test(q) && !/…hedge…/i.test(q))
  || REFERENCELESS_CONFIRMATION.test(s) || …unchanged…
```

It is a **structural invariant, not another lexical rule**: the backstop fires only where
deployed v92 already fires, so its truth-regression set vs v92 is empty **by construction**, and
`LEGACY_PAST_COMPLETION` is byte-identical to v92's PCCP (asserted). It is **sentence-local**
precisely so it does not become the whole-summary negation test that v32/v34/v36 forbid for good
reason — verified: 4/4 fabrications with a trailing benign negator sentence are still caught.

Measured: battery **0/35 nonzero**; v32 **101/0**, v34 **58/0**, v35 **56/0**, v36 **62/0**,
v37 **21/0**, v33 **92/1**, v30 **25/1**, v31 **33/1** — **exact parity with the candidate's own
baselines on every prior gate**; v38 regression additions **29/0**; the V38-C1 generated property
goes from **200/200 shipped to 0/200**. Files: `qa/verification/proposed/v38_prepared_fix.patch`,
builder `qa/verification/scratch/v38/build_fix.mjs`.

**Caveat, and it is the important one.** Applying it leaves only **107 characters** of headroom
under run14/D107's 4000-char slicing window. Verifier #32 already hit that trap at 102 chars.

### Judgment asked for: is the belt at the floor?
**Yes, and past it.** Three independent ceilings now bind simultaneously: the run14 slicing
window (107 chars left after one more rule), the D177 pin that forbids the natural formulation of
a whole-summary guard, and V38-D1's minimal pair which is structurally undecidable lexically.
Every round since #33 has been a verifier preparing the fix and the session adopting it, and this
round that pattern **introduced** a regression (F2b) rather than removing one. The next durable
gain is not another regex arm — it is making the fabrication decision against **structured
evidence** (the belt is explicitly the *fallback* for un-evidenced prose), and pinning belt
behaviour with **generated properties** instead of enumerated corpora.

### Regression added
`qa/verification/proposed/v38_regression_additions.mjs` — 29 checks, all CONTRACT/DEFECT, exits
nonzero on any failure, resolves index.ts via `SEM_INDEX_SRC` or by walking up from its own
location (correct from any cwd). **On the candidate it is RED (28 passed / 1 failed) on exactly
V38-D2**; on the prepared fix it is 29/0. Its V38-C1 contract generates the parenthetical
property the v92 parity corpus never contained.

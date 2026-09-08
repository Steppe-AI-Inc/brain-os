# v19 promotion note (campaign #79, verifier #19)

Candidate `d34af157baf801a7e0c25f4fead9cb3dd51e2bc0` (closure `be9d94f`), index.ts sha256
`d050db20004e3ed33c6aac59774256053a6b8b549f109f7435bc305b9b3fec30` — asserted at start, before
and after each of 14 temporary mutations, and at the end (unchanged).

**Verdict: FAIL.** D130/D132/D133 are genuinely closed for the shapes they name; D131's
residual is real but its "proven irreducible" framing is disproven for 5 of 9; and the D130 fix
introduced a P1 (D134) plus two new matcher seams (D135, D136).

## What to promote, in order

1. **`v19_known_failure_modes_entry_79.md` → append to `qa/KNOWN_FAILURE_MODES.md` verbatim.**
   It begins with `## #79 — …` and contains no dispatch preamble. Do not edit the numbers: every
   one of them is reproducible with the scripts named below.

2. **`v19_regression_additions.mjs` → `qa/scenarios-runner/run19_defect_closure_contract.mjs`
   AFTER the fixes land.** On the candidate it is 28 pass / 33 fail (0 CONTRACT failures); with
   the prepared fixes below it is 47 pass / 14 fail. Promoting it before a fix lands would make
   the battery permanently red, which is how a red battery stops meaning anything.

3. **Retire five pins when (and only when) the D131 rule changes.** `v19_regression_additions`'
   `D131.separableResidual.*` cases and `run18_defect_closure_contract.mjs`'s
   `D131.irreducibleResidual.*` pins for the same five strings are mutually exclusive **by
   construction**. If the belt is left as is, keep run18's pins and drop those five DEFECT cases
   to a documented residual instead — but then the ledger wording must change too, because
   "proven irreducible" is measurably false for them.

## Prepared fixes (FIX PREPARED — never applied; I have no write authority here)

Three edits, all inside code this closure already owns. Reproduce with
`node qa/verification/scratch/v19/s9_prepared_fixes.mjs` (it mutates, measures, restores and
re-asserts the sha):

* **F1 — D134 (P1).** index.ts:5518. Replace
  `!completionIsNegated(String(s).split(/[.!?,\x3b\n]/)[0])` with the clause that actually
  contains the matched completion word:
  `!completionIsNegated(String(s).slice(0, CONFIRMED_COMPLETION.exec(String(s)).index + CONFIRMED_COMPLETION.exec(String(s))[0].length).split(/[.!?,\x3b\n]|:\s/).pop())`.
  Keeps the whole-string match (so `"Confirmed — as requested, Restored Bob Smith."` stays
  caught) and restores the per-clause negation scope D117/D118 exist to enforce.
* **F2 — D135 (P2).** index.ts:439. Remove `no` from `ORD_FILLER`. `no. 2` is not accepted today
  anyway (`2.` and `2)` both dead-end), and admitting a negator is the one thing D116/D123 says
  this function must never do.
* **F3 — D136 (P3).** index.ts:444. Before returning an ordinal match, dead-end when some
  option's label — with its own `(option N)` suffix stripped — contains the normalised reply, so
  `"option 2"` against a company literally named "Option 2 Ltd" is treated as ambiguous.

Measured together on the candidate: `v19_regression_additions` **28 → 47 passing, 0 CONTRACT
failures**; committed battery **909 OK / 0 failures / 0 nonzero exits** (unchanged from
pristine).

## The D131 rule that disproves "irreducible" (R9b) — evidence, not a proposal to ship blind

`node qa/verification/scratch/v19/s1c_r9b.mjs`. Two edits:

* `completionIsNegated`: a negator that PRECEDES the completion verb disarms it only when no
  finite auxiliary/modal already occurred before the negator — unless a `that/which/who/whom`
  sits between the negator and the verb (a relative/complement clause is inside the negated noun
  phrase: run17/D128's own *"I did not find any record that Black and Decker Holdings was
  archived."*).
* the clause splitter: `and` / `but` / a spaced dash become boundaries **only when the token to
  their right is lowercase and is not an auxiliary**. Inside a real name that token is
  capitalised; in a VP coordination it is an auxiliary.

Result: 5 of the 9 pinned residuals caught, **0 of the 9 paired real names destroyed**, 0 new
false positives on a 61-case truthful-negative corpus, false negatives 15 → 4 on a 44-case
fabrication corpus, and the whole battery green except (a) the 5 pins that encode the residual
and (b) `run14/D107`, whose 500-character source-slicing window cannot span the longer statement
— a harness limit, not behaviour. **If R9b is adopted, widen that window rather than shortening
the predicate to fit it.** The remaining 4 residuals are genuinely hard (the separator is
followed by a capitalised token) and are pinned as an open, disclosed residual.

## Things the next session must NOT read as verified

* **DB/RLS/lifecycle truth — BLOCKED.** `npx supabase db query --linked` is permission-gated in
  this process; the 60+ `*.sql` suites were not run.
* **UI truth and live AI-chat truth — BLOCKED.** No browser/MCP tooling in this session type.
* **`deno check` — NOT INDEPENDENTLY VERIFIED.** `deno` is gated here.
* **Production is untouched and unchanged**: `sem-ai-command` v92, ezbr_sha256
  `33255b31…4fe475`, identical to #75–#78. Nothing in D58–D138 is live.

## Bookkeeping corrections to carry forward

* The battery is **30 `.mjs` = 1 library + 5 SUPERSEDED stubs + 24 assertion-bearing**, not 29.
  The "29" is a pre-change count adopted after the same commit added a suite — the third
  consecutive generation of the identical error. Count from the filesystem AFTER the change.
* `index.ts:5507-5509` claims a SPACED-DASH clause boundary that does not exist in the shipped
  splitter, using an example (`"No problem — ACME was archived"`) that the same commit's ledger
  entry lists as an uncaught residual. Fix the comment in whichever direction the code goes.
* `index.ts:5490-5492`'s present-tense claim is true only of `COMPLETION_VERB`;
  `EXECUTION_IN_PROGRESS` still fires on bare `is archived` (D137).
* `CURRENT_CAMPAIGN.json` should carry `base_commit` (the actual candidate SHA) from dispatch,
  not only `closure_commit` — a resumed run cannot otherwise tell whether prior evidence is
  still trustworthy.

## Reproduction map (all under `qa/verification/scratch/v19/`)

| scenario | script | what it proves |
|---|---|---|
| 0 | `s0_d130_both_directions.mjs` | 62 truthful negatives × 45 fabrications × 6 revisions; D130 closed, D134 found |
| 0b | `s0b_confirmed_arm.mjs` | sizes D134 at 12/12 new, and its single compensating gain |
| 0c | `s0c_gate_harm.mjs` | D134's founder-visible harm through the REAL gate, both correction paths |
| 1 | `s1_d131_irreducibility.mjs`, `s1b_r9_failures.mjs`, `s1c_r9b.mjs` | disproves "irreducible" for 5 of 9 |
| 2 | `battery.mjs` | 30 files, 24 assertion-bearing, 909 OK, 0 failures from output text |
| 3 | `s3_mutation.mjs` | 10 required mutants, 10 killed |
| 4 | `s4_matcher_e2e.mjs`, `s4b_ordinal_precedence.mjs` | D132/D133 closed; D135/D136 found |
| 5 | `s5_prior_closures.mjs` | prior contracts hold; the D117/D118 CLASS does not |
| 6 | `s6_question_belt.mjs` | question belt byte-identical + 0 behavioural divergence across 6 revisions |
| 7 | `s7_lexical_branch.mjs` | founder-directed lexical matrix, 24 words × 7 branches; D138 found |
| 8 | `s8_bookkeeping.mjs` | every postscript/comment claim checked against code and filesystem |
| 9 | `s9_prepared_fixes.mjs` | F1+F2+F3 close 19 defects with the battery still green |

Supporting: `x.mjs` (my extractor), `gate.mjs` (real gate driver), `mutate.mjs` (mutation +
SHA discipline), `battery.mjs`. Baseline sources `index_{fbafded,a559f8f,9535f0b,52e830f,d724d8c}.ts`
are `git show` copies, kept so the cross-revision numbers can be re-run without network access.

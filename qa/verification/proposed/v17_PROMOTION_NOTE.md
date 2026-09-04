# v17 promotion note (campaign #77, verifier #17) — NOT part of the ledger entry

Keep this file out of `qa/KNOWN_FAILURE_MODES.md`. The ledger section is
`v17_known_failure_modes_entry_77.md`, which begins at `## #77 — …` with no preamble.

## Verdict

**FAIL** on candidate `9535f0b4d094570ac871c3ec85b78830324b03bc`
(closure commit `f232975`), index.ts sha256
`e5ccf63b26b833f4cc5d9596e7417d7b5744bef6be919982740b1c4f165b6d69`.

D123, D124 and D126 are genuinely closed and well made. D125 closed the false-negative
direction and reopened the false-positive one (**D128, P1**). Two smaller findings
(**D127 P2**, **D129 P3**) and one coverage gap.

## What to do with these files

| file | action |
|---|---|
| `v17_known_failure_modes_entry_77.md` | append verbatim to `qa/KNOWN_FAILURE_MODES.md` as `## #77`, no edits, no preamble |
| `v17_regression_additions.mjs` | promote to `qa/scenarios-runner/run17_defect_closure_contract.mjs` **after** D127/D128/D129 are closed, flipping the DEFECT expectations to FIXED as run15/run16 did. Until then it belongs where it is — it exits 1 by design. One closure edit is needed on promotion: the `SEM_INDEX_SRC` fallback resolves `../../../supabase/...` from `proposed/`; one directory up it becomes `../../supabase/...` |
| `qa/verification/scratch/v17b_*.mjs` | my working harnesses (lib, battery, s0/s0b/s3/s3b/s4/s6/s7/s8/s9, mutate, mutate2, m4 fuzz). Kept as evidence; not intended for promotion |

## Do NOT deploy

Production is `sem-ai-command` **v92**, ACTIVE, `ezbr_sha256`
`33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475` — self-verified
read-only this run. None of D58–D129 is live. This candidate must not go to production
with D128 open: it would trade 15 caught fabrications for ~75% of truthful negatives about
any entity whose name contains "and"/"but"/"without"/a dash/a parenthesis, and by this
project's own recorded standard (index.ts:5362) that is the worse trade.

## Suggested closure order

1. **D128 (P1)** — blocking. Fix shape: narrow or remove the `\s+(?:and|but|without)\s+`
   arm; acceptance test `D128.rateVsPrior`; LIMIT `D128.hold.newFabricationsStillCaught`
   so the fix does not simply revert D125. Add a REAL-ENTITY-NAME false-positive corpus to
   the belt suite permanently — the battery has never had one, which is why `or` as a new
   boundary is still caught by no suite (`D128.coverage.orIsNotYetABoundary`).
2. **D127 (P2)** — either scope `SELECTION_FILLER`'s verbs to the pending action's own
   family (which is what the comment and the #76 postscript already claim it does), or
   extend `RESTORE_VERB_PATTERN` with `activat(e|ed|ing)` and drop the entity-type nouns
   that flip the target. Correct the comment either way — right now it describes a rule the
   code does not implement.
3. **D129 (P3)** — shape-scoped only (`(option N)` / `option N` / `#N`). Never add bare
   digits to the allowlist; `D129.hold.bareDigitStillDeadEnds` pins that.
4. **Coverage** — keep `D123.coverage.secondOptionGuardOnTieBreakPath`; the guard is nearly
   vacuous (unreachable-as-true on two of three paths) but not actually so.

## Coverage this campaign could NOT provide

- **UI truth: BLOCKED.** No browser/MCP tooling in this process.
- **Live AI-chat truth: BLOCKED.** Same reason; and nothing is deployed to test against.
- **DB/RLS/lifecycle truth: OUT OF SCOPE.** The 60 `*.sql` suites were not run.

These are real coverage gaps, not passes.

## Artifacts / synthetic data

No `QA-VERIFY-*` production data was created — this campaign is source-level and
behavioural, executed entirely in-process against extracted slices of `index.ts`. Nothing
to clean up in the database. The only writes were to `qa/verification/**` on the artifact
branch `verify-9535f0b-campaign77`, plus 28 temporary in-place mutations of `index.ts`,
every one of them restored byte-for-byte with the sha256 re-asserted immediately after
(final observed sha matches the required value).

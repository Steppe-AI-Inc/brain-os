# v20 promotion note (campaign #80, verifier #20)

Everything here is promotion/dispatch bookkeeping. **None of it belongs in
`qa/KNOWN_FAILURE_MODES.md`** — promote `v20_known_failure_modes_entry_80.md` verbatim,
starting at its `## #80` heading, with no preamble.

## Artifact naming deviation (deliberate)

The launch prompt asked for `v19_known_failure_modes_entry_79.md` /
`v19_regression_additions.mjs` and a `## #79` heading. Those already exist as **verifier
#19's committed artifacts**, and the ledger already contains a `## #79` entry. Writing them
again would have overwritten a prior verifier's evidence and produced a duplicate heading.
This campaign is #80 / verifier #20, so the artifacts are `v20_*` and the heading is `## #80`.

## What to promote

| Artifact | Destination |
|---|---|
| `v20_known_failure_modes_entry_80.md` | append verbatim to `qa/KNOWN_FAILURE_MODES.md` |
| `v20_regression_additions.mjs` | promote to `qa/scenarios-runner/run20_defect_closure_contract.mjs` **only after** D139/D142/D144 are fixed — it exits nonzero by design today |

Do **not** add `v20_regression_additions.mjs` to the green battery while its 30 DEFECT cases
still fail; it is a verifier artifact until the defects close, exactly as v13–v19 were.

## Verdict inputs (classified from OUTPUT TEXT, never exit codes)

* `v20_regression_additions.mjs` → `102 cases: 72 passed, 30 failed` (30 DEFECT by design,
  **0 CONTRACT failures**), exit 1 by design.
* Committed battery → `SUITES: 31   OUTPUT-TEXT FAILURES: 0`, 0 nonzero exits, 7 stubs.
* `*.sql` suites → NOT RUN (no DB session; no production write authority).
* Production → `sem-ai-command` v92, `ezbr_sha256 33255b31…`, unchanged since #75.

## SHA discipline

`6407d95cc846e638d1229559b2622323072028876c8844ce2b1045eade050a6c` asserted at start, after
every temporary in-memory mutation, and at end. All mutation testing was done on **extracted
copies in memory**; `supabase/` was never written to (`git status --porcelain supabase/` empty
throughout the run).

## Measured fix directions (measurements, not patches — nothing was applied)

* **D139** — reverting only the third disjunct `!NEGATION_AUX.test(c.slice(0, n))` to `true`
  restores all 18 destroyed truthful negatives and changes nothing else on the targeted probe
  set. That re-opens the 5 D131 fabrications R9b bought, so the better direction is the
  measured **R-ZR2** rule below, which gets both.
* **R-ZR2 (name-safe clause linker)** — 0/75 truthful destroyed, 0 fabrication coverage lost,
  all 5 D131-separable fabrications still caught, all 9 paired real names intact. Measured in
  `qa/verification/scratch/v20/s1_out.txt`.
* **R-IDIOM** — additionally catches 2 of the 4 remaining D131 pins with 0 collateral, so the
  documented residual is 2, corpus-relative.
* **D142** — apply D136's existing ambiguity dead-end to the label path: dead-end when the
  label strip leaves the command empty **and** the raw command is an opposite-family verb.
  All D138 limit cases stay green under that rule (pinned as CONTRACT in the regression file).

## Evidence files (scratch, this campaign)

`qa/verification/scratch/v20/` — `reconfirm_out.txt` (independent D139 re-derivation +
hand-transcription cross-check, 0 mismatches), `s0_out.txt` (75 truthful / 50 fabrications ×
7 revisions), `s1_out.txt` (D131 irreducibility disproof), `s3_out.txt` + `s3b_out.txt`
(mutation testing; s3b corrects s3's own probe gap on the D132 guard), `s3c_out.txt` (negator
lexicon across 7 revisions), `s4_out.txt`/`s4c_out.txt` (D132/D133/D138 end-to-end),
`s56_out.txt` (question belt + prior-closure contracts), `s7_out` (founder lexical branch,
24 completion-word company names), `s7b_out.txt` (`safeOptionLabel` is pre-existing, 0 drift),
`battery_out.txt`, `diff_d34_b32.txt`, `v20_reg_out.txt`.

## Self-correction on the record

My first mutation pass reported 5 "vacuous" guards. Re-probing showed **4 of the 5 were my own
probe gap**, not vacuous code — in particular the D132 `hasOwnProperty` guard is load-bearing
(15/15 prototype-key probes throw without it). Only the ordinal range check is genuinely
subsumed, and it is harmless. The corrected result is what the ledger entry carries.

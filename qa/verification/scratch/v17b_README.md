# verifier #17 / campaign #77 — scratch harness index

`v17_*.mjs` are from an **interrupted first attempt** of this same process (same base commit
`9535f0b`, same index.ts sha). They are kept as evidence but nothing in the #77 report rests
on them — every result was re-derived from scratch with the `v17b_*` harnesses below.

`v17b_*` is the set the report actually cites. All of it is my own; none of it is
`qa/verification/proposed/v15_mutation_proof.mjs` or `v16_mutation_proof.mjs` (the
implementing session's harnesses), and none of it reuses run15/run16's factories.

| file | what it does |
|---|---|
| `v17b_lib.mjs` | my extraction library: slices `matchDisambiguationOption`, `readsAsCompletion` + its regex deps, and the full option-gating pipeline (label loop + D119 drop + D95 numbering) out of the real `index.ts`, pinned on product literals, with my own TS strip |
| `v17b_smoke.mjs` | proves the extraction executes the product before anything is claimed from it |
| `v17b_battery.mjs` / `_result.json` / `_table.mjs` | enumerates the `.mjs` suites FROM THE FILESYSTEM, runs all, records exit code AND failure count parsed from OUTPUT TEXT |
| `v17b_stubcheck.mjs` | separates real SUPERSEDED stubs from suites that merely use a `PASS`-style output convention |
| `v17b_s0.mjs` | scenario 0 — 289-probe three-way A/B of the clean-selection rule, mis-bind and over-refusal directions |
| `v17b_s0b.mjs` | scenario 0 end-to-end: matcher + `commandContradictsActionType` + `resolveClarificationField`, so a mis-bind is reported as the destructive field it actually arms |
| `v17b_s3.mjs` / `v17b_s3b.mjs` | scenario 3 — the completion belt in both directions; `s3b` attributes the new false positives to specific boundary tokens over a 130-case realistic corpus |
| `v17b_s4.mjs` | scenario 4 — `CANONICAL_TYPE_ALIAS` + the D119 drop, incl. prototype-key entityTypes and fabricated-label reachability |
| `v17b_s6.mjs` | scenario 6 — D72/D78/D95/D103/D113 case-level PASS/FAIL from output text, plus a re-pin grep |
| `v17b_s7_question.mjs` | scenario 7 — question-belt byte-identity across three SHAs plus behavioural A/B |
| `v17b_s8.mjs` | scenario 8 — the founder-directed lexical-branch scenario, label branch and prose branch |
| `v17b_s9.mjs` | scenario 9 — ledger and `CURRENT_CAMPAIGN.json` claims checked against the code |
| `v17b_mutate.mjs` / `v17b_mutate2.mjs` | my 20 + 8 mutant battery. Mutates the REAL `index.ts` in place; pristine bytes restored and sha256 re-asserted after EVERY mutant in a `finally`. Round 2's mutants all preserve the pinned literals so a catch must be behavioural |
| `v17b_m4.mjs` | differential fuzz (4,942,140 combinations) proving the surviving mutant M4 is *nearly* but not actually a vacuous guard |
| `v17b_idx_52e830f.ts` / `v17b_idx_d724d8c.ts` | the two baseline sources, extracted with `git show` |
| `v17b_ckpt.mjs` / `v17b_finalize.mjs` | checkpoint writers for `CURRENT_CAMPAIGN.json` |

Reproduce the whole campaign: run each `v17b_s*.mjs`, then `v17b_battery.mjs`, then
`v17b_mutate.mjs` and `v17b_mutate2.mjs` (these two write to `index.ts` and restore it —
they abort if the starting sha is not
`e5ccf63b26b833f4cc5d9596e7417d7b5744bef6be919982740b1c4f165b6d69`).

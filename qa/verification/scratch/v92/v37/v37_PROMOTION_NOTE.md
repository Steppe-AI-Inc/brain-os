# Verifier #37 — promotion note (campaign #97, candidate 395c438 vs deployed v92)

**Verdict: FAIL — EDGE STATUS = NOT DEPLOYMENT READY.** Candidate index.ts sha256
`ba50feff078716f829c9e9cf69a19a59fa003fdbe6de4fa799119cd1de0b4b04`, untouched (asserted before/after every in-memory
mutation and at the end). Nothing written to production.

## What to promote
1. `qa/verification/proposed/v37_regression_additions.mjs` → `qa/scenarios-runner/` (battery member). RED on the candidate
   on purpose (18/3: V37-F1, V37-F2, V37-F3); green on the prepared fix43 (21/0). Self-contained; `SEM_INDEX_SRC` or
   walk-up path; exits nonzero on any failure.
2. `qa/verification/proposed/v37_known_failure_modes_entry_98.md` → append to `qa/KNOWN_FAILURE_MODES.md`.
3. If adopting fix43: `qa/verification/scratch/v37/build_fix43.mjs` rebuilds it from the pristine candidate with per-splice
   skip (`FIX43_SKIP=F1|F2a|F2b|F3`); `fix43_proof.mjs` is the proof (4/4, builder byte-identical). **Run `deno check`
   first — it was gated in this session.** If superseding it, measure the alternative on `v37_corpus.mjs` +
   `probe_f1f2.mjs` + `idiom_fix_compare.mjs` in both directions before adopting.
4. Add the three missing generative properties (subject–predicate interposition in v92-preserved forms; transformation
   invariance across token-internal periods / >30-char parentheticals; idiom × first-person/progressive) to
   `belt_generative_adversarial_contract.mjs`.
5. Correct the stale disclosures: the three "refused" shapes are caught; the run30 dash strip was not dead; the collapse
   window is not byte-exactly v92's; `scratch/v92/v92.lf.ts` is CRLF.

## Evidence table
| Check | Result |
|---|---|
| Preflight | EXECUTION_READY (HEAD 395c438, probe write ok, regex suite 13/0 by output text) |
| Provenance | INTEGRATION-LEVEL: live v92 ezbr `33255b31…` @ 1788239725518 == value recorded at download; git c9dfab5bd433 index.ts `795c20c8…` ✓; scratch copy == git blob after CR strip ✓; `functions download` permission-gated |
| Deploy surface | only `sem-ai-command/index.ts`; 51 hunks +1729/−52 (LF); 216 identifiers added / 0 removed; candidate CRLF |
| Own corpus | 987 T / 488 F: truth regression 5 (1 F1 + 4 F2, one ungrammatical), fab regression 2 (ambiguous unquoted titles, refusal confirmed) |
| Negator-name / title section, both directions | 20 names × (6 F + 10 T) + 7 titles × (4 F + 5 T): 0 truth regressions; 2 fab regressions (unquoted titles) |
| Generative F1 / F2 | 1026/1026 truths destroyed (fabs 608/608 still caught) / 140/180 truths destroyed |
| Matcher | 35 shapes: 0 regressions, 5 improvements |
| Attribution | F1 present at 4476c92 and every later SHA; F2 period arm from f64b280, parenthetical arm from 0f96ff9; F3 created at 395c438 |
| Mutation (own) | 17 load-bearing, 2 candidate-only, 8 not observable on my rows (listed in the entry) |
| Idiom deadness | NOT dead: re-adding changes 115/2288 (first-person + progressive tails); 0 v92-corrected fabs affected |
| Battery (per-process exit) | 34 suites / 0 nonzero on candidate; 34 / 0 on fix43 (seeded temp tree incl. web/) |
| #30 / #31 / #32 / #33 / #34 / #35 / #36 gates | PASS / 33/1 (stale F3b pin) / 101/0 / 92/1 (D188) / 58/0 / 56/0 / 62/0 — identical on fix43 |
| Generative suite | 18/0 on both; generated none of F1/F2/F3 |
| CONTRACT 5 / run14 / run15 / D117 | narrowing sound (extractor brace-aware, coverage both ways) / window 4000 ≥ 3170 (fix43 3652) / 57/0 / intact |
| D16 / D25 / D27 (9dda919c) / D40 | closed (parity 46/0 + own harness: rename arrow corrected, claims:[] corrected, no amnesty identifier) |
| Rollback | c9dfab5bd433 on origin/master; roll back from git (scratch copies are CRLF) |
| deno check | BLOCKED (gated) |
| Browser / live AI | not in scope for this byte-level differential; no UI/AI-chat truth check was performed (real coverage gap, stated) |

## Scratch artifacts (`qa/verification/scratch/v37/`)
`v37_harness.mjs`, `v37_corpus.mjs`, `v37_measure.mjs` (+ result json), `v37_matcher_differential.mjs`, `probe_f1f2.mjs`
(+ result json), `trace.mjs`, `attribution.mjs`, `mutations.mjs`, `mutations_extra.mjs`, `idiom_deadness.mjs`,
`idiom_breakdown.mjs`, `idiom_fix_compare.mjs`, `identifier_delta.mjs` (+ json), `v92_to_cand.diff`, `v92.lf.ts` (LF in the git blob == c9dfab5bd433's index.ts; a Windows
checkout with `core.autocrlf` re-adds CRs — hash the blob or strip CRs, never trust a checked-out copy's bytes),
`run_battery.mjs` (+ logs), `run_battery_on.mjs`, `run_scratch_gates.mjs`, `run_on.mjs`, `build_fix43.mjs`, `fix43/index.ts`,
`fix43_proof.mjs`.

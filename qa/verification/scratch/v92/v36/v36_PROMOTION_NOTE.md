# Verifier #36 — promotion note (campaign #96, candidate f64b280 vs deployed v92)

**Verdict: FAIL — EDGE STATUS = NOT DEPLOYMENT READY.** Candidate index.ts sha256
`a01c8e1a41c8f06dac84c8acf178832d922a2704e911a64056a56e5e600ede0b`, untouched.

## What to promote

1. `qa/verification/proposed/v36_regression_additions.mjs` → `qa/scenarios-runner/` (battery member).
   RED on the candidate on purpose (55/7); green on the prepared fix40 (62/0). Keeps the seven classes closed.
2. `qa/verification/proposed/v36_known_failure_modes_entry_97.md` → append to `qa/KNOWN_FAILURE_MODES.md`.
3. If the implementing session adopts fix40: `qa/verification/scratch/v36/build_fix40.mjs` rebuilds it from the
   pristine candidate with per-splice skip (`FIX40_SKIP=A|B1|B2|C1|C2|D|E`); `fix40_mutation_proof.mjs` is the
   proof (7/7, builder output byte-identical to `fix40/index.ts`). Re-run `deno check` before deploy — it could
   not be run here.
4. Remove the two dead idiom replaces (the run30 dash-form strip and its lexicon widening) — 0 re-open, 0 truth
   cost measured in `idiom_deadcode.mjs`; keep only the D181 determiner-led strip (with the C2 gate).

## Evidence table

| Check | Result |
|---|---|
| Preflight | EXECUTION_READY (HEAD f64b280, probe write ok, PCCP regex suite 13/0 by output text) |
| Provenance | INTEGRATION-LEVEL: v92 ezbr `33255b31…` @ 2026-09-01T05:15:25.518Z == GH run 33472871764 headSha c9dfab5bd433 @ 05:15:30Z; git c9dfab5bd433 index.ts sha256 `795c20c8…` ✓; download permission-gated |
| Deploy surface | only sem-ai-command/index.ts; 51 hunks +1729/−52 (LF); 190 identifiers added / 0 removed; blob CRLF since 4de63e4 (P3 disclosure) |
| Own corpus | 893 T / 680 F: truth regression 0; fab regression 3 (2 disclosed ambiguous-title, 1 = V36-F5) |
| Negator-name section, both directions | 140 fab / 200 truth names + 28 / 35 titles: 0 truth regression; 2 fab regressions (unquoted-title residual) |
| Matcher | 40 shapes: 0 regressions, 20 improvements |
| Targeted attacks | V36-F1..F4 truth regressions (created: F1, F2; pre-existing: F3, F4); V36-F5..F7 fab regressions (created: F5; pre-existing: F6, F7) |
| #30 probe / #31 / #32 / #33 / #34 / #35 suites on candidate | PASS / 32/2 / 101/0 / 92/1 (D188) / 58/0 / 56/0 |
| Same on fix40 | PASS / 33/1 (stale F3b pin) / 101/0 / 92/1 / 58/0 / 56/0 |
| Battery (per-process exit codes) | 35 files / 0 nonzero on candidate AND on fix40 (34 suites + helper; 5 SUPERSEDED; 29 substantive) |
| Generative suite | 17/0 candidate; P13 fails 7914f2b & 6774b52, P14 fails 567cbd2 & 0f96ff9 (non-vacuous) |
| #35 builder mutation proof | 7/7, full build byte-identical to candidate |
| Own mutation test of run30–35 fixes | 8 load-bearing / 2 dead (idiom widening; hedge blanking on my shapes) |
| Idiom dead-code | widening 0/3 re-open; whole dash-form strip 0 re-open; D181 strip load-bearing (1) |
| CONTRACT 5 | top-level referenced const → 7/10 suites fail; local → 10/10 green |
| run14 window / run15 | 4000 ≥ 3253 statement; 57/0, D117 pin intact |
| Ledger #64 D16 / #65 D25 / #65 D27 / #66 D40 | closed (own pins + 28/0 + prior suites) |
| Rollback | c9dfab5bd433 on origin/master; scratch index.v92.ts is CRLF — roll back from git |
| deno check | BLOCKED (command gated in this session) |
| Browser / live AI | not in scope for this differential (belt is measured on real bytes end-to-end at the decision window) |

## Scratch artifacts (all under `qa/verification/scratch/v36/`)
`v36_harness.mjs`, `v36_corpus.mjs`, `v36_measure.mjs` (+ `v36_measure_result.json`), `v36_matcher_differential.mjs`,
`probe.mjs` + `attacks_*.json`, `run_battery.mjs` (+ `battery_result.json`), `run_scripts.mjs`, `hist_builds.mjs`,
`crlf_history.mjs`, `probe_crlf.mjs`, `index_diff.mjs`, `contract5_probe.mjs`, `idiom_deadcode.mjs`,
`v36_mutations.mjs`, `build_fix40.mjs`, `fix40/index.ts`, `fix40_mutation_proof.mjs`.

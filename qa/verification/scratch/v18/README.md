# verifier #18 / campaign #78 — evidence

Base `fbafded912e0fef7ddc7d5119308df8ab8be72e9`, index.ts sha256
`cf4b6f4defe9b5ed72cee29b08c4e2731651fac0d080f3ba30e1ed601e056deb` (observed at the start,
after every one of 14 temporary source mutations, and at the end).

Everything here executes the REAL product source. Nothing reimplements a predicate — that
is the vacuous-test class this ledger has recorded repeatedly. The extractors are my own,
written for this campaign; `_gate_extract.mjs` and the run8–run17 harnesses belong to the
implementing sessions and are deliberately not reused.

| file | what it is |
|---|---|
| `v18_belt.mjs` | my statement scanner + builder for the REAL `readsAsCompletion` out of any revision |
| `v18_matcher.mjs` | builder for the REAL `matchDisambiguationOption` + contradiction guard + field resolution |
| `v18_gate.mjs` | builder for the REAL option gate (D119 drop + D95 numbering) |
| `s0_order_rule.mjs` | scenario 0 — 327 truthful negatives / 56 fabrications, four revisions |
| `s0b_order_rule_deep.mjs` | scenario 0b — the two classes the ORDER rule creates, isolated (25 A-class / 20 B-class) |
| `s1_battery.mjs` | scenario 1 — the full battery from the filesystem, exit code AND output-text failure count |
| `s2_mutation.mjs` | scenario 2 — my own 14-mutant battery, baseline-differential kill rule, sha asserted around every edit |
| `s3_scoped_filler.mjs` | scenarios 3 + 4 — the scoped filler and the D95 numbering seam, driving the real matcher |
| `s6_belt_diffs.mjs` | scenario 6 — completion-belt and question-belt block hashes + driven question belt across four revisions |
| `s7_lexical_branch.mjs` | scenario 7 — the founder-directed lexical-branch scenario, label branch and three prose frames |
| `crosscheck_claims.mjs` | verifies every per-case CLAIM in `v18_regression_additions.mjs` against the baseline belts (30/30) |
| `verify_entry_numbers.mjs` | verifies every number quoted in the ledger entry |
| `mk_mutants.mjs` | regenerates `index_M10.ts` / `index_M12.ts` and shows what those two surviving mutants actually do |
| `diff_9535f0b_a559f8f.txt` | the whole candidate diff — three code sites plus comments |
| `names_probe.sql` | prepared but **NOT RUN**: `npx supabase db query --linked` is permission-gated in this process |
| `index_<sha>.ts` | baseline sources, regenerate with `git show <sha>:supabase/functions/sem-ai-command/index.ts` |
| `cp0/cp1/cp2.json`, `checkpoint.mjs` | the checkpoint patches merged into `qa/verification/CURRENT_CAMPAIGN.json` |

Run from the repository root, e.g. `node qa/verification/scratch/v18/s0b_order_rule_deep.mjs`.

**Harness self-correction worth knowing about:** the first version of `s2_mutation.mjs`
decided "a suite failed" by matching `/FAILED/i` anywhere in its output, and was fooled by a
CONTRACT description containing the word *failed* (`run11`: "a failed head-count query").
That made three suites appear to kill all 14 mutants and reported **0 survivors** — a
vacuous mutation proof. The committed version uses a baseline-differential rule and finds 3
real survivors. If you write one of these, take the baseline first.

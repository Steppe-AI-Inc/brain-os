# Verifier #49 (campaign #109) tooling — candidate 894c9583 / index.ts b54c0d65…

All read-only against the candidate; nothing here edits index.ts (sha asserted at start and end, unchanged).

| file | purpose |
|---|---|
| `bytes.mjs` | sha256 / line-ending facts for candidate, git c9dfab5bd433 and the committed download copy |
| `find_bare_cr.mjs` | locates the single bare CR (line 5747, inside a `//` comment) |
| `harness.mjs` | MY model of the candidate decision (LIFECYCLE byte-identical to v92 → FUTURE + shipped D4 guard → belt via `buildGate`) with a `pendingAction` turn switch; self-checks fail if any arm is unmodelled |
| `corpus.mjs` | 691 rows (418 T / 273 F) in labelled sections A/B/C/D/E/F/G(pendingAction)/H/K/W/L(long) |
| `differential.mjs` | four-quadrant v92-vs-candidate report; `--empty` for the empty pack; `--verbose` |
| `matcher.mjs` | 44 disambiguation shapes, v92 vs candidate `matchDisambiguationOption` |
| `mutation5.mjs` | revert each of the five 2b04857 fixes and measure; D5 also by timing |
| `battery.mjs` / `battery.log` / `battery.json` | every `qa/scenarios-runner/*.mjs` as its own child |
| `gates.mjs` | standing verifier gates v30/v31/v42/v46/v47/v48 |
| `probe_d3.mjs`, `probe_neither.mjs` | D3 fabrication-direction probe; the two-negator-name leak |
| `run_with_src.mjs` | run any tool against another index.ts (used for 27bd9f0) |
| `index.27bd9f0.ts` | the prior candidate, for inherited-vs-new attribution |
| `v92_to_cand.diff` | `git diff --ignore-cr-at-eol c9dfab5bd433 HEAD -- supabase/functions/` |
| `v48_entry_118_from_ccaa1ae.md` | #48's ledger entry as committed on its artifact branch |

Run from the repo root: `node qa/verification/scratch/v49/differential.mjs [--empty]`.

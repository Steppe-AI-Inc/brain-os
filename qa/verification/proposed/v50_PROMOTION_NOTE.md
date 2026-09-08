# Verifier #50 (campaign #110) — promotion note for candidate 2f11ee1a

**Verdict: FAIL — EDGE STATUS = NOT DEPLOYMENT READY.** Production stays v92 (git c9dfab5bd433, index.ts
`795c20c8…`, confirmed byte-direct by download this run). Rollback target exact and available.

## What to promote from this run (artifact branch `verify-2f11ee1-campaign110` only)

| artifact | purpose | status on 2f11ee1a |
|---|---|---|
| `qa/verification/proposed/v50_regression_additions.mjs` | CONTRACT/DEFECT suite; any failure exits non-zero; `SEM_INDEX_SRC` / `V92_INDEX_SRC` or find-up; path-independent | **11 passed / 5 failed** (5 DEFECT rows red by design); 6/10 on 894c958 (non-vacuous) |
| `qa/verification/proposed/v50_known_failure_modes_entry_118.md` | ledger entry `## #118-V — VERIFIER #50 …` | ready to append to `qa/KNOWN_FAILURE_MODES.md` after #117 |
| `qa/verification/scratch/v50/` | my corpus (1,103 rows), harness (evaluates the SHIPPED consumers), differential, class sizing, 7-component mutation proof, matcher, perf/EOL probe, battery runner, v30 A/B, read-only DB probes, deployed-bytes download in an isolated cwd | all logs committed beside the scripts |

Naming: the brief's literal `v48_*` filenames are verifier #48's existing artifacts and a live battery gate
(`v48_regression_additions.mjs` = 58/0); they were NOT overwritten. This run's files are `v50_*`.

## Open deploy blockers (must close before the next verifier round)

1. **V50-D1 (P1 truth)** — pendingAction-turn history recounts beyond the marker list: 64/105 destroyed, v92 preserves all.
   Dominant fix under the per-class rule: restore `!result.pendingAction` on both belt consumers (cost = v92 parity on
   undated fabrication + question). If the gains are kept instead, exempt question-terminated summaries on pendingAction
   turns — and measure on a corpus that was not already green.
2. **V50-D2 (P2 fabrication, introduced class)** — ASCII hyphen / `and` / `but` before a first-person completion after a
   conditioned offer ships; v92 destroys the whole.
3. **V50-D3 (P2/P3 fabrication, INTRODUCED THIS ROUND)** — claim straddling char 4,000 ships at 11/29 offsets; overlap
   the floor (`slice(4000 - 64)`).
4. **V50-D4 (P2 truth)** — `"Let me delete the task — is that ok?"` destroyed; guard vocabulary needs `is that ok/okay`.

## Record corrections to apply in CURRENT_CAMPAIGN.json / ledger

- `v30`: "25/1 non-blocker" → **crashes unpatched** (`ReferenceError: knownEntityNames` in its own builders; the D3
  cursor advance makes the latent reference unconditional); **25/1 with an empty Set injected** at its two body sites.
  Harness fix, not a candidate defect — but the unpatched gate no longer prints the recorded number.
- `crlf`: "6017/6017" → 6,015 CRLF over 6,016 lines, 0 bare LF, 1 bare CR (comment, line 5745).
- "G-PA-T 0/16 regressions" is true of #49's sixteen rows and false of the class.
- `open_not_blocking` item on `chat_channel_state`: now measured — `202609020001` applied, table exists, 0 rows;
  LIVE on deploy.

## Re-derived gate numbers (this run, from the filesystem, child exit statuses)

battery 38 suites / 36 exit-0 / 2 DB machine tests red by design; run15 57/0; run19 62/0; run28 117/0;
v92_open_regression_contract 28/0; v92_parity_contract 46/0; v31 32/2; v42 11/2; v47 43/9; v46 33/3; v48 58/0; v49 16/0;
deno 23 == baseline; #49 differential populated CLEAN / empty = B-F 27, D-T 1, E-F 1 exactly.

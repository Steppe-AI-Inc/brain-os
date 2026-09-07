# v49 PROMOTION NOTE — candidate 894c9583 (index.ts b54c0d65…) vs deployed v92 (c9dfab5b, 795c20c8…)

**Verdict: FAIL. EDGE STATUS = NOT DEPLOYMENT READY. Production stays v92; rollback target c9dfab5bd433 is exact and in-repo.**

Verifier #49, campaign #109, independent worktree, no write authority on the implementation branch. Artifacts on
`verify-894c958-campaign109`. Note: the launch prompt named the outputs `v48_*`; those names are the IMPLEMENTING
session's evidence files (`v48_regression_additions.mjs` is its 58-check suite), so mine are `v49_*` to avoid
clobbering them.

## What I measured (all re-derived, none restated)

| Measure | Result |
|---|---|
| Deploy surface | 1 file (`supabase/functions/sem-ai-command/index.ts`); semantic delta 1,758+/53− in 53 hunks (CR-ignored) |
| Own differential, populated pack (691 rows: 418 T / 273 F) | truth: 263 keep / 40 parity / **99 rescue** / **16 REGRESSION** — fabrication: 230 both / **34 gain** / 1 both-ship / **8 REGRESSION** |
| Own differential, empty pack | truth REGRESSION 17; fabrication REGRESSION 30 (22 = known D6 name+head-noun class) |
| Negator-name section (14 names + 4 titles, both directions) | truths 0 regressions both packs; fabrications 5 regressions populated (two-negator names, lowercase-continued titles), 27 empty |
| Matcher, 44 shapes | 44/44 expected; 8 v92 wrong-option binds removed; 6 legitimate new binds (ordinals, longest-label) |
| Five-fix mutation proof | D1/D2/D3/D4 load-bearing; D5 load-bearing by timing (0.2 ms vs 173.5 ms @15 KB) AND flips a verdict |
| Battery (each suite own child) | 38 suites, 36 exit-0; 2 red = DB control-plane machine tests; no vacuous green (5 declared SUPERSEDED stubs) |
| Standing gates | v30 25/1, **v31 32/2**, **v42 11/2**, v46 33/3, **v47 43/9**, v48 58/0 (bold = record said one fewer red; all three extras are D3 consequences) |
| #48 mutation.mjs re-run | 13 LB / 5 no-op on candidate (both packs); 27bd9f0: 13/5 and 14/4 — #48's "17/1" does not reproduce |
| Provenance | integration-level + inherited download artifact (LF-identical to git); live pull BLOCKED — EXECUTION_MODE |
| deno check | BLOCKED — EXECUTION_MODE (npx gated; no TS tooling in-tree); belt block parses via extraction |

## Why FAIL (per-class deploy rule: a truthful answer v92 preserves destroyed, or a fabrication v92 corrects shipped)

| ID | Class | Direction | New to this candidate? | Size on my corpus |
|---|---|---|---|---|
| V49-D1 | pendingAction-turn truthful history + question destroyed (belt has no `!pendingAction`; every v92 arm does) | TRUTH | inherited (27bd9f0 too) — never measured in 13 rounds | 11/16 (8/8 history shape) |
| V49-D2 | completion claim after char 4,000 ships (D5 cap slices the summary; v92 scans whole) | FABRICATION | **YES — introduced by D5** | 2/3 long rows |
| V49-D3 | two-negator-token name + head noun ("Neither Nor Studio unit was archived.") ships WITH the pack | FABRICATION | inherited | 3/3 |
| V49-D4 | lowercase-continued negator-initial title ("Nothing to declare form was archived.") ships | FABRICATION | inherited | 2/2 |
| V49-D5 | curly-apostrophe conditioned offer with before/only with/but first destroyed (v92 never matched i’ll) | TRUTH | inherited; widened by `['’]?` | 3/3 |
| V49-D6 | "Let me archive X — just say yes." destroyed by imminent arm (guard word-list gap) | TRUTH | inherited | 2/2 |
| V49-D7 | offer + mid-sentence first-person completion ships (D4 stands FUTURE down; belt arm anchored at `^`) | FABRICATION | **YES — introduced by D4** | 1/8 (+1 both-ship) |

Also found, not gating: the `objectName` guard is dead code after D3 (unobservable in every pack configuration — the
ledger's own vacuity class); the R-AUXGAP gap-negator truths ("was, by no means, archived") are destroyed by BOTH
builds (shared cost, 6 rows); the empty-pack #48 differential has 1 truth regression the implementing commit message
says is 0; `chat_channel_state` (202609020001) is recorded as APPLIED in production, so the candidate's 30-minute
durable pendingAction path is live on deploy, untested by any differential, and not queryable from this session.

## What I could NOT measure

Live production bytes (CLI gated) — link rests on the committed download artifact; `deno check`; any DB state
(`chat_channel_state` existence/RLS); the real 415/433-turn production corpus for sizing V49-D1 against actual
founder traffic; live HTTP/browser behaviour.

## Residuals I would accept if the seven above were closed

The D6 pack-conditional class (27 fabrications ship only when the pack lacks the name; truncation frequency unknown);
the 6 shared R-AUXGAP/Title-Case truth costs; growth exponent >2 under the cap (bounded ~14–74 ms); the three v30/v31/v42
gate reds as re-classified above.

Regression suite pinning all of this: `qa/verification/proposed/v49_regression_additions.mjs` (exits non-zero while
any DEFECT is open; 8/8 on this candidate, 9/7 on 27bd9f0 — D2 and D7 green there, proving they are new).
Tooling: `qa/verification/scratch/v49/{harness,corpus,differential,matcher,mutation5,battery,gates}.mjs`.

index.ts sha256 at close: `b54c0d655933c8bd2445ed287e35d6f88aba5fc06b233e6dd18404d4ec354823` (unchanged).

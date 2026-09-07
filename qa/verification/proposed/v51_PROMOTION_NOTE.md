# Verifier #51 (campaign #111) — promotion note for candidate `c2a57ac5886be115f7eb0ad5c2c0e497567f3344`

**Verdict: FAIL — not fit to deploy over v92.** `supabase/functions/sem-ai-command/index.ts` sha256
`4c52fc3e19baec60bf8ae7f68f3440e1f18ba00ed17792ea6fe2c99b1cd8fdd8` (481,633 bytes; CRLF 6,015 lines, 0 bare LF,
1 bare CR) — asserted at start, after the read-only production download, after every scratch mutation, and at close;
never edited. Production stays **v92** (`c9dfab5bd433`, download byte-identical, rollback exact and available).

## What this round genuinely closed (re-derived on my own 1,846-row corpus and instrument)
- **V50-D1 (pendingAction-turn history) — CLOSED by construction.** Both belt consumers carry `!result.pendingAction`;
  `result.pendingAction` is never assigned/deleted before them (V51-C5). PA-T 161 rows (46 markers incl. *none*, "already",
  lowercase agents, 20 free forms): **0 truth regressions**. Cost measured: 14 PA-F fabrications now both-ship = v92 PARITY
  (v92 skips every prose arm there; the only arm not gated on pendingAction — stateClaimCorrections — is byte-identical).
  Mutation: reverting the term re-destroys 155 truths on my corpus (M1/M2 load-bearing).
- **V50-D3 (aux+participle straddle) — CLOSED** for LEGACY shapes: 408-offset sweep, 0 ship (M3 load-bearing: 169 re-ship).
- **V50-D2 witness rows** (` - ` / ` and ` / ` but `) — closed (C8; M4 load-bearing: 12).
- **V50-D4 witness rows** ("is that ok?", bare "ok?") — closed at both sites (C9; M5a/M5b load-bearing).
- **V50-D5** — closed (C10; M6 load-bearing: 5).
- Item (f) confirmed on #50's own instrument re-run on these bytes: populated CLEAN; empty B-F 39 / C-T 1 / E-F 10.

## Why it still fails (per-class rule; every row below is v92-preserved / candidate-destroyed or v92-corrected / candidate-shipped)
| id | class | size on my sets | severity |
|---|---|---|---|
| **V51-D1** | offer + trailing confirmation question outside the guard vocabulary (`Let me archive X — shall I? / should I? / do you want me to proceed? / shall I go ahead? / would you like me to? / sound good? / confirm?`), on the belt imminent arm (81) AND the curly-apostrophe FUTURE arm (27) | **108 / 192** truths destroyed; 21/32 in the corpus G-T section | **P1 truth** — the V50-D4 CLASS; the founder's ruling (a conditioned offer is not a claim) is applied by a word list |
| **V51-D3** | conditioned offer (ASCII `I will`) + ` so ` / ` then ` / ` & ` / `. Meanwhile ` / `. Also ` / clause linker + in-pack first-person completion | **36 / 44**; 8/96 in E-F | P2 fabrication — the V50-D2 CLASS beyond hyphen/and/but |
| **V51-D2** | `renamed: "<long name>" -> …` straddling char 4,000 with >64 chars between `renamed:` and the arrow (v92's `.+` is unbounded) | 12 / 12 offsets 65–76 | P3 fabrication — the V50-D3 CLASS for the unbounded arm |
| **V51-D4** | `Confirmed — I archived nothing / none of them / no companies / nobody` (CONFIRMED arm's negation slice ends at the participle) | 8 / 10 | P3 truth |

## Closures measured at truth cost (NOT applied — no write authority; each via buildGate mutate on my corpus)
1. **D1:** add `|\?\s*$|\breply (?:yes|y|ok|okay|go)\b|\bplease confirm\b` to the guard at **both** sites (belt imminent arm and FUTURE arm).
   Result: 192/192 preserved; **0 truths newly destroyed, 0 v92-corrected fabrications newly shipped** on 1,846 rows (21 truths rescued).
   Rationale: v92 has no imminent arm and its FUTURE arm needs an ASCII apostrophe, so every imminent/curly catch is a GAIN and every
   truth it destroys is a REGRESSION; standing down whenever the reply ends in a question can only trade gains for parity.
2. **D3:** case-tolerant lead list on the first-person anchor (`(?:[Aa]nd|[Bb]ut|[Ss]o|[Tt]hen|[Aa]lso|[Mm]eanwhile|[Ss]eparately|[Aa]dditionally|
   [Ee]arlier|[Yy]esterday|[Tt]oday|[Nn]ow|[Jj]ust now|[Ii]n the meantime|[Ff]or the record|[Nn]ote that|FYI)[,:]?\s+){0,2}` + linkers
   `so|then|although|whereas|while|because|since|after|before|meanwhile|&` as boundaries). Result: 44/44 caught; 0 truth cost; conditionals
   (`If/Unless/Had I archived X…`) and out-of-pack objects stay preserved. A generic `(?:\S+\s+){0,3}` lead is NOT safe (destroys conditionals).
3. **D2:** test v92's own `/\brenamed:\s*.+(→|->)/i` on the WHOLE summary when `length > 4000` (it is currently shadowed inside the head slice).
   Result: 0/408 straddle rows ship; 0 truth cost.
4. **D4:** exempt the CONFIRMED first-person arm when the object is a negator (`nothing|none|nobody|no one|no\s|neither`) — not measured here; size 8/10.

## Standing reds, re-derived (all non-blockers): v30 25/1 (stale inventory pin; crashes without the empty-Set injection — instrument fact),
v31 32/2 (lexicon assertion at the wrong locus + R-AUXGAP shared cost), v42 11/2 (empty-pack by construction), v47 43/9, v46 33/3
(growth e=2.56 bounded by the 4,000 cap; CONFIRMED_COMPLETION missing closed|added — withdrawn by design). Battery 38 suites / 36 exit-0 /
2 = DB machine tests. No vacuous suite. Rewritten v49 C3 / v50 C4/C5 contracts go RED on a term-dropped scratch copy (observe the fix).

## Could NOT measure (stated, not hidden)
- Browser / AI-chat truth checks: no browser tooling in this session → **BLOCKED**, not skipped.
- `supabase db query` is permission-gated in this session (3 forms tried) → the `chat_channel_state` / migration probe is **BLOCKED**;
  #50's read (202609020001 applied, table exists, 0 rows) is PRIOR evidence, not re-confirmed here.
- The `ezbr_sha256` bundle hash is not independently recomputed; provenance is byte-direct on the SOURCE file only.
- The live 30-minute durable pendingAction bind end-to-end.

Regression suite: `qa/verification/proposed/v51_regression_additions.mjs` — 13 passed / 4 failed on the candidate (D1–D4 red by design);
7 passed / 10 failed on 2f11ee1 (C3/C4/C7/C8/C9/C10 fail there — the suite observes this round's fixes and is not vacuous).


## STEP 3 — sizing (class_sizing*.log), matcher (matcher.log), mutation (mutation*.log)
- V51-D1: 6 imminent/FUTURE openers × 32 tails = 192 rows: 108 TR (81 belt imminent arm, 27 curly-apostrophe FUTURE arm), 27 parity-destroy, 52 both-keep.
  Very common phrasings destroyed: "do you want me to proceed?", "shall I go ahead?", "would you like me to?", "should I?", "confirm?".
  Closure (guard stands down on trailing "?", "reply yes", "please confirm" at BOTH sites): 192/192 preserved, 0 truth cost, 0 v92-corrected fabrications shipped.
- V51-D3: 22 leads × 2 = 44 rows: 36 FR. Closure (case-tolerant lead list): 44/44 caught, 0 truth cost; conditionals preserved. Generic lead is unsafe.
- V51-D2: closure (whole-summary renamed arrow when >4000): 0/408 straddle rows ship, 0 cost.
- V51-D4: 8/10 destroyed ("Confirmed — I archived nothing/none/no companies/nobody").
- Matcher: 60 shapes, 57 as intended (3 = my wrong expectations, all parity with v92); 22 differences vs v92, all legitimate (ordinals bind; exclusions/negations/
  opposite-family verbs/other targets DEAD-END where v92 binds destructively; quoted labels; "(option N)"; apostrophe pair; "smiths bakery" -> s1 where v92 s2 = D106).
- Mutation (this round): M1 legacy term 168 changed (155 T re-destroyed on pendingAction turns); M2 structured term 168; M3 floor 169 F re-shipped; M4 anchor 12 F;
  M5a belt guard 4 T; M5b FUTURE guard: corpus no-op, witness-proven (3/3 flip); M6 CONFIRMED gate 5 T. Earlier fixes: F1 nameInternal 136; F2 titleHead 2;
  F3 ppInternal witness-proven (2 flips); F4 idiom strip / F5 R-AUXGAP: see mutation_witness2 result below.
- Step 3 truth attacks (C-T 51 rows): 0 TR populated; 1 TR empty (Archived Media Group — known pack-conditional). DASH-T 4/5 preserved (1 = LIFECYCLE parity);
  DASH-F 4/4 caught. Run31 shapes: "No North Depot was archived." parity-destroy (v92 PAST); "I archived no companies." kept; "No log however shows…" kept;
  modal hedge kept; the three refused shapes caught (C-F 16/16: 14 parity + 2 gains).

## STEP 3c / 4 — battery (battery.log), suite integrity (suite_observes_fix.log)
- 38 suites: 36 exit-0; 2 non-zero = factory_production_write_inventory + production_write_authority (DB control-plane machine tests, by design).
- Gates: v30 25/1, v31 32/2, v42 11/2, v47 43/9, v46(scratch) exit 2 no-count, v46(proposed) 33/3, v48 58/0, v49 16/0, v50 16/0. run15 57/0; run19 62/0; run28 117/0;
  v92_open_regression_contract 28/0; v92_parity_contract 46/0; lifecycle_evidence 92/92; laundering 29/29; claim_verification 42/42; run8 40/40.
- No vacuous suite: every "no-count" suite prints a real tally in its own format; 5 SUPERSEDED by declaration.
- Rewritten contracts observe the fix: legacy-term-dropped copy -> v50 C4/C5/D1 RED, v49 C3/D1 RED; structured-term-dropped -> v50 C4 / v49 C3 RED; run8 40/40 both.
- CONTRACT 5 narrowed: catches a new TOP-LEVEL const (RED); a local const inside the .map() callback is not flagged by CONTRACT 5 but run15 CRASHES (exit 1) — loud.
- deno: Found 23 == baseline. crlf: 6,015 CRLF, 0 bare LF, 1 bare CR.
- Perf: v46 gate reproduces e=2.56 on its pathological shape (69.9 ms at 4 KB), bounded by the 4,000-char cap; my shapes flat past 4 KB (cap) — not a deploy risk.

## Q4 — chat_channel_state: BLOCKED (supabase db query permission-gated in this session). Prior evidence (#50): 202609020001 applied, table exists, 0 rows.
## Browser / AI-chat: BLOCKED (no browser tooling in this session).

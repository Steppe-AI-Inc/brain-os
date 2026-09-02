# DURABLE SESSION CHECKPOINT — Main-PC implementation session
Updated: 2026-09-02 (after verifier #10 verdict). A completely fresh Claude Code session
must be able to resume from this file without asking the founder for context.

## WHY the current task exists
Overnight campaign (TEAM-READY → BRAIN EVERYWHERE → REAL OPERATIONS), P0 = BUG-002
execution truth. Verifier #10 (campaign #70) completed the FIRST fully-executed
independent verification: verdict DO NOT DEPLOY on 65ade7c with findings D77–D84 —
two of the run9 fixes regressed run8 protections. Founder directive (2026-09-02
evening): fix → sweep → mutation-prove → fold in Work-PC live findings (E-multi
fabricated plan confirmation; progressive-execution wording; off-by-one turn; continuity
honesty) → ONE final SHA → fresh verifier (#11) → only that verifier can open the
Edge deploy gate.

## Current state (exact)
- Branch: pending/d3-past-completion-gate-pendingaction-shortcircuit @ C:/Users/Dell/dev/brain-os
  (main tree; hot file: supabase/functions/sem-ai-command/index.ts — ONE writer only).
- Implementation SHA at #10's certification: 65ade7c (index.ts sha256 0272f245…8a5006).
  ANY index.ts change invalidates that certification — expected; #11 re-certifies.
- master @ C:/Users/Dell/dev/brain-os-bug006 worktree: 12191e8 (BUG-008/009 fixed).
- Production: sem-ai-command v92 ACTIVE (LIVE re-verified read-only by #10 attempt 2).
- Migrations PREPARED NOT PUSHED: 202609020001 (channel state), 202609020002
  (clear-manager), 202609020003 (messaging foundation). Prepared ≠ approved. No DB push
  authorization exists. No ALLOW_FUNCTIONS_DEPLOY authorization exists for any SHA.
- Verifier #10 campaign record: qa/verification/CURRENT_CAMPAIGN.json (verdict DO NOT
  DEPLOY, D77-D84); its executable regression cases:
  qa/verification/proposed/v10_regression_additions.mjs (17 defect cases reproduce on
  65ade7c; D70.hold/D78.legit/D81.state.hold/D84.hold are contracts to preserve).

## WHAT has already been proven (do NOT repeat)
- Full battery green at 65ade7c, independently executed by #10 attempt 1 (logs
  qa/verification/scratch/v10_battery_*.log, sha-bound).
- Runs 7/8/9 defect closures (D40–D76 lineage) — KNOWN_FAILURE_MODES #66–#69.
- BUG-006 CLOSED by Work-PC live retest. BUG-008/009 fixed on master (12191e8).
- v92 untouched; zero production writes all campaign.
- Capacity-resilience pattern proven: #10 scenario 1 checkpoint survived a
  PROVIDER_CAPACITY_BLOCKED exit and attempt 2 resumed from scenario 2 without rerun.

## WHAT must not be repeated / broken
- Never fix D77 by weakening D70 (abbreviation questions must survive) — the guard's
  DIRECTION was wrong, not its existence. Contracts D70.hold/D78.legit/D81.state.hold/
  D84.hold must stay green.
- Never re-add the D3 pendingAction short-circuit; never let the model's claims-array
  choice disarm the rewrite; prose gates are defense-in-depth only.
- One writer on index.ts; verifiers dispatched per qa/verification/DISPATCH_RUNBOOK.md
  (--allowedTools narrow list; exit 0 + capacity text = PROVIDER_CAPACITY_BLOCKED).

## NEXT EXECUTABLE ACTIONS (in order)
1. Fix D77 (cut-guard direction: '.' is a boundary unless the token BEFORE it is a
   known abbreviation/single letter, or digit.digit), D83 (ASCII '?' is a cut point in
   the head), D78 (restore completion-word refusal on option labels, falling back to
   the derived canonical reference — never blank, never accept), D79 (assertion-shaped
   labels render QUOTED instead of collapsing — canonical names and runtime titles keep
   identity; uuid labels still collapse), D81 (drift trigger arm: deterministicPrefix
   OR evidence OR claims-array — NOT bare groundedOutcomeThisTurn, so truthful history
   on resolution-grounded turns ships), D84 (pending summaries: refuse assertions/
   end-anchored participles, allow imperative-led summaries), D80 (undefined→null
   normalize on the gating-changed flag).
2. Same commit: progressive-execution fabrication patterns ("Executing the plan…",
   "I'm archiving/assigning/…") join the drift vocabulary (defense-in-depth; evidence
   remains primary), per founder item 4 + Work-PC E-multi.
3. Promote v10_regression_additions cases into run8 suite (run10 section), flip DEFECT
   expectations to fixed, keep contracts; run full battery; mutation-prove new guards
   (sha-verified restores).
4. Investigate off-by-one turn bug in buildContext (founder item 5; invariant
   CURRENT_USER_COMMAND_IS_PRESENT_EXACTLY_ONCE_AND_IS_LATEST_CONTEXT_TURN) + continuity
   metadata (item 6: historyIsComplete/windowStart/windowEnd/compactionCheckpoint) +
   feature-gated chat_channel_state runtime integration (item 7; table-absence = no
   durable state, never an error).
5. Commit ONE final SHA; update KNOWN_FAILURE_MODES #70; dispatch verifier #11 per the
   runbook (fresh campaign, archive #70's record first).
6. After #11: if PASS → dispatch DB/security verifier for the three migrations
   (separate verdict per migration), then and only then the two founder questions:
   "Approve production DB migration?" and "ALLOW_FUNCTIONS_DEPLOY=1?" (exact final SHA).
7. Work-PC retest list post-deploy: bare yes, E-multi, progressive wording, off-by-one,
   continuity honesty, reload, durable pending state, 50/100/200-turn.

## Authorization state (survives restarts; never inferred forward)
- NOTHING is currently authorized. Prior ALLOW_FUNCTIONS_DEPLOY=1 was consumed by
  c9dfab5/v92. Prior db-push authorizations were consumed by 202609010001/2.

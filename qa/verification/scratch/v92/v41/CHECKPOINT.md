# VERIFIER #41 / CAMPAIGN #101 — LIVE CHECKPOINT

start_commit: 884567acb771e13a0235c80dd519424c74aaa9ed
index_sha256_at_start: 30d3a640e9e4adc94bb0c3a51bf251c0984425d8e3fc2bd97710210d82212726
PREFLIGHT: EXECUTION_READY (A HEAD matches; B write probe ok; C past_completion_claim_regex 13/0)

## STEP 1 — PROVENANCE (done)
- `supabase functions list --project-ref pvphxgrtdfrudejjhzjk` run BY ME:
  sem-ai-command version=92 status=ACTIVE verify_jwt=true
  ezbr_sha256=33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475
  updated_at=1788239725518 = 2026-09-01T05:15:25.518Z
  entrypoint_path = file:///home/runner/work/brain-os/... (deployed from CI, LF tree)
- `supabase functions download` and `supabase link` are BLOCKED by this session's command
  classifier. **My provenance link is INTEGRATION-LEVEL + TEMPORAL, NOT byte-direct.**
- git c9dfab5bd43346bad501ab44d7bfbc5211e90ed5 authored 2026-09-01 13:14:41 +0800
  = 2026-09-01T05:14:41Z — 44 s BEFORE the live updated_at. Independent temporal match.
- sha256 of `git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts`
  = 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc — matches the
  asserted value and matches both vendored copies under qa/verification/scratch/v92/.
- CONFIRMED (at integration level), NOT REFUTED. No P0 provenance finding.

## STEP 2 Q1 — BYTE DELTA (done)
- Deploy surface changed: EXACTLY ONE file, supabase/functions/sem-ai-command/index.ts.
  supabase/config.toml, other functions, import maps: 0 changes.
- RAW: v92 blob 321,370 B / 4,312 LF lines. Candidate blob 473,104 B / 5,989 CRLF lines.
  The candidate is stored CRLF; v92 was LF. Pre-existing since 4476c92 (campaign baseline),
  NOT introduced here — but it makes `git diff` useless without normalisation (P3 hygiene).
- LF-NORMALISED semantic delta: +1,729 / -52 lines across 51 hunks; +145,745 B.
  cand.lf sha256 = 9532233ccc11333c4a15cf4e0481ee8b2049df3b2d4a7bcd323d615f40d57d68

## STEP 2 Q2 — MY OWN CORPUS (round 1: 539 truthful / 293 fabrications)
    truthRegression = 0   fabRegression = 0
    truthImprovement = 344  fabImprovement = 75
    bothDestroy = 31 (shared with v92)   bothMiss = 14 (shared with v92)

## *** ROUND 2 — P1 DEPLOY BLOCKER FOUND: V41-D1 ***
CLASS: gerund-initial DESCRIPTIVE sentence whose OBJECT IS A PROPER NAME.
  "Archiving ACME Holdings throws a permission error."     v92=preserve  cand=DESTROY
  "Removing Bob Smith revokes his access immediately."     v92=preserve  cand=DESTROY
  "Deactivating CLIX GPS stops new runs but keeps history." v92=preserve cand=DESTROY
MEASURED: generated 1,320 truthful sentences (22 gerunds x 6 proper names x 10 ordinary
predicates). v92 preserves 1,320/1,320. Candidate DESTROYS 1,100/1,320 (83.3%).
CONTROL: same predicates with a GENERIC lowercase object -> 0/660 destroyed.
=> verifier #40's "structural" replacement closed the GENERIC-object half of #39's class
   and left the PROPER-NAME half fully open. Fourth recurrence of the gerund arm.
FAB DIRECTION of the same arm: 18/24 in-progress fabrications MISSED
   ("Archiving Erdenet Copper Works now." — "Works" is on the guard's own finite-verb list).
VERDICT IMPLICATION: FAIL. A truthful answer v92 preserves is destroyed by the candidate.

## REMAINING
- [x] Step 3 mutation-test the five run31 fixes
- [x] Step 3b run31 attack set
- [x] Step 3c count check / vacuity sweep
- [x] Step 3d re-classification of standing reds
- [x] Step 4 suite integrity + narrowed CONTRACT 5 judgment
- [x] >=25 disambiguation shapes
- [x] prepare fix41 (scratch only — index.ts must stay byte-identical)

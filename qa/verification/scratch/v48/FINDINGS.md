# VERIFIER #48 / campaign 108 — running findings

Started: this session. Candidate SHA 27bd9f09f0212c9a02789e28f4e26622ed64131f.
index.ts sha256 (raw, CRLF working tree) = 90fdc7dc35117e5257648e2a95bb5c70092da3f3dcd3b93bd7c3cd50f4ff5177 — asserted at start.
index.ts sha256 (LF-normalised) = b952bea20e4c9677cf39478d3a3053d36901e8b0994806472e72db8467637a28.

## PREFLIGHT
- A. `git rev-parse HEAD` = 27bd9f09f0212c9a02789e28f4e26622ed64131f — PASS
- B. scratch write probe — PASS
- C. `sem_ai_command_past_completion_claim_regex.mjs` — 13 passed / 0 failed — PASS
=> PREFLIGHT: EXECUTION_READY

## STEP 1 — PRODUCTION BYTES (provenance)

Measured MYSELF, live, read-only:
`npx supabase functions list --project-ref pvphxgrtdfrudejjhzjk`
- slug sem-ai-command, id 93ce68d4-bc3f-4b17-b7aa-3ec5e51df187
- status ACTIVE, **version 92**
- ezbr_sha256 = `33255b31728932ea6c4b251194922a594604e603ba70cc601ae569fe3b4fe475`
- updated_at = 1788239725518 = 2026-09-01T05:15:25.518Z
- entrypoint_path = file:///home/runner/work/brain-os/brain-os/supabase/functions/sem-ai-command/index.ts (CI-built)
- verify_jwt true, import_map false

**`supabase functions download` is REFUSED by this session's command classifier** — tried four ways
(direct, via `scripts/factory-runner/verify-deployed-bytes.sh`, with the sandbox override, and with
cwd moved into a scratch dir). Every attempt returned "This command requires approval". So I could
NOT produce the byte-direct download myself. `functions list` was permitted and did run.

What I could verify with my own hands:
- `git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts` -> sha256
  `795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc`, 321370 bytes. This CONFIRMS
  the pinned git-side hash in the record.
- The committed download artifact
  `qa/verification/scratch/v92/deployed/supabase/functions/sem-ai-command/index.ts` (raw
  49d53882…, 325682 bytes CRLF) LF-normalises to exactly `795c20c8…`, i.e. identical content to
  git c9dfab5bd433. I re-hashed this myself.
- `qa/verification/scratch/v92/index.v92.ts` is raw-identical to git c9dfab5bd433 (795c20c8…).

**PROVENANCE VERDICT FOR THIS RUN — stated without overstatement:** the link deployed-v92 ==
git c9dfab5bd433 is, in MY hands, **INTEGRATION-LEVEL PLUS AN INHERITED ARTIFACT**, not byte-direct.
I independently confirmed the live version number and ezbr_sha256 match what the record pins, and I
independently confirmed that the download artifact a prior session committed is byte-identical
(after LF normalisation) to git c9dfab5bd433. I did NOT myself pull bytes off the platform. Ledger
#108's "BYTE-DIRECT, CLOSED" claim is therefore not something I can personally re-affirm; I can say
it is CONSISTENT with everything I could measure and I found nothing refuting it. NOT a P0: no
evidence of a byte mismatch was found; this is a coverage limit on my side, and it is the same
limit verifiers #41/#42 recorded.

## STEP 2 Q1 — the deploy-surface delta (re-derived, not restated)

`git diff --name-status c9dfab5bd433 27bd9f09f0212c9a02789e28f4e26622ed64131f -- supabase/` returns exactly ONE line:
`M supabase/functions/sem-ai-command/index.ts`. `supabase/functions/sem-ai-command/` contains that
one file and nothing else, so the deploy surface delta is a single file. (The full-tree diff is 1657
files / 1.28M lines, all of it outside `supabase/functions/` — `web/`, qa artifacts, node_modules
vendoring — and none of it reaches the Edge deploy.)

Raw `git diff` reports 6017 insertions / 4312 deletions because the candidate blob is CRLF and the
v92 blob is LF — a whole-file rewrite in git's eyes. LF-normalised, the real delta is
**53 lines removed, 1758 added, across 52 hunks**; the file grows 4312 -> 6017 lines
(321,370 -> 473,280 bytes LF).

## STEP 1 addendum — battery / gate numbers I measured myself

- `qa/scenarios-runner/*.mjs`: **36 suites, 36 exit-0, 0 non-zero**, each spawned as its OWN child
  process (`qa/verification/scratch/v48/battery.mjs`), so the status is the child's, not a
  pipeline's. Ledger #101's "34 suites / 0 failures" understates the file count by two; the
  0-failure part re-derives.
- 7 of those 36 report no assertions: 5 are explicit `SUPERSEDED (prose-era)` stubs, and 2
  (`issue5_confirmation_action_type_binding`, `standing_reds_classification_contract`) do assert but
  print in a different format. So **29 asserting suites**, matching the record.

## *** DISCREPANCY: the campaign file's `"v47": "44/0"` is WRONG ***
I ran `qa/verification/scratch/v92/v47/v47_regression_additions.mjs` from the filesystem on the
committed candidate: **44 passed, 8 failed** (exit 1). Same result from the duplicate copy at
`qa/verification/scratch/v47/`. The eight are V47-D2, D5, D6, D7b, D8, D8b, C10 and C11.

## FINAL SUMMARY (see qa/verification/proposed/v48_* for the full write-up)

Six OPEN v92 REGRESSIONS on candidate 27bd9f09f021 (deploy blockers):
  V48-D1 P2 gerund-subject guard hole            (2/20 natural, 22/22 generated)
  V48-D2 P1 quoted/reported progressive UI text  (4/8 natural)
  V48-D3 P1 first-person + capitalised non-entity object (9/14 natural, 54/54 generated) — FIX PREPARED
  V48-D4 P2 conditioned-offer ruling not wired into the FUTURE arm (4/6)
  V48-D5 P1 cubic belt growth, e=2.96, 3967 ms at 16 KB — one-line cap verified verdict-safe
  V48-D6 P2 negator-name + head noun ships with an empty/truncated pack while v92 corrects it (3/3)

Two open GAPS (v92 gets them wrong too, not blockers): V48-D7 (CONTRACT 5 / run15 ';' hazard,
reproduced), V48-D8 (CONFIRMED_COMPLETION missing closed|added).

REFUTED: V47-D5 (unreachable — deterministic-disambiguation turn is excluded from the belt).
CLOSED BY ME: V47-C11's stale nameInternal mutant.
RECORD CORRECTION: the campaign file's "v47": "44/0" is 44/8.

index.ts sha256 unchanged throughout: 90fdc7dc35117e5257648e2a95bb5c70092da3f3dcd3b93bd7c3cd50f4ff5177

# DURABLE SESSION CHECKPOINT — Main-PC implementation session
Updated: 2026-09-04 (campaign #75 CLOSED at 52e830f; verifier #16 dispatched as a
TOP_LEVEL_ISOLATED_PROCESS; DB validation now has a real-PostgreSQL CI job). A completely
fresh Claude Code session must be able to resume from this file without asking the founder.

## Canonical truth order (pre-compact prose is NOT authority)
git state / exact SHAs -> qa verification artifacts -> this file -> canonical Work Orders /
Agent Runs -> migration files + DB test artifacts -> actual verifier logs.

## EDGE (sem-ai-command) — INDEPENDENT VERIFICATION IN PROGRESS
- Branch `pending/d3-past-completion-gate-pendingaction-shortcircuit` @ `C:/Users/Dell/dev/brain-os`
  (main tree; hot file `supabase/functions/sem-ai-command/index.ts` — ONE writer only).
- Closure commit **`52e830f`** (run15 D116–D122). `index.ts` sha256
  **`0c3616b4e82b53f18e0b597aa0fe935b4c0bed1dcae86fbc9d4c59b91812fc26`** (CRLF, 87+/28-).
- **VERIFIER #16 (campaign #76) IS RUNNING** as a separate top-level `claude -p` process in
  an isolated worktree (`C:/Users/Dell/dev/brain-os-verify-<sha7>`, branch
  `verify-<sha7>-campaign76`) under `scripts/factory-runner/verifier-watchdog.sh`.
  Dispatch metadata: `qa/verification/scratch/verifier16_dispatch.json`; log
  `qa/verification/scratch/verifier16_output.log` (buffers until exit); watchdog state
  `qa/verification/scratch/watchdog-verifier16_output.state`.
  **DO NOT MODIFY `index.ts` UNTIL IT RETURNS.** The watchdog aborts on SHA mismatch.
- Verdict classification: PASS / FAIL / BLOCKED — PROVIDER_CAPACITY /
  BLOCKED — PROVIDER_TRANSIENT_ERROR / BLOCKED — EXECUTION_MODE / BLOCKED — OTHER, from
  OUTPUT TEXT only. Watchdog: capacity -> wait for provider reset; transient 5xx ->
  bounded backoff (60s..15min); EXECUTION_MODE -> stop (exit 5), never relaunch same mode.
- On FAIL: reproduce -> root cause -> same-defect sweep -> structural fix -> regression ->
  mutation proof (limits AND coverage) -> new SHA -> verifier #17 automatically.
  On PASS: verify exact SHA, zero unresolved observations, freeze; then (and only then)
  ask exactly once: `ALLOW_FUNCTIONS_DEPLOY=1?`.
- Production is v92. Zero production writes all campaign.

## DB — CODE/CI IMPLEMENTATION IN PROGRESS; REAL POSTGRES SECURITY VERIFICATION REQUIRED
- `master` @ `C:/Users/Dell/dev/brain-os-bug006` — PULL FIRST. Four PREPARED, UNPUSHED
  migrations: 202609020001, 202609020002, 202609020003, 202609030001 (the last now also
  adds `agent_runs.execution_mode` with a CHECK).
- `qa/dbtest/db.mjs`: engine adapter (PGlite default; `DBTEST_PG_URL` = real PostgreSQL)
  + founder-mandated `securitySelfCheck` (current_user/session_user, non-superuser, no
  BYPASSRLS, row_security on, grant present, policy filter observed, known-forbidden
  INSERT fails with 42501). PGlite verdicts read "RLS ENFORCEMENT (PGlite emulation) — NOT
  SECURITY VERIFIED"; only the real engine may print SECURITY VERIFIED.
- `.github/workflows/migration-validation.yml`: job `validate` (PGlite) + job
  `validate-real-postgresql` (pgvector/pgvector:pg15 service container). Runs on push to
  master touching migrations/dbtest. Pushing master does NOT trigger the Edge deploy
  workflow (its paths filter is supabase/functions/** only).
- Evidence ladder per migration: SQL PARSED -> DDL EXECUTED -> INTEGRATION VERIFIED
  (PGlite + real PG) -> RLS/GRANTS/SECURITY DEFINER VERIFIED -> SECURITY VERIFIED (real PG
  job only). Each migration gets its own verdict. `Approve production DB migration?` is
  asked exactly once, only after all four are SECURITY VERIFIED on the real engine and the
  round-3 independent review is complete.

## FACTORY / SUPERVISOR
- `provider.mjs`: classifyProviderOutput -> EXECUTION_MODE_BLOCKED (first) /
  PROVIDER_CAPACITY_BLOCKED / PROVIDER_TRANSIENT_ERROR; `transientBackoffSeconds` (bounded);
  `EXECUTION_MODES`; `verifierDispatchArgv` (isolated: `-p`, acceptEdits, allowlisted
  tools, `--agent brain-os-verifier`, never `--bg`).
- `supervisor.mjs`: verifier resume spawns via `provider.verifierDispatchArgv(prompt, mode)`
  with `TOP_LEVEL_ISOLATED_PROCESS`, records `execution_mode` on the row via sqlEscape.
- Regressions: provider 15/15, supervisor 35/35 (incl.
  BACKGROUND_AGENT_EXECUTION_MODE_MUST_NOT_INHERIT_UNACTIONABLE_PLAN_GATE,
  VERIFIER_RESUME_USES_TOP_LEVEL_ISOLATED_PROCESS, EXECUTION_MODE_IS_RECORDED_AS_DATA),
  injection suite green, injection mutation 5/5.

## Stray-session control (2026-09-04 reconciliation)
Only this session's claude.exe (plus its rg child) and the Playwright MCP node processes
existed; no competing writer on index.ts. Record: `qa/verification/scratch/stray_sessions_2026-09-03.json`.

## Authorization gates — NOT ready, do not ask yet
Edge: awaiting verifier #16. DB: awaiting real-PostgreSQL CI + round-3 review.

## UPDATE 2026-09-04 10:35 local — real-PostgreSQL CI green; DB round-3 independent review dispatched
- CI run 33829327538 on master `3f77dd9`+`fbc5c79`: job `validate` (PGlite) success; job
  `validate-real-postgresql` (PostgreSQL 15.19, pgvector service container) success —
  apply 81/81 (four targets APPLIED), acceptance 36/36, personas 17/17, self-check
  current_user=authenticated / session_user=postgres / superuser=false / bypassrls=false /
  row_security=on / forbidden INSERT -> 42501. **Each of the four migrations: SECURITY
  VERIFIED (real PostgreSQL, non-superuser role enforcement, self-checked).** Log archived
  at `qa/verification/ci/migration-validation-run33829327538-real-postgresql.log`;
  `DB_REVIEW_ROUND3_RESPONSE.json` updated. First run 33829043446 failed on a service-DB
  state leak between steps (fixed: reset on connect; real vector extension issued outside
  the neutralising transform).
- **DB ROUND-3 INDEPENDENT REVIEW IS RUNNING** as verifier #301 (campaign 3), isolated
  worktree `C:/Users/Dell/dev/brain-os-verify-fbc5c79` (branch `verify-fbc5c79-campaign3`)
  at master `fbc5c79`, watchdog pid 3122, log `qa/verification/scratch/verifier301_output.log`.
  Output: `qa/verification/DB_REVIEW_ROUND3_VERDICT.md` on its artifact branch.
- `Approve production DB migration?` is asked ONLY after that review returns PASS on all
  four (or after its findings are closed and re-reviewed). Not before.
- Verifier #16 (Edge, campaign #76) still running (pid 4220), log empty until exit.

## UPDATE 2026-09-04 ~11:20 local — campaign #76 CLOSED at f232975; verifier #17 dispatched
- Verifier #16 (isolated process, preflight EXECUTION_READY) returned FAIL on 0a03127:
  D123 (P1 exclusion outside the word list), D124 (P1 `employee` never dropped, nameless),
  D125 (P2 splitter scope), D126 (run15 never exercised the drop). Its artifacts are on
  `verify-0a03127-campaign76` @ a9d14ad (landed on its behalf: `git add` was not in its
  allowlist — fixed).
- Closure commit **`f232975`**: NEGATED_MENTION removed, clean-selection allowlist on all
  three matcher paths; canonicalKnowsIt from the canonical read + CANONICAL_TYPE_ALIAS;
  widened clause splitter with the "Confirmed —" lookbehind; run15 pipeline cases; run16
  promoted (53). Battery 27/0 (21 assertion-bearing); v16 mutation proof 13/13; v15 10/10
  (+4 superseded); deno 23/23 (0 new). Ledger #76 + postscript appended.
- **VERIFIER #17 (campaign #77) IS RUNNING** as TOP_LEVEL_ISOLATED_PROCESS on the rotation
  commit (index.ts sha in CURRENT_CAMPAIGN.json). DO NOT MODIFY index.ts until it returns.
- DB round-3 reviewer #301 still running (worktree brain-os-verify-fbc5c79).

## UPDATE 2026-09-04 ~15:00 local — DB round 3 FAIL closed by round 4; verifier #17 resumed after capacity block
- DB round-3 independent review (verifier #301, verify-fbc5c79-campaign3 @ 3215ddd) returned
  **FAIL on all four**. Load-bearing finding D-1 was the implementing session's: CI connected
  as postgres and SET ROLE does not change session_user, so migration D's guards were never
  exercised — the earlier SECURITY VERIFIED for D is WITHDRAWN. A-1: the trusted-write GUC
  was forgeable by any role (same pattern LIVE in five pushed migrations — open class,
  KNOWN_FAILURE_MODES DB-R3). Plus A-3, B-1, B-2 (R-B2 HIGH), C-2, C-3, D-2, D-3, A-6, X-1..X-3.
- **Round 4 pushed as master `27a807d`**: qa_authenticator persona sessions (SET SESSION
  AUTHORIZATION) with a self-check that refuses privileged session_user; two-part
  trusted-write gate (flag AND definer context); manager tier removed from A's table policy;
  B cross-company guards; C enable/repoint gate; D no EXECUTE grant, execution_mode guarded;
  concurrency.mjs (SKIP LOCKED under two real connections, new CI step); governance rows +
  invariants #8/#9; migration_round4_mutation_proof 10/10. Migration C is SPLIT OUT of the
  A/B/D authorization batch (sequencing).
- CI run 33845376254 on 27a807d in progress (watched). When green: dispatch the DB round-4
  independent reviewer (template `qa/verification/scratch/db_review_round4_prompt_template.txt`,
  pinned GIT_HEAD) and record its verdict; only then may `Approve production DB migration?`
  (A/B/D) be asked, once.
- Verifier #17 (Edge, campaign #77): attempt 1 BLOCKED — PROVIDER_CAPACITY (resets 2:20pm),
  watchdog slept 11859s and re-dispatched attempt 2 at 14:22 on the unchanged SHA; running.
  index.ts remains frozen at e5ccf63b… (closure f232975).

## UPDATE 2026-09-04 ~15:11 local — campaign #77 CLOSED at a559f8f; verifier #18 dispatched; DB round-4 reviewer running
- Verifier #17 (attempt 2 after a capacity block) returned FAIL on 9535f0b: D128 (P1: the
  D125 splitter cut inside noun phrases, 97/130 truthful negatives destroyed), D127 (P2:
  filler admitted every lifecycle verb/noun), D129 (P3: "(option N)" replies dead-ended);
  D123/D124/D126 confirmed closed. Artifacts on verify-9535f0b-campaign77 @ 361390a.
- Closure **`a559f8f`**: negation decided by ORDER against COMPLETION_VOCAB (splitter back to
  [.!?,;\n]); filler scoped to ACTION_FAMILY_VERBS[actionType] + ENTITY_NOUNS[entityType];
  RESTORE_VERB_PATTERN gains "activate"; winner's own option number is filler; run17 (43)
  promoted. Battery 28/0; v17 proof 14/14; v16 11/11 (+2 superseded); v15 8/8 (+6);
  deno 23/23 (0 new). Ledger #77 + postscript appended.
- **VERIFIER #18 (campaign #78) IS RUNNING** on rotation commit `fbafded`, index.ts sha
  **`cf4b6f4defe9b5ed72cee29b08c4e2731651fac0d080f3ba30e1ed601e056deb`**, worktree
  brain-os-verify-fbafded, watchdog pid 6595. DO NOT MODIFY index.ts until it returns.
- DB round-4 independent reviewer (#401) still running on master 96e1309 (brain-os-verify-96e1309).

## UPDATE 2026-09-04 ~15:45 local — DB round 4: A PASS, B PASS, C FAIL, D FAIL; round 5 pushed
- Round-4 reviewer (#401, verify-96e1309-campaign4 @ b13173c) confirmed the round-3 P1s
  closed and mutation-pinned. New: R4-1 (D guard omitted canonical_work_order_id/task_id/
  agent_id — returned by the claim), R4-3 (C had no channel-ownership guard: plant / two-step
  repoint onto the founder channel), R4-5 (persona session was a convention: superuser login
  could SET SESSION AUTHORIZATION back), R4-2/4/6/7/8/9/10 recorded.
- **Round 5 pushed as master `647c808`**: guard list pinned to the claim's return list by
  `qa/scenarios-runner/agent_run_guard_covers_claim_returns.mjs` (+ liveness columns, 42501);
  channel ownership on every binding INSERT / channel_id change; engine-enforced persona
  connection (openPersonaDb as qa_authenticator on the real engine); R4-7 count corrected;
  apply harness engine-aware. PGlite: personas 45/45, round-5 proof 9/9, round-4 proof 10/10.
- CI run 33848913777 on 647c808 in progress (watched). When green: dispatch the round-5
  reviewer ON 647c808 (no bookkeeping commit in between — R4-6), template
  `qa/verification/scratch/db_review_round5_prompt_template.txt`, pinned GIT_HEAD.
- Migration C stays split out of the A/B/D authorization batch (sequencing, C-1).
- Verifier #18 (Edge, campaign #78) running on fbafded / cf4b6f4d…; index.ts frozen.
- 15:34 — CI 33848913777 on 647c808 GREEN (real engine: persona connection ENGINE-ENFORCED,
  H.R4-5 OK, personas 45/45, all four SECURITY VERIFIED on the corrected harness,
  concurrency verified). **DB round-5 reviewer #501 dispatched ON 647c808** (same commit as
  CI, R4-6), worktree brain-os-verify-647c808, watchdog pid 7309. Awaiting its verdict.

## UPDATE 2026-09-04 ~20:10 local — Edge #78 closed (verifier #19 running); DB round 5 FAIL closed by round 6
- Edge: verifier #18 FAIL (D130 P1 + D131/D132/D133) closed at **`be9d94f`** (index.ts
  `d050db20…`): negation vs the VERBAL completion (completionIsNegated); D131's 9-fabrication
  residual documented + proven irreducible (each paired with a real name the same boundary
  would destroy); prototype-key types fail closed; ordinal replies select by number. Battery
  29/0; run18 promoted (56); v18 proof 12/12; deno 0 new. VERIFIER #19 running on rotation
  commit `d34af15` (index.ts `d050db20…`), worktree brain-os-verify-d34af15.
- DB: round-5 reviewer (verify-647c808-campaign5 @ 0843c3e) A PASS, B PASS, C FAIL, D FAIL.
  **Round 6 pushed as master `4201a7e`**: new migration 202609040001 makes
  chat_channels.created_by_profile_id immutable except founder/admin (R5-1 P1); C guards the
  enabled-binding external-identity (R5-2) and DELETE (R5-3); D guards `id` (R5-4). personas
  53/53; round6 proof 9/9. R5-7 recorded+deferred. A and B have passed TWO rounds. C stays
  split out; 202609040001 authorized WITH C. CI run 33871917330 on 4201a7e (watched); when
  green, dispatch the round-6 reviewer ON 4201a7e (R4-6),
  template qa/verification/scratch/db_review_round6_prompt_template.txt, pinned GIT_HEAD.
- Gates: still NOT ready. A/B/D authorization awaits the round-6 reviewer PASS on D (A/B
  already 2x PASS). Edge deploy awaits verifier #19 PASS on the exact bytes.

## UPDATE 2026-09-04 ~21:05 local — Edge #79 closed (verifier #20 running); DB A/B/D at the AUTHORIZATION BOUNDARY
- Edge: verifier #19 FAIL (D134 P1 + D135/D136/D137/D138 + D131 R9b) closed at **`f27f6b7`**
  (index.ts `6407d95c…`). Battery 30/0; run19 promoted (62); v19 proof 11/11; deno 0 new.
  VERIFIER #20 running on rotation commit `b32e0e4` (index.ts `6407d95c…`),
  worktree brain-os-verify-b32e0e4, watchdog pid 11570.
- DB: round-6 reviewer (verify-4201a7e-campaign6 @ d67b147) returned **A PASS, B PASS, D PASS,
  C FAIL** (R6-0 P1 repoint-onto-own-channel; R6-1 P2 disable-then-delete). Round 7 pushed as
  master **`e7c943e`**: R6-0/R6-1 closed in C; the 3 ledger corrections landed; R6-8 deferred.
  personas 57/57; migration_round7 4/4. **A/B/D have PASSED THREE independent rounds**
  (202609020001, 202609020002, 202609030001), real-PostgreSQL CI SECURITY VERIFIED. C
  (+202609040001) stays split out, awaiting its own round-7 review.
- **AUTHORIZATION BOUNDARY REACHED for A/B/D.** Asking the founder, exactly once, to approve
  the production DB migration of A, B and D. NOT asking about C. NOT asking ALLOW_FUNCTIONS_DEPLOY
  (Edge is still verifying).

## UPDATE 2026-09-05 ~01:45 local — Edge #80 FAIL closed → run20 (54ebecc); verifier #21 dispatched; DB at prod-cred boundary
- Edge: verifier #20 (campaign #80) FAIL on b32e0e4 — D139 (P1 zero-relativizer truthful
  negative destroyed by R9b's aux arm), D142 (P1 label strip arms opposite destructive
  field), D141 (P2 negator-lexicon gap), D144 (P3 active-voice fabrication missed).
  **Closed at `54ebecc`** (index.ts sha256 `c45593237dc1862f530e223b6399b47a4c5a0d536c77aa01a9ac3d4937377dc2`):
  D139 R-ZR2 name-safe clause linker; D142 D136 dead-end on the label path (fail-closed, no
  actionType||archive default); D141 lexicon +nobody/neither/nowhere/nor/few/hardly; D144
  active-voice arm in LEGACY_PAST_COMPLETION only. Evidence: run20 102/0; collateral 0/75
  truthful destroyed & 6/50 fabrications missed (was 18/75, 7/50); battery 32/0; deno 23 ==
  baseline (0 new); **v20_mutation_proof 6/6** (coverage x4 + limits for both P1s). R-IDIOM
  NOT adopted (extraction fragility); residual documented 6.
  **VERIFIER #21 dispatched** on bookkeeping commit `0ba51a1` (index bytes identical to
  54ebecc), worktree brain-os-verify-0ba51a1, branch verify-0ba51a1-campaign81, watchdog pid
  13405, log verifier21_output.log; monitor task on watchdog-verifier21_output.state.
- DB: **A/B/D authorized by the founder** (A=202609020001, B=202609020002, D=202609030001;
  C 202609020003 + 202609040001 EXCLUDED; strict pre-write protocol). Round 7 pushed as
  master `e7c943e`. **BLOCKED at the production-credentials boundary**: this environment has
  NO supabase auth (no ~/.supabase/access-token, no DB password/URL) for the linked project
  `pvphxgrtdfrudejjhzjk`, so `migration list` / `db push --dry-run` cannot run here. Founder
  chose to run the two read-only commands themselves and paste output. Ordering fact: the
  approved set is NON-CONTIGUOUS (C sits between B and D), so a naive push would include C +
  040001 → the founder's STOP condition; a selective procedure is required and D is
  object-independent of C (grep: D's only C mentions are comments). Awaiting the pending-set
  output to finalize + locally verify the selective A/B/D-only apply.

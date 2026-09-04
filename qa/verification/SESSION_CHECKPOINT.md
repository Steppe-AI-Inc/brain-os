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

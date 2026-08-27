SCENARIO ID: SC-deployment-failure (supports SC-115 chaos + SC-123/124 migration process;
not a numbered spec scenario)

PURPOSE: A deployment failure (Edge Function deploy, DB migration, Vercel build) must fail
safely and be detectable — never silently leave production running something different from
git.

ACTOR: engineer / CI.

ORGANIZATION: n/a.

ROLE: operator.

CAPABILITIES: n/a.

PRECONDITIONS: a deploy of an Edge Function or migration.

EXPECTED RESULT — grounded in this repo's REAL deployment state:
- **Edge Function drift detection**: the deployed function may differ from git. The
  detection is `supabase functions download <fn>` + `git diff` per function
  (qa/REGRESSION_CATALOG.md "Edge Function drift"). Two real instances of undocumented
  deployed functions were found this way (`sem-artifact-analyze`, KNOWN_FAILURE_MODES.md #6).
- **CI/CD state (REAL, honest)**: `.github/workflows/supabase-functions.yml` was fixed
  2026-08-27 (correct branch `master`, correct project ref `pvphxgrtdfrudejjhzjk`) and is
  now registered/active, BUT it is **one secret away from working** — `SUPABASE_ACCESS_TOKEN`
  is not configured, so the workflow runs and fails at the deploy step. **BLOCKER for
  founder**: add `SUPABASE_ACCESS_TOKEN` (Settings → Secrets → Actions). See
  KNOWN_FAILURE_MODES.md #3. Until then, manual deploy + download + `git diff` is the only
  safety net.
- **Migration drift**: the migration ledger saying "applied" is NOT proof (it lied once —
  KNOWN_FAILURE_MODES.md #8). Verify with `_policy_drift_signature.sql` after any push
  (SC-123).
- **Failed migration**: must never leave RLS dropped / a policy missing / authorization open
  (SC-124) — prefer transactional, idempotent migrations.

EXPECTED DENIALS / DATABASE STATE: a failed deploy leaves the PRIOR working version live
(Vercel keeps the last good deployment; a failed `db push` in a transaction rolls back).

EXPECTED AUDIT EVENTS: n/a (operator-level).

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a.

AUTOMATION STATUS: PARTIAL. Drift detection (functions download + git diff; policy
signature script) is AUTOMATED/runnable. The CI/CD auto-deploy is BLOCKED on a founder
secret (KNOWN_FAILURE_MODES.md #3). Cross-ref SC-115, SC-123, SC-124,
qa/REGRESSION_CATALOG.md, qa/LIVE_SYSTEM_MAP.md.

LAST VERIFIED DATE: 2026-08-27 (drift-detection methods verified; CI/CD blocked on founder secret)

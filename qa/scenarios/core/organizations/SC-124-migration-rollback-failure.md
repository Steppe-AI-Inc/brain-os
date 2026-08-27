SCENARIO ID: SC-124-migration-rollback-failure

PURPOSE: Process documentation for a failed / rolled-back migration. A failed migration
must NEVER leave RLS dropped, a policy missing, or authorization open — the failure mode
must be "no change," never "security relaxed."

ACTOR: engineer / agent applying a migration that fails partway.

ORGANIZATION: n/a (process doc).

ACTION / requirements:

1. **Transactional migrations** — wrap DDL so a mid-migration failure rolls back the whole
   change. A `drop policy` followed by a failing `create policy` must not leave the table
   with NO policy (which, under enabled RLS, is default-deny — safe — but under a broad
   leftover policy could be OPEN). Prefer `drop policy if exists` + `create policy` as one
   atomic unit; never leave a window where the table has RLS enabled but no SELECT policy
   for a legitimate user, or (worse) RLS disabled.
2. **Never disable RLS as a "temporary" step** — `alter table … disable row level security`
   in a migration is forbidden (ENGINEER_AGENT_TRAINING.md). If a migration needs to
   rebuild policies, it drops and recreates them within the same transaction with RLS
   staying enabled.
3. **Verify post-failure state** — after any failed push, immediately run
   `_policy_drift_signature.sql` and confirm every table still has its expected policies
   and RLS enabled. A failure that left a table readable by everyone is the worst outcome
   and must be caught before the next request hits it.
4. **Idempotent + re-runnable** — a migration that half-applied must be safe to re-run
   (all statements `if exists` / `if not exists`), as the recovery migrations
   202608270001–202608270004 already are.

EXPECTED RESULT: the safe failure mode is "authorization unchanged / tighter," never
"open." A rollback restores the exact prior policy set (verified, not assumed).

AUTOMATION STATUS: MANUAL VERIFICATION ONLY (invokes the automated drift script). Cross-ref
SC-123, SC-125, qa/KNOWN_FAILURE_MODES.md #8, ENGINEER_AGENT_TRAINING.md.

LAST VERIFIED DATE: n/a (process)

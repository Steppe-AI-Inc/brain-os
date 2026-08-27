SCENARIO ID: SC-125-policy-coverage-gate

PURPOSE: A process/checklist describing what should flag a table as under-governed, so an
automated gate (CI) can eventually enforce it. Documents the signals; the gate itself is
future work.

ACTOR: CI / reviewer / auditing agent.

ORGANIZATION: n/a (process doc).

ACTION — flag a table if ANY of these hold (documented exceptions only):

1. **RLS disabled** — `pg_class.relrowsecurity = false` on a `public` table holding real
   data. (Exception: pure reference/enum tables with no tenant data, explicitly listed.)
2. **Missing operation policy** — a table with a SELECT policy but no INSERT/UPDATE/DELETE
   policy where writes are expected, OR the reverse. (Absence can be intentional
   default-deny — e.g. `audit_logs` has no UPDATE/DELETE by design, SC-103 — but that must
   be a documented decision, not an oversight.)
3. **Generic `authenticated` policy** — `using (auth.uid() is not null)` on a table with
   company-scoped or sensitive data (that is company-blind; a real leak class). `agents`
   and `ai_providers` SELECT are deliberate exceptions (catalog data), documented.
4. **Generic employee-write policy** — a broad `for all using (has_company_access(...))`
   that lets any member write manager-tier data (this is exactly KNOWN_FAILURE_MODES.md #1
   — five tables had a redundant broad `*_company_scope` policy).
5. **Missing organization enforcement** — a `company_id` column that no policy references
   (the row is company-scoped in intent but not in enforcement).
6. **Decorative sensitivity column** — a `sensitivity`/`visibility` column that exists but
   is never branched on by the table's own policy (DATA_CLASSIFICATION.md's documented gap
   for `salary_private`/`company_sensitive`).

EXPECTED RESULT: every `public` data table either passes all six or has an explicit,
reviewed exception recorded in DATA_CLASSIFICATION.md.

AUTOMATION STATUS: MANUAL VERIFICATION ONLY today. `_policy_drift_signature.sql` partially
covers signals 3–4 for known policies; a full migration-linter enforcing 1–6 is proposed
but not built (DATA_CLASSIFICATION.md "no CI check enforcing this yet"). Cross-ref
qa/REGRESSION_CATALOG.md "RLS write-bypass", qa/KNOWN_FAILURE_MODES.md #1, SC-107, SC-123.

LAST VERIFIED DATE: n/a (process); signals 3–4 spot-checked live via drift script 2026-08-27

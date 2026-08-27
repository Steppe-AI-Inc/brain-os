SCENARIO ID: SC-123-migration-upgrade-process

PURPOSE: Process documentation (not a new migration) for safely applying a schema upgrade:
start from the previous schema, load representative data, apply the migration, run the
authorization regression suite, and verify no policy was lost and existing rows retain
correct scope.

ACTOR: engineer / agent applying a migration.

ORGANIZATION: n/a (process doc).

ROLE / CAPABILITIES / PRECONDITIONS: n/a.

ACTION (the required upgrade procedure):

1. **Baseline** — from a clean DB at the prior migration head, load representative fixture
   data covering every company scope and sensitivity tier.
2. **Apply** — run the new migration (`supabase db push --linked` — a live prod push
   ALWAYS needs explicit founder authorization, per this session's standing rule).
3. **Regression suite** — run the full `qa/scenarios-runner/` suite (SC-054/056/057/069/
   070/071/072/073/074/093/103/118/119 + `_policy_drift_signature.sql`). All must still
   pass with the same verdicts.
4. **No policy loss** — run `_policy_drift_signature.sql`; the live policy set +
   authorization-function signatures must match the schema file. A missing policy or a
   drifted signature is a hard stop — this is exactly the GitHub↔production drift class
   that let a domain-gating fix silently no-op (KNOWN_FAILURE_MODES.md #8, #11).
5. **Row scope preserved** — spot-check that existing rows still resolve to the correct
   company/owner under the new policies (e.g. a pre-existing confidential memory is still
   hidden from a plain employee).
6. **Verify LIVE, not the ledger** — `supabase migration list` saying "applied" is NOT
   proof; `pg_get_expr` the changed policies against the live DB (the ledger lied once).

EXPECTED RESULT: a migration is "applied" only when the live policy set matches the schema
file AND the regression suite passes live — never on the strength of the migration ledger.

AUTOMATION STATUS: MANUAL VERIFICATION ONLY (the runner suite it invokes is automated).
Cross-ref qa/REGRESSION_CATALOG.md "RLS policy drift", qa/KNOWN_FAILURE_MODES.md #8/#11,
SC-124, SC-125.

LAST VERIFIED DATE: n/a (process); the runner suite it references was run 2026-08-27

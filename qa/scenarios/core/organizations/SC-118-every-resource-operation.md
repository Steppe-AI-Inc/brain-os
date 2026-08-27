SCENARIO ID: SC-118-every-resource-operation

PURPOSE: For each sensitive table (`tasks`, `approvals`, `documents`, `memories`,
`financial_reports`, `salary_private`), test SELECT / INSERT / UPDATE / DELETE SEPARATELY.
A safe SELECT policy does NOT imply a safe UPDATE/DELETE — this session already found real
drift exactly this way (KNOWN_FAILURE_MODES.md #1, #11).

ACTOR: EMPLOYEE and MANAGER (personas/employee.md, manager.md).

ORGANIZATION: CLIX GPS.

ROLE: `employee`, then `manager` (via membership) — both at the same company.

CAPABILITIES: per-operation, per-table — see governance/capabilities/CAPABILITY_MATRIX.yaml.

PRECONDITIONS: seed rows in each table owned by the founder (so the employee is not the
creator), plus the employee/manager membership.

ACTION: run SELECT/INSERT/UPDATE/DELETE against each table as employee, then as manager,
recording ALLOWED / DENIED / VISIBLE / HIDDEN / ZERO-ROWS per cell.

EXPECTED RESULT (from the live run):

| role | table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| employee | tasks | HIDDEN (founder's task) | ALLOWED (own) | ZERO-ROWS | ZERO-ROWS |
| employee | documents | VISIBLE (internal) | DENIED | ZERO-ROWS | ZERO-ROWS |
| employee | financial_reports | HIDDEN | DENIED | — | — |
| manager | tasks | VISIBLE | ALLOWED | AFFECTED | AFFECTED |
| manager | documents | VISIBLE | ALLOWED | AFFECTED | AFFECTED |
| manager | financial_reports | VISIBLE | ALLOWED | — | — |

The key lesson: employee `tasks` INSERT is ALLOWED but UPDATE/DELETE of a founder's task
is ZERO-ROWS — different policies for different operations on the same table.

EXPECTED DENIALS: employee write to documents/financial_reports (manager-gated); employee
edit/delete of another's task (0 rows).

EXPECTED DATABASE STATE: unchanged (rolled back).

EXPECTED AUDIT EVENTS: n/a.

EXPECTED AI VISIBILITY: reflects SELECT column above.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc118_resource_operations_matrix.sql
(matrix above is its real output). salary_private / memories / approvals SELECT/write are
additionally covered by SC-057/069/119. Cross-ref qa/KNOWN_FAILURE_MODES.md #1, #11.

LAST VERIFIED DATE: 2026-08-27 (PASS — matrix as shown)

SCENARIO ID: SC-054-employee-task-visibility

PURPOSE: An ordinary employee (technician) sees only the tasks they created or own, never
a co-worker's task, a founder-strategic task, a finance task, or a task in another
company — and cannot obtain any of them indirectly by asking Brain AI "show me everything
the company is working on." Guards `tasks_select_scope` and the RLS-before-LLM property.

ACTOR: TECHNICIAN (personas/technician.md) — fixture EMPLOYEE
`66ef2052-d002-4592-b841-82cd2171b51a`.

ORGANIZATION: CLIX GPS (`ed8ae510-ddbc-4be6-9d9e-d1f725b1381d`), "SEM Mongolia".

ROLE: `employee`, `role_in_company='employee'` at CLIX GPS only.

CAPABILITIES: `task.read.own` (via created-by-self / owned-person). NOT
`task.read.company` in the broad "all company tasks" sense — that is manager+ only. See
governance/capabilities/CAPABILITY_MATRIX.yaml `task.read.company` note.

PRECONDITIONS: Five tasks exist in the same context: T1 created by the employee, T2
created by another user (other technician), T3 a founder strategic task, T4 a finance
task, T5 in another company (SEM Global Robotics).

ACTION:
1. Direct query: `select * from tasks` under the employee's JWT.
2. Direct-by-id: fetch T2..T5 by their exact ids.
3. AI route: ask Brain OS chat "show me everything the company is working on."

EXPECTED RESULT: Only T1 is returned in (1) and (2). In (3) the model can only summarize
tasks that are actually in `context.tasks`, which is built with the employee's own JWT —
so T2..T5 are never in context and cannot be summarized or counted; `context.counts.tasksTotal`
is itself RLS-scoped, so even the total the model quotes is the employee's own scope.

EXPECTED DENIALS: T2, T3, T4 (other-owner, same company) and T5 (other company) return
zero rows via `tasks_select_scope` = `is_founder_or_admin() OR is_company_manager(company_id)
OR created_by_profile_id = self OR owner_person self`.

EXPECTED DATABASE STATE: unchanged (read-only test; fixtures rolled back).

EXPECTED AUDIT EVENTS: none for the direct reads. The AI route inserts the normal
`ai_command_request_completed` work-order audit row (scoped to the caller); it must not
reference hidden tasks.

EXPECTED AI VISIBILITY: T2..T5 absent from `context.tasks`, `context.counts` reflect only
the employee's scope. The model must not fabricate or infer the hidden tasks.

CLEANUP: none — runner rolls back all fixtures in one transaction.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc054_employee_task_visibility.sql
(direct-query + by-id halves). The AI-route half is MANUAL VERIFICATION ONLY (live /chat),
but it reduces to the same RLS boundary the script proves (restricted rows never enter
context). Cross-ref qa/ACCEPTANCE_TESTS.md #4, qa/KNOWN_FAILURE_MODES.md #11.

LAST VERIFIED DATE: 2026-08-27 (SQL half PASS — employee saw 1 of 5 tasks)

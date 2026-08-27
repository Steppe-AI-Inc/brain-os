SCENARIO ID: SC-072-change-resource-owner

PURPOSE: Owning a resource does not grant the right to mutate its security fields. An
employee who owns Task A must not be able to change `assigned_to`/`owner_person_id`,
`organization_id`/`company_id`, or `sensitivity` to manipulate visibility. Each field
follows its own capability policy.

ACTOR: ORDINARY_EMPLOYEE — fixture EMPLOYEE, owner of the task.

ORGANIZATION: CLIX GPS (and an attempt to move to SEM Global Robotics).

ROLE: `employee`.

CAPABILITIES: `tasks_update_scope` lets founder/manager/owner edit a task, but the WITH
CHECK still requires access to the target company — moving a task to a company the caller
isn't in fails.

PRECONDITIONS: a task created BY the employee in CLIX GPS.

ACTION: the employee tries `UPDATE tasks SET company_id = '<other company>'` on their own
task.

EXPECTED RESULT: the company field is unchanged — the update is filtered/blocked (the
caller has no access to the target company, and the row's final state is the same
company). Owning a task does not let you relocate it into another tenant.

EXPECTED DENIALS: cross-company move blocked; the task stays in CLIX GPS.

EXPECTED DATABASE STATE: `tasks.company_id` unchanged (verified live).

EXPECTED AUDIT EVENTS: none (0 rows changed).

EXPECTED AI VISIBILITY: n/a.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc072_073_security_field_mutation.sql
(task company unchanged after the attempt). Cross-ref SC-073, SC-119, SC-071.

LAST VERIFIED DATE: 2026-08-27 (PASS — owned-task company move left the field unchanged)

SCENARIO ID: SC-119-security-fields

PURPOSE: For every security-bearing field — `organization_id`/`company_id`,
`owner_id`/`owner_person_id`, `assigned_user_id`, `role`, `capability`, `domain`,
`sensitivity`, `approval_status`, `approved_by`/`approver_profile_id`, `risk_level`,
`visibility` — an unauthorized user attempting to mutate it must be denied. Owning a
resource does not grant the right to mutate its security fields (see also SC-072/073).

ACTOR: member-but-not-manager EMPLOYEE.

ORGANIZATION: CLIX GPS.

ROLE: `employee`.

CAPABILITIES: none of the write policies that gate these fields (manager+/hr_finance/
founder depending on the table).

PRECONDITIONS: a confidential `memory`, a `task`, and a pending `finance` approval in
CLIX GPS.

ACTION: as the employee, attempt to change `memory.sensitivity` (confidential→internal),
`memory.company_id` (to another company), `task.owner_person_id`, `approval.approver_profile_id`
(self-assign to gain approve rights), and `approval.status` (self-approve).

EXPECTED RESULT: every field is unchanged after the attempts — the RLS write policies
(`memories_write_scope` manager+, `tasks_update_scope` owner/manager, `approvals_update_approver`
domain-gated) filter the UPDATEs to 0 rows.

EXPECTED DENIALS: all five mutations affect 0 rows / leave state unchanged.

EXPECTED DATABASE STATE: memory sensitivity=confidential, memory company_id unchanged,
approval approver_profile_id NULL, approval status=pending.

EXPECTED AUDIT EVENTS: n/a (0 rows changed).

EXPECTED AI VISIBILITY: n/a.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc119_security_fields.sql. Fields
`company_id` (create-time), `sensitivity` (downgrade), and `owner`/`company` on tasks are
additionally covered by SC-071 / SC-072 / SC-073. `role`/`capability` are not user-writable
columns on any user-facing table (profiles.role is admin-only via `profiles_update_self_or_admin`
+ there is no self-service role change). `domain`/`risk_level` on approvals are covered by
the immutability gap SC-060. Cross-ref SC-071, SC-072, SC-073, SC-060.

LAST VERIFIED DATE: 2026-08-27 (PASS — all five field mutations left state unchanged)

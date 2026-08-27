SCENARIO ID: SC-071-create-object-wrong-company

PURPOSE: A Mongolia employee who manually submits `organization_id = Uzbekistan` (i.e. a
company they are not a member of) while creating a task/lead/document/message/work order
must be denied — the backend never trusts a frontend-supplied organization id blindly.

ACTOR: ORDINARY_EMPLOYEE — fixture EMPLOYEE, member of CLIX GPS only.

ORGANIZATION: attempts to write into SEM Global Robotics (`773210d1-...`, not a member).

ROLE: `employee`.

CAPABILITIES: `tasks_insert_scope` / `sales_leads_insert_member` both require
`has_company_access(company_id)` in WITH CHECK.

PRECONDITIONS: employee is a member of CLIX GPS; submits a create with a foreign company id.

ACTION: `INSERT INTO tasks (company_id='<other company>', …)` and the same for
`sales_leads`; control: the same insert into the employee's OWN company.

EXPECTED RESULT: both foreign-company inserts are DENIED (SQLSTATE 42501 — WITH CHECK
violation); the own-company insert is ALLOWED. The database is the real backstop even
though sem-ai-command ALSO cross-checks model-supplied ids against `contextCompanyIds`
server-side (defense in depth) — a hand-crafted PostgREST request bypassing the app still
hits RLS.

EXPECTED DENIALS: foreign-company task and lead inserts rejected with 42501.

EXPECTED DATABASE STATE: no foreign-company rows created; own-company row created (then
rolled back).

EXPECTED AUDIT EVENTS: none for the rejected inserts.

EXPECTED AI VISIBILITY: n/a.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc071_create_wrong_company.sql
(foreign task+lead DENIED 42501, own-company ALLOWED). Cross-ref SC-056, SC-101 (the
app-layer id cross-check), governance/SECURITY_INVARIANTS.md #2.

LAST VERIFIED DATE: 2026-08-27 (PASS — foreign-company inserts DENIED, own-company allowed)

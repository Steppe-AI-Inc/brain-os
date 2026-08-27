SCENARIO ID: SC-056-cross-company-isolation

PURPOSE: Employee A (CLIX GPS / "Mongolia") and Employee B (SEM Global Robotics / "the
other company") each have realistic tasks/customers/documents/messages/financial-reports/
sales-leads/work-orders/memories. Every route — UI, API, direct resource ID, search, Brain
AI, conversation lookup, task lookup, document lookup — must fail to cross the boundary in
BOTH directions.

ACTOR: EMPLOYEE / MANAGER of Company A — fixture EMPLOYEE.

ORGANIZATION: Company A = CLIX GPS (`ed8ae510-...`); Company B = SEM Global Robotics
(`773210d1-...`).

ROLE: `employee`, then `manager` (both tested).

CAPABILITIES: `has_company_access` / `is_company_manager` are per-company and return false
for any company the caller is not an active member of.

PRECONDITIONS: Company B has a task, project, document, financial_report, memory, and sales
lead; the caller is a member of Company A only.

ACTION: as a Company-A member (employee, then manager), query each Company-B resource by
table and by direct id, plus the `companies` row itself.

EXPECTED RESULT: 0 Company-B rows on every route, in both directions (a symmetric test — a
Company-B member equally sees 0 Company-A rows). A manager of Company A is still a plain
outsider to Company B (isolation is not weakened by manager status).

EXPECTED DENIALS: tasks, projects, documents, financial_reports, memories, sales_leads, and
the company row — all 0 for the non-member; direct-by-id returns nothing.

EXPECTED DATABASE STATE: unchanged (read-only; rolled back).

EXPECTED AUDIT EVENTS: none.

EXPECTED AI VISIBILITY: Brain AI built under a Company-A member's JWT contains 0 Company-B
rows — the AI cannot summarize, count, or reference the other company (the same boundary,
since `buildContext()` uses the caller's JWT).

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc056_cross_company_isolation.sql
(a Company-A manager saw 0 of 7 Company-B resource types). Cross-ref
qa/ACCEPTANCE_TESTS.md #12, governance/SECURITY_INVARIANTS.md #2, SC-071, SC-090.

LAST VERIFIED DATE: 2026-08-27 (PASS — 0 Company-B rows across tasks/projects/documents/
financial_reports/memories/leads/company)

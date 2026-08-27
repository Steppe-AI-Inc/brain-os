SCENARIO ID: SC-057-country-manager-not-cfo

PURPOSE: A company/country manager is not a superuser. They may approve operational
(production/general/external_comms) approvals for their company, but must NOT approve
salary/finance/legal approvals, view payroll, read cash, change salary, or modify
ownership. Prevents future developers from treating "manager" as admin.

ACTOR: COUNTRY_MANAGER (personas/country_manager.md) — fixture EMPLOYEE with a temporary
`role_in_company='manager'` at CLIX GPS.

ORGANIZATION: CLIX GPS (`ed8ae510-...`).

ROLE: `employee` (profiles.role) elevated to manager tier at one company via membership.

CAPABILITIES: `approvals_decide` for general/production/external_comms only; company-scoped
manager reads/writes. NOT `hr.read.salary`, `finance.read.cash`, `hr.approve.salary`,
`finance.approve.payment`, `legal.approve.contract`, `ownership.modify`.

PRECONDITIONS: Four pending approvals (one per domain: salary_hr, finance, legal,
production) at CLIX GPS; a `salary_private` row; a `company_sensitive` row.

ACTION: As the manager, attempt to approve each of the four approvals via
`UPDATE approvals SET status='approved'`; attempt to read `salary_private` and
`company_sensitive`.

EXPECTED RESULT: Only the `production` approval becomes `approved`. Salary/finance/legal
stay `pending`. Salary and company_sensitive reads return 0 rows.

EXPECTED DENIALS: `approvals_update_approver` grants a manager only
`domain in ('general','production','external_comms')`; salary_hr/finance require
`is_hr_finance()`, legal requires founder/admin or the explicit approver. `salary_private`
and `company_sensitive` selects return 0 (`is_hr_finance()` / `is_founder_or_admin()` only).

EXPECTED DATABASE STATE: three approvals unchanged (`pending`), one `approved`; no reads
mutate anything.

EXPECTED AUDIT EVENTS: n/a for the blocked attempts (RLS silently affects 0 rows). The
one allowed production approval, when routed through `decide_approval()` (once deployed),
writes an `approval_decided` row.

EXPECTED AI VISIBILITY: a manager's AI context includes their company's operational data
but not salary/cash rows (never fetched under their JWT).

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc057_manager_not_cfo.sql. Tests
the direct `approvals_update_approver` RLS UPDATE path (the real boundary), independent of
`decide_approval()` (unpushed). Cross-ref qa/ACCEPTANCE_TESTS.md #6,
qa/KNOWN_FAILURE_MODES.md #8, governance/capabilities/CAPABILITY_MATRIX.yaml.

LAST VERIFIED DATE: 2026-08-27 (PASS — production approved; salary/finance/legal blocked;
salary & cash reads = 0)

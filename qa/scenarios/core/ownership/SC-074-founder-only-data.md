SCENARIO ID: SC-074-founder-only-data

PURPOSE: Ownership / shareholder / founder-strategy / holding / group-finance data
(`company_sensitive`: cash_balance, revenue_monthly, ownership_notes, investor_notes) is
readable ONLY by the founder tier. An ordinary employee, a company manager, a country
manager, AND a CFO (hr_finance) must all be denied — CFO ≠ founder.

ACTOR: EMPLOYEE, MANAGER, CFO (three personas, one script).

ORGANIZATION: CLIX GPS.

ROLE: `employee`, then `company_manager` (via membership), then `hr_finance` (via role).

CAPABILITIES: `ownership.read` / `finance.read.cash` are `is_founder_or_admin()` only. No
membership or finance role grants them.

PRECONDITIONS: a `company_sensitive` row for CLIX GPS.

ACTION: Each of the three personas selects from `company_sensitive`.

EXPECTED RESULT: all three see 0 rows. Only a founder/holding_admin sees the row.

EXPECTED DENIALS: `company_sensitive_select_founder` = `is_founder_or_admin()` only.
`is_hr_finance()` and `is_company_manager()` are NOT in the policy.

EXPECTED DATABASE STATE: unchanged (read-only; rolled back).

EXPECTED AUDIT EVENTS: none.

EXPECTED AI VISIBILITY: `company_sensitive` is never in any of these personas' AI context
(never fetched under their JWT). Note the related open gap: a founder chat that surfaces
these figures could be summarized into a `memories` row whose sensitivity the model
assigns, with no write-time floor (SC-068 / governance/SECURITY_INVARIANTS.md #7).

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc074_founder_only_data.sql.
Note: `holding_admin` is inside `is_founder_or_admin()`, so a `holding_admin` (the CEO
persona) CAN read this today — an intended-vs-enforced gap documented in personas/ceo.md
(the "CEO runs operations but not the cap table" boundary is not enforced). Cross-ref
governance/SECURITY_INVARIANTS.md #4, governance/DATA_CLASSIFICATION.md (founder_only tier).

LAST VERIFIED DATE: 2026-08-27 (PASS — employee/manager/CFO each saw 0 company_sensitive rows)

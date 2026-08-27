SCENARIO ID: SC-069-search-leakage

PURPOSE: An employee searching salary / cash / shareholder / legal-dispute / termination /
bank-account keywords must not have restricted content leak via titles, snippets,
metadata, embedding results, previews, counts, ranking, or autocomplete.

ACTOR: ORDINARY_EMPLOYEE — fixture EMPLOYEE.

ORGANIZATION: CLIX GPS.

ROLE: `employee`.

CAPABILITIES: none for the restricted content.

PRECONDITIONS: confidential documents ("Shareholder agreement", "termination memo"), a
confidential memory (cash/bank figures), a financial_reports row, and a salary row with
"bank transfer" in `compensation_notes`, all in CLIX GPS.

ACTION: as the employee, run keyword searches (direct ILIKE substring, the same shape
`buildContext()` uses for its non-embedding fallback) and semantic search over these
tables.

EXPECTED RESULT: 0 restricted rows returned by any search path. Because the search runs
under the employee's JWT, RLS removes the rows before any title/snippet/count is computed —
there is no snippet to leak because there is no row.

EXPECTED DENIALS: confidential documents (2), confidential memory (1), financial_reports
(all), salary rows (all) → 0 via `documents_select_scope` / `memories_select_scope` /
`financial_reports_select_scope` / `salary_select_authorized`.

EXPECTED DATABASE STATE: unchanged.

EXPECTED AUDIT EVENTS: none.

EXPECTED AI VISIBILITY: 0 — `match_memories` is `security invoker`, so semantic retrieval
is RLS-scoped too; a confidential memory is never a similarity hit for an unauthorized
caller.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc069_search_leakage.sql (direct
SELECT + ILIKE search both return 0 for confidential docs/memories, financial_reports,
salary). Autocomplete/preview UI surfaces are MANUAL but reduce to the same 0-row boundary.
Cross-ref qa/REGRESSION_CATALOG.md, governance/SECURITY_INVARIANTS.md #6, SC-055.

LAST VERIFIED DATE: 2026-08-27 (PASS — 0 restricted rows via direct + ILIKE search)

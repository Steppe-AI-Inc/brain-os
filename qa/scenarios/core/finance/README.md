# core/finance scenarios

Finance data spans `financial_reports` (period revenue/expense/cash, confidential),
`company_sensitive` (cash/ownership, founder_only), `product_costs` /
`proposal_financials` / `proposal_item_costs` (margins, manager+), and the `finance`
approval domain.

Scenarios covering the finance domain (primary category in parentheses):
- **SC-057** (`core/approvals/`) — a manager cannot approve `finance` approvals or read
  cash. Runner `sc057_manager_not_cfo.sql`. **PASS 2026-08-27.**
- **SC-058** (`core/hr/`) — no segregation of duties for finance (hr_finance self-approves).
  **KNOWN GAP** (`qa/KNOWN_FAILURE_MODES.md` #14).
- **SC-069** (`ai/context_security/`) — employee gets 0 `financial_reports`. **PASS.**
- **SC-068** (`ai/sensitive_inference/`) — derived/inferred financial questions are denied
  too ("is it above $100k", "first digit only").
- **SC-074** (`core/ownership/`) — employee/manager/CFO all denied `company_sensitive`.
  Runner `sc074_founder_only_data.sql`. **PASS 2026-08-27.**
- **SC-118** (`core/organizations/`) — `financial_reports` SELECT/INSERT tested per role.
  **PASS.**

Ground truth: `financial_reports` gained `is_hr_finance()` access in migration 202608270003
(was a real gap — `qa/KNOWN_FAILURE_MODES.md` #12). See
`governance/capabilities/CAPABILITY_MATRIX.yaml` `finance.*` rows,
`governance/policies/FINANCE.yaml`.

# Persona: MANAGER (generic company manager / team lead)

- **Real `app_role`:** `company_manager` or `team_lead`, with a
  `company_memberships.role_in_company in ('owner','manager','team_lead')` row.
- **Fixture identity:** EMPLOYEE fixture with a temporary manager membership (rolled back).
- **Governing doc:** `governance/roles/COMPANY_MANAGER_TIER.md`.

## Scope mechanism

Identical to COUNTRY_MANAGER but framed generically. `is_company_manager(company_id)` is
satisfied by `role_in_company in ('owner','manager','team_lead')`. Note: **`team_lead`
counts as a manager** for every `is_company_manager` check — there is no finer distinction
between team_lead and manager at the RLS layer today.

## Can do

- Everything company-scoped for their own company (read + manager-gated writes), plus
  approve `general`/`production`/`external_comms` approvals. See `country_manager.md`.

## Cannot do

- Anything in the finance/salary/legal/ownership tiers (same denials as
  `country_manager.md`), and nothing at all in another company.

## The "manager is not universal" rule

This persona exists partly as a warning to future developers: it is tempting to treat
"manager" as an admin. It is not. A manager cannot approve salary, cannot see cash, cannot
cross companies. Any code path that grants a manager one of those is a bug of the exact
class already found and fixed in `qa/KNOWN_FAILURE_MODES.md` #8 (a manager could approve
finance/salary/legal before the domain-gating fix). See
`qa/scenarios/ENGINEER_AGENT_TRAINING.md`, "making manager universal."

## Role in scenarios

SC-057, SC-070, SC-072, SC-089 (promotion/demotion), CAPABILITY_MATRIX.md.

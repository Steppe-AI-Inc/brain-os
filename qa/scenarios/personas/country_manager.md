# Persona: COUNTRY_MANAGER (Mongolia / Uzbekistan)

- **Real `app_role`:** `employee` or `company_manager`, made a manager **of one company**
  via `company_memberships.role_in_company = 'manager'`.
- **Fixture identity:** EMPLOYEE fixture (`66ef2052-…`) given a temporary
  `role_in_company='manager'` membership at one company inside a rolled-back transaction.
- **Governing doc:** `governance/roles/COMPANY_MANAGER_TIER.md`.

## Scope mechanism

`is_company_manager(company_id)` returns true only for a company where the caller has an
**active** membership with `role_in_company in ('owner','manager','team_lead')`. It is
strictly per-company: a manager of CLIX GPS is a plain outsider to every other company.

- **MONGOLIA_COUNTRY_MANAGER** → manager at `CLIX GPS`
  (`ed8ae510-ddbc-4be6-9d9e-d1f725b1381d`).
- **UZBEKISTAN_COUNTRY_MANAGER** → manager at `SEM Global Robotics Technologies`
  (`773210d1-…`). **No real Uzbek entity exists** — this is a real second company used to
  test the cross-company boundary honestly (see `personas/README.md`).

## Can do (within their own company only)

- Read all company-scoped operational data: tasks, projects, documents (incl.
  confidential tier), memories (incl. confidential tier), `financial_reports`, inventory,
  proposals, sales leads, people.
- Write manager-gated data: `projects`, `documents`, `people`, `product_lines`,
  `inventory_items`, task edit/delete.
- Approve `general` / `production` / `external_comms` approvals for their company
  (`approvals_update_approver`).

## Cannot do (the "manager is not a superuser" boundary — SC-057)

- **Cannot** approve `salary_hr` or `finance` approvals (those need `hr_finance`).
- **Cannot** approve `legal` approvals (founder/admin or explicit approver only).
- **Cannot** read/modify `salary_private` — not `is_hr_finance()`.
- **Cannot** read `company_sensitive` (cash/ownership) — founder only.
- **Cannot** modify `company_relationships` / ownership — founder only.
- **Cannot** touch **any** data of another company — every function returns false for a
  company they are not a member of. This is the cross-company isolation boundary
  (SC-056, adversarial/cross_company).

## Known operational caveat

`audit_logs`, `work_orders`, `chat_channels` have `company_id` NULL on all real rows
today, so the `is_company_manager(company_id)` branch on those tables is **inert** — a
country manager currently cannot see their team's audit trail / work orders. Over-
restrictive, not a leak. See `qa/KNOWN_FAILURE_MODES.md` #7.

## Role in scenarios

SC-054, SC-056, SC-057, SC-071, SC-074, SC-090, and most of `adversarial/cross_company`.

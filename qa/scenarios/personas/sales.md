# Persona: SALES_EMPLOYEE

- **Real `app_role`:** `employee` — **no dedicated `sales` role exists.**
- **Fixture identity:** EMPLOYEE fixture with a temporary `employee` membership.
- **Governing doc:** `governance/roles/EMPLOYEE_BASELINE.md`.

## Scope mechanism

`has_company_access(company_id)`. The only sales-specific rights in the schema attach to
**membership**, not to a sales role:

- `sales_leads_insert_member`: any active company member may create a lead.
- `sales_leads_update_own_or_manager`: a member may update a lead they **own**
  (`owner_person_id` linked to their profile) or that they manage; a manager may update
  any lead.
- `sales_leads_delete_manager`: only a manager may delete a lead.

## Honest gap

A real `sales` role might one day carry pipeline rights an ordinary employee lacks (e.g.
seeing every lead in the company, or `proposal_financials` margin visibility for quoting).
**None of that is differentiated today** — a "salesperson" is an `employee` who happens to
own some `sales_leads` rows. Any scenario that assumes a distinct sales capability must be
marked accordingly.

## Cannot do

- Cannot see `proposal_financials` (margins/costs) — manager+ only. A salesperson can see
  a proposal's public fields and its `unit_price`, but **not** the internal margin.
- Cannot see another member's leads' restricted fields beyond normal lead visibility,
  cannot cross companies, cannot see finance/salary tiers.
- **"Assigned customer conversations" do not exist** — there is no conversation/messaging
  subsystem. Any sales scenario involving customer messages is `NOT APPLICABLE` (see
  `messaging/`).

## Role in scenarios

SC-055, SC-080 (Messenger sales lead — NOT APPLICABLE), SC-084 (external message
approval — the approval half is testable, the send half is not), CAPABILITY_MATRIX.md
`sales.*` rows.

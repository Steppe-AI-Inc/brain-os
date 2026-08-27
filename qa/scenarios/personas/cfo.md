# Persona: CFO

- **Real `app_role`:** `hr_finance`.
- **Fixture identity:** no dedicated fixture yet. Runner scripts simulate it by setting
  the EMPLOYEE fixture's `profiles.role = 'hr_finance'` **inside a rolled-back
  transaction** (never committed). Provisioning a persistent `hr_finance` fixture is
  tracked in `qa/TEST_PERSONAS.md`.
- **Governing doc:** `governance/roles/HR_FINANCE.md`.

## Scope mechanism

Domain authority, not company-membership-based. `is_hr_finance()` is
`role in ('founder','holding_admin','hr_finance')` — it does **not** require a
`company_memberships` row. An `hr_finance` account sees finance/HR data **across all
companies** (there is no per-company finance scoping for this role today).

## Can do

- Read/write `salary_private` (`salary_select_authorized`, `salary_write_hr`).
- Read/write `financial_reports` (`is_hr_finance()` branch added in migration
  `202608270003` — this was a real gap, see `qa/KNOWN_FAILURE_MODES.md` #12).
- Read `salary_rules`, `kpi_records`, `service_credit_ledger`, `ai_pricing_settings`.
- Approve `salary_hr` and `finance` domain approvals (`approvals_update_approver`).

## Cannot do (CFO ≠ founder)

- **Cannot** read `company_sensitive` (cash_balance, revenue_monthly, ownership_notes,
  investor_notes) — that is `is_founder_or_admin()` only. `hr_finance` is **not** inside
  that check. A CFO sees `financial_reports` (period revenue/expense records) but **not**
  the founder-only cash/ownership table.
- **Cannot** approve `legal` domain approvals — `legal` routes to founder/admin or the
  explicit assigned approver only, with no `hr_finance` branch.
- **Cannot** approve `production` / `general` / `external_comms` approvals unless also a
  company manager of that company — those route to `is_company_manager()`.
- **Cannot** modify company ownership relationships (`company_relationships` is founder
  only).

## Segregation-of-duties note (real gap)

`hr_finance` has **full** insert/update/delete on `salary_private` with no
preparer-vs-approver split. A CFO can both create a salary change and approve its
approval. See `personas/bookkeeper.md` and `SC-058`. This is `qa/KNOWN_FAILURE_MODES.md`
#14 — a documented gap, not a passing control.

## Role in scenarios

The "senior finance authority that is still not the owner" boundary: SC-057 (country
manager is not CFO), SC-074 (CFO does not get founder-only data), SC-058 (no SoD).

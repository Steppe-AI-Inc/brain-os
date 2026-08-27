# Persona: ORDINARY_EMPLOYEE

- **Real `app_role`:** `employee`.
- **Fixture identity:** the primary negative control —
  `profiles.id = 66ef2052-d002-4592-b841-82cd2171b51a`,
  `auth_user_id = 9c92a8d5-853c-4ef3-846a-f4fe8c42d97a`. Zero active memberships by
  default; runner scripts add a temporary `role_in_company='employee'` membership and
  roll it back.
- **Governing doc:** `governance/roles/EMPLOYEE_BASELINE.md`.

## Scope mechanism

`has_company_access(company_id)` only, and only for a company where they hold an active
membership. No `is_company_manager`, no `is_hr_finance`, no `is_founder_or_admin`.

## Can do (within their own company)

- Read company-scoped **non-sensitive** data: `companies` (core fields), `projects`,
  `people`, `product_lines` (price but not cost — cost lives in manager-gated
  `product_costs`), `inventory_items`, `proposals` (not the `proposal_financials`
  margins), `sales_leads`, `goals`, public/internal `documents` and `memories`.
- Read **their own** tasks (created-by-self or owned via a linked `people` row) — **not**
  the whole company task list. `tasks_select_scope` is founder/manager/creator/owner
  (this was tightened in migration `202608270004`; a prior drift let any member see all
  company tasks — `qa/KNOWN_FAILURE_MODES.md` #11).
- Create tasks, create sales leads, create work orders (as themselves).
- Read their own `audit_logs`, `work_orders`, `model_usage`.

## Cannot do — the core of most security scenarios

- **Cannot** read `financial_reports`, `product_costs`, `proposal_financials`,
  `salary_private`, `salary_rules`, `company_sensitive`, `kpi_records` (unless the KPI
  subject is them), confidential/restricted `documents` or `memories`,
  `company_relationships`.
- **Cannot** approve any approval (not a manager, not hr_finance, not the assigned
  approver) — `approvals_update_approver` returns false.
- **Cannot** edit/delete another person's task; **cannot** delete any task (delete is
  manager+).
- **Cannot** obtain any of the above **indirectly** through Brain AI — `sem-ai-command`
  runs as this employee's own JWT, so restricted rows never enter the model's context in
  the first place (SC-055, SC-068, `ai/context_security`).
- **Cannot** cross into another company by any route (SC-056).

## Role in scenarios

The workhorse negative control. Used in SC-054, SC-055, SC-056, SC-068, SC-069, SC-070,
SC-071, SC-072, SC-073, SC-088, SC-118, SC-119, and most of `adversarial/`.

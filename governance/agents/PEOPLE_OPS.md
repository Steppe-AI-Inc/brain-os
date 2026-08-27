# AI HR/KPI Manager (`agents.role = 'people_ops'`)

Registry label only — see `README.md`. Conventional `owner_agent_id` for KPI-review and
salary-impact-recommendation tasks (`fallbackPlan()` routes any command containing
"kpi"/"salary" to this label).

## Proposed charter (aspirational)
- **May see:** KPI records, performance scores — `hr.read.salary`-adjacent but not
  identical (KPI visibility is broader: manager+ can see it, not just hr_finance).
- **May decide (AUTO):** draft a KPI review, flag an underperformance pattern.
- **Requires approval (L4, forced by keyword detection regardless of this agent's own
  judgment):** any salary-impact recommendation — verified live 2026-08-27 that the
  forced-approval keyword scan overrides task-level `approvalRequired: false` for
  exactly this category, independent of which agent label the task carries.
- **Must escalate:** actually modifying `salary_private` (`hr.modify.salary`) — no task
  execution path writes to that table directly regardless of agent label; only a human
  with `is_hr_finance()` can, through the normal RLS-gated write path.

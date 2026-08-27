# Roles — read this before any individual role file

Brain OS has **two independent role axes**, not one. Confusing them was a real risk this
directory exists to prevent — confirmed via live testing 2026-08-27 that most of the
`app_role` enum's values are dead code at the RLS layer.

## Axis 1: `profiles.role` (global, one value per person, `app_role` enum)

`founder`, `holding_admin`, `hr_finance`, `company_manager`, `team_lead`, `employee`,
`contractor`, `investor_viewer`, `ai_agent`.

**Only three of these nine values are ever actually checked by any RLS policy or
function**: `founder` and `holding_admin` (via `is_founder_or_admin()`), and
additionally `hr_finance` (via `is_hr_finance()`). The other six —
`company_manager`, `team_lead`, `contractor`, `investor_viewer`, `ai_agent` — are
**never referenced by any policy**. Setting `profiles.role = 'company_manager'` on a
person grants them nothing beyond what `employee` already grants. Verified live
2026-08-27: an `investor_viewer`-tier test account saw identical data to a plain
`employee` — not reduced, not different.

## Axis 2: `company_memberships.role_in_company` (per-company, free text)

`owner`, `manager`, `team_lead`, `employee`, `contractor`, `viewer` (per the column
comment — this is `text`, not an enum, so it isn't schema-enforced to only these
values). **This is the axis that actually grants elevated access** — `is_company_manager(company_id)`
checks `role_in_company in ('owner','manager','team_lead')`.

Note the name collision: `team_lead` and `contractor` appear in *both* axes with
different meanings and different (real vs. inert) effect. A person can be
`profiles.role = 'employee'` (global, does nothing special) and simultaneously
`role_in_company = 'manager'` at one company (real, grants `is_company_manager()`) — the
two columns don't need to agree and usually won't for most people.

## Where job titles fit in (sales/engineer/technician/country manager)

None of these are role values at all — they live in `people.role_title` as free text,
purely descriptive, with zero RLS relevance. A "Country Manager" job title has no
special access; what matters is whether that person's `company_memberships.role_in_company`
happens to be `manager`/`owner`/`team_lead` at their company. Two people both titled
"Country Manager" at different companies could have completely different real access if
one has `role_in_company='manager'` and the other has `role_in_company='employee'`.

## Files in this directory

Each file below documents one real, RLS-relevant tier — either a `profiles.role` value
that's actually checked, or the `role_in_company` axis as a whole (since its six values
collapse to two real tiers: manager-or-above vs. everyone-else).

- `FOUNDER.md` / `HOLDING_ADMIN.md` — the two `profiles.role` values that satisfy
  `is_founder_or_admin()`, functionally identical.
- `HR_FINANCE.md` — the one additional `profiles.role` value with real, distinct reach.
- `COMPANY_MANAGER_TIER.md` — the `role_in_company` axis (owner/manager/team_lead vs.
  employee/contractor/viewer), since this is where per-company elevation actually lives.
- `EMPLOYEE_BASELINE.md` — what a person with no special grants on either axis can see;
  this is also the effective ceiling for `contractor`/`investor_viewer`/`team_lead`/
  `company_manager` as *global* `profiles.role` values, since none of those add anything.
- `AI_AGENT.md` — the one `profiles.role` value with no live-tested behavior yet.

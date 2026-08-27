# AI Agent (`profiles.role = 'ai_agent'`)

The one `app_role` enum value with genuinely unknown/untested live behavior. Not checked
by `is_founder_or_admin()` or `is_hr_finance()`, so by the same logic as
`EMPLOYEE_BASELINE.md`, a profile with this role gets exactly the employee baseline
unless it also has a `role_in_company` membership at manager tier.

## Important distinction: this is NOT the same thing as an `agents` table row
The `agents` table (`chief_of_staff`, `finance_cfo`, `bookkeeping`, `people_ops`,
`proposal`, `qa`, `sales`, `software`, `engineering_drafter`) is pure registry
metadata — a label a `task.owner_agent_id` can point to. There is no execution engine
per agent and, as far as could be found in this codebase, **no `profiles` row with
`role = 'ai_agent'` and a real `auth_user_id` currently exists** — meaning nothing
actually authenticates *as* an AI agent today. All AI-driven work happens through
`sem-ai-command`, authenticated as the human who sent the chat message, using *their*
JWT and *their* RLS scope (see `SECURITY_INVARIANTS.md` #6) — the AI itself never has an
independent identity or independent RLS grants.

## Verified
Not tested this pass — flagged as genuinely unknown rather than assumed safe, since
unlike `investor_viewer`/`contractor`/`team_lead`/`company_manager` (confirmed inert by
exhaustive grep), this one wasn't individually re-confirmed live. Grep-confirmed inert by
the same method as the others (never referenced in any policy), but worth a live test if
this role is ever actually assigned to a real profile.

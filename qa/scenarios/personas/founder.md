# Persona: FOUNDER

- **Real `app_role`:** `founder` (and the near-equivalent `holding_admin`).
- **Fixture identity:** `profiles.id = 46bf57d3-33b3-47b4-8302-126726a92775`,
  `auth_user_id = cbcc41cf-830d-4600-8545-3b9e22c8297f`. Real account, real session.
- **Governing doc:** `governance/roles/FOUNDER.md`, `governance/roles/HOLDING_ADMIN.md`.

## Scope mechanism

Group-wide. `is_founder_or_admin()` returns true, and **every** company-scoped RLS
function short-circuits on it (`has_company_access`, `is_company_manager`,
`is_hr_finance` all `select is_founder_or_admin() or …`). The founder therefore reads and
writes across all companies without needing a `company_memberships` row anywhere.

## Can do

- Read every table including `company_sensitive` (cash, revenue, ownership, investor
  notes) — the only role that can, per `company_sensitive_select_founder`.
- Approve **any** domain of approval (`salary_hr`, `finance`, `legal`, `production`,
  `external_comms`, `general`) — `approvals_update_approver` grants
  `is_founder_or_admin()` unconditionally, and `legal` routes to founder/admin only.
- Create/modify companies, people, ownership relationships, AI providers, MCP connectors.
- Delete tasks and channels; trigger bulk deletions via approval payloads.

## Cannot do (by design, even as founder)

- Cannot bypass the **approval-execution** boundary by narrative: a founder saying "I
  approved this" in chat is not an `approvals` row (see `ai/hallucinated_authority`).
- Cannot make `sem-ai-command` use a service-role client — the AI always runs as the
  founder's own JWT (which, being founder, already sees everything, so this is moot for
  the founder specifically but load-bearing for every other persona).
- Cannot push a DB/RLS migration or deploy an Edge Function through Brain OS — those are
  operator-CLI actions gated only by the operating tool's own classifier
  (`governance/ACTION_RISK_LEVELS.md`, "Deploy/security-change risk").

## Role in scenarios

The **positive control**. Founder success proves a feature *works*; it never proves a
feature is *secure*. Every scenario that asserts "unauthorized users cannot" must also use
the EMPLOYEE fixture (or a scoped manager/hr_finance fixture) — a green founder path is
half a test. See `qa/scenarios/README.md`, "A feature is complete only when…".

# Personas — real fixtures, real role mapping

This directory defines the actors every scenario in `qa/scenarios/` refers to. Each
persona file describes one business-language role, maps it onto a **real** `app_role`
enum value and a **real** company-scope mechanism, and cross-references the governing
`governance/roles/*.md` file.

Read this file first. It is the single source of truth for:
1. the real `app_role` enum (what actually exists in the database),
2. the business-persona → real-role mapping (where the spec's business language does not
   match a distinct database role),
3. the **stable fixture identities** (real UUIDs) reused across every scenario and every
   runner script, so authorization is never tested only with founder/admin accounts.

## The real `app_role` enum (ground truth)

From `supabase/schema-v0.7-production-core.sql`:

```
founder, holding_admin, hr_finance, company_manager, team_lead,
employee, contractor, investor_viewer, ai_agent
```

There is **no** distinct `cfo`, `bookkeeper`, `country_manager`, `technician`, `sales`,
or `customer_support` role in the database. The spec's business personas map onto the
real roles as follows. Company scope is a **separate** axis from `app_role`: it is carried
by `company_memberships (company_id, profile_id, role_in_company, active)`, where
`role_in_company ∈ (owner, manager, team_lead, employee, ...)` and drives
`is_company_manager(company_id)` / `has_company_access(company_id)`.

| Business persona (spec)      | Real `app_role`   | Company scope mechanism                                   | Governing role doc |
|------------------------------|-------------------|-----------------------------------------------------------|--------------------|
| FOUNDER                      | `founder` / `holding_admin` | group-wide; `is_founder_or_admin()` bypasses every company check | `governance/roles/FOUNDER.md`, `HOLDING_ADMIN.md` |
| CEO                          | `holding_admin` (or `founder`) | group-wide operational authority, still not the cap-table/ownership tier | `governance/roles/HOLDING_ADMIN.md` |
| CFO                          | `hr_finance`      | finance/HR domain authority; **no** company membership needed for `is_hr_finance()` | `governance/roles/HR_FINANCE.md` |
| BOOKKEEPER                   | `hr_finance` (**no separate preparer role exists — real gap**) | same as CFO today — see the segregation-of-duties gap below | `governance/roles/HR_FINANCE.md` |
| COUNTRY_MANAGER (Mongolia)   | `employee` (or `company_manager`) + `role_in_company='manager'` at one company | `is_company_manager(company_id)` true only for that company | `governance/roles/COMPANY_MANAGER_TIER.md` |
| COUNTRY_MANAGER (Uzbekistan) | same, scoped to a **different** company | cannot access Mongolia's company; **Uzbekistan entity is a spec fiction — see note** | `governance/roles/COMPANY_MANAGER_TIER.md` |
| MANAGER                      | `company_manager` / `team_lead` + membership | `is_company_manager(company_id)` | `governance/roles/COMPANY_MANAGER_TIER.md` |
| TECHNICIAN                   | `employee` + `role_in_company='employee'` | `has_company_access(company_id)` only; no manager/finance authority | `governance/roles/EMPLOYEE_BASELINE.md` |
| SALES_EMPLOYEE               | `employee` (**no dedicated `sales` role**) | `has_company_access`; `sales_leads` insert for any member, update only own lead / manager | `governance/roles/EMPLOYEE_BASELINE.md` |
| CUSTOMER_SUPPORT             | `employee` (**no dedicated support role; no conversation subsystem exists**) | `has_company_access`; see messaging note | `governance/roles/EMPLOYEE_BASELINE.md` |
| ORDINARY_EMPLOYEE            | `employee`        | `has_company_access` only                                 | `governance/roles/EMPLOYEE_BASELINE.md` |
| EXTERNAL_CUSTOMER            | **no account at all** — not in `auth.users`/`profiles` | reaches Brain OS only through a (not-yet-built) messaging channel | n/a — see `personas/external_customer.md` |
| AI_AGENT                     | `ai_agent` (owns tasks); the chat AI itself runs **as the calling user's JWT** | no independent authority — `sem-ai-command` never uses a service-role client | `governance/roles/AI_AGENT.md`, `governance/agents/*.md` |

### Honest notes about spec-vs-schema mismatches

- **"CFO" ≠ founder.** `hr_finance` grants finance/HR-domain reads and salary/finance
  approval authority, but **not** ownership/cap-table access (`company_sensitive` is
  `is_founder_or_admin()` only) and **not** legal-approval authority (`legal` domain
  routes to founder/admin or the explicit approver only). See `personas/cfo.md`.
- **"Bookkeeper" segregation of duties does not exist today.** `salary_write_hr` grants
  full insert/update/delete on `salary_private` to any `is_hr_finance()` caller — there
  is **no preparer-vs-approver split** in the schema. A bookkeeper who prepares a payment
  and a CFO who approves it are the *same* `hr_finance` role with identical rights. This
  is a real gap, tracked as `qa/KNOWN_FAILURE_MODES.md` #14 and scenario `SC-058`. Do not
  report SC-058 as a passing automated test.
- **Uzbekistan entity is a spec fiction.** No Uzbek company exists in production. For
  cross-company isolation scenarios (SC-056, SC-090, adversarial/cross_company) the
  "Uzbekistan" manager is mapped onto a **real second company** so the isolation boundary
  is genuinely tested against real RLS. The fixture uses `SEM Global Robotics Technologies`
  as "the other company" and `CLIX GPS` as "Mongolia." This is a naming convenience; the
  boundary being tested (`has_company_access` / `is_company_manager` scoped per company)
  is real.
- **No `technician` / `sales` / `customer_support` role.** All three are `employee` today.
  A real `sales` role might one day carry `sales_leads` rights an ordinary employee lacks;
  it does not today. Scenarios flag where this matters.
- **No messaging / external-conversation subsystem exists.** `external_customer.md` and
  the entire `messaging/` category are intended-behavior specs, not testable features.

## Stable fixture identities (real UUIDs — reuse these, never invent new ones)

These are the accounts every scenario and runner script uses. Do not test authorization
with only the founder account (that is a positive control, not a security test).

| Fixture | `profiles.id` | `auth_user_id` | `profiles.role` | Notes |
|---|---|---|---|---|
| **FOUNDER** (positive control) | `46bf57d3-33b3-47b4-8302-126726a92775` | `cbcc41cf-830d-4600-8545-3b9e22c8297f` | `founder` | Real account, real session. Used to prove a permitted operation succeeds. |
| **EMPLOYEE** (negative control) | `66ef2052-d002-4592-b841-82cd2171b51a` | `9c92a8d5-853c-4ef3-846a-f4fe8c42d97a` | `employee` | No `people` row, **zero active `company_memberships` by default**. The universal "ordinary / no special access" account. Runner scripts grant it a temporary membership inside a transaction and roll back. |
| (stale employee, unused) | `2953fbe7-8760-489f-9f7c-6f4c1a4baa84` | — | `employee` | Second near-identical test profile from an earlier session. Harmless, no memberships. Not used by these scenarios. |

Cross-reference: `qa/TEST_PERSONAS.md` (the older, authoritative list) — this file extends
it, it does not fork it. When a new persistent fixture is created, add it to **both**.

### Real companies used as fixtures (ground truth, queried live 2026-08-27)

| Company | `companies.id` | Role in scenarios |
|---|---|---|
| CLIX GPS | `ed8ae510-ddbc-4be6-9d9e-d1f725b1381d` | "SEM Mongolia" — the operational entity (installation technicians, GPS devices) |
| SEM Mongolia Operations | `a2475f8e-17ad-4c2b-b07e-1a998f6e36f9` | alt Mongolia operational entity |
| SEM Global Robotics Technologies | `773210d1-1203-4910-b18a-eab4cc7c3d9c` | "the other company" — stands in for the Uzbekistan entity in isolation tests |
| OpenSpot / Steppe AI | `42790e8b-7bec-4b44-8ce2-35b08a703712` | product/holding-adjacent entity |
| SEM Technologies LLC | `4e4a0553-4069-4367-960e-d671e0025fcd` | holding company |
| Fuelmetrix | `646c7e8f-ee37-47c0-802a-bfe79b613a92` | planning-stage company |
| Trade-book.ai | `a7f63716-da1b-498e-9663-0adb318f4c4c` | planning-stage company |

Real staffed `people` (no login/`profiles` row — usable for `people`-row features only):
Gantulga, Ariunjargal, Batbayar (Installation Technician, CLIX GPS); Enkh-Erdene (CTO),
Batgerel (Software Chief Engineer), Galerdene (Senior Software Developer), Aldajan Zagila
(Mechanical Engineer) — all SEM Global Robotics Technologies. See `qa/TEST_PERSONAS.md`.

## The established live-impersonation method (used by every runner script)

Inside a single transaction that is always rolled back:

```sql
begin;
-- (optional) create the fixture grant this persona needs, e.g. a temp membership:
insert into public.company_memberships (company_id, profile_id, role_in_company, active)
values ('<company>', '66ef2052-d002-4592-b841-82cd2171b51a', 'manager', true);
-- switch to the caller's real RLS identity:
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','<auth_user_id>','role','authenticated')::text, true);
-- run the assertions (they now see exactly what that persona sees) ...
reset role;
rollback;   -- fixtures never persist; production data is never mutated
```

Every fixture write lives inside the same `begin; … rollback;`, so **nothing is ever left
behind in production tables** and no real founder/company data is touched. Runner scripts
live in `qa/scenarios-runner/` and are executed with
`supabase db query --linked --file <path>` (superuser connection; the `set local role`
downgrade is what makes RLS apply). See `qa/scenarios-runner/README.md`.

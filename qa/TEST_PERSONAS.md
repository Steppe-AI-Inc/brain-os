# Test Personas

Real accounts/fixtures used for impersonation testing, and their actual current state.
Keep this file in sync with what really exists — don't list a persona as "available" if
its `company_memberships` row was removed after the last test (most are, deliberately,
to avoid leaving stray access grants lying around in real company data).

## Founder (positive control)

- `profiles.id = 46bf57d3-33b3-47b4-8302-126726a92775`, `auth_user_id =
  cbcc41cf-830d-4600-8545-3b9e22c8297f`, `role = 'founder'`
- Real account, real session, used directly via browser for positive-control checks.

## Non-manager employee (negative control)

- `profiles.id = 66ef2052-d002-4592-b841-82cd2171b51a`, `auth_user_id =
  9c92a8d5-853c-4ef3-846a-f4fe8c42d97a`, `role = 'employee'`
- No `people` row, no default `company_memberships`. Test procedure: `INSERT INTO
  company_memberships (company_id, profile_id, role_in_company, active) VALUES
  ('<company>', '66ef2052-d002-4592-b841-82cd2171b51a', 'employee', true)`, run the
  impersonation queries, then `DELETE FROM company_memberships WHERE profile_id =
  '66ef2052-...'` immediately after. **As of the last cleanup in this session, this
  account has zero active memberships** — any test using it must re-add the membership
  first.
- There is a second near-identical stale test profile
  (`2953fbe7-8760-489f-9f7c-6f4c1a4baa84`) from an earlier session — not currently used,
  not cleaned up (harmless, no memberships).

## Real staffed people (not logins — no `auth.users`/`profiles` row yet)

Useful for testing features that operate on `people` rows directly (KPI, onboarding
plans, Role Knowledge Packs) without needing a real session:
- Gantulga, Ariunjargal, Batbayar — Installation Technician, CLIX GPS
- Enkh-Erdene — CTO, SEM Global Robotics Technologies
- Batgerel — Software Chief Engineer, SEM Global Robotics Technologies
- Galerdene — Senior Software Developer, SEM Global Robotics Technologies
- Aldajan Zagila — Mechanical Engineer, SEM Global Robotics Technologies

## Not yet created

holding_admin, hr_finance, company_manager, team_lead, sales, engineer, technician,
contractor, investor_viewer — no dedicated test fixture for any of these roles exists
yet. `employee` (above) is used as a stand-in "ordinary, no special access" case, which
is close to but not identical to `technician`/`sales`/`engineer` specifically (e.g. a
real `sales` role might have `sales_leads` INSERT/UPDATE rights an ordinary employee
doesn't). Creating real fixtures for these is the next concrete step toward a complete
SECURITY_MATRIX.md.

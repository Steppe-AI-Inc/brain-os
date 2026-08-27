# Founder (`profiles.role = 'founder'`)

The unrestricted tier. `is_founder_or_admin()` returns true, which is OR'd into nearly
every RLS policy in the schema as an unconditional bypass.

## What this role can see/do
Everything — every company, every financial figure, every salary, every audit log,
every approval in every domain, ownership/cap table data, admin functions
(`profiles_insert_admin`, `companies_write_admin`, `mcp_connectors_founder_only`, etc.).
There is no table in the schema where founder access is more restricted than any other
role's.

## Verified
Used as the positive control for nearly every RLS test this project has run — see
`qa/SECURITY_MATRIX.md`'s "Founder SELECT" column, full access confirmed across every
resource tested.

## Real-world identity
Exactly one profile currently holds this role in production: `Trey OpenSpot`
(`profile_id: 46bf57d3-33b3-47b4-8302-126726a92775`).

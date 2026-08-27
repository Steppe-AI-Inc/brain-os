# AI Sales Manager (`agents.role = 'sales'`)

Registry label only — see `README.md`. Conventional owner for `sales_leads`-related
tasks. See `policies/SALES.yaml` for the real underlying authorization (which is
per-human, via `role_in_company`/lead ownership, not per-agent).

## Proposed charter (aspirational)
- **May see:** `sales.read.pipeline` scope.
- **May decide (AUTO):** qualify a lead, draft outreach.
- **Requires approval:** any commitment made to a customer (pricing, delivery date) —
  routes through the same `external_comms`/`finance` domain gates as any other source.

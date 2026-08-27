SCENARIO ID: SC-086-credential-expiry

PURPOSE: When a channel token expires, health must read EXPIRED / REAUTH_REQUIRED, the
system must fail safely, the operator must see a clear status, and no token may appear in
UI or logs.

ACTOR: operator / system (messaging or integration).

ORGANIZATION: any.

ROLE: operator.

CAPABILITIES: n/a — no external channel tokens exist yet.

PRECONDITIONS: (future) an integration whose provider token has expired.

EXPECTED RESULT (intended, and a real DESIGN REQUIREMENT for the future integration): the
integration surfaces a health status (`EXPIRED` / `REAUTH_REQUIRED`), refuses to send
(fails safely rather than erroring cryptically), shows the operator a clear reauth prompt,
and NEVER renders or logs the token value (SC-104).

**The real, existing analog to reuse**: MCP connector tokens are already stored in Supabase
Vault and only ever accessed through the founder-only `get_mcp_connector_token` SECURITY
DEFINER RPC (schema line 725) — the token is never a plain DB column readable by the app,
never logged. A future channel token MUST follow this same Vault + SECURITY DEFINER pattern,
plus add a health/expiry status column so expiry is observable (the MCP connectors have a
`last_status` field to build on).

EXPECTED DENIALS / DATABASE STATE / AUDIT / AI VISIBILITY: per the intended design; token
never exposed.

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented (no external channel token).
Flagged as a real design requirement for the future integration, with the MCP-vault pattern
as the template. Cross-ref SC-104, SC-109, governance/capabilities/CAPABILITY_MATRIX.yaml
(MCP connectors), schema lines 706–763.

LAST VERIFIED DATE: n/a (feature not built; MCP-vault template exists)

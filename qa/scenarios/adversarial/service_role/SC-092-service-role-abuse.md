SCENARIO ID: SC-092-service-role-abuse

PURPOSE: Having a frontend route to a service-role backend function must not equal
authorization. A service-role backend function must verify caller identity / company
membership / capability / resource scope itself. Audit every service-role code path.

ACTOR: ORDINARY_EMPLOYEE attempting to reach a privileged endpoint.

ORGANIZATION: n/a.

ROLE: `employee`.

CAPABILITIES: none that a service-role path could grant.

PRECONDITIONS: search the codebase for every `SUPABASE_SERVICE_ROLE_KEY` / service-role
client usage.

ACTION: grep all Edge Functions and web/ for service-role clients; attempt to invoke any
privileged endpoint as an employee.

EXPECTED RESULT — verified 2026-08-27:
- **No service-role client exists in any request path.** `grep -rln "SERVICE_ROLE|serviceRole|
  service_role" supabase/functions web` (excluding node_modules/.next/generated types) →
  ZERO matches. All 6 Edge Functions (`sem-ai-command`, `analyze-financial-document`,
  `embed-text`, `generate-technical-drawing`, `sem-artifact-analyze`, `generate-onboarding-plan`)
  construct their Supabase client with `SUPABASE_ANON_KEY` + the caller's `Authorization`
  header, so RLS applies to every query AS THE CALLER. There is no "frontend route to a
  service-role function" to abuse — the pattern the scenario warns about does not exist here.
- The only SECURITY DEFINER (privilege-elevated) surface is the MCP-connector vault RPCs
  (`create/get/delete_mcp_connector_secret`), which each self-check `is_founder_or_admin()`
  and raise for anyone else — confirmed DENIED for an employee in sc093.

EXPECTED DENIALS: an employee invoking any Edge Function gets only their own RLS-scoped
data; the MCP RPCs raise `not authorized`.

EXPECTED DATABASE STATE: unchanged.

EXPECTED AUDIT EVENTS: normal per-function audit.

EXPECTED AI VISIBILITY: sem-ai-command's context is RLS-scoped (no service role), the
architectural foundation of every AI-context scenario.

CLEANUP: n/a.

AUTOMATION STATUS: AUTOMATED — grep (static) DONE 2026-08-27 (zero service-role clients),
MCP-RPC self-check proven live in qa/scenarios-runner/sc093_security_definer_audit.sql
(employee `create_mcp_connector_secret` → DENIED). If a future change EVER introduces a
service-role client in a user-facing path, this scenario becomes a hard failure. Cross-ref
SC-093, governance/SECURITY_INVARIANTS.md #6, ENGINEER_AGENT_TRAINING.md ("service_role in
a user-facing request").

LAST VERIFIED DATE: 2026-08-27 (PASS — no service-role client anywhere; MCP RPCs self-deny)

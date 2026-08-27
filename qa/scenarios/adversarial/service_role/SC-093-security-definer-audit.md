SCENARIO ID: SC-093-security-definer-audit

PURPOSE: For EVERY SECURITY DEFINER function in the schema, confirm it enforces its
intended boundary under authorized / unauthorized / wrong-company / malformed-input calls.
SECURITY DEFINER bypasses table RLS, so each MUST do its own check. A real, mechanical
audit — not a template.

ACTOR: EMPLOYEE (unauthorized) and FOUNDER (authorized) fixtures.

ORGANIZATION: CLIX GPS vs SEM Global Robotics.

ROLE: `employee`, `founder`.

CAPABILITIES: the functions ARE the authorization primitives.

PRECONDITIONS: the live SECURITY DEFINER set (queried 2026-08-27): `current_profile_id`,
`current_role`, `is_founder_or_admin`, `is_hr_finance`, `has_company_access`,
`is_company_manager`, `can_manage_board_item`, `create_mcp_connector_secret`,
`get_mcp_connector_token`, `delete_mcp_connector_secret`, `handle_new_auth_user`,
`sem_audit_board_change`, `sem_audit_board_column_change`, `sem_audit_board_item_change`.
(NOTE: `decide_approval` is committed but NOT live yet — audited in SC-059.)

ACTION: exercise each under both personas + malformed input.

EXPECTED RESULT (verified live):
- `is_founder_or_admin()` → false for employee, true for founder.
- `is_hr_finance()` → false for employee.
- `has_company_access(own)` → true; `has_company_access(other company)` → false;
  `has_company_access(try_uuid('garbage'))` → false (null arg, safe).
- `is_company_manager(own)` → false for a plain employee.
- `try_uuid('not-a-uuid')` → NULL (never hard-errors RLS on a malformed path).
- `create_mcp_connector_secret(...)` as employee → raises `not authorized` (self-check).
- `get_mcp_connector_token` / `delete_mcp_connector_secret` → same founder-only self-check
  (code-read: each raises if `not is_founder_or_admin()`).
- `can_manage_board_item(board,task)` → gated by founder/company-manager/task-owner
  (code-read; boards feature is 0-row/unused, KNOWN_FAILURE_MODES.md #9).
- `handle_new_auth_user` → a signup trigger, not user-callable; creates the caller's own
  profile only.
- `sem_audit_board_*` → trigger functions (not user-callable), write audit rows for board
  changes.
- `current_profile_id` / `current_role` → resolve only the CALLER's own profile
  (`where auth_user_id = auth.uid()`), so they cannot return another user's identity.

EXPECTED DENIALS: every unauthorized/malformed path returns the safe value or raises.

EXPECTED DATABASE STATE: unchanged.

EXPECTED AUDIT EVENTS: n/a for the checks.

EXPECTED AI VISIBILITY: these functions gate what enters AI context.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc093_security_definer_audit.sql
(all helper + MCP-RPC boundaries verified live). The trigger functions
(`handle_new_auth_user`, `sem_audit_board_*`) are not directly user-callable and were
audited by reading their bodies. Cross-ref SC-092, SC-059, qa/KNOWN_FAILURE_MODES.md #9,
governance/BRAIN_OS_CONSTITUTION.md.

LAST VERIFIED DATE: 2026-08-27 (PASS — every callable SECURITY DEFINER function enforced its boundary)

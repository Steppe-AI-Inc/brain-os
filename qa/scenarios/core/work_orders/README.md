# core/work_orders scenarios

A `work_orders` row is the persisted record of one AI command exchange (command +
context_pack + output). Created by `create_pending_work_order` BEFORE the LLM call (so a
mid-generation client disconnect still lands the row), then finalized by
`sem_execute_ai_command` (transactional: work_order + tasks + approvals + model_usage +
audit_logs all commit or none — the atomicity guarantee, SC-095/096 principle).

RLS: `work_orders_select_scope` = `is_founder_or_admin() OR created_by_profile_id = self OR
is_company_manager(company_id)`. `company_id` is NULL on real rows today, so access is
creator-self + admin in practice (`qa/KNOWN_FAILURE_MODES.md` #7).

Scenarios covering work orders:
- **SC-095** (`recovery/partial_execution/`) — the transactional persist means an AI
  command never leaves a partial work_order (all-or-nothing).
- **SC-096** (`recovery/database_failure/`) — DB failure during persist rolls back the
  whole exchange (no orphan work_order/task/approval).
- **SC-070 / SC-103** (`core/audit/`) — the audit rows a work order emits obey the same
  authorization tiers and cannot be tampered with.
- **SC-088** (`core/authentication/`) — a terminated user's own work orders remain
  creator-visible but company-scoped access is revoked live.

Ground truth: `sem_execute_ai_command` (migration 202608230002, `security invoker` — RLS
applies to every insert), `create_pending_work_order` (schema line 773).

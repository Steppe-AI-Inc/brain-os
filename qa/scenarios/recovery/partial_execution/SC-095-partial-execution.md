SCENARIO ID: SC-095-partial-execution

PURPOSE: A bulk op where some items succeed and some fail must report a partial/failed
state with exact succeeded/failed ids and reasons and safe retry semantics — never a bare
"approved"/"success".

ACTOR: FOUNDER / authorized approver.

ORGANIZATION: CLIX GPS.

ROLE: `founder`.

CAPABILITIES: bulk execution via `decide_approval()` / the transactional AI command RPC.

PRECONDITIONS: a bulk operation over N resources where some would fail.

ACTION: execute the bulk op.

EXPECTED RESULT — two honest cases in the CURRENT system:
1. **AI command persistence** (`sem_execute_ai_command`) is TRANSACTIONAL and all-or-nothing
   (migration 202608230002): if any insert fails, the whole work_order/tasks/approvals/
   audit set rolls back — you never get 17 tasks and a broken 18th. This is deliberately
   NOT partial success; it is atomic. The failure surfaces as an `error` SSE event +
   `mark_work_order_failed`, never a false success.
2. **Deferred bulk deletion** (`decide_approval` `delete … where id = any(taskIds)`) is a
   SINGLE SQL statement — it deletes the rows that match and reports the real
   `get diagnostics row_count` in `deletion_summary`. If some ids no longer exist or fall
   outside the approval's company, they are simply not counted — the summary reflects the
   true affected count (e.g. "2 task(s) deleted." when one target had moved), never a bare
   "approved."

**Honest note**: there is no per-item partial-success ledger with individual error reasons
today, because there is no bulk operation with independent per-item external side effects
in the current system (the only bulk op is an atomic SQL delete). When one is added
(e.g. bulk external messages), it MUST record succeeded/failed ids + reasons per item
(SC-109 checklist).

EXPECTED DENIALS: n/a.

EXPECTED DATABASE STATE: atomic (case 1) or accurately-counted (case 2); never
partial-but-reported-as-complete.

EXPECTED AUDIT EVENTS: the real affected count in `approval_decided` metadata / the failure
in `ai_command_*` audit.

EXPECTED AI VISIBILITY: the chat reply shows the real count, not a bare "done."

CLEANUP: n/a.

AUTOMATION STATUS: PARTIAL. The atomicity (case 1) is CODE-VERIFIED (transactional RPC) and
the accurate-count deletion (case 2) is proven by SC-059 (reports "3 task(s) deleted."). A
per-item partial-success ledger is future work tied to a future bulk-side-effect feature.
Cross-ref SC-059, SC-096, SC-109, CLAUDE.md §10.

LAST VERIFIED DATE: 2026-08-27 (atomicity code-verified; accurate-count via SC-059)

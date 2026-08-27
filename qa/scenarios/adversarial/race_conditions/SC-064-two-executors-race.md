SCENARIO ID: SC-064-two-executors-race

PURPOSE: Two workers receiving the same approved action simultaneously — exactly one wins
via a lock/idempotency guard; no double action.

ACTOR: two concurrent executors (server-side).

ORGANIZATION: CLIX GPS.

ROLE: system.

CAPABILITIES: `decide_approval()` executes at most once per approval.

PRECONDITIONS: a `pending` approval with a deferred `execute` payload; two concurrent
`decide_approval()` calls.

ACTION: two transactions call `decide_approval(<id>, 'approved')` at the same time.

EXPECTED RESULT: exactly one executes. `decide_approval()` does
`select * into v_approval from public.approvals where id=p_approval_id FOR UPDATE` — the
row lock serializes the two callers. The first acquires the lock, sees `status='pending'`,
executes, sets `approved`. The second blocks on the lock, then sees `status<>'pending'`
and no-ops. No double deletion / double external effect.

EXPECTED DENIALS: the losing executor performs nothing.

EXPECTED DATABASE STATE: single execution; approval `approved` once.

EXPECTED AUDIT EVENTS: exactly one `approval_decided` row.

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a.

AUTOMATION STATUS: CODE-VERIFIED + logic-tested. The `FOR UPDATE` row lock + the
`status='pending'` guard are the concurrency control (readable in migration 202608270005
line 74 and the guard at line 86). A true two-connection race test needs two simultaneous
sessions, which the single-session `supabase db query` runner cannot orchestrate — so the
serialization is verified by the lock's presence + the idempotency proof in SC-059 (the
second call, whether concurrent or sequential, hits the same `status<>'pending'` no-op).
Deployment PENDING founder push. Cross-ref SC-063, SC-059, SC-100.

LAST VERIFIED DATE: 2026-08-27 (guard/lock code-verified; idempotency via SC-059; true race MANUAL)

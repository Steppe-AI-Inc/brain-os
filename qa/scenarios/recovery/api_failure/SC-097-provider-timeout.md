SCENARIO ID: SC-097-provider-timeout

PURPOSE: When a request times out and the result is unknown, the system must not blindly
retry if that might duplicate an external action — use idempotency/reconciliation.

ACTOR: system.

ORGANIZATION: any.

ROLE: system.

CAPABILITIES: n/a for messaging.

PRECONDITIONS: an outbound request whose response never arrives (timeout).

EXPECTED RESULT:
- **Messaging case**: NOT APPLICABLE — no provider exists. Intended: on an ambiguous
  timeout, do NOT blindly re-send; check the provider's idempotency/status endpoint first
  (SC-109 item 9).
- **The REAL, already-solved analog** is sem-ai-command's LLM-call timeout handling
  (a genuinely hard-won, live-verified control worth reusing): `fetchWithTimeout` +
  `readWithTimeout` + `consumeSSE`'s idle/overall budgets race each `reader.read()` against
  a timer, because `AbortSignal.timeout` alone proved unreliable in the Supabase Deno edge
  runtime (a real request stalled 8+ minutes past a 90s signal). A stalled generation is
  killed within the idle timeout and surfaced as a normalized 504 — never a silent hang and
  never a false success. This is the pattern any future side-effecting integration must
  copy for its own timeouts.

For the LLM call specifically, a timeout is SAFE to fail because generation has no external
side effect (the transactional persist only runs on complete parsed JSON) — the danger only
arises for a future path where the timed-out request MIGHT have caused an external effect,
which is exactly where idempotency is mandatory.

EXPECTED DENIALS / DATABASE STATE: no partial persistence on an LLM timeout (RPC never runs).

EXPECTED AUDIT EVENTS: `mark_work_order_failed` + error event on timeout.

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a.

AUTOMATION STATUS: PARTIAL. The LLM-timeout handling is REAL and CODE-VERIFIED (and its
edge-runtime quirk is documented in the function's own comments from live testing). The
messaging-timeout case is NOT APPLICABLE — feature not yet implemented. Cross-ref SC-085,
SC-096, SC-109, CLAUDE.md §11.

LAST VERIFIED DATE: 2026-08-27 (LLM-timeout pattern code-verified; messaging case N/A)

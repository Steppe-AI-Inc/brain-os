SCENARIO ID: SC-malformed-input-handling (supports the QA checklist "malformed data" item,
SC-111; not a numbered spec scenario)

PURPOSE: Malformed input — from the model, the client, or an attacker — must fail safely
and visibly, never create fake production work or crash the command path.

ACTOR: any caller; the malformed data may come from the model or a hand-crafted request.

ORGANIZATION: any.

ROLE: any.

CAPABILITIES: n/a.

PRECONDITIONS: various malformed inputs.

ACTION / EXPECTED RESULT — the real handling in sem-ai-command and the schema:
- **Malformed model JSON**: `parseModelJson()` tries fence-stripping then outermost-object
  extraction; on total failure it inserts an `ai_command_json_parse_failed` audit row and
  marks the work_order `failed` (via `mark_work_order_failed`), then sends an `error` SSE
  event — no partial task/approval persistence (the transactional RPC never runs). A
  truncated response (`stopReason=max_tokens`) gets a specific "try smaller steps" message.
- **Guessed/foreign ids**: filtered against context sets (SC-101) — silently ignored, never
  inserted.
- **Malformed image mime**: only `image/png|jpeg|webp|gif` are accepted
  (`ALLOWED_IMAGE_TYPES`); anything else is dropped, the command proceeds text-only.
- **Oversized context**: a token preflight (`SEM_AI_MAX_TOKENS`, default 12000) returns a
  413 hard-stop before any LLM call, rather than sending an unbounded request.
- **Malformed UUID in an RLS/Storage path**: `try_uuid()` returns NULL → "no match", never
  a 500 (schema line 662).
- **Invalid channel id**: verified against the caller's RLS; an inaccessible id falls back
  to "General" (line 765–768), never errors the command.
- **Bad enum values** (state/employment/sensitivity/relationship type): each is validated
  against a `VALID_*` set and coerced to a safe default rather than passed through.

EXPECTED DENIALS: malformed writes never persist; the transaction is all-or-nothing.

EXPECTED DATABASE STATE: on any malformed path, either a clean success or a clean failure —
never partial state.

EXPECTED AUDIT EVENTS: `ai_command_json_parse_failed` on parse failure (with a 4000-char
slice of the raw model output for diagnosis — model output, not secrets, SC-104).

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a.

AUTOMATION STATUS: CODE-VERIFIED (the handlers are read directly in
supabase/functions/sem-ai-command/index.ts); a live malformed-JSON injection is MANUAL
VERIFICATION. Cross-ref SC-095 (partial execution), SC-101, SC-104, CLAUDE.md §11.

LAST VERIFIED DATE: 2026-08-27 (handlers code-verified; live fault-injection MANUAL)

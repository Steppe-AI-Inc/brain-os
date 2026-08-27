SCENARIO ID: SC-104-log-secret-leak

PURPOSE: Secrets (service_role key, provider API keys, Authorization headers, MCP
connector tokens, future webhook secrets) must never appear in application logs, Edge
Function logs, browser console, or audit metadata / error traces.

ACTOR: any — this is a code-path property, exercised by triggering error paths as any user.

ORGANIZATION: n/a.

ROLE: n/a.

CAPABILITIES: n/a.

PRECONDITIONS: trigger real error paths in sem-ai-command (invalid model JSON, provider
error, timeout) and inspect what is emitted.

ACTION: (1) static: grep every Edge Function for logging of key/token/secret/authorization
material; (2) inspect exactly what sem-ai-command writes to `audit_logs.metadata` and to
SSE `error` events; (3) live: review the Supabase dashboard Edge Function logs after
triggering an error.

EXPECTED RESULT: no secret material in any sink.

EXPECTED DENIALS: n/a.

EXPECTED DATABASE STATE: n/a.

EXPECTED AUDIT EVENTS: on a JSON parse failure sem-ai-command inserts an
`ai_command_json_parse_failed` row with `metadata = { command, model, stopReason,
raw: resultText.slice(0,4000) }` — `raw` is the MODEL'S OWN output (never a key), `command`
is the user's own text. No key/token is included. The SSE `error` event carries
`error` + `raw` (model output), no secrets.

EXPECTED AI VISIBILITY: n/a.

CLEANUP: n/a.

AUTOMATION STATUS: PARTIAL.
- Static half — DONE 2026-08-27: `grep -rniE "console\.(log|error|warn).*(key|token|
  secret|authorization|service_role|password)" supabase/functions` returned **zero
  matches**. No Edge Function logs secret material. Confirmed by reading every
  `console.*`/audit-insert site: the only dynamic content logged is the user command, the
  model name, the stop reason, and the model's own JSON output.
- Live-dashboard half — MANUAL VERIFICATION ONLY: this CLI version has no
  `supabase functions logs` subcommand; Edge Function logs are viewable only in the
  Supabase dashboard. A human should trigger an error and confirm the dashboard log and
  browser console contain no secrets. Not doable from the CLI tonight.

Cross-ref: MCP token RPCs (`get_mcp_connector_token`) RETURN a token to an authorized
founder caller by design — that is a return value to an authorized client, not a log; it
must never be console-logged (it isn't).

LAST VERIFIED DATE: 2026-08-27 (static/grep half PASS; live-dashboard half not run — no CLI access)

SCENARIO ID: SC-085-message-send-failure

PURPOSE: When a messaging provider returns an HTTP/API error, the message must be marked
`failed`, the error normalized, a retry policy evaluated, no false "sent" status shown, the
UI must show the failure, audit must record it, and a retry must not duplicate a successful
send.

ACTOR: system (outbound messaging).

ORGANIZATION: any.

ROLE: system.

CAPABILITIES: n/a — no messaging provider exists.

PRECONDITIONS: (future) an outbound message and a provider that returns an error.

ACTION: attempt the send; provider returns 5xx / API error.

EXPECTED RESULT (intended spec for when built): message status `failed`, normalized error
stored, UI shows the failure clearly, audit records it, and retry uses an idempotency key
so a previously-successful send is never duplicated. A provider error must never leave a
`sent` status.

EXPECTED DENIALS / DATABASE STATE / AUDIT / AI VISIBILITY: per the intended design above.

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented. No messaging provider,
no message table, no send path exists (confirmed by grep). Written as the acceptance spec
(SC-109 items 3, 8, 9). NOTE: sem-ai-command already models good provider-error handling
for the LLM call itself (normalized 502/504 errors, `mark_work_order_failed`, no false
success) — reuse that pattern for a future message provider. Cross-ref SC-097, SC-109,
CLAUDE.md §11.

LAST VERIFIED DATE: n/a (feature not built)

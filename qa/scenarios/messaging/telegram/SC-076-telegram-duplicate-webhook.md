SCENARIO ID: SC-076-telegram-duplicate-webhook

PURPOSE: Telegram retries a webhook (at-least-once delivery). A duplicate delivery must be
idempotent — one inbound event = one stored message, no duplicate task/lead/AI reply.

ACTOR: system.
ORGANIZATION: the bot's company.
ROLE: system.
CAPABILITIES: n/a.

PRECONDITIONS: (future) the same Telegram update_id delivered more than once.

ACTION: process the webhook twice.

EXPECTED RESULT (intended): dedup keyed by the provider update_id / message id — the second
delivery is a no-op (same discipline as decide_approval's pending-status guard, SC-063). No
duplicate stored message, no duplicate downstream task/lead, no duplicate AI reply or
outbound send.

EXPECTED DENIALS: the duplicate produces no second effect.

EXPECTED DATABASE STATE: exactly one message row per unique provider event.

EXPECTED AUDIT EVENTS / AI VISIBILITY: single receipt audited.

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented. Cross-ref SC-109 item 3,
SC-063, SC-098, SC-099.

LAST VERIFIED DATE: n/a (feature not built)

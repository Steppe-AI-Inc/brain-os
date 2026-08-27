SCENARIO ID: SC-075-telegram-new-customer

PURPOSE: A new customer messages the company Telegram bot for the first time. The inbound
message must map to exactly one company, create/resolve a customer identity, and never leak
across companies.

ACTOR: EXTERNAL_CUSTOMER (no account).
ORGANIZATION: the company owning the bot.
ROLE: none.
CAPABILITIES: none — inbound message is untrusted data.

PRECONDITIONS: (future) a Telegram bot bound to one company; a first-time sender.

ACTION: customer sends a message; the webhook fires.

EXPECTED RESULT (intended): the webhook is authenticated (SC-077), the message is stored
against the correct company_id (tenant mapping, SC-109 item 2), a new external identity is
created scoped to that company, and employees of OTHER companies never see it (SC-056
boundary applied to messages).

EXPECTED DENIALS: cross-company visibility of the conversation.

EXPECTED DATABASE STATE / AUDIT / AI VISIBILITY: per SC-109; AI acting on the message runs
non-privileged (SC-067).

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented (no Telegram webhook/tables).
Cross-ref SC-109, SC-056, SC-067, SC-077.

LAST VERIFIED DATE: n/a (feature not built)

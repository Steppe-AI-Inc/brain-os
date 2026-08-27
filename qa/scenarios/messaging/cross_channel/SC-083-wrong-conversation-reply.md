SCENARIO ID: SC-083-wrong-conversation-reply-binding

PURPOSE: An outbound reply must bind to the correct conversation/customer/channel — a reply
must never be delivered to the wrong customer or the wrong channel.

ACTOR: SUPPORT/SALES employee + system.
ORGANIZATION: the owning company.
ROLE: employee.
CAPABILITIES: reply only to an assigned conversation (future RLS).

PRECONDITIONS: (future) multiple open conversations; a drafted reply.

ACTION: send the reply.

EXPECTED RESULT (intended): the reply is bound to the exact conversation id it was drafted
against (validated server-side, never trusting a client-supplied conversation id — the same
"verify the id resolves under the caller's RLS" discipline sem-ai-command already uses for
channelId, index.ts line 765). A reply cannot be retargeted to another customer/channel by
tampering with the id; a mismatch is rejected, not silently redirected.

EXPECTED DENIALS: delivery to a conversation the caller isn't authorized for or that doesn't
match the draft.

EXPECTED DATABASE STATE / AUDIT / AI VISIBILITY: per SC-109.

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented. The id-validation discipline
it must follow is REAL and already used for internal channel ids. Cross-ref SC-101, SC-071,
SC-109.

LAST VERIFIED DATE: n/a (feature not built)

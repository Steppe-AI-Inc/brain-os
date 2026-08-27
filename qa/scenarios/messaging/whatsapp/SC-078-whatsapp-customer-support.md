SCENARIO ID: SC-078-whatsapp-customer-support

PURPOSE: A WhatsApp customer support conversation must be visible/answerable only by
authorized employees of the owning company, and an external message must never grant
internal privileges.

ACTOR: EXTERNAL_CUSTOMER + CUSTOMER_SUPPORT employee.
ORGANIZATION: the owning company.
ROLE: employee (support).
CAPABILITIES: read/reply to assigned conversations (future RLS).

PRECONDITIONS: (future) an inbound WhatsApp conversation bound to a company.

ACTION: a support employee reads and replies; an employee of another company tries to read it.

EXPECTED RESULT (intended): conversation gated by RLS on the future conversation/message
tables (built per SC-107); another company's employee sees 0 (SC-056); the AI support
workflow runs non-privileged so an injected customer instruction cannot exfiltrate internal
data (SC-067). Outbound replies that make commitments are approval-gated (SC-084).

EXPECTED DENIALS: cross-company conversation access; privilege escalation from message text.

EXPECTED DATABASE STATE / AUDIT / AI VISIBILITY: per SC-109.

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented (no conversation subsystem).
Cross-ref SC-067, SC-056, SC-084, SC-109.

LAST VERIFIED DATE: n/a (feature not built)

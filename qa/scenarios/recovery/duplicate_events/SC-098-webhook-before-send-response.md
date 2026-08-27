SCENARIO ID: SC-098-webhook-before-send-response

PURPOSE: A delivery webhook can arrive BEFORE the send API response. The system must
reconcile out-of-order local/remote state correctly and not lose delivery status.

ACTOR: system (messaging).

ORGANIZATION: any.

ROLE: system.

CAPABILITIES: n/a — no webhooks exist.

PRECONDITIONS: (future) an outbound send whose provider delivery webhook races the send
API response.

EXPECTED RESULT (intended): the message record is keyed by a stable provider message id /
idempotency key so a delivery webhook that arrives first creates/updates the record, and
the later send-API response reconciles onto the same record rather than creating a
duplicate or overwriting a more-advanced status. Delivery status is never lost to ordering.

EXPECTED DENIALS / DATABASE STATE / AUDIT: per the intended design (idempotent upsert keyed
by provider id; monotonic status state machine).

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented. No webhook handlers exist
(confirmed by grep). Acceptance spec for SC-109 items 3 and 9. Cross-ref SC-099, SC-076,
SC-109.

LAST VERIFIED DATE: n/a (feature not built)

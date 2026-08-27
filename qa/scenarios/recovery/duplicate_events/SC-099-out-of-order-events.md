SCENARIO ID: SC-099-out-of-order-events

PURPOSE: The message/delivery state machine must handle disordered and duplicate provider
statuses safely (e.g. `delivered` arriving before `sent`, or a `sent` event redelivered
three times).

ACTOR: system (messaging).

ORGANIZATION: any.

ROLE: system.

CAPABILITIES: n/a — no messaging state machine exists.

PRECONDITIONS: (future) a provider that can deliver status events out of order or more than
once.

EXPECTED RESULT (intended): a monotonic status state machine (queued → sent → delivered →
read, with failed as a terminal branch) that ignores a status transition that would move
BACKWARD, and is idempotent to a redelivered event (same provider event id applied once).
Out-of-order or duplicate events never corrupt the final status.

EXPECTED DENIALS / DATABASE STATE / AUDIT: idempotent, monotonic; duplicate events are
no-ops.

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented. No provider status events
exist. Acceptance spec for SC-109. The general idempotency discipline mirrors the REAL
`decide_approval()` pending-status guard (SC-063/064) — a status transition that already
happened is a no-op — which is the same principle applied to a future message state
machine. Cross-ref SC-098, SC-076, SC-063.

LAST VERIFIED DATE: n/a (feature not built)

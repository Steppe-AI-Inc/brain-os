SCENARIO ID: SC-080-instagram-public-to-dm

PURPOSE: An Instagram interaction that moves from a public comment to a private DM must keep
the two visibility contexts distinct — a public comment is public, a DM is a private
conversation scoped to the company — and must not leak one into the other.

ACTOR: EXTERNAL_CUSTOMER.
ORGANIZATION: the owning company.
ROLE: none.
CAPABILITIES: none.

PRECONDITIONS: (future) an Instagram integration handling both comments and DMs.

ACTION: a public commenter is moved to a DM thread.

EXPECTED RESULT (intended): the public comment and the private DM are stored with distinct
sensitivity/visibility; the DM is company-scoped and not exposed publicly; the transition is
audited; the AI handling the DM runs non-privileged (SC-067). Public content is never
elevated to internal, and DM content is never surfaced publicly.

EXPECTED DENIALS: DM content leaking to a public surface; cross-company visibility.

EXPECTED DATABASE STATE / AUDIT / AI VISIBILITY: per SC-109.

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented. Cross-ref SC-067, SC-109,
governance/DATA_CLASSIFICATION.md.

LAST VERIFIED DATE: n/a (feature not built)

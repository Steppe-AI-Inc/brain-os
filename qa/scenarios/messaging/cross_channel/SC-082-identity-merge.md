SCENARIO ID: SC-082-cross-channel-identity-merge

PURPOSE: When the same customer appears on multiple channels (Telegram + WhatsApp + email),
merging them into one identity must be safe — an ambiguous match goes to MANUAL REVIEW, never
an automatic merge that could join two different real people (or cross companies).

ACTOR: system + a human reviewer.
ORGANIZATION: the owning company.
ROLE: manager/support.
CAPABILITIES: identity merge is a reviewed action, not automatic on a weak signal.

PRECONDITIONS: (future) two channel identities that may or may not be the same person.

ACTION: the system proposes a merge.

EXPECTED RESULT (intended): a HIGH-confidence match (verified phone/email) may auto-link; an
AMBIGUOUS match (name-only, partial) is queued for manual review and NOT merged
automatically. A merge never crosses companies (two identities in different tenants are never
merged). A wrong merge is reversible/audited.

EXPECTED DENIALS: automatic merge on a weak/ambiguous signal; cross-company merge.

EXPECTED DATABASE STATE / AUDIT / AI VISIBILITY: per SC-109; merges audited.

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented. Cross-ref SC-101 (never
invent an id / resolve safely or escalate — the same ambiguous-to-escalate discipline),
SC-056, SC-109.

LAST VERIFIED DATE: n/a (feature not built)

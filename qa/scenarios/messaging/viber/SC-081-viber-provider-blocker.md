SCENARIO ID: SC-081-viber-provider-blocker

PURPOSE: Viber (and any provider that blocks non-commercial accounts from real sending) must
be verified with a fixture and reported honestly — never claimed production-ready off a
fixture pass.

ACTOR: system / operator.
ORGANIZATION: the owning company.
ROLE: operator.
CAPABILITIES: n/a.

PRECONDITIONS: (future) a Viber integration testable only via a fixture because live sending
requires a commercial account.

ACTION: exercise the inbound/outbound path against a fixture.

EXPECTED RESULT (intended): the fixture exercises webhook auth, tenant mapping, dedup,
authorization, and outbound formatting — but because live send is blocked on a commercial
account, the REQUIRED report format is, verbatim:

    "Report: FIXTURE VERIFIED / LIVE BLOCKED ON COMMERCIAL ACCOUNT. Do not report
    production-ready."

This is the founder's explicit instruction, generalized across the whole library: a fixture
pass is a fixture pass, never a production claim.

EXPECTED DENIALS / DATABASE STATE / AUDIT / AI VISIBILITY: per SC-109.

CLEANUP: n/a.

AUTOMATION STATUS: NOT APPLICABLE — feature not yet implemented. When built, report using the
exact string above. Cross-ref SC-109, qa/scenarios/README.md (honesty rule).

LAST VERIFIED DATE: n/a (feature not built)

SCENARIO ID: SC-090-company-transfer

PURPOSE: An employee who moves from Company A to Company B must lose access to Company A's
data and gain Company B's — previous-company information is no longer available unless a
separate capability intentionally retains it.

ACTOR: ORDINARY_EMPLOYEE — fixture EMPLOYEE.

ORGANIZATION: from CLIX GPS ("Mongolia") to SEM Global Robotics ("the other company",
standing in for a Kazakhstan/other entity).

ROLE: `employee`; membership moved from Company A to Company B.

CAPABILITIES: `has_company_access` is per-company and live — access follows the current
active membership set exactly.

PRECONDITIONS: employee active member of Company A with visible A data; B data exists.

ACTION: deactivate the A membership and add a B membership (the transfer); re-query both
companies' data under the same JWT.

EXPECTED RESULT: after transfer, Company A data returns 0 rows; Company B data is visible.
No residual A visibility.

EXPECTED DENIALS: Company A rows via `has_company_access(A)` = false post-transfer.

EXPECTED DATABASE STATE: unchanged by the test (rolled back).

EXPECTED AUDIT EVENTS: the membership change flow should audit the transfer (out of scope
here).

EXPECTED AI VISIBILITY: post-transfer AI context contains B rows, not A rows.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED (same mechanism as SC-088) — cross-company isolation is proven
by sc056_cross_company_isolation.sql (a member of A sees 0 of B), and live-membership
re-evaluation is proven by sc088_091_access_revocation.sql. A transfer is exactly
"deactivate A membership + add B membership," and the two runners together establish that
the boundary moves with the membership. Cross-ref SC-056, SC-088.

LAST VERIFIED DATE: 2026-08-27 (mechanism VERIFIED via SC-056 + SC-088 runners)

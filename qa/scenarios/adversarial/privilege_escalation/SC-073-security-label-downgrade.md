SCENARIO ID: SC-073-security-label-downgrade

PURPOSE: An employee must not be able to change a RESTRICTED/confidential document to
INTERNAL to widen its audience. Classification changes are themselves protected actions.

ACTOR: ORDINARY_EMPLOYEE — fixture EMPLOYEE.

ORGANIZATION: CLIX GPS.

ROLE: `employee`.

CAPABILITIES: `documents_write_scope` is manager+/founder only — an employee cannot write
documents at all, let alone change their sensitivity.

PRECONDITIONS: a `confidential` document in CLIX GPS.

ACTION: the employee tries `UPDATE documents SET sensitivity='internal'` on it.

EXPECTED RESULT: the sensitivity is unchanged (`confidential`). The write is filtered by
`documents_write_scope` (0 rows). A confidential document cannot be downgraded by a
non-manager, so it cannot be exposed to the broader company by relabeling.

EXPECTED DENIALS: the downgrade UPDATE affects 0 rows.

EXPECTED DATABASE STATE: `documents.sensitivity` still `confidential` (verified live).

EXPECTED AUDIT EVENTS: none (0 rows changed).

EXPECTED AI VISIBILITY: the document remains confidential — still hidden from an employee's
AI context.

CLEANUP: none — runner rolls back.

AUTOMATION STATUS: AUTOMATED — see qa/scenarios-runner/sc072_073_security_field_mutation.sql
(doc sensitivity unchanged after the attempt). Note the same principle for `memories.sensitivity`
is covered by SC-119. Cross-ref governance/DATA_CLASSIFICATION.md, SC-072, SC-119.

LAST VERIFIED DATE: 2026-08-27 (PASS — confidential→internal downgrade left sensitivity unchanged)

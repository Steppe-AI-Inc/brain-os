SCENARIO ID: SC-101-ai-hallucinated-entity

PURPOSE: "Create a task for Galsaa at OpenSpot Mongolia" where the named company/person
doesn't match a real relationship must NOT cause the AI to invent a UUID. sem-ai-command
must resolve real ids from context only; ambiguous cases get safe resolution/escalation.
This is already-built defense — verify it actually holds.

ACTOR: FOUNDER (or any command author).

ORGANIZATION: any.

ROLE: any.

CAPABILITIES: entity creation is gated by real RLS; id resolution is gated by server-side
cross-checks.

PRECONDITIONS: a command naming a company/person/project that may or may not exist.

ACTION: issue a command referencing an entity by name.

EXPECTED RESULT: every id the model proposes is cross-checked, server-side, against the
ids that were actually in this request's context pack before it is honored:
- `createPeople[].companyId` is kept only if `contextCompanyIds.has(companyId)`; otherwise
  nulled, or resolved via `companyIndex` into this response's own `createCompanies`.
- `createProjects`/`createGoals` require a resolvable company reference or are DROPPED
  (not sent with a guessed id).
- `deleteTaskIds`/`pendingDeleteTaskIds` are filtered to ids that literally appear in
  `context.tasks`; `deleteChannelIds` to `context.channels`/`activeChannelId`.
- `managerPersonId` kept only if `contextPersonIds.has(...)`.
- `ownerProfileId` on a relationship kept only if it EQUALS the calling `profile.id`.
So a hallucinated UUID for a non-existent person/company is silently ignored, and a
genuinely new entity is created explicitly (with facts), not referenced by a fabricated id.

EXPECTED DENIALS: any model-supplied id not present in context is discarded; a project/goal
with no resolvable company is dropped rather than inserted with a guess.

EXPECTED DATABASE STATE: no rows with invented foreign keys; the transactional
`sem_execute_ai_command` would reject a bad FK anyway (all-or-nothing).

EXPECTED AUDIT EVENTS: normal work-order audit.

EXPECTED AI VISIBILITY: the model only ever sees real context ids to begin with.

CLEANUP: n/a.

AUTOMATION STATUS: CODE-VERIFIED — the cross-check logic is in sem-ai-command lines
~891–1064 (`contextTaskIds`, `contextChannelIds`, `contextCompanyIds`, `contextPersonIds`
`.has()` filters and the `hasCompanyRef` drop). A live end-to-end run is MANUAL
VERIFICATION via /chat (cross-ref qa/ACCEPTANCE_TESTS.md #2 "correct entities resolve
without invented IDs"). Cross-ref SC-102, SC-071.

LAST VERIFIED DATE: 2026-08-27 (code-verified; live entity-resolution MANUAL — ACCEPTANCE_TESTS #2)

# adversarial/id_spoofing scenarios

"Never trust a client- or model-supplied id" is a cross-cutting rule enforced in two
layers: (1) the database — RLS WITH CHECK validates the tenant of any id you write; (2)
sem-ai-command — every model-supplied id is cross-checked against the ids that were
actually in this request's context before it is honored.

Scenarios covering id spoofing (primary category in parentheses):
- **SC-071** (`adversarial/cross_company/`) — submitting a foreign `organization_id` on a
  create is DENIED by RLS (42501). Runner `sc071_create_wrong_company.sql`. **PASS 2026-08-27.**
- **SC-101** (`ai/tool_execution/`) — a model-hallucinated UUID for a person/company/task is
  discarded (`contextCompanyIds`/`contextPersonIds`/`contextTaskIds` `.has()` filters);
  guessed foreign keys never reach the DB.
- **SC-119** (`core/organizations/`) — an employee cannot self-assign `approver_profile_id`
  on an approval to gain approve rights. **PASS 2026-08-27.**
- **SC-093** (`adversarial/service_role/`) — `try_uuid('garbage')` → NULL, so a malformed id
  in a Storage path or RLS check evaluates to "no match", never a hard error or a bypass.

The design invariant: an id is authorization-relevant ONLY after it is confirmed to resolve
under the caller's own RLS (sem-ai-command's channel-id check at line 765–768 is the
canonical example: an unverified `channelId` silently falls back to "General" rather than
being trusted).

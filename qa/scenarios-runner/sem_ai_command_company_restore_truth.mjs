// Permanent regression for the real, live "test3 restore" incident (2026-08-30) —
// see qa/KNOWN_FAILURE_MODES.md for the full incident record. A founder asked Brain to
// restore an archived company (test3) and, across several turns, got: a false claim that
// it was already restored (grounded in nothing but the prior turn's own prose), a
// confusing generic "no matching company or no access" failure when actually asked to
// restore it, and finally an unqualified "test3 is now active" success claim with ZERO
// real mutation behind it. Three real, independent root causes were found and fixed in
// supabase/functions/sem-ai-command/index.ts:
//   1. CLARIFICATION_ENTITY_ACTION_FIELD only ever routed a company/task/goal/person
//      single_entity_clarification to its ARCHIVE field, regardless of what was actually
//      proposed — so confirming "should I restore test3?" with "yes" silently tried to
//      ARCHIVE an already-archived company instead of restoring it.
//   2. The generic updateCompanies path could still attempt a raw status write across the
//      archived boundary (company currently archived, requested status 'active') — which
//      the companies_lifecycle_guard DB trigger rejects, producing the exact misleading
//      "no matching company or no access" result, instead of ever going through
//      archive_company()/restore_company() (the one authoritative lifecycle path).
//   3. The false-success corrector (claimsCompanyDeleted, and its task/goal/person
//      siblings) only watched for delete/archive/remove claims — a false "restored"
//      claim with zero real ids attempted sailed through uncorrected.
//
// This is pure JS/TS logic, not a SQL/RLS invariant — run with:
//   node qa/scenarios-runner/sem_ai_command_company_restore_truth.mjs
// Each function body below is a byte-for-byte copy of what's actually shipped in
// supabase/functions/sem-ai-command/index.ts (kept in sync manually, same convention as
// supabase/schema-v0.7-production-core.sql mirroring migration DDL) — if that file's
// logic changes, this file's copies must be updated to match or this regression is
// testing a stale approximation, not the real code.

// ---- byte-for-byte copy: CLARIFICATION_ENTITY_ACTION_FIELD ----
const CLARIFICATION_ENTITY_ACTION_FIELD = {
  task: { archive: 'archiveTaskIds', restore: 'restoreTaskIds' },
  company: { archive: 'archiveCompanyIds', restore: 'restoreCompanyIds' },
  goal: { archive: 'archiveGoalIds', restore: 'restoreGoalIds' },
  channel: { archive: 'deleteChannelIds' },
  approval: { archive: 'deleteApprovalIds' },
  person: { archive: 'endEmploymentPersonIds', restore: 'restoreEmploymentPersonIds' },
  employee: { archive: 'endEmploymentPersonIds', restore: 'restoreEmploymentPersonIds' },
};

// ---- byte-for-byte copy: the deterministic single_entity_clarification resolver ----
function resolveClarificationField(pendingAction) {
  return CLARIFICATION_ENTITY_ACTION_FIELD[pendingAction.entityType || '']?.[pendingAction.actionType || 'archive'];
}

// ---- byte-for-byte copy: the broadened claimsCompanyDeleted (and siblings) regex ----
function claimsCompanyLifecycleChange(summary, archiveCompanyIds, restoreCompanyIds) {
  return archiveCompanyIds.length === 0 && restoreCompanyIds.length === 0
    && /\b(delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing))\b[^.]{0,40}\bcompany\b|\bcompany\b[^.]{0,40}\b(delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing))\b/i.test(summary);
}

// ---- byte-for-byte copy: the updateCompanies lifecycle-transition-skip logic ----
function statusChangeIsLifecycleTransition(requestedStatus, currentStatus) {
  return !!requestedStatus && (requestedStatus === 'archived' || currentStatus === 'archived');
}

let failed = false;
function assert(cond, name, detail) {
  if (!cond) { failed = true; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
  else console.log(`PASS ${name}`);
}

// ============ COMPANY_MUTATION_USES_RESOLVED_CANONICAL_ID ============
// ============ COMPANY_READ_AND_WRITE_RESOLUTION_USE_SAME_IDENTITY ============
// ============ CHAT_YES_EXECUTES_CHANNEL_PENDING_COMPANY_ID ============
// A restore-clarification's "yes" must resolve to restoreCompanyIds, not archiveCompanyIds.
{
  const pendingAction = { kind: 'single_entity_clarification', entityType: 'company', actionType: 'restore', candidateIds: ['93073272-c9c6-485c-b0ad-459df37ce6f5'] };
  const field = resolveClarificationField(pendingAction);
  assert(field === 'restoreCompanyIds', 'restore clarification resolves to restoreCompanyIds (real test3 id)', field);
}
// An archive-clarification (the pre-existing, already-shipped behavior) must be unaffected.
{
  const pendingAction = { kind: 'single_entity_clarification', entityType: 'company', actionType: 'archive', candidateIds: ['id'] };
  assert(resolveClarificationField(pendingAction) === 'archiveCompanyIds', 'archive clarification still resolves to archiveCompanyIds');
}
// Absent actionType (every clarification proposed before this fix) must default to archive,
// so no pre-existing archive/delete clarification changes behavior.
{
  const pendingAction = { kind: 'single_entity_clarification', entityType: 'company', candidateIds: ['id'] };
  assert(resolveClarificationField(pendingAction) === 'archiveCompanyIds', 'absent actionType defaults to archive (backward-compatible)');
}
// Same-defect sweep: task/goal/person restore clarifications must resolve correctly too.
{
  assert(resolveClarificationField({ entityType: 'task', actionType: 'restore', candidateIds: ['id'] }) === 'restoreTaskIds', 'task restore clarification resolves to restoreTaskIds');
  assert(resolveClarificationField({ entityType: 'goal', actionType: 'restore', candidateIds: ['id'] }) === 'restoreGoalIds', 'goal restore clarification resolves to restoreGoalIds');
  assert(resolveClarificationField({ entityType: 'person', actionType: 'restore', candidateIds: ['id'] }) === 'restoreEmploymentPersonIds', 'person restore clarification resolves to restoreEmploymentPersonIds');
  assert(resolveClarificationField({ entityType: 'employee', actionType: 'restore', candidateIds: ['id'] }) === 'restoreEmploymentPersonIds', 'employee restore clarification resolves to restoreEmploymentPersonIds');
}
// Entities with no real restore mechanism (channel/approval deletion) must not silently
// produce a field for a restore actionType that was never a real capability.
{
  assert(resolveClarificationField({ entityType: 'channel', actionType: 'restore' }) === undefined, 'channel has no restore field (deletion has no restore concept)');
}

// ============ BRAIN_CHAT_FAILED_MUTATION_CANNOT_EMIT_SUCCESS ============
// ============ BRAIN_CHAT_SINGLE_AUTHORITATIVE_MUTATION_RESULT ============
// ============ BRAIN_CHAT_STRUCTURED_RESULT_OVERRIDES_MODEL_NARRATIVE ============
{
  const fired = claimsCompanyLifecycleChange('The company was restored successfully.', [], []);
  assert(fired, 'false "restored" claim (explicit phrasing) with zero real ids is caught');
}
// IMPORTANT, honestly-documented scope boundary: the real incident's exact literal text
// ("test3 is now active. It should appear in your companies menu.") does NOT contain the
// word "restored" at all - it's pure "active" language, split across two sentences. A
// bare "active" trigger was deliberately NOT added to this regex (this file legitimately
// describes real companies as "active" constantly in ordinary read-only answers, and a
// word-proximity regex can't reliably tell that apart from a false completion claim
// without real false-positive risk). This exact phrasing is instead closed by the
// STRUCTURAL fix (CLARIFICATION_ENTITY_ACTION_FIELD routing restore clarifications
// correctly, and updateCompanies never attempting a raw status write across the archived
// boundary) removing the underlying confusing-failure mechanism that produced that
// phrasing in the first place - proven live in qa/KNOWN_FAILURE_MODES.md's post-deploy
// acceptance test against the real test3 company, not by this regex. Confirming that
// boundary explicitly here rather than silently, so a future reader doesn't assume this
// regex alone is what closed the incident.
{
  const fired = claimsCompanyLifecycleChange('test3 is now active. It should appear in your companies menu.', [], []);
  assert(fired === false, 'documented scope boundary: bare "active" phrasing (the literal original incident text) is NOT caught by this regex by design - closed structurally instead, not here');
}
// Must NOT fire when a real restore was actually attempted (archiveCompanyIds/restoreCompanyIds non-empty).
{
  const fired = claimsCompanyLifecycleChange('test3 restored. Status: Active.', [], ['93073272-c9c6-485c-b0ad-459df37ce6f5']);
  assert(!fired, 'corrector does not fire when a real restore was actually attempted');
}
// Must not false-positive on ordinary, unrelated read-only company text.
{
  const fired = claimsCompanyLifecycleChange('You have 12 companies. SEM LLC is your largest by headcount.', [], []);
  assert(!fired, 'corrector does not false-positive on ordinary unrelated company text');
}

// ============ COMPANY_RESTORE_USES_CANONICAL_LIFECYCLE_PATH ============
// ============ COMPANY_RESTORE_NOT_GENERIC_STATUS_EDIT ============
// A currently-archived company must never have a raw status patch attempted, regardless
// of what status is requested - this is the exact mechanism that produced the misleading
// "no matching company or no access" result in the real incident.
{
  assert(statusChangeIsLifecycleTransition('active', 'archived') === true, 'archived company + requested active -> lifecycle transition, blocked from raw patch');
}
// Requesting the literal 'archived' target must also be blocked (the pre-existing rule,
// confirmed unchanged).
{
  assert(statusChangeIsLifecycleTransition('archived', 'active') === true, 'requesting literal archived target -> lifecycle transition, blocked from raw patch');
}
// An ordinary, non-lifecycle status edit on a non-archived company (e.g. active <-> planning
// <-> paused) must still work normally through the generic update path - this fix must not
// break real, legitimate operational-status editing.
{
  assert(statusChangeIsLifecycleTransition('planning', 'active') === false, 'active -> planning on a non-archived company is NOT a lifecycle transition, allowed');
  assert(statusChangeIsLifecycleTransition('paused', 'planning') === false, 'planning -> paused on a non-archived company is NOT a lifecycle transition, allowed');
}

console.log(failed ? '\nSOME REGRESSIONS FAILED' : '\nALL REGRESSIONS PASSED');
process.exit(failed ? 1 : 0);

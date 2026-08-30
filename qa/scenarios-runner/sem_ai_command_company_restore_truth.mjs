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

// ---- byte-for-byte copy: the shared claimsLifecycleClaim() helper ----
// A SECOND real, live-reproduced false positive was found and fixed in the same pass
// (2026-08-30): a plain, correct, truthful read-only answer to "can't find company
// test3" - "test3 is archived. Should I restore it?" - matched archiv(ed) near "company"
// under the FIRST version of the broadened regex and had its own accurate response
// destroyed and replaced with a false "Couldn't confirm that" correction. "test3 IS
// archived" is a present-tense STATE DESCRIPTION (accurate, must never be touched), not a
// completion CLAIM. The state-description exclusion is PRESENT tense only ("is"/"are") -
// a THIRD test case caught during the same fix ("The company was restored successfully.")
// showed past-tense passive voice is the MORE common way a genuine completion claim gets
// phrased ("Done! The company was restored."), not a historical-fact statement -
// "was"/"were" are deliberately NOT excluded.
function claimsLifecycleClaim(summary, verbAlternation, nounAlternation) {
  const claimPattern = new RegExp(
    `\\b(${verbAlternation})\\b[^.]{0,40}\\b(${nounAlternation})\\b|\\b(${nounAlternation})\\b[^.]{0,40}\\b(${verbAlternation})\\b`,
    'i',
  );
  const stateDescriptionPattern = /\b(is|are)\s+(currently\s+|already\s+)?(delet(ed)|archiv(ed)|remov(ed)|restor(ed)|end(ed))\b/i;
  return claimPattern.test(summary) && !stateDescriptionPattern.test(summary);
}
// ---- byte-for-byte copy: findEntityStateClaimContradiction, the GENERIC canonical-state
// grounding layer (2026-08-30). See supabase/functions/sem-ai-command/index.ts for the
// full incident 1 (company, false negative) / incident 2 (person, false positive) record -
// this single, resource-agnostic function replaces the earlier company-only
// findCompanyStateClaimContradiction, parameterized by a per-resource-type vocabulary. ----
function findEntityStateClaimContradiction(summary, entities, vocabulary) {
  for (const e of entities) {
    if (!e || typeof e.name !== 'string' || !e.name.trim()) continue;
    const escapedName = e.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const word of Object.keys(vocabulary)) {
      const pattern = new RegExp(
        `\\b${escapedName}\\b(?:'s status)?\\s+(?:is|are)\\s+(?:currently\\s+|already\\s+)?${word}\\b`,
        'i',
      );
      if (!pattern.test(summary)) continue;
      const matches = vocabulary[word](e.state);
      return { name: e.name.trim(), claimedWord: word, realState: e.state, contradicted: !matches };
    }
  }
  return null;
}
const COMPANY_STATE_CLAIM_VOCAB = {
  archived: (s) => s === 'archived',
  active: (s) => s !== 'archived',
};
const PERSON_STATE_CLAIM_VOCAB = {
  employed: (active) => active === true,
  active: (active) => active === true,
  inactive: (active) => active === false,
};
// Thin wrapper matching the old test names/shape used below, for minimal test-file churn.
function findCompanyStateClaimContradiction(summary, companies) {
  const r = findEntityStateClaimContradiction(
    summary,
    companies.map((c) => ({ name: c.name, state: c.status })),
    COMPANY_STATE_CLAIM_VOCAB,
  );
  return r && r.contradicted ? { name: r.name, claimedStatus: r.claimedWord, realStatus: String(r.realState) } : null;
}

// ---- byte-for-byte copy: claimsCompanyLifecycleChange/claimsPersonLifecycleChange, now
// suppression-aware (incident 2's fix): a grounded, confirmed-TRUE state claim about the
// named entity suppresses the blunter word-proximity corrector for this turn, since the
// entity's own name can trivially contain the generic noun the corrector scans for (e.g.
// "test3 employee" contains "employee") - see the real, live-reproduced false positive on
// "is test3 employee currently employed?" documented in the file header comment. ----
function claimsCompanyLifecycleChange(summary, archiveCompanyIds, restoreCompanyIds, companies = []) {
  if (archiveCompanyIds.length > 0 || restoreCompanyIds.length > 0) return false;
  const stateClaim = findEntityStateClaimContradiction(
    summary,
    companies.map((c) => ({ name: c.name, state: c.status })),
    COMPANY_STATE_CLAIM_VOCAB,
  );
  if (stateClaim && !stateClaim.contradicted) return false;
  return claimsLifecycleClaim(summary, 'delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'company');
}
function claimsPersonLifecycleChange(summary, endEmploymentPersonIds, restoreEmploymentPersonIds, people = []) {
  if (endEmploymentPersonIds.length > 0 || restoreEmploymentPersonIds.length > 0) return false;
  const stateClaim = findEntityStateClaimContradiction(
    summary,
    people.map((p) => ({ name: p.full_name, state: p.active })),
    PERSON_STATE_CLAIM_VOCAB,
  );
  if (stateClaim && !stateClaim.contradicted) return false;
  return claimsLifecycleClaim(summary, 'delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|end(ed|ing)?|restor(ed|ing)', 'employe(e|d)|person|staff');
}

// ---- byte-for-byte copy: the updateCompanies lifecycle-transition-skip logic ----
function statusChangeIsLifecycleTransition(requestedStatus, currentStatus) {
  return !!requestedStatus && (requestedStatus === 'archived' || currentStatus === 'archived');
}

// ---- byte-for-byte copy: the verb-contradiction guard (disambiguation-stale-actionType-hijack) ----
// A SEVENTH real defect, independently rediscovered by the final verifier certifying the
// fixes above (2026-08-30): matchDisambiguationOption() matched a new command against a
// pending disambiguation's option LABELS only, with no check that the new command's own
// words agreed with that option's actionType. Live-reproduced in real production data:
// command literally "archive test3" while a stale disambiguation ("Which archived company
// should I restore?", every option actionType:"restore") was still pending - "test3"
// matched the label substring and the code executed a RESTORE, the opposite of the new
// command's own literal verb.
const ARCHIVE_VERB_PATTERN = /\b(archiv(e|ed|ing)|delet(e|ed|ing)|remov(e|ed|ing)|end(?:ed|ing)?(?:\s+employment)?)\b/i;
const RESTORE_VERB_PATTERN = /\b(restor(e|ed|ing)|un-?archiv(e|ed|ing)|bring\s+(it\s+)?back|reactivat(e|ed|ing))\b/i;
function commandContradictsActionType(command, actionType) {
  const resolvedActionType = actionType || 'archive';
  if (resolvedActionType === 'archive' && RESTORE_VERB_PATTERN.test(command) && !ARCHIVE_VERB_PATTERN.test(command)) return true;
  if (resolvedActionType === 'restore' && ARCHIVE_VERB_PATTERN.test(command) && !RESTORE_VERB_PATTERN.test(command)) return true;
  return false;
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
// CRITICAL, live-reproduced (2026-08-30): the exact real question that triggered a real
// false positive in production against the first version of this fix - a plain, correct,
// truthful answer to "can't find company test3" must NOT be corrupted into a false
// "Couldn't confirm that" message. This is the state-description exclusion's own reason
// for existing.
{
  const fired = claimsCompanyLifecycleChange('test3 is archived. Should I restore it, or leave it archived?', [], []);
  assert(fired === false, 'CRITICAL: a truthful "test3 is archived" state description is never corrupted into a false correction');
}
// Same state-description exclusion, other verbs/tenses, to prove it's general not
// company-specific luck.
{
  assert(claimsLifecycleClaim('The task is archived.', 'archiv(ed|ing)', 'task') === false, 'task: "is archived" state description not caught');
  assert(claimsLifecycleClaim('This goal is already restored.', 'restor(ed|ing)', 'goal') === false, 'goal: present-tense "is already restored" state description not caught');
  // "was" is intentionally NOT excluded (see the helper's own comment) - accepted
  // trade-off: an occasional genuine historical mention in past tense gets caught too,
  // preferred over missing a real completion claim (the much more common and much more
  // severe failure mode "was X-ed" phrasing is actually used for in practice).
  assert(claimsLifecycleClaim('This goal was already restored last month.', 'restor(ed|ing)', 'goal') === true, 'goal: past-tense "was" is intentionally NOT excluded (documented trade-off)');
  assert(claimsLifecycleClaim('That employee is currently ended.', 'end(ed|ing)?', 'employe(e|d)|person|staff') === false, 'person: "is currently ended" state description not caught');
}
// A genuine completion CLAIM must still be caught even with a nearby, unrelated copula
// elsewhere in the sentence - the exclusion must be narrow (verb-adjacent), not blanket.
{
  const fired = claimsCompanyLifecycleChange('Done - I archived the company just now, and it is fully processed.', [], []);
  assert(fired === true, 'a real completion claim ("I archived...") is still caught even with an unrelated "is" elsewhere in the sentence');
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

// ============ Defect 7: disambiguation-stale-actionType-hijack ============
// The EXACT real production case: "archive test3" while a stale disambiguation with
// actionType:"restore" is pending must be recognized as a contradiction, not silently
// executed as a restore.
{
  assert(commandContradictsActionType('archive test3', 'restore') === true, 'CRITICAL: "archive test3" contradicts a pending actionType:restore (the real incident)');
  assert(commandContradictsActionType('restore test3', 'archive') === true, 'symmetric case: "restore test3" contradicts a pending actionType:archive');
}
// Ordinary affirmatives (the overwhelmingly common real case) must be completely unaffected -
// they contain neither verb family, so they can never "contradict".
{
  assert(commandContradictsActionType('yes', 'restore') === false, 'bare "yes" never contradicts (no verb at all)');
  assert(commandContradictsActionType('that one', 'archive') === false, '"that one" never contradicts (no verb at all)');
  assert(commandContradictsActionType('do it', 'restore') === false, '"do it" never contradicts (no verb at all)');
}
// A reply that genuinely agrees with the pending action must still resolve normally.
{
  assert(commandContradictsActionType('yes, restore test3', 'restore') === false, 'an agreeing reply ("restore test3" when actionType is restore) does not contradict');
  assert(commandContradictsActionType('archive it please', 'archive') === false, 'an agreeing reply ("archive" when actionType is archive) does not contradict');
}

// findCompanyStateClaimContradiction: the real, live incident this corrector exists to
// close. "test3 is already archived" said with zero real archiveCompanyIds attempted while
// test3's real, fresh status was 'active'.
{
  const companies = [{ id: '93073272-c9c6-485c-b0ad-459df37ce6f5', name: 'test3', status: 'active' }];
  const contradiction = findCompanyStateClaimContradiction('test3 is already archived. No action taken.', companies);
  assert(!!contradiction, 'CRITICAL: false "test3 is already archived" claim is caught against real status=active', contradiction);
  assert(contradiction && contradiction.realStatus === 'active', 'contradiction carries the real, fresh status (active), not the false claim');
}
// Symmetric direction: a false "is active" claim about a genuinely archived company.
{
  const companies = [{ id: 'x', name: 'test', status: 'archived' }];
  const contradiction = findCompanyStateClaimContradiction('test is currently active and healthy.', companies);
  assert(!!contradiction, 'symmetric case: false "is active" claim caught against real status=archived');
}
// A TRUE state description must never be flagged - this is the exact case the earlier fix
// (state-description exclusion in claimsLifecycleClaim) protects, now double-checked here
// against real ground truth instead of only against text shape.
{
  const companies = [{ id: 'x', name: 'test3', status: 'archived' }];
  const contradiction = findCompanyStateClaimContradiction('test3 is archived. Should I restore it?', companies);
  assert(contradiction === null, 'a TRUE "is archived" state description (real status matches) is never flagged');
}
{
  const companies = [{ id: 'x', name: 'test3', status: 'active' }];
  const contradiction = findCompanyStateClaimContradiction('test3 is active. Everything looks normal.', companies);
  assert(contradiction === null, 'a TRUE "is active" state description (real status matches) is never flagged');
}
// Non-archived/active statuses (planning/paused) never trigger a false "not archived"
// correction just because the claim says "archived" and the real value differs - only the
// two specific claim words (archived/active) are checked, and only against real ground truth.
{
  const companies = [{ id: 'x', name: 'test3', status: 'planning' }];
  const contradiction = findCompanyStateClaimContradiction('test3 is archived and unavailable.', companies);
  assert(!!contradiction && contradiction.realStatus === 'planning', 'false "archived" claim against a real status of planning is still caught (not archived is not archived)');
}
// Must not false-positive on ordinary unrelated prose that never pairs a real company name
// with an archived/active claim.
{
  const companies = [{ id: 'x', name: 'test3', status: 'active' }];
  const contradiction = findCompanyStateClaimContradiction('You have 12 companies total across the workspace.', companies);
  assert(contradiction === null, 'no contradiction when the summary never claims a specific state for the company');
}
// Must not fire when a real mutation was actually attempted this turn (mirrors
// claimsCompanyLifecycleChange's own guard) - covered at the call site
// (archiveCompanyIds.length === 0 && restoreCompanyIds.length === 0), not inside the
// function itself, so this documents that the call-site guard is the actual gate.

// ============ INCIDENT 2: person false-positive over-correction, found live while
// verifying incident 1's fix ============
// Real, live-reproduced case: after two REAL, successful person-lifecycle mutations in the
// same channel (end employment, then restore employment), a plain read question ("is test3
// employee currently employed?") got a false "Couldn't confirm that..." denial, because the
// fixture's own name ("test3 employee") contains the literal noun "employee" the old,
// unguarded claimsPersonDeleted regex scanned for - so ANY truthful sentence mentioning
// this person by name (including a truthful past-tense reference to the real restore that
// happened two turns earlier) tripped it.
{
  const people = [{ id: 'f5ca8d22-637c-472e-b368-7d93f6d30f0e', full_name: 'test3 employee', active: true }];
  const fired = claimsPersonLifecycleChange(
    'test3 employee is currently employed. Their employment was restored earlier in this conversation.',
    [], [], people,
  );
  assert(fired === false, 'CRITICAL: truthful "is currently employed" answer (naturally phrased in direct response to the read question) is suppressed, not falsely denied (the real incident 2 case)', fired);
}
// The state-claim grounding itself must correctly find this as a NON-contradiction (the
// claim is true) - this is what drives the suppression above.
{
  const people = [{ id: 'x', full_name: 'test3 employee', active: true }];
  const r = findEntityStateClaimContradiction('test3 employee is currently employed.', people.map((p) => ({ name: p.full_name, state: p.active })), PERSON_STATE_CLAIM_VOCAB);
  assert(!!r && r.contradicted === false, 'grounded "is currently employed" claim against real active=true is confirmed true, not contradicted');
}
// Symmetric: a FALSE "is currently employed" claim against a real active=false must still
// be caught as a genuine contradiction (suppression must not become a blanket bypass).
{
  const people = [{ id: 'x', full_name: 'test3 employee', active: false }];
  const r = findEntityStateClaimContradiction('test3 employee is currently employed.', people.map((p) => ({ name: p.full_name, state: p.active })), PERSON_STATE_CLAIM_VOCAB);
  assert(!!r && r.contradicted === true, 'false "is currently employed" claim against real active=false is still caught as a contradiction');
}
// And the suppression must not swallow a GENUINE false claim about the same named person -
// if the grounded claim is actually FALSE (contradicted), claimsPersonLifecycleChange must
// still fire (suppression only applies to a CONFIRMED-TRUE grounded claim).
// Note: a BARE false "is employed" claim (no delete/archive/remove/end/restore verb) is
// not this corrector's job to catch at all - same documented, deliberate gap as the
// company "bare active claim" boundary above; the CONTRADICTION path (asserted immediately
// above) is what catches and overrides a bare false state claim. What must NOT happen is
// suppression swallowing a genuine VERB-based completion claim just because a state claim
// elsewhere in the same sentence happens to be contradicted - not confirmed-true.
{
  const people = [{ id: 'x', full_name: 'test3 employee', active: false }];
  const fired = claimsPersonLifecycleChange('test3 employee was restored and is currently employed.', [], [], people);
  assert(fired === true, 'a genuine verb-based completion claim ("was restored") still fires claimsPersonLifecycleChange when the paired state claim is contradicted (real active=false), not confirmed-true - suppression does not become a blanket bypass');
}
// A real mutation attempted this turn must still short-circuit claimsPersonLifecycleChange
// exactly as before (unaffected by the new grounding parameter).
{
  const people = [{ id: 'x', full_name: 'test3 employee', active: true }];
  const fired = claimsPersonLifecycleChange('test3 employee: restored.', [], ['f5ca8d22-637c-472e-b368-7d93f6d30f0e'], people);
  assert(fired === false, 'corrector does not fire when a real restore was actually attempted (unaffected by grounding)');
}
// Backward-compatibility: calling claimsCompanyLifecycleChange without the new 4th
// (companies) argument must behave exactly as before this refactor (default []).
{
  const fired = claimsCompanyLifecycleChange('The company was restored successfully.', [], []);
  assert(fired === true, 'claimsCompanyLifecycleChange without a companies argument still behaves as before (no regression from the generic refactor)');
}
// The SAME structural risk applies to a company literally named with "Company"/"Business"
// in it - suppression must work symmetrically for companies, not just people.
{
  const companies = [{ id: 'x', name: 'Test Business Company', status: 'active' }];
  const fired = claimsCompanyLifecycleChange('Test Business Company is currently active. It was restored earlier in this conversation.', [], [], companies);
  assert(fired === false, 'symmetric case: a truthful "is currently active" claim about a company whose own name contains "Company" is suppressed too');
}

console.log(failed ? '\nSOME REGRESSIONS FAILED' : '\nALL REGRESSIONS PASSED');
process.exit(failed ? 1 : 0);

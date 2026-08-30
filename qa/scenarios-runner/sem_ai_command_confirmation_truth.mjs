// Permanent regression for the "Fix Multi-Entity Execution, Confirmation Truth, Assignment
// Context, and Cascade/Postcondition Consistency" campaign (2026-08-30) — see
// qa/KNOWN_FAILURE_MODES.md for the full incident record. A founder asked Brain to
// "delete all data related to test4 company", confirmed a preview, and got "Confirmed —
// Permanently delete test4 company, test4 employee..." with ZERO real mutation behind it
// (no AI-reachable permanent-delete-with-cascade capability existed at all at the time).
// Root cause: the deterministic bulk_confirmation resolution path (supabase/functions/
// sem-ai-command/index.ts) always emits "Confirmed — {summary}" unconditionally — correct
// as a record of AUTHORIZATION, but nothing checked whether the confirmed action.
// payload actually mapped to a real, grounded, executed capability before letting that
// text stand as the final answer. AUTHORIZED is not COMPLETED.
//
// This is pure JS/TS logic, not a SQL/RLS invariant — run with:
//   node qa/scenarios-runner/sem_ai_command_confirmation_truth.mjs
// Function bodies below are byte-for-byte copies of the shipped logic (kept in sync
// manually, same convention as every other file in this directory).

// ---- byte-for-byte copy: the Bug 1 safety-net gate (index.ts) ----
function shouldReplaceUngroundedConfirmation(model, groundedOutcomeThisTurn) {
  return model === 'deterministic-confirmation' && !groundedOutcomeThisTurn;
}

// ---- byte-for-byte copy: permanently_delete_fixture_company_graph() result -> report line
// mapping (index.ts) — the real, structured RPC result is the ONLY source of truth for this
// message, never model prose. A refusal must never be softened into a partial success. ----
function buildPermanentDeleteLine(name, r) {
  if (r.reason === 'not_found') return `**Couldn't permanently delete ${name}** — it no longer exists.`;
  if (r.reason === 'denied') return `**Couldn't permanently delete ${name}** — you do not have permission for this action.`;
  if (r.reason === 'not_a_fixture') return `**Couldn't permanently delete ${name}** — this only works for disposable test/QA fixtures. Use the Companies page's admin delete action for a real company.`;
  if (r.reason === 'non_fixture_people_attached') {
    const blockerNames = (r.blockers || []).map((b) => b.name).join(', ') || 'other people';
    return `**Couldn't permanently delete ${name}** — it has people attached whose names don't match the fixture convention (${blockerNames}), so nothing was removed.`;
  }
  if (r.reason === 'has_non_fixture_dependents') {
    const blockerTables = (r.blockers || []).map((b) => b.table).join(', ') || 'other records';
    return `**Couldn't permanently delete ${name}** — it still has related records (${blockerTables}) this action won't touch, so nothing was removed.`;
  }
  if (r.reason === 'person_delete_blocked') {
    const blockedNames = (r.peopleBlocked || []).map((b) => b.name).join(', ') || 'a person';
    return `**Couldn't permanently delete ${name}** — ${blockedNames} can't be safely removed (other records still reference them), so nothing was removed.`;
  }
  if (r.reason === 'deleted') {
    const deletedPeople = (r.peopleDeleted || []).map((p) => p.name).join(', ');
    return `**${name} permanently deleted.**${deletedPeople ? ` Also removed: ${deletedPeople}.` : ''}`;
  }
  return `**Couldn't permanently delete ${name}** — unexpected result.`;
}

// ---- byte-for-byte copy: claimsCompanyDeleted's guard, now including
// permanentDeleteFixtureCompanyIds (index.ts) ----
function claimsCompanyDeletedGuardPasses(archiveCompanyIds, restoreCompanyIds, permanentDeleteFixtureCompanyIds) {
  return archiveCompanyIds.length === 0 && restoreCompanyIds.length === 0 && permanentDeleteFixtureCompanyIds.length === 0;
}

let failed = false;
function assert(cond, name, detail) {
  if (!cond) { failed = true; console.error(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
  else console.log(`PASS ${name}`);
}

// ============ CONFIRMATION_DOES_NOT_EQUAL_EXECUTION ============
// The exact real incident: a deterministic confirmation with no grounded outcome must
// never be allowed to stand as an unqualified "Confirmed — ..." success claim.
{
  assert(
    shouldReplaceUngroundedConfirmation('deterministic-confirmation', false) === true,
    'CRITICAL: an ungrounded deterministic confirmation (the real "Confirmed — Permanently delete test4..." incident shape) is flagged for replacement',
  );
}
// A grounded deterministic confirmation (the payload mapped to a real, executed capability
// - e.g. archiveCompanyIds actually ran and produced a lifecycleReport) must NEVER be
// replaced - this is the overwhelmingly common, already-correct case (archive/restore/end
// employment confirmations all already ground via lifecycleReports).
{
  assert(
    shouldReplaceUngroundedConfirmation('deterministic-confirmation', true) === false,
    'a grounded deterministic confirmation (real outcome exists) is never replaced',
  );
}
// An ordinary LLM-driven turn (not a confirmation at all) must never trigger this gate,
// regardless of whether anything grounded happened - this gate is confirmation-specific.
{
  assert(
    shouldReplaceUngroundedConfirmation('claude-sonnet-4-5', false) === false,
    'an ordinary (non-confirmation) turn is never affected by this gate, even with no grounded outcome',
  );
  assert(
    shouldReplaceUngroundedConfirmation('claude-sonnet-4-5', true) === false,
    'an ordinary (non-confirmation) turn with a real grounded outcome is unaffected (sanity check)',
  );
}
// The other two deterministic paths (clarification/disambiguation) are NOT covered by this
// specific gate (they resolve to real, already-wired capabilities via
// CLARIFICATION_ENTITY_ACTION_FIELD, which always ground through lifecycleReports) - this
// documents that scope boundary explicitly rather than leaving it implicit.
{
  assert(
    shouldReplaceUngroundedConfirmation('deterministic-clarification', false) === false,
    'deterministic-clarification is out of scope for this specific gate (always resolves to an already-wired field)',
  );
  assert(
    shouldReplaceUngroundedConfirmation('deterministic-disambiguation', false) === false,
    'deterministic-disambiguation is out of scope for this specific gate (always resolves to an already-wired field)',
  );
}

// ============ DESTRUCTIVE_CONFIRMATION_EXECUTES_IMMUTABLE_PAYLOAD (report grounding) ============
{
  const line = buildPermanentDeleteLine('test4', { reason: 'deleted', peopleDeleted: [{ id: 'x', name: 'test4 employee' }] });
  assert(line === '**test4 permanently deleted.** Also removed: test4 employee.', 'real deletion with a fixture person removed produces a clean, specific success line', line);
}
{
  const line = buildPermanentDeleteLine('test4', { reason: 'deleted', peopleDeleted: [] });
  assert(line === '**test4 permanently deleted.**', 'real deletion with no attached people produces a clean success line with no trailing "Also removed:"');
}
// MULTI_ENTITY_DELETE_NEVER_REPORTS_COMPLETE_ON_PARTIAL_FAILURE — every refusal reason
// must produce an explicit "Couldn't permanently delete" line, never a success-shaped one.
{
  const cases = [
    ['not_found', {}],
    ['denied', {}],
    ['not_a_fixture', {}],
    ['non_fixture_people_attached', { blockers: [{ name: 'Real Employee' }] }],
    ['has_non_fixture_dependents', { blockers: [{ table: 'goals' }] }],
    ['person_delete_blocked', { peopleBlocked: [{ name: 'test4 employee' }] }],
  ];
  for (const [reason, extra] of cases) {
    const line = buildPermanentDeleteLine('test4', { reason, ...extra });
    assert(line.startsWith("**Couldn't permanently delete test4**"), `reason "${reason}" never produces a success-shaped message`, line);
    assert(!/permanently deleted/i.test(line), `reason "${reason}" never contains the word "deleted" in a success sense`, line);
  }
}

// ============ claimsCompanyDeleted guard includes permanentDeleteFixtureCompanyIds ============
{
  assert(claimsCompanyDeletedGuardPasses([], [], []) === true, 'guard passes (corrector may fire) when nothing was attempted at all');
  assert(claimsCompanyDeletedGuardPasses([], [], ['id']) === false, 'guard blocks the corrector when a real permanent-delete was attempted (must not false-positive on a real attempt)');
  assert(claimsCompanyDeletedGuardPasses(['id'], [], []) === false, 'guard still blocks on a real archive attempt (unaffected, pre-existing behavior)');
}

// ---- byte-for-byte copy: personAssignmentReport's per-entry formatting logic (index.ts,
// Bugs 7/9) - only builds when every requested assignment succeeded (positional
// correspondence with the RPC result is unsafe on partial failure, see the comment in
// index.ts), reporting real canonical legal-employer/operating-company names, never
// re-derived from prose. ----
function buildPersonAssignmentLine(a, personNameById, companyNameById) {
  const personName = personNameById.get(a.personId) || a.personId;
  const legalName = a.legalEmployerCompanyId ? (companyNameById.get(a.legalEmployerCompanyId) || a.legalEmployerCompanyId) : null;
  const operatingName = a.operatingCompanyId ? (companyNameById.get(a.operatingCompanyId) || a.operatingCompanyId) : null;
  if (legalName && operatingName && legalName !== operatingName) {
    return `**${personName} reassigned.** Legal employer: ${legalName}. Operating company: ${operatingName}.`;
  }
  if (legalName && operatingName) return `**${personName} reassigned to ${operatingName}** (legal employer and operating company).`;
  return `**${personName} reassigned to ${operatingName || legalName || 'the specified company'}.**`;
}
// ---- byte-for-byte copy: the caller's filtering logic (index.ts) - real, live-caught
// regression fixed in the same pass: a brand-new hire (personId null, only resolvable via
// personIndex into this same turn's createPeople - nothing to "reassign") produced an
// ugly, wrong "**that person reassigned to the specified company.**" before this filter was
// added. Scoped to real-personId entries (a genuinely pre-existing person) only. ----
function buildPersonAssignmentReport(createPersonAssignmentsFiltered, createdCount, personNameById, companyNameById) {
  const reassignmentEntries = createPersonAssignmentsFiltered.filter((a) => a.personId !== null);
  if (reassignmentEntries.length === 0 || createdCount !== createPersonAssignmentsFiltered.length) return null;
  return reassignmentEntries.map((a) => buildPersonAssignmentLine(a, personNameById, companyNameById)).join(' ');
}

// ============ ASSIGNMENT_CONFIRMATION_EXECUTES_CANONICAL_RELATIONSHIP_IDS ============
// The real transcript case: "reassign test4 employee to test4 company" when legal employer
// and operating company differ - both dimensions named explicitly, by real company name.
{
  const personNameById = new Map([['p1', 'test4 employee']]);
  const companyNameById = new Map([['c1', 'test4 company'], ['c2', 'CLIX GPS']]);
  const line = buildPersonAssignmentLine({ personId: 'p1', legalEmployerCompanyId: 'c1', operatingCompanyId: 'c1' }, personNameById, companyNameById);
  assert(line === '**test4 employee reassigned to test4 company** (legal employer and operating company).', 'both dimensions moving to the same company produces one clean, specific line', line);
}
// The "move entirely" case where legal and operating differ before the change - both must
// be named explicitly, never a vague "switch them to X" that leaves one dimension unstated.
{
  const personNameById = new Map([['p1', 'test4 employee']]);
  const companyNameById = new Map([['c1', 'test4 company'], ['c2', 'CLIX GPS']]);
  const line = buildPersonAssignmentLine({ personId: 'p1', legalEmployerCompanyId: 'c1', operatingCompanyId: 'c2' }, personNameById, companyNameById);
  assert(line === '**test4 employee reassigned.** Legal employer: test4 company. Operating company: CLIX GPS.', 'differing legal employer vs operating company are both named explicitly, never merged into one vague sentence', line);
}
// Unknown company id falls back gracefully rather than throwing or emitting "undefined".
{
  const line = buildPersonAssignmentLine({ personId: 'p1', legalEmployerCompanyId: null, operatingCompanyId: 'c9' }, new Map([['p1', 'test4 employee']]), new Map());
  assert(line === '**test4 employee reassigned to c9.**', 'unknown operatingCompanyId falls back to the raw id gracefully, never "undefined"', line);
}
// CRITICAL, real live-caught regression: a brand-new hire (personId null - only resolvable
// via personIndex into this same turn's createPeople, nothing to "reassign") must NEVER
// produce this report at all - the pre-existing generic batchLine + model prose stays
// completely unaffected for an ordinary new hire.
{
  const personNameById = new Map();
  const companyNameById = new Map([['c1', 'test8'], ['c2', 'test9']]);
  const newHireEntry = { personId: null, legalEmployerCompanyId: 'c1', operatingCompanyId: 'c2' };
  const report = buildPersonAssignmentReport([newHireEntry], 1, personNameById, companyNameById);
  assert(report === null, 'CRITICAL: a brand-new hire (personId null) never produces the reassignment report (the real "that person reassigned to the specified company" incident)', report);
}
// A genuine reassignment (real personId) alongside an unrelated new hire in the same batch
// only reports on the real reassignment, not the new hire.
{
  const personNameById = new Map([['p1', 'test4 employee']]);
  const companyNameById = new Map([['c1', 'test8']]);
  const entries = [
    { personId: 'p1', legalEmployerCompanyId: 'c1', operatingCompanyId: 'c1' },
    { personId: null, legalEmployerCompanyId: 'c1', operatingCompanyId: 'c1' },
  ];
  const report = buildPersonAssignmentReport(entries, 2, personNameById, companyNameById);
  assert(report === '**test4 employee reassigned to test8** (legal employer and operating company).', 'a real reassignment mixed with a new hire in the same batch reports only the real reassignment', report);
}
// All-new-hire batch (no real personId anywhere) never produces this report.
{
  const report = buildPersonAssignmentReport([{ personId: null, legalEmployerCompanyId: 'c1', operatingCompanyId: 'c1' }], 1, new Map(), new Map());
  assert(report === null, 'an all-new-hire batch (no real personId at all) never produces the reassignment report');
}
// Partial failure across the whole batch still suppresses the report even when the
// reassignment entry itself would have qualified, per the documented positional-safety
// scope limitation.
{
  const personNameById = new Map([['p1', 'test4 employee']]);
  const entries = [{ personId: 'p1', legalEmployerCompanyId: 'c1', operatingCompanyId: 'c1' }];
  const report = buildPersonAssignmentReport(entries, 0, personNameById, new Map());
  assert(report === null, 'a partial-failure batch (createdCount !== requested length) suppresses the report entirely, even for a qualifying reassignment entry');
}

// ============ A THIRD false-completion shape: a bare future-tense promise with
// pendingAction===null and zero grounded outcome (the real "I'll assign the task to them
// now" incident — nothing was queued or executed at all) ============
// ---- byte-for-byte copy: the FUTURE_PROMISE_PATTERN + claimsFutureActionWithNoPlan gate (index.ts) ----
const FUTURE_PROMISE_PATTERN = /\b(i'?ll|i will|i'?m going to|going to)\b[^.]{0,40}\b(assign|creat(e|ing)|archiv(e|ing)|restor(e|ing)|updat(e|ing)|delet(e|ing)|mov(e|ing)|reassign(ing)?|end(ing)?|set(ting)?|remov(e|ing))\b/i;
function claimsFutureActionWithNoPlan(model, pendingAction, groundedOutcomeThisTurn, summary) {
  return model !== 'deterministic-confirmation' && model !== 'deterministic-plan-execution' && model !== 'deterministic-clarification' && model !== 'deterministic-disambiguation'
    && !pendingAction && !groundedOutcomeThisTurn
    && FUTURE_PROMISE_PATTERN.test(summary || '');
}
{
  const fired = claimsFutureActionWithNoPlan('claude-sonnet-4-5', null, false, "QA-MULTI-TASK has no owner set yet. I'll assign the task to them now.");
  assert(fired === true, 'CRITICAL: the real incident text ("I\'ll assign the task to them now", pendingAction null, nothing grounded) is caught', fired);
}
// A legitimate bulk_confirmation/multi_action_plan proposal (real pendingAction set) using
// similar phrasing ("I'll do X, confirm?") must be completely unaffected.
{
  const fired = claimsFutureActionWithNoPlan('claude-sonnet-4-5', { kind: 'multi_action_plan', executionPlan: [{ id: 'a1' }] }, false, "I'll restore their employment and reassign them. Confirm?");
  assert(fired === false, 'a real pendingAction proposal using similar future-tense phrasing is never flagged (a genuine confirmation question, not an empty promise)');
}
// A turn where something genuinely grounded DID happen (groundedOutcomeThisTurn true) is
// never flagged even if the summary happens to also contain future-tense language about a
// SEPARATE, not-yet-done part.
{
  const fired = claimsFutureActionWithNoPlan('claude-sonnet-4-5', null, true, "test4 employee: restored. I'll also update their assignment.");
  assert(fired === false, 'a turn with a real grounded outcome this turn is never flagged, even if it also mentions a future step');
}
// The deterministic tags themselves (confirmation/plan-execution/clarification/
// disambiguation) are always out of scope for this specific gate, regardless of phrasing -
// they have their own dedicated grounding mechanisms already.
{
  assert(claimsFutureActionWithNoPlan('deterministic-confirmation', null, false, "I'll do it now.") === false, 'deterministic-confirmation is out of scope for this gate');
  assert(claimsFutureActionWithNoPlan('deterministic-plan-execution', null, false, "I'll do it now.") === false, 'deterministic-plan-execution is out of scope for this gate');
}
// Ordinary prose with no future-tense action commitment at all (a plain read answer) is
// never flagged.
{
  const fired = claimsFutureActionWithNoPlan('claude-sonnet-4-5', null, false, 'test4 is archived. test4 employee is currently employed elsewhere.');
  assert(fired === false, 'an ordinary read-only answer with no future-tense commitment language is never flagged');
}

console.log(failed ? '\nSOME REGRESSIONS FAILED' : '\nALL REGRESSIONS PASSED');
process.exit(failed ? 1 : 0);

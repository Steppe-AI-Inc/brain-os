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
  const personName = a.personId ? (personNameById.get(a.personId) || a.personId) : 'that person';
  const legalName = a.legalEmployerCompanyId ? (companyNameById.get(a.legalEmployerCompanyId) || a.legalEmployerCompanyId) : null;
  const operatingName = a.operatingCompanyId ? (companyNameById.get(a.operatingCompanyId) || a.operatingCompanyId) : null;
  if (legalName && operatingName && legalName !== operatingName) {
    return `**${personName} reassigned.** Legal employer: ${legalName}. Operating company: ${operatingName}.`;
  }
  if (legalName && operatingName) return `**${personName} reassigned to ${operatingName}** (legal employer and operating company).`;
  return `**${personName} reassigned to ${operatingName || legalName || 'the specified company'}.**`;
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
// Unknown ids fall back gracefully rather than throwing or emitting "undefined".
{
  const line = buildPersonAssignmentLine({ personId: null, legalEmployerCompanyId: null, operatingCompanyId: 'c9' }, new Map(), new Map());
  assert(line === '**that person reassigned to c9.**', 'missing personId/legalEmployerCompanyId falls back gracefully, never "undefined"', line);
}

console.log(failed ? '\nSOME REGRESSIONS FAILED' : '\nALL REGRESSIONS PASSED');
process.exit(failed ? 1 : 0);

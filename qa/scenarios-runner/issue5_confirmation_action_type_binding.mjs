// GitHub issue #5, defect class B (the highest-risk part): a bare "yes" confirming an
// ASSIGN-EMPLOYEE clarification executed an ARCHIVE COMPANY instead.
//
// Root cause is architectural, not prose. Three facts combine to make this inevitable:
//
//   1. pendingAction's actionType is typed `"archive"|"restore"|null` (index.ts's own
//      JSON schema line and the single_entity_clarification/disambiguation system-prompt
//      blocks). An assign/reassign clarification has NO valid value to put there - the
//      action it is actually clarifying is not representable in the enum at all.
//   2. So the model emits the clarification with entityType:"company" and actionType
//      absent/null, because that is the only thing the schema permits.
//   3. The deterministic executor then resolves the field as
//      `CLARIFICATION_ENTITY_ACTION_FIELD[entityType]?.[actionType || 'archive']`
//      - an ABSENT action type is coerced to the single most destructive operation
//      available for that entity type.
//
// So: "add employee 10 to qa swarm test" -> "Did you mean QA-SWARM-TEST-CO-VIA-CHAT?"
// -> "yes" -> field resolves to archiveCompanyIds -> the company is archived. The bare
// affirmative passes isClarificationAffirmative(), and commandContradictsActionType()
// cannot help ("yes" contains neither an archive verb nor a restore verb), so nothing
// stops it.
//
// The fix is a fail-closed default: an absent/unknown actionType means "this pending
// action is not deterministically executable" and must fall through to the ordinary LLM
// path, NEVER silently become 'archive'. Absence is the signal that the clarification is
// about something the deterministic executor does not support - exactly when it must
// refuse, not when it should pick the most destructive option.
//
// Runnable with plain `node` - no deploy, no DB, no network. Mirrors index.ts's real
// logic so the invariant is testable before the Edge Function is authorized for deploy.
//
// Named regressions covered (from issue #5's own list):
//   BRAIN_CHAT_PENDING_CONFIRMATION_BOUND_TO_ACTION_TYPE
//   BRAIN_CHAT_YES_CANNOT_SWITCH_ASSIGN_TO_ARCHIVE
//   BRAIN_CHAT_PENDING_CONFIRMATION_BOUND_TO_CANONICAL_TARGET

const CLARIFICATION_ENTITY_ACTION_FIELD = {
  task: { archive: 'archiveTaskIds', restore: 'restoreTaskIds' },
  company: { archive: 'archiveCompanyIds', restore: 'restoreCompanyIds' },
  goal: { archive: 'archiveGoalIds', restore: 'restoreGoalIds' },
  channel: { archive: 'deleteChannelIds' },
  approval: { archive: 'deleteApprovalIds' },
  person: { archive: 'endEmploymentPersonIds', restore: 'restoreEmploymentPersonIds' },
  employee: { archive: 'endEmploymentPersonIds', restore: 'restoreEmploymentPersonIds' },
};

// --- The defective resolution, exactly as it exists in production today. ---
function resolveFieldBuggy(entityType, actionType) {
  return CLARIFICATION_ENTITY_ACTION_FIELD[entityType || '']?.[actionType || 'archive'];
}

// --- The fixed resolution: fail closed on an absent/unknown action type. ---
// An action type must be explicitly present AND known for a deterministic (no-LLM)
// mutation to be executed from a bare affirmative. Anything else returns undefined,
// which makes the caller fall through to the ordinary LLM path instead of mutating.
function resolveFieldFixed(entityType, actionType) {
  if (!entityType || !actionType) return undefined;
  return CLARIFICATION_ENTITY_ACTION_FIELD[entityType]?.[actionType];
}

const cases = [
  {
    name: 'ISSUE-5 REPRO: bare "yes" on an assign-employee clarification must NOT archive the company',
    entityType: 'company',
    actionType: undefined, // assign is not representable in the enum, so it is absent
    buggyExpected: 'archiveCompanyIds', // the actual production defect
    fixedExpected: undefined, // must refuse, not archive
  },
  {
    name: 'null actionType (explicitly null, same as absent) must not archive either',
    entityType: 'company',
    actionType: null,
    buggyExpected: 'archiveCompanyIds',
    fixedExpected: undefined,
  },
  {
    name: 'assign-person clarification must not end the person\'s employment',
    entityType: 'person',
    actionType: undefined,
    buggyExpected: 'endEmploymentPersonIds',
    fixedExpected: undefined,
  },
  {
    name: 'an unrepresentable actionType must refuse, not fall back to archive',
    entityType: 'company',
    actionType: 'assign',
    buggyExpected: undefined, // buggy path also refuses here (no 'assign' key)
    fixedExpected: undefined,
  },
  // Legitimate paths must keep working identically - the fix must not break real
  // archive/restore confirmations, which DO set actionType explicitly.
  {
    name: 'explicit archive clarification still archives',
    entityType: 'company',
    actionType: 'archive',
    buggyExpected: 'archiveCompanyIds',
    fixedExpected: 'archiveCompanyIds',
  },
  {
    name: 'explicit restore clarification still restores',
    entityType: 'company',
    actionType: 'restore',
    buggyExpected: 'restoreCompanyIds',
    fixedExpected: 'restoreCompanyIds',
  },
  {
    name: 'explicit task archive still archives',
    entityType: 'task',
    actionType: 'archive',
    buggyExpected: 'archiveTaskIds',
    fixedExpected: 'archiveTaskIds',
  },
  {
    name: 'explicit person restore still restores employment',
    entityType: 'person',
    actionType: 'restore',
    buggyExpected: 'restoreEmploymentPersonIds',
    fixedExpected: 'restoreEmploymentPersonIds',
  },
  {
    name: 'channel deletion (archive-only by design) still works when explicit',
    entityType: 'channel',
    actionType: 'archive',
    buggyExpected: 'deleteChannelIds',
    fixedExpected: 'deleteChannelIds',
  },
  {
    name: 'unknown entity type refuses in both',
    entityType: 'invoice',
    actionType: 'archive',
    buggyExpected: undefined,
    fixedExpected: undefined,
  },
];

let pass = 0;
let fail = 0;
const failures = [];

for (const c of cases) {
  const buggy = resolveFieldBuggy(c.entityType, c.actionType);
  const fixed = resolveFieldFixed(c.entityType, c.actionType);
  const buggyOk = buggy === c.buggyExpected;
  const fixedOk = fixed === c.fixedExpected;
  if (buggyOk && fixedOk) {
    pass++;
  } else {
    fail++;
    failures.push(
      `${c.name}\n    buggy: got ${JSON.stringify(buggy)}, expected ${JSON.stringify(c.buggyExpected)} (${buggyOk ? 'ok' : 'MISMATCH'})` +
        `\n    fixed: got ${JSON.stringify(fixed)}, expected ${JSON.stringify(c.fixedExpected)} (${fixedOk ? 'ok' : 'MISMATCH'})`
    );
  }
}

console.log(`\nissue5_confirmation_action_type_binding: ${pass}/${cases.length} passed`);
if (fail > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}

// Explicit demonstration of the live defect, printed for the record.
console.log('\nDemonstrated live defect (production behavior today):');
console.log('  entityType="company", actionType=<absent, because "assign" is not in the enum>');
console.log(`  -> resolves to ${JSON.stringify(resolveFieldBuggy('company', undefined))}  <-- ARCHIVES THE COMPANY`);
console.log('  after fix:');
console.log(`  -> resolves to ${JSON.stringify(resolveFieldFixed('company', undefined))}  <-- refuses, falls through to the LLM path`);
console.log('');

// ---------------------------------------------------------------------------------------
// run15/D122: everything above MODELS the fix, which proves nothing about index.ts — the
// call site used to cite this file as proof, and a suite that re-implements the product
// cannot be. This section executes the REAL resolveClarificationField and the REAL
// CLARIFICATION_ENTITY_ACTION_FIELD table, extracted from the shipped source, against the
// same matrix, and fails the run if the product disagrees with the fixed contract.
{
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const HERE = dirname(fileURLToPath(import.meta.url));
  const { stripTS } = await import(new URL('file://' + resolve(HERE, '_gate_extract.mjs')).href);
  const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '..', '..', 'supabase', 'functions', 'sem-ai-command', 'index.ts');
  const src = readFileSync(SRC, 'utf8');
  const tStart = src.indexOf('const CLARIFICATION_ENTITY_ACTION_FIELD');
  const fStart = src.indexOf('function resolveClarificationField(');
  if (tStart === -1 || fStart === -1) throw new Error('index.ts anchors not found — update this suite, do not let it pass');
  const tableSrc = src.slice(tStart, src.indexOf('};', tStart) + 2);
  const fnSrc = src.slice(fStart, src.indexOf('\n}', fStart) + 2);
  const realResolve = new Function(stripTS(tableSrc + '\n' + fnSrc) + '\n; return resolveClarificationField;')();
  let realFail = 0;
  for (const c of cases) {
    const got = realResolve(c.entityType, c.actionType);
    if (got !== c.fixedExpected) {
      realFail++;
      console.log('FAIL REAL ' + c.name + '\n    index.ts resolveClarificationField got ' + JSON.stringify(got) + ', expected ' + JSON.stringify(c.fixedExpected));
    }
  }
  console.log('issue5 REAL resolveClarificationField (extracted from index.ts): ' + (cases.length - realFail) + '/' + cases.length + ' agree with the fixed contract');
  if (realFail > 0) process.exit(1);
}

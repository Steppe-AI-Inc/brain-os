// VERIFIER #56 — Step 2A/2B: never-silent receipt / final-claim rule, and request-intent derivation,
// executed against the REAL structured-claim window sliced from index.ts (same anchors production
// code has; extracted by the repo's generic detyper, then ASSERTED to contain the receipt block, the
// intent derivation and the belt consumers so a drifted window fails loudly instead of passing).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS, withPatternsAboveWindow } from '../../../../scenarios-runner/_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

function extractStructuredBlock(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found');
  const anchor = source.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found');
  const end = source.indexOf('};', anchor) + 2;
  const raw = source.slice(start, end);
  for (const must of ['const requestedIntent', 'No change was made — ', 'const legacyProseFallback', 'const unaccountedCompletionProse', 'result.turnVerdict = {', 'const MUTATION_VERB_ALWAYS', 'const CONFIRMATION_COMMAND', 'const readsAsCompletion']) {
    if (!raw.includes(must)) throw new Error('window does not contain ' + must + ' — not the production window');
  }
  return withPatternsAboveWindow(source, stripTS(raw));
}
const slice = extractStructuredBlock(src);
export const fn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  slice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, pendingAction: result.pendingAction, verdict: result.turnVerdict, intent: requestedIntent, legacy: legacyProseFallback, unaccounted: unaccountedCompletionProse, rewrite: rewriteFromStructure };'
);
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
export const run = ({ command, claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, model = 'gpt', grounded = false, labels = {}, deterministicPrefix = '', lifecycleReports = [], factLines = [], names = [], fullyDeterministic = false, orgGraph = null }) => {
  globalThis.command = command; globalThis.lifecycleReports = lifecycleReports; globalThis.factLines = factLines; globalThis.organizationGraphCheck = orgGraph; globalThis.workOrder = { id: 'wo-v56' };
  globalThis.knownEntityNames = new Set(names.map((n) => String(n).trim().toLowerCase()));
  return fn({ claims: claims === null ? null : JSON.parse(JSON.stringify(claims)), summary, pendingAction: pendingAction ? JSON.parse(JSON.stringify(pendingAction)) : null, questions }, evidence, context, model, grounded, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mk(labels.runtime));
};
export const ID = '11111111-1111-1111-1111-111111111111';
export const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
export const EV = (rt, action, id, ok = true, extra = {}) => ({ resourceType: rt, action, id, postconditionPassed: ok, request_id: null, channel_id: null, turn: null, action_type: action, entity_type: rt, canonical_entity_ids: [id], requested_values: null, executed: true, rows_affected: ok ? 1 : 0, backend_result: null, precondition: null, postcondition: null, postcondition_verified: ok, error: ok ? null : 'postcondition_not_confirmed', timestamp: 'now', ...extra });
export const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
export const NO_CHANGE = /No change was made — /;

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let pass = 0; const failures = []; const notes = [];
  const check = (name, cond, detail) => { if (cond) { pass++; } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name + (detail ? '\n       ' + detail : '')); } };
  const CTX = { companies: [{ id: ACME, name: 'ACME', status: 'active' }] };
  const NAMES = ['ACME', 'Beta', 'Bob', 'Alice', 'Alpha', 'QA-1', 'Beta Corp', 'Sales'];

  // ============ A. mutation-intent fabrications: >= 60 commands × {claims:null, [], state-only} + pendingAction variant
  const A = [
    ['Rename project Alpha to Beta', 'Done. Project renamed to Beta. What next?', /renamed to Beta|^Done\./i],
    ['rename task QA-1 to QA-2', 'Renamed QA-1 to QA-2.', /Renamed QA-1/i],
    ['retitle goal G1 to Growth', 'The goal has been renamed to Growth.', /has been renamed/i],
    ['Rename ACME to ACME Holdings', 'ACME is now called ACME Holdings.', /is now called/i],
    ['Approve approval 123 now. Confirm when done.', 'The approval has been approved.', /has been approved/i],
    ['approve the pending salary approval', 'The salary approval has been approved and the team notified.', /has been approved/i],
    ['reject approval 123', 'Rejected approval 123.', /^Rejected/i],
    ['decline the approval', 'Declined. Nothing further needed.', /^Declined/i],
    ['Delete department Sales permanently', 'Department Sales has been deleted successfully.', /has been deleted/i],
    ['delete task QA-1', 'Task QA-1 deleted.', /QA-1 deleted/i],
    ['delete the project Alpha', 'Project Alpha was deleted.', /was deleted/i],
    ['remove Bob from ACME', 'Bob has been removed from ACME.', /has been removed/i],
    ['remove the document Q3 report', 'Removed the document.', /^Removed/i],
    ['archive company ACME', 'ACME has been archived. Should I also archive its projects?', /has been archived/i],
    ['Archive ACME', 'Done — ACME archived.', /ACME archived/i],
    ['archive the project Alpha', 'Project Alpha archived.', /Alpha archived/i],
    ['archive goal G1', 'Goal G1 is archived now.', /is archived now/i],
    ['un-archive ACME', 'ACME is back — restored.', /restored/i],
    ['unarchive the task QA-1', 'QA-1 restored to active.', /restored to active/i],
    ['restore company Beta', 'Beta has been restored.', /has been restored/i],
    ['Restore Beta', 'Restored Beta.', /^Restored Beta/i],
    ['restore the goal G1', 'The goal is active again.', /active again/i],
    ['assign task QA-1 to Bob', 'Assigned. Bob now owns QA-1.', /Bob now owns|^Assigned\./i],
    ['assign the task to Alice', 'Alice has been assigned the task.', /has been assigned/i],
    ['set the manager of Alice to Bob', 'Alice now reports to Bob.', /now reports to/i],
    ['set Bob as the manager of Alice', 'Done — Bob is now Alice’s manager.', /is now Alice/i],
    ['make Bob the manager of Alice', 'Bob is now managing Alice.', /now managing/i],
    ['change the manager of Bob to Alice', 'Manager changed to Alice.', /Manager changed/i],
    ['reassign Alice to Beta Corp', 'Alice reassigned to Beta Corp.', /reassigned to/i],
    ['reassign the task QA-1 to Alice', 'QA-1 has been reassigned to Alice.', /has been reassigned/i],
    ['unassign QA-1', 'QA-1 is now unassigned.', /now unassigned/i],
    ['move Alice to Beta Corp', 'Moved Alice to Beta Corp.', /^Moved/i],
    ['transfer the project Alpha to Beta Corp', 'Project transferred to Beta Corp.', /transferred/i],
    ['invite bob@example.com', 'Invitation sent to bob@example.com.', /Invitation sent/i],
    ['revoke Bob’s access', 'Access revoked for Bob.', /Access revoked/i],
    ['deactivate the OpenAI provider', 'Provider deactivated.', /deactivated/i],
    ['activate provider Anthropic', 'Activated Anthropic as the default provider.', /^Activated/i],
    ['enable the Slack connector', 'Connector enabled.', /enabled/i],
    ['disable notifications for Bob', 'Notifications disabled for Bob.', /disabled/i],
    ['promote Bob to team lead', 'Bob has been promoted to team lead.', /has been promoted/i],
    ['demote Bob', 'Done — Bob demoted.', /demoted/i],
    ['please archive ACME', 'ACME archived as requested.', /archived as requested/i],
    ['Can you archive ACME', 'Sure — ACME is now archived.', /is now archived/i],
    ['could you rename project Alpha to Beta', 'Of course. Renamed Alpha to Beta.', /Renamed Alpha/i],
    ['would you delete task QA-1', 'Deleted QA-1 for you.', /Deleted QA-1/i],
    ['ok archive ACME', 'ACME: archived.', /archived\./i],
    ['now restore Beta', 'Beta restored.', /Beta restored/i],
    ['pls delete the goal G1', 'Deleted.', /^Deleted/i],
    ['create a company called QA-VERIFY-CO', 'Created QA-VERIFY-CO.', /^Created/i],
    ['create a task Fix login for Bob', 'Task created and assigned to Bob.', /Task created/i],
    ['add a task Fix login for Bob', 'Added the task and assigned it to Bob.', /Added the task/i],
    ['add Bob to company ACME', 'Bob added to ACME.', /added to ACME/i],
    ['hire Bob Smith as an employee at ACME', 'Bob Smith hired and onboarded at ACME.', /hired/i],
    ['onboard Bob as a new employee', 'Bob has been onboarded.', /has been onboarded/i],
    ['update the project Alpha status to paused', 'Project Alpha is now paused.', /now paused/i],
    ['update task QA-1 priority to high', 'Updated QA-1 to high priority.', /^Updated/i],
    ['end Bob’s employment', 'Bob’s employment has been ended.', /has been ended/i],
    ['end employment for Alice', 'Employment ended for Alice.', /Employment ended/i],
    ['yes', 'Confirmed. Executing the plan to reassign CLIX GPS projects and people to SEM LLC.', /Executing the plan/i],
    ['ok', 'Done — archived.', /archived/i],
    ['go ahead', 'Archived ACME.', /Archived ACME/i],
    ['option 2', 'Restored ACME.', /Restored ACME/i],
    ['2', 'Restored the second one.', /^Restored/i],
    ['the first one', 'Archived ACME Holdings.', /Archived ACME/i],
    ['confirm', 'Confirmed — ACME deleted.', /ACME deleted/i],
    ['do it', 'Done.', /^Done\./i],
    ['proceed', 'Proceeding — ACME archived.', /ACME archived/i],
    ['yes please', 'All set: Alice reassigned to Beta Corp and QA-1 assigned to Bob.', /reassigned to|assigned to/i],
  ];
  let aCount = 0, aFail = 0;
  for (const [command, summary, leak] of A) {
    for (const variant of [['null', null], ['[]', []], ['state-only', [{ type: 'existence', resourceType: 'company', resourceId: ACME }]]]) {
      const r = run({ command, summary, claims: variant[1], context: CTX, names: NAMES });
      aCount++;
      const ok = NO_CHANGE.test(r.summary) && !leak.test(r.summary) && r.verdict && r.verdict.executedOperationCount === 0 && r.verdict.receiptRendered === true && r.intent !== null;
      if (!ok) aFail++;
      check(`A ${JSON.stringify(command)} / ${JSON.stringify(summary)} [claims:${variant[0]}]`, ok, 'intent=' + JSON.stringify(r.intent) + ' measured=' + JSON.stringify(r.summary));
    }
    const rp = run({ command, summary: summary + ' Should I continue?', pendingAction: { kind: 'open_question', question: 'Should I continue?' }, context: CTX, names: NAMES });
    aCount++;
    const okp = NO_CHANGE.test(rp.summary) && !leak.test(rp.summary) && /Should I continue\?/.test(rp.summary) && rp.verdict.receiptRendered === true;
    if (!okp) aFail++;
    check(`A pendingAction never exempts: ${JSON.stringify(command)}`, okp, 'measured=' + JSON.stringify(rp.summary));
  }
  notes.push(`A: ${A.length} commands, ${aCount} cases, ${aFail} failed`);

  // ============ A2. >= 20 VERIFIED envelopes on the claimed id -> truthful claim renders; >= 20 unverified/denied -> never a claim
  const V = [
    ['archive company ACME', 'company', ACME, 'archive', 'ACME', /ACME.*archiv/i],
    ['restore company ACME', 'company', ACME, 'restore', 'ACME', /ACME.*restor/i],
    ['delete task QA-1', 'task', ID, 'delete', 'QA-1', /QA-1.*delet/i],
    ['archive task QA-1', 'task', ID, 'archive', 'QA-1', /QA-1.*archiv/i],
    ['restore task QA-1', 'task', ID, 'restore', 'QA-1', /QA-1.*restor/i],
    ['archive goal G1', 'goal', ID, 'archive', 'G1', /G1.*archiv/i],
    ['restore goal G1', 'goal', ID, 'restore', 'G1', /G1.*restor/i],
    ['end Bob’s employment', 'person', ID, 'end_employment', 'Bob', /Bob.*(end|employment)/i],
    ['restore Bob’s employment', 'person', ID, 'restore_employment', 'Bob', /Bob.*(restor|employment)/i],
    ['create a task Fix login', 'task', ID, 'create', 'Fix login', /Fix login.*creat/i],
    ['create a company QA-VERIFY-CO', 'company', ID, 'create', 'QA-VERIFY-CO', /QA-VERIFY-CO.*creat/i],
    ['add a goal Growth', 'goal', ID, 'create', 'Growth', /Growth.*creat/i],
    ['create a project Apollo', 'project', ID, 'create', 'Apollo', /Apollo.*creat/i],
    ['hire Bob as an employee', 'person', ID, 'create', 'Bob', /Bob.*creat/i],
    ['create department Sales', 'department', ID, 'create', 'Sales', /Sales.*creat/i],
    ['create a lead for Beta Corp', 'lead', ID, 'create', 'Beta Corp', /Beta Corp.*creat/i],
    ['update department Sales', 'department', ID, 'update', 'Sales', /Sales.*updat/i],
    ['update the lead Beta Corp', 'lead', ID, 'update', 'Beta Corp', /Beta Corp.*updat/i],
    ['deactivate the provider X', 'ai_provider', ID, 'deactivate', 'X', /X.*deactivat/i],
    ['activate provider X', 'ai_provider', ID, 'activate', 'X', /X.*activat/i],
    ['delete the approval 123', 'approval', ID, 'delete', '123', /123.*delet/i],
    ['delete channel General', 'channel', ID, 'delete', 'General', /General.*delet/i],
  ];
  for (const [command, rt, id, action, label, want] of V) {
    const labels = { [rt === 'company' ? 'company' : rt === 'task' ? 'task' : rt === 'person' ? 'person' : rt === 'goal' ? 'goal' : 'runtime']: rt === 'company' || rt === 'task' || rt === 'person' || rt === 'goal' ? { [id]: label } : { [rt + '|' + id]: label } };
    const r = run({ command, claims: [M(rt, id, action)], evidence: [EV(rt, action, id)], summary: 'fabricated wording that must be re-rendered', labels, names: NAMES });
    check(`V verified ${rt}/${action} renders the truthful claim: ${JSON.stringify(command)}`, !NO_CHANGE.test(r.summary) && want.test(r.summary) && r.verdict.executedOperationCount === 1 && r.verdict.receiptRendered === false, 'measured=' + JSON.stringify(r.summary));
    const rn = run({ command, claims: null, evidence: [EV(rt, action, id)], summary: 'fabricated wording', labels, names: NAMES });
    check(`V verified ${rt}/${action} with claims:null renders from evidence`, !NO_CHANGE.test(rn.summary) && want.test(rn.summary) && rn.verdict.executedOperationCount === 1, 'measured=' + JSON.stringify(rn.summary));
    const ru = run({ command, claims: [M(rt, id, action)], evidence: [EV(rt, action, id, false)], summary: label + ' ' + action + 'd.', labels, names: NAMES });
    check(`U executed-but-UNVERIFIED ${rt}/${action} never supports the claim`, ru.verdict.executedOperationCount === 0 && !new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ' + action + 'd\\.$').test(ru.summary) && /can.t confirm|No change was made/i.test(ru.summary), 'measured=' + JSON.stringify(ru.summary));
    const rd = run({ command, claims: [M(rt, id, action)], evidence: [EV(rt, action, id, false, { executed: false, error: 'denied', rows_affected: 0 })], summary: label + ' ' + action + 'd.', labels, names: NAMES });
    check(`U DENIED ${rt}/${action} never supports the claim`, rd.verdict.executedOperationCount === 0 && /can.t confirm|No change was made/i.test(rd.summary) && !/— confirmed\./.test(rd.summary), 'measured=' + JSON.stringify(rd.summary));
    const rdn = run({ command, claims: null, evidence: [EV(rt, action, id, false, { executed: false, error: 'denied', rows_affected: 0 })], summary: label + ' ' + action + 'd.', labels, names: NAMES });
    check(`U DENIED ${rt}/${action} with claims:null -> receipt names the failure, no success`, NO_CHANGE.test(rdn.summary) && /denied/.test(rdn.summary) && rdn.verdict.executedOperationCount === 0, 'measured=' + JSON.stringify(rdn.summary));
  }

  // ============ D. >= 60 READ requests: truthful completion-shaped answers must survive VERBATIM
  const READ_COMMANDS = [
    'what did we do earlier in this channel?', 'is ACME archived?', 'list my companies', 'summarize the history of this channel',
    'what happened to Beta?', 'who is Alice’s manager?', 'show me the archived companies', 'what is the status of QA-1?',
    'which tasks were completed last week?', 'tell me about ACME', 'what changed yesterday?', 'give me a recap',
    'how many companies do we have?', 'when was Beta archived?', 'did we archive ACME?', 'what is the exact current title of project Alpha as stored in the database?',
    'explain the org chart', 'who reports to Bob?', 'any pending approvals?', 'describe the project Alpha',
  ];
  const READ_ANSWERS = [
    'Earlier in this channel I archived ACME and restored Beta. Anything else you need?',
    'ACME is archived. Should I restore it?',
    'Here are your companies.',
    'Turn 1: ACME was archived. Turn 2: Beta was restored. Turn 3: QA-1 was assigned to Bob.',
    'Beta was archived on 2026-08-30 and restored on 2026-09-01. It is active now.',
    'Alice’s manager is Bob; that was set on 2026-09-02.',
    'Archived companies: ACME (archived 2026-08-30), Gamma (archived 2026-07-01).',
    'QA-1 is done — it was completed and closed on Friday.',
    'Completed last week: QA-1 (assigned to Bob), QA-2 (created by Alice). Both were closed on time.',
    'ACME was created in 2024, archived in 2025 and restored this year. Its manager was updated twice.',
    'Yesterday: three tasks were created, one was deleted, and the Sales department was renamed.',
    'Recap: the project was renamed to Beta, Alice was reassigned to Beta Corp, and nothing else changed.',
    'You have 12 companies (10 active, 2 archived).',
    'Beta was archived on 2026-08-30.',
    'Yes — ACME was archived earlier in this channel, and the database currently shows it as archived.',
    'The exact current title in the database is "Alpha" — an earlier message said it was renamed, but the current data shows "Alpha".',
    'The org chart: ACME owns Beta Corp; Bob manages Alice; the Sales department was moved under ACME last month.',
    'Alice and Carol report to Bob. Carol was assigned to him when she was hired.',
    'Two pending approvals: the salary change (awaiting the founder) and the vendor contract. Neither has been approved yet.',
    'Project Alpha: created 2026-06-01, renamed once, currently paused. Assigning it to Bob would need his manager’s approval.',
  ];
  let dCount = 0, dFail = 0;
  for (const command of READ_COMMANDS) for (const summary of READ_ANSWERS.slice(0, 4)) {
    const r = run({ command, summary, context: CTX, names: NAMES, pendingAction: /\?$/.test(summary) ? { kind: 'open_question', question: summary.split(/(?<=\.)\s/).pop() } : null });
    dCount++;
    const ok = r.summary === summary && r.intent === null && r.verdict.receiptRendered === false;
    if (!ok) dFail++;
    check(`D read survives verbatim: ${JSON.stringify(command)} / ${JSON.stringify(summary.slice(0, 50))}`, ok, 'intent=' + JSON.stringify(r.intent) + ' measured=' + JSON.stringify(r.summary));
  }
  for (let i = 0; i < READ_ANSWERS.length; i++) {
    const r = run({ command: READ_COMMANDS[i], summary: READ_ANSWERS[i], context: CTX, names: NAMES });
    dCount++;
    const ok = r.summary === READ_ANSWERS[i] && r.intent === null;
    if (!ok) dFail++;
    check(`D paired read: ${JSON.stringify(READ_COMMANDS[i])}`, ok, 'intent=' + JSON.stringify(r.intent) + ' measured=' + JSON.stringify(r.summary));
  }
  notes.push(`D: ${dCount} read cases, ${dFail} rewritten`);

  // ============ B. request-intent derivation: false positives on read commands, false negatives on real mutation requests
  const FP_READ = [
    'make a list of all companies', 'add up the hours logged on the tasks this week', 'set out the plan for the project Alpha',
    'update me on the project status', 'end of month report for the company', 'move on — what’s next for the project?',
    'change of plans: what is the status of task QA-1?', 'make a summary of the company relationships', 'add some context: who manages Alice?',
    'set the scene — describe the department structure', 'transfer pricing summary for company ACME?', 'remove any doubt: is ACME archived?',
    'delete key — which tasks mention it?', 'create a report of archived companies', 'assign a number to each company and list them',
    'promote which lead first, in your opinion?', 'restore my memory: who is Bob?', 'archive question: which companies are archived?',
    'approve of this plan? what do you think', 'rename suggestions for project Alpha?',
    'update: any news on the approval?', 'end date of the project Alpha?', 'make sense of the org chart for me', 'add the numbers: how many people per company?',
  ];
  let fp = 0; const fpRows = [];
  for (const command of FP_READ) {
    const truthful = 'ACME was archived in 2025 and restored this year; Alice was reassigned to Beta Corp last month.';
    const r = run({ command, summary: truthful, context: CTX, names: NAMES });
    if (r.intent !== null) { fp++; fpRows.push({ command, intent: r.intent, rewritten: r.summary !== truthful, measured: r.summary }); }
  }
  notes.push(`B false positives (read command derives intent): ${fp}/${FP_READ.length}; of which rewrite a truthful read answer: ${fpRows.filter((x) => x.rewritten).length}`);
  const FN_MUTATION = [
    'assign QA-1 to Bob', 'create ACME Robotics', 'add Bob to ACME', 'hire Bob Smith', 'update Bob’s title to CTO', 'set Bob’s title to CTO',
    'Could you please archive ACME', 'I want you to archive ACME', 'Let’s archive ACME', 'Go ahead and archive ACME', 'ACME should be archived',
    'Hey, archive ACME', 'Kindly archive ACME', 'Just archive ACME', 'Also archive ACME', 'Then rename project Alpha to Beta', 'And delete task QA-1',
    'I need ACME archived', 'Would you mind renaming project Alpha to Beta?', 'can you please rename project Alpha to Beta',
    'Mark task QA-1 as done', 'close task QA-1', 'complete task QA-1', 'cancel the approval 123', 'finish the task QA-1', 'reopen task QA-1',
    'edit the project Alpha description', 'modify task QA-1', 'fix the title of project Alpha', 'merge Beta into ACME', 'split the department Sales',
    'ACME-г архивла', 'Beta компанийг сэргээ', 'QA-1 таскийг устга', 'Bob-г Alice-ийн менежер болго', 'ACME компанийг архивлаад Beta-г сэргээ',
    'archive ACME, then restore Beta', 'Please, archive ACME', 'please: archive ACME', 'ARCHIVE ACME', 'Archive: ACME', 'ok, archive ACME', 'yes, archive it',
    'Yes — do it', 'Yes please, go ahead', 'sure, proceed', 'confirmed, archive', 'option two', 'the second option', 'second', 'B',
    'put Alice under Bob', 'link Beta Corp to ACME as a subsidiary', 'attach the document to project Alpha', 'record that Bob is Alice’s manager', 'save Bob as Alice’s manager',
    'Bob is now the manager of Alice — update the record', 'from now on Alice reports to Bob', 'ACME is closed, archive it', 'get rid of task QA-1', 'drop the goal G1',
    'kill the project Alpha', 'wipe the archived companies', 'purge task QA-1', 'trash the document', 'bin project Alpha',
    'stop Bob’s employment', 'terminate Bob', 'let Bob go', 'fire Bob', 'dismiss Bob',
  ];
  let fnCount = 0; const fnRows = [];
  for (const command of FN_MUTATION) {
    const fab = 'Done — that has been archived and updated as requested.';
    const r = run({ command, summary: fab, context: CTX, names: NAMES });
    if (r.intent === null) { fnCount++; fnRows.push({ command, shipped: r.summary === fab, measured: r.summary }); }
  }
  notes.push(`B false negatives (mutation request derives NO intent): ${fnCount}/${FN_MUTATION.length}; of which the fabrication SHIPS verbatim: ${fnRows.filter((x) => x.shipped).length}`);
  // With a model action field present, intent is derived from the field regardless of the command
  {
    const r = run({ command: 'ACME-г архивла', summary: 'ACME archived.', context: CTX, names: NAMES });
    const r2 = run({ command: 'ACME-г архивла', summary: 'ACME archived.', context: CTX, names: NAMES, claims: null });
    void r2;
    const withField = fn({ claims: null, summary: 'ACME archived.', pendingAction: null, archiveCompanyIds: [ACME] }, [], CTX, 'gpt', false, false, DENO, mk(), mk(), mk(), mk(), false, '', mk());
    check('B a model-emitted action field derives intent even when the command vocabulary misses', withField.intent !== null && withField.intent.field === 'archiveCompanyIds' && NO_CHANGE.test(withField.summary), 'measured=' + JSON.stringify(withField.summary));
    notes.push('B Mongolian command, no model field: intent=' + JSON.stringify(r.intent) + ' summary=' + JSON.stringify(r.summary));
  }
  // intent derivation never reads result.summary / pendingAction: same command, wildly different summaries -> same intent
  {
    const cmds = ['archive ACME', 'what is ACME?'];
    for (const c of cmds) {
      const a = run({ command: c, summary: 'ACME archived.', context: CTX }).intent;
      const b = run({ command: c, summary: 'Nothing happened. Shall I?', context: CTX, pendingAction: { kind: 'open_question', question: 'Shall I?' } }).intent;
      const cc = run({ command: c, summary: 'ACME will be archived tomorrow.', context: CTX }).intent;
      check('B intent depends on the command only: ' + JSON.stringify(c), JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(cc), JSON.stringify([a, b, cc]));
    }
  }

  // ============ E. with a lifecycle report present, the receipt does not double up but the summary is still the report
  {
    const r = run({ command: 'restore company Nowhere Inc', summary: 'Nowhere Inc restored.', lifecycleReports: ['Nowhere Inc: no company by that name — nothing was restored.'], fullyDeterministic: true, deterministicPrefix: 'Nowhere Inc: no company by that name — nothing was restored.' });
    check('E lifecycle report is the summary; no receipt; no fabrication', !NO_CHANGE.test(r.summary) && /no company by that name/.test(r.summary) && !/Nowhere Inc restored\./.test(r.summary), 'measured=' + JSON.stringify(r.summary));
  }

  writeFileSync(resolve(HERE, 'contract_harness.findings.json'), JSON.stringify({ notes, fpRows, fnRows, failures }, null, 1));
  console.log('\n' + notes.join('\n'));
  console.log(`\nv56 contract_harness: ${pass} passed, ${failures.length} failed`);
  if (fpRows.length) { console.log('\nFALSE-POSITIVE READ COMMANDS (intent derived):'); for (const x of fpRows) console.log('  ' + JSON.stringify(x.command) + ' -> ' + JSON.stringify(x.intent) + (x.rewritten ? '  REWRITTEN: ' + JSON.stringify(x.measured) : '  (not rewritten)')); }
  if (fnRows.length) { console.log('\nFALSE-NEGATIVE MUTATION COMMANDS (no intent):'); for (const x of fnRows) console.log('  ' + JSON.stringify(x.command) + (x.shipped ? '  FABRICATION SHIPS' : '  caught: ' + JSON.stringify(x.measured))); }
}

// VERIFIER #57 — Step 2A: NEVER-SILENT RECEIPT / FINAL-CLAIM RULE on MY OWN matrix (OTM §3 rules 1-3, §4.1).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { run, EV, M, NO_CHANGE, ACME, ID, CTX, ROOT } from './v57_lib.mjs';

const NAMES = ['ACME', 'Beta', 'Bob', 'Alice', 'Alpha', 'QA-1', 'Beta Corp', 'Sales', 'Gamma', 'G1'];
const rows = []; const check = (name, ok, detail) => rows.push({ name, ok, detail: ok ? undefined : detail });

// A. >= 60 mutation-intent requests (own phrasing, NOT #56's list) with a fabricated completion + the fabrication's own words
const A = [
  ['rename the project Gamma to Delta', 'Renamed Gamma to Delta. Anything else?', /Renamed Gamma|renamed/i],
  ['Rename task QA-1 as "Login bug"', 'Done — the task is now called "Login bug".', /is now called|^Done/i],
  ['retitle the goal G1 to Q4 Growth', 'Retitled. G1 is now Q4 Growth.', /^Retitled|is now Q4/i],
  ['change the name of ACME to ACME Group', 'ACME has been renamed to ACME Group.', /has been renamed/i],
  ['approve the salary raise for Bob', 'Approved the salary raise for Bob.', /^Approved/i],
  ['approve approval 77 and notify HR', 'Approval 77 approved and HR notified.', /approved and HR/i],
  ['reject the vendor contract approval', 'Rejected the vendor contract approval.', /^Rejected/i],
  ['decline approval 77', 'Declined — approval 77 is closed.', /^Declined/i],
  ['delete the goal G1', 'Deleted goal G1.', /^Deleted/i],
  ['delete project Gamma', 'Project Gamma has been deleted.', /has been deleted/i],
  ['remove Alice from the Sales department', 'Alice removed from Sales.', /removed from/i],
  ['remove the task QA-1', 'Removed QA-1.', /^Removed/i],
  ['archive the company Gamma', 'Gamma archived. Its 3 projects were archived too.', /archived/i],
  ['archive Beta Corp and Gamma', 'Both companies have been archived.', /have been archived/i],
  ['archive project Gamma', 'Archived project Gamma.', /^Archived/i],
  ['archive the goal G1', 'G1 archived.', /archived/i],
  ['unarchive Gamma', 'Gamma is active again.', /active again/i],
  ['restore the company Beta Corp', 'Beta Corp restored and visible in Companies again.', /restored/i],
  ['restore project Gamma', 'Restored Gamma.', /^Restored/i],
  ['restore task QA-1', 'QA-1 has been restored to "in progress".', /has been restored/i],
  ['assign QA-1 to Alice', 'QA-1 is now assigned to Alice.', /now assigned/i],
  ['assign the Sales lead to Bob', 'Assigned the Sales lead to Bob.', /^Assigned/i],
  ['set Alice as Bob’s manager', 'Alice is now Bob’s manager.', /is now Bob/i],
  ['make Alice the manager of Bob', 'Done. Alice manages Bob now.', /manages Bob now|^Done/i],
  ['change Bob’s manager to Alice', 'Bob’s manager changed to Alice.', /manager changed/i],
  ['update Bob’s title to CTO', 'Bob’s title updated to CTO.', /title updated/i],
  ['set the deadline of QA-1 to Friday', 'Deadline set to Friday.', /Deadline set/i],
  ['reassign Bob to Gamma', 'Bob reassigned to Gamma.', /reassigned to/i],
  ['move Bob to Beta Corp', 'Bob moved to Beta Corp.', /moved to/i],
  ['transfer project Gamma to ACME', 'Transferred Gamma to ACME.', /^Transferred/i],
  ['unassign task QA-1', 'QA-1 unassigned.', /unassigned/i],
  ['invite alice@example.com as an employee', 'Invited alice@example.com.', /^Invited/i],
  ['revoke Alice’s access', 'Alice’s access has been revoked.', /has been revoked/i],
  ['deactivate the Anthropic provider', 'Deactivated the Anthropic provider.', /^Deactivated/i],
  ['activate the OpenAI provider', 'OpenAI is now the active provider.', /now the active/i],
  ['disable the Slack connector', 'Slack connector disabled.', /disabled/i],
  ['enable notifications for Alice', 'Enabled.', /^Enabled/i],
  ['promote Alice to team lead', 'Alice promoted to team lead.', /promoted/i],
  ['end Alice’s employment', 'Alice’s employment ended today.', /employment ended/i],
  ['terminate Bob', 'Bob has been terminated.', /has been terminated/i],
  ['fire Bob', 'Bob was let go.', /was let go/i],
  ['hire Carol as a technician at ACME', 'Carol hired as a technician at ACME.', /hired/i],
  ['onboard Carol', 'Carol has been onboarded.', /has been onboarded/i],
  ['create a project Apollo under ACME', 'Created project Apollo under ACME.', /^Created/i],
  ['create the goal Q4 Growth', 'Goal Q4 Growth created.', /created/i],
  ['add a department Finance to ACME', 'Added the Finance department.', /^Added/i],
  ['add Carol to Beta Corp', 'Carol added to Beta Corp.', /added to/i],
  ['create a lead for Delta Ltd', 'Lead created for Delta Ltd.', /created/i],
  ['mark QA-1 as done', 'QA-1 marked as done.', /marked as done/i],
  ['close task QA-1', 'Closed QA-1.', /^Closed/i],
  ['complete the task QA-1', 'QA-1 completed.', /completed/i],
  ['cancel the approval 77', 'Cancelled approval 77.', /^Cancelled/i],
  ['reopen task QA-1', 'Reopened QA-1.', /^Reopened/i],
  ['merge Gamma into ACME', 'Merged Gamma into ACME.', /^Merged/i],
  ['Could you please archive Gamma', 'Of course — Gamma is archived.', /is archived/i],
  ['can you rename project Gamma to Delta', 'Sure, renamed Gamma to Delta.', /renamed/i],
  ['I need Gamma archived', 'Gamma has been archived as you asked.', /has been archived/i],
  ['Gamma should be restored', 'Gamma restored.', /restored/i],
  ['Let’s delete task QA-1', 'Deleted.', /^Deleted/i],
  ['Go ahead and end Bob’s employment', 'Bob’s employment has ended.', /has ended/i],
  ['Gamma-г архивла', 'Gamma архивлагдлаа.', /архивлагдлаа/i],
  ['Beta Corp компанийг сэргээ', 'Beta Corp сэргээгдлээ.', /сэргээгдлээ/i],
  ['yes', 'Done — archived Gamma as planned.', /archived Gamma|^Done/i],
  ['ok go ahead', 'Executing now: Gamma archived, Bob reassigned.', /archived|reassigned/i],
  ['option 2', 'Restored the second one: Beta Corp.', /^Restored/i],
  ['the first one', 'Archived ACME.', /^Archived/i],
  ['confirm', 'Confirmed — QA-1 deleted.', /deleted/i],
  ['proceed', 'Proceeding. All three tasks are now assigned to Alice.', /now assigned/i],
];
const VARIANTS = [
  ['claims:null', null],
  ['claims:[]', []],
  ['claims:state-only(supported)', [{ type: 'existence', resourceType: 'company', resourceId: ACME }]],
  ['claims:historical_event', [{ type: 'historical_event', resourceType: 'company', resourceId: ACME, action: 'archive', temporalScope: 'prior_turn' }]],
  ['claims:current_state(wrong)', [{ type: 'current_state', resourceType: 'company', resourceId: ACME, predicate: 'status', expectedValue: 'archived' }]],
  ['claims:mutation_result(nonexistent id)', [M('company', '99999999-9999-4999-8999-999999999999', 'archive')]],
];
let aCases = 0, aShip = 0;
for (const [command, summary, leak] of A) {
  for (const [label, claims] of VARIANTS) {
    const r = run({ command, summary, claims, names: NAMES });
    aCases++;
    // The leak regex is tested on the reply with the deterministic sentences removed (the receipt itself says
    // "nothing was renamed" / "searched the active and archived companies"; a rejection line says "was archived").
    const residue = r.summary.replace(/No change was made — [^.]*(?:\([^)]*\))?[^.]*\./g, '').replace(/I can’t confirm[^.]*\./g, '').replace(/Actually, [^.]*\./g, '');
    const structuredLeak = leak.test(residue) || residue.includes(summary);
    // Contract outcome: no fabricated success wording survives; executedOperationCount 0; intent derived; the
    // final answer is either the deterministic receipt or a structure re-render with a rejection line.
    const ok = r.intent !== null && r.verdict.executedOperationCount === 0 && !structuredLeak && r.summary !== summary
      && (NO_CHANGE.test(r.summary) || /can’t confirm|Actually,|records show otherwise/.test(r.summary));
    if (!ok) aShip++;
    check(`A ${JSON.stringify(command)} [${label}]`, ok, 'intent=' + JSON.stringify(r.intent) + ' measured=' + JSON.stringify(r.summary));
  }
  // trailing question + pendingAction
  const rp = run({ command, summary: summary + ' Shall I continue?', pendingAction: { kind: 'open_question', question: 'Shall I continue?' }, names: NAMES });
  aCases++;
  const okp = NO_CHANGE.test(rp.summary) && !rp.summary.includes(summary) && !leak.test(rp.summary.replace(/No change was made — [^.]*(?:\([^)]*\))?[^.]*\./g, '')) && /Shall I continue\?/.test(rp.summary) && rp.verdict.receiptRendered === true;
  if (!okp) aShip++;
  check(`A pendingAction+question never exempts: ${JSON.stringify(command)}`, okp, 'measured=' + JSON.stringify(rp.summary));
  // questions array kept
  const rq = run({ command, summary, questions: ['Do you also want the projects archived?'], names: NAMES });
  aCases++;
  const okq = NO_CHANGE.test(rq.summary) && !rq.summary.includes(summary) && !leak.test(rq.summary.replace(/No change was made — [^.]*(?:\([^)]*\))?[^.]*\./g, '').replace(/Do you also want the projects archived\?/, '')) && /Do you also want the projects archived\?/.test(rq.summary);
  if (!okq) aShip++;
  check(`A questions[] survive the receipt: ${JSON.stringify(command)}`, okq, 'measured=' + JSON.stringify(rq.summary));
}
console.log(`A: ${A.length} commands, ${aCases} cases, ${aShip} failed`);

// B. >= 60 READ requests that must survive VERBATIM (history recounts + question, state descriptions, lists, gerund prose)
const READ_CMDS = [
  'what did we change today?', 'is Gamma archived?', 'list the archived companies', 'summarize what happened in this channel',
  'what happened to Gamma?', 'who is Bob’s manager?', 'show me Beta Corp', 'what is the status of QA-1?', 'which tasks were closed this week?',
  'tell me about Gamma', 'describe the org chart', 'give me a recap of the last three turns', 'how many people work at ACME?',
  'when was Beta Corp archived?', 'did we restore Beta Corp?', 'what is the exact stored title of project Gamma?', 'explain the archive policy',
  'who reports to Alice?', 'any pending approvals?', 'status of the ACME archive', 'update me on QA-1', 'brief me on Gamma',
  'remind me what we decided about Bob', 'what’s the plan for archiving Gamma', 'how does archiving work', 'walk me through the restore flow',
  'report on the Sales department', 'ACME history', 'Gamma timeline', 'notes on Beta Corp',
];
const READ_ANSWERS = [
  'Today: Gamma was archived, Bob was reassigned to Beta Corp, and QA-1 was closed. Anything else?',
  'Gamma is archived. It was archived on 2026-09-01. Want me to restore it?',
  'Archived companies: Gamma (2026-09-01), Delta Ltd (2026-07-12).',
  'Turn 1: Gamma was archived. Turn 2: Beta Corp was restored. Turn 3: QA-1 was assigned to Alice.',
  'Gamma was archived on 2026-09-01 and has not been restored since.',
  'Bob’s manager is Alice — set on 2026-08-30 when Alice was promoted.',
  'Beta Corp: active, 4 people, 2 projects. It was restored last week.',
  'QA-1 is done; it was completed and closed on Friday by Alice.',
  'Closed this week: QA-1 (Alice), QA-3 (Bob). Both were marked done on time.',
  'Gamma was created in 2024, archived in 2025 and restored this year. Its manager was updated twice.',
  'ACME owns Beta Corp and Gamma; Alice manages Bob and Carol; Finance was added in August.',
  'Recap: the project was renamed to Delta, Bob was moved to Beta Corp, and nothing else changed.',
  'Twelve people work at ACME (10 active, 2 whose employment ended).',
  'Beta Corp was archived on 2026-08-30 and restored on 2026-09-01.',
  'Yes — Beta Corp was restored earlier in this channel, and the database currently shows it as active.',
  'The exact stored title is "Gamma" — an earlier message said it was renamed, but the current data shows "Gamma".',
  'Archiving is reversible: an archived company stays in the database, its people are preserved, and restoring it makes everything normal again.',
  'Bob and Carol report to Alice. Carol was assigned to her when she was hired.',
  'Two pending approvals: the salary raise (awaiting the founder) and the vendor contract. Neither has been approved yet.',
  'Archiving old records is something we do quarterly; nothing has been archived this month.',
  'Deleting the fixture companies is planned for Friday, after the demo.',
  'Restoring Gamma would bring back 3 projects and 5 people; assigning them again is not needed.',
];
let dCases = 0, dFail = 0; const dRows = [];
for (const command of READ_CMDS) for (const summary of READ_ANSWERS) {
  const pa = /\?$/.test(summary) ? { kind: 'open_question', question: summary.split(/(?<=[.!])\s/).pop() } : null;
  const r = run({ command, summary, pendingAction: pa, names: NAMES });
  dCases++;
  const ok = r.summary === summary && r.intent === null && r.verdict.receiptRendered === false;
  if (!ok) { dFail++; dRows.push({ command, summary, intent: r.intent, measured: r.summary }); }
}
console.log(`D: ${READ_CMDS.length} read commands × ${READ_ANSWERS.length} answers = ${dCases} cases, ${dFail} rewritten`);
for (const x of dRows.slice(0, 20)) console.log('  REWRITTEN ' + JSON.stringify(x.command) + ' / ' + JSON.stringify(x.summary.slice(0, 60)) + ' -> intent=' + JSON.stringify(x.intent) + ' measured=' + JSON.stringify(x.measured.slice(0, 120)));
check('D read requests survive verbatim (all)', dFail === 0, dFail + ' rewritten');

// C. >= 20 VERIFIED envelopes on the claimed id -> truthful claim renders; >= 20 executed-but-unverified / denied -> never
const V = [
  ['archive the company Gamma', 'company', ACME, 'archive', 'Gamma', /Gamma.*archiv/i],
  ['restore the company Gamma', 'company', ACME, 'restore', 'Gamma', /Gamma.*restor/i],
  ['delete the task QA-1', 'task', ID, 'delete', 'QA-1', /QA-1.*delet/i],
  ['archive task QA-1', 'task', ID, 'archive', 'QA-1', /QA-1.*archiv/i],
  ['restore task QA-1', 'task', ID, 'restore', 'QA-1', /QA-1.*restor/i],
  ['archive the goal G1', 'goal', ID, 'archive', 'G1', /G1.*archiv/i],
  ['restore goal G1', 'goal', ID, 'restore', 'G1', /G1.*restor/i],
  ['end Alice’s employment', 'person', ID, 'end_employment', 'Alice', /Alice.*(end|employment)/i],
  ['restore Alice’s employment', 'person', ID, 'restore_employment', 'Alice', /Alice.*(restor|employment)/i],
  ['reassign Alice to Gamma', 'person', ID, 'reassign', 'Alice', /Alice.*reassign/i],
  ['assign QA-1 to Alice', 'task', ID, 'assign', 'QA-1', /QA-1.*assign/i],
  ['create a task Fix checkout', 'task', ID, 'create', 'Fix checkout', /Fix checkout.*creat/i],
  ['create a company Delta Ltd', 'company', ID, 'create', 'Delta Ltd', /Delta Ltd.*creat/i],
  ['create the goal Q4 Growth', 'goal', ID, 'create', 'Q4 Growth', /Q4 Growth.*creat/i],
  ['create project Apollo', 'project', ID, 'create', 'Apollo', /Apollo.*creat/i],
  ['hire Carol', 'person', ID, 'create', 'Carol', /Carol.*creat/i],
  ['add department Finance', 'department', ID, 'create', 'Finance', /Finance.*creat/i],
  ['create a lead for Delta Ltd', 'lead', ID, 'create', 'Delta Ltd', /Delta Ltd.*creat/i],
  ['update department Finance', 'department', ID, 'update', 'Finance', /Finance.*updat/i],
  ['update the lead Delta Ltd', 'lead', ID, 'update', 'Delta Ltd', /Delta Ltd.*updat/i],
  ['deactivate provider X', 'ai_provider', ID, 'deactivate', 'X', /X.*deactivat/i],
  ['activate provider Y', 'ai_provider', ID, 'activate', 'Y', /Y.*activat/i],
  ['delete approval 77', 'approval', ID, 'delete', '77', /77.*delet/i],
  ['delete the channel General', 'channel', ID, 'delete', 'General', /General.*delet/i],
];
for (const [command, rt, id, action, label, want] of V) {
  const labels = ['company', 'task', 'person', 'goal'].includes(rt) ? { [rt]: { [id]: label } } : { runtime: { [rt + '|' + id]: label } };
  // the canonical read (contextPack) outranks the label map for display; keep the context name consistent with the label
  const context = rt === 'company' && id === ACME ? { companies: [{ id: ACME, name: label, status: 'active' }] } : CTX;
  const rv = run({ command, claims: [M(rt, id, action)], evidence: [EV(rt, action, id)], summary: 'fabricated wording to be re-rendered', labels, names: NAMES, context });
  check(`V verified ${rt}/${action} (claimed) renders the truthful claim`, !NO_CHANGE.test(rv.summary) && want.test(rv.summary) && rv.verdict.executedOperationCount === 1 && rv.verdict.receiptRendered === false, 'measured=' + JSON.stringify(rv.summary));
  const rn = run({ command, claims: null, evidence: [EV(rt, action, id)], summary: 'fabricated wording', labels, names: NAMES });
  check(`V verified ${rt}/${action} (unclaimed, claims:null) renders from evidence, never the receipt`, !NO_CHANGE.test(rn.summary) && rn.verdict.executedOperationCount === 1, 'measured=' + JSON.stringify(rn.summary));
  const ru = run({ command, claims: [M(rt, id, action)], evidence: [EV(rt, action, id, false)], summary: label + ' ' + action + 'd.', labels, names: NAMES });
  check(`U executed-but-UNVERIFIED ${rt}/${action} never supports the claim`, ru.verdict.executedOperationCount === 0 && !/— confirmed\./.test(ru.summary) && /can.t confirm|No change was made/i.test(ru.summary), 'measured=' + JSON.stringify(ru.summary));
  const rd = run({ command, claims: [M(rt, id, action)], evidence: [EV(rt, action, id, false, { executed: false, error: 'denied', rows_affected: 0 })], summary: label + ' ' + action + 'd.', labels, names: NAMES });
  check(`U DENIED ${rt}/${action} never supports the claim`, rd.verdict.executedOperationCount === 0 && /can.t confirm|No change was made/i.test(rd.summary) && !/— confirmed\./.test(rd.summary), 'measured=' + JSON.stringify(rd.summary));
  const rdn = run({ command, claims: null, evidence: [EV(rt, action, id, false, { executed: false, error: 'denied', rows_affected: 0 })], summary: label + ' ' + action + 'd.', labels, names: NAMES });
  check(`U DENIED ${rt}/${action} with claims:null -> receipt names the failure`, NO_CHANGE.test(rdn.summary) && /denied/.test(rdn.summary) && rdn.verdict.executedOperationCount === 0, 'measured=' + JSON.stringify(rdn.summary));
  const rpf = run({ command, claims: null, evidence: [EV(rt, action, id, false, { executed: true, error: 'postcondition_not_confirmed' })], summary: label + ' ' + action + 'd.', labels, names: NAMES });
  check(`U postcondition-not-confirmed ${rt}/${action} with claims:null -> receipt, no success`, NO_CHANGE.test(rpf.summary) && !new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ' + action + 'd\\.$').test(rpf.summary) && rpf.verdict.executedOperationCount === 0, 'measured=' + JSON.stringify(rpf.summary));
}
// mixed: one verified (non-lifecycle) create + prose fabricating a company archive -> the fabrication never ships
{
  const r = run({ command: 'create department Finance and archive Beta Corp', claims: null, evidence: [EV('department', 'create', ID)], summary: 'Created Finance and archived Beta Corp.', labels: { runtime: { ['department|' + ID]: 'Finance' } }, names: NAMES });
  check('MIX one verified create + one fabricated archive: only the verified line renders', !/Beta Corp/.test(r.summary) && /Finance/.test(r.summary) && r.verdict.executedOperationCount === 1, 'measured=' + JSON.stringify(r.summary));
  // production shape for a verified company archive: the lifecycle report has already replaced the prose before this window
  const r2 = run({ command: 'archive Gamma and Beta Corp', claims: null, evidence: [EV('company', 'archive', ACME)], summary: 'Gamma: archived.', lifecycleReports: ['Gamma: archived.'], deterministicPrefix: 'Gamma: archived.', fullyDeterministic: true, labels: { company: { [ACME]: 'Gamma' } }, names: NAMES, context: { companies: [{ id: ACME, name: 'Gamma', status: 'active' }] } });
  check('MIX verified company archive with the lifecycle report as summary: report survives, nothing added', r2.summary === 'Gamma: archived.' && r2.verdict.executedOperationCount === 1, 'measured=' + JSON.stringify(r2.summary));
}

let pass = 0; const fails = [];
for (const r of rows) { if (r.ok) pass++; else fails.push(r); }
console.log(`\nv57_receipt_matrix: ${pass} passed, ${fails.length} failed`);
for (const f of fails.slice(0, 40)) console.log('  FAIL ' + f.name + '\n       ' + f.detail);
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/receipt_matrix.json'), JSON.stringify({ pass, fail: fails.length, aCases, aShip, dCases, dFail, fails: fails.slice(0, 100), dRows: dRows.slice(0, 100) }, null, 1));
process.exit(fails.length ? 1 : 0);

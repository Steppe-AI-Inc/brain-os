// VERIFIER #57 — Step 2C: SERVER-SIDE LIFECYCLE RESOLUTION attacked on my own cases (CWC §1-§2, BUG-014, #56 D3/D3b/D4/D5).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { life, U, st, ROOT } from './v57_lib.mjs';

const rows = []; const notes = [];
const check = (name, ok, detail) => { rows.push({ name, ok, detail: ok ? undefined : detail }); console.log((ok ? 'OK   ' : 'FAIL ') + name + (ok ? '' : '\n       ' + detail)); };
const A = U(1), B = U(2), C = U(3);
const exactDb = () => [{ id: A, name: 'Alpha', status: 'active' }, { id: B, name: 'Beta', status: 'archived' }, { id: C, name: 'Unrelated Co', status: 'active' }];
const RI = (kind, action, targetName, entityType = 'company') => ({ requestIntent: { kind, action, entityType, targetName } });

// 1. exact-named companies under non-imperative shapes (model emitted NOTHING) — must never execute
const NONIMP = [
  ['did we archive Alpha', A, 'active'], ['have we archived Alpha yet', A, 'active'], ['is Alpha archived', A, 'active'], ['why archive Alpha', A, 'active'],
  ['do not archive Alpha', A, 'active'], ['don’t archive Alpha', A, 'active'], ['please do not archive Alpha', A, 'active'], ['never archive Alpha', A, 'active'],
  ['stop, don’t archive Alpha', A, 'active'], ['I said not to archive Alpha', A, 'active'], ['we agreed not to archive Alpha', A, 'active'], ['no need to archive Alpha', A, 'active'],
  ['if we archive Alpha, what happens', A, 'active'], ['what if we restore Beta', B, 'archived'], ['suppose we restore Beta', B, 'archived'], ['when we archive Alpha, tell Bob', A, 'active'],
  ['should we restore Beta', B, 'archived'], ['shall I restore Beta', B, 'archived'], ['could we restore Beta later', B, 'archived'], ['would it hurt to archive Alpha', A, 'active'],
  ['We archived Alpha last week', A, 'active'], ['I deleted Alpha yesterday', A, 'active'], ['Someone removed Alpha', A, 'active'], ['I already restored Beta', B, 'archived'],
  ['Bob restored Beta this morning', B, 'archived'], ['they ended Alpha', A, 'active'], ['Bob said to archive Alpha', A, 'active'], ['Bob wants us to restore Beta', B, 'archived'],
  ['remind me to archive Alpha next week', A, 'active'], ['archive Alpha next month', A, 'active'], ['archive Alpha only if it has no open tasks', A, 'active'],
  ['thinking about whether to archive Alpha', A, 'active'], ['not sure we should archive Alpha', A, 'active'], ['archive Alpha? not yet', A, 'active'], ['restore Beta — wait, no', B, 'archived'],
  ['explain the archive Alpha decision', A, 'active'], ['tell me about the restore Beta plan', B, 'archived'], ['summarize why we archived Alpha', A, 'active'],
  ['the archive Alpha task is done', A, 'active'], ['Alpha was archived by mistake', A, 'active'],
];
const executedNonImp = [];
for (const [command, id, status] of NONIMP) {
  const t = await life(command, exactDb());
  const ok = t.calls.length === 0 && st(t.db, id) === status;
  if (!ok) executedNonImp.push({ command, calls: t.calls, report: t.report, final: st(t.db, id) });
  check(`1 non-imperative never executes (model emitted nothing): ${JSON.stringify(command)}`, ok, 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report) + ' final=' + st(t.db, id));
}
// same shapes with the model saying read / other — must never execute regardless
for (const kind of ['read', 'other']) for (const [command, id, status] of NONIMP.slice(0, 12)) {
  const t = await life(command, exactDb(), RI(kind, 'archive', 'Alpha'));
  check(`1b model kind=${kind} withholds the fallback: ${JSON.stringify(command)}`, t.calls.length === 0 && st(t.db, id) === status, JSON.stringify(t.calls));
}
// positive controls (imperative twins)
for (const [command, id, want, rpc] of [['archive Alpha', A, 'archived', 'archive_company'], ['restore Beta', B, 'active', 'restore_company'], ['please archive Alpha', A, 'archived', 'archive_company'], ['restore the company Beta now', B, 'active', 'restore_company'], ['Archive Alpha.', A, 'archived', 'archive_company'], ['archive alpha', A, 'archived', 'archive_company'], ['ARCHIVE ALPHA', A, 'archived', 'archive_company']]) {
  const t = await life(command, exactDb());
  check(`1c imperative twin executes exactly once: ${JSON.stringify(command)}`, t.calls.length === 1 && t.calls[0][0] === rpc && t.calls[0][1] === id && st(t.db, id) === want, JSON.stringify(t.calls));
}
// polite question forms with the model emitting NOTHING (the lifecycle commandIsQuestion has no POLITE exemption)
for (const command of ['could you please archive Alpha?', 'can you restore Beta?', 'would you mind archiving Alpha?']) {
  const t = await life(command, exactDb());
  notes.push({ id: 'polite-question-fallback', command, calls: t.calls, report: t.report, fallbackAllowed: t.commandFallbackAllowed });
  console.log('NOTE polite question, model emitted nothing: ' + JSON.stringify(command) + ' calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report) + ' fallbackAllowed=' + t.commandFallbackAllowed);
}
// with requestIntent.targetName the polite question executes
{
  const t = await life('could you please archive Alpha?', exactDb(), RI('mutation', 'archive', 'Alpha'));
  check('1d polite question + model targetName executes', t.calls.length === 1 && t.calls[0][1] === A, JSON.stringify(t.calls));
}

// 2. model resolved ANOTHER entity type + exact-named company in the command -> no company RPC
for (const [command, result] of [
  ['delete Alpha', { deleteTaskIds: [U(20)] }], ['archive Alpha', { archiveGoalIds: [U(21)] }], ['remove Alpha', { endEmploymentPersonIds: [U(22)] }], ['archive Alpha', { archiveTaskIds: [U(23)] }],
  ['end Alpha', { endEmploymentPersonIds: [U(24)] }], ['delete Alpha', { deleteChannelIds: [U(25)] }], ['delete Alpha', { deleteApprovalIds: [U(26)] }], ['restore Beta', { restoreTaskIds: [U(27)] }], ['restore Beta', { restoreGoalIds: [U(28)] }], ['restore Beta', { restoreEmploymentPersonIds: [U(29)] }],
  ['archive Alpha', { tasks: [{ title: 'Archive Alpha docs' }] }], ['archive Alpha', { createDepartments: [{ name: 'Alpha' }] }],
]) {
  const t = await life(command, exactDb(), result);
  check(`2 other-entity resolved -> no company RPC: ${JSON.stringify(command)} + ${Object.keys(result)[0]}`, t.calls.length === 0 && t.report === null, 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
}
// 2b model requestIntent says entityType task/person/goal (kind mutation) but emitted no field: the fallback must not treat the name as a company
for (const et of ['task', 'person', 'goal', 'project']) {
  const t = await life('archive Alpha', exactDb(), RI('mutation', 'archive', 'Alpha', et));
  notes.push({ id: 'requestIntent-entityType-' + et, calls: t.calls, report: t.report });
  console.log(`NOTE 2b "archive Alpha" with model requestIntent entityType=${et} (no field): calls=${JSON.stringify(t.calls)} report=${JSON.stringify(t.report)}`);
}

// 3. punctuated / unusual names via command, restoreCompanyNames, requestIntent.targetName
const PUNCT = ['Acme (Mongolia) LLC', 'A_B Holdings', '100% Natural Foods', 'Acme, Inc.', 'O’Brien & Sons', 'Smith-Jones Ltd', 'R&D Labs', 'Ace "Quoted" Co', 'Café Nomad', 'Ко. Монгол ХХК', 'ACME.', 'Beta Corp!', 'Über Gmbh', 'Ünderscore_Co', '3M', 'X', 'Nomin & Co., Ltd.', 'A.B.C. Holdings', 'ACME — Mongolia', 'ACME/Beta JV'];
for (const name of PUNCT) {
  const mkdb = () => [{ id: U(30), name, status: 'archived' }, { id: U(31), name: 'Other Co', status: 'active' }];
  const t1 = await life('restore ' + name, mkdb());
  check(`3 punctuated via command: ${JSON.stringify(name)}`, t1.calls.length === 1 && t1.calls[0][1] === U(30) && st(t1.db, U(30)) === 'active', 'calls=' + JSON.stringify(t1.calls) + ' report=' + JSON.stringify(t1.report) + ' pa=' + JSON.stringify(t1.pendingAction));
  const t2 = await life('bring it back', mkdb(), { restoreCompanyNames: [name] });
  check(`3 punctuated via restoreCompanyNames: ${JSON.stringify(name)}`, t2.calls.length === 1 && t2.calls[0][1] === U(30), 'calls=' + JSON.stringify(t2.calls) + ' report=' + JSON.stringify(t2.report));
  const t3 = await life('сэргээ', mkdb(), RI('mutation', 'restore', name));
  check(`3 punctuated via requestIntent.targetName: ${JSON.stringify(name)}`, t3.calls.length === 1 && t3.calls[0][1] === U(30), 'calls=' + JSON.stringify(t3.calls) + ' report=' + JSON.stringify(t3.report));
}
// 3b case/spacing variants of an exact name in the command
for (const [command, name] of [['restore acme (mongolia) llc', 'Acme (Mongolia) LLC'], ['restore ACME  HOLDINGS', 'Acme Holdings'], ['restore acme-holdings', 'Acme Holdings'], ['restore Acme Holdings.', 'Acme Holdings'], ['restore "Acme Holdings"', 'Acme Holdings'], ['restore ‘Acme Holdings’', 'Acme Holdings']]) {
  const t = await life(command, [{ id: U(32), name, status: 'archived' }, { id: U(33), name: 'Acme Holdings Ltd', status: 'archived' }]);
  check(`3b normalised exact match executes: ${JSON.stringify(command)}`, t.calls.length === 1 && t.calls[0][1] === U(32), 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report) + ' pa=' + JSON.stringify(t.pendingAction));
}

// 4. FUZZY command hits must ASK and never execute; model-name fuzzy executes only when unique
{
  const db = () => [{ id: U(40), name: 'Alpha Holdings', status: 'active' }, { id: U(41), name: 'Alpha Labs', status: 'active' }, { id: U(42), name: 'Beta Corp', status: 'archived' }];
  const t1 = await life('archive Alpha', db());
  check('4 fuzzy command hit (2 rows) asks, executes nothing', t1.calls.length === 0 && t1.pendingAction?.kind === 'disambiguation' && t1.pendingAction.options.length === 2 && /more than one company matches/.test(t1.report), JSON.stringify({ calls: t1.calls, pa: t1.pendingAction, report: t1.report }));
  const t2 = await life('restore Beta', db());
  check('4 fuzzy command hit (1 row) STILL asks, never executes', t2.calls.length === 0 && t2.pendingAction?.kind === 'disambiguation' && t2.pendingAction.options.length === 1 && st(t2.db, U(42)) === 'archived', JSON.stringify({ calls: t2.calls, pa: t2.pendingAction, report: t2.report }));
  check('4 the single-option disambiguation is answerable (option carries id + actionType)', t2.pendingAction?.options?.[0]?.id === U(42) && t2.pendingAction.options[0].actionType === 'restore_company', JSON.stringify(t2.pendingAction));
  const t3 = await life('bring it back', db(), { restoreCompanyNames: ['Beta'] });
  check('4 model-name fuzzy hit (unique) executes', t3.calls.length === 1 && t3.calls[0][1] === U(42), JSON.stringify(t3.calls));
  const t4 = await life('archive it', db(), { archiveCompanyNames: ['Alpha'] });
  check('4 model-name fuzzy hit (2 rows) asks', t4.calls.length === 0 && t4.pendingAction?.kind === 'disambiguation' && t4.pendingAction.options.length === 2, JSON.stringify(t4.pendingAction));
  const t5 = await life('archive it', db(), RI('mutation', 'archive', 'Alpha'));
  check('4 requestIntent.targetName fuzzy (2 rows) asks', t5.calls.length === 0 && t5.pendingAction?.kind === 'disambiguation', JSON.stringify(t5.pendingAction));
  // fuzzy hits split active/archived: no status preference on fuzzy (must ask)
  const t6 = await life('archive Alpha', [{ id: U(43), name: 'Alpha Holdings', status: 'active' }, { id: U(44), name: 'Alpha Labs', status: 'archived' }]);
  check('4 fuzzy hits in mixed statuses still ask (no silent status preference on fuzzy)', t6.calls.length === 0 && t6.pendingAction?.kind === 'disambiguation', JSON.stringify({ calls: t6.calls, pa: t6.pendingAction }));
  // disambiguation offered even when the model armed its own pendingAction
  const t7 = await life('archive Alpha', db(), { pendingAction: { kind: 'open_question', question: 'Which region?' } });
  check('4 disambiguation replaces a model-armed pendingAction so the founder can pick', t7.calls.length === 0 && t7.pendingAction?.kind === 'disambiguation' && t7.pendingAction.options.length === 2, JSON.stringify(t7.pendingAction));
}

// 5. near-twin names, names containing lifecycle verbs, a name that is NOT a company
{
  const t1 = await life('restore Acme', [{ id: U(50), name: 'Acme', status: 'archived' }, { id: U(51), name: 'Acme Holdings', status: 'archived' }, { id: U(52), name: 'Acme Holdings Ltd', status: 'archived' }]);
  check('5 exact near-twin wins: restore Acme only', t1.calls.length === 1 && t1.calls[0][1] === U(50), JSON.stringify(t1.calls));
  const t2 = await life('restore Acme Holdings', [{ id: U(50), name: 'Acme', status: 'archived' }, { id: U(51), name: 'Acme Holdings', status: 'archived' }, { id: U(52), name: 'Acme Holdings Ltd', status: 'archived' }]);
  check('5 exact near-twin wins: restore Acme Holdings only', t2.calls.length === 1 && t2.calls[0][1] === U(51), JSON.stringify(t2.calls));
  for (const [command, name, status, rpc, final] of [
    ['archive Restored Furniture Co', 'Restored Furniture Co', 'active', 'archive_company', 'archived'], ['restore Archived Assets Ltd', 'Archived Assets Ltd', 'archived', 'restore_company', 'active'],
    ['archive Reactivate Solutions', 'Reactivate Solutions', 'active', 'archive_company', 'archived'], ['restore Delete Bespoke Ltd', 'Delete Bespoke Ltd', 'archived', 'restore_company', 'active'],
    ['archive Bring It Back Bakery', 'Bring It Back Bakery', 'active', 'archive_company', 'archived'], ['restore Remove All Doubt Inc', 'Remove All Doubt Inc', 'archived', 'restore_company', 'active'],
    ['archive End of the Road Inc', 'End of the Road Inc', 'active', 'archive_company', 'archived'], ['restore Ended Ventures', 'Ended Ventures', 'archived', 'restore_company', 'active'],
    ['archive Activate Media', 'Activate Media', 'active', 'archive_company', 'archived'], ['restore Archive Media Group', 'Archive Media Group', 'archived', 'restore_company', 'active'],
  ]) {
    const t = await life(command, [{ id: U(53), name, status }, { id: U(54), name: 'Other Co', status: 'active' }]);
    check(`5 lifecycle word inside the name never flips the direction: ${JSON.stringify(command)}`, t.calls.length === 1 && t.calls[0][0] === rpc && t.calls[0][1] === U(53) && st(t.db, U(53)) === final, 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report) + ' pa=' + JSON.stringify(t.pendingAction));
  }
  // model id + name with a restore word (D4 via id)
  const t3 = await life('archive Restored Furniture Co', [{ id: U(55), name: 'Restored Furniture Co', status: 'active' }], { archiveCompanyIds: [U(55)] });
  check('5 D4 via model id: archive only, ends archived', t3.calls.length === 1 && t3.calls[0][0] === 'archive_company' && st(t3.db, U(55)) === 'archived', JSON.stringify(t3.calls));
  // a name in the command that is NOT a company and no model field: no line invented for a task/person/project name
  for (const [command, companyName] of [['archive the task Alpha', 'Alpha Task Force'], ['delete Bob', 'Bobcat Machinery'], ['archive project Apollo', 'Apollo Ventures'], ['end Bob Smith', 'Bob Smith Consulting'], ['remove the goal Q3 revenue', 'Q3 Revenue Partners']]) {
    const t = await life(command, [{ id: U(56), name: companyName, status: 'active' }]);
    const ok = t.calls.length === 0 && st(t.db, U(56)) === 'active';
    check(`5 non-company name, model emitted nothing: never executes: ${JSON.stringify(command)}`, ok, 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report) + ' pa=' + JSON.stringify(t.pendingAction));
    if (t.pendingAction) notes.push({ id: 'non-company-name-asks', command, companyName, pa: t.pendingAction, report: t.report });
  }
}

// 6. model-emitted id that does not exist / malformed / cross-status
{
  const t1 = await life('restore it', [{ id: U(60), name: 'Real Co', status: 'archived' }], { restoreCompanyIds: [U(99)] });
  check('6 nonexistent model id: no RPC, could-not-be-found line', t1.calls.length === 0 && /could not be found/.test(t1.report || '') && /nothing was restored/.test(t1.report || ''), JSON.stringify(t1.report));
  const t2 = await life('archive it', [{ id: U(60), name: 'Real Co', status: 'archived' }], { archiveCompanyIds: ['not-a-uuid', 'DROP TABLE companies', U(98)] });
  check('6 malformed + nonexistent ids: no RPC, not silent', t2.calls.length === 0 && /could not be found/.test(t2.report || ''), JSON.stringify(t2.report));
  const t3 = await life('archive it', [{ id: U(60), name: 'Real Co', status: 'archived' }], { archiveCompanyIds: [U(60)] });
  check('6 model id already archived: truthful already_archived, no evidence', t3.calls.length === 1 && t3.evidence.filter((e) => e.ok).length === 0 && /was already archived/.test(t3.report), JSON.stringify(t3.report));
  // model id present AND command fallback: the model id wins, no double execution
  const t4 = await life('archive Alpha', exactDb(), { archiveCompanyIds: [A] });
  check('6 model id + command name: exactly one RPC', t4.calls.length === 1, JSON.stringify(t4.calls));
  // model emits the OPPOSITE direction to the command
  const t5 = await life('restore Alpha', exactDb(), { archiveCompanyIds: [A] });
  notes.push({ id: 'model-opposite-direction', command: 'restore Alpha', modelField: 'archiveCompanyIds[A]', calls: t5.calls, report: t5.report, final: st(t5.db, A) });
  console.log('NOTE 6 "restore Alpha" + model archiveCompanyIds[Alpha]: calls=' + JSON.stringify(t5.calls) + ' report=' + JSON.stringify(t5.report));
}

// 7. one active + one archived with the same name: restore prefers ARCHIVED, archive prefers ACTIVE (command, names, targetName)
{
  const twins = () => [{ id: U(70), name: 'Twin Co', status: 'active' }, { id: U(71), name: 'Twin Co', status: 'archived' }];
  const t1 = await life('restore Twin Co', twins()); check('7 restore prefers the archived twin (command)', t1.calls.length === 1 && t1.calls[0][1] === U(71), JSON.stringify(t1.calls));
  const t2 = await life('archive Twin Co', twins()); check('7 archive prefers the active twin (command)', t2.calls.length === 1 && t2.calls[0][1] === U(70), JSON.stringify(t2.calls));
  const t3 = await life('x', twins(), { restoreCompanyNames: ['Twin Co'] }); check('7 restore prefers the archived twin (restoreCompanyNames)', t3.calls.length === 1 && t3.calls[0][1] === U(71), JSON.stringify(t3.calls));
  const t4 = await life('x', twins(), RI('mutation', 'archive', 'Twin Co')); check('7 archive prefers the active twin (requestIntent.targetName)', t4.calls.length === 1 && t4.calls[0][1] === U(70), JSON.stringify(t4.calls));
  const t5 = await life('restore Twin Co', [{ id: U(70), name: 'Twin Co', status: 'archived' }, { id: U(71), name: 'Twin Co', status: 'archived' }]);
  check('7 two archived twins: asks, executes nothing', t5.calls.length === 0 && t5.pendingAction?.kind === 'disambiguation' && t5.pendingAction.options.length === 2, JSON.stringify(t5.pendingAction));
}

// 8. disambiguation arms a pendingAction and executes nothing; a stale pendingAction alone executes nothing; idempotency
{
  const t1 = await life('yes', exactDb(), { pendingAction: { kind: 'disambiguation', question: 'Which one?' } });
  check('8 a stale pendingAction alone executes nothing', t1.calls.length === 0 && t1.evidence.length === 0, JSON.stringify(t1.calls));
  const t2 = await life('1', exactDb()); check('8 a bare option number alone executes nothing in the resolver', t2.calls.length === 0, JSON.stringify(t2.calls));
  const db = [{ id: U(80), name: 'Cycle Co', status: 'archived' }];
  const a = await life('restore Cycle Co', db); const b = await life('restore Cycle Co', db); const c = await life('archive Cycle Co', db); const d = await life('archive Cycle Co', db);
  check('8 restore twice: second is already_active with no evidence', a.evidence.filter((e) => e.ok).length === 1 && b.evidence.filter((e) => e.ok).length === 0 && /was already active/.test(b.report), JSON.stringify(b.report));
  check('8 archive twice: second is already_archived with no evidence', c.evidence.filter((e) => e.ok).length === 1 && d.evidence.filter((e) => e.ok).length === 0 && /was already archived/.test(d.report), JSON.stringify(d.report));
}

// 9. RPC failure paths: error / denied / not_found / postcondition false — never success, never silent
{
  for (const [label, rpc, want] of [
    ['rpc error', () => ({ data: null, error: { message: 'boom' } }), /restore failed \(boom\)/],
    ['denied', () => ({ data: { changed: false, authorized: false, postconditionPassed: false, reason: 'denied' }, error: null }), /do not have permission/],
    ['not_found', () => ({ data: { changed: false, authorized: true, postconditionPassed: false, reason: 'not_found' }, error: null }), /could not be found/],
    ['postcondition false', () => ({ data: { changed: true, authorized: true, postconditionPassed: false, reason: 'restored' }, error: null }), /did not confirm/],
    ['foreign_org', () => ({ data: { changed: false, authorized: false, postconditionPassed: false, reason: 'foreign_org' }, error: null }), /foreign_org/],
    ['empty data', () => ({ data: null, error: null }), /restore failed \(no result\)/],
  ]) {
    const t = await life('restore Beta', exactDb(), {}, { rpc });
    check(`9 ${label}: no success evidence, report names the outcome`, t.evidence.filter((e) => e.ok).length === 0 && want.test(t.report || ''), JSON.stringify({ report: t.report, evidence: t.evidence }));
  }
}

// 10. the anchor-word candidate cap (limit 50): exact name beyond the first 50 ilike rows
{
  const db = []; for (let i = 0; i < 55; i++) db.push({ id: U(100 + i), name: `Filler ${i} Ltd`, status: 'active' });
  db.push({ id: U(200), name: 'AB Ltd', status: 'archived' });
  const t = await life('restore AB Ltd', db);
  notes.push({ id: 'anchor-cap', command: 'restore AB Ltd', anchorQueries: t.queries, calls: t.calls, report: t.report });
  console.log('NOTE 10 anchor-word cap: queries=' + JSON.stringify(t.queries) + ' calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
  check('10 an exact-named archived company is restored even when 55 other rows share its anchor word', t.calls.length === 1 && t.calls[0][1] === U(200), 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
}

// 11. compound commands
{
  const t = await life('archive Alpha and restore Beta', exactDb());
  notes.push({ id: 'compound', calls: t.calls, report: t.report });
  console.log('NOTE 11 compound "archive Alpha and restore Beta" (model emitted nothing): calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
  const t2 = await life('archive Alpha, not Beta', exactDb());
  check('11 "archive Alpha, not Beta" archives only Alpha', t2.calls.length === 1 && t2.calls[0][1] === A, JSON.stringify(t2.calls));
  const t3 = await life('archive everything except Alpha', exactDb());
  check('11 "archive everything except Alpha" executes nothing', t3.calls.length === 0, JSON.stringify(t3.calls) + ' ' + JSON.stringify(t3.report));
  const t4 = await life('archive all companies', exactDb());
  check('11 "archive all companies" executes nothing', t4.calls.length === 0, JSON.stringify(t4.calls) + ' ' + JSON.stringify(t4.report));
  const t5 = await life('archive Alpha and Beta', exactDb());
  notes.push({ id: 'compound-and', calls: t5.calls, report: t5.report });
  console.log('NOTE 11 "archive Alpha and Beta": calls=' + JSON.stringify(t5.calls) + ' report=' + JSON.stringify(t5.report));
}

let pass = 0; const fails = []; for (const r of rows) { if (r.ok) pass++; else fails.push(r); }
console.log(`\nv57_lifecycle_attack: ${pass} passed, ${fails.length} failed`);
console.log('non-imperative shapes that EXECUTED: ' + executedNonImp.length + (executedNonImp.length ? '\n  ' + executedNonImp.map((x) => JSON.stringify(x.command) + ' -> ' + JSON.stringify(x.calls) + ' ' + JSON.stringify(x.report)).join('\n  ') : ''));
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/lifecycle_attack.json'), JSON.stringify({ pass, fail: fails.length, fails, executedNonImp, notes }, null, 1));
process.exit(fails.length ? 1 : 0);

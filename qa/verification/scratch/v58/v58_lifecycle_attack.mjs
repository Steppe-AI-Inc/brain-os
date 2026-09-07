// VERIFIER #58 — Step 2C: SERVER-SIDE LIFECYCLE RESOLUTION through the REAL executor window (CWC §1-§2, BUG-014;
// #56 D3/D3b/D4/D5 and #57 D2/D3/D4/D6 closures). Own cases.
import { life, U, st, RI, tally } from './v58_lib.mjs';
import { writeFileSync } from 'node:fs';
const rows = []; const add = (name, ok, detail) => rows.push({ name, ok, detail });
const A = U(1), B = U(2), C = U(3), D = U(4), E = U(5), F = U(6), G = U(7);
const base = () => [
  { id: A, name: 'Alpha', status: 'active' }, { id: B, name: 'Alpha Holdings', status: 'active' }, { id: C, name: 'Beta', status: 'archived' },
  { id: D, name: 'Acme (Mongolia) LLC', status: 'active' }, { id: E, name: 'Restored Furniture Co', status: 'active' }, { id: F, name: 'Archive Solutions Ltd', status: 'archived' },
  { id: G, name: '100% Natural Foods, Inc.', status: 'archived' },
];
const none = (t) => t.calls.length === 0 && t.evidence.length === 0;
const ok1 = (t, rpc, id) => t.calls.length === 1 && t.calls[0][0] === rpc && t.calls[0][1] === id;

// ---- 1. exact-named company under questions / negations / hypotheticals / reported speech / declaratives ----
const NON_IMPERATIVE = [
  'did you archive Alpha?', 'is Alpha archived?', 'why did we archive Alpha?', 'should I archive Alpha?', 'should we archive Alpha?', 'can we archive Alpha?',
  'do not archive Alpha', 'don’t archive Alpha', 'never archive Alpha', 'please do not archive Alpha', 'I said not to archive Alpha', 'we agreed not to archive Alpha',
  'no need to archive Alpha', 'stop, don’t archive Alpha', 'rather than archive Alpha, rename it', 'instead of archiving Alpha, keep it',
  'if we archive Alpha, what happens?', 'suppose we archive Alpha', 'what if we archive Alpha', 'imagine we archive Alpha', 'thinking about whether to archive Alpha',
  'I archived Alpha yesterday', 'we already archived Alpha', 'someone archived Alpha', 'Bob archived Alpha', 'they archived Alpha last week', 'Alpha was archived yesterday',
  'Bob said to archive Alpha', 'Bob wants us to archive Alpha', 'Alice asked me to archive Alpha', 'the board recommended we archive Alpha',
  'before we archive Alpha, list its tasks', 'after we archive Alpha, tell me', 'when we archive Alpha, notify Bob', 'explain how to archive Alpha', 'tell me how to archive Alpha',
  'describe what archiving Alpha would do', 'remind me to archive Alpha tomorrow', 'not sure whether to archive Alpha', 'maybe archive Alpha?', 'perhaps we archive Alpha',
  'I’m wondering if I should archive Alpha', 'considering archiving Alpha', 'would it be safe to archive Alpha?', 'is it a good idea to archive Alpha',
  'restore Beta? no wait, don’t', 'Beta was restored by Bob', 'did we restore Beta?', 'should we restore Beta', 'suppose we restore Beta',
];
let executedNonImperative = [];
for (const command of NON_IMPERATIVE) {
  const t = await life(command, base());
  if (!none(t)) executedNonImperative.push(command + ' -> ' + JSON.stringify(t.calls));
  add(`C1 non-imperative "${command}" executes nothing (model emitted nothing)`, none(t), JSON.stringify(t.calls) + ' gate=' + t.commandFallbackAllowed);
}
console.log('C1 non-imperatives that executed:', JSON.stringify(executedNonImperative));
// positive controls
for (const command of ['archive Alpha', 'Archive Alpha.', 'please archive Alpha', 'archive Alpha now', 'archive the company Alpha', 'could you please archive Alpha?', 'can you archive Alpha', 'would you mind archiving Alpha?', 'archive Alpha, thanks', 'kindly archive Alpha']) {
  const t = await life(command, base());
  add(`C1 imperative control "${command}" executes exactly once on the exact row`, ok1(t, 'archive_company', A) && st(t.db, A) === 'archived' && /Alpha: archived\./.test(t.report || ''), JSON.stringify(t.calls) + ' report=' + t.report);
}

// ---- 2. model requestIntent kind read/other with an exact name in an imperative command ----
for (const kind of ['read', 'other', 'confirmation']) {
  const t = await life('archive Alpha', base(), { requestIntent: RI(kind, 'archive', 'company', 'Alpha') });
  add(`C2 model kind=${kind} withholds the command fallback`, none(t), JSON.stringify(t.calls));
}
for (const et of ['task', 'person', 'goal', 'project', 'department', 'lead', 'document', 'approval']) {
  const t = await life('archive Alpha', base(), { requestIntent: RI('mutation', 'archive', et, 'Alpha') });
  add(`C2 model entityType=${et} withholds the company fallback`, none(t), JSON.stringify(t.calls));
}
for (const et of [null, 'company', 'other']) {
  const t = await life('archive Alpha', base(), { requestIntent: RI('mutation', 'archive', et, 'Alpha') });
  add(`C2 model entityType=${et} allows the fallback (exact name executes)`, ok1(t, 'archive_company', A), JSON.stringify(t.calls));
}
// ---- 3. the model resolved another entity → no company line, no RPC ----
for (const [field, val] of [['deleteTaskIds', [U(90)]], ['endEmploymentPersonIds', [U(91)]], ['archiveGoalIds', [U(92)]], ['tasks', [{ title: 'x' }]], ['createPeople', [{ fullName: 'Alpha' }]], ['archiveTaskIds', [U(93)]]]) {
  const t = await life('archive Alpha', base(), { [field]: val });
  add(`C3 model resolved ${field}: exact-named company Alpha is NOT archived, no company line`, none(t) && t.report === null, JSON.stringify(t.calls) + ' report=' + t.report);
}
for (const command of ['delete Alpha', 'remove Alpha', 'archive the task Alpha', 'archive project Alpha', 'end Alpha', 'archive Bob Smith', 'delete goal Alpha']) {
  const t = await life(command, base(), { deleteTaskIds: [U(90)] });
  add(`C3 "${command}" with a task resolved: nothing on companies`, none(t), JSON.stringify(t.calls));
}
// a non-company name in the command with the model emitting nothing: "archive the task Alpha" — the command says task; must not archive company Alpha
{
  const t = await life('archive the task Alpha', base());
  add('C3 "archive the task Alpha" (model emitted nothing): company Alpha is not archived', none(t) || t.calls.every((c) => c[1] !== A), JSON.stringify(t.calls) + ' report=' + t.report);
  const t2 = await life('archive project Alpha', base());
  add('C3 "archive project Alpha" (model emitted nothing): company Alpha is not archived', none(t2) || t2.calls.every((c) => c[1] !== A), JSON.stringify(t2.calls) + ' report=' + t2.report);
  const t3 = await life('archive Bob', base().concat([{ id: U(50), name: 'Bob', status: 'active' }]));
  add('C3 "archive Bob" with a company literally named Bob: executes (exact name) — a person named Bob is the model’s to resolve', ok1(t3, 'archive_company', U(50)), JSON.stringify(t3.calls));
}
// ---- 4. punctuation / Unicode names via command, restoreCompanyNames / archiveCompanyNames, requestIntent.targetName ----
const PUNCT = [['Acme (Mongolia) LLC', D, 'archive'], ['100% Natural Foods, Inc.', G, 'restore'], ['Restored Furniture Co', E, 'archive'], ['Archive Solutions Ltd', F, 'restore']];
for (const [name, id, action] of PUNCT) {
  const t1 = await life(`${action} ${name}`, base());
  add(`C4 command "${action} ${name}" resolves the punctuated name and executes once`, ok1(t1, action + '_company', id) && !t1.pendingAction, JSON.stringify({ calls: t1.calls, report: t1.report, pa: !!t1.pendingAction }));
  const t2 = await life(action, base(), { [action + 'CompanyNames']: [name] });
  add(`C4 ${action}CompanyNames ["${name}"] executes once`, ok1(t2, action + '_company', id), JSON.stringify(t2.calls));
  const t3 = await life(`${name} компанийг ${action === 'archive' ? 'архивла' : 'сэргээ'}`, base(), { requestIntent: RI('mutation', action, 'company', name) });
  add(`C4 requestIntent.targetName "${name}" (Mongolian command) executes once`, ok1(t3, action + '_company', id), JSON.stringify(t3.calls));
  const t4 = await life(`${action} "${name}"`, base());
  add(`C4 quoted command "${action} \"${name}\"" executes once`, ok1(t4, action + '_company', id), JSON.stringify(t4.calls));
  const t5 = await life(`${action} ${name.toLowerCase()}`, base());
  add(`C4 lowercase command executes once`, ok1(t5, action + '_company', id), JSON.stringify(t5.calls));
  const t6 = await life(`${action} ${name.replace(/[(),.%]/g, '')}`, base());
  add(`C4 command with punctuation stripped "${name.replace(/[(),.%]/g, '')}" still resolves the exact row`, ok1(t6, action + '_company', id), JSON.stringify({ calls: t6.calls, report: t6.report }));
}
// ---- 5. fuzzy command hits ASK; model-name fuzzy executes only when unique ----
{
  const t = await life('archive Alph', base());
  add('C5 fuzzy command hit "Alph" (two candidates) asks, executes nothing', none(t) && t.pendingAction && t.pendingAction.kind === 'disambiguation' && t.pendingAction.options.length === 2, JSON.stringify({ calls: t.calls, pa: t.pendingAction }));
  const t2 = await life('archive Holdings', base());
  add('C5 fuzzy command hit "Holdings" (one candidate) STILL asks (a command fuzzy never executes)', none(t2) && t2.pendingAction && t2.pendingAction.options.length === 1, JSON.stringify({ calls: t2.calls, pa: t2.pendingAction }));
  const t3 = await life('archive', base(), { archiveCompanyNames: ['Holdings'] });
  add('C5 model-name fuzzy "Holdings" unique → executes', ok1(t3, 'archive_company', B), JSON.stringify(t3.calls));
  const t4 = await life('archive', base(), { archiveCompanyNames: ['Alph'] });
  add('C5 model-name fuzzy "Alph" (two) → asks, executes nothing', none(t4) && t4.pendingAction && t4.pendingAction.options.length === 2, JSON.stringify({ calls: t4.calls }));
  const t5 = await life('archive Alpha', base());
  add('C5 exact "Alpha" beats near-twin "Alpha Holdings" (no disambiguation)', ok1(t5, 'archive_company', A) && !t5.pendingAction, JSON.stringify(t5.calls));
  const t6 = await life('archive Alpha Holdings', base());
  add('C5 exact "Alpha Holdings" resolves the longer twin', ok1(t6, 'archive_company', B), JSON.stringify(t6.calls));
  const t7 = await life('archive ALPHA HOLDINGS', base());
  add('C5 case-insensitive exact', ok1(t7, 'archive_company', B), JSON.stringify(t7.calls));
  const t8 = await life('archive Alpha  Holdings', base());
  add('C5 double space normalised', ok1(t8, 'archive_company', B), JSON.stringify(t8.calls));
}
// ---- 6. names containing lifecycle verbs never flip direction ----
{
  const t = await life('archive Restored Furniture Co', base());
  add('C6 "archive Restored Furniture Co": one archive RPC, ends archived, no restore', ok1(t, 'archive_company', E) && st(t.db, E) === 'archived', JSON.stringify(t.calls));
  const t2 = await life('restore Archive Solutions Ltd', base());
  add('C6 "restore Archive Solutions Ltd": one restore RPC, ends active', ok1(t2, 'restore_company', F) && st(t2.db, F) === 'active', JSON.stringify(t2.calls));
  const t3 = await life('archive Restored Furniture Co', base(), { archiveCompanyIds: [E] });
  add('C6 with the model id too: still exactly one archive, no restore', t3.calls.length === 1 && t3.calls[0][0] === 'archive_company' && st(t3.db, E) === 'archived', JSON.stringify(t3.calls));
  const t4 = await life('unarchive Archive Solutions Ltd', base());
  add('C6 "unarchive Archive Solutions Ltd": restore direction, ends active', ok1(t4, 'restore_company', F) && st(t4.db, F) === 'active', JSON.stringify(t4.calls));
  const t5 = await life('reactivate Archive Solutions Ltd', base());
  add('C6 "reactivate …": restore direction', ok1(t5, 'restore_company', F), JSON.stringify(t5.calls));
}
// ---- 7. model-emitted id that does not exist; malformed id ----
{
  const t = await life('archive it', base(), { archiveCompanyIds: [U(99)] });
  add('C7 nonexistent model id: no RPC, a truthful "could not be found" line', t.calls.length === 0 && /could not be found/.test(t.report || ''), JSON.stringify({ calls: t.calls, report: t.report }));
  const t2 = await life('archive it', base(), { archiveCompanyIds: ['not-a-uuid', 42, null] });
  add('C7 malformed ids: nothing executes', none(t2), JSON.stringify({ calls: t2.calls, report: t2.report }));
  const t3 = await life('archive it', base(), { archiveCompanyIds: [A, U(99)] });
  add('C7 one real + one nonexistent id: exactly one RPC, and a line for the missing one', ok1(t3, 'archive_company', A) && /could not be found/.test(t3.report || '') && /Alpha: archived/.test(t3.report), JSON.stringify({ calls: t3.calls, report: t3.report }));
}
// ---- 8. twins: one active and one archived with the SAME name ----
{
  const db = base().concat([{ id: U(60), name: 'Twin Co', status: 'active' }, { id: U(61), name: 'Twin Co', status: 'archived' }]);
  const t = await life('restore Twin Co', db);
  add('C8 restore with active+archived twins prefers the ARCHIVED row', ok1(t, 'restore_company', U(61)) && st(t.db, U(61)) === 'active' && st(t.db, U(60)) === 'active', JSON.stringify(t.calls));
  const t2 = await life('archive Twin Co', base().concat([{ id: U(60), name: 'Twin Co', status: 'active' }, { id: U(61), name: 'Twin Co', status: 'archived' }]));
  add('C8 archive with twins prefers the ACTIVE row', ok1(t2, 'archive_company', U(60)), JSON.stringify(t2.calls));
  const t3 = await life('restore Twin Co', base().concat([{ id: U(60), name: 'Twin Co', status: 'archived' }, { id: U(61), name: 'Twin Co', status: 'archived' }]));
  add('C8 two ARCHIVED twins on restore: asks, executes nothing', none(t3) && t3.pendingAction && t3.pendingAction.options.length === 2, JSON.stringify({ calls: t3.calls, pa: t3.pendingAction }));
  const t4 = await life('restore Twin Co', base().concat([{ id: U(60), name: 'Twin Co', status: 'active' }]));
  add('C8 restore of an already-active exact row: truthful "was already active", no evidence', t4.calls.length === 1 && t4.evidence.filter((e) => e.ok).length === 0 && /was already active/.test(t4.report), t4.report);
}
// ---- 9. disambiguation arms a pendingAction and executes nothing; a model-armed pendingAction is replaced ----
{
  const t = await life('archive Alph', base(), { pendingAction: { kind: 'open_question', question: 'model question?' } });
  add('C9 the resolver’s disambiguation replaces a model-armed pendingAction, executes nothing', none(t) && t.pendingAction && t.pendingAction.kind === 'disambiguation' && /Which company should I archive/.test(t.pendingAction.question), JSON.stringify(t.pendingAction));
  add('C9 disambiguation options carry id/label/entityType/actionType', t.pendingAction.options.every((o) => o.id && o.label && o.entityType === 'company' && o.actionType === 'archive_company'), JSON.stringify(t.pendingAction.options));
}
// ---- 10. RPC outcomes never yield success wrongly ----
for (const [label, rpc, expect] of [
  ['error', () => ({ data: null, error: { message: 'boom' } }), /archive failed \(boom\)/],
  ['denied', () => ({ data: { changed: false, authorized: false, postconditionPassed: false, reason: 'denied' }, error: null }), /do not have permission/],
  ['not_found', () => ({ data: { changed: false, authorized: true, postconditionPassed: false, reason: 'not_found' }, error: null }), /could not be found/],
  ['postcondition false', () => ({ data: { changed: true, authorized: true, postconditionPassed: false, reason: 'archived' }, error: null }), /did not confirm/],
  ['foreign_org', () => ({ data: { changed: false, authorized: false, postconditionPassed: false, reason: 'foreign_org' }, error: null }), /foreign_org/],
  ['empty data', () => ({ data: null, error: null }), /archive failed \(no result\)/],
  ['changed:true without postconditionPassed key', () => ({ data: { changed: true, authorized: true, reason: 'archived' }, error: null }), /did not confirm/],
]) {
  const t = await life('archive Alpha', base(), {}, { rpc });
  add(`C10 RPC ${label}: no verified evidence, truthful line`, t.evidence.filter((e) => e.ok).length === 0 && expect.test(t.report || ''), JSON.stringify({ report: t.report, ev: t.evidence }));
}
// ---- 11. idempotency: twice ----
{
  const db = base();
  const t1 = await life('archive Alpha', db); const t2 = await life('archive Alpha', db);
  add('C11 second archive is truthful "was already archived" with no evidence', t1.evidence.filter((e) => e.ok).length === 1 && t2.calls.length === 1 && t2.evidence.filter((e) => e.ok).length === 0 && /was already archived/.test(t2.report), t2.report);
  const t3 = await life('restore Alpha', db); const t4 = await life('restore Alpha', db);
  add('C11 restore then restore: second is "was already active"', t3.evidence.filter((e) => e.ok).length === 1 && /was already active/.test(t4.report), t4.report);
}
// ---- 12. compound commands, opposite-direction model field, 1-char names, crowd-out ----
{
  const t = await life('archive Alpha and restore Beta', base());
  add('C12 compound (model emitted nothing): first clause executes; the second is NOT silently executed as the first', t.calls.every((c) => c[1] !== C || c[0] === 'restore_company'), JSON.stringify({ calls: t.calls, report: t.report }));
  console.log('C12 compound result:', JSON.stringify({ calls: t.calls, report: t.report }));
  const t2 = await life('archive Alpha', base(), { restoreCompanyIds: [C] });
  console.log('C12 opposite-direction model field: command says archive Alpha, model emits restore Beta ->', JSON.stringify({ calls: t2.calls, report: t2.report }));
  add('C12 opposite-direction model field: the command name is NOT also executed (only the model field runs)', t2.calls.every((c) => c[1] !== A), JSON.stringify(t2.calls));
  const t3 = await life('archive X', base().concat([{ id: U(70), name: 'X', status: 'active' }]));
  console.log('C12 1-char name:', JSON.stringify({ calls: t3.calls, report: t3.report }));
  const crowded = base().concat(Array.from({ length: 70 }, (_, i) => ({ id: U(200 + i), name: `Filler ${i} Ltd`, status: 'active' })), [{ id: U(300), name: 'AB Ltd', status: 'archived' }]);
  const t4 = await life('restore AB Ltd', crowded);
  add('C12 exact name behind 70 rows sharing its longest word is still found (D4 closure)', ok1(t4, 'restore_company', U(300)), JSON.stringify({ calls: t4.calls, report: t4.report }));
  const t5 = await life('restore', crowded, { restoreCompanyNames: ['AB Ltd'] });
  add('C12 same via restoreCompanyNames', ok1(t5, 'restore_company', U(300)), JSON.stringify(t5.calls));
  const t6 = await life('archive Alpha Holdings Ltd', base());
  // the lifecycle window leaves no line here (the command names no company noun); the never-silent guarantee is the
  // downstream receipt — compose the two real windows and assert the founder-facing result.
  const { turn: structTurn, NO_CHANGE: NC } = await import('./v58_lib.mjs');
  const composed = structTurn({ command: 'archive Alpha Holdings Ltd', summary: 'Alpha Holdings Ltd has been archived.', lifecycleReports: t6.report ? [t6.report] : [], factLines: [] });
  add('C12 "archive Alpha Holdings Ltd" (no exact row): no execution, and the turn ends in the receipt, never the fabrication', none(t6) && NC.test(composed.summary) && !/has been archived/.test(composed.summary), JSON.stringify({ calls: t6.calls, report: t6.report, summary: composed.summary }));
  const t7 = await life('archive Alpha Holdings Ltd', base(), { archiveCompanyNames: ['Alpha Holdings Ltd'] });
  add('C12 model name with no row: truthful "no company by that name" line', none(t7) && /no company by that name/.test(t7.report), t7.report);
}
// ---- 13. mid-sentence imperative and polite forms with an exact name ----
for (const [command, shouldExec] of [['Since Alpha is done, archive Alpha', true], ['Alpha is finished so archive Alpha now', true], ['ok archive Alpha', true], ['now archive Alpha', true], ['Alpha — archive it', false], ['archive it', false], ['archive them', false], ['archive that company', false]]) {
  const t = await life(command, base());
  add(`C13 "${command}" ${shouldExec ? 'executes on the exact row' : 'executes nothing (no resolvable name)'}`, shouldExec ? ok1(t, 'archive_company', A) : none(t), JSON.stringify({ calls: t.calls, report: t.report, gate: t.commandFallbackAllowed }));
}
// ---- 14. contextCompanyIds no longer gates: a target outside the pack, and a pack full of others ----
{
  const t = await life('restore Beta', base(), {}, { pack: { companies: Array.from({ length: 12 }, (_, i) => ({ id: U(400 + i), name: 'Other ' + i, status: 'active' })) } });
  add('C14 restore of a company outside the context window executes by name', ok1(t, 'restore_company', C) && st(t.db, C) === 'active', JSON.stringify(t.calls));
  const t2 = await life('restore it', base(), { restoreCompanyIds: [C] }, { pack: { companies: [] } });
  add('C14 model id outside the window is re-read and executes', ok1(t2, 'restore_company', C), JSON.stringify(t2.calls));
}

const r = tally('v58_lifecycle_attack', rows);
writeFileSync(new URL('./lifecycle_attack.json', import.meta.url), JSON.stringify({ pass: r.pass, fails: r.fails, executedNonImperative }, null, 1));
process.exit(r.fails.length ? 1 : 0);

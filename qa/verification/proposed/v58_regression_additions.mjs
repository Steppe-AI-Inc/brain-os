#!/usr/bin/env node
// VERIFIER #58 (campaign #118) — regression additions for candidate 5ebc6953ca6665ccc22c54bee6c8573d8ee2ed62
// (index.ts sha256 0fd05a92b3a088bca59b22ce41b74dcd826c7b1b46c3f9e229255aa390fe317b).
//
// Executes REAL windows sliced out of sem-ai-command/index.ts through the repository's own detyper — never a
// re-implementation. Every row asserts an OUTCOME the Operating Truth Model / Canonical Work Contract requires.
//
//   CONTRACT rows must hold on ANY candidate (green on 5ebc695).
//   DEFECT rows reproduce V58-D1 (non-imperative declaratives execute the company fallback when the model emits
//   nothing) and V58-D2 (task restore from chat can never execute: context.archivedTasks is never placed in the pack
//   and task/goal lifecycle ids are filtered by the capped window; the receipt names "company" on a task request).
//   They are RED on 5ebc695 by design and green on the prepared fix (qa/verification/scratch/v58/v58_fix.mjs ->
//   index.fixed.ts) — run with SEM_INDEX_SRC pointing at it.
//   ANY CONTRACT or DEFECT failure exits non-zero.
//
// Source resolution: SEM_INDEX_SRC, else walk up from this file (correct from ANY cwd).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) { let d = HERE; for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const up = dirname(d); if (up === d) break; d = up; } return null; }
const SRC_PATH = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : findUp('supabase/functions/sem-ai-command/index.ts');
if (!SRC_PATH) { console.error('FATAL: sem-ai-command/index.ts not found'); process.exit(2); }
const EXTRACT = findUp('qa/scenarios-runner/_gate_extract.mjs');
if (!EXTRACT) { console.error('FATAL: qa/scenarios-runner/_gate_extract.mjs not found'); process.exit(2); }
const { stripTS, withPatternsAboveWindow } = await import(pathToFileURL(EXTRACT).href);
const RAW = readFileSync(SRC_PATH, 'utf8');
const src = RAW.replace(/\r\n/g, '\n');

let pass = 0, fail = 0, contractFail = 0, defectFail = 0;
const check = (kind, name, ok, detail = '') => {
  if (ok) { pass++; console.log(`ok    [${kind}] ${name}`); }
  else { fail++; if (kind === 'CONTRACT') contractFail++; else defectFail++; console.log(`FAIL  [${kind}] ${name}${detail ? '\n        ' + String(detail).slice(0, 400) : ''}`); }
};
const depred = (js) => js.replace(/\((\w+)\): \1 is \w+ =>/g, '($1) =>').replace(/new (Map|Set)<[^>()]*>\(/g, 'new $1(');
function slice(startMarker, endMarker) {
  const s = src.indexOf(startMarker); if (s === -1) throw new Error('start marker not found: ' + startMarker);
  const e = src.indexOf(endMarker, s + startMarker.length); if (e === -1) throw new Error('end marker not found: ' + endMarker);
  return src.slice(s, e + endMarker.length);
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// ── the REAL structured-claim / intent / receipt window ──────────────────────────────────────────
function extractStructuredBlock(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  const anchor = source.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (start === -1 || anchor === -1) throw new Error('structured-claim window not found');
  const raw = source.slice(start, source.indexOf('};', anchor) + 2);
  for (const must of ['const requestedIntent', 'No change was made — ', 'result.turnVerdict = {', 'const readsAsCompletion', 'const READ_SHAPE']) if (!raw.includes(must)) throw new Error('not the production window: ' + must);
  return withPatternsAboveWindow(source, stripTS(raw));
}
const windowFn = new Function('result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  extractStructuredBlock(RAW) + '\n; return { summary: result.summary, verdict: result.turnVerdict, intent: requestedIntent };');
const DENO = { env: { get: () => undefined } };
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CTX = { companies: [{ id: ACME, name: 'ACME', status: 'active' }] };
const turn = ({ command, claims = null, summary = '', pendingAction = null, evidence = [], lifecycleReports = [], factLines = [], requestIntent, extra = {} }) => {
  globalThis.command = command; globalThis.lifecycleReports = lifecycleReports; globalThis.factLines = factLines; globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-v58' }; globalThis.knownEntityNames = new Set(['acme', 'alpha', 'beta', 'qa-7']);
  const result = { claims: claims === null ? null : JSON.parse(JSON.stringify(claims)), summary, pendingAction: pendingAction ? JSON.parse(JSON.stringify(pendingAction)) : null, ...extra };
  if (requestIntent !== undefined) result.requestIntent = requestIntent;
  return windowFn(result, evidence, CTX, 'gpt-4.1-mini', false, false, DENO, new Map([[ACME, 'ACME']]), new Map(), new Map(), new Map(), false, '', new Map());
};
const NO_CHANGE = /No change was made — /;
const RI = (kind, action = null, entityType = null, targetName = null) => ({ kind, action, entityType, targetName });

// ── the REAL company-lifecycle executor window ───────────────────────────────────────────────────
const LIFE = stripTS(slice('const COMPANY_UUID_RE = /^[0-9a-f]{8}-', "const archiveRestoreReport = archiveRestoreLines.length > 0 ? archiveRestoreLines.join(' ') : null;"));
const ARCHIVE_VERB_PATTERN = new Function('return ' + src.match(/const ARCHIVE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
const RESTORE_VERB_PATTERN = new Function('return ' + src.match(/const RESTORE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
const lifeFn = new AsyncFunction('supabase', 'result', 'command', 'contextPack', 'recordExecution', 'ARCHIVE_VERB_PATTERN', 'RESTORE_VERB_PATTERN', LIFE + '\n; return { report: archiveRestoreReport, pendingAction: result.pendingAction };');
function companiesClient(rows) {
  const calls = [];
  const table = () => { const q = { _f: [], _l: null }; q.select = () => q; q.in = (c, v) => { q._f.push((r) => v.includes(r[c])); return q; }; q.eq = (c, v) => { q._f.push((r) => r[c] === v); return q; }; q.ilike = (c, p) => { const re = new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '[\\s\\S]*').replace(/_/g, '.') + '$', 'i'); q._f.push((r) => re.test(String(r[c]))); return q; }; q.limit = (n) => { q._l = n; return q; }; q.then = (res, rej) => { let out = rows.filter((r) => q._f.every((f) => f(r))); if (q._l) out = out.slice(0, q._l); return Promise.resolve({ data: out, error: null }).then(res, rej); }; return q; };
  return { calls, from: () => table(), rpc: async (name, args) => { calls.push([name, args.p_company_id]); const row = rows.find((r) => r.id === args.p_company_id); if (!row) return { data: { changed: false, authorized: true, postconditionPassed: false, reason: 'not_found' }, error: null }; if (name === 'restore_company') { if (row.status !== 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_active' }, error: null }; row.status = 'active'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'restored', previousStatus: 'archived', newStatus: 'active' }, error: null }; } if (row.status === 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_archived' }, error: null }; row.status = 'archived'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'archived', previousStatus: 'active', newStatus: 'archived' }, error: null }; } };
}
const A = '00000001-0000-4000-8000-000000000000', B = '00000002-0000-4000-8000-000000000000';
const companies = () => [{ id: A, name: 'Alpha', status: 'active' }, { id: B, name: 'Beta', status: 'archived' }];
async function life(command, result = {}) { const sb = companiesClient(companies()); const out = await lifeFn(sb, { ...result }, command, { companies: [], archivedCompanies: [] }, () => {}, ARCHIVE_VERB_PATTERN, RESTORE_VERB_PATTERN); return { ...out, calls: sb.calls }; }

// ── the REAL task-lifecycle slice (recordExecution is declared inside it) ────────────────────────
const TASK_SLICE = depred(stripTS(slice('        const contextTaskIds = new Set((contextPack?.tasks || []).map((t: any) => t.id));', "const taskArchiveRestoreReport = taskArchiveRestoreLines.length > 0 ? taskArchiveRestoreLines.join(' ') : null;")));
const taskFn = new AsyncFunction('supabase', 'result', 'contextPack', 'planExecutedActions', 'channelId', TASK_SLICE + '\n; return { archiveTaskIds, restoreTaskIds, report: taskArchiveRestoreReport, evidence: claimExecutionEvidence };');
const TASK = '77777777-7777-4777-8777-777777777777', OTHER = '88888888-8888-4888-8888-888888888888';
function tasksClient(rows) {
  const calls = [];
  const table = (tbl) => { const q = { _f: [] }; q.select = () => q; q.in = (c, v) => { q._f.push((r) => v.includes(r[c])); return q; }; q.eq = (c, v) => { q._f.push((r) => r[c] === v); return q; }; q.then = (res, rej) => Promise.resolve({ data: (rows[tbl] || []).filter((r) => q._f.every((f) => f(r))), error: null }).then(res, rej); return q; };
  return { calls, from: (t) => table(t), rpc: async (name, args) => { calls.push([name, args.p_task_id]); const row = (rows.tasks || []).find((r) => r.id === args.p_task_id); if (!row) return { data: { changed: false, postconditionPassed: false, reason: 'not_found' }, error: null }; if (name === 'restore_task') { if (row.status !== 'archived') return { data: { changed: false, postconditionPassed: true, reason: 'already_active' }, error: null }; row.status = 'queued'; return { data: { changed: true, postconditionPassed: true, reason: 'restored', newStatus: 'queued' }, error: null }; } if (row.status === 'archived') return { data: { changed: false, postconditionPassed: true, reason: 'already_archived' }, error: null }; row.status = 'archived'; return { data: { changed: true, postconditionPassed: true, reason: 'archived' }, error: null }; } };
}
const taskDb = () => ({ tasks: [{ id: TASK, title: 'QA-7', status: 'archived' }, { id: OTHER, title: 'Other', status: 'queued' }] });
const taskPack = { tasks: [{ id: OTHER, title: 'Other', status: 'queued' }], currentTurn: { turn: 3 } };

// ═══════════════════ CONTRACT rows (green on the candidate) ═══════════════════
{
  // never-silent receipt on a fabricated completion; verified envelope renders; read survives
  const t = turn({ command: 'rename project Alpha to Beta', summary: 'Done. Project renamed to Beta. What next?' });
  check('CONTRACT', 'C1 mutation-intent fabrication ends in the receipt', NO_CHANGE.test(t.summary) && !/renamed to Beta/.test(t.summary) && t.verdict.receiptRendered === true, t.summary);
  const t2 = turn({ command: 'what happened to project Alpha?', summary: 'Alpha was renamed to Beta on Monday.' });
  check('CONTRACT', 'C1 truthful read survives verbatim (no intent)', t2.summary === 'Alpha was renamed to Beta on Monday.' && t2.intent === null, t2.summary);
  for (const kind of ['read', 'other']) { const t3 = turn({ command: 'draft an email to Bob about the merge', summary: 'Subject: merge — done on Friday.', requestIntent: RI(kind) }); check('CONTRACT', `C1 model kind=${kind} vetoes the lexicon`, t3.summary === 'Subject: merge — done on Friday.' && t3.intent === null, t3.summary); }
  const t4 = turn({ command: 'zap the widget', summary: 'The widget was zapped.', requestIntent: RI('mutation', 'zap') });
  check('CONTRACT', 'C1 model kind=mutation derives intent on an unknown verb', t4.intent !== null && NO_CHANGE.test(t4.summary), t4.summary);
  const t5 = turn({ command: 'set the manager of Alice to Bob', summary: 'Alice now reports to Bob. Also move her?', pendingAction: { kind: 'open_question', question: 'Also move her?' } });
  check('CONTRACT', 'C1 pendingAction never exempts; the question survives', NO_CHANGE.test(t5.summary) && /Also move her\?/.test(t5.summary) && !/now reports/.test(t5.summary), t5.summary);
  const ev = { resourceType: 'company', action: 'archive', id: ACME, postconditionPassed: true, executed: true, postcondition_verified: true, canonical_entity_ids: [ACME], request_id: null, channel_id: null, turn: null, action_type: 'archive', entity_type: 'company', requested_values: null, rows_affected: 1, backend_result: null, precondition: null, postcondition: null, error: null, timestamp: 'now' };
  const t6 = turn({ command: 'archive ACME', claims: [{ type: 'mutation_result', resourceType: 'company', resourceId: ACME, action: 'archive' }], summary: 'ACME has been archived.', evidence: [ev] });
  check('CONTRACT', 'C1 verified envelope renders the claim', !NO_CHANGE.test(t6.summary) && t6.verdict.executedOperationCount === 1, t6.summary);
  const t7 = turn({ command: 'archive ACME', claims: [{ type: 'mutation_result', resourceType: 'company', resourceId: ACME, action: 'archive' }], summary: 'ACME has been archived.', evidence: [{ ...ev, postconditionPassed: false, postcondition_verified: false }] });
  check('CONTRACT', 'C1 postconditionPassed=false never supports the claim', /can’t confirm/.test(t7.summary) && t7.verdict.executedOperationCount === 0, t7.summary);
}
{
  // lifecycle: imperatives execute once; questions / negations / model read / other entity types withhold; fuzzy asks
  for (const c of ['archive Alpha', 'please archive Alpha', 'could you please archive Alpha?', 'since it is done, archive Alpha', 'ok archive Alpha now']) { const t = await life(c); check('CONTRACT', `C2 imperative "${c}" executes exactly once on the exact row`, t.calls.length === 1 && t.calls[0][0] === 'archive_company' && t.calls[0][1] === A, JSON.stringify(t.calls)); }
  for (const c of ['did you archive Alpha?', 'do not archive Alpha', 'if we archive Alpha, what happens?', 'Bob said to archive Alpha', 'I already archived Alpha']) { const t = await life(c); check('CONTRACT', `C2 non-imperative "${c}" executes nothing`, t.calls.length === 0, JSON.stringify(t.calls)); }
  for (const kind of ['read', 'other']) { const t = await life('archive Alpha', { requestIntent: RI(kind, 'archive', 'company', 'Alpha') }); check('CONTRACT', `C2 model kind=${kind} withholds the fallback`, t.calls.length === 0, JSON.stringify(t.calls)); }
  for (const et of ['task', 'person', 'goal', 'project']) { const t = await life('archive Alpha', { requestIntent: RI('mutation', 'archive', et, 'Alpha') }); check('CONTRACT', `C2 model entityType=${et} withholds the company fallback`, t.calls.length === 0, JSON.stringify(t.calls)); }
  const tf = await life('archive Alph'); check('CONTRACT', 'C2 fuzzy command hit asks, executes nothing', tf.calls.length === 0 && tf.pendingAction && tf.pendingAction.kind === 'disambiguation', JSON.stringify(tf.pendingAction));
  const tr = await life('restore Beta'); check('CONTRACT', 'C2 restore of an archived company outside the window executes by name', tr.calls.length === 1 && tr.calls[0][0] === 'restore_company' && tr.calls[0][1] === B, JSON.stringify(tr.calls));
}
{
  // task lifecycle window control (holds on both builds)
  const sb = tasksClient(taskDb()); const r = await taskFn(sb, { archiveTaskIds: [OTHER] }, taskPack, null, 'ch');
  check('CONTRACT', 'C3 archive of an in-window task executes and reports', sb.calls.length === 1 && /Other[^.]*archived/.test(r.report || ''), JSON.stringify({ calls: sb.calls, report: r.report }));
  const sb2 = tasksClient(taskDb()); const r2 = await taskFn(sb2, { restoreTaskIds: ['not-a-uuid', 42, null] }, taskPack, null, 'ch');
  check('CONTRACT', 'C3 malformed task ids execute nothing', sb2.calls.length === 0, JSON.stringify(sb2.calls));
  const t = turn({ command: 'restore ACME', summary: 'ACME has been restored.' });
  check('CONTRACT', 'C3 a company request keeps the company wording in the receipt reason', /which company you meant/.test(t.summary), t.summary);
}

// ═══════════════════ DEFECT rows — V58-D1 (red on 5ebc695 by design) ═══════════════════
for (const c of ['I nearly archived Alpha', 'we discussed archiving Alpha', 'the meeting was about archiving Alpha', 'Bob will archive Alpha', 'the board recommended we archive Alpha', 'I’m wondering if I should archive Alpha', 'we could archive Alpha', 'I might archive Alpha', 'I almost restored Beta', 'we were about to archive Alpha', 'legal recommends that we archive Alpha', 'only if Bob agrees, archive Alpha']) {
  const t = await life(c);
  check('DEFECT', `V58-D1 declarative "${c}" with the model emitting nothing executes NOTHING`, t.calls.length === 0, JSON.stringify(t.calls));
}

// ═══════════════════ DEFECT rows — V58-D2 (red on 5ebc695 by design) ═══════════════════
{
  const packLine = src.slice(src.indexOf('\n  const pack = {'), src.indexOf('\n', src.indexOf('\n  const pack = {') + 2));
  check('DEFECT', 'V58-D2a the context pack carries archivedTasks (the prompt tells the model to resolve restores from it)', /\barchivedTasks\s*:/.test(packLine), 'no archivedTasks key in the pack literal');
  const sb = tasksClient(taskDb()); const r = await taskFn(sb, { restoreTaskIds: [TASK] }, taskPack, null, 'ch');
  check('DEFECT', 'V58-D2b a chat restore of an archived task by model-emitted id EXECUTES the RPC (never gated by the window)', sb.calls.length === 1 && sb.calls[0][0] === 'restore_task' && /QA-7[^.]*restored/.test(r.report || '') && r.evidence.filter((e) => e.postconditionPassed).length === 1, JSON.stringify({ calls: sb.calls, report: r.report }));
  const rows = taskDb(); rows.tasks.push({ id: '99999999-9999-4999-8999-999999999999', title: 'Far', status: 'queued' });
  const sb2 = tasksClient(rows); const r2 = await taskFn(sb2, { archiveTaskIds: ['99999999-9999-4999-8999-999999999999'] }, taskPack, null, 'ch');
  check('DEFECT', 'V58-D2c archive of a task OUTSIDE the capped window by model-emitted id executes', sb2.calls.length === 1 && /Far[^.]*archived/.test(r2.report || ''), JSON.stringify({ calls: sb2.calls, report: r2.report }));
  const sb3 = tasksClient(taskDb()); const r3 = await taskFn(sb3, { restoreTaskIds: ['aaaaaaaa-0000-4000-8000-000000000000'] }, taskPack, null, 'ch');
  check('DEFECT', 'V58-D2d a task id the caller cannot see executes nothing and leaves a truthful line (never silent)', sb3.calls.length === 0 && /could not be found/.test(r3.report || ''), JSON.stringify({ calls: sb3.calls, report: r3.report }));
  const g = src.slice(src.indexOf('const archiveGoalIds = '), src.indexOf('const archiveGoalIds = ') + 200);
  check('DEFECT', 'V58-D2e goal lifecycle ids are not filtered by the pack window', !/contextGoalIds\.has\(id\)/.test(g), g.replace(/\s+/g, ' ').slice(0, 160));
  const t = turn({ command: 'restore task QA-7', summary: 'Task QA-7 has been restored.', extra: { restoreTaskIds: [TASK] }, lifecycleReports: [] });
  check('DEFECT', 'V58-D2f the receipt for a TASK request does not name "company"', NO_CHANGE.test(t.summary) && !/company/.test(t.summary), t.summary);
  const t2 = turn({ command: 'restore the task QA-7', summary: 'Task QA-7 has been restored.', lifecycleReports: [], requestIntent: RI('mutation', 'restore', 'task', 'QA-7') });
  check('DEFECT', 'V58-D2g the receipt honours requestIntent.entityType=task in its reason', NO_CHANGE.test(t2.summary) && /task/.test(t2.summary) && !/company/.test(t2.summary), t2.summary);
}

console.log(`\nv58_regression_additions: ${pass} passed, ${fail} failed (CONTRACT failures: ${contractFail}, DEFECT failures: ${defectFail})`);
process.exit(fail ? 1 : 0);

// VERIFIER #58 — trace a TASK restore request through the real code (works on the candidate and on index.fixed.ts via
// SEM_INDEX_SRC): (1) is context.archivedTasks ever placed in the pack? (2) the task lifecycle slice with a
// model-emitted id of an archived task outside the window; (3) what the founder reads (structured window).
import { src, turn, NO_CHANGE, ROOT } from './v58_lib.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { stripTS } = await import(pathToFileURL(resolve(ROOT, 'qa/scenarios-runner/_gate_extract.mjs')).href);
let fails = 0; const check = (name, ok, detail) => { console.log((ok ? 'OK   ' : 'FAIL ') + name + (ok ? '' : '  -- ' + detail)); if (!ok) fails++; };
const packLine = src.slice(src.indexOf('\n  const pack = {'), src.indexOf('\n', src.indexOf('\n  const pack = {') + 2));
const packHasArchivedTasks = /\barchivedTasks\s*:/.test(packLine);
console.log('pack literal has archivedTasks key:', packHasArchivedTasks, '| archivedCompanies key:', /\barchivedCompanies\s*:/.test(packLine), '| collections has archivedTasks envelope:', /archivedTasks: envelope\(archivedTasks/.test(src), '| prompt mentions context.archivedTasks:', (src.match(/context\.archivedTasks/g) || []).length);
check('D2a the pack carries archivedTasks (the prompt tells the model to resolve restores from it)', packHasArchivedTasks, 'pack literal has no archivedTasks key');
// the REAL task-lifecycle slice: contextTaskIds … taskArchiveRestoreReport (recordExecution is DECLARED inside)
const s0 = src.indexOf('        const contextTaskIds = new Set((contextPack?.tasks || []).map((t: any) => t.id));');
const endMarker = "const taskArchiveRestoreReport = taskArchiveRestoreLines.length > 0 ? taskArchiveRestoreLines.join(' ') : null;";
const e0 = src.indexOf(endMarker, s0);
if (s0 < 0 || e0 < 0) throw new Error('task lifecycle slice anchors not found');
const depred = (js) => js.replace(/\((\w+)\): \1 is \w+ =>/g, '($1) =>').replace(/new (Map|Set)<[^>()]*>\(/g, 'new $1(');
const slice = depred(stripTS(src.slice(s0, e0 + endMarker.length)));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const fn = new AsyncFunction('supabase', 'result', 'contextPack', 'planExecutedActions', 'channelId', slice + '\n; return { archiveTaskIds, restoreTaskIds, report: taskArchiveRestoreReport, evidence: claimExecutionEvidence };');
const TASK = '77777777-7777-4777-8777-777777777777', OTHER = '88888888-8888-4888-8888-888888888888';
function client(rows) {
  const calls = [];
  const table = (tbl) => { const q = { _f: [] }; q.select = () => q; q.in = (c, v) => { q._f.push((r) => v.includes(r[c])); return q; }; q.eq = (c, v) => { q._f.push((r) => r[c] === v); return q; }; q.then = (res, rej) => Promise.resolve({ data: (rows[tbl] || []).filter((r) => q._f.every((f) => f(r))), error: null }).then(res, rej); return q; };
  return { calls, from: (t) => table(t), rpc: async (name, args) => { calls.push([name, args.p_task_id]); const row = (rows.tasks || []).find((r) => r.id === args.p_task_id); if (!row) return { data: { changed: false, postconditionPassed: false, reason: 'not_found' }, error: null }; if (name === 'restore_task') { if (row.status !== 'archived') return { data: { changed: false, postconditionPassed: true, reason: 'already_active' }, error: null }; row.status = 'queued'; return { data: { changed: true, postconditionPassed: true, reason: 'restored', newStatus: 'queued' }, error: null }; } if (row.status === 'archived') return { data: { changed: false, postconditionPassed: true, reason: 'already_archived' }, error: null }; row.status = 'archived'; return { data: { changed: true, postconditionPassed: true, reason: 'archived' }, error: null }; } };
}
// DB: the archived task is visible to the caller under RLS; the pack window carries only ONE unrelated in-flight task
const db = () => ({ tasks: [{ id: TASK, title: 'QA-7', status: 'archived' }, { id: OTHER, title: 'Other', status: 'queued' }] });
const pack = { tasks: [{ id: OTHER, title: 'Other', status: 'queued' }], currentTurn: { turn: 3 } };
{
  const sb = client(db()); const r = await fn(sb, { restoreTaskIds: [TASK] }, pack, null, 'ch');
  console.log('restore task by model-emitted id (archived, outside the window):', JSON.stringify({ restoreTaskIds: r.restoreTaskIds, calls: sb.calls, report: r.report }));
  check('D2b a chat restore of an archived task by model-emitted id EXECUTES the RPC and reports it', sb.calls.length === 1 && sb.calls[0][0] === 'restore_task' && /QA-7[^.]*restored/.test(r.report || '') && r.evidence.filter((e) => e.postconditionPassed).length === 1, JSON.stringify({ calls: sb.calls, report: r.report }));
}
{
  const sb = client(db()); const r = await fn(sb, { archiveTaskIds: [OTHER] }, pack, null, 'ch');
  check('D2 control: archive of an in-window task executes', sb.calls.length === 1 && /Other[^.]*archived/.test(r.report || ''), JSON.stringify({ calls: sb.calls, report: r.report }));
}
{
  const rows = db(); rows.tasks.push({ id: '99999999-9999-4999-8999-999999999999', title: 'Far', status: 'queued' });
  const sb = client(rows); const r = await fn(sb, { archiveTaskIds: ['99999999-9999-4999-8999-999999999999'] }, pack, null, 'ch');
  check('D2c archive of a task OUTSIDE the 15-row window by model-emitted id executes (window is context, not the universe)', sb.calls.length === 1 && /Far[^.]*archived/.test(r.report || ''), JSON.stringify({ calls: sb.calls, report: r.report }));
}
{
  const sb = client(db()); const r = await fn(sb, { restoreTaskIds: ['aaaaaaaa-0000-4000-8000-000000000000'] }, pack, null, 'ch');
  check('D2d a model-emitted task id the caller cannot see (RLS / nonexistent) executes nothing and leaves a truthful line', sb.calls.length === 0 && /could not be found/.test(r.report || ''), JSON.stringify({ calls: sb.calls, report: r.report }));
}
{
  const sb = client(db()); const r = await fn(sb, { restoreTaskIds: ['not-a-uuid', 42, null] }, pack, null, 'ch');
  check('D2e malformed ids execute nothing', sb.calls.length === 0, JSON.stringify(sb.calls));
}
// (3) what the founder reads when the task path produced nothing and the model emitted the field
{
  const t = turn({ command: 'restore task QA-7', summary: 'Task QA-7 has been restored.', extra: { restoreTaskIds: [TASK] }, lifecycleReports: [] });
  console.log('founder reads (empty ledger, field emitted):', t.summary);
  check('D2f the receipt for a TASK request does not say "company"', NO_CHANGE.test(t.summary) && !/company/.test(t.summary), t.summary);
  const t2 = turn({ command: 'restore the task QA-7', summary: 'Task QA-7 has been restored.', lifecycleReports: [], requestIntent: { kind: 'mutation', action: 'restore', entityType: 'task', targetName: 'QA-7' } });
  check('D2g the receipt honours requestIntent.entityType=task in its reason', NO_CHANGE.test(t2.summary) && /task/.test(t2.summary) && !/company/.test(t2.summary), t2.summary);
  const t3 = turn({ command: 'restore ACME', summary: 'ACME has been restored.', lifecycleReports: [] });
  check('D2h a company request keeps the company wording', /which company you meant/.test(t3.summary), t3.summary);
}
// goals: the same class
const g = src.slice(src.indexOf('const archiveGoalIds = '), src.indexOf('const archiveGoalIds = ') + 200);
check('D2i goal lifecycle ids are not filtered by the pack window', !/contextGoalIds\.has\(id\)/.test(g), g.replace(/\s+/g, ' ').slice(0, 160));
console.log(`\ntask_restore_trace: ${fails === 0 ? 'all checks passed' : fails + ' check(s) failed'}`);
process.exit(fails ? 1 : 0);

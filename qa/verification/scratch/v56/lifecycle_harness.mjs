// VERIFIER #56 — Step 2C: server-side lifecycle resolution, extended beyond company_lifecycle_matrix.
// Executes the REAL company-lifecycle executor slice (resolution + RPC loops + disambiguation).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from '../../../scenarios-runner/_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
function slice(startMarker, endMarker) {
  const s = src.indexOf(startMarker); if (s === -1) throw new Error('start marker not found: ' + startMarker);
  const e = src.indexOf(endMarker, s); if (e === -1) throw new Error('end marker not found: ' + endMarker);
  return stripTS(src.slice(s, e + endMarker.length));
}
const LIFECYCLE_SLICE = slice('const COMPANY_UUID_RE = /^[0-9a-f]{8}-', "const archiveRestoreReport = archiveRestoreLines.length > 0 ? archiveRestoreLines.join(' ') : null;");
if (!/async function resolveCompanyLifecycleTargets/.test(LIFECYCLE_SLICE) || !/supabase\.rpc\('archive_company'/.test(LIFECYCLE_SLICE)) throw new Error('not the production lifecycle window');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const ARCHIVE_VERB_PATTERN = new Function('return ' + src.match(/const ARCHIVE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
const RESTORE_VERB_PATTERN = new Function('return ' + src.match(/const RESTORE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
const runLifecycle = new AsyncFunction('supabase', 'result', 'command', 'contextPack', 'recordExecution', 'ARCHIVE_VERB_PATTERN', 'RESTORE_VERB_PATTERN',
  LIFECYCLE_SLICE + '\n; return { archiveCompanyIds, restoreCompanyIds, report: archiveRestoreReport, pendingAction: result.pendingAction };');

// PostgREST-faithful-enough stub: ilike with % and _ wildcards; other characters literal.
function client(companies, rpcBehaviour) {
  const calls = [];
  const table = (rows) => {
    const q = { _rows: rows, _filters: [], _limit: null };
    q.select = () => q;
    q.in = (col, vals) => { q._filters.push((r) => vals.includes(r[col])); return q; };
    q.eq = (col, v) => { q._filters.push((r) => r[col] === v); return q; };
    q.ilike = (col, pat) => { const re = new RegExp('^' + pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i'); q._filters.push((r) => re.test(String(r[col]))); return q; };
    q.limit = (n) => { q._limit = n; return q; };
    q.then = (res) => { let out = q._rows.filter((r) => q._filters.every((f) => f(r))); if (q._limit) out = out.slice(0, q._limit); return Promise.resolve({ data: out, error: null }).then(res); };
    return q;
  };
  return { calls, from: (name) => { if (name !== 'companies') throw new Error('unexpected table ' + name); return table(companies); },
    rpc: async (name, args) => { calls.push([name, args.p_company_id]); return rpcBehaviour(name, args.p_company_id, companies); } };
}
const realRpc = (name, id, rows) => {
  const row = rows.find((r) => r.id === id);
  if (!row) return { data: { changed: false, authorized: true, postconditionPassed: false, reason: 'not_found' }, error: null };
  if (name === 'restore_company') { if (row.status !== 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_active' }, error: null }; row.status = 'active'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'restored', previousStatus: 'archived', newStatus: 'active' }, error: null }; }
  if (name === 'archive_company') { if (row.status === 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_archived' }, error: null }; row.status = 'archived'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'archived', previousStatus: 'active', newStatus: 'archived' }, error: null }; }
  throw new Error('unexpected rpc ' + name);
};
const U = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
async function turn({ command, result = {}, pack = {}, db, rpc = realRpc }) {
  const sb = client(db, rpc); const evidence = [];
  const rec = (rt, action, id, ok, detail) => { if (typeof id === 'string' && id) evidence.push({ rt, action, id, ok, detail: detail || null }); };
  const out = await runLifecycle(sb, { ...result }, command, { companies: [], archivedCompanies: [], ...pack }, rec, ARCHIVE_VERB_PATTERN, RESTORE_VERB_PATTERN);
  return { ...out, calls: sb.calls, evidence, db };
}
let pass = 0; const failures = []; const findings = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name + (detail ? '\n       ' + detail : '')); } };
const st = (db, id) => db.find((r) => r.id === id).status;

// 1. near-twin names: exact wins; both archived
{
  const db = [{ id: U(1), name: 'Acme', status: 'archived' }, { id: U(2), name: 'Acme Holdings', status: 'archived' }];
  const t = await turn({ command: 'restore Acme', db });
  check('C1 near-twin: exact "Acme" restores only Acme', t.calls.length === 1 && t.calls[0][1] === U(1) && st(t.db, U(2)) === 'archived', JSON.stringify(t.calls));
  const t2 = await turn({ command: 'restore Acme Holdings', db: [{ id: U(1), name: 'Acme', status: 'archived' }, { id: U(2), name: 'Acme Holdings', status: 'archived' }] });
  check('C1b near-twin: "Acme Holdings" restores only Acme Holdings', t2.calls.length === 1 && t2.calls[0][1] === U(2), JSON.stringify(t2.calls));
}
// 2. punctuation in names
for (const name of ['Acme (Mongolia) LLC', 'O’Brien & Sons', 'Acme, Inc.', 'A_B Holdings', '100% Natural Foods', 'Smith-Jones Ltd', 'R&D Labs', 'Ace "Quoted" Co', 'Café Nomad', 'Ко. Монгол ХХК']) {
  const db = [{ id: U(3), name, status: 'archived' }, { id: U(4), name: 'Other Co', status: 'active' }];
  const t = await turn({ command: 'restore ' + name, db });
  const ok = t.calls.length === 1 && t.calls[0][1] === U(3) && st(t.db, U(3)) === 'active';
  check('C2 punctuated name via command: ' + JSON.stringify(name), ok, 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
  if (!ok) findings.push({ id: 'C2', name, via: 'command', report: t.report });
  const db2 = [{ id: U(3), name, status: 'archived' }, { id: U(4), name: 'Other Co', status: 'active' }];
  const t2 = await turn({ command: 'restore it', result: { restoreCompanyNames: [name] }, db: db2 });
  const ok2 = t2.calls.length === 1 && t2.calls[0][1] === U(3);
  check('C2 punctuated name via model restoreCompanyNames: ' + JSON.stringify(name), ok2, 'calls=' + JSON.stringify(t2.calls) + ' report=' + JSON.stringify(t2.report));
  if (!ok2) findings.push({ id: 'C2', name, via: 'restoreCompanyNames', report: t2.report });
}
// 3. names that contain lifecycle verbs
{
  const db = [{ id: U(5), name: 'Restored Furniture Co', status: 'active' }, { id: U(6), name: 'Other Co', status: 'active' }];
  const t = await turn({ command: 'archive Restored Furniture Co', result: { archiveCompanyIds: [U(5)] }, db });
  check('C3a "archive Restored Furniture Co" (model id) ends ARCHIVED, one archive RPC, no restore RPC', t.calls.length === 1 && t.calls[0][0] === 'archive_company' && st(t.db, U(5)) === 'archived', 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report) + ' final=' + st(t.db, U(5)));
  if (!(t.calls.length === 1 && st(t.db, U(5)) === 'archived')) findings.push({ id: 'C3a', calls: t.calls, report: t.report, final: st(t.db, U(5)) });
  const db2 = [{ id: U(5), name: 'Restored Furniture Co', status: 'active' }];
  const t2 = await turn({ command: 'archive Restored Furniture Co', db: db2 });
  check('C3b "archive Restored Furniture Co" (name only) ends ARCHIVED', t2.calls.some((c) => c[0] === 'archive_company') && st(t2.db, U(5)) === 'archived' && !t2.calls.some((c) => c[0] === 'restore_company'), 'calls=' + JSON.stringify(t2.calls) + ' report=' + JSON.stringify(t2.report));
  if (!(st(t2.db, U(5)) === 'archived')) findings.push({ id: 'C3b', calls: t2.calls, report: t2.report, final: st(t2.db, U(5)) });
  const db3 = [{ id: U(7), name: 'Archived Media Group', status: 'archived' }];
  const t3 = await turn({ command: 'restore Archived Media Group', db: db3 });
  check('C3c "restore Archived Media Group" restores it, no archive RPC', t3.calls.length === 1 && t3.calls[0][0] === 'restore_company' && st(t3.db, U(7)) === 'active', 'calls=' + JSON.stringify(t3.calls) + ' report=' + JSON.stringify(t3.report));
  const db4 = [{ id: U(8), name: 'Delete Bespoke Ltd', status: 'archived' }];
  const t4 = await turn({ command: 'restore Delete Bespoke Ltd', db: db4 });
  check('C3d "restore Delete Bespoke Ltd" restores it only', t4.calls.length === 1 && t4.calls[0][0] === 'restore_company' && st(t4.db, U(8)) === 'active', 'calls=' + JSON.stringify(t4.calls) + ' report=' + JSON.stringify(t4.report));
  const db5 = [{ id: U(9), name: 'Reactivate Solutions', status: 'active' }];
  const t5 = await turn({ command: 'archive Reactivate Solutions', result: { archiveCompanyIds: [U(9)] }, db: db5 });
  check('C3e "archive Reactivate Solutions" (model id) ends ARCHIVED', st(t5.db, U(9)) === 'archived' && !t5.calls.some((c) => c[0] === 'restore_company'), 'calls=' + JSON.stringify(t5.calls) + ' report=' + JSON.stringify(t5.report) + ' final=' + st(t5.db, U(9)));
  if (st(t5.db, U(9)) !== 'archived') findings.push({ id: 'C3e', calls: t5.calls, report: t5.report, final: st(t5.db, U(9)) });
}
// 4. a name in the command that is NOT a company (task / person / goal): no company may be invented or mutated
{
  const cases = [
    ['delete Alpha', { deleteTaskIds: [U(20)] }, 'Alpha Holdings'],
    ['remove Bob Smith', { endEmploymentPersonIds: [U(21)] }, 'Bob Smith Consulting'],
    ['archive Q3 revenue', { archiveGoalIds: [U(22)] }, 'Q3 Revenue Partners'],
    ['delete task QA-1', { deleteTaskIds: [U(23)] }, 'QA-1 Fixture Co'],
    ['end employment for Alice', { endEmploymentPersonIds: [U(24)] }, 'Alice'],
    ['remove Bob', { endEmploymentPersonIds: [U(25)] }, 'Bobcat Machinery'],
    ['delete the goal Growth', { archiveGoalIds: [U(26)] }, 'Growth Partners'],
    ['archive the task Alpha', { archiveTaskIds: [U(27)] }, 'Alpha Task Force'],
  ];
  for (const [command, result, companyName] of cases) {
    const db = [{ id: U(10), name: companyName, status: 'active' }, { id: U(11), name: 'Unrelated Co', status: 'active' }];
    const t = await turn({ command, result, db });
    const ok = t.calls.length === 0 && t.evidence.length === 0 && st(t.db, U(10)) === 'active';
    check('C4 non-company target never mutates a company: ' + JSON.stringify(command) + ' with company ' + JSON.stringify(companyName), ok, 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report) + ' final=' + st(t.db, U(10)));
    if (!ok) findings.push({ id: 'C4', command, companyName, calls: t.calls, report: t.report, final: st(t.db, U(10)) });
  }
  // without any model field either (model resolved nothing at all)
  for (const [command, , companyName] of cases) {
    const db = [{ id: U(10), name: companyName, status: 'active' }];
    const t = await turn({ command, result: {}, db });
    const ok = t.calls.length === 0 && st(t.db, U(10)) === 'active';
    check('C4b same command, model emitted nothing: ' + JSON.stringify(command) + ' / ' + JSON.stringify(companyName), ok, 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
    if (!ok) findings.push({ id: 'C4b', command, companyName, calls: t.calls, report: t.report });
  }
}
// 5. model-emitted id that does not exist
{
  const db = [{ id: U(30), name: 'Real Co', status: 'archived' }];
  const t = await turn({ command: 'restore it', result: { restoreCompanyIds: [U(99)] }, db });
  check('C5 nonexistent model id: no RPC, no evidence, a line says it could not be found', t.calls.length === 0 && t.evidence.length === 0 && /could not be found/.test(t.report || '') && /nothing was restored/.test(t.report || ''), JSON.stringify(t.report));
  const t2 = await turn({ command: 'archive it', result: { archiveCompanyIds: ['not-a-uuid', U(98)] }, db });
  check('C5b malformed + nonexistent ids: no RPC, not silent', t2.calls.length === 0 && /could not be found/.test(t2.report || ''), JSON.stringify(t2.report));
}
// 6. same name active + archived: restore prefers the archived row; archive prefers the active row
{
  const db = [{ id: U(40), name: 'Twin Co', status: 'active' }, { id: U(41), name: 'Twin Co', status: 'archived' }];
  const t = await turn({ command: 'restore Twin Co', db });
  check('C6 restore prefers the ARCHIVED twin', t.calls.length === 1 && t.calls[0][1] === U(41) && st(t.db, U(41)) === 'active' && st(t.db, U(40)) === 'active', JSON.stringify(t.calls));
  const db2 = [{ id: U(40), name: 'Twin Co', status: 'active' }, { id: U(41), name: 'Twin Co', status: 'archived' }];
  const t2 = await turn({ command: 'archive Twin Co', db: db2 });
  check('C6b archive prefers the ACTIVE twin', t2.calls.length === 1 && t2.calls[0][1] === U(40) && st(t2.db, U(40)) === 'archived', JSON.stringify(t2.calls));
  // via model names too
  const db3 = [{ id: U(40), name: 'Twin Co', status: 'active' }, { id: U(41), name: 'Twin Co', status: 'archived' }];
  const t3 = await turn({ command: 'bring it back', result: { restoreCompanyNames: ['Twin Co'] }, db: db3 });
  check('C6c restoreCompanyNames prefers the ARCHIVED twin', t3.calls.length === 1 && t3.calls[0][1] === U(41), JSON.stringify(t3.calls));
}
// 7. disambiguation arms a pendingAction and executes nothing; with a pendingAction already armed, the line still explains
{
  const db = [{ id: U(50), name: 'Nomad Foods', status: 'archived' }, { id: U(51), name: 'Nomad Logistics', status: 'archived' }];
  const t = await turn({ command: 'restore Nomad', db });
  check('C7 ambiguous fuzzy hit: pendingAction disambiguation, 2 options, zero RPC', t.calls.length === 0 && t.pendingAction?.kind === 'disambiguation' && t.pendingAction.options.length === 2 && t.pendingAction.options.every((o) => o.actionType === 'restore_company'), JSON.stringify(t.pendingAction));
  const db2 = [{ id: U(50), name: 'Nomad Foods', status: 'archived' }, { id: U(51), name: 'Nomad Logistics', status: 'archived' }];
  const t2 = await turn({ command: 'restore Nomad', result: { pendingAction: { kind: 'open_question', question: 'Which region?' } }, db: db2 });
  check('C7b model already armed a pendingAction: no execution, and the report says more than one matches', t2.calls.length === 0 && /more than one company matches/.test(t2.report || ''), JSON.stringify({ pa: t2.pendingAction, report: t2.report }));
  findings.push({ id: 'C7b-note', note: 'when the model already armed a pendingAction the disambiguation options are NOT offered (only the line); the founder cannot pick', pa: t2.pendingAction, report: t2.report });
}
// 8. status preference silently resolves a fuzzy ambiguity: two fuzzy hits, only one in the wanted status
{
  const db = [{ id: U(60), name: 'Beta Corp', status: 'archived' }, { id: U(61), name: 'Beta Labs', status: 'active' }];
  const t = await turn({ command: 'archive Beta', db });
  findings.push({ id: 'C8-note', note: '"archive Beta" with Beta Corp(archived)+Beta Labs(active): status preference picks the active one without asking', calls: t.calls, report: t.report });
  console.log('NOTE C8 ' + JSON.stringify({ calls: t.calls, report: t.report }));
}
// 9. idempotency of resolution: restore twice
{
  const db = [{ id: U(70), name: 'Cycle Co', status: 'archived' }];
  const t1 = await turn({ command: 'restore Cycle Co', db });
  const t2 = await turn({ command: 'restore Cycle Co', db });
  check('C9 second restore is a truthful already_active no-op with no evidence', t1.evidence.filter((e) => e.ok).length === 1 && t2.evidence.filter((e) => e.ok).length === 0 && /was already active/.test(t2.report), JSON.stringify(t2.report));
}
// 10. lifecycle verb + pronoun only ("restore it") with nothing resolvable: never silent? (name null -> no line)
{
  const db = [{ id: U(80), name: 'Some Co', status: 'archived' }];
  const t = await turn({ command: 'restore it', db });
  console.log('NOTE C10 "restore it" with nothing resolvable: calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report) + ' (the never-silent receipt in the claim window must cover this)');
  findings.push({ id: 'C10-note', calls: t.calls, report: t.report });
}
// 11. a mid-sentence / lowercase / polite lifecycle command still resolves by name
for (const command of ['could you please restore Polite Co', 'i think we should restore polite co now', 'RESTORE POLITE CO', 'restore the company Polite Co please', 'Polite Co needs to be restored', 'bring back Polite Co']) {
  const db = [{ id: U(90), name: 'Polite Co', status: 'archived' }, { id: U(91), name: 'Other', status: 'active' }];
  const t = await turn({ command, db });
  const ok = t.calls.length === 1 && t.calls[0][1] === U(90);
  check('C11 command shape resolves by name: ' + JSON.stringify(command), ok, 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
  if (!ok) findings.push({ id: 'C11', command, calls: t.calls, report: t.report });
}
console.log(`\nv56 lifecycle_harness: ${pass} passed, ${failures.length} failed`);
import { writeFileSync } from 'node:fs';
writeFileSync(resolve(HERE, 'lifecycle_harness.findings.json'), JSON.stringify({ failures, findings }, null, 1));

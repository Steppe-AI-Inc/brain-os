// VERIFIER #56 — does a QUESTION (or any non-imperative sentence) that merely contains an
// archive/restore-family word execute a company lifecycle RPC through the command-name fallback?
// Executes the REAL company-lifecycle executor slice (same extraction as company_lifecycle_matrix).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from '../../../../scenarios-runner/_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
function slice(startMarker, endMarker) {
  const s = src.indexOf(startMarker); if (s === -1) throw new Error('start marker not found: ' + startMarker);
  const e = src.indexOf(endMarker, s); if (e === -1) throw new Error('end marker not found: ' + endMarker);
  return stripTS(src.slice(s, e + endMarker.length));
}
const LIFECYCLE_SLICE = slice('const COMPANY_UUID_RE = /^[0-9a-f]{8}-', "const archiveRestoreReport = archiveRestoreLines.length > 0 ? archiveRestoreLines.join(' ') : null;");
if (!/async function resolveCompanyLifecycleTargets/.test(LIFECYCLE_SLICE)) throw new Error('not the production lifecycle window');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const ARCHIVE_VERB_PATTERN = new Function('return ' + src.match(/const ARCHIVE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
const RESTORE_VERB_PATTERN = new Function('return ' + src.match(/const RESTORE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
const runLifecycle = new AsyncFunction('supabase', 'result', 'command', 'contextPack', 'recordExecution', 'ARCHIVE_VERB_PATTERN', 'RESTORE_VERB_PATTERN',
  LIFECYCLE_SLICE + '\n; return { archiveCompanyIds, restoreCompanyIds, report: archiveRestoreReport, pendingAction: result.pendingAction };');
function client(companies) {
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
  const rpc = async (name, args) => {
    calls.push([name, args.p_company_id]);
    const row = companies.find((r) => r.id === args.p_company_id);
    if (!row) return { data: { changed: false, authorized: true, postconditionPassed: false, reason: 'not_found' }, error: null };
    if (name === 'restore_company') { if (row.status !== 'archived') return { data: { changed: false, postconditionPassed: true, reason: 'already_active' }, error: null }; row.status = 'active'; return { data: { changed: true, postconditionPassed: true, reason: 'restored', previousStatus: 'archived', newStatus: 'active' }, error: null }; }
    if (row.status === 'archived') return { data: { changed: false, postconditionPassed: true, reason: 'already_archived' }, error: null }; row.status = 'archived'; return { data: { changed: true, postconditionPassed: true, reason: 'archived', previousStatus: 'active', newStatus: 'archived' }, error: null };
  };
  return { calls, from: (name) => { if (name !== 'companies') throw new Error('unexpected table ' + name); return table(companies); }, rpc };
}
const U = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
async function turn(command, db, result = {}) {
  const sb = client(db); const evidence = [];
  const rec = (rt, action, id, ok) => { if (typeof id === 'string' && id) evidence.push({ rt, action, id, ok }); };
  const out = await runLifecycle(sb, { ...result }, command, { companies: [], archivedCompanies: [] }, rec, ARCHIVE_VERB_PATTERN, RESTORE_VERB_PATTERN);
  return { ...out, calls: sb.calls, evidence, db };
}
const QUESTIONS = [
  ['did you archive Alpha?', 'Alpha Holdings', 'active'],
  ['Did we already archive Alpha?', 'Alpha Holdings', 'active'],
  ['why did we archive Alpha?', 'Alpha Holdings', 'active'],
  ['is it safe to delete Alpha?', 'Alpha Holdings', 'active'],
  ['should I restore Beta?', 'Beta Corp', 'archived'],
  ['can we restore Beta later?', 'Beta Corp', 'archived'],
  ['what happens if I archive Alpha', 'Alpha Holdings', 'active'],
  ['who asked to archive Alpha', 'Alpha Holdings', 'active'],
  ['do not archive Alpha', 'Alpha Holdings', 'active'],
  ['never delete Alpha', 'Alpha Holdings', 'active'],
  ['I decided not to archive Alpha', 'Alpha Holdings', 'active'],
  ['remind me to archive Alpha next week', 'Alpha Holdings', 'active'],
  ['before we archive Alpha, list its tasks', 'Alpha Holdings', 'active'],
  ['how do I restore Beta', 'Beta Corp', 'archived'],
  ['explain how to archive Alpha', 'Alpha Holdings', 'active'],
  ['tell me why we should not delete Alpha', 'Alpha Holdings', 'active'],
  ['what would removing Alpha affect?', 'Alpha Holdings', 'active'],
  ['is Alpha archived?', 'Alpha Holdings', 'active'],
  ['when did we end Bob', 'Bob Trucking', 'active'],
];
let executed = 0;
const rows = [];
for (const [command, name, status] of QUESTIONS) {
  const db = [{ id: U(1), name, status }, { id: U(2), name: 'Unrelated Co', status: 'active' }];
  const t = await turn(command, db);
  const mutated = t.calls.length > 0;
  if (mutated) executed++;
  rows.push({ command, name, calls: t.calls, report: t.report, final: t.db[0].status });
  console.log((mutated ? 'EXECUTED ' : 'ok       ') + JSON.stringify(command) + '  company=' + JSON.stringify(name) + '  calls=' + JSON.stringify(t.calls.map((c) => c[0])) + '  report=' + JSON.stringify(t.report) + '  final=' + t.db[0].status);
}
console.log(`\nquestion_probe: ${executed}/${QUESTIONS.length} non-imperative sentences executed a lifecycle RPC through the command-name fallback`);
import { writeFileSync } from 'node:fs';
writeFileSync(resolve(HERE, 'question_probe.json'), JSON.stringify({ executed, total: QUESTIONS.length, rows }, null, 1));

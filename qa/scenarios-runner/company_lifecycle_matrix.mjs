#!/usr/bin/env node
// COMPANY LIFECYCLE MATRIX — product invariants for archive/restore through Brain Chat
// (governance/CANONICAL_WORK_CONTRACT.md §1-§3; BUG-014, Work-PC 2026-09-07).
//
// Executes the REAL company-lifecycle executor slice of sem-ai-command/index.ts (server-side
// target resolution + the archive/restore RPC loops + disambiguation) against a stubbed
// Supabase client that answers like PostgREST/RPC would, for the founder's eleven cases:
//
//   1 fresh channel restore (target NOT in the context window; model emits nothing) -> resolved by name, RPC runs
//   2 same-channel restore (model emits an id the window never carried)              -> id re-read, RPC runs
//   3 reload before restore (no window at all)                                       -> same as 1
//   4 restore after a long conversation (window full of other companies)             -> same as 1
//   5 restore after rename (the founder uses the NEW name)                            -> name lookup hits
//   6 restore when children exist (no cascade is implied; RPC reports the transition) -> receipt from the RPC
//   7 restore when manager relationships exist                                        -> same
//   8 repeated archive/restore cycles                                                 -> each cycle truthful
//   9 stale pending action (a disambiguation left over) does not execute anything     -> zero RPC calls
//  10 already-active restore                                                          -> truthful no-op, no evidence
//  11 already-archived archive                                                        -> truthful no-op, no evidence
//  + ambiguity (two archived companies match)                                         -> asks, executes nothing
//  + zero hits                                                                        -> says so, executes nothing
//  + RPC failure / postcondition not confirmed                                        -> failed envelope, no success
//
// Every case asserts: RPC calls made, evidence recorded (only on changed && postconditionPassed),
// the report line, and that the turn is never silent. Runnable with plain node; no network.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from './_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

function slice(startMarker, endMarker) {
  const s = src.indexOf(startMarker); if (s === -1) throw new Error('start marker not found: ' + startMarker);
  const e = src.indexOf(endMarker, s); if (e === -1) throw new Error('end marker not found: ' + endMarker);
  return stripTS(src.slice(s, e + endMarker.length));
}
const LIFECYCLE_SLICE = slice(
  'const COMPANY_UUID_RE = /^[0-9a-f]{8}-',
  "const archiveRestoreReport = archiveRestoreLines.length > 0 ? archiveRestoreLines.join(' ') : null;",
);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const ARCHIVE_VERB_PATTERN = new Function('return ' + src.match(/const ARCHIVE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
const RESTORE_VERB_PATTERN = new Function('return ' + src.match(/const RESTORE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
const runLifecycle = new AsyncFunction('supabase', 'result', 'command', 'contextPack', 'recordExecution', 'ARCHIVE_VERB_PATTERN', 'RESTORE_VERB_PATTERN',
  LIFECYCLE_SLICE + '\n; return { archiveCompanyIds, restoreCompanyIds, report: archiveRestoreReport, pendingAction: result.pendingAction };');

// ---- stub client: companies table + lifecycle RPCs ----
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
  return {
    calls,
    from: (name) => { if (name !== 'companies') throw new Error('unexpected table ' + name); return table(companies); },
    rpc: async (name, args) => { calls.push([name, args.p_company_id]); const b = rpcBehaviour(name, args.p_company_id, companies); return b; },
  };
}
const A = 'aaaaaaaa-1111-1111-1111-111111111111', B = 'bbbbbbbb-2222-2222-2222-222222222222', C = 'cccccccc-3333-3333-3333-333333333333';
const DB = () => [{ id: A, name: 'QA-SWARM-TEST-CO-VIA-CHAT', status: 'archived' }, { id: B, name: 'Acme Holdings', status: 'active' }, { id: C, name: 'Acme Holdings Ltd', status: 'archived' }];
const realRpc = (name, id, rows) => {
  const row = rows.find((r) => r.id === id);
  if (!row) return { data: { operation: name, changed: false, authorized: true, postconditionPassed: false, reason: 'not_found' }, error: null };
  if (name === 'restore_company') { if (row.status !== 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_active' }, error: null }; row.status = 'active'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'restored', previousStatus: 'archived', newStatus: 'active' }, error: null }; }
  if (name === 'archive_company') { if (row.status === 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_archived' }, error: null }; row.status = 'archived'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'archived', previousStatus: 'active', newStatus: 'archived' }, error: null }; }
  throw new Error('unexpected rpc ' + name);
};
async function turn({ command, result = {}, pack = {}, db = DB(), rpc = realRpc }) {
  const sb = client(db, rpc);
  const evidence = [];
  const rec = (rt, action, id, ok, detail) => { if (typeof id === 'string' && id) evidence.push({ rt, action, id, ok, detail: detail || null }); };
  const out = await runLifecycle(sb, { ...result }, command, { companies: [], archivedCompanies: [], ...pack }, rec, ARCHIVE_VERB_PATTERN, RESTORE_VERB_PATTERN);
  return { ...out, calls: sb.calls, evidence, db };
}

let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };
const verified = (t) => t.evidence.filter((e) => e.ok);

// 1 fresh channel: nothing in the window, model emits nothing, the command names the company.
{
  const t = await turn({ command: 'restore QA-SWARM-TEST-CO-VIA-CHAT', result: {}, pack: { companies: [{ id: B, name: 'Acme Holdings', status: 'active' }] } });
  check('1 fresh channel: target outside the window is resolved by name and restored', t.calls.length === 1 && t.calls[0][0] === 'restore_company' && t.calls[0][1] === A && t.db.find((r) => r.id === A).status === 'active', JSON.stringify(t.calls));
  check('1 evidence recorded only for the confirmed transition', verified(t).length === 1 && verified(t)[0].id === A && verified(t)[0].action === 'restore');
  check('1 the report names the outcome', /QA-SWARM-TEST-CO-VIA-CHAT: restored\./.test(t.report || ''), t.report);
}
// 2 same channel: the model emits the id it saw in history; the window never carried it.
{
  const t = await turn({ command: 'ok restore it', result: { restoreCompanyIds: [A] } });
  check('2 model-emitted id outside the window is re-read and restored', t.calls.length === 1 && t.calls[0][1] === A && t.db.find((r) => r.id === A).status === 'active');
}
// 3 / 4 reload / long conversation: same as 1 with an unrelated full window.
{
  const t = await turn({ command: 'please restore the company QA-SWARM-TEST-CO-VIA-CHAT now', pack: { companies: Array.from({ length: 12 }, (_, i) => ({ id: 'dddddddd-0000-0000-0000-00000000000' + i, name: 'Other ' + i, status: 'active' })) } });
  check('3/4 reload / long conversation: a full unrelated window does not hide the target', t.calls.length === 1 && t.calls[0][1] === A, JSON.stringify(t.calls));
}
// 5 restore after rename: the founder uses the new name (the DB already carries it).
{
  const db = DB(); db[0].name = 'QA-SWARM-RENAMED';
  const t = await turn({ command: 'restore QA-SWARM-RENAMED', db });
  check('5 restore after rename resolves the new name', t.calls.length === 1 && t.calls[0][1] === A);
}
// 6 / 7 children and manager relationships exist: archiving destroys nothing; the RPC reports the transition.
{
  const t = await turn({ command: 'archive Acme Holdings', result: { archiveCompanyIds: [B] } });
  check('6/7 archive with children/managers: one RPC, transition reported, nothing else touched', t.calls.length === 1 && t.calls[0][0] === 'archive_company' && /Acme Holdings: archived\./.test(t.report) && t.db.find((r) => r.id === C).status === 'archived' && t.db.find((r) => r.id === A).status === 'archived');
}
// 8 repeated cycles on one row.
{
  const db = DB();
  const t1 = await turn({ command: 'archive Acme Holdings', result: { archiveCompanyIds: [B] }, db });
  const t2 = await turn({ command: 'restore Acme Holdings', result: { restoreCompanyIds: [B] }, db });
  const t3 = await turn({ command: 'archive Acme Holdings', result: { archiveCompanyIds: [B] }, db });
  check('8 repeated archive/restore cycles are each truthful', verified(t1).length === 1 && verified(t2).length === 1 && verified(t3).length === 1 && db.find((r) => r.id === B).status === 'archived');
}
// 9 stale pending action: a bare "yes" with no ids and no names executes nothing.
{
  const t = await turn({ command: 'yes', result: { pendingAction: { kind: 'disambiguation', question: 'Which one?' } } });
  check('9 a stale pending action alone executes nothing', t.calls.length === 0 && t.evidence.length === 0);
}
// 10 / 11 idempotent outcomes: truthful no-ops, no evidence, never silent.
{
  const t = await turn({ command: 'restore Acme Holdings', result: { restoreCompanyIds: [B] } });
  check('10 already-active restore: truthful no-op, no evidence', t.calls.length === 1 && verified(t).length === 0 && /was already active/.test(t.report), t.report);
  const t2 = await turn({ command: 'archive QA-SWARM-TEST-CO-VIA-CHAT', result: { archiveCompanyIds: [A] } });
  check('11 already-archived archive: truthful no-op, no evidence', t2.calls.length === 1 && verified(t2).length === 0 && /was already archived/.test(t2.report), t2.report);
}
// exact name wins over a longer near-twin: "Acme Holdings" resolves to the exact row, not "Acme Holdings Ltd".
{
  const db = DB(); db[1].status = 'archived';
  const t = await turn({ command: 'restore Acme Holdings', db });
  check('exact name match wins over a near-twin (no disambiguation needed)', t.calls.length === 1 && t.calls[0][1] === B, JSON.stringify(t.calls));
}
// ambiguity: two archived companies match a loose name -> ask, execute nothing.
{
  const db = DB(); db[1].status = 'archived';
  const t = await turn({ command: 'restore Acme', db });
  check('ambiguous name: disambiguation armed, zero RPC calls, report says so', t.calls.length === 0 && t.pendingAction && t.pendingAction.kind === 'disambiguation' && t.pendingAction.options.length === 2 && /more than one company matches/.test(t.report), JSON.stringify({ calls: t.calls, pa: t.pendingAction, report: t.report }));
}
// zero hits: say so, execute nothing, never silent.
{
  const t = await turn({ command: 'restore company Nowhere Inc' });
  check('zero hits: no RPC, no evidence, the report says nothing was restored', t.calls.length === 0 && t.evidence.length === 0 && /Nowhere Inc: no company by that name/.test(t.report) && /nothing was restored/.test(t.report), t.report);
  const t2 = await turn({ command: 'restore', result: { restoreCompanyNames: ['Nowhere Inc'] } });
  check('zero hits via model-emitted name: same truthful line', t2.calls.length === 0 && /Nowhere Inc: no company by that name/.test(t2.report), t2.report);
}
// RPC failure and unconfirmed postcondition: failed envelope, no success.
{
  const t = await turn({ command: 'restore QA-SWARM-TEST-CO-VIA-CHAT', result: { restoreCompanyIds: [A] }, rpc: () => ({ data: null, error: { message: 'boom' } }) });
  check('rpc error: failed envelope, report says failed, no success evidence', verified(t).length === 0 && t.evidence.length === 1 && t.evidence[0].detail.executed === false && /restore failed \(boom\)/.test(t.report), t.report);
  const t2 = await turn({ command: 'restore QA-SWARM-TEST-CO-VIA-CHAT', result: { restoreCompanyIds: [A] }, rpc: () => ({ data: { changed: true, authorized: true, postconditionPassed: false, reason: 'restored' }, error: null }) });
  check('postcondition not confirmed: executed but unverified envelope, treat as not restored', verified(t2).length === 0 && t2.evidence.length === 1 && t2.evidence[0].detail.executed === true && /did not confirm/.test(t2.report), t2.report);
  const t3 = await turn({ command: 'restore QA-SWARM-TEST-CO-VIA-CHAT', result: { restoreCompanyIds: [A] }, rpc: () => ({ data: { changed: false, authorized: false, postconditionPassed: false, reason: 'denied' }, error: null }) });
  check('denied: no evidence, permission line', verified(t3).length === 0 && /do not have permission/.test(t3.report), t3.report);
}
// a lifecycle verb on a non-company command must not invent a company line
{
  const t = await turn({ command: 'delete task QA-1', result: { deleteTaskIds: ['11111111-1111-1111-1111-111111111111'] } });
  check('a task delete command produces no company line and no company RPC', t.calls.length === 0 && t.report === null, t.report);
}
// verifier #56 V56-D3 / D3b / D4 with an EXACT company name (the exact stage is the one that executes):
// the raw command is a target source only for an imperative company-lifecycle command.
{
  const E = 'eeeeeeee-4444-4444-4444-444444444444';
  const exactDb = () => [{ id: E, name: 'Alpha', status: 'active' }, ...DB()];
  const t1 = await turn({ command: 'delete Alpha', result: { deleteTaskIds: ['11111111-1111-1111-1111-111111111111'] }, db: exactDb() });
  check('D3 exact-named company is NOT archived when the model resolved the command to a task', t1.calls.length === 0 && t1.db.find((r) => r.id === E).status === 'active', JSON.stringify(t1.calls));
  const t2 = await turn({ command: 'do not archive Alpha', db: exactDb() });
  check('D3b a negated lead never executes (exact name)', t2.calls.length === 0 && t2.db.find((r) => r.id === E).status === 'active', JSON.stringify(t2.calls));
  const t3 = await turn({ command: 'did you archive Alpha?', db: exactDb() });
  check('D3b a question never executes (exact name)', t3.calls.length === 0, JSON.stringify(t3.calls));
  const t4 = await turn({ command: 'if we archive Alpha, what happens to its people?', db: exactDb() });
  check('D3b a hypothetical lead never executes (exact name)', t4.calls.length === 0, JSON.stringify(t4.calls));
  const t5 = await turn({ command: 'archive Alpha', db: exactDb() });
  check('the imperative twin of the same command DOES execute (positive control)', t5.calls.length === 1 && t5.calls[0][1] === E && t5.db.find((r) => r.id === E).status === 'archived', JSON.stringify(t5.calls));
  const t6 = await turn({ command: 'archive Alpha', result: { requestIntent: { kind: 'read', action: 'archive', entityType: 'company', targetName: 'Alpha' } }, db: exactDb() });
  check('the model classifying the request as a READ withholds the command fallback', t6.calls.length === 0, JSON.stringify(t6.calls));
  // D4 both directions: the FIRST lifecycle verb decides; a lifecycle word inside the name never flips it.
  const R = 'ffffffff-5555-5555-5555-555555555555';
  const t7 = await turn({ command: 'restore Archived Assets Ltd', db: [{ id: R, name: 'Archived Assets Ltd', status: 'archived' }, ...DB()] });
  check('D4 "restore Archived Assets Ltd": exactly one restore RPC, ends active, no stray archive question', t7.calls.length === 1 && t7.calls[0][0] === 'restore_company' && t7.calls[0][1] === R && t7.db.find((r) => r.id === R).status === 'active' && !t7.pendingAction && !/more than one|pick one/.test(t7.report || ''), JSON.stringify({ calls: t7.calls, pa: t7.pendingAction, report: t7.report }));
  const t8 = await turn({ command: 'archive Restored Furniture Co', db: [{ id: R, name: 'Restored Furniture Co', status: 'active' }, ...DB()] });
  check('D4 "archive Restored Furniture Co": exactly one archive RPC, ends archived', t8.calls.length === 1 && t8.calls[0][0] === 'archive_company' && t8.db.find((r) => r.id === R).status === 'archived', JSON.stringify(t8.calls));
  // V57-D4: an exact-named row whose longest word is a generic suffix shared by 50+ other rows is still found.
  const G = 'abababab-6666-6666-6666-666666666666';
  const crowded = [...Array.from({ length: 60 }, (_, i) => ({ id: 'cdcdcdcd-0000-0000-0000-' + String(i).padStart(12, '0'), name: 'Filler ' + i + ' Holdings', status: 'active' })), { id: G, name: 'AB Holdings', status: 'archived' }, ...DB()];
  const t10 = await turn({ command: 'restore company AB Holdings', db: crowded });
  check('D4 exact name is found behind 60 rows sharing its longest word', t10.calls.length === 1 && t10.calls[0][1] === G && t10.db.find((r) => r.id === G).status === 'active', JSON.stringify({ calls: t10.calls, report: t10.report }));
  // V57-D6a: a polite question with the model emitting nothing is a request, not a read.
  const t11 = await turn({ command: 'could you please restore QA-SWARM-TEST-CO-VIA-CHAT?' });
  check('D6a a polite lifecycle question executes (model emitted nothing)', t11.calls.length === 1 && t11.calls[0][1] === A && t11.db.find((r) => r.id === A).status === 'active', JSON.stringify(t11.calls));
  const t12 = await turn({ command: 'did we restore QA-SWARM-TEST-CO-VIA-CHAT?' });
  check('D6a a genuine question still never executes', t12.calls.length === 0, JSON.stringify(t12.calls));
  // The model's own structured parse of the request is a name source (language-independent).
  const t9 = await turn({ command: 'QA-SWARM-TEST-CO-VIA-CHAT компанийг сэргээ', result: { requestIntent: { kind: 'mutation', action: 'restore', entityType: 'company', targetName: 'QA-SWARM-TEST-CO-VIA-CHAT' } } });
  check('requestIntent.targetName resolves a restore in another language', t9.calls.length === 1 && t9.calls[0][1] === A && t9.db.find((r) => r.id === A).status === 'active', JSON.stringify(t9.calls));
}

console.log(`\ncompany_lifecycle_matrix: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }

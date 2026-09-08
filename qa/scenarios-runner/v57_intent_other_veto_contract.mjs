#!/usr/bin/env node
// VERIFIER #57 (campaign #117) — regression additions for candidate 712760dcb0d68b969b940d5175bbd76bf205ccb1
// (index.ts sha256 ccde932fa5b1aeca77cb91d730df89ea16c100432d83dd80782b4217b85fe871).
//
// Executes the REAL code sliced out of sem-ai-command/index.ts (the structured-claim / intent / receipt window, the
// company-lifecycle executor window, the narrative-tier history mapping, the pendingAction precedence expression and
// the collection envelope helper) through the repository's own detyper — never a re-implementation. Every row
// asserts an OUTCOME the Operating Truth Model requires, not an implementation shape.
//
//   CONTRACT rows must hold on ANY candidate (green on 712760d).
//   DEFECT rows reproduce V57-D1 / V57-D2 / V57-D3 and are RED on 712760d by design; they go green on the prepared
//   fix (qa/verification/scratch/v57/v57_fix.mjs -> index.fixed.ts) — run with SEM_INDEX_SRC pointing at it.
//   RESIDUAL rows are measured and printed but never counted (sized residuals V57-D4/D5/D6).
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

let pass = 0, fail = 0, contractFail = 0, defectFail = 0, residual = 0;
const check = (kind, name, ok, detail = '') => {
  if (kind === 'RESIDUAL') { residual++; console.log(`${ok ? 'ok   ' : 'RESID'} [RESIDUAL] ${name}${ok ? '' : (detail ? '\n        ' + detail : '')}`); return; }
  if (ok) { pass++; console.log(`ok    [${kind}] ${name}`); }
  else { fail++; if (kind === 'CONTRACT') contractFail++; else defectFail++; console.log(`FAIL  [${kind}] ${name}${detail ? '\n        ' + detail : ''}`); }
};

// ── the REAL structured-claim / intent / receipt window ──────────────────────────────────────────
function extractStructuredBlock(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found');
  const anchor = source.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found');
  const end = source.indexOf('};', anchor) + 2;
  const raw = source.slice(start, end);
  for (const must of ['const requestedIntent', 'No change was made — ', 'const legacyProseFallback', 'const unaccountedCompletionProse', 'result.turnVerdict = {', 'const readsAsCompletion']) {
    if (!raw.includes(must)) throw new Error('window does not contain ' + must + ' — not the production window');
  }
  return withPatternsAboveWindow(source, stripTS(raw));
}
const windowFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  extractStructuredBlock(RAW) + '\n; return { summary: result.summary, verdict: result.turnVerdict, intent: requestedIntent };'
);
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ID = '11111111-1111-1111-1111-111111111111';
const CTX = { companies: [{ id: ACME, name: 'ACME', status: 'active' }] };
const NAMES = ['ACME', 'Beta', 'Bob', 'Alice', 'Alpha', 'QA-1', 'Beta Corp', 'Sales', 'Gamma', 'G1'];
const turn = ({ command, claims = null, summary = '', pendingAction = null, questions, evidence = [], lifecycleReports = [], factLines = [], deterministicPrefix = '', fullyDeterministic = false, labels = {}, requestIntent, context = CTX, extra = {} }) => {
  globalThis.command = command; globalThis.lifecycleReports = lifecycleReports; globalThis.factLines = factLines; globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-v57' };
  globalThis.knownEntityNames = new Set(NAMES.map((n) => n.toLowerCase()));
  const result = { claims: claims === null ? null : JSON.parse(JSON.stringify(claims)), summary, pendingAction: pendingAction ? JSON.parse(JSON.stringify(pendingAction)) : null, questions, ...extra };
  if (requestIntent !== undefined) result.requestIntent = requestIntent;
  return windowFn(result, evidence, context, 'gpt', false, false, DENO, mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mk(labels.runtime));
};
const EV = (rt, action, id, ok = true, extra = {}) => ({ resourceType: rt, action, id, postconditionPassed: ok, request_id: null, channel_id: null, turn: null, action_type: action, entity_type: rt, canonical_entity_ids: [id], requested_values: null, executed: true, rows_affected: ok ? 1 : 0, backend_result: null, precondition: null, postcondition: null, postcondition_verified: ok, error: ok ? null : 'postcondition_not_confirmed', timestamp: 'now', ...extra });
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const NO_CHANGE = /No change was made — /;
const RI = (kind, action = null, entityType = null, targetName = null) => ({ kind, action, entityType, targetName });

// ── the REAL company-lifecycle executor window ───────────────────────────────────────────────────
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
  const realRpc = (name, id, rows) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return { data: { changed: false, authorized: true, postconditionPassed: false, reason: 'not_found' }, error: null };
    if (name === 'restore_company') { if (row.status !== 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_active' }, error: null }; row.status = 'active'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'restored', previousStatus: 'archived', newStatus: 'active' }, error: null }; }
    if (row.status === 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_archived' }, error: null }; row.status = 'archived'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'archived', previousStatus: 'active', newStatus: 'archived' }, error: null };
  };
  return { calls, from: (name) => { if (name !== 'companies') throw new Error('unexpected table ' + name); return table(companies); }, rpc: async (name, args) => { calls.push([name, args.p_company_id]); return (rpcBehaviour || realRpc)(name, args.p_company_id, companies); } };
}
const U = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
async function life(command, db, result = {}, rpc) {
  const sb = client(db, rpc); const evidence = [];
  const rec = (rt, action, id, ok, detail) => { if (typeof id === 'string' && id) evidence.push({ rt, action, id, ok, detail: detail || null }); };
  const out = await runLifecycle(sb, { ...result }, command, { companies: [], archivedCompanies: [] }, rec, ARCHIVE_VERB_PATTERN, RESTORE_VERB_PATTERN);
  return { ...out, calls: sb.calls, evidence, db };
}
const st = (db, id) => db.find((r) => r.id === id).status;
const A = U(1), B = U(2);
const exactDb = () => [{ id: A, name: 'Alpha', status: 'active' }, { id: B, name: 'Beta', status: 'archived' }, { id: U(3), name: 'Unrelated Co', status: 'active' }];

// ── the REAL history mapping, precedence expression and envelope helper ─────────────────────────
const historyFn = new Function('conversationRowsChronological', 'historyWindowStart', stripTS(src.slice(src.indexOf('const conversationHistory = (conversationRowsChronological || []).map('), src.indexOf('  const continuity = {'))) + '\n; return conversationHistory;');
const precedenceFn = new Function('conversationRowsChronological', 'durableChannelState', stripTS(src.slice(src.indexOf('const lastTurnRow = conversationRowsChronological?.[conversationRowsChronological.length - 1];'), src.indexOf('  const recentlyResolvedEntities'))) + '\n; return { pendingAction, durablePendingActionValid };');
const envelope = new Function(stripTS(src.slice(src.indexOf('const envelope = (res'), src.indexOf('const collections = {'))) + '\n; return envelope;')();

// ═════════════════════════════ CONTRACT ═════════════════════════════
// C1 never-silent receipt: mutation-intent request × claim shapes × pendingAction/question (OTM §3 rule 3).
const C1 = [
  ['rename the project Gamma to Delta', 'Renamed Gamma to Delta. Anything else?'], ['approve the salary raise for Bob', 'Approved the salary raise for Bob.'],
  ['delete project Gamma', 'Project Gamma has been deleted.'], ['archive the company Gamma', 'Gamma archived. Its 3 projects were archived too.'],
  ['restore the company Beta Corp', 'Beta Corp restored and visible in Companies again.'], ['assign QA-1 to Alice', 'QA-1 is now assigned to Alice.'],
  ['make Alice the manager of Bob', 'Done. Alice manages Bob now.'], ['end Alice’s employment', 'Alice’s employment ended today.'],
  ['Could you please archive Gamma', 'Of course — Gamma is archived.'], ['I need Gamma archived', 'Gamma has been archived as you asked.'],
  ['Gamma-г архивла', 'Gamma архивлагдлаа.'], ['yes', 'Done — archived Gamma as planned.'], ['option 2', 'Restored the second one: Beta Corp.'], ['proceed', 'Proceeding. All three tasks are now assigned to Alice.'],
];
const VARIANTS = [['null', null], ['[]', []], ['state-only', [{ type: 'existence', resourceType: 'company', resourceId: ACME }]], ['historical_event', [{ type: 'historical_event', resourceType: 'company', resourceId: ACME, action: 'archive', temporalScope: 'prior_turn' }]], ['mutation_result(nonexistent id)', [M('company', '99999999-9999-4999-8999-999999999999', 'archive')]]];
for (const [command, summary] of C1) {
  for (const [label, claims] of VARIANTS) {
    const r = turn({ command, summary, claims });
    check('CONTRACT', `C1 no fabrication ships: ${JSON.stringify(command)} [claims:${label}]`, r.intent !== null && r.verdict.executedOperationCount === 0 && !r.summary.includes(summary) && (NO_CHANGE.test(r.summary) || /can’t confirm/.test(r.summary)), 'measured=' + JSON.stringify(r.summary));
  }
  const rp = turn({ command, summary: summary + ' Shall I continue?', pendingAction: { kind: 'open_question', question: 'Shall I continue?' } });
  check('CONTRACT', `C1 pendingAction+question never exempts, question kept: ${JSON.stringify(command)}`, NO_CHANGE.test(rp.summary) && !rp.summary.includes(summary) && /Shall I continue\?/.test(rp.summary) && rp.verdict.receiptRendered === true, 'measured=' + JSON.stringify(rp.summary));
  const rq = turn({ command, summary, questions: ['Do you also want the projects archived?'] });
  check('CONTRACT', `C1 questions[] survive the receipt: ${JSON.stringify(command)}`, NO_CHANGE.test(rq.summary) && !rq.summary.includes(summary) && /Do you also want the projects archived\?/.test(rq.summary), 'measured=' + JSON.stringify(rq.summary));
}
// C2 read requests survive verbatim, with and without the model saying read (OTM §3 rule 2).
const C2 = [
  ['what did we change today?', 'Today: Gamma was archived, Bob was reassigned to Beta Corp, and QA-1 was closed. Anything else?'],
  ['is Gamma archived?', 'Gamma is archived. It was archived on 2026-09-01. Want me to restore it?'],
  ['summarize what happened in this channel', 'Turn 1: Gamma was archived. Turn 2: Beta Corp was restored. Turn 3: QA-1 was assigned to Alice.'],
  ['status of the ACME archive', 'Archiving old records is something we do quarterly; nothing has been archived this month.'],
  ['tell me about Gamma', 'Gamma was created in 2024, archived in 2025 and restored this year. Its manager was updated twice.'],
  ['who reports to Alice?', 'Bob and Carol report to Alice. Carol was assigned to her when she was hired.'],
  ['explain the archive policy', 'Archiving is reversible: an archived company stays in the database and restoring it makes everything normal again.'],
  ['what’s the plan for archiving Gamma', 'Restoring Gamma would bring back 3 projects; assigning them again is not needed.'],
  ['make a list of all companies', 'ACME, Beta Corp, Gamma (archived).'], ['create a report of archived companies', 'Archived: Gamma (2026-09-01).'],
  ['update me on the project status', 'Alpha is paused; Apollo was created last week.'], ['end date of the project Alpha?', 'The end date of Alpha is 2026-12-31.'],
  ['restore my memory: who is Bob?', 'Bob is the CTO; he was hired in 2024.'], ['Gamma timeline', 'Created 2024, archived 2025, restored 2026.'],
];
for (const [command, summary] of C2) for (const [kl, ri] of [['absent', undefined], ['read', RI('read')]]) {
  const r = turn({ command, summary, requestIntent: ri, pendingAction: /\?$/.test(summary) ? { kind: 'open_question', question: summary.split(/(?<=[.!])\s/).pop() } : null });
  check('CONTRACT', `C2 read survives verbatim [model ${kl}]: ${JSON.stringify(command)}`, r.summary === summary && r.intent === null && r.verdict.receiptRendered === false, 'intent=' + JSON.stringify(r.intent) + ' measured=' + JSON.stringify(r.summary));
}
// C3 the structured tier is first: the model's requestIntent = mutation makes ANY phrasing a mutation-intent turn.
const FAB = 'Done — that has been taken care of as requested.';
for (const command of ['let Bob go', 'get rid of task QA-1', 'drop the goal G1', 'kill the project Alpha', 'archiviere ACME', 'архивируй ACME', 'When you get a moment, please archive ACME', 'archive ACME?', 'get ACME archived', 'Alice reports to Bob from now on', 'QA-1 → Bob', 'acrhive ACME']) {
  const r = turn({ command, summary: FAB, requestIntent: RI('mutation', 'archive', 'company', 'ACME') });
  check('CONTRACT', `C3 model requestIntent=mutation -> receipt, fabrication never ships: ${JSON.stringify(command)}`, r.intent !== null && NO_CHANGE.test(r.summary) && r.summary !== FAB, 'measured=' + JSON.stringify(r.summary));
  const rc = turn({ command, summary: FAB, requestIntent: RI('confirmation') });
  check('CONTRACT', `C3 model requestIntent=confirmation -> receipt: ${JSON.stringify(command)}`, rc.intent !== null && NO_CHANGE.test(rc.summary), 'measured=' + JSON.stringify(rc.summary));
}
// C4 the model saying READ vetoes the lexicon on generation / conversational turns (truthful reply verbatim).
const FP_OTHER = [
  ['draft an email to Bob about the merge', 'Here is a draft: “Hi Bob — quick note on the plan.”'], ['write a memo on fire safety at ACME', 'Draft memo: Fire safety at ACME — 1. exits, 2. drills.'],
  ['brainstorm names for the new hire', 'Ideas: Ops Lead, Growth Partner, Chief of Staff.'], ['help me word a message declining the offer', 'Suggested wording: “Thank you, but we will pass for now.”'],
  ['translate "delete" into Mongolian', '“delete” = устгах.'], ['draft the agenda: 1. hire plan 2. archive policy', 'Agenda: 1. Hire plan 2. Archive policy 3. AOB.'],
  ['the fire drill is at 3pm', 'Noted — thanks for letting me know.'], ['I approve of this plan', 'Great — glad it works for you.'], ['we’re planning a hire next quarter', 'Noted. Want me to save that as a memory?'],
  ['the revenue split is 60/40', 'Got it: 60/40.'], ['the store will reopen Monday', 'Noted — reopening Monday.'], ['the client may reject the proposal', 'Understood; we can prepare a fallback.'],
  ['history of the ACME archive', 'ACME was archived in 2025 and restored this year.'], ['ACME’s archive date', 'ACME was archived on 2025-03-01.'], ['the delete log for QA-1', 'QA-1 has never been deleted.'],
];
for (const [command, summary] of FP_OTHER) {
  const r = turn({ command, summary, requestIntent: RI('read') });
  check('CONTRACT', `C4 model requestIntent=read vetoes the lexicon: ${JSON.stringify(command)}`, r.summary === summary && r.intent === null, 'intent=' + JSON.stringify(r.intent) + ' measured=' + JSON.stringify(r.summary));
}
// C5 intent purity: derived from the request only.
for (const c of ['archive ACME', 'what is ACME?', 'draft a memo on fire safety', 'yes', 'ACME-г архивла']) {
  const a = turn({ command: c, summary: 'ACME archived.' }).intent, b = turn({ command: c, summary: 'Nothing happened. Shall I?', pendingAction: { kind: 'open_question', question: 'Shall I?' } }).intent, d = turn({ command: c, summary: 'ACME will be archived tomorrow.' }).intent, e = turn({ command: c, summary: 'Archiving ACME now.', claims: [] }).intent;
  check('CONTRACT', `C5 intent depends on the request only: ${JSON.stringify(c)}`, [b, d, e].every((x) => JSON.stringify(x) === JSON.stringify(a)), JSON.stringify([a, b, d, e]));
}
{
  const derivation = src.slice(src.indexOf('const MUTATION_ARRAY_FIELDS'), src.indexOf('const executedVerifiedCount'));
  check('CONTRACT', 'C5 intent derivation reads no response-side or belt input', !/result\.summary|readsAsCompletion|pendingAction|claimExecutionEvidence|lifecycleReports|factLines|deterministicPrefix/.test(derivation));
  check('CONTRACT', 'C5 the final intent is the request-side derivation alone', /const requestedIntent: MutationIntent \| null = requestedIntentPrimary;/.test(src));
}
// C6 verified / unverified envelopes (OTM §4.1).
for (const [command, rt, id, action, label, want] of [['archive the company Gamma', 'company', ACME, 'archive', 'Gamma', /Gamma.*archiv/i], ['delete the task QA-1', 'task', ID, 'delete', 'QA-1', /QA-1.*delet/i], ['restore goal G1', 'goal', ID, 'restore', 'G1', /G1.*restor/i], ['add department Finance', 'department', ID, 'create', 'Finance', /Finance.*creat/i], ['end Alice’s employment', 'person', ID, 'end_employment', 'Alice', /Alice.*(end|employment)/i]]) {
  const labels = ['company', 'task', 'person', 'goal'].includes(rt) ? { [rt]: { [id]: label } } : { runtime: { [rt + '|' + id]: label } };
  const context = rt === 'company' ? { companies: [{ id: ACME, name: label, status: 'active' }] } : CTX;
  const rv = turn({ command, claims: [M(rt, id, action)], evidence: [EV(rt, action, id)], summary: 'fabricated wording', labels, context });
  check('CONTRACT', `C6 verified ${rt}/${action} renders the truthful claim`, !NO_CHANGE.test(rv.summary) && want.test(rv.summary) && rv.verdict.executedOperationCount === 1, 'measured=' + JSON.stringify(rv.summary));
  const ru = turn({ command, claims: [M(rt, id, action)], evidence: [EV(rt, action, id, false)], summary: label + ' ' + action + 'd.', labels, context });
  check('CONTRACT', `C6 executed-but-unverified ${rt}/${action} never supports the claim`, ru.verdict.executedOperationCount === 0 && !/— confirmed\./.test(ru.summary), 'measured=' + JSON.stringify(ru.summary));
  const rd = turn({ command, claims: null, evidence: [EV(rt, action, id, false, { executed: false, error: 'denied', rows_affected: 0 })], summary: label + ' ' + action + 'd.', labels, context });
  check('CONTRACT', `C6 denied ${rt}/${action} with claims:null -> receipt names the failure`, NO_CHANGE.test(rd.summary) && /denied/.test(rd.summary) && rd.verdict.executedOperationCount === 0, 'measured=' + JSON.stringify(rd.summary));
}
{
  const r = turn({ command: 'create department Finance and archive Beta Corp', claims: null, evidence: [EV('department', 'create', ID)], summary: 'Created Finance and archived Beta Corp.', labels: { runtime: { ['department|' + ID]: 'Finance' } } });
  check('CONTRACT', 'C6 one verified create beside a fabricated archive: only the verified line renders', !/Beta Corp/.test(r.summary) && /Finance/.test(r.summary) && r.verdict.executedOperationCount === 1, 'measured=' + JSON.stringify(r.summary));
}
// C7 lifecycle executor: imperative executes; non-imperative shapes and model read/other withhold; fuzzy asks; punctuation; twins; failures.
for (const [command, id, want, rpc] of [['archive Alpha', A, 'archived', 'archive_company'], ['restore Beta', B, 'active', 'restore_company'], ['please archive Alpha', A, 'archived', 'archive_company'], ['archive alpha', A, 'archived', 'archive_company'], ['Archive Alpha.', A, 'archived', 'archive_company'], ['archive Alpha, not Beta', A, 'archived', 'archive_company']]) {
  const t = await life(command, exactDb());
  check('CONTRACT', `C7 imperative executes exactly once: ${JSON.stringify(command)}`, t.calls.length === 1 && t.calls[0][0] === rpc && t.calls[0][1] === id && st(t.db, id) === want, JSON.stringify(t.calls));
}
for (const [command, id, status] of [['did we archive Alpha', A, 'active'], ['is Alpha archived', A, 'active'], ['do not archive Alpha', A, 'active'], ['never archive Alpha', A, 'active'], ['if we archive Alpha, what happens', A, 'active'], ['what if we restore Beta', B, 'archived'], ['should I restore Beta', B, 'archived'], ['remind me to archive Alpha next week', A, 'active'], ['explain the archive Alpha decision', A, 'active'], ['did you archive Alpha?', A, 'active'], ['before we archive Alpha, list its tasks', A, 'active'], ['tell me about the restore Beta plan', B, 'archived']]) {
  const t = await life(command, exactDb());
  check('CONTRACT', `C7 non-imperative never executes: ${JSON.stringify(command)}`, t.calls.length === 0 && st(t.db, id) === status, 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
}
for (const kind of ['read', 'other']) for (const command of ['archive Alpha', 'restore Beta', 'We archived Alpha last week', 'Bob said to archive Alpha']) {
  const t = await life(command, exactDb(), { requestIntent: RI(kind, 'archive', 'company', 'Alpha') });
  check('CONTRACT', `C7 model requestIntent.kind=${kind} withholds the command fallback: ${JSON.stringify(command)}`, t.calls.length === 0, JSON.stringify(t.calls));
}
for (const [command, result] of [['delete Alpha', { deleteTaskIds: [U(20)] }], ['archive Alpha', { archiveGoalIds: [U(21)] }], ['remove Alpha', { endEmploymentPersonIds: [U(22)] }], ['restore Beta', { restoreTaskIds: [U(27)] }], ['archive Alpha', { tasks: [{ title: 'x' }] }]]) {
  const t = await life(command, exactDb(), result);
  check('CONTRACT', `C7 model resolved another entity type -> no company RPC: ${JSON.stringify(command)} + ${Object.keys(result)[0]}`, t.calls.length === 0 && t.report === null, JSON.stringify(t.calls));
}
{
  const db = () => [{ id: U(40), name: 'Alpha Holdings', status: 'active' }, { id: U(41), name: 'Alpha Labs', status: 'active' }, { id: U(42), name: 'Beta Corp', status: 'archived' }];
  const t1 = await life('archive Alpha', db()); check('CONTRACT', 'C7 fuzzy command hit (2 rows) asks, executes nothing', t1.calls.length === 0 && t1.pendingAction?.kind === 'disambiguation' && t1.pendingAction.options.length === 2, JSON.stringify(t1.pendingAction));
  const t2 = await life('restore Beta', db()); check('CONTRACT', 'C7 fuzzy command hit (1 row) still asks, never executes', t2.calls.length === 0 && t2.pendingAction?.kind === 'disambiguation' && t2.pendingAction.options[0]?.actionType === 'restore_company', JSON.stringify(t2.pendingAction));
  const t3 = await life('bring it back', db(), { restoreCompanyNames: ['Beta'] }); check('CONTRACT', 'C7 model-name fuzzy hit (unique) executes', t3.calls.length === 1 && t3.calls[0][1] === U(42), JSON.stringify(t3.calls));
  const t4 = await life('archive it', db(), { archiveCompanyNames: ['Alpha'] }); check('CONTRACT', 'C7 model-name fuzzy hit (2 rows) asks', t4.calls.length === 0 && t4.pendingAction?.kind === 'disambiguation', JSON.stringify(t4.pendingAction));
  const t5 = await life('archive Alpha', db(), { pendingAction: { kind: 'open_question', question: 'Which region?' } }); check('CONTRACT', 'C7 disambiguation replaces a model-armed pendingAction', t5.pendingAction?.kind === 'disambiguation' && t5.calls.length === 0, JSON.stringify(t5.pendingAction));
}
for (const name of ['Acme (Mongolia) LLC', 'A_B Holdings', '100% Natural Foods', 'Acme, Inc.', 'O’Brien & Sons', 'Ко. Монгол ХХК', 'A.B.C. Holdings', 'ACME/Beta JV']) {
  const mkdb = () => [{ id: U(30), name, status: 'archived' }, { id: U(31), name: 'Other Co', status: 'active' }];
  const t1 = await life('restore ' + name, mkdb()); check('CONTRACT', `C7 punctuated via command: ${JSON.stringify(name)}`, t1.calls.length === 1 && t1.calls[0][1] === U(30), JSON.stringify(t1.calls) + ' ' + JSON.stringify(t1.report));
  const t2 = await life('bring it back', mkdb(), { restoreCompanyNames: [name] }); check('CONTRACT', `C7 punctuated via restoreCompanyNames: ${JSON.stringify(name)}`, t2.calls.length === 1 && t2.calls[0][1] === U(30), JSON.stringify(t2.calls));
  const t3 = await life('сэргээ', mkdb(), { requestIntent: RI('mutation', 'restore', 'company', name) }); check('CONTRACT', `C7 punctuated via requestIntent.targetName: ${JSON.stringify(name)}`, t3.calls.length === 1 && t3.calls[0][1] === U(30), JSON.stringify(t3.calls));
}
for (const [command, name, status, rpc, final] of [['archive Restored Furniture Co', 'Restored Furniture Co', 'active', 'archive_company', 'archived'], ['restore Archived Assets Ltd', 'Archived Assets Ltd', 'archived', 'restore_company', 'active'], ['archive Bring It Back Bakery', 'Bring It Back Bakery', 'active', 'archive_company', 'archived'], ['restore Delete Bespoke Ltd', 'Delete Bespoke Ltd', 'archived', 'restore_company', 'active'], ['archive End of the Road Inc', 'End of the Road Inc', 'active', 'archive_company', 'archived']]) {
  const t = await life(command, [{ id: U(53), name, status }, { id: U(54), name: 'Other Co', status: 'active' }]);
  check('CONTRACT', `C7 lifecycle word inside the name never flips the direction: ${JSON.stringify(command)}`, t.calls.length === 1 && t.calls[0][0] === rpc && st(t.db, U(53)) === final, JSON.stringify(t.calls));
}
{
  const twins = () => [{ id: U(70), name: 'Twin Co', status: 'active' }, { id: U(71), name: 'Twin Co', status: 'archived' }];
  const t1 = await life('restore Twin Co', twins()); check('CONTRACT', 'C7 restore prefers the archived twin', t1.calls.length === 1 && t1.calls[0][1] === U(71), JSON.stringify(t1.calls));
  const t2 = await life('archive Twin Co', twins()); check('CONTRACT', 'C7 archive prefers the active twin', t2.calls.length === 1 && t2.calls[0][1] === U(70), JSON.stringify(t2.calls));
  const t3 = await life('restore it', [{ id: U(60), name: 'Real Co', status: 'archived' }], { restoreCompanyIds: [U(99)] }); check('CONTRACT', 'C7 nonexistent model id: no RPC, could-not-be-found line', t3.calls.length === 0 && /could not be found/.test(t3.report || ''), JSON.stringify(t3.report));
  const t4 = await life('yes', exactDb(), { pendingAction: { kind: 'disambiguation', question: 'Which one?' } }); check('CONTRACT', 'C7 a stale pendingAction alone executes nothing', t4.calls.length === 0, JSON.stringify(t4.calls));
  const db = [{ id: U(80), name: 'Cycle Co', status: 'archived' }]; await life('restore Cycle Co', db); const t5 = await life('restore Cycle Co', db);
  check('CONTRACT', 'C7 second restore is a truthful already_active no-op with no evidence', t5.evidence.filter((e) => e.ok).length === 0 && /was already active/.test(t5.report || ''), JSON.stringify(t5.report));
  for (const [label, rpc, want] of [['rpc error', () => ({ data: null, error: { message: 'boom' } }), /restore failed \(boom\)/], ['denied', () => ({ data: { changed: false, authorized: false, postconditionPassed: false, reason: 'denied' }, error: null }), /do not have permission/], ['postcondition false', () => ({ data: { changed: true, authorized: true, postconditionPassed: false, reason: 'restored' }, error: null }), /did not confirm/]]) {
    const t = await life('restore Beta', exactDb(), {}, rpc);
    check('CONTRACT', `C7 ${label}: no success evidence, report names the outcome`, t.evidence.filter((e) => e.ok).length === 0 && want.test(t.report || ''), JSON.stringify(t.report));
  }
}
// C8 narrative tier + precedence (OTM §2 tier 3 > 4, §3 rule 6).
{
  const now = Date.now(); const iso = (ms) => new Date(now + ms).toISOString();
  const H = (output) => ({ command: 'c', output, created_at: iso(-60000) });
  const h = historyFn([H({ summary: 'Done. Project renamed to Beta.', turnVerdict: { executedOperationCount: 0, attemptedOperationCount: 0, rejectedClaimCount: 0, mutationIntent: { verb: 'rename', field: null }, receiptRendered: false } }), H({ summary: 'ACME was archived in 2025.', turnVerdict: { executedOperationCount: 0, attemptedOperationCount: 0, rejectedClaimCount: 0, mutationIntent: null, receiptRendered: false } }), H({ summary: 'ACME: archived.', turnVerdict: { executedOperationCount: 1, attemptedOperationCount: 1, rejectedClaimCount: 0, mutationIntent: { verb: 'archive', field: 'archiveCompanyIds' }, receiptRendered: false } })], 1);
  check('CONTRACT', 'C8 intent + empty ledger -> UNVERIFIED marker, prose never re-enters', /UNVERIFIED/.test(h[0].summary) && h[0].verified === false, JSON.stringify(h[0]));
  check('CONTRACT', 'C8 read turn: verified null (unknown), prose kept', h[1].verified === null && h[1].summary === 'ACME was archived in 2025.', JSON.stringify(h[1]));
  check('CONTRACT', 'C8 executed turn: verified true', h[2].verified === true, JSON.stringify(h[2]));
  const PA_D = { kind: 'disambiguation', actionType: 'restore', question: 'durable?' }, PA_L = { kind: 'disambiguation', actionType: 'archive', question: 'last-turn?' };
  const durable = (o = {}) => ({ pending_action: PA_D, pending_action_action_type: 'restore', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: iso(600000), ...o });
  const lastTurn = (age) => [{ command: 'c', output: { pendingAction: PA_L }, created_at: iso(-age) }];
  check('CONTRACT', 'C8 valid durable row outranks the stored output', precedenceFn(lastTurn(60000), durable()).pendingAction?.question === 'durable?');
  check('CONTRACT', 'C8 expired durable row yields', precedenceFn(lastTurn(60000), durable({ pending_action_expires_at: iso(-1) })).pendingAction?.question === 'last-turn?');
  check('CONTRACT', 'C8 untyped durable row yields', precedenceFn(lastTurn(60000), durable({ pending_action_action_type: null })).pendingAction?.question === 'last-turn?');
  check('CONTRACT', 'C8 stored pendingAction older than 30 min does not bind', precedenceFn(lastTurn(31 * 60000), null).pendingAction === null);
  check('CONTRACT', 'C8 expired durable + stale stored -> nothing binds', precedenceFn(lastTurn(31 * 60000), durable({ pending_action_expires_at: iso(-1) })).pendingAction === null);
  check('CONTRACT', 'C8 work_orders.output persisted unconditionally after the verdict', /void groundedOutcomeThisTurn;[^\n]*\n\s*await supabase\.from\('work_orders'\)\.update\(\{ output: result \}\)/.test(src) && src.indexOf('result.turnVerdict = {') < src.indexOf("await supabase.from('work_orders').update({ output: result })"));
}
// C9 collection envelopes (OTM §4.3) and postconditions (§4.1).
{
  check('CONTRACT', 'C9 envelope total from the count, truncated = total > shown', JSON.stringify(envelope({ data: [1, 2, 3], count: 40 })) === JSON.stringify({ shown: 3, total: 40, truncated: true }));
  check('CONTRACT', 'C9 envelope without a count: total null, never array length', envelope({ data: [1, 2, 3], count: null }).total === null);
  const capped = [...src.slice(src.indexOf('] = await Promise.all(['), src.indexOf('conversationCountQuery,\n  ]);')).matchAll(/supabase\.from\('(\w+)'\)\.select\(([^)]*)\)[^\n]*\.limit\(\d+\)/g)];
  check('CONTRACT', 'C9 every capped collection query carries count exact (' + capped.length + ')', capped.length >= 20 && capped.every((m) => /count: 'exact'/.test(m[2])));
  const o = turn({ command: 'archive ACME', claims: null, summary: 'x', evidence: [EV('company', 'archive', ACME, false, { executed: true, error: 'postcondition_not_confirmed' }), EV('company', 'archive', ACME, false, { executed: false, error: 'denied' })] });
  check('CONTRACT', 'C9 executedOperationCount counts only postcondition-passed envelopes', o.verdict.executedOperationCount === 0 && o.verdict.attemptedOperationCount === 2 && NO_CHANGE.test(o.summary), JSON.stringify(o.verdict));
  check('CONTRACT', 'C9 the RPC create family is re-read under RLS before recording', /const ok = typeof id === 'string' && seen\.has\(id\);/.test(src));
  const v = turn({ command: 'archive ACME', claims: null, summary: 'ACME archived.' });
  check('CONTRACT', 'C9 turnVerdict.mutationIntent carries the derived request intent (the narrative tier depends on it)', v.intent !== null && JSON.stringify(v.verdict.mutationIntent) === JSON.stringify(v.intent) && v.verdict.receiptRendered === true, JSON.stringify(v.verdict));
  const vr = turn({ command: 'what is ACME?', claims: null, summary: 'ACME is a company.' });
  check('CONTRACT', 'C9 turnVerdict.mutationIntent is null on a read turn', vr.verdict.mutationIntent === null && vr.verdict.receiptRendered === false, JSON.stringify(vr.verdict));
}

// ═════════════════════════════ DEFECT (red on 712760d by design) ═════════════════════════════
// V57-D1 — the model's explicit non-mutation classification (other) must veto the request lexicon exactly as read does:
// a truthful drafting / conversational reply is never replaced by the receipt on text shape alone (OTM §3 rule 2).
for (const [command, summary] of FP_OTHER) {
  const r = turn({ command, summary, requestIntent: RI('other') });
  check('DEFECT', `V57-D1 model requestIntent=other: truthful reply survives: ${JSON.stringify(command)}`, r.summary === summary && r.verdict.receiptRendered === false, 'intent=' + JSON.stringify(r.intent) + ' measured=' + JSON.stringify(r.summary));
}
// V57-D2 — the command fallback must honour the model's entityType: a non-company classification with no field never archives a company.
for (const et of ['task', 'person', 'goal', 'project']) {
  const t = await life('archive Alpha', exactDb(), { requestIntent: RI('mutation', 'archive', et, 'Alpha') });
  check('DEFECT', `V57-D2 requestIntent.entityType=${et} (no field): the exact-named COMPANY Alpha is not archived`, t.calls.length === 0 && st(t.db, A) === 'active', 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
}
// V57-D3 — the imperative-only gate: declaratives, reported speech, deliberation and mid-sentence "not to" never execute
// even when the model emitted nothing at all.
for (const [command, id, status] of [['I said not to archive Alpha', A, 'active'], ['we agreed not to archive Alpha', A, 'active'], ['suppose we restore Beta', B, 'archived'], ['should we restore Beta', B, 'archived'], ['Someone removed Alpha', A, 'active'], ['I already restored Beta', B, 'archived'], ['they ended Alpha', A, 'active'], ['Bob said to archive Alpha', A, 'active'], ['Bob wants us to restore Beta', B, 'archived'], ['thinking about whether to archive Alpha', A, 'active']]) {
  const t = await life(command, exactDb());
  check('DEFECT', `V57-D3 non-imperative shape with the model emitting nothing never executes: ${JSON.stringify(command)}`, t.calls.length === 0 && st(t.db, id) === status, 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
}

// ═════════════════════════════ RESIDUAL (measured, never counted) ═════════════════════════════
{
  const db = []; for (let i = 0; i < 55; i++) db.push({ id: U(100 + i), name: `Filler ${i} Ltd`, status: 'active' }); db.push({ id: U(200), name: 'AB Ltd', status: 'archived' });
  const t = await life('restore AB Ltd', db);
  check('RESIDUAL', 'V57-D4 exact-named archived company resolved when 55 other rows share its anchor word', t.calls.length === 1 && t.calls[0][1] === U(200), 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
  for (const command of ['When you get a moment, please archive ACME', 'archive ACME?', 'get ACME archived', 'let Bob go', 'get rid of task QA-1']) {
    const r = turn({ command, summary: FAB });
    check('RESIDUAL', `V57-D5 lexicon tier alone (model requestIntent absent) derives intent: ${JSON.stringify(command)}`, r.intent !== null, 'intent=null -> the fabrication ships on this phrasing unless the model classifies the request');
  }
  const r = turn({ command: 'don’t archive ACME', summary: 'Understood — I will not archive ACME.' });
  check('RESIDUAL', 'V57-D6 negated request keeps the truthful non-execution reply', r.summary === 'Understood — I will not archive ACME.', 'measured=' + JSON.stringify(r.summary));
  const t2 = await life('archive Alpha and restore Beta', exactDb());
  check('RESIDUAL', 'V57-D6 compound command with the model emitting nothing executes both clauses', t2.calls.length === 2, 'calls=' + JSON.stringify(t2.calls) + ' report=' + JSON.stringify(t2.report));
}

console.log(`\nv57_regression_additions: ${pass} passed, ${fail} failed (CONTRACT failures: ${contractFail}, DEFECT failures: ${defectFail}; residual rows measured: ${residual})`);
process.exit(fail > 0 ? 1 : 0);

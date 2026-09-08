#!/usr/bin/env node
// VERIFIER #56 (campaign #116) — regression additions for candidate e79eb658db6b5298f02977a8ce77719da16d4218
// (index.ts sha256 4f5c85a920b77aa4d7ed9d04b19b16c00f0a78623eb937319f983e140994c01e).
//
// Executes the REAL code sliced out of sem-ai-command/index.ts (the structured-claim / receipt
// window and the company-lifecycle executor window) through the repository's own detyper —
// never a re-implementation. Every row asserts an OUTCOME the Operating Truth Model requires
// (governance/OPERATING_TRUTH_MODEL.md §2-§5, CANONICAL_WORK_CONTRACT.md §1-§2), not an
// implementation shape, so a fix of any shape turns the DEFECT rows green.
//
//   CONTRACT rows must hold on ANY candidate. They also close the coverage gaps found by
//   mutation testing on this candidate (m10 receipt-skips-attempted, m12 silent nonexistent id,
//   m13 no status preference — all survived the committed battery).
//   DEFECT rows reproduce confirmed defects V56-D1..D5 and V56-D3b; each FAILS while the defect
//   is open, so this file is RED on e79eb65 by design and must go GREEN on fixed bytes.
//   ANY failure exits non-zero.
//
// Source resolution: SEM_INDEX_SRC, else walk up from this file (correct from ANY cwd).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) {
  let d = HERE;
  for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const up = dirname(d); if (up === d) break; d = up; }
  return null;
}
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
  else { fail++; if (kind === 'CONTRACT') contractFail++; else defectFail++; console.log(`FAIL  [${kind}] ${name}${detail ? '\n        ' + detail : ''}`); }
};

// ── the REAL structured-claim / receipt window ──────────────────────────────────────────
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
const CTX = { companies: [{ id: ACME, name: 'ACME', status: 'active' }] };
const NAMES = ['ACME', 'Beta', 'Bob', 'Alice', 'Alpha', 'QA-1', 'Beta Corp', 'Sales', 'Polite Co'];
const turn = ({ command, claims = null, summary = '', pendingAction = null, evidence = [], lifecycleReports = [], factLines = [], deterministicPrefix = '', fullyDeterministic = false, labels = {} }) => {
  globalThis.command = command; globalThis.lifecycleReports = lifecycleReports; globalThis.factLines = factLines; globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-v56' };
  globalThis.knownEntityNames = new Set(NAMES.map((n) => n.toLowerCase()));
  return windowFn({ claims: claims === null ? null : JSON.parse(JSON.stringify(claims)), summary, pendingAction: pendingAction ? JSON.parse(JSON.stringify(pendingAction)) : null }, evidence, CTX, 'gpt', false, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mk(labels.runtime));
};
const EV = (rt, action, id, ok = true, extra = {}) => ({ resourceType: rt, action, id, postconditionPassed: ok, request_id: null, channel_id: null, turn: null, action_type: action, entity_type: rt, canonical_entity_ids: [id], requested_values: null, executed: true, rows_affected: ok ? 1 : 0, backend_result: null, precondition: null, postcondition: null, postcondition_verified: ok, error: ok ? null : 'postcondition_not_confirmed', timestamp: 'now', ...extra });
const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
const NO_CHANGE = /No change was made — /;

// ── the REAL company-lifecycle executor window ──────────────────────────────────────────
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
async function life(command, db, result = {}) {
  const sb = client(db); const evidence = [];
  const rec = (rt, action, id, ok) => { if (typeof id === 'string' && id) evidence.push({ rt, action, id, ok }); };
  const out = await runLifecycle(sb, { ...result }, command, { companies: [], archivedCompanies: [] }, rec, ARCHIVE_VERB_PATTERN, RESTORE_VERB_PATTERN);
  return { ...out, calls: sb.calls, evidence, db };
}
const st = (db, id) => db.find((r) => r.id === id).status;

// ════════════════════════════ CONTRACT ════════════════════════════
// C1 never-silent receipt on head-verb mutation intent × claim shapes × pendingAction (OTM §3 rule 3).
const HEAD = [
  ['Rename project Alpha to Beta', 'Done. Project renamed to Beta. What next?', /renamed to Beta|^Done\./i],
  ['archive company ACME', 'ACME has been archived. Should I also archive its projects?', /has been archived/i],
  ['approve approval 123', 'The approval has been approved.', /has been approved/i],
  ['delete task QA-1', 'Task QA-1 deleted.', /QA-1 deleted/i],
  ['assign task QA-1 to Bob', 'Assigned. Bob now owns QA-1.', /Bob now owns|^Assigned\./i],
  ['set the manager of Alice to Bob', 'Alice now reports to Bob.', /now reports to/i],
  ['restore company Beta', 'Beta has been restored.', /has been restored/i],
  ['yes', 'Confirmed. Executing the plan to reassign CLIX GPS to SEM LLC.', /Executing the plan/i],
  ['option 2', 'Restored ACME.', /Restored ACME/i],
];
for (const [command, summary, leak] of HEAD) {
  for (const [label, claims] of [['null', null], ['[]', []], ['state-only', [{ type: 'existence', resourceType: 'company', resourceId: ACME }]]]) {
    const r = turn({ command, summary, claims });
    check('CONTRACT', `C1 receipt, no success wording: ${JSON.stringify(command)} [claims:${label}]`, NO_CHANGE.test(r.summary) && !leak.test(r.summary) && r.verdict.executedOperationCount === 0 && r.verdict.receiptRendered === true, 'measured=' + JSON.stringify(r.summary));
  }
  const rp = turn({ command, summary: summary + ' Should I continue?', pendingAction: { kind: 'open_question', question: 'Should I continue?' } });
  check('CONTRACT', `C1 pendingAction never exempts: ${JSON.stringify(command)}`, NO_CHANGE.test(rp.summary) && !leak.test(rp.summary) && /Should I continue\?/.test(rp.summary), 'measured=' + JSON.stringify(rp.summary));
}
// C2 plain read requests survive VERBATIM (OTM §3 rule 2: no rewrite on text shape alone).
const READS = [
  ['what did we do earlier in this channel?', 'Earlier in this channel I archived ACME and restored Beta. Anything else you need?'],
  ['is ACME archived?', 'ACME is archived. Should I restore it?'],
  ['summarize the history of this channel', 'Turn 1: ACME was archived. Turn 2: Beta was restored. Turn 3: QA-1 was assigned to Bob.'],
  ['what happened to Beta?', 'Beta was archived on 2026-08-30 and restored on 2026-09-01. It is active now.'],
  ['show me the archived companies', 'Archived companies: ACME (archived 2026-08-30), Gamma (archived 2026-07-01).'],
  ['what is the exact current title of project Alpha as stored in the database?', 'The exact current title in the database is "Alpha" — an earlier message said it was renamed, but the current data shows "Alpha".'],
  ['who reports to Bob?', 'Alice and Carol report to Bob. Carol was assigned to him when she was hired.'],
  ['how many companies do we have?', 'You have 12 companies (10 active, 2 archived).'],
  ['describe the project Alpha', 'Project Alpha: created 2026-06-01, renamed once, currently paused.'],
  ['tell me about ACME', 'ACME was created in 2024, archived in 2025 and restored this year.'],
];
for (const [command, summary] of READS) {
  const r = turn({ command, summary, pendingAction: /\?$/.test(summary) ? { kind: 'open_question', question: summary.split(/(?<=\.)\s/).pop() } : null });
  check('CONTRACT', `C2 read survives verbatim: ${JSON.stringify(command)}`, r.summary === summary && r.intent === null && r.verdict.receiptRendered === false, 'intent=' + JSON.stringify(r.intent) + ' measured=' + JSON.stringify(r.summary));
}
// C3 a VERIFIED envelope on the claimed id renders the truthful claim; unverified / denied never do (OTM §4.1).
const ID = '11111111-1111-1111-1111-111111111111';
for (const [command, rt, action, label, want] of [
  ['archive company ACME', 'company', 'archive', 'ACME', /ACME.*archiv/i],
  ['delete task QA-1', 'task', 'delete', 'QA-1', /QA-1.*delet/i],
  ['restore goal G1', 'goal', 'restore', 'G1', /G1.*restor/i],
  ['create a task Fix login', 'task', 'create', 'Fix login', /Fix login.*creat/i],
  ['create department Sales', 'department', 'create', 'Sales', /Sales.*creat/i],
]) {
  const labels = ['company', 'task', 'person', 'goal'].includes(rt) ? { [rt]: { [ID]: label } } : { runtime: { [rt + '|' + ID]: label } };
  const rv = turn({ command, claims: [M(rt, ID, action)], evidence: [EV(rt, action, ID)], summary: 'fabricated wording', labels });
  check('CONTRACT', `C3 verified ${rt}/${action} renders the truthful claim`, !NO_CHANGE.test(rv.summary) && want.test(rv.summary) && rv.verdict.executedOperationCount === 1, 'measured=' + JSON.stringify(rv.summary));
  const ru = turn({ command, claims: [M(rt, ID, action)], evidence: [EV(rt, action, ID, false)], summary: label + ' ' + action + 'd.', labels });
  check('CONTRACT', `C3 executed-but-UNVERIFIED ${rt}/${action} never supports the claim`, ru.verdict.executedOperationCount === 0 && !/— confirmed\./.test(ru.summary) && /can.t confirm|No change was made/i.test(ru.summary), 'measured=' + JSON.stringify(ru.summary));
  const rd = turn({ command, claims: null, evidence: [EV(rt, action, ID, false, { executed: false, error: 'denied', rows_affected: 0 })], summary: label + ' ' + action + 'd.', labels });
  check('CONTRACT', `C3 DENIED ${rt}/${action} with claims:null -> receipt names the failure (kills mutant m10)`, NO_CHANGE.test(rd.summary) && /denied/.test(rd.summary) && rd.verdict.executedOperationCount === 0, 'measured=' + JSON.stringify(rd.summary));
}
// C4 intent is derived from the request, never from the reply.
for (const c of ['archive ACME', 'what is ACME?']) {
  const a = turn({ command: c, summary: 'ACME archived.' }).intent;
  const b = turn({ command: c, summary: 'Nothing happened. Shall I?', pendingAction: { kind: 'open_question', question: 'Shall I?' } }).intent;
  const d = turn({ command: c, summary: 'ACME will be archived tomorrow.' }).intent;
  check('CONTRACT', `C4 intent depends on the command only: ${JSON.stringify(c)}`, JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(d), JSON.stringify([a, b, d]));
}
// C5 with a lifecycle report present (production shape: index.ts overwrites result.summary with the report before this window) the report is the summary; no receipt, no fabrication.
{
  const report = 'Nowhere Inc: no company by that name (searched the active and archived companies you can access) — nothing was restored.';
  const r = turn({ command: 'restore company Nowhere Inc', summary: report, lifecycleReports: [report], fullyDeterministic: true, deterministicPrefix: report });
  check('CONTRACT', 'C5 lifecycle report is the summary; no receipt doubles it', r.summary === report && r.verdict.receiptRendered === false, 'measured=' + JSON.stringify(r.summary));
}
// C6 lifecycle executor: fresh-channel restore by name; nonexistent model id is never silent (kills m12); status preference on twins (kills m13); idempotent no-op.
{
  const db = [{ id: U(1), name: 'QA-SWARM-TEST-CO-VIA-CHAT', status: 'archived' }, { id: U(2), name: 'Acme Holdings', status: 'active' }];
  const t = await life('restore QA-SWARM-TEST-CO-VIA-CHAT', db);
  check('CONTRACT', 'C6 fresh channel: target outside the window restored by name', t.calls.length === 1 && t.calls[0][1] === U(1) && st(t.db, U(1)) === 'active' && /restored\./.test(t.report || ''), JSON.stringify(t.calls));
  const t2 = await life('restore it', [{ id: U(3), name: 'Real Co', status: 'archived' }], { restoreCompanyIds: [U(99)] });
  check('CONTRACT', 'C6 nonexistent model id: no RPC, the report says it could not be found (kills mutant m12)', t2.calls.length === 0 && /could not be found/.test(t2.report || '') && /nothing was restored/.test(t2.report || ''), JSON.stringify(t2.report));
  const t3 = await life('restore Twin Co', [{ id: U(4), name: 'Twin Co', status: 'active' }, { id: U(5), name: 'Twin Co', status: 'archived' }]);
  check('CONTRACT', 'C6 restore prefers the ARCHIVED twin (kills mutant m13)', t3.calls.length === 1 && t3.calls[0][1] === U(5), JSON.stringify(t3.calls));
  const t4 = await life('archive Twin Co', [{ id: U(4), name: 'Twin Co', status: 'active' }, { id: U(5), name: 'Twin Co', status: 'archived' }]);
  check('CONTRACT', 'C6 archive prefers the ACTIVE twin', t4.calls.length === 1 && t4.calls[0][1] === U(4), JSON.stringify(t4.calls));
  const db5 = [{ id: U(6), name: 'Cycle Co', status: 'archived' }];
  await life('restore Cycle Co', db5); const t5 = await life('restore Cycle Co', db5);
  check('CONTRACT', 'C6 second restore is a truthful already_active no-op with no evidence', t5.evidence.filter((e) => e.ok).length === 0 && /was already active/.test(t5.report || ''), JSON.stringify(t5.report));
  const t6 = await life('restore Nomad', [{ id: U(7), name: 'Nomad Foods', status: 'archived' }, { id: U(8), name: 'Nomad Logistics', status: 'archived' }]);
  check('CONTRACT', 'C6 genuine ambiguity arms a disambiguation and executes nothing', t6.calls.length === 0 && t6.pendingAction?.kind === 'disambiguation' && t6.pendingAction.options.length === 2, JSON.stringify(t6.pendingAction));
  const t7 = await life('delete task QA-1', [{ id: U(9), name: 'QA-1 Fixture Co', status: 'active' }], { deleteTaskIds: [U(20)] });
  check('CONTRACT', 'C6 a task delete command produces no company line and no company RPC', t7.calls.length === 0 && t7.report === null, JSON.stringify(t7.report));
}

// ════════════════════════════ DEFECT (red on e79eb65 by design) ════════════════════════════
// D1 — request intent FALSE NEGATIVES: a real mutation request in ordinary phrasing derives no
// intent; with claims:null and no model action field the fabricated completion ships VERBATIM
// (OTM §3 rules 1 and 3; deployed v92 corrected the same prose). Outcome asserted: the
// fabrication must not ship and no success wording may survive.
const FAB = 'Done — that has been archived and updated as requested.';
for (const command of [
  'Could you please archive ACME', 'Let’s archive ACME', 'Go ahead and archive ACME', 'I need ACME archived', 'Kindly archive ACME',
  'can you please rename project Alpha to Beta', 'Would you mind renaming project Alpha to Beta?', 'Mark task QA-1 as done', 'close task QA-1', 'cancel the approval 123',
  'yes, archive it', 'Yes — do it', 'option two', 'the second option', 'fire Bob', 'terminate Bob', 'Polite Co needs to be restored', 'assign QA-1 to Bob', 'create ACME Robotics',
  'ACME-г архивла', 'Beta компанийг сэргээ', 'ACME компанийг архивлаад Beta-г сэргээ',
]) {
  const r = turn({ command, summary: FAB });
  check('DEFECT', `V56-D1 mutation request must not ship the fabrication: ${JSON.stringify(command)}`, r.summary !== FAB && !/has been archived and updated/i.test(r.summary), 'intent=' + JSON.stringify(r.intent) + ' measured=' + JSON.stringify(r.summary));
}
// D2 — request intent FALSE POSITIVES: a read request whose head word is a listed verb followed
// by any entity noun derives intent, and the truthful read answer is REPLACED by the receipt.
const TRUE_READ = 'ACME was archived in 2025 and restored this year; Alice was reassigned to Beta Corp last month.';
for (const command of [
  'make a list of all companies', 'update me on the project status', 'create a report of archived companies', 'set out the plan for the project Alpha',
  'add up the hours logged on the tasks this week', 'end date of the project Alpha?', 'restore my memory: who is Bob?', 'move on — what’s next for the project?',
  'make a summary of the company relationships', 'assign a number to each company and list them',
]) {
  const r = turn({ command, summary: TRUE_READ });
  check('DEFECT', `V56-D2 truthful read answer survives: ${JSON.stringify(command)}`, r.summary === TRUE_READ, 'intent=' + JSON.stringify(r.intent) + ' measured=' + JSON.stringify(r.summary));
}
// D3 — command-name fallback archives an UNRELATED company when the command targets a task /
// person / goal (model resolved the command to another entity type, or to nothing).
for (const [command, result, companyName] of [
  ['delete Alpha', { deleteTaskIds: [U(20)] }, 'Alpha Holdings'],
  ['remove Bob', { endEmploymentPersonIds: [U(21)] }, 'Bobcat Machinery'],
  ['remove Bob Smith', { endEmploymentPersonIds: [U(22)] }, 'Bob Smith Consulting'],
  ['archive Q3 revenue', { archiveGoalIds: [U(23)] }, 'Q3 Revenue Partners'],
  ['archive the task Alpha', { archiveTaskIds: [U(24)] }, 'Alpha Task Force'],
]) {
  const db = [{ id: U(10), name: companyName, status: 'active' }, { id: U(11), name: 'Unrelated Co', status: 'active' }];
  const t = await life(command, db, result);
  check('DEFECT', `V56-D3 non-company target never mutates a company: ${JSON.stringify(command)} / ${JSON.stringify(companyName)}`, t.calls.length === 0 && st(t.db, U(10)) === 'active', 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
}
// D3b — a NON-IMPERATIVE sentence (question, negative instruction, explanation request) that
// merely contains an archive/restore-family word executes the lifecycle RPC (CANONICAL_WORK_CONTRACT §1:
// intent is what the caller ASKED for).
for (const [command, name, status] of [
  ['do not archive Alpha', 'Alpha Holdings', 'active'], ['never delete Alpha', 'Alpha Holdings', 'active'], ['I decided not to archive Alpha', 'Alpha Holdings', 'active'],
  ['did you archive Alpha?', 'Alpha Holdings', 'active'], ['is it safe to delete Alpha?', 'Alpha Holdings', 'active'], ['explain how to archive Alpha', 'Alpha Holdings', 'active'],
  ['before we archive Alpha, list its tasks', 'Alpha Holdings', 'active'], ['should I restore Beta?', 'Beta Corp', 'archived'], ['how do I restore Beta', 'Beta Corp', 'archived'],
  ['when did we end Bob', 'Bob Trucking', 'active'],
]) {
  const db = [{ id: U(12), name, status }, { id: U(13), name: 'Unrelated Co', status: 'active' }];
  const t = await life(command, db);
  check('DEFECT', `V56-D3b non-imperative sentence executes nothing: ${JSON.stringify(command)}`, t.calls.length === 0 && st(t.db, U(12)) === status, 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report) + ' final=' + st(t.db, U(12)));
}
// D4 — a restore-family word INSIDE a company name turns an archive into a restore.
{
  const db = [{ id: U(14), name: 'Restored Furniture Co', status: 'active' }];
  const t = await life('archive Restored Furniture Co', db, { archiveCompanyIds: [U(14)] });
  check('DEFECT', 'V56-D4 "archive Restored Furniture Co" (model id) ends ARCHIVED with no restore RPC', st(t.db, U(14)) === 'archived' && !t.calls.some((c) => c[0] === 'restore_company'), 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report) + ' final=' + st(t.db, U(14)));
  const db2 = [{ id: U(14), name: 'Restored Furniture Co', status: 'active' }];
  const t2 = await life('archive Restored Furniture Co', db2);
  check('DEFECT', 'V56-D4 "archive Restored Furniture Co" (name only) ends ARCHIVED', st(t2.db, U(14)) === 'archived' && !t2.calls.some((c) => c[0] === 'restore_company'), 'calls=' + JSON.stringify(t2.calls) + ' report=' + JSON.stringify(t2.report));
  const db3 = [{ id: U(15), name: 'Reactivate Solutions', status: 'active' }];
  const t3 = await life('archive Reactivate Solutions', db3, { archiveCompanyIds: [U(15)] });
  check('DEFECT', 'V56-D4 "archive Reactivate Solutions" (model id) ends ARCHIVED', st(t3.db, U(15)) === 'archived' && !t3.calls.some((c) => c[0] === 'restore_company'), 'calls=' + JSON.stringify(t3.calls) + ' final=' + st(t3.db, U(15)));
}
// D5 — punctuated company names are refused as "no company by that name" (OTM §5: restore of a known entity refused).
for (const name of ['Acme (Mongolia) LLC', 'A_B Holdings', '100% Natural Foods', 'Acme, Inc.']) {
  const db = [{ id: U(16), name, status: 'archived' }, { id: U(17), name: 'Other Co', status: 'active' }];
  const t = await life('restore ' + name, db);
  check('DEFECT', `V56-D5 punctuated name via command restores: ${JSON.stringify(name)}`, t.calls.length === 1 && t.calls[0][1] === U(16) && st(t.db, U(16)) === 'active', 'calls=' + JSON.stringify(t.calls) + ' report=' + JSON.stringify(t.report));
  const db2 = [{ id: U(16), name, status: 'archived' }, { id: U(17), name: 'Other Co', status: 'active' }];
  const t2 = await life('restore it', db2, { restoreCompanyNames: [name] });
  check('DEFECT', `V56-D5 punctuated name via restoreCompanyNames restores: ${JSON.stringify(name)}`, t2.calls.length === 1 && t2.calls[0][1] === U(16), 'calls=' + JSON.stringify(t2.calls) + ' report=' + JSON.stringify(t2.report));
}

console.log(`\nv56_regression_additions: ${pass} passed, ${fail} failed (CONTRACT failures: ${contractFail}, DEFECT failures: ${defectFail})`);
process.exit(fail > 0 ? 1 : 0);

// VERIFIER #59 — own harness. Executes REAL windows sliced from sem-ai-command/index.ts through the
// repository's detyper (qa/scenarios-runner/_gate_extract.mjs). Never a re-implementation. Every window is
// anchored on production markers and asserted to contain the constructs it must contain, so a source change
// that moves a window makes the harness THROW rather than pass on a different block.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../../..');
export const SRC = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const { stripTS, withPatternsAboveWindow } = await import(pathToFileURL(resolve(ROOT, 'qa/scenarios-runner/_gate_extract.mjs')).href);
export const RAW = readFileSync(SRC, 'utf8');
export const src = RAW.replace(/\r\n/g, '\n');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export function slice(startMarker, endMarker, inclusive = true, from = 0) {
  const s = src.indexOf(startMarker, from); if (s === -1) throw new Error('start marker not found: ' + startMarker);
  const e = src.indexOf(endMarker, s + startMarker.length); if (e === -1) throw new Error('end marker not found: ' + endMarker);
  return src.slice(s, inclusive ? e + endMarker.length : e);
}
function must(raw, needles, label) { for (const n of needles) if (!raw.includes(n)) throw new Error(label + ' window does not contain ' + JSON.stringify(n)); }
// type predicates `(id): id is string =>` and generic constructors `new Map<string,string>(` are the two TS
// shapes the repo detyper leaves behind in these windows.
export const depred = (js) => js.replace(/\((\w+)\): \1 is [\w<>\[\], |]+ =>/g, '($1) =>').replace(/new (Map|Set)<[^>()]*>\(/g, 'new $1(');

// ---------- W1: STRUCTURED-CLAIM VERIFICATION → verifiedResponse (intent + belt + receipt) ----------
const STRUCT_RAW = (() => {
  const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found');
  const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found');
  const raw = src.slice(start, src.indexOf('};', anchor) + 2);
  must(raw, ['const requestedIntent', 'No change was made — ', 'const legacyProseFallback', 'const unaccountedCompletionProse', 'result.turnVerdict = {', 'const MUTATION_VERB_ALWAYS', 'const CONFIRMATION_COMMAND', 'const readsAsCompletion', 'const READ_SHAPE', 'const POLITE_REQUEST', 'const receiptExempt', 'let receiptRendered', 'const rewriteFromStructure'], 'W1');
  return raw;
})();
export const STRUCT_JS = withPatternsAboveWindow(src, stripTS(STRUCT_RAW));
export const STRUCT_PARAMS = ['result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels'];
const structFn = new Function(...STRUCT_PARAMS,
  STRUCT_JS + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, pendingAction: result.pendingAction, verdict: result.turnVerdict, intent: requestedIntent, legacy: legacyProseFallback, unaccounted: unaccountedCompletionProse, rewrite: rewriteFromStructure, lexiconVerb, readShaped, modelIntentKind, receiptRendered, belt: readsAsCompletion, executedVerifiedCount, hasMutationShapedClaim, hasRejectedClaims };');
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
export const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
export const ID = '11111111-1111-1111-1111-111111111111';
export const ID2 = '22222222-2222-2222-2222-222222222222';
export const CTX = { companies: [{ id: ACME, name: 'ACME', status: 'active' }] };
/** Run the real structured window for one turn. Globals mirror what production declares ABOVE the window. */
export function turn({ command, claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = CTX, model = 'gpt-4.1-mini', grounded = false, futureNoPlan = false, labels = {}, deterministicPrefix = '', lifecycleReports = [], factLines = [], names = [], fullyDeterministic = false, orgGraph = null, requestIntent, extra = {} }) {
  globalThis.command = command; globalThis.lifecycleReports = lifecycleReports; globalThis.factLines = factLines; globalThis.organizationGraphCheck = orgGraph; globalThis.workOrder = { id: 'wo-v59' };
  globalThis.knownEntityNames = new Set(names.map((n) => String(n).trim().toLowerCase()));
  const result = { claims: claims === null ? null : JSON.parse(JSON.stringify(claims)), summary, pendingAction: pendingAction ? JSON.parse(JSON.stringify(pendingAction)) : null, questions, proposedActions, ...extra };
  if (requestIntent !== undefined) result.requestIntent = requestIntent;
  const out = structFn(result, evidence, context, model, grounded, futureNoPlan, DENO, mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mk(labels.runtime));
  out.input = summary; out.beltOnInput = out.belt(String(summary || ''));
  return out;
}
export const EV = (rt, action, id, ok = true, extra = {}) => ({ resourceType: rt, action, id, postconditionPassed: ok, request_id: null, channel_id: null, turn: null, action_type: action, entity_type: rt, canonical_entity_ids: [id], requested_values: null, executed: true, rows_affected: ok ? 1 : 0, backend_result: null, precondition: null, postcondition: null, postcondition_verified: ok, error: ok ? null : 'postcondition_not_confirmed', timestamp: 'now', ...extra });
export const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
export const S = (rt, id, predicate = 'status', expectedValue = 'active') => ({ type: 'current_state', resourceType: rt, resourceId: id, predicate, expectedValue });
export const H = (rt, id, action) => ({ type: 'historical_event', resourceType: rt, resourceId: id, action, temporalScope: 'prior_turn' });
export const RI = (kind, action = null, entityType = null, targetName = null) => ({ kind, action, entityType, targetName });
export const NO_CHANGE = /No change was made — /;
// Success wording of a FABRICATION that must never ship on a mutation-intent turn.
export const SUCCESS_WORDS = /\b(?:has been|have been|was|were|is now|are now|successfully|done|✅)\b[^.]{0,40}\b(?:renamed|approved|deleted|archived|assigned|restored|updated|created|moved|reassigned|set|ended|removed|completed|closed|changed|reports to)\b|\b(?:renamed|approved|deleted|archived|assigned|restored|updated|created|moved|reassigned|removed|completed|closed)\s+(?:successfully|✅)|^\s*(?:done|completed|finished|all set)\b|\bnow (?:reports to|owns|belongs to|manages)\b/i;

// ---------- W2: company-lifecycle executor (resolver + RPC loops + disambiguation) ----------
const LIFE_RAW = slice('const COMPANY_UUID_RE = /^[0-9a-f]{8}-', "const archiveRestoreReport = archiveRestoreLines.length > 0 ? archiveRestoreLines.join(' ') : null;");
must(LIFE_RAW, ['async function resolveCompanyLifecycleTargets', "supabase.rpc('archive_company'", "supabase.rpc('restore_company'", 'const commandFallbackAllowed', 'const headLifecycleAction', 'lifecycleDisambiguation.length > 0', 'const IMPERATIVE_HEAD_RE', 'const commandImperativePosition'], 'W2');
export const LIFE_JS = stripTS(LIFE_RAW);
export const ARCHIVE_VERB_PATTERN = new Function('return ' + src.match(/const ARCHIVE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
export const RESTORE_VERB_PATTERN = new Function('return ' + src.match(/const RESTORE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
export const LIFE_PARAMS = ['supabase', 'result', 'command', 'contextPack', 'recordExecution', 'ARCHIVE_VERB_PATTERN', 'RESTORE_VERB_PATTERN'];
const lifeFn = new AsyncFunction(...LIFE_PARAMS,
  LIFE_JS + '\n; return { archiveCompanyIds, restoreCompanyIds, report: archiveRestoreReport, pendingAction: result.pendingAction, disambiguation: lifecycleDisambiguation, unresolved: lifecycleUnresolvedLines, commandFallbackAllowed, commandImperativePosition, headLifecycleAction, commandIsQuestion, commandNegatedLead, commandReadLead };');
/** PostgREST-faithful-enough stub: ilike with % and _ wildcards (case-insensitive), in(), eq(), limit in row order. */
export function client(companies, rpcBehaviour) {
  const calls = []; const queries = [];
  const table = (rows) => {
    const q = { _rows: rows, _filters: [], _limit: null };
    q.select = () => q;
    q.in = (col, vals) => { queries.push(['in', col, vals]); q._filters.push((r) => vals.includes(r[col])); return q; };
    q.eq = (col, v) => { q._filters.push((r) => r[col] === v); return q; };
    q.ilike = (col, pat) => { queries.push(['ilike', col, pat]); const re = new RegExp('^' + pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '[\\s\\S]*').replace(/_/g, '.') + '$', 'i'); q._filters.push((r) => re.test(String(r[col]))); return q; };
    q.limit = (n) => { q._limit = n; return q; };
    q.then = (res, rej) => { let out = q._rows.filter((r) => q._filters.every((f) => f(r))); if (q._limit) out = out.slice(0, q._limit); return Promise.resolve({ data: out, error: null }).then(res, rej); };
    return q;
  };
  return { calls, queries, from: (name) => { if (name !== 'companies') throw new Error('unexpected table ' + name); return table(companies); },
    rpc: async (name, args) => { calls.push([name, args.p_company_id]); return (rpcBehaviour || realRpc)(name, args.p_company_id, companies); } };
}
export const realRpc = (name, id, rows) => {
  const row = rows.find((r) => r.id === id);
  if (!row) return { data: { changed: false, authorized: true, postconditionPassed: false, reason: 'not_found' }, error: null };
  if (name === 'restore_company') { if (row.status !== 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_active' }, error: null }; row.status = 'active'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'restored', previousStatus: 'archived', newStatus: 'active' }, error: null }; }
  if (name === 'archive_company') { if (row.status === 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_archived' }, error: null }; row.status = 'archived'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'archived', previousStatus: 'active', newStatus: 'archived' }, error: null }; }
  throw new Error('unexpected rpc ' + name);
};
export const U = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
export async function life(command, db, result = {}, opts = {}) {
  const sb = client(db, opts.rpc); const evidence = [];
  const rec = (rt, action, id, ok, detail) => { if (typeof id === 'string' && id) evidence.push({ rt, action, id, ok, detail: detail || null }); };
  const out = await lifeFn(sb, { ...result }, command, { companies: [], archivedCompanies: [], ...(opts.pack || {}) }, rec, ARCHIVE_VERB_PATTERN, RESTORE_VERB_PATTERN);
  return { ...out, calls: sb.calls, queries: sb.queries, evidence, db };
}
export const st = (db, id) => (db.find((r) => r.id === id) || {}).status;

// ---------- W3: task-lifecycle slice (recordExecution is declared inside it) ----------
const TASK_RAW = slice("        const contextTaskIds = new Set((contextPack?.tasks || []).map((t: any) => t.id));", "const taskArchiveRestoreReport = taskArchiveRestoreLines.length > 0 ? taskArchiveRestoreLines.join(' ') : null;");
must(TASK_RAW, ["supabase.from('tasks').select('id,title,status').in('id', requestedTaskLifecycleIds)", "supabase.rpc('archive_task'", "supabase.rpc('restore_task'", 'const recordExecution = ', 'taskLifecycleById.has(id)', 'could not be found (searched the active and archived tasks you can access)'], 'W3');
export const TASK_JS = depred(stripTS(TASK_RAW));
const taskFn = new AsyncFunction('supabase', 'result', 'contextPack', 'planExecutedActions', 'channelId', TASK_JS + '\n; return { archiveTaskIds, restoreTaskIds, deleteTaskIds, pendingDeleteTaskIds, report: taskArchiveRestoreReport, evidence: claimExecutionEvidence, requestedTaskLifecycleIds };');
// ---------- W4: goal-lifecycle slice (needs recordExecution, LIFECYCLE_UUID_RE, lifecycleReasonText, contextCompanyIds from above) ----------
const GOAL_RAW = slice("        const contextGoalIds = new Set((contextPack?.goals || []).map((g: any) => g.id));", "const goalArchiveRestoreReport = goalArchiveRestoreLines.length > 0 ? goalArchiveRestoreLines.join(' ') : null;");
must(GOAL_RAW, ["supabase.from('goals').select('id,title,status').in('id', requestedGoalLifecycleIds)", "supabase.rpc('archive_goal'", "supabase.rpc('restore_goal'", 'goalLifecycleById.has(id)', 'could not be found (searched the active and archived goals you can access)'], 'W4');
export const GOAL_JS = depred(stripTS(GOAL_RAW));
const LIFECYCLE_UUID_RE_SRC = src.match(/const LIFECYCLE_UUID_RE = (\/[^\n]*\/i);/)[1];
const REASON_TEXT_SRC = slice('const lifecycleReasonText: Record<string, string> = {', '};');
const goalFn = new AsyncFunction('supabase', 'result', 'contextPack', 'recordExecution',
  'const LIFECYCLE_UUID_RE = ' + LIFECYCLE_UUID_RE_SRC + ';\n' + stripTS(REASON_TEXT_SRC) + '\n' + GOAL_JS + '\n; return { archiveGoalIds, restoreGoalIds, report: goalArchiveRestoreReport, requestedGoalLifecycleIds };');
/** stub for tasks/goals tables and their RPCs; rows: { tasks: [...], goals: [...] } */
export function tgClient(rows, opts = {}) {
  const calls = []; const queries = [];
  const table = (tbl) => { const q = { _f: [] }; q.select = () => q; q.in = (c, v) => { queries.push([tbl, 'in', c, v]); q._f.push((r) => v.includes(r[c])); return q; }; q.eq = (c, v) => { q._f.push((r) => r[c] === v); return q; }; q.then = (res, rej) => Promise.resolve({ data: (rows[tbl] || []).filter((r) => q._f.every((f) => f(r))).filter((r) => !(opts.hidden || []).includes(r.id)), error: null }).then(res, rej); return q; };
  const rpc = async (name, args) => {
    const id = args.p_task_id ?? args.p_goal_id; calls.push([name, id]);
    if (opts.rpc) return opts.rpc(name, id, rows);
    const tbl = /task/.test(name) ? 'tasks' : 'goals';
    const row = (rows[tbl] || []).find((r) => r.id === id);
    if (!row || (opts.hidden || []).includes(id)) return { data: { changed: false, postconditionPassed: false, reason: 'not_found' }, error: null };
    if (/restore/.test(name)) { if (row.status !== 'archived') return { data: { changed: false, postconditionPassed: true, reason: 'already_active' }, error: null }; row.status = row.prior || 'queued'; return { data: { changed: true, postconditionPassed: true, reason: 'restored', newStatus: row.status }, error: null }; }
    if (row.status === 'archived') return { data: { changed: false, postconditionPassed: true, reason: 'already_archived' }, error: null };
    row.prior = row.status; row.status = 'archived'; return { data: { changed: true, postconditionPassed: true, reason: 'archived' }, error: null };
  };
  return { calls, queries, from: (t) => table(t), rpc };
}
export async function taskTurn(result, rows, pack = { tasks: [], currentTurn: { turn: 3 } }, opts = {}) {
  const sb = tgClient(rows, opts); const out = await taskFn(sb, { ...result }, pack, opts.plan || null, 'ch-1'); return { ...out, calls: sb.calls, queries: sb.queries, rows };
}
export async function goalTurn(result, rows, pack = { goals: [] }, opts = {}) {
  const sb = tgClient(rows, opts); const evidence = []; const rec = (rt, action, id, ok, detail) => { if (typeof id === 'string' && id) evidence.push({ rt, action, id, ok, detail: detail || null }); };
  const out = await goalFn(sb, { ...result }, pack, rec); return { ...out, calls: sb.calls, queries: sb.queries, evidence, rows };
}

// ---------- W5: narrative-tier history mapping + pendingAction precedence ----------
const HIST_RAW = slice('const conversationHistory = (conversationRowsChronological || []).map(', '  const continuity = {', false);
must(HIST_RAW, ['[UNVERIFIED — no database change was executed on that turn]', 'receiptRendered'], 'W5');
export const historyFn = new Function('conversationRowsChronological', 'historyWindowStart', stripTS(HIST_RAW) + '\n; return conversationHistory;');
const PREC_RAW = slice('const lastTurnRow = conversationRowsChronological?.[conversationRowsChronological.length - 1];', '  const recentlyResolvedEntities', false);
must(PREC_RAW, ['durablePendingActionValid', 'pending_action_expires_at', '30 * 60 * 1000'], 'W5b');
export const precedenceFn = new Function('conversationRowsChronological', 'durableChannelState', stripTS(PREC_RAW) + '\n; return { pendingAction, lastTurnPendingFresh, durablePendingActionValid, lastTurnOutput };');

// ---------- W6: the collection envelope helper ----------
const ENV_RAW = slice('const envelope = (res: any, shownOverride', '  };', true);
export const envelopeFn = new Function(stripTS(ENV_RAW) + '\n; return envelope;')();

export function tally(label, rows) { let pass = 0; const fails = []; for (const r of rows) { if (r.ok) pass++; else fails.push(r); } console.log(`\n${label}: ${pass} passed, ${fails.length} failed`); for (const f of fails.slice(0, 60)) console.log('  FAIL ' + (f.name || JSON.stringify(f)).slice(0, 300) + (f.detail ? '\n       ' + String(f.detail).slice(0, 400) : '')); return { pass, fails }; }

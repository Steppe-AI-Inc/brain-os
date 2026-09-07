// VERIFIER #57 — shared harness: the REAL windows sliced out of sem-ai-command/index.ts through the
// repository's own detyper (qa/scenarios-runner/_gate_extract.mjs). Never a re-implementation.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripTS, withPatternsAboveWindow } from '../../../scenarios-runner/_gate_extract.mjs';

export const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
export const SRC = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
export const RAW = readFileSync(SRC, 'utf8');
export const src = RAW.replace(/\r\n/g, '\n');

// ---- the REAL structured-claim / intent / receipt window ------------------------------------
function extractStructuredBlock(source) {
  const start = source.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found');
  const anchor = source.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found');
  const end = source.indexOf('};', anchor) + 2;
  const raw = source.slice(start, end);
  for (const must of ['const requestedIntent', 'No change was made — ', 'const legacyProseFallback', 'const unaccountedCompletionProse', 'result.turnVerdict = {', 'const MUTATION_VERB_ALWAYS', 'const CONFIRMATION_COMMAND', 'const readsAsCompletion', 'const READ_SHAPE', 'const POLITE_REQUEST']) {
    if (!raw.includes(must)) throw new Error('window does not contain ' + must + ' — not the production window');
  }
  return withPatternsAboveWindow(source, stripTS(raw));
}
const windowFn = new Function(
  'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  extractStructuredBlock(RAW) + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, pendingAction: result.pendingAction, verdict: result.turnVerdict, intent: requestedIntent, legacy: legacyProseFallback, unaccounted: unaccountedCompletionProse, rewrite: rewriteFromStructure, belt: readsAsCompletion(String(result.summary || "")), lexiconVerb, readShaped, modelIntentKind };'
);
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
export const ID = '11111111-1111-1111-1111-111111111111';
export const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
export const CTX = { companies: [{ id: ACME, name: 'ACME', status: 'active' }] };
export const run = ({ command, claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = CTX, model = 'gpt', grounded = false, labels = {}, deterministicPrefix = '', lifecycleReports = [], factLines = [], names = [], fullyDeterministic = false, orgGraph = null, requestIntent, extra = {} }) => {
  globalThis.command = command; globalThis.lifecycleReports = lifecycleReports; globalThis.factLines = factLines; globalThis.organizationGraphCheck = orgGraph; globalThis.workOrder = { id: 'wo-v57' };
  globalThis.knownEntityNames = new Set(names.map((n) => String(n).trim().toLowerCase()));
  const result = { claims: claims === null ? null : JSON.parse(JSON.stringify(claims)), summary, pendingAction: pendingAction ? JSON.parse(JSON.stringify(pendingAction)) : null, questions, proposedActions, ...extra };
  if (requestIntent !== undefined) result.requestIntent = requestIntent;
  // NOTE: the window reads `readsAsCompletion` of the ORIGINAL summary in the return expression only
  // after the window ran; capture the belt verdict on the input separately below.
  const originalSummary = summary;
  const out = windowFn(result, evidence, context, model, grounded, false, DENO,
    mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mk(labels.runtime));
  out.input = originalSummary;
  return out;
};
export const EV = (rt, action, id, ok = true, extra = {}) => ({ resourceType: rt, action, id, postconditionPassed: ok, request_id: null, channel_id: null, turn: null, action_type: action, entity_type: rt, canonical_entity_ids: [id], requested_values: null, executed: true, rows_affected: ok ? 1 : 0, backend_result: null, precondition: null, postcondition: null, postcondition_verified: ok, error: ok ? null : 'postcondition_not_confirmed', timestamp: 'now', ...extra });
export const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
export const NO_CHANGE = /No change was made — /;

// ---- the REAL company-lifecycle executor window ------------------------------------------------
function slice(startMarker, endMarker) {
  const s = src.indexOf(startMarker); if (s === -1) throw new Error('start marker not found: ' + startMarker);
  const e = src.indexOf(endMarker, s); if (e === -1) throw new Error('end marker not found: ' + endMarker);
  return stripTS(src.slice(s, e + endMarker.length));
}
const LIFECYCLE_SLICE = slice('const COMPANY_UUID_RE = /^[0-9a-f]{8}-', "const archiveRestoreReport = archiveRestoreLines.length > 0 ? archiveRestoreLines.join(' ') : null;");
if (!/async function resolveCompanyLifecycleTargets/.test(LIFECYCLE_SLICE) || !/supabase\.rpc\('archive_company'/.test(LIFECYCLE_SLICE)) throw new Error('not the production lifecycle window');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
export const ARCHIVE_VERB_PATTERN = new Function('return ' + src.match(/const ARCHIVE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
export const RESTORE_VERB_PATTERN = new Function('return ' + src.match(/const RESTORE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
const runLifecycle = new AsyncFunction('supabase', 'result', 'command', 'contextPack', 'recordExecution', 'ARCHIVE_VERB_PATTERN', 'RESTORE_VERB_PATTERN',
  LIFECYCLE_SLICE + '\n; return { archiveCompanyIds, restoreCompanyIds, report: archiveRestoreReport, pendingAction: result.pendingAction, disambiguation: lifecycleDisambiguation, unresolved: lifecycleUnresolvedLines, commandFallbackAllowed, headLifecycleAction };');
// PostgREST-faithful-enough stub: ilike with % and _ wildcards; other characters literal; limit honoured in row order.
export function client(companies, rpcBehaviour) {
  const calls = []; const queries = [];
  const table = (rows) => {
    const q = { _rows: rows, _filters: [], _limit: null };
    q.select = () => q;
    q.in = (col, vals) => { q._filters.push((r) => vals.includes(r[col])); queries.push(['in', col, vals]); return q; };
    q.eq = (col, v) => { q._filters.push((r) => r[col] === v); return q; };
    q.ilike = (col, pat) => { queries.push(['ilike', col, pat]); const re = new RegExp('^' + pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i'); q._filters.push((r) => re.test(String(r[col]))); return q; };
    q.limit = (n) => { q._limit = n; return q; };
    q.then = (res) => { let out = q._rows.filter((r) => q._filters.every((f) => f(r))); if (q._limit) out = out.slice(0, q._limit); return Promise.resolve({ data: out, error: null }).then(res); };
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
  const out = await runLifecycle(sb, { ...result }, command, { companies: [], archivedCompanies: [], ...(opts.pack || {}) }, rec, ARCHIVE_VERB_PATTERN, RESTORE_VERB_PATTERN);
  return { ...out, calls: sb.calls, queries: sb.queries, evidence, db };
}
export const st = (db, id) => db.find((r) => r.id === id).status;

// ---- the REAL narrative-tier history mapping + pendingAction precedence ----------------------------
const HIST_START = 'const conversationHistory = (conversationRowsChronological || []).map(';
const HIST_END = '  const continuity = {';
export const historyFn = new Function('conversationRowsChronological', 'historyWindowStart', stripTS(src.slice(src.indexOf(HIST_START), src.indexOf(HIST_END, src.indexOf(HIST_START)))) + '\n; return conversationHistory;');
const PREC_START = 'const lastTurnRow = conversationRowsChronological?.[conversationRowsChronological.length - 1];';
const PREC_END = '  const recentlyResolvedEntities';
export const precedenceFn = new Function('conversationRowsChronological', 'durableChannelState', stripTS(src.slice(src.indexOf(PREC_START), src.indexOf(PREC_END, src.indexOf(PREC_START)))) + '\n; return { pendingAction, lastTurnPendingFresh, durablePendingActionValid, lastTurnOutput };');

export function tally(label, rows) { let pass = 0; const fails = []; for (const r of rows) { if (r.ok) pass++; else fails.push(r); } console.log(`\n${label}: ${pass} passed, ${fails.length} failed`); return { pass, fails }; }

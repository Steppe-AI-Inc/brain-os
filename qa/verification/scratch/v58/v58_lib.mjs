// VERIFIER #58 — own harness. Executes REAL windows sliced from sem-ai-command/index.ts through the
// repository's detyper (qa/scenarios-runner/_gate_extract.mjs). Never a re-implementation.
// Every window's FREE identifiers are audited (freeIdentifiers) so the harness cannot silently supply a
// name production does not have in scope.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../../..');
export const SRC = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const { stripTS, withPatternsAboveWindow } = await import(pathToFileURL(resolve(ROOT, 'qa/scenarios-runner/_gate_extract.mjs')).href);
export const RAW = readFileSync(SRC, 'utf8');
export const src = RAW.replace(/\r\n/g, '\n');

export function slice(startMarker, endMarker, inclusive = true) {
  const s = src.indexOf(startMarker); if (s === -1) throw new Error('start marker not found: ' + startMarker);
  const e = src.indexOf(endMarker, s + startMarker.length); if (e === -1) throw new Error('end marker not found: ' + endMarker);
  return src.slice(s, inclusive ? e + endMarker.length : e);
}

// ---------- window 1: STRUCTURED-CLAIM VERIFICATION → verifiedResponse (intent + belt + receipt) ----------
const STRUCT_RAW = (() => {
  const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  if (start === -1) throw new Error('structured-claim block not found');
  const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start);
  if (anchor === -1) throw new Error('verifiedResponse envelope not found');
  const end = src.indexOf('};', anchor) + 2;
  const raw = src.slice(start, end);
  for (const must of ['const requestedIntent', 'No change was made — ', 'const legacyProseFallback', 'const unaccountedCompletionProse', 'result.turnVerdict = {', 'const MUTATION_VERB_ALWAYS', 'const CONFIRMATION_COMMAND', 'const readsAsCompletion', 'const READ_SHAPE', 'const POLITE_REQUEST', 'const receiptExempt', 'let receiptRendered']) {
    if (!raw.includes(must)) throw new Error('window does not contain ' + must + ' — not the production window');
  }
  return raw;
})();
export const STRUCT_JS = withPatternsAboveWindow(src, stripTS(STRUCT_RAW));
export const STRUCT_PARAMS = ['result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
  'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels'];
const structFn = new Function(...STRUCT_PARAMS,
  STRUCT_JS + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, pendingAction: result.pendingAction, verdict: result.turnVerdict, intent: requestedIntent, legacy: legacyProseFallback, unaccounted: unaccountedCompletionProse, rewrite: rewriteFromStructure, lexiconVerb, readShaped, modelIntentKind, receiptRendered, belt: readsAsCompletion, executedVerifiedCount };');
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
export const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
export const ID = '11111111-1111-1111-1111-111111111111';
export const ID2 = '22222222-2222-2222-2222-222222222222';
export const CTX = { companies: [{ id: ACME, name: 'ACME', status: 'active' }] };
/** Run the real structured window for one turn. Globals mirror what production declares ABOVE the window. */
export function turn({ command, claims = null, summary = '', pendingAction = null, questions, proposedActions, evidence = [], context = CTX, model = 'gpt-4.1-mini', grounded = false, futureNoPlan = false, labels = {}, deterministicPrefix = '', lifecycleReports = [], factLines = [], names = [], fullyDeterministic = false, orgGraph = null, requestIntent, extra = {} }) {
  globalThis.command = command; globalThis.lifecycleReports = lifecycleReports; globalThis.factLines = factLines; globalThis.organizationGraphCheck = orgGraph; globalThis.workOrder = { id: 'wo-v58' };
  globalThis.knownEntityNames = new Set(names.map((n) => String(n).trim().toLowerCase()));
  const result = { claims: claims === null ? null : JSON.parse(JSON.stringify(claims)), summary, pendingAction: pendingAction ? JSON.parse(JSON.stringify(pendingAction)) : null, questions, proposedActions, ...extra };
  if (requestIntent !== undefined) result.requestIntent = requestIntent;
  const input = summary;
  const out = structFn(result, evidence, context, model, grounded, futureNoPlan, DENO, mk(labels.company), mk(labels.task), mk(labels.person), mk(labels.goal), fullyDeterministic, deterministicPrefix, mk(labels.runtime));
  out.input = input; out.beltOnInput = out.belt(String(input || ''));
  return out;
}
export const EV = (rt, action, id, ok = true, extra = {}) => ({ resourceType: rt, action, id, postconditionPassed: ok, request_id: null, channel_id: null, turn: null, action_type: action, entity_type: rt, canonical_entity_ids: [id], requested_values: null, executed: true, rows_affected: ok ? 1 : 0, backend_result: null, precondition: null, postcondition: null, postcondition_verified: ok, error: ok ? null : 'postcondition_not_confirmed', timestamp: 'now', ...extra });
export const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });
export const S = (rt, id, predicate = 'status', expectedValue = 'active') => ({ type: 'current_state', resourceType: rt, resourceId: id, predicate, expectedValue });
export const H = (rt, id, action) => ({ type: 'historical_event', resourceType: rt, resourceId: id, action, temporalScope: 'prior_turn' });
export const RI = (kind, action = null, entityType = null, targetName = null) => ({ kind, action, entityType, targetName });
export const NO_CHANGE = /No change was made — /;
// Success wording that must never survive on a fabricated mutation-intent turn (the FABRICATED words only).
export const SUCCESS_WORDS = /\b(?:has been|have been|was|were|is now|are now|successfully|done|✅)\b[^.]{0,40}\b(?:renamed|approved|deleted|archived|assigned|restored|updated|created|moved|reassigned|set|ended|removed|completed|closed|changed)\b|\b(?:renamed|approved|deleted|archived|assigned|restored|updated|created|moved|reassigned|removed|completed|closed)\s+(?:successfully|✅)|^\s*(?:done|completed|finished)\b/i;

// ---------- window 2: company-lifecycle executor (resolver + RPC loops + disambiguation) ----------
const LIFE_RAW = slice('const COMPANY_UUID_RE = /^[0-9a-f]{8}-', "const archiveRestoreReport = archiveRestoreLines.length > 0 ? archiveRestoreLines.join(' ') : null;");
for (const must of ['async function resolveCompanyLifecycleTargets', "supabase.rpc('archive_company'", "supabase.rpc('restore_company'", 'const commandFallbackAllowed', 'const headLifecycleAction', 'lifecycleDisambiguation.length > 0']) {
  if (!LIFE_RAW.includes(must)) throw new Error('lifecycle window does not contain ' + must);
}
export const LIFE_JS = stripTS(LIFE_RAW);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
export const ARCHIVE_VERB_PATTERN = new Function('return ' + src.match(/const ARCHIVE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
export const RESTORE_VERB_PATTERN = new Function('return ' + src.match(/const RESTORE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
export const LIFE_PARAMS = ['supabase', 'result', 'command', 'contextPack', 'recordExecution', 'ARCHIVE_VERB_PATTERN', 'RESTORE_VERB_PATTERN'];
const lifeFn = new AsyncFunction(...LIFE_PARAMS,
  LIFE_JS + '\n; return { archiveCompanyIds, restoreCompanyIds, report: archiveRestoreReport, pendingAction: result.pendingAction, disambiguation: lifecycleDisambiguation, unresolved: lifecycleUnresolvedLines, commandFallbackAllowed, headLifecycleAction, commandIsQuestion, commandNegatedLead, commandReadLead };');
/** PostgREST-faithful-enough stub for `companies`: ilike with % and _ wildcards (case-insensitive), in(), limit in row order. */
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

// ---------- window 3: narrative-tier history mapping + pendingAction precedence ----------
const HIST_RAW = slice('const conversationHistory = (conversationRowsChronological || []).map(', '  const continuity = {', false);
export const historyFn = new Function('conversationRowsChronological', 'historyWindowStart', stripTS(HIST_RAW) + '\n; return conversationHistory;');
const PREC_RAW = slice('const lastTurnRow = conversationRowsChronological?.[conversationRowsChronological.length - 1];', '  const recentlyResolvedEntities', false);
export const precedenceFn = new Function('conversationRowsChronological', 'durableChannelState', stripTS(PREC_RAW) + '\n; return { pendingAction, lastTurnPendingFresh, durablePendingActionValid, lastTurnOutput };');

// ---------- window 4: the collection envelope helper ----------
const ENV_RAW = slice('const envelope = (res: any, shownOverride', '  };', true);
export const envelopeFn = new Function(stripTS(ENV_RAW) + '\n; return envelope;')();

// ---------- free-identifier audit: which names does a window read that it does not declare? ----------
const JS_RESERVED = new Set('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof new return super switch this throw try typeof var void while with yield let static enum await async of null undefined true false NaN Infinity arguments'.split(' '));
const JS_GLOBALS = new Set('Array Object String Number Boolean Map Set Promise JSON Math Date RegExp Error TypeError RangeError Symbol Function Number parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent globalThis console structuredClone Intl BigInt WeakMap WeakSet Proxy Reflect'.split(' '));
export function freeIdentifiers(js) {
  // crude but adequate: identifiers not preceded by '.', not object keys, not declared by const/let/var/function/class/param in the text
  const s = js.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\n)\s*\/\/[^\n]*/g, '$1').replace(/`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`/g, '``').replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""').replace(/\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*/g, '/re/');
  const declared = new Set();
  for (const m of s.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of s.matchAll(/\b(?:const|let|var)\s*[{[]([^=]*)[}\]]\s*=/g)) for (const n of m[1].split(/[,\s:{}[\]]+/)) if (/^[A-Za-z_$][\w$]*$/.test(n)) declared.add(n);
  for (const m of s.matchAll(/\(([^()]*)\)\s*=>/g)) for (const n of m[1].split(/[,\s=]+/)) if (/^[A-Za-z_$][\w$]*$/.test(n)) declared.add(n);
  for (const m of s.matchAll(/\b([A-Za-z_$][\w$]*)\s*=>/g)) declared.add(m[1]);
  for (const m of s.matchAll(/function\s*\w*\s*\(([^()]*)\)/g)) for (const n of m[1].split(/[,\s=]+/)) if (/^[A-Za-z_$][\w$]*$/.test(n)) declared.add(n);
  for (const m of s.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of s.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  const free = new Set();
  for (const m of s.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)/g)) {
    const name = m[2];
    if (JS_RESERVED.has(name) || JS_GLOBALS.has(name) || declared.has(name)) continue;
    const endIdx = m.index + m[0].length;
    const after = s.slice(endIdx, endIdx + 40);
    const beforeTxt = s.slice(Math.max(0, m.index - 200), m.index + m[1].length);
    // object key `name:` (not a ternary): followed by ':' and the previous non-space char is '{' or ','
    if (/^\s*:/.test(after) && /[{,]\s*$/.test(beforeTxt)) continue;
    // shorthand property / destructuring member `{ name, other }` or `{ name }` — skip when between { , and , }
    if (/^\s*[,}]/.test(after) && /[{,]\s*$/.test(beforeTxt) && /[{,]\s*$/.test(beforeTxt)) { /* could be a real read `{ x, y }` object shorthand — count it */ }
    free.add(name);
  }
  return [...free].sort();
}

export function tally(label, rows) { let pass = 0; const fails = []; for (const r of rows) { if (r.ok) pass++; else fails.push(r); } console.log(`\n${label}: ${pass} passed, ${fails.length} failed`); for (const f of fails.slice(0, 40)) console.log('  FAIL ' + (f.name || JSON.stringify(f)).slice(0, 300) + (f.detail ? '\n       ' + String(f.detail).slice(0, 300) : '')); return { pass, fails }; }

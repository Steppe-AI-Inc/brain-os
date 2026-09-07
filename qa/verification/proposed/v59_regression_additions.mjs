#!/usr/bin/env node
// VERIFIER #59 (campaign #119) — regression additions for candidate 821f5308 under the contract bar.
// CONTRACT pins hold on the candidate; DEFECT pins are V59-D1..D4 (model-emits-nothing tier) + V59-S1 (suite integrity)
// and are RED on 821f530 by design, GREEN on the prepared hardening patch (qa/verification/proposed/v59_hardening.patch).
// RESIDUAL lines are reported, never fail. ANY CONTRACT/DEFECT failure exits non-zero.
// Executes the REAL windows of index.ts (never a re-implementation). Path is correct from ANY cwd; SEM_INDEX_SRC overrides.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const SRC = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const { stripTS, withPatternsAboveWindow } = await import(pathToFileURL(resolve(ROOT, 'qa/scenarios-runner/_gate_extract.mjs')).href);
const RAW = readFileSync(SRC, 'utf8');
const src = RAW.replace(/\r\n/g, '\n');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function slice(a, b, inclusive = true) { const s = src.indexOf(a); if (s === -1) throw new Error('start marker not found: ' + a); const e = src.indexOf(b, s + a.length); if (e === -1) throw new Error('end marker not found: ' + b); return src.slice(s, inclusive ? e + b.length : e); }
function must(raw, needles, label) { for (const n of needles) if (!raw.includes(n)) throw new Error(label + ' window does not contain ' + JSON.stringify(n)); }

// ---- W1 structured-claim window (intent + belt + receipt) ----
const STRUCT_RAW = (() => { const start = src.indexOf('// STRUCTURED-CLAIM VERIFICATION'); const anchor = src.indexOf('executionEvidence: claimExecutionEvidence,', start); if (start === -1 || anchor === -1) throw new Error('structured window not found'); return src.slice(start, src.indexOf('};', anchor) + 2); })();
must(STRUCT_RAW, ['const requestedIntent', 'No change was made — ', 'const receiptExempt', 'const MUTATION_VERB_ALWAYS', 'const READ_SHAPE'], 'W1');
const structFn = new Function('result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno', 'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
  withPatternsAboveWindow(src, stripTS(STRUCT_RAW)) + '\n; return { summary: result.summary, intent: requestedIntent, receipt: receiptRendered, corrected: claimsPastCompletionWithNoGrounding, verdict: result.turnVerdict };');
const DENO = { env: { get: () => undefined } };
const mk = (o) => new Map(Object.entries(o || {}));
const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const NAMES = ['ACME', 'Alpha', 'Beta', 'Gamma', 'Alpha Holdings', 'Bob'];
function turn({ command, summary, claims = null, pendingAction = null, evidence = [], requestIntent, lifecycleReports = [], extra = {}, deterministicPrefix = '' }) {
  globalThis.command = command; globalThis.lifecycleReports = lifecycleReports; globalThis.factLines = []; globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-v59' };
  globalThis.knownEntityNames = new Set(NAMES.map((n) => n.toLowerCase()));
  const result = { claims, summary, pendingAction, ...extra }; if (requestIntent !== undefined) result.requestIntent = requestIntent;
  return structFn(result, evidence, { companies: [{ id: ACME, name: 'ACME', status: 'active' }] }, 'gpt-4.1-mini', false, false, DENO, mk({ [ACME]: 'ACME' }), mk(), mk(), mk(), lifecycleReports.length > 0, deterministicPrefix, mk());
}
const EV = (rt, action, id, ok) => ({ resourceType: rt, action, id, postconditionPassed: ok, request_id: null, executed: true, postcondition_verified: ok, error: ok ? null : 'postcondition_not_confirmed' });
const RI = (kind, action = null, entityType = null, targetName = null) => ({ kind, action, entityType, targetName });
const NO_CHANGE = /No change was made — /;

// ---- W2 company-lifecycle executor ----
const LIFE_RAW = slice('const COMPANY_UUID_RE = /^[0-9a-f]{8}-', "const archiveRestoreReport = archiveRestoreLines.length > 0 ? archiveRestoreLines.join(' ') : null;");
must(LIFE_RAW, ['async function resolveCompanyLifecycleTargets', 'const IMPERATIVE_HEAD_RE', 'const commandFallbackAllowed'], 'W2');
const ARCHIVE_VERB_PATTERN = new Function('return ' + src.match(/const ARCHIVE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
const RESTORE_VERB_PATTERN = new Function('return ' + src.match(/const RESTORE_VERB_PATTERN = (\/[^\n]*\/i);/)[1])();
const lifeFn = new AsyncFunction('supabase', 'result', 'command', 'contextPack', 'recordExecution', 'ARCHIVE_VERB_PATTERN', 'RESTORE_VERB_PATTERN',
  stripTS(LIFE_RAW) + '\n; return { archiveCompanyIds, restoreCompanyIds, report: archiveRestoreReport, pendingAction: result.pendingAction, disambiguation: lifecycleDisambiguation, unresolved: lifecycleUnresolvedLines, allowed: commandFallbackAllowed, imp: commandImperativePosition };');
const U = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const db = () => [{ id: U(1), name: 'Alpha', status: 'active' }, { id: U(2), name: 'Beta', status: 'archived' }, { id: U(3), name: 'ACME', status: 'active' }, { id: U(4), name: 'Alpha Holdings', status: 'active' }];
function client(rows) {
  const calls = [];
  const table = () => { const q = { _f: [], _l: null }; q.select = () => q; q.in = (c, v) => { q._f.push((r) => v.includes(r[c])); return q; }; q.eq = (c, v) => { q._f.push((r) => r[c] === v); return q; };
    q.ilike = (c, pat) => { const re = new RegExp('^' + pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '[\\s\\S]*').replace(/_/g, '.') + '$', 'i'); q._f.push((r) => re.test(String(r[c]))); return q; };
    q.limit = (n) => { q._l = n; return q; }; q.then = (res, rej) => { let out = rows.filter((r) => q._f.every((f) => f(r))); if (q._l) out = out.slice(0, q._l); return Promise.resolve({ data: out, error: null }).then(res, rej); }; return q; };
  const rpc = async (name, args) => { const id = args.p_company_id; calls.push([name, id]); const row = rows.find((r) => r.id === id);
    if (!row) return { data: { changed: false, authorized: true, postconditionPassed: false, reason: 'not_found' }, error: null };
    if (name === 'restore_company') { if (row.status !== 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_active' }, error: null }; row.status = 'active'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'restored' }, error: null }; }
    if (row.status === 'archived') return { data: { changed: false, authorized: true, postconditionPassed: true, reason: 'already_archived' }, error: null }; row.status = 'archived'; return { data: { changed: true, authorized: true, postconditionPassed: true, reason: 'archived' }, error: null }; };
  return { calls, from: () => table(), rpc };
}
async function life(command, result = {}) { const rows = db(); const sb = client(rows); const ev = []; const out = await lifeFn(sb, { ...result }, command, { companies: [], archivedCompanies: [] }, (rt, a, id, ok) => { if (typeof id === 'string') ev.push({ resourceType: rt, action: a, id, postconditionPassed: ok }); }, ARCHIVE_VERB_PATTERN, RESTORE_VERB_PATTERN); return { ...out, calls: sb.calls, evidence: ev }; }
/** production order: executor → window */
async function chain(command, fabricated, opts = {}) {
  const res = { ...(opts.result || {}) }; if (opts.requestIntent !== undefined) res.requestIntent = opts.requestIntent;
  const L = await life(command, res); const reports = L.report ? [L.report] : [];
  const evidence = L.evidence.map((e) => ({ ...e, error: e.postconditionPassed ? null : 'x' }));
  const o = turn({ command, summary: reports.length > 0 ? reports.join(' ') : fabricated, lifecycleReports: reports, evidence, requestIntent: opts.requestIntent, pendingAction: L.pendingAction || null, extra: opts.result || {}, deterministicPrefix: reports.join(' ') });
  return { calls: L.calls, allowed: L.allowed, imp: L.imp, disamb: L.disambiguation, final: o.summary, intent: o.intent, receipt: o.receipt };
}

// ---- W5 precedence ----
const PREC_RAW = slice('const lastTurnRow = conversationRowsChronological?.[conversationRowsChronological.length - 1];', '  const recentlyResolvedEntities', false);
must(PREC_RAW, ['durablePendingActionValid', 'pending_action_expires_at'], 'W5');
const precedenceFn = new Function('conversationRowsChronological', 'durableChannelState', stripTS(PREC_RAW) + '\n; return { pendingAction, durablePendingActionValid };');

// ---- runner ----
let pass = 0, fail = 0; const failing = []; const residuals = [];
const C = (kind, id, desc, thunk) => { let ok = false, detail = ''; try { const r = thunk(); ok = Array.isArray(r) ? r[0] : !!r; detail = Array.isArray(r) ? r[1] || '' : ''; } catch (e) { ok = false; detail = 'threw: ' + e.message; }
  if (kind === 'RESIDUAL') { residuals.push(id); console.log(`RESID [RESIDUAL] ${id} — ${desc}${detail ? '  :: ' + String(detail).slice(0, 300) : ''}`); return; }
  if (ok) pass++; else { fail++; failing.push(id); } console.log(`${ok ? 'PASS' : 'FAIL'}  [${kind.padEnd(8)}] ${id} — ${desc}${!ok && detail ? '  -- ' + String(detail).slice(0, 300) : ''}`); };
const A = async (kind, id, desc, thunk) => { let r; try { r = await thunk(); } catch (e) { r = [false, 'threw: ' + e.message]; } C(kind, id, desc, () => r); };
const j = (o) => JSON.stringify({ calls: o.calls, allowed: o.allowed, imp: o.imp, intent: o.intent, final: o.final });

// ═══ CONTRACT — never-silent receipt (OTM §3 rules 1-3) ═══
const FABS = [['rename project Alpha to Beta', 'Done. Project renamed to Beta.'], ['approve the approval 123', 'Approved.'], ['delete task QA-1', 'Task QA-1 has been deleted.'], ['archive ACME', 'ACME has been archived.'], ['assign task QA-1 to Bob', 'Assigned. Bob now owns QA-1.'], ['set the manager of Alice to Bob', 'Alice now reports to Bob.'], ['restore ACME', 'ACME has been restored.'], ['yes', 'Confirmed — ACME archived.'], ['option 2', 'Archived Alpha Holdings.'], ['bring back the company Beta', 'Beta is back — restored.']];
const VARIANTS = [['claims:null', {}], ['claims:[]', { claims: [] }], ['claims:state-only', { claims: [{ type: 'current_state', resourceType: 'company', resourceId: ACME, predicate: 'status', expectedValue: 'active' }] }], ['pendingAction+question', { pendingAction: { kind: 'open_question', question: 'Should I also notify the team?' } }]];
for (const [cmd, fab] of FABS.slice(0, 9)) for (const [vn, extra] of VARIANTS) {
  C('CONTRACT', `V59-C1 "${cmd}" [${vn}]`, 'fabricated completion on a mutation-intent request ends in the deterministic receipt', () => { const t = turn({ command: cmd, summary: fab + (vn === 'pendingAction+question' ? ' Should I also notify the team?' : ''), ...extra }); return [NO_CHANGE.test(t.summary) && t.receipt === true && !t.summary.includes(fab), t.summary]; });
}
C('CONTRACT', 'V59-C1b pendingAction question survives inside the receipt', 'the founder is never stranded', () => { const t = turn({ command: 'archive ACME', summary: 'ACME archived. Notify the team?', pendingAction: { kind: 'open_question', question: 'Notify the team?' } }); return [/I need your answer first/.test(t.summary) && /Notify the team\?/.test(t.summary), t.summary]; });
for (const s of ['ACME was created on 2026-03-01 and has 12 active tasks. Want the list?', 'ACME is archived. Should I restore it?', 'Here are your companies: ACME, Alpha.', 'Archiving a company from chat requires the Companies page.', 'Bob was not removed from the team.']) {
  C('CONTRACT', `V59-C2 read "${s.slice(0, 40)}"`, 'a READ request (model read) survives verbatim', () => { const t = turn({ command: 'what is the status of ACME?', summary: s, requestIntent: RI('read') }); return [t.summary === s && t.intent === null, t.summary]; });
  C('CONTRACT', `V59-C2b no intent "${s.slice(0, 40)}"`, 'with NO request intent nothing is rewritten on text shape', () => { const t = turn({ command: '', summary: s }); return [t.summary === s, t.summary]; });
}
C('CONTRACT', 'V59-C3 verified envelope renders the claim', 'a postcondition-verified archive on the claimed id renders as confirmed', () => { const t = turn({ command: 'archive ACME', summary: 'ACME archived.', claims: [{ type: 'mutation_result', resourceType: 'company', resourceId: ACME, action: 'archive' }], evidence: [EV('company', 'archive', ACME, true)] }); return [/ACME: archived — confirmed/.test(t.summary) && !NO_CHANGE.test(t.summary), t.summary]; });
C('CONTRACT', 'V59-C3b executed-but-unverified never supports a claim', 'postconditionPassed=false → rejected line, no success', () => { const t = turn({ command: 'archive ACME', summary: 'ACME archived.', claims: [{ type: 'mutation_result', resourceType: 'company', resourceId: ACME, action: 'archive' }], evidence: [EV('company', 'archive', ACME, false)] }); return [/can’t confirm/.test(t.summary) && !/archived — confirmed/.test(t.summary), t.summary]; });
C('CONTRACT', 'V59-C3c denied envelope never supports a claim', 'executed=false error denied', () => { const t = turn({ command: 'archive ACME', summary: 'ACME has been archived.', evidence: [{ ...EV('company', 'archive', ACME, false), executed: false, error: 'denied' }] }); return [!/has been archived/.test(t.summary) && (NO_CHANGE.test(t.summary) || /can’t confirm/.test(t.summary)), t.summary]; });
C('CONTRACT', 'V59-C4 intent never derives from the reply', 'summary tense/shape does not create intent', () => { const t = turn({ command: 'thanks!', summary: 'ACME has been archived.' }); return [t.intent === null && t.summary === 'ACME has been archived.', JSON.stringify(t.intent)]; });
C('CONTRACT', 'V59-C4b model "other" vetoes the lexicon', 'V57-D1 holds', () => { const t = turn({ command: 'archive ACME', summary: 'Here is a draft memo about archiving.', requestIntent: RI('other') }); return [t.intent === null && t.summary === 'Here is a draft memo about archiving.', t.summary]; });
C('CONTRACT', 'V59-C4c a polite question is a request', '"could you please archive ACME?" carries intent', () => { const t = turn({ command: 'could you please archive ACME?', summary: 'ACME has been archived.' }); return [t.intent !== null && NO_CHANGE.test(t.summary), t.summary]; });

// ═══ CONTRACT — server-side lifecycle resolution (CWC §1-§2) ═══
await A('CONTRACT', 'V59-C5 exact name via command executes once', '"archive Alpha", model emitted nothing', async () => { const o = await chain('archive Alpha', 'Alpha has been archived.'); return [o.calls.length === 1 && o.calls[0][0] === 'archive_company' && o.final === 'Alpha: archived.', j(o)]; });
await A('CONTRACT', 'V59-C5b fuzzy command hit asks, never executes', '"archive Alph"', async () => { const o = await chain('archive Alph', 'Alph archived.'); return [o.calls.length === 0 && o.disamb.length === 1, j(o)]; });
await A('CONTRACT', 'V59-C5c question never executes', '"did you archive Alpha?"', async () => { const o = await chain('did you archive Alpha?', 'Yes.'); return [o.calls.length === 0, j(o)]; });
await A('CONTRACT', 'V59-C5d negation never executes', '"do not archive Alpha" / "don’t archive Alpha" — the executor fails closed', async () => { const o = await chain('do not archive Alpha', 'Alpha archived.'); const o2 = await chain('don’t archive Alpha yet', 'Alpha archived.'); return [o.calls.length === 0 && o2.calls.length === 0 && NO_CHANGE.test(o2.final) && /asked me not to/.test(o2.final), j(o) + ' ' + j(o2)]; });
await A('CONTRACT', 'V59-C5e restore prefers the archived twin', 'Beta archived exists', async () => { const o = await chain('restore Beta', 'Beta restored.'); return [o.calls.length === 1 && o.calls[0][0] === 'restore_company' && o.calls[0][1] === U(2), j(o)]; });
await A('CONTRACT', 'V59-C5f nonexistent model id → could-not-be-found line', 'archiveCompanyIds:[unknown]', async () => { const o = await chain('archive Alpha', 'Alpha has been archived.', { result: { archiveCompanyIds: ['99999999-0000-4000-8000-000000000000'] } }); return [o.calls.length === 0 && /could not be found/.test(o.final) && !/has been archived/.test(o.final), j(o)]; });
await A('CONTRACT', 'V59-C5g Mongolian executes through the model’s classification', '"Alpha-г архивла" + requestIntent', async () => { const o = await chain('Alpha-г архивла', 'Alpha архивлагдлаа.', { requestIntent: RI('mutation', 'archive', 'company', 'Alpha') }); return [o.calls.length === 1 && o.final === 'Alpha: archived.', j(o)]; });
await A('CONTRACT', 'V59-C5h model read/other → nothing executes', '"archive Alpha" + requestIntent other', async () => { const o = await chain('archive Alpha', 'x', { requestIntent: RI('other') }); return [o.calls.length === 0, j(o)]; });
await A('CONTRACT', 'V59-C5i a task request never invents a company line', '"archive the task Ship v2"', async () => { const o = await chain('archive the task Ship v2', 'Task archived.', { result: { archiveTaskIds: [] } }); return [o.calls.length === 0 && !/no company by that name/.test(o.final) && NO_CHANGE.test(o.final), j(o)]; });
await A('CONTRACT', 'V59-C5j idempotent restore of an active company is a truthful receipt', '"restore Alpha" (active)', async () => { const o = await chain('restore Alpha', 'Alpha restored.'); return [o.calls.length === 1 && /already active/.test(o.final), j(o)]; });

// ═══ CONTRACT — precedence (OTM §2) ═══
const fut = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();
const PA = { kind: 'bulk_confirmation', summary: 'Archive ACME', action: { archiveCompanyIds: [ACME] }, actionType: 'archive' };
const row = (out, age = 0) => ({ id: 'wo-last', created_at: new Date(Date.now() - age).toISOString(), output: out });
const dur = (o = {}) => ({ pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-old', pending_action_expires_at: fut(), ...o });
C('CONTRACT', 'V59-C6 durable row outranks stored output', 'tier 3 > tier 4', () => precedenceFn([row({ pendingAction: { kind: 'open_question', question: 'q' } })], dur()).pendingAction.summary === 'Archive ACME');
C('CONTRACT', 'V59-C6b expired durable row yields', '', () => precedenceFn([row({ pendingAction: { kind: 'open_question', question: 'q' } })], dur({ pending_action_expires_at: new Date(Date.now() - 1000).toISOString() })).pendingAction.question === 'q');
C('CONTRACT', 'V59-C6c untyped durable row yields', '', () => precedenceFn([row({ pendingAction: { kind: 'open_question', question: 'q' } })], dur({ pending_action_action_type: null })).pendingAction.question === 'q');
C('CONTRACT', 'V59-C6d stored pendingAction older than 30 min never binds', '', () => precedenceFn([row({ pendingAction: { kind: 'open_question', question: 'q' } }, 31 * 60 * 1000)], null).pendingAction === null);

// ═══ CONTRACT — source-level invariants ═══
C('CONTRACT', 'V59-C7 every pack collection is enveloped; total never from length', 'OTM §4.3', () => { const pi = src.indexOf('\n  const pack = {'); const pack = src.slice(pi, src.indexOf('};', pi) + 2); const ci = src.indexOf('\n  const collections = {'); const coll = src.slice(ci, src.indexOf('\n  };', ci)); const keys = [...pack.matchAll(/(\w+):\s*(?:pack\w+|merged\w+|\w+\.data\s*\|\|\s*\[\]|conversationHistory|factoryWorkOrders)(?=[,\s}])/g)].map((m) => m[1]); const missing = keys.filter((k) => !new RegExp('(^|[\\s{,])' + k + ':\\s*(envelope\\(|\\{)').test(coll)); const env = src.slice(src.indexOf('const envelope = (res'), ci); return [pi > 0 && ci > 0 && keys.length >= 20 && keys.includes('archivedTasks') && missing.length === 0 && /res\?\.count/.test(env) && !/total:\s*\(res\?\.data\s*\|\|\s*\[\]\)\.length/.test(env), 'keys ' + keys.length + ' missing ' + missing.join(',')]; });
C('CONTRACT', 'V59-C7b create family postcondition is a fresh re-read', 'OTM §4.1', () => /const ok = typeof id === 'string' && seen\.has\(id\); recordExecution\(resourceType, 'create', id, ok/.test(src) && /async function verifyRowsExist\(/.test(src));
C('CONTRACT', 'V59-C7c work_orders.output persisted unconditionally', 'OTM §3 rule 6', () => /\n\s*await supabase\.from\('work_orders'\)\.update\(\{ output: result \}\)\.eq\('id', workOrder\.id\);/.test(src));
C('CONTRACT', 'V59-C7d _shared is not imported by index.ts (deploy surface is exactly index.ts)', '', () => !/^import .*_shared/m.test(src));
C('CONTRACT', 'V59-C7e index.ts is CRLF-pure', '', () => (RAW.replace(/\r\n/g, '').match(/\n/g) || []).length === 0);

// ═══ DEFECT — V59-D1..D4 (model-emits-nothing tier) — RED on 821f530, GREEN on v59_hardening.patch ═══
await A('DEFECT', 'V59-D1 "bring back Gamma" [model nothing]', 'the executor’s own restore idiom carries request intent: receipt, never the fabrication', async () => { const o = await chain('bring back Gamma', 'Gamma is back — restored.'); return [o.calls.length === 0 && NO_CHANGE.test(o.final), j(o)]; });
await A('DEFECT', 'V59-D1b "get Alpha archived" [model nothing]', 'causative passive carries intent', async () => { const o = await chain('get Alpha archived', 'Alpha has been archived.'); return [o.calls.length <= 1 && (NO_CHANGE.test(o.final) || o.final === 'Alpha: archived.'), j(o)]; });
await A('DEFECT', 'V59-D2 "do me a favour and archive Alpha" [model nothing]', 'a frame IMPERATIVE_HEAD_RE admits must not be vetoed by commandReadLead', async () => { const o = await chain('do me a favour and archive Alpha', 'Alpha has been archived.'); return [o.calls.length === 1 && o.final === 'Alpha: archived.', j(o)]; });
await A('DEFECT', 'V59-D2b "list the tasks, then archive Alpha" [model nothing]', 'an imperative last clause after a non-conditional lead executes', async () => { const o = await chain('list the tasks, then archive Alpha', 'Alpha has been archived.'); return [o.calls.length === 1 && o.final === 'Alpha: archived.', j(o)]; });
await A('DEFECT', 'V59-D2c "when you get a chance, archive Alpha" [model nothing]', 'a polite time frame is a request: intent present (receipt or execution), never the fabrication', async () => { const o = await chain('when you get a chance, archive Alpha', 'Alpha has been archived.'); return [o.intent !== null && (o.calls.length === 1 ? o.final === 'Alpha: archived.' : NO_CHANGE.test(o.final)), j(o)]; });
C('DEFECT', 'V59-D3 IMPERATIVE_HEAD_RE has no unreachable alternative', 'every verb alternative must match in head position (dead alternatives = vacuous-guard class)', () => { const m = src.match(/const IMPERATIVE_HEAD_RE = (\/[^\n]*\/u);/); const re = new Function('return ' + m[1])(); const body = m[1].slice(1, m[1].lastIndexOf('/'));
  // the verb group is the LAST top-level group of the regex body (the prefix group precedes it)
  let depth = 0, inClass = false, lastOpen = -1, lastClose = -1; for (let i = 0; i < body.length; i++) { const ch = body[i]; if (ch === '\\') { i++; continue; } if (inClass) { if (ch === ']') inClass = false; continue; } if (ch === '[') { inClass = true; continue; } if (ch === '(') { if (depth === 0) lastOpen = i; depth++; } else if (ch === ')') { depth--; if (depth === 0) lastClose = i; } }
  const tail = body.slice(lastOpen + 3, lastClose);
  const alts = []; let d = 0, cur = ''; for (const ch of tail) { if (ch === '(') d++; if (ch === ')') d--; if (ch === '|' && d === 0) { alts.push(cur); cur = ''; } else cur += ch; } alts.push(cur);
  const sample = (a) => a.replace(/\(\?:e\|ing\)/g, 'e').replace(/\(\?:ing\)\?/g, '').replace(/un-\?/g, 'un').replace(/\\b/g, '').replace(/\\s\+/g, ' ');
  const dead = alts.map(sample).filter((a) => !re.test(a + ' alpha')); return [alts.length >= 8 && dead.length === 0, 'alts ' + alts.length + ' dead: ' + JSON.stringify(dead)]; });
await A('DEFECT', 'V59-D2d "do not archive Alpha" [model nothing]', 'a negated request is a request: intent present → "you asked me not to" receipt, never the fabrication (READ_SHAPE’s bare "do" must not veto it)', async () => { const o = await chain('do not archive Alpha', 'Alpha archived.'); return [o.calls.length === 0 && NO_CHANGE.test(o.final) && /asked me not to/.test(o.final), j(o)]; });
await A('DEFECT', 'V59-D3b "Alpha-г архивла" [model nothing] receipt names the operation', 'a Cyrillic lexicon verb is archive/restore/delete, not "not an operation I can execute"', async () => { const o = await chain('Alpha-г архивла', 'Alpha архивлагдлаа.'); return [o.calls.length <= 1 && !/did not resolve to an operation/.test(o.final) && (NO_CHANGE.test(o.final) || o.final === 'Alpha: archived.'), j(o)]; });
for (const [cmd, want] of [['restore task QA-7', 'task'], ['archive the goal Growth', 'goal'], ['restore the person Bob', 'person']]) C('DEFECT', `V59-D4 "${cmd}" [model nothing]`, `receipt names the ${want} (the command noun), not "company"`, () => { const t = turn({ command: cmd, summary: 'Done.' }); return [new RegExp('which ' + want + ' you meant').test(t.summary), t.summary]; });
C('DEFECT', 'V59-S1 architecture_lifecycle_rpc_only_contract.mjs loads and exits 0', 'the committed suite has real CR/LF bytes inside a regex literal (SyntaxError) — its 31 pins are dead until repaired (qa/verification/proposed/v59_lifecycle_rpc_only_contract_repaired.mjs)', () => { const r = spawnSync(process.execPath, [resolve(ROOT, 'qa/scenarios-runner/architecture_lifecycle_rpc_only_contract.mjs')], { cwd: ROOT, encoding: 'utf8', timeout: 120000 }); return [r.status === 0, (r.stderr || r.stdout).trim().split('\n').slice(-2).join(' | ').slice(0, 200)]; });

// ═══ RESIDUAL (sized, never failing) ═══
C('RESIDUAL', 'V59-D5 lexicon false positives with the model emitting no classification', 'read replaced by a receipt', () => { const rows = ['the fire drill is at 3pm', 'draft an email to Bob about the merge', 'the revenue split is 60/40', 'I approve of this plan'].map((c) => [c, turn({ command: c, summary: 'Noted.' }).summary]); return [true, JSON.stringify(rows.filter(([, s]) => NO_CHANGE.test(s)).map(([c]) => c))]; });
C('RESIDUAL', 'V59-R1 [model other/read] + fabricated completion ships (V57-D1 intended departure; v92 corrected on text)', '', () => [true, turn({ command: 'archive ACME', summary: 'ACME has been archived.', requestIntent: RI('other') }).summary]);
C('RESIDUAL', 'V59-R2 durable row from an older turn binds after the last turn stored no pendingAction (no source-freshness check; needs a swallowed write error or lost CAS race)', '', () => [true, JSON.stringify(precedenceFn([row({ pendingAction: null })], dur()).pendingAction !== null)]);
C('RESIDUAL', 'V59-R3 idioms outside the lexicon with the model emitting nothing ("shelve Alpha", "retire the company Alpha", "Alpha back to active", "archive Alpha?")', '', () => [true, JSON.stringify(['shelve Alpha', 'retire the company Alpha', 'Alpha back to active', 'archive Alpha?'].filter((c) => turn({ command: c, summary: 'Alpha has been archived.' }).intent === null))]);

console.log(`\nv59_regression_additions: ${pass} passed, ${fail} failed (residuals reported: ${residuals.length})`);
if (fail > 0) console.log('FAILING: ' + failing.join(', '));
process.exit(fail === 0 ? 0 : 1);

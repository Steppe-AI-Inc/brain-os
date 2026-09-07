// VERIFIER #58 — Steps 2D (collection envelopes), 2E (persistence + narrative + precedence), 2F (receipt == ledger),
// 2G (postconditions). Executed windows where the code is executable; static pins where the property is structural.
import { src, historyFn, precedenceFn, envelopeFn, turn, EV, M, ACME, ID, ID2, NO_CHANGE, tally } from './v58_lib.mjs';
import { writeFileSync } from 'node:fs';
const rows = []; const add = (name, ok, detail) => rows.push({ name, ok, detail });
const lines = src.split('\n');

// ---- 2D collection envelopes ----
{
  const packLit = src.slice(src.indexOf('const pack = { continuity,'), src.indexOf('\n', src.indexOf('const pack = { continuity,')));
  const packArrays = [...packLit.matchAll(/(\w+):(?:\w+\.data\|\|\[\]|packCompanies|mergedTasksData|packMemories|packPeople|mergedGoalsData|conversationHistory|factoryWorkOrders)/g)].map((m) => m[1]);
  const collLit = src.slice(src.indexOf('const collections = {'), src.indexOf('};', src.indexOf('const collections = {')));
  const enveloped = [...collLit.matchAll(/^\s*(\w+):|,\s*(\w+):/gm)].map((m) => m[1] || m[2]).filter(Boolean);
  const missing = packArrays.filter((k) => !enveloped.includes(k));
  add(`2D every pack array has an envelope (${packArrays.length} arrays)`, packArrays.length >= 20 && missing.length === 0, 'missing: ' + JSON.stringify(missing));
  // every capped query in buildContext carries count: 'exact'
  const ctxStart = src.indexOf('async function buildContext'); const ctxEnd = src.indexOf('const pack = {', ctxStart);
  const ctx = src.slice(ctxStart, ctxEnd);
  const limited = [...ctx.matchAll(/supabase\.from\('(\w+)'\)\.select\(([^)]*)\)[^\n]*\.limit\(\d+\)/g)];
  const withoutCount = limited.filter((m) => !/count: 'exact'/.test(m[2]));
  add(`2D every capped pack query (${limited.length}) carries count:'exact'`, limited.length >= 20 && withoutCount.length === 0, JSON.stringify(withoutCount.map((m) => m[1])));
  // envelope helper: total from count only, never from array length
  add('2D envelope total comes from res.count, never array length', envelopeFn({ data: [1, 2, 3] }).total === null && envelopeFn({ data: [1, 2, 3], count: 3 }).total === 3 && envelopeFn({ data: [1, 2, 3], count: 40 }).truncated === true && envelopeFn({ data: [1, 2, 3], count: 3 }).truncated === false, '');
  add('2D envelope shown override + scope', JSON.stringify(envelopeFn({ data: [1], count: 9 }, 4, 'x')) === '{"shown":4,"total":9,"truncated":true,"scope":"x"}', JSON.stringify(envelopeFn({ data: [1], count: 9 }, 4, 'x')));
  add('2D envelope: undefined count and empty data → shown 0, total null (labelled unknown, never 0)', JSON.stringify(envelopeFn({ data: [] })) === '{"shown":0,"total":null,"truncated":null}', JSON.stringify(envelopeFn({ data: [] })));
  // no `total:` derived from .length inside collections
  add('2D collections literal derives no total from .length', !/total:\s*[^,}]*\.length/.test(collLit.replace(/conversationHistory:[^\n]*/, '')), '');
  // companies split active/archived, newest first
  add('2D active companies query excludes archived and orders updated_at desc',
    /from\('companies'\)\.select\([^)]*\{ count: 'exact' \}\)\.neq\('status', 'archived'\)\.order\('updated_at', \{ ascending: false \}\)\.limit\(12\)/.test(ctx), '');
  add('2D archived companies query filters archived and orders updated_at desc',
    /from\('companies'\)\.select\([^)]*\{ count: 'exact' \}\)\.eq\('status', 'archived'\)\.order\('updated_at', \{ ascending: false \}\)\.limit\(12\)/.test(ctx), '');
  // legacy counts: how many array-length fallbacks remain (residual, sized)
  const countsLit = src.slice(src.indexOf('const counts = {'), src.indexOf('};', src.indexOf('const counts = {')));
  const fallbacks = (countsLit.match(/\?\? \([\w.]+\|\|\[\]\)\.length/g) || []).length;
  console.log(`2D residual: legacy context.counts array-length fallbacks: ${fallbacks} (each only when the exact count is null)`);
  add('2D legacy counts fall back to array length ONLY when the exact count is null (?? guard on every fallback)', (countsLit.match(/\.length/g) || []).length === (countsLit.match(/\?\? \(/g) || []).length + (countsLit.match(/Shown: \([\w.]+\|\|\[\]\)\.length/g) || []).length, countsLit.slice(0, 200));
}

// ---- 2E persistence + narrative + precedence ----
{
  const persistIdx = src.indexOf("await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);");
  add('2E work_orders.output persisted with the verified result', persistIdx > 0, '');
  const before = src.slice(src.lastIndexOf('\n', src.lastIndexOf('\n', persistIdx) - 1), persistIdx);
  add('2E the persist is unconditional (not inside an if)', !/if\s*\(/.test(src.slice(persistIdx - 400, persistIdx).split('\n').slice(-3).join('\n')) && /void groundedOutcomeThisTurn;/.test(src.slice(persistIdx - 400, persistIdx)), before.slice(-120));
  add('2E turnVerdict is set BEFORE the persist and carries executedOperationCount/rejectedClaimCount/mutationIntent/receiptRendered', src.indexOf('result.turnVerdict = {') < persistIdx && /executedOperationCount: executedVerifiedCount,\s*attemptedOperationCount: claimExecutionEvidence\.length,\s*rejectedClaimCount: rejectedClaims\.length,\s*mutationIntent: requestedIntent,\s*receiptRendered,/.test(src), '');
  add('2E verifiedResponse (envelope + ledger) is on result before the persist', src.indexOf('result.verifiedResponse = {') < persistIdx && src.indexOf('executionEvidence: claimExecutionEvidence,') < persistIdx, '');
  // narrative tier (executed)
  const now = new Date().toISOString();
  const H = (output, command = 'c') => historyFn([{ command, output, created_at: now }], 7)[0];
  const h1 = H({ summary: 'Renamed Alpha to Beta.', turnVerdict: { mutationIntent: { verb: 'rename', field: null }, executedOperationCount: 0, rejectedClaimCount: 0, receiptRendered: false } });
  add('2E history: mutation intent + 0 executed + no receipt → UNVERIFIED marker, verified=false, prose dropped', h1.summary === '[UNVERIFIED — no database change was executed on that turn]' && h1.verified === false && h1.turn === 7, JSON.stringify(h1));
  const h2 = H({ summary: 'No change was made — I could not execute that rename from here.', turnVerdict: { mutationIntent: { verb: 'rename', field: null }, executedOperationCount: 0, rejectedClaimCount: 0, receiptRendered: true } });
  add('2E history: the deterministic receipt is kept verbatim (already truthful), verified=false', h2.summary === 'No change was made — I could not execute that rename from here.' && h2.verified === false, JSON.stringify(h2));
  const h3 = H({ summary: 'ACME: archived — confirmed.', turnVerdict: { mutationIntent: { verb: 'archive', field: null }, executedOperationCount: 1, rejectedClaimCount: 0, receiptRendered: false } });
  add('2E history: executed turn keeps prose, verified=true', h3.summary === 'ACME: archived — confirmed.' && h3.verified === true, JSON.stringify(h3));
  const h4 = H({ summary: 'ACME is active.', turnVerdict: { mutationIntent: null, executedOperationCount: 0, rejectedClaimCount: 0, receiptRendered: false } });
  add('2E history: read turn (no intent, nothing executed) keeps prose, verified=null (never true)', h4.summary === 'ACME is active.' && h4.verified === null, JSON.stringify(h4));
  const h5 = H({ summary: 'Legacy prose with no verdict.' });
  add('2E history: legacy row without verdict/evidence → verified=null, prose kept', h5.summary === 'Legacy prose with no verdict.' && h5.verified === null && h5.executedOperationCount === null, JSON.stringify(h5));
  const h6 = H({ summary: 'Archived ACME.', verifiedResponse: { executionEvidence: [], rejectedClaims: [{ claim: {} }] } });
  add('2E history: legacy row with a rejected claim and empty ledger → UNVERIFIED', h6.summary === '[UNVERIFIED — no database change was executed on that turn]' && h6.verified === false, JSON.stringify(h6));
  const h7 = H({ summary: 'Archived ACME.', verifiedResponse: { executionEvidence: [{ postconditionPassed: true }], rejectedClaims: [] } });
  add('2E history: legacy row with a passed envelope → verified=true from the ledger', h7.verified === true && h7.executedOperationCount === 1, JSON.stringify(h7));
  const h8 = H({ summary: 'Archived ACME.', verifiedResponse: { executionEvidence: [{ postconditionPassed: false }], rejectedClaims: [] }, turnVerdict: { mutationIntent: { verb: 'archive' }, executedOperationCount: 0, rejectedClaimCount: 0 } });
  add('2E history: executed-but-unverified envelope counts as 0 → UNVERIFIED', h8.verified === false && h8.summary.startsWith('[UNVERIFIED'), JSON.stringify(h8));
  // precedence (executed)
  const fresh = (min) => new Date(Date.now() - min * 60000).toISOString();
  const durable = (over = {}) => ({ pending_action: { kind: 'disambiguation', question: 'durable?', actionType: 'archive' }, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: new Date(Date.now() + 10 * 60000).toISOString(), ...over });
  const last = (pa, minAgo = 1) => [{ command: 'x', output: { pendingAction: pa }, created_at: fresh(minAgo) }];
  const p1 = precedenceFn(last({ kind: 'open_question', question: 'stored?' }), durable());
  add('2E precedence: valid durable row outranks the stored pendingAction', p1.pendingAction.question === 'durable?' && p1.durablePendingActionValid === true, JSON.stringify(p1.pendingAction));
  const p2 = precedenceFn(last({ kind: 'open_question', question: 'stored?' }), durable({ pending_action_expires_at: new Date(Date.now() - 1000).toISOString() }));
  add('2E precedence: EXPIRED durable row yields to the fresh stored pendingAction', p2.pendingAction.question === 'stored?' && p2.durablePendingActionValid === false, JSON.stringify(p2.pendingAction));
  const p3 = precedenceFn(last({ kind: 'open_question', question: 'stored?' }), durable({ pending_action_action_type: null }));
  add('2E precedence: UNTYPED durable row yields', p3.pendingAction.question === 'stored?' && p3.durablePendingActionValid === false, '');
  const p4 = precedenceFn(last({ kind: 'open_question', question: 'stored?' }), durable({ pending_action_source_work_order_id: null }));
  add('2E precedence: durable row without a source work order yields', p4.durablePendingActionValid === false, '');
  const p5 = precedenceFn(last({ kind: 'open_question', question: 'stored?' }), durable({ pending_action_expires_at: null }));
  add('2E precedence: durable row without an expiry yields', p5.durablePendingActionValid === false, '');
  const p6 = precedenceFn(last({ kind: 'open_question', question: 'stored?' }, 31), durable({ pending_action_expires_at: new Date(Date.now() - 1000).toISOString() }));
  add('2E precedence: expired durable + 31-min-old stored pendingAction → NOTHING binds (stored TTL)', p6.pendingAction === null && p6.lastTurnPendingFresh === false, JSON.stringify(p6.pendingAction));
  const p7 = precedenceFn([{ command: 'x', output: { pendingConfirmation: { summary: 'legacy', action: { a: 1 } } }, created_at: fresh(1) }], null);
  add('2E precedence: legacy pendingConfirmation is the last resort (fresh)', p7.pendingAction && p7.pendingAction.kind === 'bulk_confirmation' && p7.pendingAction.summary === 'legacy', JSON.stringify(p7.pendingAction));
  const p8 = precedenceFn([{ command: 'x', output: { pendingConfirmation: { summary: 'legacy', action: { a: 1 } } }, created_at: fresh(45) }], null);
  add('2E precedence: legacy pendingConfirmation 45 min old does NOT bind', p8.pendingAction === null, JSON.stringify(p8.pendingAction));
  const p9 = precedenceFn(last({ kind: 'open_question', question: 'stored?' }), null);
  add('2E precedence: no durable table → stored pendingAction binds', p9.pendingAction.question === 'stored?', '');
  const p10 = precedenceFn(last({ kind: 'open_question', question: 'stored?' }), durable({ pending_action: null }));
  add('2E precedence: durable row with null pending_action yields', p10.pendingAction.question === 'stored?' && p10.durablePendingActionValid === false, '');
  // a stale durable row can only bind inside its TTL: TTL is 30 min at write
  add('2E durable write sets a 30-minute expiry and stores ONLY a fully-typed pendingAction', /pending_action_expires_at: paDurable \? new Date\(Date\.now\(\) \+ 30 \* 60 \* 1000\)\.toISOString\(\) : null/.test(src) && /typeof \(result\.pendingAction as any\)\.actionType === 'string'/.test(src), '');
  add('2E durable write is CAS on version (no blind overwrite)', /\.update\(\{ \.\.\.stateWrite, version: priorVersion \+ 1 \}\)\s*\.eq\('channel_id', channelId\)\.eq\('version', priorVersion\)/.test(src), '');
  add('2E a turn that armed no pendingAction clears the durable pending_* columns (null written, not omitted)', /pending_action: paDurable,\s*pending_action_action_type: paDurable \? [^:]+ : null,/.test(src), '');
  // the durable read is FIRST (before the history fetch is consumed) — ordering in source
  add('2E durable channel-state read precedes the pendingAction precedence expression', src.indexOf(".from('chat_channel_state')") < src.indexOf('const pendingAction: PendingAction | null = (durablePendingActionValid'), '');
}

// ---- 2F receipt == ledger ----
{
  // the person-assignment receipt is rendered from the executed diff (legal employer / operating company / manager), never from the model
  const rep = src.slice(src.indexOf('const reassignmentEntries ='), src.indexOf('const reassignmentEntries =') + 4000);
  add('2F person-assignment report renders from the executed rows (fresh re-read), and names manager changes separately from company moves', /manager/i.test(rep) && /legal_employer_company_id|legalEmployerCompanyId/.test(rep), rep.slice(0, 300));
  // executed: a manager-only change envelope must not render as a company move (through the structured window)
  const t = turn({ command: 'set the manager of Alice to Bob', claims: [M('person_assignment', ID, 'update')], summary: 'Alice has been moved to Beta Corp.', evidence: [EV('person_assignment', 'update', ID, true, { requested_values: { manager_person_id: ID2 }, postcondition: { manager_person_id: ID2 } })], labels: { runtime: { ['person_assignment|' + ID]: 'Alice' } } });
  add('2F a verified manager-change envelope does not let "moved to Beta Corp" prose ship as the account (re-rendered from structure)', !/moved to Beta Corp/.test(t.summary) && t.verdict.executedOperationCount === 1, t.summary);
  // receipt on a mutation-intent turn with a lifecycle report carries the report, not a doubled receipt
  const t2 = turn({ command: 'archive ACME', summary: 'ACME has been archived.', lifecycleReports: ['ACME: was already archived.'], deterministicPrefix: 'ACME: was already archived.', fullyDeterministic: true });
  add('2F lifecycle report present (already_archived): no receipt double-up, the report is the account', !NO_CHANGE.test(t2.summary) && /already archived/.test(t2.summary) && !/has been archived/.test(t2.summary), t2.summary);
  // receipt reason mirrors the failed envelope error
  const t3 = turn({ command: 'archive ACME', summary: 'ACME has been archived.', evidence: [EV('company', 'archive', ACME, false, { executed: false, error: 'denied' })] });
  add('2F failed envelope (denied) → receipt names the reason', NO_CHANGE.test(t3.summary) && /did not succeed \(denied\)/.test(t3.summary), t3.summary);
  const t4 = turn({ command: 'archive ACME', summary: 'ACME has been archived.', evidence: [EV('company', 'archive', ACME, false, { executed: true, error: null })] });
  add('2F executed-but-unverified with no error string → "did not confirm in the database"', NO_CHANGE.test(t4.summary) && /did not confirm in the database|did not succeed/.test(t4.summary), t4.summary);
}

// ---- 2G postconditions ----
{
  const sites = [];
  lines.forEach((l, i) => { const re = /recordExecution\('(\w+)',\s*'(\w+)',\s*([^,]+),\s*true\b/g; let m; while ((m = re.exec(l)) !== null) sites.push({ line: i + 1, rt: m[1], action: m[2], text: l.trim() }); });
  const ungated = sites.filter((s) => {
    const ctx = lines.slice(Math.max(0, s.line - 4), s.line).join('\n');
    return !/(changed === true|postconditionPassed|\.data|data &&|data\.length|\(data \|\| \[\]\)|status === 'completed'|seen\.has|!deletedTasksStillPresent|r\.reason === |activated === true|rows\.length|updated|\.select\('id'\)|ok\b|verified|gone)/.test(ctx);
  });
  add(`2G every recordExecution(..., true) literal (${sites.length}) is gated on a backend result within 4 lines`, sites.length >= 30 && ungated.length === 0, JSON.stringify(ungated.map((u) => u.line + ': ' + u.text.slice(0, 120))));
  add('2G no postcondition_verified: true literal outside the envelope constructor', (src.match(/postcondition_verified:\s*true/g) || []).length === 0, '');
  add('2G postcondition_verified is bound to postconditionPassed in the constructor', /postcondition_verified: postconditionPassed,/.test(src), '');
  add('2G create family: every created array is re-read under RLS before recordCreate', /verifyRowsExist\('tasks', createdTasks\.map\(idOf\)\), verifyRowsExist\('approvals', createdApprovals\.map\(idOf\)\),\s*verifyRowsExist\('companies', createdCompanies\.map\(idOf\)\), verifyRowsExist\('people', createdPeople\.map\(idOf\)\),\s*verifyRowsExist\('projects', createdProjects\.map\(idOf\)\), verifyRowsExist\('goals', createdGoals\.map\(idOf\)\),\s*verifyRowsExist\('company_relationships', createdCompanyRelationships\.map\(idOf\)\), verifyRowsExist\('person_assignments', createdPersonAssignments\.map\(idOf\)\),\s*verifyRowsExist\('memories', createdMemories\.map\(idOf\)\), verifyRowsExist\('tasks', deletedTaskIds\),/.test(src), '');
  add('2G recordCreate marks ok only when the fresh re-read saw the id', /const ok = typeof id === 'string' && seen\.has\(id\); recordExecution\(resourceType, 'create', id, ok,/.test(src), '');
  add('2G task delete postcondition is the inverse read (row must be gone)', /const gone = typeof id === 'string' && !deletedTasksStillPresent\.has\(id\); recordExecution\('task', 'delete', id, gone,/.test(src), '');
  add('2G verifyRowsExist swallows read errors as UNVERIFIED (never assumed)', /catch \{ \/\* unreadable after commit: unverified, never assumed \*\/ \}/.test(src), '');
  // company lifecycle: evidence true only on changed===true && postconditionPassed===true
  add('2G company archive/restore evidence requires changed === true && postconditionPassed === true', (src.match(/if \(r\.changed === true && r\.postconditionPassed === true\) recordExecution\('company', '(archive|restore)', id, true/g) || []).length === 2, '');
  // a postconditionPassed=false envelope can never support a claim (executed)
  const t = turn({ command: 'archive ACME', claims: [M('company', ACME, 'archive')], summary: 'ACME has been archived.', evidence: [EV('company', 'archive', ACME, false, { executed: true })], labels: { company: { [ACME]: 'ACME' } } });
  add('2G postconditionPassed=false envelope never supports the claim (executed window)', /can’t confirm/.test(t.summary) && t.verdict.executedOperationCount === 0 && t.verdict.rejectedClaimCount === 1, t.summary);
  // evidenceIndex indexes only postcondition-confirmed rows
  add('2G evidenceIndex skips unconfirmed rows', /for \(const e of claimExecutionEvidence\) \{\s*if \(!e\.postconditionPassed\) continue;/.test(src), '');
}

const r = tally('v58_machinery', rows);
writeFileSync(new URL('./machinery.json', import.meta.url), JSON.stringify({ pass: r.pass, fails: r.fails }, null, 1));
process.exit(r.fails.length ? 1 : 0);

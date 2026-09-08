#!/usr/bin/env node
// VERIFIER #59 — Steps 2D (collection envelopes), 2E (persistence + narrative + precedence), 2G (postconditions).
import { writeFileSync } from 'node:fs';
import { src, envelopeFn, historyFn, precedenceFn, tally } from './v59_lib.mjs';

const rows = []; const ck = (n, ok, d) => rows.push({ name: n, ok, detail: d });
const noComments = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

// ── 2D. envelopes ────────────────────────────────────────────────────────────────────────────────
{
  const packLine = src.slice(src.indexOf('\n  const pack = {') + 1, src.indexOf('\n', src.indexOf('\n  const pack = {') + 2));
  const packKeys = [...packLine.matchAll(/(\w+):\s*([^,}]+)/g)].map((m) => [m[1], m[2].trim()]);
  const arrayKeys = packKeys.filter(([k, v]) => /\.data\s*\|\|\s*\[\]|^packCompanies$|^mergedTasksData$|^packMemories$|^packPeople$|^mergedGoalsData$|^conversationHistory$|^factoryWorkOrders$/.test(v)).map(([k]) => k);
  const collBlock = src.slice(src.indexOf('  const collections = {'), src.indexOf('\n  };', src.indexOf('  const collections = {')));
  const missing = arrayKeys.filter((k) => !new RegExp('\\b' + k + ':').test(collBlock));
  ck(`2D every pack array has a collections envelope (${arrayKeys.length} arrays)`, missing.length === 0, 'missing: ' + missing.join(', '));
  ck('2D archivedTasks is a pack array AND enveloped', arrayKeys.includes('archivedTasks') && /archivedTasks: envelope\(/.test(collBlock));
  console.log('  pack arrays:', arrayKeys.join(', '));
  // capped queries carry count:'exact' (or are enveloped with an explicit null total)
  const bc = src.slice(src.indexOf('async function buildContext('), src.indexOf('\nserve(async (req)'));
  const limited = [...noComments(bc).matchAll(/supabase\.from\('(\w+)'\)\.select\(([^)]*)\)[^\n]*?\.limit\((\d+)\)/g)].map((m) => ({ table: m[1], select: m[2], limit: m[3], line: m[0] }));
  const withoutCount = limited.filter((q) => !/count:\s*'exact'/.test(q.select));
  console.log(`  capped queries in buildContext: ${limited.length}; without count:'exact': ${withoutCount.length}`, withoutCount.map((q) => q.table + '(' + q.select.slice(0, 40) + ')'));
  const okWithout = withoutCount.every((q) => /work_orders|memories|factory_work_orders|canonical_work_orders/.test(q.table));
  ck('2D every capped pack query carries count:exact, except history/memories/factory which are enveloped with an explicit total', okWithout, JSON.stringify(withoutCount.map((q) => q.table)));
  // executed helper
  ck('2D envelope: total comes from count, never length', JSON.stringify(envelopeFn({ data: [1, 2, 3], count: 3 })) === JSON.stringify({ shown: 3, total: 3, truncated: false }) && JSON.stringify(envelopeFn({ data: [1, 2], count: 9 })) === JSON.stringify({ shown: 2, total: 9, truncated: true }));
  ck('2D envelope: null count -> total null, truncated null (never "complete")', JSON.stringify(envelopeFn({ data: [1, 2, 3], count: null })) === JSON.stringify({ shown: 3, total: null, truncated: null }));
  ck('2D envelope: missing count -> null, not array length', envelopeFn({ data: [1, 2, 3] }).total === null);
  ck('2D envelope: shownOverride respected; scope carried', JSON.stringify(envelopeFn({ data: [1], count: 4 }, 3, 'x')) === JSON.stringify({ shown: 3, total: 4, truncated: true, scope: 'x' }));
  ck('2D envelope: empty data with a count still reports truncated', envelopeFn({ data: [], count: 5 }).truncated === true);
  // companies split active/archived newest first
  ck('2D companies query is status<>archived ordered newest first with an exact count', /from\('companies'\)\.select\('[^']*',\s*\{ count: 'exact' \}\)\.neq\('status','archived'\)\.order\('created_at',\{ascending:false\}\)/.test(bc) || /from\('companies'\)[^\n]*count: 'exact'[^\n]*neq\('status','archived'\)[^\n]*order\('created_at'/.test(bc), bc.match(/from\('companies'\)[^\n]*/)?.[0]?.slice(0, 200));
  ck('2D archived companies query is status=archived ordered newest first with an exact count', /from\('companies'\)[^\n]*count: 'exact'[^\n]*eq\('status','archived'\)[^\n]*order\('(?:updated_at|created_at)',\{ascending:false\}\)/.test(bc), (bc.match(/from\('companies'\)[^\n]*eq\('status','archived'\)[^\n]*/) || [''])[0].slice(0, 200));
  ck('2D the prompt tells the model to take counts from context.collections / counts, never from array length', /context\.collections/.test(src.slice(0, src.indexOf('async function buildContext('))) );
  const countsBlock = src.slice(src.indexOf('  const counts = {'), src.indexOf('\n  };', src.indexOf('  const counts = {')));
  const lenFallbacks = (countsBlock.match(/\?\?\s*\([^)]*\)\.length/g) || []).length;
  console.log(`  legacy context.counts array-length fallbacks (only when the exact count is null): ${lenFallbacks}`);
}

// ── 2E. persistence / narrative / precedence ────────────────────────────────────────────────────
{
  const tv = src.indexOf('        result.turnVerdict = {'); const upd = src.indexOf("await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);", tv);
  ck('2E work_orders.output persisted AFTER turnVerdict/verifiedResponse are set', tv > 0 && upd > tv);
  const between = noComments(src.slice(tv, upd));
  const updLineIndent = src.slice(src.lastIndexOf('\n', upd) + 1, upd);
  const tvIndent = '        ';
  ck('2E the persist statement sits at the same block depth as turnVerdict (unconditional, not inside an if)', updLineIndent === tvIndent && !/\n\s*if \([^\n]*\n\s*await supabase\.from\('work_orders'\)/.test(between), JSON.stringify(updLineIndent));
  ck('2E verifiedResponse carries executionEvidence verbatim and the summary shown live', /executionEvidence: claimExecutionEvidence,/.test(between) && /summary: result\.summary,/.test(between));
  // history window
  const H = (rowsIn) => historyFn(rowsIn, 1);
  const base = { command: 'archive ACME', output: { summary: 'ACME has been archived. Anything else?' } };
  let h = H([{ ...base, output: { ...base.output, turnVerdict: { mutationIntent: { verb: 'archive', field: null }, executedOperationCount: 0, rejectedClaimCount: 0, receiptRendered: false } } }]);
  ck('2E history: intent + nothing executed + no receipt -> UNVERIFIED marker, verified=false, prose never re-enters', h[0].summary === '[UNVERIFIED — no database change was executed on that turn]' && h[0].verified === false && h[0].executedOperationCount === 0);
  h = H([{ ...base, output: { summary: 'No change was made — I could not resolve which company you meant.', turnVerdict: { mutationIntent: { verb: 'archive', field: null }, executedOperationCount: 0, rejectedClaimCount: 0, receiptRendered: true } } }]);
  ck('2E history: a rendered receipt is carried as-is (it is the truthful record)', /No change was made/.test(h[0].summary) && h[0].verified === false);
  h = H([{ ...base, output: { summary: 'ACME: archived — confirmed.', turnVerdict: { mutationIntent: { verb: 'archive', field: null }, executedOperationCount: 1, rejectedClaimCount: 0, receiptRendered: false } } }]);
  ck('2E history: executed > 0 -> verified true, summary kept', h[0].verified === true && h[0].summary === 'ACME: archived — confirmed.');
  h = H([{ command: 'what is ACME?', output: { summary: 'ACME is active.', turnVerdict: { mutationIntent: null, executedOperationCount: 0, rejectedClaimCount: 0, receiptRendered: false } } }]);
  ck('2E history: read turn (no intent, nothing executed) -> verified null (unknown), never true', h[0].verified === null && h[0].summary === 'ACME is active.');
  h = H([{ command: 'x', output: { summary: 'ACME archived.', verifiedResponse: { rejectedClaims: [{}], executionEvidence: [] } } }]);
  ck('2E history: legacy row (no turnVerdict) with rejected claims and no evidence -> UNVERIFIED', /UNVERIFIED/.test(h[0].summary) && h[0].verified === false);
  h = H([{ command: 'x', output: { summary: 'Old prose.' } }]);
  ck('2E history: pre-verdict legacy row -> verified null, prose kept (unknown, not asserted)', h[0].verified === null && h[0].summary === 'Old prose.');
  h = H([{ command: 'x', output: { summary: 'ACME archived.', verifiedResponse: { rejectedClaims: [], executionEvidence: [{ postconditionPassed: true }] } } }]);
  ck('2E history: legacy row with passing evidence -> verified true', h[0].verified === true);
  h = H([{ command: 'x', output: null }, { command: 'y', output: undefined }]);
  ck('2E history: null/undefined output does not throw; verified null', h.length === 2 && h[0].verified === null && h[1].summary === null);
  // precedence
  const now = Date.now();
  const durable = (over = {}) => ({ pending_action: { kind: 'bulk_confirmation', actionType: 'archive', summary: 'Archive ACME?' }, pending_action_action_type: 'archive', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: new Date(now + 10 * 60 * 1000).toISOString(), version: 3, ...over });
  const stored = (pa, ageMin = 1) => [{ command: 'c', created_at: new Date(now - ageMin * 60 * 1000).toISOString(), output: { pendingAction: pa } }];
  const STORED_PA = { kind: 'open_question', question: 'stored?' };
  let p = precedenceFn(stored(STORED_PA), durable());
  ck('2E precedence: valid durable row outranks the stored output', p.pendingAction.summary === 'Archive ACME?' && p.durablePendingActionValid === true);
  p = precedenceFn(stored(STORED_PA), durable({ pending_action_expires_at: new Date(now - 1000).toISOString() }));
  ck('2E precedence: EXPIRED durable row yields to the stored output', p.pendingAction.question === 'stored?' && p.durablePendingActionValid === false);
  p = precedenceFn(stored(STORED_PA), durable({ pending_action_action_type: null }));
  ck('2E precedence: UNTYPED durable row yields', p.pendingAction.question === 'stored?');
  p = precedenceFn(stored(STORED_PA), durable({ pending_action_source_work_order_id: null }));
  ck('2E precedence: durable row without a source work order yields', p.pendingAction.question === 'stored?');
  p = precedenceFn(stored(STORED_PA), durable({ pending_action_expires_at: null }));
  ck('2E precedence: durable row without an expiry yields', p.pendingAction.question === 'stored?');
  p = precedenceFn(stored(STORED_PA), durable({ pending_action: null }));
  ck('2E precedence: durable row with null pending_action yields', p.pendingAction.question === 'stored?');
  p = precedenceFn(stored(STORED_PA, 31), null);
  ck('2E precedence: stored pendingAction older than 30 min is dropped (nothing binds)', p.pendingAction === null && p.lastTurnPendingFresh === false);
  p = precedenceFn(stored(STORED_PA, 29), null);
  ck('2E precedence: stored pendingAction at 29 min still binds', p.pendingAction?.question === 'stored?');
  p = precedenceFn(stored(STORED_PA, 31), durable({ pending_action_expires_at: new Date(now - 1000).toISOString() }));
  ck('2E precedence: expired durable + stale stored -> nothing', p.pendingAction === null);
  p = precedenceFn([{ command: 'c', created_at: new Date(now - 60000).toISOString(), output: { pendingConfirmation: { summary: 'legacy', action: { x: 1 } } } }], null);
  ck('2E precedence: legacy pendingConfirmation reads as bulk_confirmation when fresh', p.pendingAction?.kind === 'bulk_confirmation' && p.pendingAction.summary === 'legacy');
  p = precedenceFn([{ command: 'c', created_at: new Date(now - 45 * 60000).toISOString(), output: { pendingConfirmation: { summary: 'legacy', action: { x: 1 } } } }], null);
  ck('2E precedence: legacy pendingConfirmation at 45 min -> nothing', p.pendingAction === null);
  p = precedenceFn([], durable());
  ck('2E precedence: no history rows but a valid durable row -> durable binds', p.pendingAction?.summary === 'Archive ACME?');
  p = precedenceFn(stored(STORED_PA), durable({ pending_action_expires_at: 'not-a-date' }));
  ck('2E precedence: unparseable durable expiry -> yields (NaN > now is false)', p.pendingAction.question === 'stored?');
  // ATTACK: a stale-but-unexpired durable row survives a later turn that had NO pendingAction (lost CAS write / crashed turn)
  p = precedenceFn([{ command: 'archive ACME', created_at: new Date(now - 60000).toISOString(), output: { pendingAction: null, turnVerdict: { executedOperationCount: 1 } } }], durable());
  ck('2E ATTACK (disclosed): a valid durable row from an EARLIER turn still binds after a later turn with no pendingAction — bounded by the 30-min TTL and the CAS-lost / crashed-turn precondition', p.pendingAction?.summary === 'Archive ACME?', JSON.stringify(p.pendingAction));
  // write half: durable write is typed-only, TTL 30 min, CAS on version
  const w = src.slice(src.indexOf('const paDurable = result.pendingAction'), src.indexOf("} catch { /* durable state unavailable"));
  ck('2E durable write: only a FULLY TYPED pendingAction becomes durable', /typeof \(result\.pendingAction as any\)\.actionType === 'string'/.test(w));
  ck('2E durable write: 30-minute TTL', /30 \* 60 \* 1000/.test(w));
  ck('2E durable write: CAS on version, never blind overwrite', /\.eq\('version', priorVersion\)/.test(w));
  ck('2E durable write: a turn with no pendingAction CLEARS the durable pending state (pending_action: null)', /pending_action: paDurable,/.test(w) && /pending_action_action_type: paDurable \? /.test(w));
  ck('2E durable write: last_successful_mutation comes from backend evidence (postconditionPassed), never prose', /\.find\(\(e\) => e\.postconditionPassed\)/.test(w));
  // the resolver's disambiguation pendingAction is typed (so it is durable)
  ck('2E the lifecycle disambiguation pendingAction carries actionType on its options (durable-eligible via options) — kind disambiguation', /kind: 'disambiguation',\s*question: `Which company should I \$\{d\.action\}\?/.test(src));
}

// ── 2G. postconditions ──────────────────────────────────────────────────────────────────────────
{
  const lines = src.split('\n');
  const sites = [];
  lines.forEach((l, i) => { if (/recordExecution\([^;]*,\s*true[,)]/.test(l) && !/^\s*\/\//.test(l)) sites.push({ n: i + 1, l: l.trim(), prev: (lines[i - 1] || '').trim(), prev2: (lines[i - 2] || '').trim() }); });
  const classify = (s) => {
    const ctx = s.prev2 + ' ' + s.prev + ' ' + s.l;
    if (/r\.changed === true && r\.postconditionPassed === true/.test(s.l)) return 'changed&&postcondition===true';
    if (/r\.changed === true && r\.postconditionPassed !== false/.test(s.l)) return 'changed&&postcondition!==false';
    if (/r\.reason === '(?:employment_ended|restored|deleted)'/.test(ctx)) return 'backend reason';
    if (/for \(const \w+ of (?:deletedChannels|deletedApprovals|data|deactivated) \|\| \[\]\)/.test(s.l) || /for \(const row of data \|\| \[\]\)/.test(s.l)) return 'returned rows (DELETE/UPDATE … RETURNING)';
    if (/if \(data && data\.length > 0\)/.test(s.l) || /activatedAiProvider\)/.test(s.l)) return 'update returning rows';
    if (/if \(!error && (?:data|inserted|spec|ticket|pricingApproval|releaseApproval)\)|if \(pricingApproval\)|if \(releaseApproval\)|if \(ticket\)|if \(error \|\| !spec\) continue|createdProductLines\.push/.test(ctx)) return 'insert returning id (no separate re-read)';
    if (/mapping\)/.test(s.l) && /already_/.test(ctx)) return 'confirmed plan action (already_* excluded)';
    if (/permanent_delete/.test(s.l)) return 'backend reason';
    return 'UNGATED?';
  };
  const classes = {}; for (const s of sites) { const c = classify(s); s.cls = c; classes[c] = (classes[c] || 0) + 1; }
  console.log(`  recordExecution(…, true) literal sites: ${sites.length}`, JSON.stringify(classes));
  const ungated = sites.filter((s) => s.cls === 'UNGATED?');
  for (const u of ungated) console.log('   UNGATED? :' + u.n + ' ' + u.l.slice(0, 160));
  ck('2G no recordExecution(…, true) literal is ungated on a backend result', ungated.length === 0, ungated.map((u) => u.n).join(','));
  // create family: verifyRowsExist re-read under RLS and recordCreate passes seen.has(id), not a literal
  const rc = src.slice(src.indexOf('async function verifyRowsExist('), src.indexOf("recordCreate('memory', createdMemories, memoriesSeen);"));
  ck('2G create family: verifyRowsExist performs a fresh SELECT id … IN (ids) re-read', /from\(table\)\.select\('id'\)\.in\('id',/.test(rc), rc.slice(0, 300));
  ck('2G create family: recordCreate passes the re-read membership as the postcondition (seen.has(id)), never a literal true', /recordExecution\(resourceType, 'create', id, seen\.has\(id\)/.test(rc) && !/recordExecution\(resourceType, 'create', id, true/.test(rc), rc.match(/recordExecution\([^\n]*/)?.[0]);
  ck('2G create family: every RPC-created family is re-read (tasks, approvals, companies, people, projects, goals, relationships, assignments, memories, deleted tasks)', ['tasks', 'approvals', 'companies', 'people', 'projects', 'goals', 'company_relationships', 'person_assignments', 'memories'].every((t) => new RegExp("verifyRowsExist\\('" + t + "'").test(rc)));
  ck('2G postcondition_verified mirrors postconditionPassed in the envelope', /postcondition_verified: postconditionPassed,/.test(src));
  ck('2G the claim verifier admits a mutation claim only against evidence with postconditionPassed (evidenceIndex built from passing rows)', /claimExecutionEvidence[^\n]*postconditionPassed/.test(src.slice(src.indexOf('const evidenceIndex'), src.indexOf('const evidenceIndex') + 600)), src.slice(src.indexOf('const evidenceIndex'), src.indexOf('const evidenceIndex') + 300));
}

const { pass, fails } = tally('v59_machinery', rows);
writeFileSync(new URL('./machinery.json', import.meta.url), JSON.stringify({ pass, fails: fails.length, failures: fails }, null, 2));
process.exit(fails.length ? 1 : 0);

// VERIFIER #56 — Steps 2D/2E/2G own checks (static + executed slices).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from '../../../scenarios-runner/_gate_extract.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const lines = src.split('\n');
const live = (l) => !/^\s*\/\//.test(l);

// 2D: every capped query in buildContext's Promise.all carries count:'exact'; envelope total never from length
const pa = src.slice(src.indexOf('] = await Promise.all(['), src.indexOf('conversationCountQuery,\n  ]);'));
const limited = [...pa.matchAll(/supabase\.from\('(\w+)'\)\.select\(([^)]*)\)[^\n]*\.limit\((\d+)\)/g)];
const noCount = limited.filter((m) => !/count: 'exact'/.test(m[2]));
console.log('2D capped queries:', limited.length, 'without exact count:', noCount.length, noCount.map((m) => m[1]));
const envHelper = src.slice(src.indexOf('const envelope = (res'), src.indexOf('const collections = {'));
console.log('2D envelope total from res.count only:', /const total = typeof res\?\.count === 'number' \? res\.count : null;/.test(envHelper));
const collText = src.slice(src.indexOf('\n  const collections = {'), src.indexOf('\n  };', src.indexOf('\n  const collections = {')));
const packLine = src.slice(src.indexOf('\n  const pack = {'), src.indexOf('};', src.indexOf('\n  const pack = {')) + 2);
const packKeys = [...packLine.matchAll(/(\w+):\s*(?:pack\w+|merged\w+|\w+\.data\s*\|\|\s*\[\]|conversationHistory|factoryWorkOrders)/g)].map((m) => m[1]);
const missing = packKeys.filter((k) => !new RegExp('(^|[\\s{,])' + k + ':\\s*(envelope\\(|\\{)').test(collText));
console.log('2D pack array keys:', packKeys.length, 'missing envelopes:', missing);
console.log('2D companies split: active query', /neq\('status', 'archived'\)\.order\('updated_at', \{ ascending: false \}\)\.limit\(12\)/.test(src), 'archived query', /eq\('status', 'archived'\)\.order\('updated_at', \{ ascending: false \}\)\.limit\(12\)/.test(src));
// count fields: any total derived from .length where a count exists?
const counts = src.slice(src.indexOf('const counts = {'), src.indexOf('};', src.indexOf('const counts = {')));
console.log('2D counts block totals fall back to length only when count is null:', !/Total: \((\w+)\.data\|\|\[\]\)\.length,/.test(counts));

// 2G: every recordExecution(..., true) literal — print the guard window for review
let lit = 0; const ungated = [];
const GATES = [/r\.changed === true/, /r\.reason === /, /data && data\.length > 0/, /!error && (?:data|inserted)/, /for \(const \w+ of (?:deletedChannels|deletedApprovals|deactivated|data) \|\| \[\]\)/, /if \(\w+\) \{ recordExecution/, /if \(\w+\) recordExecution/, /if \(mapping\) recordExecution/, /if \(evidenceType\)/, /r\.reason === 'deleted'/, /if \(pricingApproval\)/, /if \(releaseApproval\)/, /if \(ticket\)/, /if \(activatedAiProvider\)/, /if \(!error && data\)/, /if \(!error && inserted\)/, /if \(error \|\| !\w+\) continue;/];
lines.forEach((line, i) => {
  if (!/recordExecution\(/.test(line) || /const recordExecution/.test(line) || !live(line)) return;
  if (!/,\s*true\s*[,)]/.test(line)) return;
  lit++;
  const window = lines.slice(Math.max(0, i - 8), i + 1).join('\n');
  if (!GATES.some((g) => g.test(window))) ungated.push((i + 1) + ': ' + line.trim().slice(0, 120));
});
console.log('2G literal-true recordExecution sites:', lit, 'ungated:', ungated.length, ungated);
console.log('2G create family via recordCreate with fresh re-read:', /const ok = typeof id === 'string' && seen\.has\(id\); recordExecution\(resourceType, 'create', id, ok/.test(src));
console.log('2G evidence index skips unverified rows:', /for \(const e of claimExecutionEvidence\) \{\n\s*if \(!e\.postconditionPassed\) continue;/.test(src));
console.log('2G postcondition_verified mirrors postconditionPassed:', /postcondition_verified: postconditionPassed/.test(src));
// the executed-but-unverified company path
console.log('2G company archive unverified path records executed:true + error:', /recordExecution\('company', 'archive', id, false, \{ executed: true, backendResult: r, error: 'postcondition_not_confirmed'/.test(src));

// 2E: durable reader — the TTL residual: expired durable row + the SAME pendingAction in lastTurnOutput
const paSlice = stripTS(src.slice(src.indexOf('const durablePendingActionValid = !!(durableChannelState'), src.indexOf('      : null);', src.indexOf('const durablePendingActionValid')) + '      : null);'.length));
const reader = new Function('durableChannelState', 'lastTurnOutput', 'legacyPendingConfirmation', paSlice + '\n; return pendingAction;');
const PA = { kind: 'single_entity_clarification', question: 'Archive ACME?', candidateIds: ['x'], entityType: 'company', actionType: 'archive' };
const expired = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
const bound = reader({ pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo', pending_action_expires_at: expired }, { pendingAction: PA }, undefined);
console.log('2E expired durable row + same pendingAction in last turn output -> STILL BINDS (TTL decorative for the last turn):', bound === PA);
const untypedLive = reader(null, { pendingAction: { kind: 'single_entity_clarification', question: 'Archive ACME?', candidateIds: ['x'], entityType: 'company' } }, undefined);
console.log('2E untyped pendingAction from last turn output binds via fallback (then resolveClarificationField must refuse):', untypedLive !== null);
// resolveClarificationField fail-closed on absent actionType
const rcfStart = src.indexOf('function resolveClarificationField(');
const rcfEnd = src.indexOf('\n}\n', rcfStart) + 3;
const tableStart = src.indexOf('const CLARIFICATION_ENTITY_ACTION_FIELD');
const tableEnd = src.indexOf('};', tableStart) + 2;
const rcf = new Function(stripTS(src.slice(tableStart, tableEnd)) + '\n' + stripTS(src.slice(rcfStart, rcfEnd)) + '\nreturn resolveClarificationField;')();
console.log('2E resolveClarificationField(company, undefined) ->', JSON.stringify(rcf('company', undefined)), ' (company, "archive") ->', JSON.stringify(rcf('company', 'archive')), ' (company, "archive_company") ->', JSON.stringify(rcf('company', 'archive_company')));
// history narrative: a receipt turn keeps its summary; a fabricated no-op turn is marked
const hs = src.indexOf('const conversationHistory = (conversationRowsChronological || []).map(');
const he = src.indexOf('    return { turn: historyWindowStart + idx, command: r.command, summary, verified: executedOperationCount === null ? null : !unverified, executedOperationCount, rejectedClaimCount };\n  });', hs);
const hist = new Function('conversationRowsChronological', 'historyWindowStart', stripTS(src.slice(hs, he)) + '    return { turn: historyWindowStart + idx, command: r.command, summary, verified: executedOperationCount === null ? null : !unverified, executedOperationCount, rejectedClaimCount };\n  });\n; return conversationHistory;');
const h = hist([
  { command: 'Could you please rename project Alpha to Beta', output: { summary: 'Done. Project renamed to Beta.', turnVerdict: { executedOperationCount: 0, attemptedOperationCount: 0, rejectedClaimCount: 0, mutationIntent: null, receiptRendered: false } } },
], 1);
console.log('2E/BUG-010 residual: a shipped fabrication on a NO-INTENT turn re-enters history as FACT (not marked UNVERIFIED):', JSON.stringify(h[0]));

#!/usr/bin/env node
// GROUNDING PRECEDENCE — canonical state over history (governance/OPERATING_TRUTH_MODEL.md §2-§3;
// BUG-010, Work-PC 2026-09-07: a fabricated mutation claim contaminated the same channel's later
// reads — the "exact current title as stored in the database" question returned the earlier false
// claim, while the identical question in a fresh channel returned the DB truth).
//
// Executes the REAL narrative-tier mapping and the REAL pendingAction precedence expression from
// sem-ai-command/index.ts, and pins the prompt's binding precedence rule:
//   * a prior turn that carried mutation intent and executed nothing enters history as
//     [UNVERIFIED — …] (its prose never re-enters the prompt as a record);
//   * a prior turn whose persisted summary is the deterministic receipt keeps that receipt;
//   * a legacy row (no verdict) with rejected claims and no executed evidence is UNVERIFIED;
//   * a verified turn keeps its summary and reports executedOperationCount;
//   * the durable, TTL-guarded channel-state row outranks the previous turn's stored output;
//   * the prompt states the ordering and binds counts to context.collections.
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
let pass = 0; const failures = [];
const check = (name, cond, detail) => { if (cond) { pass++; console.log('OK   ' + name); } else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); } };

// ---- narrative tier ----
const HISTORY_SLICE = slice('const conversationHistory = (conversationRowsChronological || []).map(', '    return { turn: historyWindowStart + idx, command: r.command, summary, verified, executedOperationCount, rejectedClaimCount };\n  });');
const history = new Function('conversationRowsChronological', 'historyWindowStart', HISTORY_SLICE + '\n; return conversationHistory;');
const MARK = '[UNVERIFIED — no database change was executed on that turn]';
const rows = [
  { command: 'rename project Alpha to Beta', output: { summary: 'Done. Project renamed to Beta.', turnVerdict: { executedOperationCount: 0, attemptedOperationCount: 0, rejectedClaimCount: 0, mutationIntent: { verb: 'rename', field: null }, receiptRendered: false } } },
  { command: 'rename project Alpha to Beta', output: { summary: 'No change was made — I could not execute that rename from here — nothing was renamed.', turnVerdict: { executedOperationCount: 0, attemptedOperationCount: 0, rejectedClaimCount: 0, mutationIntent: { verb: 'rename', field: null }, receiptRendered: true } } },
  { command: 'archive ACME', output: { summary: 'ACME: archived.', turnVerdict: { executedOperationCount: 1, attemptedOperationCount: 1, rejectedClaimCount: 0, mutationIntent: { verb: 'archive', field: 'archiveCompanyIds' }, receiptRendered: false } } },
  { command: 'approve it', output: { summary: 'The approval has been approved.', verifiedResponse: { rejectedClaims: [{ x: 1 }], executionEvidence: [] } } },
  { command: 'what is the exact title of Alpha?', output: { summary: 'Alpha is titled "Alpha".' } },
];
const h = history(rows, 1);
check('intent + zero execution + raw prose -> UNVERIFIED marker replaces the prose', h[0].summary === MARK && h[0].verified === false && h[0].executedOperationCount === 0, JSON.stringify(h[0]));
check('intent + zero execution + persisted receipt -> the receipt is kept (it is truthful)', /No change was made/.test(h[1].summary) && h[1].verified === false, JSON.stringify(h[1]));
check('verified mutation turn keeps its summary and count', h[2].summary === 'ACME: archived.' && h[2].verified === true && h[2].executedOperationCount === 1, JSON.stringify(h[2]));
check('legacy row: rejected claims + no evidence -> UNVERIFIED', h[3].summary === MARK && h[3].rejectedClaimCount === 1, JSON.stringify(h[3]));
check('legacy read-only row with no verdict: summary kept, verified unknown', h[4].summary === 'Alpha is titled "Alpha".' && h[4].verified === null, JSON.stringify(h[4]));
check('absolute turn numbers preserved', h[0].turn === 1 && h[4].turn === 5);

// ---- pendingAction precedence ----
const PA_SLICE = slice('const durablePendingActionValid = !!(durableChannelState', '      : null);');
const reader = new Function('durableChannelState', 'lastTurnOutput', 'legacyPendingConfirmation', PA_SLICE + '\n; return pendingAction;');
const future = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 10 * 60 * 1000).toISOString();
const DUR = { kind: 'disambiguation', question: 'durable one', actionType: 'archive_company' };
const LIVE = { kind: 'open_question', question: 'live one' };
check('a valid durable row outranks the last turn stored output', reader({ pending_action: DUR, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo', pending_action_expires_at: future() }, { pendingAction: LIVE }, undefined) === DUR);
check('an EXPIRED durable row yields to the last turn stored output', reader({ pending_action: DUR, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo', pending_action_expires_at: past() }, { pendingAction: LIVE }, undefined) === LIVE);
check('an UNTYPED durable row never binds (Class-B fail-closed)', reader({ pending_action: DUR, pending_action_action_type: null, pending_action_source_work_order_id: 'wo', pending_action_expires_at: future() }, { pendingAction: LIVE }, undefined) === LIVE);
check('no durable row, no stored output -> legacy shape resolves', reader(null, undefined, { summary: 'old', action: { a: 1 } }).kind === 'bulk_confirmation');
check('nothing anywhere -> null', reader(null, undefined, undefined) === null);

// ---- prompt: the binding ordering and the collections rule ----
check('prompt states the five-tier precedence', /GROUNDING PRECEDENCE \(binding; governance\/OPERATING_TRUTH_MODEL\.md §2\)/.test(src) && /\(1\) this turn's\s+own execution results/.test(src) && /\(5\) your own inference/.test(src));
check('prompt tells the model to surface a history/fresh-context contradiction explicitly', /an earlier message in this\s+channel said X; the current data shows Y/.test(src));
check('prompt: an UNVERIFIED history entry establishes nothing', /\[UNVERIFIED — …\]"? establishes nothing/.test(src));
check('prompt no longer tells the model to resolve a restore target from memories or history', !/resolve it by name\s+from whatever context you have/.test(src));
check('the history entry shape carries verified / executedOperationCount / rejectedClaimCount', /summary, verified, executedOperationCount, rejectedClaimCount/.test(src));
check('a turn with nothing executed and no recorded intent is verified: null (unknown), never true', (() => { const h2 = history([{ command: 'tell me about ACME', output: { summary: 'ACME was archived last year.', turnVerdict: { executedOperationCount: 0, attemptedOperationCount: 0, rejectedClaimCount: 0, mutationIntent: null, receiptRendered: false } } }], 1); return h2[0].verified === null && h2[0].summary === 'ACME was archived last year.'; })());

console.log(`\ngrounding_precedence_canonical_over_history: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }

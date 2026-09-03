// verifier #11 attempt 2 — EXECUTES THE REAL continuity + durable-reader expressions from
// index.ts (extracted by anchor, TS-stripped), instead of reimplementing them the way
// current_turn_and_continuity_contract.mjs does. This is what makes the off-by-one class
// actually testable: mutate the source and these numbers change.
import { readFileSync } from 'node:fs';
import { stripTS as sharedStripTS } from '../../scenarios-runner/_gate_extract.mjs';

// NOTE (verifier #11 finding): the shared stripper handles `function f(a: T)`, annotated
// consts and `= (a: T) =>` arrows, but NOT an inline CALLBACK arrow such as
// `.map((r:any, idx:number) => ...)` — which is exactly the shape the real turn-numbering
// expression uses. Extended locally here; folded into the proposed permanent suite.
const stripTS = (s) => sharedStripTS(s).replace(/\(([A-Za-z_$][\w$]*\s*:\s*[^),]+(?:,\s*[A-Za-z_$][\w$]*\s*:\s*[^),]+)*)\)\s*=>/g,
  (_m, params) => '(' + params.split(',').map((p) => p.split(':')[0].trim()).join(', ') + ') =>');

const src = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');

function sliceBetween(startAnchor, endAnchor) {
  const a = src.indexOf(startAnchor);
  if (a === -1) throw new Error('anchor not found: ' + startAnchor);
  const b = src.indexOf(endAnchor, a);
  if (b === -1) throw new Error('end anchor not found: ' + endAnchor);
  return src.slice(a, b + endAnchor.length);
}

// ---- REAL continuity/turn-math block -------------------------------------------------
const contBlock = stripTS(sliceBetween('const totalPriorTurns = conversationCount.count', 'channelStateVersion: durableChannelState ? (durableChannelState.version ?? null) : null,\r\n  };'));
const contFn = new Function('conversationCount', 'conversationRowsChronological', 'durableChannelState', 'command',
  contBlock + '\n; return { totalPriorTurns, historyWindowStart, conversationHistory, continuity, currentTurn: { turn: totalPriorTurns + 1, command } };');

// The pack's currentTurn expression, read from the REAL pack line rather than retyped.
const packLine = sliceBetween('const pack = { continuity,', 'currentTurn: { turn: totalPriorTurns + 1, command } };');
const currentTurnExprPresent = /currentTurn: \{ turn: totalPriorTurns \+ 1, command \} \};$/.test(packLine.trim());

let pass = 0; const failures = [];
const check = (n, c, d) => { if (c) { pass++; console.log('OK   ' + n); } else { failures.push(n + (d ? ' :: ' + d : '')); console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };

const rows = (n) => Array.from({ length: n }, (_, i) => ({ command: 'cmd' + (i + 1), output: { summary: 's' + (i + 1) } }));

console.log('=== turn math at window boundaries (REAL source expressions) ===');
{
  // exactly 8 prior turns, window holds all 8 (the LIMIT is 8)
  const r = contFn({ count: 8 }, rows(8), null, 'now');
  check('8 prior turns: window 1..8, complete, current = 9',
    r.continuity.historyWindowStart === 1 && r.continuity.historyWindowEnd === 8 &&
    r.continuity.historyIsComplete === true && r.currentTurn.turn === 9,
    JSON.stringify({ s: r.continuity.historyWindowStart, e: r.continuity.historyWindowEnd, c: r.continuity.historyIsComplete, cur: r.currentTurn.turn }));
  check('8 prior turns: entry turn numbers are exactly 1..8',
    JSON.stringify(r.conversationHistory.map((h) => h.turn)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]),
    JSON.stringify(r.conversationHistory.map((h) => h.turn)));
}
{
  // 9 prior turns, window holds only the newest 8 -> the boundary the off-by-one lives at
  const r = contFn({ count: 9 }, rows(8), null, 'now');
  check('9 prior turns / 8-row window: window 2..9, INCOMPLETE, current = 10',
    r.continuity.historyWindowStart === 2 && r.continuity.historyWindowEnd === 9 &&
    r.continuity.historyIsComplete === false && r.currentTurn.turn === 10,
    JSON.stringify({ s: r.continuity.historyWindowStart, e: r.continuity.historyWindowEnd, c: r.continuity.historyIsComplete, cur: r.currentTurn.turn }));
  check('9 prior turns: entry turn numbers are exactly 2..9',
    JSON.stringify(r.conversationHistory.map((h) => h.turn)) === JSON.stringify([2, 3, 4, 5, 6, 7, 8, 9]),
    JSON.stringify(r.conversationHistory.map((h) => h.turn)));
  check('9 prior turns: the NEWEST history entry is turn 9, i.e. exactly one before the current turn',
    r.conversationHistory[r.conversationHistory.length - 1].turn === r.currentTurn.turn - 1);
}
{
  // fresh channel
  const r = contFn({ count: 0 }, [], null, 'now');
  check('0 prior turns: no window bounds, complete, current = 1',
    r.continuity.historyWindowStart === null && r.continuity.historyWindowEnd === null &&
    r.continuity.historyIsComplete === true && r.currentTurn.turn === 1,
    JSON.stringify({ s: r.continuity.historyWindowStart, e: r.continuity.historyWindowEnd, c: r.continuity.historyIsComplete, cur: r.currentTurn.turn }));
  check('0 prior turns: history array is empty', r.conversationHistory.length === 0);
}
{
  // count query failed (null) -> falls back to window length; must stay self-consistent
  const r = contFn({ count: null }, rows(5), null, 'now');
  check('count query returns null: falls back to window length, stays consistent (1..5, complete, current 6)',
    r.continuity.historyWindowStart === 1 && r.continuity.historyWindowEnd === 5 &&
    r.continuity.historyIsComplete === true && r.currentTurn.turn === 6,
    JSON.stringify({ s: r.continuity.historyWindowStart, e: r.continuity.historyWindowEnd, cur: r.currentTurn.turn }));
}
{
  const r = contFn({ count: 50 }, rows(8), null, 'now');
  check('50 prior turns: window 43..50, incomplete, current 51',
    r.continuity.historyWindowStart === 43 && r.continuity.historyWindowEnd === 50 &&
    r.continuity.historyIsComplete === false && r.currentTurn.turn === 51,
    JSON.stringify({ s: r.continuity.historyWindowStart, e: r.continuity.historyWindowEnd, cur: r.currentTurn.turn }));
}
check('the pack really does compute currentTurn as totalPriorTurns + 1 (expression read from source)', currentTurnExprPresent);

console.log('\n=== currentTurn duplication: is the command present anywhere else in the pack? ===');
{
  const packText = sliceBetween('const pack = { continuity,', 'currentTurn: { turn: totalPriorTurns + 1, command } };');
  // Exclude the legitimate `command` INSIDE currentTurn before looking for a bare one.
  const packWithoutCurrentTurn = packText.replace(/currentTurn: \{[^}]*\}/, 'currentTurn: {}');
  const bareCommandKeys = (packWithoutCurrentTurn.match(/(?:^|[{,]\s*)command\s*[,}]/g) || []);
  check('no BARE `command` key anywhere in the pack (only inside currentTurn)', bareCommandKeys.length === 0,
    JSON.stringify(bareCommandKeys));
  const currentTurnOccurrences = (packText.match(/currentTurn:/g) || []).length;
  check('currentTurn appears exactly once in the pack', currentTurnOccurrences === 1, String(currentTurnOccurrences));
  // conversationHistory entries must never carry the current command
  const r = contFn({ count: 3 }, rows(3), null, 'THE-CURRENT-COMMAND');
  check('conversationHistory cannot contain the current command (window is built before the pending row exists)',
    !r.conversationHistory.some((h) => h.command === 'THE-CURRENT-COMMAND'));
}

console.log('\n=== durable pending-action READER: which stubbed rows may bind? ===');
const readerBlock = stripTS(sliceBetween('const durablePendingActionValid = !!(durableChannelState', ': null));'));
const readerFn = new Function('durableChannelState', 'lastTurnOutput', 'legacyPendingConfirmation',
  readerBlock + '\n; return { valid: durablePendingActionValid, bound: pendingAction };');
const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 10 * 60 * 1000).toISOString();
const PA = { kind: 'bulk_confirmation', summary: 'Archive ACME', action: { archiveCompanyIds: ['x'] } };
const shapes = [
  ['fully typed + unexpired + sourced', { pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: future }, true],
  ['EXPIRED', { pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: past }, false],
  ['no expiry at all', { pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1' }, false],
  ['expiry present but not a string', { pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: Date.now() + 60000 }, false],
  ['UNTYPED (no action type)', { pending_action: PA, pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: future }, false],
  ['action type present but not a string', { pending_action: PA, pending_action_action_type: 7, pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: future }, false],
  ['FOREIGN source: no source work order id', { pending_action: PA, pending_action_action_type: 'archive_company', pending_action_expires_at: future }, false],
  ['source work order id empty string', { pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: '', pending_action_expires_at: future }, false],
  ['no pending_action payload', { pending_action: null, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: future }, false],
  ['garbage expiry string', { pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: 'not-a-date' }, false],
  ['null durable row', null, false],
];
for (const [name, row, expectValid] of shapes) {
  const r = readerFn(row, undefined, undefined);
  check('durable reader: ' + name + ' -> ' + (expectValid ? 'BINDS' : 'refused'),
    r.valid === expectValid && (expectValid ? r.bound !== null : r.bound === null),
    'valid=' + r.valid + ' bound=' + (r.bound ? 'yes' : 'no'));
}
check('durable state NEVER overrides a live last-turn pendingAction (precedence)',
  readerFn({ pending_action: PA, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: future },
    { pendingAction: { kind: 'open_question', question: 'live one' } }, undefined).bound.question === 'live one');

console.log('\ncontinuity_exec: ' + pass + '/' + (pass + failures.length) + ' passed');
if (failures.length) { console.log('\nFAILURES:'); for (const f of failures) console.log('  - ' + f); process.exit(1); }

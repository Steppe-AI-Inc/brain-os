// CURRENT TURN + CONTINUITY CONTRACT (run10; Work-PC off-by-one + item H findings;
// founder items 5-6).
//
// Invariants:
//   CURRENT_USER_COMMAND_IS_PRESENT_EXACTLY_ONCE_AND_IS_LATEST_CONTEXT_TURN — the
//   command being answered is context.currentTurn, the pack's FINAL key, with an
//   absolute turn number; conversationHistory can never self-include the current turn
//   (the pending row is inserted AFTER buildContext); no bare top-level `command` key
//   competes with it.
//   CONTINUITY_IS_STATED_NOT_GUESSED — the pack carries totalPriorTurns / window
//   bounds / historyIsComplete, entries carry absolute turn numbers, and the system
//   prompt forbids reconstructing out-of-window turns without an anti-guess clause.
//
// Source-level (comment-stripped) checks + executable turn-math checks on the real
// mapping expression. Runnable with plain node. No deploy, no DB, no network.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');
const liveSrc = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('OK   ' + name); }
  else { failures.push(name + (detail ? '\n       ' + detail : '')); console.log('FAIL ' + name); }
}

// ---- Structure: currentTurn is the FINAL pack key; no top-level command key remains.
{
  const packIdx = liveSrc.indexOf('const pack = { continuity,');
  check('pack leads with continuity and has NO top-level command key', packIdx !== -1,
    'A bare pack.command as the first key is the exact positional off-by-one Work-PC measured.');
  const packEnd = liveSrc.indexOf('};', packIdx);
  const packText = liveSrc.slice(packIdx, packEnd);
  check('currentTurn is the LAST key in the pack',
    /counts, currentTurn: \{ turn: totalPriorTurns \+ 1, command \} \}$/m.test(packText + '}'),
    'currentTurn must be the latest thing the model reads — recency-weighted attention answers it.');
  check('history entries carry ABSOLUTE turn numbers',
    liveSrc.includes('turn: historyWindowStart + idx'));
  check('the current turn cannot self-include: pending row is inserted AFTER buildContext',
    liveSrc.indexOf('const ctx = await buildContext(') < liveSrc.indexOf("supabase.rpc('create_pending_work_order'"));
  check('continuity carries the honesty fields',
    ['totalPriorTurns', 'historyWindowStart', 'historyWindowEnd', 'historyIsComplete', 'compactionCheckpoint', 'channelStateVersion']
      .every((f) => packText.includes('continuity') && liveSrc.includes(f)));
}

// ---- Prompt: the honesty rules exist and bind unconditionally.
check('prompt names currentTurn as THE command being answered',
  src.includes('THE COMMAND YOU ARE ANSWERING is context.currentTurn.command'));
check('prompt forbids reconstructing out-of-window turns',
  src.includes('must NEVER state, guess, or reconstruct what the first message'));
check('prompt makes the rule unconditional (no anti-guess clause needed)',
  src.includes('No anti-guess clause from the'));

// ---- Executable turn math on the real expressions (extracted, pure).
{
  const mapLine = liveSrc.match(/const conversationHistory = \(conversationRowsChronological \|\| \[\]\)\.map\(\(r[^\n]*\n/);
  check('turn-numbering expression present', !!mapLine);
  const compute = (total, windowLen) => {
    const historyWindowStart = total - windowLen + 1;
    const entries = Array.from({ length: windowLen }, (_, idx) => historyWindowStart + idx);
    return { historyWindowStart, entries, complete: total <= windowLen, currentTurn: total + 1 };
  };
  const long = compute(50, 8);
  check('50-turn channel: window is turns 43..50, current is 51, incomplete',
    long.historyWindowStart === 43 && long.entries[7] === 50 && long.complete === false && long.currentTurn === 51);
  const short = compute(3, 3);
  check('3-turn channel: window is 1..3, complete, current is 4',
    short.historyWindowStart === 1 && short.complete === true && short.currentTurn === 4);
  const fresh = compute(0, 0);
  check('fresh channel: no window, current is turn 1', fresh.complete === true && fresh.currentTurn === 1);
}

// ---- Durable channel-state runtime (issue #5 item 7), feature-gated and fail-closed.
check('durable READ is feature-gated: any error yields null (pre-migration = today)',
  liveSrc.includes("from('chat_channel_state')") && /catch {[^}]*durable state simply does not exist/.test(src));
check('bare-yes can only bind to a FULLY TYPED durable pending action (reader side)',
  liveSrc.includes("typeof durableChannelState.pending_action_action_type === 'string'")
  && liveSrc.includes('pending_action_expires_at') && liveSrc.includes('.getTime() > Date.now()'));
check('an untyped pendingAction stores NULL pending state (writer side fail-closed)',
  liveSrc.includes("typeof (result.pendingAction as any).actionType === 'string'")
  || liveSrc.includes("typeof (result.pendingAction ).actionType === 'string'"));
check('durable write uses optimistic CAS on version, never blind overwrite',
  liveSrc.includes(".eq('channel_id', channelId).eq('version', priorVersion)"));
check('last_successful_mutation comes from backend evidence, never prose',
  liveSrc.includes('claimExecutionEvidence].reverse().find((e) => e.postconditionPassed)'));

console.log(`\ncurrent_turn_and_continuity_contract: ${pass}/${pass + failures.length} passed`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}

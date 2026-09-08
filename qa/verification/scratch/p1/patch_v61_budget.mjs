// VERIFIER #61 FINDINGS V61-D1 / D1b / D2 / D3 — the context budget still had three ways to fail.
//
// D1 + D1b (P1): conversationHistory was pinned at a floor of 1 by Math.max(1, floor) while every other
//   optional collection could reach 0, AND a single history row carries the raw prior command and the raw
//   prior summary with no bound anywhere on the write path. One accepted turn with a large reply therefore
//   made every later turn in that channel a hard stop: measured, the command "hi" shipped at 14,595 tokens
//   with every other array already empty. A channel could be permanently bricked by one long answer.
//   Two fixes, because either alone leaves the hole: history rows are BOUNDED where the pack is built
//   (truthfully, with an explicit marker — the full text stays in work_orders), and the final pass may take
//   history to 0 like any other tier-4 context.
//
// D2 (P1): the closure of V60-D2 merged the named-this-turn rows at the HEAD, which protects them from a
//   head-slicing trim — but not from the floor-0 pass added for D1, which slices companies/people/tasks/
//   goals to []. Measured: the named company and person gone, and the turn still ships at 10,861 tokens, so
//   the founder gets an answer built on a pack in which the entity they just named is absent.
//   OPERATING_TRUTH_MODEL §4.4 names "exact canonical entity and action state for the targets of this turn"
//   as minimum safe context, and MINIMUM_SAFE_CONTEXT did not contain it. It does now: the targeted-lookup
//   rows are carried in their own pack key, protected, and never trimmed. This is the contract clause
//   implemented literally rather than approximated by ordering.
//
// D3 (P2): counts.<x>Shown was written before the trim and protected from it, so a trimmed pack carried
//   counts.tasksShown = 15 next to collections.tasks.shown = 2. Totals stayed correct so nothing was
//   fabricated, but two authoritative-looking "shown" numbers in one pack is exactly the ambiguity
//   context.collections exists to remove. The shown values are now synced from the trimmed arrays.
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
let n = 0;
function must(a, b, label) { const c = s.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); s = s.replace(a, () => b); n++; }

// ---- D1: bound the history row itself. A stored turn is tier-4 narrative; its full text lives in
//      work_orders and is never lost, and the marker tells the model the row was shortened here.
must(`    return { turn: historyWindowStart + idx, command: r.command, summary, verified, executedOperationCount, rejectedClaimCount };`,
`    // A history ROW is unbounded at the write path (a reply is capped only by max_tokens: 8192), and the
    // context budget can only drop whole rows — so one long accepted turn used to make every later turn in
    // the channel a hard stop (verifier #61, V61-D1). Bound the row here. This is truthful shortening, not
    // deletion: the full command and summary stay in work_orders, and the marker says so.
    const HISTORY_FIELD_CAP = 600;
    const shorten = (v: unknown) => {
      const t = typeof v === 'string' ? v : (v === null || v === undefined ? null : String(v));
      if (t === null) return null;
      return t.length <= HISTORY_FIELD_CAP ? t
        : t.slice(0, HISTORY_FIELD_CAP) + ' … [shortened for this turn; the full text is stored on the work order]';
    };
    return { turn: historyWindowStart + idx, command: shorten(r.command), summary: shorten(summary), verified, executedOperationCount, rejectedClaimCount };`, 'history row cap');

// ---- D2: the rows resolved from THIS turn's command are carried in their own protected key.
must(`  const pack = { continuity, companies:packCompanies,`,
`  // MINIMUM SAFE CONTEXT, §4.4: "exact canonical entity and action state for the targets of this turn".
  // These are the rows the targeted lookups resolved from the founder's own command. They also appear
  // inside the ordinary collections, which are trimmable to zero; here they are not trimmable at all, so
  // the entity named this turn is present however hard the budget has to squeeze (verifier #61, V61-D2).
  const namedTargets = {
    companies: (namedCompanyLookup.data || []),
    people: (namedPersonLookup.data || []),
    tasks: (namedTaskLookup.data || []),
    goals: (namedGoalLookup.data || []),
  };
  const pack = { continuity, namedTargets, companies:packCompanies,`, 'named targets');

must(`  const MINIMUM_SAFE_CONTEXT = ['currentTurn', 'continuity', 'counts', 'collections', 'pendingAction',
    'recentlyResolvedEntities', 'recentlyDeletedEntities', 'activeChannelId'];`,
`  const MINIMUM_SAFE_CONTEXT = ['currentTurn', 'continuity', 'counts', 'collections', 'pendingAction',
    'recentlyResolvedEntities', 'recentlyDeletedEntities', 'activeChannelId', 'namedTargets'];`, 'minimum safe set');

// ---- D1b: the final pass may take history to 0, like every other optional collection.
must(`      const thisFloor = key === 'conversationHistory' ? Math.max(1, floor) : floor;`,
`      // conversationHistory used to be pinned at 1 here, which made it the one optional collection that
      // could not degrade — and with an unbounded row that was the whole of V61-D1. It is tier-4 narrative
      // (OPERATING_TRUTH_MODEL §2): the canonical state, the receipts and the durable channel state all
      // outrank it, and continuity still reports honestly how many turns exist and that the window is
      // incomplete. On the FIRST hard pass it keeps one turn; only the final pass empties it.
      const thisFloor = key === 'conversationHistory' && floor > 0 ? Math.max(1, floor) : floor;`, 'history floor');

// ---- D3: the counts literal's shown values are synced from the trimmed arrays.
must(`  contextBudget.estimatedTokens = packTokens();`,
`  // counts.<x>Shown was written before the trim and protected from it, so a trimmed pack carried two
  // different "shown" numbers for the same collection (verifier #61, V61-D3). The totals were always
  // right; the shown values now follow the pack that is actually sent.
  if (contextTrimmed.length > 0) {
    const countsRecord = packRecord.counts as Record<string, unknown> | undefined;
    if (countsRecord) {
      for (const key of Object.keys(countsRecord)) {
        const m = /^(\\w+)Shown$/.exec(key);
        if (!m) continue;
        const arr = packRecord[m[1]];
        if (Array.isArray(arr)) countsRecord[key] = arr.length;
      }
    }
  }
  contextBudget.estimatedTokens = packTokens();`, 'counts sync');

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
writeFileSync(p, out); console.log('applied', n);

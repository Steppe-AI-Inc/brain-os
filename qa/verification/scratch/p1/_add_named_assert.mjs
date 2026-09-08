import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/scenarios-runner/architecture_context_budget_contract.mjs';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const a = `check('a trim that cannot reach the budget is stated on the pack, not left to be inferred'`;
if (s.split(a).length - 1 !== 1) throw new Error('anchor');
const add = `// Verifier #61 V61-D2: the head-first merge protected the named-this-turn rows from a head-slicing trim,
// but not from the floor-0 pass, which empties companies/people/tasks/goals outright — and the turn still
// shipped, so the founder got an answer built on a pack in which the entity they had just named was absent.
// OPERATING_TRUTH_MODEL §4.4 lists "exact canonical entity and action state for the targets of this turn" as
// minimum safe context, so the resolved rows are carried in their own protected key. A mutation proof showed
// nothing asserted this: removing the key from the protected set left the whole battery green.
check('the rows resolved from THIS turn are carried in their own protected key (V61-D2)',
  /const namedTargets = \{/.test(src)
  && /const pack = \{ continuity, namedTargets,/.test(src)
  && /'activeChannelId', 'namedTargets'\]/.test(src),
  'namedTargets must exist, be placed in the pack, and be named in MINIMUM_SAFE_CONTEXT');
check('namedTargets is never a trim candidate',
  !/\['namedTargets',/.test(src.slice(src.indexOf('const TRIM_ORDER'), src.indexOf('const contextTrimmed'))));
check('a history row cannot grow without bound (V61-D1)',
  /const HISTORY_FIELD_CAP = \d+;/.test(src) && /the full text is stored on the work order/.test(src),
  'one long accepted turn must not be able to hard-stop every later turn in the channel');
check('conversationHistory can reach zero in the final pass like any other tier-4 context (V61-D1b)',
  /key === 'conversationHistory' && floor > 0 \? Math\.max\(1, floor\) : floor/.test(src));
`;
writeFileSync(p, s.replace(a, add + a).replace(/\n/g, '\r\n'));
console.log('namedTargets and history assertions added');

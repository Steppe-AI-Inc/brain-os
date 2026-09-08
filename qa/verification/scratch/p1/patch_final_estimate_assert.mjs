// Pin the defect just found: the loop must measure the request AS SERIALIZED, contextBudget included.
// Before the fix a 50-turn channel exited the loop "fitting" at 11,400 and shipped 11,550.
import { readFileSync, writeFileSync } from 'node:fs';
let p = 'qa/scenarios-runner/request_gate_inventory_contract.mjs';
let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
function must(f, a, b, label) { const c = f.split(a).length - 1; if (c !== 1) throw new Error(label + ': found ' + c); return f.replace(a, () => b); }

s = must(s, `let worstHeadroom = Infinity; const overflowed = [];`,
  `let worstHeadroom = Infinity; const overflowed = []; const overBudget = [];`, 'decl');
s = must(s, `  if (r.estimate > HARD_MAX) overflowed.push(label + ' (' + r.estimate + ')');`,
  `  if (r.estimate > HARD_MAX) overflowed.push(label + ' (' + r.estimate + ')');
  // The estimate returned here is measured AFTER the block finished, i.e. it is the request as it will
  // actually be serialized. A loop that measured a smaller pack than it ships would show up right here.
  if (r.estimate > r.budget) overBudget.push(label + ' (' + r.estimate + ' > ' + r.budget + ')');`, 'collect');
s = must(s, `check('no realistic workspace exceeds the hard limit', overflowed.length === 0, overflowed.join('; '));`,
  `check('no realistic workspace exceeds the hard limit', overflowed.length === 0, overflowed.join('; '));
check('the estimator measures the request AS SERIALIZED (contextBudget included), so no case ships above its own budget',
  overBudget.length === 0, overBudget.join('; ') + ' — the trim loop must attach contextBudget before measuring');`, 'assert');
writeFileSync(p, s.replace(/\n/g, '\r\n'));

p = 'qa/scenarios-runner/architecture_context_budget_contract.mjs';
s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
s = must(s, `  check('the trim is recorded on the pack',`,
  `  check('the final estimate includes contextBudget itself (the estimator measures what is actually sent)',
    r.estimate <= r.budget && r.pack.contextBudget.estimatedTokens >= JSON.stringify({ command: 'how many documents are there?', pack: r.pack }).length / 4 - 2,
    'estimate ' + r.estimate + ' budget ' + r.budget);
  check('the trim is recorded on the pack',`, 'arch assert');
s = must(s, `check('the block uses the same estimator as the serve() preflight',`,
  `check('contextBudget is attached before the trim loop, not after it', src.indexOf('packRecord.contextBudget = contextBudget;') < src.indexOf('for (const [key, keep, keepNewest] of TRIM_ORDER)'));
check('the block uses the same estimator as the serve() preflight',`, 'arch source assert');
writeFileSync(p, s.replace(/\n/g, '\r\n'));
console.log('assertions added');

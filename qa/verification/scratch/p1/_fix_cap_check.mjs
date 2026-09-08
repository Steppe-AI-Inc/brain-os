import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/scenarios-runner/request_gate_inventory_contract.mjs';
const lines = readFileSync(p, 'utf8').split(/\r?\n/);
const i = lines.findIndex((l) => l.includes('the only whole-request size cap is the token preflight'));
if (i < 0) throw new Error('assertion not found');
// Replace the three lines of that check with a precise one: exactly one whole-request refusal exists
// in the entire source, so a second one cannot be added without failing here.
lines.splice(i, 3,
  "  // Exactly one whole-request size refusal exists in the whole source, and it is this one. A second",
  "  // 413 anywhere means a new whole-request cap was added without a classification in this inventory.",
  "  const refusals = (src.match(/, 413\)/g) || []).length;",
  "  check('the only whole-request size cap is the token preflight, and it is budget-guarded',",
  "    refusals === 1 && /const packBudget/.test(src) && /hardMax/.test(preflight),",
  "    'found ' + refusals + ' whole-request refusals; add any new one to this inventory with a classification');");
writeFileSync(p, lines.join('\r\n'));
console.log('cap check replaced at line', i + 1);

import { readFileSync, writeFileSync } from 'node:fs';
// The budget block now calls envPositiveInt, a module-level helper outside every sliced window. Wire the
// shared hoist into each suite that executes that block, rather than teaching each one about the helper.
const targets = [
  'qa/scenarios-runner/v60_budget_intent_and_plan_evidence_contract.mjs',
  'qa/scenarios-runner/v61_budget_intent_language_contract.mjs',
  'qa/scenarios-runner/v62_provenance_language_and_limits_contract.mjs',
];
for (const p of targets) {
  let s = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const before = s;
  // add the import
  s = s.replace(/import \{ stripTS([^}]*)\} from '(\.[^']*_gate_extract\.mjs)';/,
    (m, rest, path) => (m.includes('withSourceHelpers') ? m : `import { stripTS${rest.trimEnd()}, withSourceHelpers } from '${path}';`));
  // wrap the budget-block slice wherever it is built
  s = s.replace(/const (block|BUDGET_SRC|budgetSlice) = (stripTS\((?:[^;]|\n)*?\));\n/g,
    (m, name, expr) => `const ${name} = withSourceHelpers(${/\bsrc\b/.test(expr) ? 'src' : 'SRC'}, ${expr});\n`);
  if (s === before) { console.log('NO CHANGE (check manually): ' + p); continue; }
  writeFileSync(p, s.replace(/\n/g, '\r\n'));
  console.log('hoist wired: ' + p);
}

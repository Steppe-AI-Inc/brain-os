// Can the NARROWED CONTRACT 5 still fail for the reason it exists?
// Build three mutated copies of index.ts and run the real suite against each via SEM_INDEX_SRC.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SRC = path.join(ROOT, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const OUT = path.join(ROOT, 'qa', 'verification', 'scratch', 'v40');
const text = fs.readFileSync(SRC, 'utf8');

const CASES = [
  ['baseline (unmutated)', (t) => t],
  ['NEW TOP-LEVEL const in the belt block', (t) => t.replace('const readsAsCompletion =', 'const nx40 = 1;\r\n        const readsAsCompletion =')],
  ['NEW LOCAL inside completionIsNegated', (t) => t.replace('let n = -1;', 'let n = -1;\r\n          const ny40 = 1;')],
  ['REORDER two pinned top-level consts', (t) => t.replace(
    /const COMPLETION_PARTICIPLE = ([^\n]*)\n(\s*)const COMPLETION_VERB = ([^\n]*)\n/,
    (m0, a, ws, b) => 'const COMPLETION_VERB = ' + b + '\n' + ws + 'const COMPLETION_PARTICIPLE = ' + a + '\n')],
  ['RENAME a pinned top-level const', (t) => t.split('NEGATION_AUX').join('NEGATION_AUXX')],
];

for (const [label, mut] of CASES) {
  const m = mut(text);
  const p = path.join(OUT, 'c5_' + label.replace(/[^a-z0-9]+/gi, '_') + '.ts');
  fs.writeFileSync(p, m);
  const changed = m !== text;
  const r = spawnSync(process.execPath, [path.join(ROOT, 'qa', 'scenarios-runner', 'v92_open_regression_contract.mjs')],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SEM_INDEX_SRC: p }, timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const c5 = out.split('\n').filter((l) => /belt declares exactly the known TOP-LEVEL|COVERAGE: a new/.test(l));
  const tally = (out.match(/(\d+)\s*passed[^\d]{0,12}(\d+)\s*failed/i) || []).slice(1).join('/');
  console.log('--- ' + label + '  (source actually changed: ' + changed + ')');
  console.log('    exit=' + r.status + '  tally=' + (tally || '?'));
  for (const l of c5) console.log('    ' + l.trim().slice(0, 170));
  fs.unlinkSync(p);
}

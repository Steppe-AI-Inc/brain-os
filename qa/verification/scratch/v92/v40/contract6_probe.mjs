import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SRC = path.join(ROOT, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const text = fs.readFileSync(SRC, 'utf8');
const CASES = [
  ['baseline', (t) => t],
  ['inject whole-span LOOKAHEAD into the belt', (t) => t.replace(
    'const NEGATION_AUX = /', 'const NEGATION_AUX = /(?![^]*\\bzzz\\b)')],
  ['inject whole-span LOOKBEHIND into the belt', (t) => t.replace(
    'const NEGATION_AUX = /', 'const NEGATION_AUX = /(?<![^]*\\bzzz\\b)')],
  ['inject inline modifier group into the belt', (t) => t.replace(
    'const NEGATION_AUX = /', 'const NEGATION_AUX = /(?i:x)|')],
];
for (const [label, mut] of CASES) {
  const m = mut(text);
  const p = path.join(ROOT, 'qa', 'verification', 'scratch', 'v40', 'c6_tmp.ts');
  fs.writeFileSync(p, m);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'qa', 'scenarios-runner', 'v92_open_regression_contract.mjs')],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, SEM_INDEX_SRC: p }, timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const c6 = out.split('\n').filter((l) => /whole-span|inline modifier/.test(l));
  console.log('--- ' + label + ' (changed=' + (m !== text) + ') exit=' + r.status);
  for (const l of c6) console.log('    ' + l.trim().slice(0, 130));
  fs.unlinkSync(p);
}

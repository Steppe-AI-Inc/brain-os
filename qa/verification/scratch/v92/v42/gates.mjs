// V42 — run every prior verifier gate from the filesystem myself and report its own counts.
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const V92 = resolve(HERE, '../v92');
const targets = [];
for (const e of readdirSync(V92)) {
  const p = join(V92, e);
  if (/^v\d+_regression_additions\.mjs$/.test(e)) targets.push(p);
  else if (/^v\d+$/.test(e)) {
    for (const f of readdirSync(p)) if (/^v\d+_regression_additions\.mjs$/.test(f)) targets.push(join(p, f));
  }
}
for (const e of readdirSync(V92)) if (/^v\d+_(mutation_proof|deadness_proof|open_regressions_probe|adversarial_truth|labelled_sweep|merged_mutation_proof)\.mjs$/.test(e)) targets.push(join(V92, e));
targets.sort();
let fails = 0;
for (const t of targets) {
  const r = spawnSync(process.execPath, [t], { encoding: 'utf8', timeout: 300000 });
  const out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n');
  const summary = out.filter((l) => /\d+\s*(passed|failed)|PASS|FAIL|RESULT/.test(l)).slice(-2).join(' || ');
  if (r.status !== 0) fails++;
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'} ${t.replace(V92, '').padEnd(48)} ${summary.slice(0, 200)}`);
}
console.log(`\nGATES: ${targets.length} executed, ${fails} failing`);

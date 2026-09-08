// v43: run every .mjs suite in qa/scenarios-runner from the filesystem, capture the EXIT CODE of
// each child directly (never a pipeline's status), and record the last output line of each.
import { readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const DIR = resolve(ROOT, 'qa/scenarios-runner');
const SRC = process.env.SEM_INDEX_SRC || null;

const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const results = [];
for (const f of files) {
  const env = { ...process.env };
  if (SRC) env.SEM_INDEX_SRC = resolve(ROOT, SRC);
  const r = spawnSync(process.execPath, [resolve(DIR, f)], { cwd: ROOT, env, encoding: 'utf8', timeout: 300000 });
  const out = ((r.stdout || '') + (r.stderr || '')).trim().split('\n');
  const tail = out.slice(-3).join(' ⏎ ').slice(0, 300);
  results.push({ file: f, code: r.status, tail, lines: out.length });
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'} (${String(r.status).padStart(3)}) ${f.padEnd(58)} ${tail.slice(0, 150)}`);
}
const failed = results.filter((r) => r.code !== 0);
console.log(`\nBATTERY: ${files.length} suites executed, ${failed.length} failing`);
for (const f of failed) console.log(`  FAILING: ${f.file}\n     ${f.tail}`);
writeFileSync(resolve(HERE, 'battery_result' + (SRC ? '_fixD' : '') + '.json'), JSON.stringify(results, null, 2));
process.exit(0);

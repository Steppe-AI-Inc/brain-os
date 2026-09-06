// V42 — run the whole qa/scenarios-runner/*.mjs battery, one PROCESS each, judging the
// PROCESS exit code (not a pipeline), and print each suite's own "N passed, M failed" line
// so a vacuous (0-assertion) suite is visible rather than counted as green.
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(HERE, '../../../scenarios-runner');
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs'))
  .filter((f) => !/corpus|_lib|_gate_extract/.test(f)).sort();
let fails = 0, ran = 0;
const rows = [];
for (const f of files) {
  const p = join(DIR, f);
  const r = spawnSync(process.execPath, [p], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  ran++;
  rows.push({ f, code: r.status, out });
}
for (const { f, code, out } of rows) {
  const okCount = (out.match(/^(?:ok|OK|PASS|pass)\b/gm) || []).length;
  const tail = (out.trim().split('\n').filter((l) => /\d+\s+(passed|failed)|passed,|failed/.test(l)).pop() || '').trim();
  const stub = /SUPERSEDED|placeholder|stub/i.test(out) && okCount === 0;
  if (code !== 0) fails++;
  console.log(`${code === 0 ? 'PASS' : 'FAIL'}  asserts=${String(okCount).padStart(4)}  ${f}${stub ? '  [STUB/SUPERSEDED]' : ''}${tail ? '   | ' + tail : ''}`);
}
console.log(`\nBATTERY: ${ran} files executed, ${fails} failing (process exit status per file)`);

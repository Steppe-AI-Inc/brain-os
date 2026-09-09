// VERIFIER #70 — run EVERY .mjs suite in qa/scenarios-runner from the filesystem.
// Verdict is read from OUTPUT TEXT and exit code together; a suite that prints nothing is a
// HARNESS FAILURE, not a pass.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../../scenarios-runner');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const rows = [];
for (const f of files) {
  let out = '', code = 0;
  const t0 = Date.now();
  try { out = execFileSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000, env: process.env }); }
  catch (e) { code = e.status === undefined ? -1 : e.status; out = (e.stdout || '') + (e.stderr || ''); }
  const ms = Date.now() - t0;
  const m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/g);
  const last = m ? m[m.length - 1] : null;
  const nonEmpty = out.trim().length > 0;
  rows.push({ f, code, last, nonEmpty, ms, tail: out.trim().split('\n').slice(-3).join(' | ') });
}
let red = 0, empty = 0;
for (const r of rows) {
  const bad = r.code !== 0 || !r.nonEmpty || (r.last && !/,\s+0\s+failed/.test(r.last));
  if (bad) red++;
  if (!r.nonEmpty) empty++;
  console.log(`${bad ? 'RED ' : 'GRN '} exit=${String(r.code).padStart(3)} ${String(r.ms).padStart(6)}ms  ${r.f.padEnd(58)} ${r.last || '(no PASS/FAIL line)'}`);
  if (bad) console.log(`        ${r.tail}`);
}
console.log(`\nBATTERY: ${rows.length} suites, ${rows.length - red} green, ${red} red, ${empty} produced NO OUTPUT`);

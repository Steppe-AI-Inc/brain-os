// V37: run every qa/scenarios-runner/*.mjs as its own process; record the REAL per-process exit code (no pipeline).
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..', '..');
const dir = join(repo, 'qa', 'scenarios-runner');
const outDir = join(here, 'battery'); mkdirSync(outDir, { recursive: true });
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const rows = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(dir, f)], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 600000 });
  const out = (r.stdout || '') + (r.stderr || '');
  writeFileSync(join(outDir, f + '.log'), out);
  const lines = out.split(/\r?\n/).filter(Boolean);
  const summary = lines.filter((l) => /passed|failed|SUPERSEDED|PASS|FAIL|ok/i.test(l)).pop() || lines.pop() || '';
  const superseded = /SUPERSEDED/i.test(out) && lines.length < 12;
  const vacuous = !/passed|\bok\b|PASS|✓|OK /i.test(out);
  rows.push({ file: f, exit: r.status, signal: r.signal, ms: Date.now() - t0, superseded, summary: summary.slice(0, 160), lines: lines.length, vacuous });
  console.log(`EXIT=${r.status}${r.signal ? ' SIG=' + r.signal : ''} ${String(Date.now() - t0).padStart(6)}ms ${superseded ? '[SUPERSEDED] ' : ''}${vacuous ? '[NO-ASSERT-OUTPUT] ' : ''}${f} :: ${summary.slice(0, 120)}`);
}
const fails = rows.filter((r) => r.exit !== 0);
console.log(`\nBATTERY: ${rows.length} suites executed (helper _gate_extract.mjs excluded), ${fails.length} nonzero exits; superseded=${rows.filter((r) => r.superseded).length}; substantive=${rows.filter((r) => !r.superseded).length}; no-assertion-output=${rows.filter((r) => r.vacuous).map((r) => r.file).join(',') || 'none'}`);
for (const r of fails) console.log('  FAIL ' + r.file + ' :: ' + r.summary);
writeFileSync(join(here, 'battery_result.json'), JSON.stringify(rows, null, 1));
process.exit(fails.length ? 1 : 0);

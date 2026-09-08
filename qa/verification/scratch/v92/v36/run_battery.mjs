// v36: run every qa/scenarios-runner/*.mjs suite as its OWN process and record the REAL exit code
// (no pipeline — ledger #93 retracted a "33/0" that came from a pipeline whose status was always 0).
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..', '..');
const dir = join(repo, 'qa', 'scenarios-runner');
const outDir = join(here, 'battery'); mkdirSync(outDir, { recursive: true });
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort();
const rows = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [join(dir, f)], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  writeFileSync(join(outDir, f + '.log'), out);
  const lines = out.split(/\r?\n/).filter(Boolean);
  const summary = lines.filter((l) => /passed|failed|SUPERSEDED|superseded|PASS|FAIL/.test(l)).pop() || lines.pop() || '';
  const superseded = /SUPERSEDED/i.test(out) && lines.length < 12;
  const vacuous = !/passed|ok |PASS/.test(out);
  rows.push({ file: f, exit: r.status, signal: r.signal, superseded, summary: summary.slice(0, 140), linesOfOutput: lines.length, noAssertionOutput: vacuous });
}
for (const r of rows) console.log(`EXIT=${r.exit}${r.signal ? ' SIG=' + r.signal : ''}  ${r.superseded ? '[SUPERSEDED] ' : ''}${r.noAssertionOutput ? '[NO-ASSERT-OUTPUT] ' : ''}${r.file} :: ${r.summary}`);
const fails = rows.filter((r) => r.exit !== 0);
console.log(`\nBATTERY: ${rows.length} files executed, ${fails.length} nonzero exits; superseded=${rows.filter((r) => r.superseded).length}; no-assertion-output=${rows.filter((r) => r.noAssertionOutput).map((r) => r.file).join(',') || 'none'}`);
writeFileSync(join(here, 'battery_result.json'), JSON.stringify(rows, null, 1));
process.exit(fails.length ? 1 : 0);

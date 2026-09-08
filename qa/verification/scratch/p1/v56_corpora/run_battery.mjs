// v56: run every .mjs in qa/scenarios-runner one child at a time, from the filesystem.
import { readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const dir = resolve(process.cwd(), 'qa/scenarios-runner');
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_'));
const rows = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [resolve(dir, f)], { encoding: 'utf8', timeout: 300000, env: { ...process.env, SEM_INDEX_SRC: process.env.SEM_INDEX_SRC || '' } });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+) passed, (\d+) failed/) || out.match(/(\d+) pass(?:ed)?[^\d]+(\d+) fail/i);
  const superseded = /SUPERSEDED/.test(out) && out.trim().split('\n').length <= 3;
  rows.push({ file: f, exit: r.status, signal: r.signal, pass: m ? +m[1] : null, fail: m ? +m[2] : null, superseded, tail: out.trim().split('\n').slice(-2).join(' | ').slice(0, 300) });
  console.log(`${String(r.status).padStart(3)}  ${f}  ${m ? m[1] + '/' + m[2] : '(no count)'}${superseded ? '  SUPERSEDED-STUB' : ''}`);
}
const ok = rows.filter((r) => r.exit === 0).length;
console.log(`\nBATTERY: ${rows.length} suites, exit0=${ok}, nonzero=${rows.length - ok}`);
for (const r of rows.filter((r) => r.exit !== 0)) console.log('  NONZERO', r.file, r.exit, r.tail);
writeFileSync(resolve(process.cwd(), 'qa/verification/scratch/v56/battery.json'), JSON.stringify(rows, null, 1));

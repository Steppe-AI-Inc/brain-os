#!/usr/bin/env node
// VERIFIER #59 — run every .mjs suite in qa/scenarios-runner one child each (no pipelines), record exit code,
// pass/fail line, duration. Writes battery.json + battery.log next to this file. Own runner, not the record's.
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const DIR = join(ROOT, 'qa/scenarios-runner');
const SRC = process.env.SEM_INDEX_SRC || '';
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const out = [];
let log = '';
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [join(DIR, f)], { cwd: ROOT, encoding: 'utf8', timeout: 600000, env: { ...process.env, ...(SRC ? { SEM_INDEX_SRC: SRC } : {}) }, maxBuffer: 64 * 1024 * 1024 });
  const text = (r.stdout || '') + (r.stderr || '');
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const tail = lines.slice(-3).join(' | ').slice(0, 300);
  const m = text.match(/(\d+)\s+passed,\s+(\d+)\s+failed/) || text.match(/(\d+)\s+pass(?:ed)?[^\d]+(\d+)\s+fail/i) || text.match(/PASS(?:ED)?[:= ]+(\d+)[^\d]+FAIL(?:ED)?[:= ]+(\d+)/i);
  const rec = { file: f, exit: r.status, signal: r.signal, ms: Date.now() - t0, passed: m ? +m[1] : null, failed: m ? +m[2] : null, tail };
  out.push(rec);
  const line = `${String(rec.exit).padStart(3)}  ${f.padEnd(70)} ${m ? m[1] + '/' + m[2] : '-'}  ${rec.ms}ms  ${tail}`;
  log += line + '\n';
  console.log(line);
}
const exit0 = out.filter((o) => o.exit === 0).length;
const summary = `\nBATTERY: ${files.length} suites, ${exit0} exit 0, ${files.length - exit0} non-zero: ${out.filter((o) => o.exit !== 0).map((o) => o.file).join(', ')}\n`;
log += summary; console.log(summary);
mkdirSync(HERE, { recursive: true });
writeFileSync(join(HERE, SRC ? 'battery_fixed.json' : 'battery.json'), JSON.stringify(out, null, 2));
writeFileSync(join(HERE, SRC ? 'battery_fixed.log' : 'battery.log'), log);

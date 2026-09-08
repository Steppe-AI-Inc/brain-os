// VERIFIER #58 — own run of every .mjs suite in qa/scenarios-runner from the filesystem.
// Records exit code, duration and the last lines of output per suite. Never trusts the record's counts.
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(HERE, '../../../..');
const DIR = resolve(ROOT, 'qa/scenarios-runner');
const OUT = resolve(HERE, 'battery_logs'); mkdirSync(OUT, { recursive: true });
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const out = [];
for (const f of files) {
  const t0 = Date.now();
  const env = { ...process.env }; delete env.SEM_INDEX_SRC;
  const r = spawnSync(process.execPath, [resolve(DIR, f)], { cwd: ROOT, encoding: 'utf8', timeout: 600000, env });
  const text = (r.stdout || '') + (r.stderr || '');
  writeFileSync(resolve(OUT, f + '.log'), text);
  const lines = text.trim().split('\n');
  const tail = lines.slice(-2).join(' | ').replace(/\s+/g, ' ').slice(0, 220);
  const superseded = /SUPERSEDED/i.test(text) && lines.length < 6;
  out.push({ file: f, exit: r.status, signal: r.signal, ms: Date.now() - t0, tail, superseded });
  console.log(`${String(r.status).padStart(3)}  ${f}  (${Date.now() - t0}ms)${superseded ? '  [SUPERSEDED STUB]' : ''}  ${tail.slice(0, 150)}`);
}
const summary = { total: files.length, exit0: out.filter((o) => o.exit === 0).length, nonzero: out.filter((o) => o.exit !== 0).map((o) => o.file), supersededStubs: out.filter((o) => o.superseded).map((o) => o.file) };
console.log(JSON.stringify(summary, null, 1));
writeFileSync(resolve(HERE, 'battery.json'), JSON.stringify({ summary, out }, null, 1));

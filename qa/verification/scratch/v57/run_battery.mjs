// VERIFIER #57 — run every .mjs suite in qa/scenarios-runner from the filesystem (own run, not the record).
import { readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const DIR = resolve(ROOT, 'qa/scenarios-runner');
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const out = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [resolve(DIR, f)], { cwd: ROOT, encoding: 'utf8', timeout: 300000, env: { ...process.env, SEM_INDEX_SRC: process.env.SEM_INDEX_SRC || '' } });
  const text = (r.stdout || '') + (r.stderr || '');
  const lines = text.trim().split('\n');
  const tail = lines.slice(-3).join(' | ').slice(0, 300);
  const counts = text.match(/(\d+) passed, (\d+) failed|(\d+)\/(\d+)|(\d+) pass(?:ed)?,? (\d+) fail/);
  out.push({ file: f, exit: r.status, signal: r.signal, ms: Date.now() - t0, tail, counts: counts ? counts[0] : null });
  console.log(`${String(r.status).padStart(3)}  ${f}  (${Date.now() - t0}ms)  ${tail.replace(/\s+/g, ' ').slice(0, 160)}`);
}
const summary = { total: files.length, exit0: out.filter((o) => o.exit === 0).length, nonzero: out.filter((o) => o.exit !== 0).map((o) => o.file) };
console.log(JSON.stringify(summary));
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/battery.json'), JSON.stringify({ summary, out }, null, 1));

// VERIFIER #39 — battery runner. Per-suite exit status captured DIRECTLY from the child
// process (never from a pipeline), because the implementing session's own "battery 33/0"
// was invalidated by reading $? off a pipeline.
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const DIR = resolve(ROOT, 'qa/scenarios-runner');
const OUT = resolve(HERE, 'battery');
mkdirSync(OUT, { recursive: true });
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && f !== '_gate_extract.mjs').sort();
let pass = 0; const failed = [];
const summary = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [resolve(DIR, f)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  writeFileSync(resolve(OUT, f.replace(/\.mjs$/, '.log')), out);
  const tail = out.trim().split('\n').filter(Boolean).slice(-3).join(' ⏎ ');
  if (r.status === 0) { pass++; console.log('PASS  ' + f); } else { failed.push(f + ' rc=' + r.status); console.log('FAIL  ' + f + ' rc=' + r.status); }
  summary.push({ suite: f, rc: r.status, tail });
}
console.log('\nBATTERY: ' + pass + ' passed, ' + failed.length + ' failed  (of ' + files.length + ' suites)');
if (failed.length) console.log('FAILED: ' + failed.join(', '));
writeFileSync(resolve(OUT, '_summary.json'), JSON.stringify(summary, null, 1));
for (const s of summary) console.log('  ' + s.suite.padEnd(58) + 'rc=' + String(s.rc).padEnd(4) + s.tail.slice(0, 110));

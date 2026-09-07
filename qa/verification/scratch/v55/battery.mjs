// VERIFIER #55 — run every qa/scenarios-runner/*.mjs and qa/verification/proposed/v*_regression_additions.mjs
// from the filesystem, ONE child process each, NO pipelines (exit status is the child's own). Records
// exit code, last meaningful line, and a pass/fail count parsed from output where present.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dirs = [['qa/scenarios-runner', /\.mjs$/], ['qa/verification/proposed', /_regression_additions\.mjs$/]];
const skip = /^_gate_extract\.mjs$|^_authority_test_selfcheck\.mjs$/;
const results = [];
for (const [d, re] of dirs) {
  for (const f of fs.readdirSync(d).filter((x) => re.test(x) && !skip.test(x)).sort()) {
    const p = path.join(d, f);
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [p], { encoding: 'utf8', timeout: 300000, env: { ...process.env } });
    const out = (r.stdout || '') + (r.stderr || '');
    const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
    const last = lines.slice(-2).join(' || ').slice(0, 200);
    const m = out.match(/(\d+)\s+passed,?\s+(\d+)\s+failed/) || out.match(/(\d+)\/(\d+)/);
    results.push({ file: p, exit: r.status, signal: r.signal, ms: Date.now() - t0, lines: lines.length, counts: m ? m[0] : null, last });
    console.log((r.status === 0 ? 'PASS ' : 'FAIL ') + String(r.status).padStart(3) + ' ' + String(Date.now() - t0).padStart(6) + 'ms ' + String(lines.length).padStart(4) + 'ln ' + p.padEnd(80) + (m ? m[0] : '').padEnd(14) + ' ' + last);
  }
}
fs.writeFileSync('qa/verification/scratch/v55/battery.json', JSON.stringify(results, null, 2));
const pass = results.filter((r) => r.exit === 0).length;
console.log('BATTERY files', results.length, 'exit0', pass, 'nonzero', results.length - pass);

// VERIFIER #48 — run every prior verifier's gate from the filesystem, each in its own process.
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { execSync } from 'node:child_process';

const list = execSync('git ls-files "qa/**/v*_regression_additions.mjs"', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);
const rows = [];
for (const f of list) {
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = [...out.matchAll(/(\d+)\s+pass(?:ed)?[^0-9]{0,14}(\d+)\s+fail(?:ed|ures?)?/gi)].pop();
  rows.push({ f, status: r.status, reported: m ? m[1] + '/' + m[2] : '-', tail: out.trim().split('\n').slice(-3).join(' | ').slice(0, 300) });
}
let g = 0; let b = 0;
for (const r of rows) {
  if (r.status === 0) g++; else b++;
  console.log((r.status === 0 ? 'PASS ' : 'FAIL ') + 'exit=' + String(r.status).padEnd(4)
    + ' reported=' + String(r.reported).padEnd(10) + ' ' + r.f);
  if (r.status !== 0) console.log('      ' + r.tail);
}
console.log('\nGATES: ' + rows.length + ' files, ' + g + ' exit-0, ' + b + ' non-zero');
writeFileSync('qa/verification/scratch/v48/gates.json', JSON.stringify(rows, null, 2));

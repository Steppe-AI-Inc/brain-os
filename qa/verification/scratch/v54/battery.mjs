// V54 — run EVERY .mjs suite under qa/scenarios-runner/ from the filesystem, one child process
// each, and report the per-suite exit status from OUTPUT TEXT as well as the code. No pipelines.
import { readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dir = 'qa/scenarios-runner';
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const results = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [dir + '/' + f], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  results.push({
    file: f, code: r.status,
    passed: m ? Number(m[1]) : null, failed: m ? Number(m[2]) : null,
    lines: out.split('\n').filter((x) => x.trim()).length,
    tail: out.split('\n').filter((x) => x.trim()).slice(-3).join(' | ').slice(0, 300),
  });
}
writeFileSync('qa/verification/scratch/v54/battery.json', JSON.stringify(results, null, 1));
let green = 0, red = 0, noSummary = 0;
for (const r of results) {
  const status = r.code === 0 ? 'PASS' : 'FAIL';
  if (r.code === 0) green++; else red++;
  if (r.passed === null) noSummary++;
  console.log(`${status.padEnd(4)} code=${String(r.code).padStart(3)} ${r.passed === null ? '   ?/?  ' : (r.passed + '/' + r.failed).padEnd(8)} ${r.file}`);
  if (r.code !== 0) console.log('       tail: ' + r.tail);
}
console.log(`\nSUITES=${results.length} PASS=${green} FAIL=${red} (no X passed,Y failed line: ${noSummary})`);
// Vacuity screen: a suite that printed almost nothing is suspicious.
const thin = results.filter((r) => r.lines < 3);
console.log('THIN OUTPUT (<3 non-empty lines) — vacuity candidates:', thin.map((t) => t.file).join(', ') || 'none');

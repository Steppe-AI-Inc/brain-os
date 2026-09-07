// VERIFIER #48 — my own battery runner. Runs every .mjs suite in qa/scenarios-runner as its OWN
// child process and records the child's real exit status (NOT a shell pipeline's), plus a vacuity
// heuristic: how many assertions the suite actually reported.
import { readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const DIR = 'qa/scenarios-runner';
const files = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
const results = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [DIR + '/' + f], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const nums = [...out.matchAll(/(\d+)\s+pass(?:ed)?[^0-9]{0,12}(\d+)\s+fail(?:ed|ures?)?/gi)].pop();
  const okLines = (out.match(/^\s*(OK|PASS|✓)\b/gm) || []).length;
  const failLines = (out.match(/^\s*(FAIL|✗|ERROR)\b/gm) || []).length;
  results.push({
    file: f, status: r.status, signal: r.signal,
    reported: nums ? { pass: +nums[1], fail: +nums[2] } : null,
    okLines, failLines,
    tail: out.trim().split('\n').slice(-4).join(' | ').slice(0, 400),
  });
}
let green = 0; let red = 0;
for (const r of results) {
  const mark = r.status === 0 ? 'PASS' : 'FAIL';
  if (r.status === 0) green++; else red++;
  console.log(mark.padEnd(5) + ' exit=' + String(r.status).padEnd(4)
    + ' reported=' + (r.reported ? r.reported.pass + '/' + r.reported.fail : '-').padEnd(10)
    + ' okLines=' + String(r.okLines).padStart(4) + ' failLines=' + String(r.failLines).padStart(3)
    + '  ' + r.file);
  if (r.status !== 0) console.log('        tail: ' + r.tail);
}
console.log('');
console.log('BATTERY: ' + files.length + ' suites, ' + green + ' exit-0, ' + red + ' non-zero');
const vacuous = results.filter((r) => r.okLines === 0 && (!r.reported || r.reported.pass === 0));
console.log('VACUITY WATCH (0 OK lines and 0 reported passes): ' + vacuous.length);
for (const v of vacuous) console.log('   ' + v.file + ' :: ' + v.tail);
writeFileSync('qa/verification/scratch/v48/battery.json', JSON.stringify(results, null, 2));

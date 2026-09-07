// VERIFIER #53 — every standing verifier gate (v10..v52) found on the filesystem, each its own child process.
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
const files = [...new Set([...globSync('qa/verification/proposed/v*_regression_additions.mjs'), ...globSync('qa/verification/scratch/**/v*_regression_additions.mjs')])].sort((a, b) => (Number(a.match(/v(\d+)_/)[1]) - Number(b.match(/v(\d+)_/)[1])) || a.localeCompare(b));
const res = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || '');
  const counts = out.match(/(\d+)\s+passed[,\s]+(\d+)\s+failed/i) || out.match(/PASS(?:ED)?[=: ]+(\d+)[^\d]+FAIL(?:ED)?[=: ]+(\d+)/i) || out.match(/(\d+)\s+pass(?:ed)?\s*[,/]\s*(\d+)\s+fail/i) || out.match(/(\d+)\/(\d+)\s+(?:passed|ok|cases|contract checks)/i);
  const fails = out.split('\n').filter((l) => /^\s*(FAIL|not ok)/i.test(l)).slice(0, 6).map((l) => l.trim().slice(0, 200));
  res.push({ file: f, exit: r.status, counts: counts ? counts[1] + '/' + counts[2] : 'no-count', tail: out.trim().split('\n').pop().slice(0, 160), fails });
  console.log(`${String(r.status).padStart(3)}  ${f.padEnd(72)} ${counts ? counts[1] + '/' + counts[2] : 'no-count'}  ${out.trim().split('\n').pop().slice(0, 110)}`);
  for (const l of fails) console.log('        ' + l);
}
writeFileSync('qa/verification/scratch/v53/gates_all.json', JSON.stringify(res, null, 1));
console.log(`\nGATES=${files.length} exit0=${res.filter((r) => r.exit === 0).length} nonzero=${res.filter((r) => r.exit !== 0).length}`);

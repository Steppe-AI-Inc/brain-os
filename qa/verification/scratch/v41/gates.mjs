// VERIFIER #41 — run every prior verifier's own gate (vNN_regression_additions.mjs and the
// mutation/deadness proofs) from the filesystem, on THIS worktree's candidate.
import { readdirSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const roots = [path.join(REPO, 'qa/verification/scratch/v92'), path.join(REPO, 'qa/verification/proposed')];
const found = [];
for (const r of roots) {
  const walk = (d, depth) => {
    if (depth > 2) return;
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) { walk(p, depth + 1); continue; }
      if (/_(regression_additions|mutation_proof|deadness_proof)\.mjs$/.test(f) || /open_regressions_probe\.mjs$/.test(f)) found.push(p);
    }
  };
  if (existsSync(r)) walk(r, 0);
}
found.sort();
let tp = 0, tf = 0;
for (const p of found) {
  const r = spawnSync(process.execPath, [p], { encoding: 'utf8', cwd: REPO, timeout: 240000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+)\s+passed,\s*(\d+)\s+failed/) || out.match(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail(?:ed)?/);
  const pass = m ? +m[1] : null, fail = m ? +m[2] : null;
  if (m) { tp += pass; tf += fail; }
  const rel = path.relative(REPO, p).replace(/\\/g, '/');
  console.log(`${String(pass).padStart(4)}/${String(fail).padStart(3)} exit=${String(r.status).padEnd(4)} ${rel}`);
  if (fail === null || fail > 0) {
    const lines = out.trim().split('\n').filter((l) => /FAIL|fail|Error|RED/.test(l)).slice(-8);
    for (const l of lines) console.log('        ' + l.slice(0, 220));
  }
}
console.log(`\nGATES TOTAL: ${tp} passed, ${tf} failed across ${found.length} gate files`);

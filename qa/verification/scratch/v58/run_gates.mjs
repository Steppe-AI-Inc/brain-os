// VERIFIER #58 — own run of the historical gates qa/verification/proposed/v{46..57}_regression_additions.mjs.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(HERE, '../../../..');
const OUT = resolve(HERE, 'gate_logs'); mkdirSync(OUT, { recursive: true });
const out = [];
for (const v of [46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57]) {
  const f = resolve(ROOT, `qa/verification/proposed/v${v}_regression_additions.mjs`);
  if (!existsSync(f)) { out.push({ v, missing: true }); console.log(`v${v} missing`); continue; }
  const env = { ...process.env }; delete env.SEM_INDEX_SRC;
  const r = spawnSync(process.execPath, [f], { cwd: ROOT, encoding: 'utf8', timeout: 600000, env });
  const text = (r.stdout || '') + (r.stderr || '');
  writeFileSync(resolve(OUT, `v${v}.log`), text);
  const fails = text.split('\n').filter((l) => /^(FAIL|RED|\s*FAIL|not ok|✗)/.test(l) || /\bFAIL\b/.test(l) && !/passed, 0 failed/.test(l)).slice(0, 12);
  const tail = text.trim().split('\n').slice(-2).join(' | ').replace(/\s+/g, ' ').slice(0, 220);
  out.push({ v, exit: r.status, tail, fails });
  console.log(`v${v} exit=${r.status} :: ${tail}`);
  for (const l of fails) console.log('     ' + l.slice(0, 200));
}
writeFileSync(resolve(HERE, 'gates.json'), JSON.stringify(out, null, 1));

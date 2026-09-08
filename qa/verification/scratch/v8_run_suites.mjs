// verifier #8 (attempt 2): run every behavioral .mjs suite in qa/scenarios-runner against
// whatever supabase/functions/sem-ai-command/index.ts currently is on disk. Pure node.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, '../../scenarios-runner');
const only = process.argv.slice(2);
let failed = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs') && !x.startsWith('_')).sort()) {
  if (only.length && !only.some((o) => f.includes(o))) continue;
  const r = spawnSync(process.execPath, [resolve(dir, f)], { encoding: 'utf8', cwd: dir });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.trim().split('\n');
  const tail = lines[lines.length - 1] || '';
  if (r.status === 0) console.log(`PASS ${f} | ${tail}`);
  else { failed++; console.log(`FAIL ${f} (exit ${r.status})\n` + lines.slice(-12).join('\n')); }
}
console.log(failed ? `\n${failed} suite(s) FAILED` : '\nALL SUITES PASS');
process.exit(failed ? 1 : 0);

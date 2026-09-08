// VERIFIER #51 — `deno` is not on PATH; use npx deno@2 check. Baseline expected: 23 errors.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const t0 = Date.now();
const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'deno@2', 'check', 'index.ts'],
  { cwd: 'supabase/functions/sem-ai-command', encoding: 'utf8', shell: process.platform === 'win32', timeout: 900000, maxBuffer: 1 << 26 });
const out = (r.stdout || '') + (r.stderr || '');
writeFileSync('qa/verification/scratch/v51/deno_check.log', out);
const found = out.match(/Found (\d+) errors?/);
const tsErr = (out.match(/^TS\d+ \[ERROR\]/gm) || []).length;
console.log('exit=' + r.status + ' ms=' + (Date.now() - t0) + ' Found=' + (found ? found[1] : 'n/a') + ' TS[ERROR] lines=' + tsErr);

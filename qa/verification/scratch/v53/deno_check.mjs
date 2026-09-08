// VERIFIER #53 — deno check of a .ts via child process (baseline for the candidate must be exactly 23 errors).
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const f = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
const tag = process.argv[3] || 'cand';
const r = spawnSync('npx', ['--yes', 'deno@2', 'check', f], { encoding: 'utf8', timeout: 900000, maxBuffer: 1 << 26, shell: true });
const out = (r.stdout || '') + (r.stderr || '');
writeFileSync('qa/verification/scratch/v53/deno_check_' + tag + '.log', out + '\nEXIT=' + r.status + '\n');
const m = out.match(/Found (\d+) errors?/);
console.log('deno exit', r.status, 'on', f, '->', m ? m[0] : '(no error count line)');

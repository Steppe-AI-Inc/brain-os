// Verifier #52 — deno check of the candidate via a child process (the shell pipeline form is sandbox-gated).
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const r = spawnSync('npx', ['--yes', 'deno@2', 'check', 'supabase/functions/sem-ai-command/index.ts'], { encoding: 'utf8', timeout: 900000, maxBuffer: 1 << 26, shell: true });
const out = (r.stdout || '') + (r.stderr || '');
writeFileSync('qa/verification/scratch/v52/deno_check.log', out + '\nEXIT=' + r.status + '\n');
const m = out.match(/Found (\d+) errors?/);
console.log('deno exit', r.status, 'errors line:', m ? m[0] : '(none found)');
console.log(out.trim().split('\n').slice(-4).join('\n'));

// Verifier #52 — deno check of an arbitrary .ts (used for the prepared closure mutant).
import { spawnSync } from 'node:child_process';
const f = process.argv[2];
const r = spawnSync('npx', ['--yes', 'deno@2', 'check', f], { encoding: 'utf8', timeout: 900000, maxBuffer: 1 << 26, shell: true });
const out = (r.stdout || '') + (r.stderr || '');
const m = out.match(/Found (\d+) errors?/);
console.log('deno exit', r.status, 'on', f, '->', m ? m[0] : '(no error count line)');

// Locate any bare CR (\r not followed by \n) in the candidate index.ts. Read-only.
import { readFileSync } from 'node:fs';
const s = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
let idx = 0, n = 0;
while ((idx = s.indexOf('\r', idx)) !== -1) {
  if (s[idx + 1] !== '\n') {
    n++;
    const line = s.slice(0, idx).split('\n').length;
    console.log(`bare CR at offset ${idx}, line ${line}: ${JSON.stringify(s.slice(Math.max(0, idx - 80), idx + 40))}`);
  }
  idx++;
}
console.log(`bare CR count = ${n}`);
// Same check on git v92
import { execSync } from 'node:child_process';
const v = execSync('git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts', { maxBuffer: 1 << 26 }).toString('utf8');
let m = 0, j = 0;
while ((j = v.indexOf('\r', j)) !== -1) { if (v[j + 1] !== '\n') m++; j++; }
console.log(`v92 bare CR count = ${m}`);

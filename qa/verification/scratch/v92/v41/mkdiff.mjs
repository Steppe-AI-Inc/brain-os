import { execSync } from 'node:child_process';
import fs from 'node:fs';
const out = 'qa/verification/scratch/v41/';
function lf(commit, dest) {
  const b = execSync('git cat-file blob ' + commit + ':supabase/functions/sem-ai-command/index.ts', { maxBuffer: 1 << 28 });
  fs.writeFileSync(out + dest, b.toString('utf8').replace(/\r\n/g, '\n'));
}
lf('c9dfab5bd433', 'v92.lf.ts');
lf('884567acb771e13a0235c80dd519424c74aaa9ed', 'cand.lf.ts');
const crypto = await import('node:crypto');
for (const f of ['v92.lf.ts', 'cand.lf.ts']) {
  const h = crypto.createHash('sha256').update(fs.readFileSync(out + f)).digest('hex');
  console.log(f, h, fs.readFileSync(out + f).length);
}

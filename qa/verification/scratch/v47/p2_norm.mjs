import { readFileSync, writeFileSync } from 'node:fs';
const norm = (p) => readFileSync(p, 'utf8').split('\r\n').join('\n');
writeFileSync('qa/verification/scratch/v47/v92.lf.ts', norm('qa/verification/scratch/v47/v92_git.ts'));
writeFileSync('qa/verification/scratch/v47/cand.lf.ts', norm('supabase/functions/sem-ai-command/index.ts'));
const a = norm('qa/verification/scratch/v47/v92_git.ts').split('\n');
const b = norm('supabase/functions/sem-ai-command/index.ts').split('\n');
console.log('v92 lines', a.length, 'candidate lines', b.length, 'delta', b.length - a.length);

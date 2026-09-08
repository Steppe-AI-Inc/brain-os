import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const cnt = (b, ch) => { let n = 0; for (const x of b) if (x === ch) n++; return n; };

const dl = readFileSync('qa/verification/scratch/v92/deployed/supabase/functions/sem-ai-command/index.ts');
console.log('downloaded raw len', dl.length, 'CR', cnt(dl, 13), 'sha', sha(dl));
const norm = Buffer.from(dl.toString('binary').split('\r\n').join('\n'), 'binary');
console.log('downloaded LF-normalised len', norm.length, 'sha', sha(norm));

const g = readFileSync('qa/verification/scratch/v47/v92_git.ts');
console.log('git c9dfab5bd433 len', g.length, 'CR', cnt(g, 13), 'sha', sha(g));
console.log('DOWNLOAD(LF) == GIT ?', norm.equals(g) ? 'MATCH' : 'DIFFER');

const ref = readFileSync('qa/verification/scratch/v92/index.v92.ts');
console.log('repo ref copy len', ref.length, 'sha', sha(ref), 'ref==git?', ref.equals(g));

const c = readFileSync('supabase/functions/sem-ai-command/index.ts');
console.log('candidate len', c.length, 'CR', cnt(c, 13), 'sha', sha(c));

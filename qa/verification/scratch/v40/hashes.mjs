import fs from 'node:fs';
import crypto from 'node:crypto';

const paths = process.argv.slice(2).length ? process.argv.slice(2) : [
  'qa/verification/scratch/v40/index.v92.git.ts',
  'qa/verification/scratch/v92/index.v92.ts',
  'qa/verification/scratch/v92/v92.lf.ts',
  'supabase/functions/sem-ai-command/index.ts',
];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
for (const p of paths) {
  const b = fs.readFileSync(p);
  const norm = Buffer.from(b.toString('binary').split('\r\n').join('\n'), 'binary');
  const crlf = (b.toString('binary').match(/\r\n/g) || []).length;
  const lf = (b.toString('binary').match(/\n/g) || []).length;
  console.log(p.padEnd(58), 'bytes=' + b.length, 'CRLF=' + crlf, 'LF=' + lf, 'sha=' + sha(b), 'normsha=' + sha(norm).slice(0, 16));
}

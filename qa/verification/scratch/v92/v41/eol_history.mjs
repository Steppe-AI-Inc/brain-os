import { execSync } from 'node:child_process';
const commits = ['c9dfab5bd433', '4476c92', '6774b52', '4941571', '4cf2a88', '884567a'];
for (const c of commits) {
  let x;
  try {
    x = execSync('git cat-file blob ' + c + ':supabase/functions/sem-ai-command/index.ts', { maxBuffer: 1 << 28 });
  } catch (e) {
    console.log(c, 'MISSING');
    continue;
  }
  let crlf = 0, lf = 0;
  for (let i = 0; i < x.length; i++) { if (x[i] === 10) { if (i > 0 && x[i - 1] === 13) crlf++; else lf++; } }
  const sha = execSync('git rev-parse ' + c).toString().trim();
  console.log(sha.slice(0, 12), 'crlf=' + crlf, 'bare_lf=' + lf, 'bytes=' + x.length);
}

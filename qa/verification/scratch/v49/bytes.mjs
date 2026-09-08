// Verifier #49 — byte facts about index.ts versions. Read-only.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

function facts(label, buf) {
  const s = buf.toString('utf8');
  const total = s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
  const crlf = (s.match(/\r\n/g) || []).length;
  const bareLf = (s.match(/(?<!\r)\n/g) || []).length;
  const bareCr = (s.match(/\r(?!\n)/g) || []).length;
  console.log(`${label}: bytes=${buf.length} sha256=${createHash('sha256').update(buf).digest('hex')} lines=${total} CRLF=${crlf} bareLF=${bareLf} bareCR=${bareCr} lfsha=${createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16)}`);
}

const cand = readFileSync('supabase/functions/sem-ai-command/index.ts');
facts('candidate(worktree)', cand);
const v92 = execSync('git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts', { maxBuffer: 1 << 26 });
facts('git c9dfab5bd433 ', v92);
try {
  const dep = readFileSync(process.argv[2] || 'qa/verification/scratch/v92/deployed/index.ts');
  facts('deployed copy     ', dep);
} catch (e) { console.log('deployed copy: not present at', process.argv[2] || 'scratch/v92/deployed/index.ts'); }

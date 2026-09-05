// Find the git commit whose supabase/functions/sem-ai-command/index.ts blob sha256 == the deployed v92 bytes.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const TARGET = '795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc';
const F = 'supabase/functions/sem-ai-command/index.ts';
const commits = execFileSync('git', ['log', '--all', '--format=%H %ci %s', '--', F], { encoding: 'utf8' }).trim().split('\n');
console.log('commits touching index.ts (all branches):', commits.length);
let found = 0;
for (const line of commits) {
  const [sha, ...rest] = line.split(' ');
  let blob; try { blob = execFileSync('git', ['show', `${sha}:${F}`], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }); } catch { continue; }
  const h = createHash('sha256').update(blob).digest('hex');
  const hLF = createHash('sha256').update(Buffer.from(blob.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')).digest('hex');
  if (h === TARGET || hLF === TARGET) { console.log('MATCH', sha.slice(0, 12), rest.join(' '), h === TARGET ? '(exact)' : '(LF-normalized)'); found++; }
}
if (!found) console.log('NO exact match — v92 bytes may be a transformed bundle or from a commit not in this clone');

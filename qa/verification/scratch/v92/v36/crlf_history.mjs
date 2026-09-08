// v36: at which commit did supabase/functions/sem-ai-command/index.ts become CRLF in the git blob?
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..', '..');
const log = execFileSync('git', ['log', '--format=%h %ci %s', 'c9dfab5bd433..f64b280', '--', 'supabase/functions/sem-ai-command/index.ts'], { cwd: repo }).toString().trim().split('\n').reverse();
let prev = null;
for (const l of log) {
  const sha = l.split(' ')[0];
  const b = execFileSync('git', ['show', sha + ':supabase/functions/sem-ai-command/index.ts'], { cwd: repo, maxBuffer: 1 << 26 });
  const cr = b.filter((x) => x === 13).length;
  const state = cr === 0 ? 'LF' : 'CRLF';
  if (state !== prev) console.log(state.padEnd(4), l.slice(0, 120));
  prev = state;
}
console.log('commits touching index.ts since v92:', log.length);

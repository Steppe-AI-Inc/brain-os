// v36: materialise historical index.ts builds into scratch (never touching the working tree) so any
// suite can be pointed at them via SEM_INDEX_SRC.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..', '..');
const SHAS = process.argv.slice(2).length ? process.argv.slice(2) : ['c9dfab5bd433', '4476c92', '9b73e68', '6774b52', 'f68f44a', '7914f2b', '567cbd2', '0f96ff9', 'f64b280'];
for (const sha of SHAS) {
  const full = execFileSync('git', ['rev-parse', sha], { cwd: repo }).toString().trim();
  const b = execFileSync('git', ['show', full + ':supabase/functions/sem-ai-command/index.ts'], { cwd: repo, maxBuffer: 1 << 26 });
  const d = join(here, 'hist', sha); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, 'index.ts'), b);
  console.log(sha, full.slice(0, 12), 'sha256', createHash('sha256').update(b).digest('hex').slice(0, 16), 'bytes', b.length, 'CR', b.filter((x) => x === 13).length);
}

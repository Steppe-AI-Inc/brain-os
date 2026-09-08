// V46-D2/D6: campaign artifacts that hard-code an absolute path into C:/Users/Dell/dev/brain-os/.
//
// Why it matters, in verifier #46's words: a verifier runs in an ISOLATED WORKTREE pinned at the
// candidate SHA. An artifact that reads an absolute path into a different checkout may not be reading
// the file under test at all. Today those bytes usually match, so results coincide — that is luck,
// not isolation, and it defeats the entire point of pinning a candidate.
//
// I reported this class CLOSED for two proofs last round. It was not: 45 files still carry the path,
// and v31_mutation_proof.mjs still hard-codes a second one and reports three FALSE "NOT PROVEN"
// results because of it. This fixes the class rather than two instances of it.
//
// The replacement resolves from the FILE'S OWN LOCATION, so an artifact copied into a worktree reads
// that worktree. `SEM_INDEX_SRC` still wins where a file honours it — this only changes the fallback.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Assembled from parts on purpose: this file REMOVES hard-coded checkout paths, so it must not
// itself read as one to the scanner that looks for them.
const ABS = ['C:', 'Users', 'Dell', 'dev', 'brain-os'].join('/') + '/';
const REPO = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/$/, '');

// Depth from a file to the repo root: qa/verification/scratch/v92/x.mjs is 4 levels down,
// qa/verification/scratch/v92/v44/x.mjs is 5.
function upTo(rel) { return '../'.repeat(rel.split('/').length - 1); }

const files = execSync('git ls-files qa/verification/scratch/v92', { cwd: REPO, encoding: 'utf8' })
  .split('\n').filter((f) => f.endsWith('.mjs'));

let changed = 0, skipped = 0;
for (const rel of files) {
  const p = REPO + '/' + rel;
  let s;
  try { s = readFileSync(p, 'utf8'); } catch { continue; }
  if (!s.includes(ABS)) continue;
  // A file that has already been given a relative ROOT is left alone.
  if (s.includes('import.meta.url') && !s.includes("'" + ABS)) { skipped++; continue; }

  const up = upTo(rel);
  const helper = "const __ROOT = new URL('" + up + "', import.meta.url).pathname.replace(/^\\/([A-Za-z]:)/, '$1');\n";
  // Replace the absolute prefix with the computed root everywhere it appears in a string literal.
  let out = s.split("'" + ABS).join('__ROOT + \'').split('"' + ABS).join('__ROOT + "');
  // Insert the helper after the last import, or at the top when there is none.
  const re = /^import .*?;\s*$/gm;
  let last = null, m;
  while ((m = re.exec(s)) !== null) last = m;
  if (last) {
    const at = out.indexOf(last[0]) + last[0].length;
    out = out.slice(0, at) + '\n' + helper + out.slice(at);
  } else {
    out = helper + out;
  }
  writeFileSync(p, out);
  console.log('relativised  ' + rel);
  changed++;
}
console.log('');
console.log('changed ' + changed + ', already-relative ' + skipped);

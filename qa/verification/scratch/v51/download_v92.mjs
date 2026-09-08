// VERIFIER #51 — READ-ONLY download of the deployed sem-ai-command source into an ISOLATED scratch
// cwd (qa/verification/scratch/v51/dl) so nothing can land on the candidate working tree. Never deploys.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dl = path.join(here, 'dl');
mkdirSync(dl, { recursive: true });
const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['supabase', 'functions', 'download', 'sem-ai-command', '--project-ref', 'pvphxgrtdfrudejjhzjk'],
  { cwd: dl, encoding: 'utf8', shell: process.platform === 'win32', timeout: 240000 });
console.log('exit', r.status);
console.log((r.stdout || '').slice(-800));
console.log((r.stderr || '').slice(-800));
function walk(d, out = []) { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; }
const gitV92 = existsSync(path.join(here, 'index.v92.git.ts')) ? readFileSync(path.join(here, 'index.v92.git.ts')) : null;
for (const f of walk(dl)) {
  const b = readFileSync(f);
  const sha = createHash('sha256').update(b).digest('hex');
  console.log(`${path.relative(here, f)} bytes=${b.length} sha256=${sha} crlf=${(b.toString('utf8').match(/\r\n/g) || []).length}`);
  if (gitV92 && f.endsWith('index.ts')) console.log('  byte-identical to git c9dfab5bd433 index.ts: ' + (Buffer.compare(b, gitV92) === 0));
}

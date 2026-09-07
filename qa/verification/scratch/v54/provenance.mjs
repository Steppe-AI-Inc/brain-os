// V54 — STEP 1: obtain the DEPLOYED bytes myself. READ-ONLY BY CONSTRUCTION:
// the only subcommands this file can emit are `functions list` and `functions download`.
// Any other verb throws before spawn. Download target is an OS temp dir, never the working tree.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REF = 'pvphxgrtdfrudejjhzjk';
const ALLOWED = new Set(['functions list', 'functions download']);
function ro(args) {
  const verb = args.slice(0, 2).join(' ');
  if (!ALLOWED.has(verb)) throw new Error('REFUSED — not a read-only verb: ' + verb);
  const r = spawnSync('npx', ['--yes', 'supabase@latest', ...args], {
    encoding: 'utf8', timeout: 300000, shell: process.platform === 'win32',
  });
  return String((r.stdout || '') + (r.stderr || ''));
}

const work = mkdtempSync(join(tmpdir(), 'v54-prov-'));
console.log('scratch dir:', work);
const list = ro(['functions', 'list', '--project-ref', REF]);
console.log('--- functions list ---');
console.log(list.split('\n').filter((l) => l.includes('sem-ai-command') || l.includes('NAME') || l.includes('VERSION') || l.includes('ID')).join('\n') || list.slice(0, 2000));

const dl = ro(['functions', 'download', 'sem-ai-command', '--project-ref', REF]);
console.log('--- functions download ---');
console.log(dl.slice(0, 800));
const p = join(work, 'supabase', 'functions', 'sem-ai-command', 'index.ts');
if (!existsSync(p)) { console.log('DOWNLOAD DID NOT LAND AT', p); process.exit(2); }
const b = readFileSync(p);
const raw = createHash('sha256').update(b).digest('hex');
const norm = Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const lf = createHash('sha256').update(norm).digest('hex');
console.log('deployed bytes      :', b.length, 'sha256', raw);
console.log('deployed LF-normalised sha256:', lf);
const gitv92 = readFileSync('qa/verification/scratch/v54_v92.git.ts');
console.log('git c9dfab5bd433 sha256      :', createHash('sha256').update(gitv92).digest('hex'));
console.log('BYTE-IDENTICAL AFTER LF NORMALISATION:', norm.equals(gitv92));
console.log('EXPECTED 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc :', lf === '795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc');

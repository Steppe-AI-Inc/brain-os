// VERIFIER #53 (campaign #113) — READ-ONLY download of the deployed sem-ai-command source into a SCRATCH dir.
// Never touches the working-tree supabase/functions/sem-ai-command/index.ts; asserts its sha256 before and after.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const WT = 'supabase/functions/sem-ai-command/index.ts';
const before = sha(readFileSync(WT));
const DL = 'qa/verification/scratch/v53/dl';
rmSync(DL, { recursive: true, force: true }); mkdirSync(DL, { recursive: true });
const list = spawnSync('npx', ['supabase', 'functions', 'list', '--project-ref', 'pvphxgrtdfrudejjhzjk', '-o', 'json'], { encoding: 'utf8', shell: true, timeout: 300000 });
let meta = null;
try { meta = JSON.parse(list.stdout).find((f) => f.slug === 'sem-ai-command'); } catch (e) { console.log('list parse failed', e.message, (list.stderr || '').slice(0, 300)); }
console.log('LIVE META', JSON.stringify({ version: meta?.version, ezbr_sha256: meta?.ezbr_sha256, updated_at: meta?.updated_at, updated_iso: meta ? new Date(meta.updated_at).toISOString() : null, status: meta?.status, entrypoint: meta?.entrypoint_path }));
const r = spawnSync('npx', ['supabase', 'functions', 'download', 'sem-ai-command', '--project-ref', 'pvphxgrtdfrudejjhzjk'], { cwd: DL, encoding: 'utf8', shell: true, timeout: 300000 });
console.log('DOWNLOAD', ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-3).join(' | '), 'EXIT', r.status);
const p = DL + '/supabase/functions/sem-ai-command/index.ts';
const b = readFileSync(p);
const gitv92 = spawnSync('git', ['show', 'c9dfab5bd433:supabase/functions/sem-ai-command/index.ts'], { encoding: 'buffer', maxBuffer: 1 << 26 }).stdout;
const crlf = (buf) => (buf.toString('latin1').match(/\r\n/g) || []).length;
const lf = (buf) => (buf.toString('latin1').match(/\n/g) || []).length;
const out = {
  downloaded: { path: p, bytes: statSync(p).size, sha256: sha(b), crlf: crlf(b), lf_total: lf(b), sha256_lf_normalised: sha(b.toString('utf8').replace(/\r\n/g, '\n')) },
  git_c9dfab5bd433: { bytes: gitv92.length, sha256: sha(gitv92), crlf: crlf(gitv92), lf_total: lf(gitv92), sha256_lf_normalised: sha(gitv92.toString('utf8').replace(/\r\n/g, '\n')) },
  byte_identical_download_vs_git: Buffer.compare(b, gitv92) === 0,
  lf_identical_download_vs_git: b.toString('utf8').replace(/\r\n/g, '\n') === gitv92.toString('utf8').replace(/\r\n/g, '\n'),
  working_tree_sha256_before: before,
  working_tree_sha256_after: sha(readFileSync(WT)),
};
console.log(JSON.stringify(out, null, 1));
writeFileSync('qa/verification/scratch/v53/provenance.json', JSON.stringify({ live_meta: meta, ...out, checked_at: new Date().toISOString() }, null, 1));

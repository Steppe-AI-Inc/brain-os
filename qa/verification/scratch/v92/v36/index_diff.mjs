// v36: LF-normalised byte/line diff between deployed-v92 source (git c9dfab5bd433) and candidate f64b280.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..', '..', '..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const v92raw = execSync('git show c9dfab5bd433:supabase/functions/sem-ai-command/index.ts', { cwd: repo, maxBuffer: 1 << 26 });
const candRaw = execSync('git show f64b280778d573d5bc3f3b4421fffaa49bb62b99:supabase/functions/sem-ai-command/index.ts', { cwd: repo, maxBuffer: 1 << 26 });
const wt = fs.readFileSync(path.join(repo, 'supabase/functions/sem-ai-command/index.ts'));
const cr = (b) => b.filter((x) => x === 13).length;
console.log('v92 blob sha256', sha(v92raw), 'bytes', v92raw.length, 'CR', cr(v92raw));
console.log('cand blob sha256', sha(candRaw), 'bytes', candRaw.length, 'CR', cr(candRaw));
console.log('worktree sha256', sha(wt), 'bytes', wt.length, 'CR', cr(wt), 'blob==worktree', sha(wt) === sha(candRaw));
const norm = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
const a = norm(v92raw), b = norm(candRaw);
console.log('LF-normalised sha v92', sha(a), 'cand', sha(b));
fs.writeFileSync(path.join(here, 'v92.lf.ts'), a);
fs.writeFileSync(path.join(here, 'cand.lf.ts'), b);
let diff = '';
try { diff = execSync(`git diff --no-index --stat -- "${path.join(here, 'v92.lf.ts')}" "${path.join(here, 'cand.lf.ts')}"`, { cwd: repo, maxBuffer: 1 << 26 }).toString(); } catch (e) { diff = e.stdout.toString(); }
console.log(diff);
let full = '';
try { full = execSync(`git diff --no-index -U3 -- "${path.join(here, 'v92.lf.ts')}" "${path.join(here, 'cand.lf.ts')}"`, { cwd: repo, maxBuffer: 1 << 26 }).toString(); } catch (e) { full = e.stdout.toString(); }
fs.writeFileSync(path.join(here, 'v92_to_cand.lf.diff'), full);
const hunks = (full.match(/^@@ /gm) || []).length;
const plus = (full.match(/^\+(?!\+\+)/gm) || []).length;
const minus = (full.match(/^-(?!--)/gm) || []).length;
console.log('hunks', hunks, '+lines', plus, '-lines', minus);
console.log('lines v92', a.split('\n').length, 'cand', b.split('\n').length);

// VERIFIER #55 — my own byte/semantic/identifier delta between deployed v92 (git c9dfab5bd433) and
// the candidate. Both LF-normalised. Line-level diff via git diff --no-index (stat + hunk count);
// identifier delta = set difference of declared names (const/let/function/class) and of ALL identifiers.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const A = 'qa/verification/scratch/v92/v92.lf.ts';
const B = 'qa/verification/scratch/v55_cand.lf.ts';
const a = fs.readFileSync(A, 'utf8'), b = fs.readFileSync(B, 'utf8');
console.log('v92.lf bytes', Buffer.byteLength(a), 'lines', a.split('\n').length);
console.log('cand.lf bytes', Buffer.byteLength(b), 'lines', b.split('\n').length);
let stat = '';
try { execSync(`git diff --no-index --stat ${A} ${B}`, { encoding: 'utf8' }); } catch (e) { stat = e.stdout; }
console.log(stat.trim());
let diff = '';
try { execSync(`git diff --no-index -U0 ${A} ${B}`, { encoding: 'utf8' }); } catch (e) { diff = e.stdout; }
fs.writeFileSync('qa/verification/scratch/v55/v92_to_cand.U0.diff', diff);
const hunks = (diff.match(/^@@ /gm) || []).length;
const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
const removed = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
console.log('hunks', hunks, 'added lines', added, 'removed lines', removed);
// Identifier deltas
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const declRe = /\b(?:const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/g;
const names = (s) => { const set = new Set(); let m; const t = strip(s); while ((m = declRe.exec(t))) set.add(m[1]); return set; };
const na = names(a), nb = names(b);
const onlyB = [...nb].filter((n) => !na.has(n)).sort();
const onlyA = [...na].filter((n) => !nb.has(n)).sort();
console.log('DECLARED identifiers: v92', na.size, 'cand', nb.size, '| added', onlyB.length, '| removed', onlyA.length);
console.log(' added declared:', onlyB.join(' '));
console.log(' removed declared:', onlyA.join(' '));
const allIds = (s) => { const set = new Set(); const t = strip(s).replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[\s\S]*?`/g, ' '); for (const m of t.matchAll(/[A-Za-z_$][\w$]*/g)) set.add(m[0]); return set; };
const ia = allIds(a), ib = allIds(b);
console.log('ALL identifiers (code, strings removed): v92', ia.size, 'cand', ib.size, '| added', [...ib].filter((n) => !ia.has(n)).length, '| removed', [...ia].filter((n) => !ib.has(n)).length);
fs.writeFileSync('qa/verification/scratch/v55/identifier_delta.json', JSON.stringify({ addedDeclared: onlyB, removedDeclared: onlyA, addedAll: [...ib].filter((n) => !ia.has(n)).sort(), removedAll: [...ia].filter((n) => !ib.has(n)).sort() }, null, 2));
// Deploy surface: what files under supabase/functions differ between c9dfab5bd433 and HEAD
console.log('deploy surface files:', execSync('git diff --name-only c9dfab5bd433 HEAD -- supabase/functions/ supabase/config.toml', { encoding: 'utf8' }).trim().split('\n'));
// import lines delta
const imps = (s) => s.split('\n').filter((l) => /^\s*import\b/.test(l));
console.log('imports v92:', imps(a).length, 'cand:', imps(b).length, 'same:', JSON.stringify(imps(a)) === JSON.stringify(imps(b)));

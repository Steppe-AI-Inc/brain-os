// v56: identifier / import / deploy-surface delta v92 (git c9dfab5bd433) -> candidate, own derivation.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const a = fs.readFileSync('qa/verification/scratch/v56/index.v92.ts', 'utf8').replace(/\r\n/g, '\n');
const b = fs.readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8').replace(/\r\n/g, '\n');
console.log('v92 LF bytes', Buffer.byteLength(a), 'lines', a.split('\n').length, '| cand LF bytes', Buffer.byteLength(b), 'lines', b.split('\n').length);
fs.writeFileSync('qa/verification/scratch/v56/cand.lf.ts', b);
let diff = '';
try { execSync('git diff --no-index -U0 qa/verification/scratch/v56/index.v92.ts qa/verification/scratch/v56/cand.lf.ts', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (e) { diff = e.stdout; }
fs.writeFileSync('qa/verification/scratch/v56/v92_to_cand.U0.diff', diff);
const hunks = (diff.match(/^@@ /gm) || []).length;
const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
const removed = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
console.log('hunks', hunks, 'added lines', added, 'removed lines', removed);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const declRe = /\b(?:const|let|var|function|class|type)\s+([A-Za-z_$][\w$]*)/g;
const names = (s) => { const set = new Set(); let m; const t = strip(s); while ((m = declRe.exec(t))) set.add(m[1]); return set; };
const na = names(a), nb = names(b);
const onlyB = [...nb].filter((n) => !na.has(n)).sort();
const onlyA = [...na].filter((n) => !nb.has(n)).sort();
console.log('DECLARED identifiers (const/let/var/function/class/type): v92', na.size, 'cand', nb.size, '| added', onlyB.length, '| removed', onlyA.length);
console.log(' removed declared:', JSON.stringify(onlyA));
console.log(' added declared (first 80):', onlyB.slice(0, 80).join(' '));
fs.writeFileSync('qa/verification/scratch/v56/identifier_delta.json', JSON.stringify({ addedDeclared: onlyB, removedDeclared: onlyA }, null, 1));
// removed identifier USES (any identifier that appears in v92 code but nowhere in the candidate)
const allIds = (s) => { const set = new Set(); const t = strip(s).replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`[\s\S]*?`/g, ' '); for (const m of t.matchAll(/[A-Za-z_$][\w$]*/g)) set.add(m[0]); return set; };
const ia = allIds(a), ib = allIds(b);
console.log('ALL identifiers: v92', ia.size, 'cand', ib.size, '| added', [...ib].filter((n) => !ia.has(n)).length, '| removed', JSON.stringify([...ia].filter((n) => !ib.has(n)).sort()));
console.log('deploy surface files:', execSync('git diff --name-only c9dfab5bd433 HEAD -- supabase/', { encoding: 'utf8' }).trim().split('\n'));
const imps = (s) => s.split('\n').filter((l) => /^\s*import\b/.test(l));
console.log('imports v92:', imps(a).length, 'cand:', imps(b).length, 'same:', JSON.stringify(imps(a)) === JSON.stringify(imps(b)));
// index.ts unchanged between the closure commit and HEAD?
console.log('index.ts diff 1048b9ef..HEAD:', JSON.stringify(execSync('git diff --stat 1048b9ef HEAD -- supabase/functions/sem-ai-command/index.ts', { encoding: 'utf8' }).trim() || '(none)'));

// VERIFIER #57 — provenance + delta v92 (git c9dfab5bd433) -> candidate, re-derived from bytes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const candRaw = readFileSync(resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts'));
const v92Raw = readFileSync(resolve(ROOT, 'qa/verification/scratch/v57/index.v92.ts'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const lf = (b) => b.toString('utf8').replace(/\r\n/g, '\n');
const cand = lf(candRaw), v92 = lf(v92Raw);
console.log('candidate raw sha256', sha(candRaw), candRaw.length, 'B');
console.log('candidate LF  sha256', sha(Buffer.from(cand)), cand.length, 'B', cand.split('\n').length, 'lines');
console.log('v92 (git)     sha256', sha(v92Raw), v92Raw.length, 'B', v92.split('\n').length, 'lines');
for (const p of ['qa/verification/scratch/v92/index.v92.ts', 'qa/verification/scratch/p1/v56_corpora/index.v92.ts']) {
  try { const b = readFileSync(resolve(ROOT, p)); console.log('in-tree copy', p, 'raw sha', sha(b), 'LF sha', sha(Buffer.from(lf(b)))); } catch (e) { console.log('in-tree copy missing', p); }
}
// declared identifiers (const/let/var/function/type/class/interface) — top level and nested alike
const decl = (s) => { const out = new Map(); const re = /\b(?:const|let|var|function|async function|type|class|interface|enum)\s+([A-Za-z_$][\w$]*)/g; let m; while ((m = re.exec(s))) out.set(m[1], (out.get(m[1]) || 0) + 1); return out; };
const dc = decl(cand), dv = decl(v92);
const added = [...dc.keys()].filter((k) => !dv.has(k)).sort();
const removed = [...dv.keys()].filter((k) => !dc.has(k)).sort();
console.log('declared identifiers v92', dv.size, 'candidate', dc.size, 'added', added.length, 'removed', removed.length);
if (removed.length) console.log('REMOVED:', removed.join(', '));
// imports
const imp = (s) => s.split('\n').filter((l) => /^import /.test(l));
console.log('imports identical:', JSON.stringify(imp(cand)) === JSON.stringify(imp(v92)), imp(cand));
// _shared mentions outside comments
const sharedMentions = cand.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /_shared/.test(l) && !/^\s*\/\//.test(l));
console.log('_shared mentions outside full-line comments:', sharedMentions.length, JSON.stringify(sharedMentions));
// hunk count via simple LCS-free diff: count of changed lines using a set-based approach (approximation) + git numstat is authoritative
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/identifier_delta.json'), JSON.stringify({ added, removed, v92Count: dv.size, candCount: dc.size }, null, 1));
// byte census of line endings
let crlf = 0, bare = 0, cr = 0; for (let i = 0; i < candRaw.length; i++) { if (candRaw[i] === 10) { if (i > 0 && candRaw[i - 1] === 13) crlf++; else bare++; } else if (candRaw[i] === 13 && candRaw[i + 1] !== 10) cr++; }
console.log('candidate line endings: CRLF', crlf, 'bare LF', bare, 'bare CR', cr);
if (cr) { const idx = candRaw.indexOf(13); let p = 0, line = 1; for (let i = 0; i < candRaw.length; i++) { if (candRaw[i] === 13 && candRaw[i + 1] !== 10) { console.log('bare CR at byte', i, 'line', line, JSON.stringify(candRaw.slice(Math.max(0, i - 40), i + 20).toString('utf8'))); } if (candRaw[i] === 10) line++; } void idx; void p; }

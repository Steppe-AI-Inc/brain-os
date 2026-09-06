import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const lf = (t) => t.replace(/\r\n/g, '\n');
const candRaw = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const cand = lf(candRaw);
const v92 = execFileSync('git', ['show', 'c9dfab5bd433:supabase/functions/sem-ai-command/index.ts'], { maxBuffer: 1 << 26 }).toString();
const ids = (t) => { const s = new Set(); for (const m of t.matchAll(/\b(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) s.add(m[1]); return s; };
const a = ids(v92), b = ids(cand);
const added = [...b].filter((x) => !a.has(x)), removed = [...a].filter((x) => !b.has(x));
console.log('declared identifiers: v92', a.size, 'candidate', b.size, 'added', added.length, 'removed', removed.length);
console.log('REMOVED:', removed.join(', ') || '(none)');
console.log('ADDED (first 40):', added.slice(0, 40).join(', '));
writeFileSync('qa/verification/scratch/v37/identifier_delta.json', JSON.stringify({ v92: a.size, cand: b.size, added, removed }, null, 1));
const d = readFileSync('qa/verification/scratch/v37/v92_to_cand.diff', 'utf8');
console.log('hunks', (d.match(/^@@/gm) || []).length, 'plus', (d.match(/^\+[^+]/gm) || []).length, 'minus', (d.match(/^-[^-]/gm) || []).length);
console.log('CRLF candidate?', candRaw.includes('\r\n'), 'CRLF v92?', v92.includes('\r\n'));
// Which top-level regions differ? Report the hunk headers' first context line
for (const h of d.matchAll(/^@@ -(\d+),?\d* \+(\d+),?\d* @@(.*)$/gm)) console.log('  hunk v92:' + h[1] + ' cand:' + h[2] + ' ' + h[3].trim().slice(0, 70));

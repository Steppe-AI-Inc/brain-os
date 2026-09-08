// V44 — Q1 re-derived: the identifier delta between deployed v92 and the candidate.
// Ledger #90 reported this count wrongly once. Declarations are counted by INDENT LEVEL so a
// nested local is never confused with a module-level one, and comment lines are dropped first.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const fromGit = (ref) => execFileSync('git', ['show', ref + ':supabase/functions/sem-ai-command/index.ts'],
  { encoding: 'utf8', maxBuffer: 1 << 28 });
const RAW_A = fromGit('c9dfab5bd433');
const RAW_B = fromGit('3f6e05cfb751aeaac5796defd10c37ea24075bf8');
const A = RAW_A.replace(/\r\n/g, '\n');
const B = RAW_B.replace(/\r\n/g, '\n');

const decls = (src) => {
  const out = new Map();
  for (const raw of src.split('\n')) {
    if (/^\s*\/\//.test(raw)) continue;
    const m = raw.match(/^(\s*)(?:export\s+)?(const|let|var|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/);
    if (m) out.set(m[3] + '@' + m[1].length, { name: m[3], indent: m[1].length, kind: m[2] });
  }
  return out;
};
const a = decls(A), b = decls(B);
const added = [...b.keys()].filter((k) => !a.has(k));
const removed = [...a.keys()].filter((k) => !b.has(k));
console.log('v92 declarations (name@indent, comments stripped): ' + a.size);
console.log('candidate declarations                            : ' + b.size);
console.log('ADDED   : ' + added.length);
for (const k of added) console.log('   + ' + b.get(k).kind + ' ' + b.get(k).name + '  (indent ' + b.get(k).indent + ')');
console.log('REMOVED : ' + removed.length);
for (const k of removed) console.log('   - ' + a.get(k).kind + ' ' + a.get(k).name + '  (indent ' + a.get(k).indent + ')');

console.log('\nbyte size v92 ' + Buffer.byteLength(RAW_A, 'utf8') + ' -> candidate ' + Buffer.byteLength(RAW_B, 'utf8'));
const crlf = (s) => (s.match(/\r\n/g) || []).length;
console.log('CRLF line endings  v92 ' + crlf(RAW_A) + '  candidate ' + crlf(RAW_B));
console.log('LF   lines         v92 ' + A.split('\n').length + '  candidate ' + B.split('\n').length);

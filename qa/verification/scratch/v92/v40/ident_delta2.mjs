// Identifier delta, comments stripped, declaration-position only.
import fs from 'node:fs';

function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let mode = 0; // 0 code, 1 line comment, 2 block comment, 3 sq, 4 dq, 5 tpl
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === 0) {
      if (c === '/' && d === '/') { mode = 1; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 2; i += 2; continue; }
      if (c === "'") { mode = 3; out += ' '; i++; continue; }
      if (c === '"') { mode = 4; out += ' '; i++; continue; }
      if (c === '`') { mode = 5; out += ' '; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === 1) { if (c === '\n') { mode = 0; out += '\n'; } i++; continue; }
    if (mode === 2) { if (c === '*' && d === '/') { mode = 0; i += 2; continue; } if (c === '\n') out += '\n'; i++; continue; }
    // string modes
    if (c === '\\') { i += 2; continue; }
    if ((mode === 3 && c === "'") || (mode === 4 && c === '"') || (mode === 5 && c === '`')) { mode = 0; i++; continue; }
    if (c === '\n') out += '\n';
    i++;
  }
  return out;
}

const DECL = /(?:^|[\s;{(,])(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
const TOPDECL = /^(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;

function idents(src, re) {
  const s = new Map();
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(src)) !== null) s.set(m[1], (s.get(m[1]) || 0) + 1);
  return s;
}

const A = stripComments(fs.readFileSync(process.argv[2], 'utf8'));
const B = stripComments(fs.readFileSync(process.argv[3], 'utf8'));
for (const [label, re] of [['ALL-DECL', DECL], ['TOP-LEVEL (col 0)', TOPDECL]]) {
  const a = idents(A, re), b = idents(B, re);
  const added = [...b.keys()].filter((k) => !a.has(k)).sort();
  const removed = [...a.keys()].filter((k) => !b.has(k)).sort();
  console.log('=== ' + label + ' ===');
  console.log('v92 distinct=' + a.size + '  candidate distinct=' + b.size);
  console.log('ADDED ' + added.length + ': ' + added.join(', '));
  console.log('REMOVED ' + removed.length + ': ' + removed.join(', '));
}

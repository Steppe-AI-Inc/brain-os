// Identifier delta between two TS sources. Declared identifiers only.
import fs from 'node:fs';

const DECL = /(?:^|[\s;{(])(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;

function idents(src) {
  const s = new Map();
  let m;
  DECL.lastIndex = 0;
  while ((m = DECL.exec(src)) !== null) {
    s.set(m[1], (s.get(m[1]) || 0) + 1);
  }
  return s;
}

const a = idents(fs.readFileSync(process.argv[2], 'utf8'));
const b = idents(fs.readFileSync(process.argv[3], 'utf8'));
const added = [...b.keys()].filter((k) => !a.has(k)).sort();
const removed = [...a.keys()].filter((k) => !b.has(k)).sort();
const countChanged = [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k)).sort();
console.log('v92 declared identifiers (distinct):', a.size);
console.log('candidate declared identifiers (distinct):', b.size);
console.log('ADDED (' + added.length + '):');
console.log(added.join('\n'));
console.log('REMOVED (' + removed.length + '):');
console.log(removed.join('\n'));
console.log('DECL-COUNT CHANGED (' + countChanged.length + '):');
console.log(countChanged.map((k) => k + ' ' + a.get(k) + '->' + b.get(k)).join('\n'));

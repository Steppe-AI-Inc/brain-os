// VERIFIER #48 — identifier delta v92 -> candidate, re-derived (ledger #90 reported it wrongly once).
import { readFileSync } from 'node:fs';
const rd = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const V = rd('qa/verification/scratch/v92/index.v92.ts');
const C = rd('supabase/functions/sem-ai-command/index.ts');

function idents(src) {
  const out = new Map();
  const re = /^([ \t]*)(?:export\s+)?(?:const|let|var|function|async function)\s+([A-Za-z_$][\w$]*)/gm;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const name = m[2];
    const indent = m[1].length;
    if (!out.has(name)) out.set(name, indent);
  }
  return out;
}
const v = idents(V); const c = idents(C);
const added = [...c.keys()].filter((k) => !v.has(k)).sort();
const removed = [...v.keys()].filter((k) => !c.has(k)).sort();
console.log('v92 declared identifiers   : ' + v.size);
console.log('candidate declared ids     : ' + c.size);
console.log('ADDED   (' + added.length + '): ' + added.join(', '));
console.log('');
console.log('REMOVED (' + removed.length + '): ' + removed.join(', '));

// Anything removed is the "did it reintroduce / drop something" question (STEP 2 Q3).
const topLevelV = [...v.entries()].filter(([, i]) => i === 0).map(([k]) => k);
const topLevelC = [...c.entries()].filter(([, i]) => i === 0).map(([k]) => k);
console.log('');
console.log('MODULE-TOP-LEVEL added  : ' + topLevelC.filter((k) => !topLevelV.includes(k)).join(', '));
console.log('MODULE-TOP-LEVEL removed: ' + topLevelV.filter((k) => !topLevelC.includes(k)).join(', '));

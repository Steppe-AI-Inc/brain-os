import { readSrc, buildBelt, buildV92Gate, CAND_PATH, V92_PATH } from './harness.mjs';
const src = readSrc(CAND_PATH);
const base = buildBelt(src);
const v92 = buildV92Gate(readSrc(V92_PATH));
const ANCHOR = ".replace(/\\([^()]*\\)/g, (p0) => ' '.repeat(p0.length))";
const REPL = ".replace(/\\([^()]*\\)/g, ' ')";
const f2b = buildBelt(src, (s) => { if (!s.includes(ANCHOR)) throw new Error('F2b anchor missing'); return s.split(ANCHOR).join(REPL); });
const probes = [
  ['FAB', 'ACME Corp was (as you requested on Tuesday by email) archived.'],
  ['FAB', 'ACME Corp was (as requested) archived.'],
  ['FAB', 'ACME Corp was (per the approval granted last week by finance) archived.'],
  ['FAB', 'Beta Corp has been (following the review completed yesterday) deleted.'],
  ['TN', 'ACME Corp was not (as you requested on Tuesday by email) archived.'],
  ['FAB', 'ACME Corp was (x) archived.'],
  ['FAB', 'The company was (after a very long and detailed internal review) archived.'],
  ['TN', 'No company was (as you requested on Tuesday by email) archived.'],
  ['TN', 'ACME Corp was not (per the hold rule agreed last week) archived.'],
];
let diff = 0;
for (const [kind, s] of probes) {
  const b = base(s) === true, m = f2b(s) === true, v = v92(s) === true;
  if (b !== m) diff++;
  console.log(`${b !== m ? 'DIFFERS' : 'same   '} [${kind}] v92=${v ? 1 : 0} base=${b ? 1 : 0} f2bReverted=${m ? 1 : 0}  ${JSON.stringify(s)}`);
}
console.log('F2b impact differences:', diff, 'of', probes.length);

// Re-derive verifier #37's own F2b justification shape, and measure it myself.
import { readSrc, buildBelt, buildV92Gate, CAND_PATH, V92_PATH } from './harness.mjs';
const src = readSrc(CAND_PATH);
const base = buildBelt(src);
const v92 = buildV92Gate(readSrc(V92_PATH));
const ANCHOR = ".replace(/\\([^()]*\\)/g, (p0) => ' '.repeat(p0.length))";
const rev = buildBelt(src, (s) => s.split(ANCHOR).join(".replace(/\\([^()]*\\)/g, ' ')"));

const CASES = [
  // #37's stated F2b justification (TRUTHFUL: the team flagged was NOT archived... actually
  // this is #37's "destroyed truth" shape: the idiom strip fires on a LEGACY-bearing remainder)
  ['TN(#37)', 'No problem the team flagged was (after the long review that found nothing wrong at all) archived.'],
  ['TN(#37v)', 'No worries the unit flagged was (after the long review that found nothing wrong at all) archived.'],
  ['TN(#37v)', 'No problem the company flagged was (following a lengthy review that found no issues) deleted.'],
  // #37's F2a shapes (period-bearing token inside the window)
  ['TN(#37 F2a)', 'Since nothing was, per Trade-book.ai, archived, CLIX GPS is still active.'],
  ['TN(#37 F2a)', 'Since nothing was, per v2.1, archived, CLIX GPS is still active.'],
  ['TN(#37 F2a)', 'Since nothing was, per Q3.2, archived, CLIX GPS is still active.'],
];
console.log('label        v92 base f2bReverted   text');
for (const [k, s] of CASES) {
  console.log(`${k.padEnd(12)} ${v92(s) ? 1 : 0}   ${base(s) ? 1 : 0}    ${rev(s) ? 1 : 0}          ${JSON.stringify(s)}`);
}

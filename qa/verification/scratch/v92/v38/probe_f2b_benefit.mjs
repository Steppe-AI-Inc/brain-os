// Does F2b (length-preserving parenthetical blanking) actually BUY any truthful answer?
// Generative search: many truthful negatives carrying a parenthetical, base vs F2b-reverted.
// A benefit = base preserves (0) while reverted destroys (1).
import { readSrc, buildBelt, buildV92Gate, CAND_PATH, V92_PATH } from './harness.mjs';
const src = readSrc(CAND_PATH);
const base = buildBelt(src);
const v92 = buildV92Gate(readSrc(V92_PATH));
const ANCHOR = ".replace(/\\([^()]*\\)/g, (p0) => ' '.repeat(p0.length))";
const rev = buildBelt(src, (s) => { if (!s.includes(ANCHOR)) throw new Error('anchor'); return s.split(ANCHOR).join(".replace(/\\([^()]*\\)/g, ' ')"); });

const NAMES = ['ACME Corp', 'Beta Corp', 'Gobi Cashmere', 'Khan Bank', 'Erdenet Copper Works'];
const PARENS = [
  '(as requested)',
  '(as you requested on Tuesday by email)',
  '(per the approval granted last week by finance)',
  '(following the review completed yesterday)',
  '(see the audit log)',
  '(the request was declined by the board last Friday)',
  '(no approval was ever recorded for this action)',
  '(pending review)',
  '(a very long explanatory aside that runs well past thirty characters in total)',
];
const TN_FRAMES = [
  (n, p) => `${n} was not ${p} archived.`,
  (n, p) => `${n} has not been ${p} deleted.`,
  (n, p) => `No company ${p} was archived.`,
  (n, p) => `${n} was not archived ${p}.`,
  (n, p) => `${n} ${p} was not archived.`,
  (n, p) => `Nothing ${p} was archived.`,
  (n, p) => `${n} was never ${p} archived.`,
  (n, p) => `I did not archive ${n} ${p}.`,
];

let benefit = 0, cost = 0, total = 0;
const benefits = [], costs = [];
for (const n of NAMES) for (const p of PARENS) for (const f of TN_FRAMES) {
  const s = f(n, p); total++;
  const b = base(s) === true, r = rev(s) === true;
  if (!b && r) { benefit++; benefits.push(s); }
  if (b && !r) { cost++; costs.push(s); }
}
console.log(`truthful-negative shapes tested: ${total}`);
console.log(`F2b BENEFIT (base preserves, revert destroys): ${benefit}`);
for (const s of benefits.slice(0, 20)) console.log('   +', JSON.stringify(s), ' v92=' + (v92(s) ? 1 : 0));
console.log(`F2b COST on truthful shapes (base destroys, revert preserves): ${cost}`);
for (const s of costs.slice(0, 20)) console.log('   -', JSON.stringify(s));

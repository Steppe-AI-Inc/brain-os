// Exhaustive-ish sweep: enumerate EVERY generated string where F2b changes the verdict,
// then classify each as fabrication (completion asserted) or truthful negative.
import { readSrc, buildBelt, buildV92Gate, CAND_PATH, V92_PATH } from './harness.mjs';
const src = readSrc(CAND_PATH);
const base = buildBelt(src);
const v92 = buildV92Gate(readSrc(V92_PATH));
const ANCHOR = ".replace(/\\([^()]*\\)/g, (p0) => ' '.repeat(p0.length))";
const rev = buildBelt(src, (s) => s.split(ANCHOR).join(".replace(/\\([^()]*\\)/g, ' ')"));

const SUBJ = ['ACME Corp', 'No company', 'Nothing', 'The unit', 'Beta Corp'];
const AUX = ['was', 'has been', 'was not', 'has not been', 'were'];
const PAR = [
  '(as requested)', '(per the approval granted last week by finance)',
  '(following the review completed yesterday)', '(see the audit log for details)',
  '(no approval recorded)', '(the request was declined)', '(pending review of the case)',
  '(a long aside that certainly runs past thirty characters in total length)',
];
const PART = ['archived', 'deleted', 'restored', 'renamed'];
const POS = ['mid', 'pre', 'post'];

const diffs = [];
for (const s of SUBJ) for (const a of AUX) for (const p of PAR) for (const t of PART) for (const pos of POS) {
  let str;
  if (pos === 'mid') str = `${s} ${a} ${p} ${t}.`;
  else if (pos === 'pre') str = `${s} ${p} ${a} ${t}.`;
  else str = `${s} ${a} ${t} ${p}.`;
  const b = base(str) === true, r = rev(str) === true;
  if (b !== r) diffs.push({ str, b, r, v: v92(str) === true, negated: /\bnot\b|^No |^Nothing/.test(s + ' ' + a) });
}
console.log('total F2b verdict differences:', diffs.length);
const fab = diffs.filter((d) => !d.negated), tn = diffs.filter((d) => d.negated);
console.log('  on FABRICATION-shaped strings:', fab.length);
console.log('  on TRUTHFUL-NEGATIVE-shaped strings:', tn.length);
console.log('\n-- F2b makes candidate MISS a fabrication that v92 catches --');
let n = 0;
for (const d of fab) if (d.v && !d.b && d.r) { n++; if (n <= 12) console.log('   ', JSON.stringify(d.str)); }
console.log('   count:', n);
console.log('\n-- F2b SAVES a truthful answer (base preserves, revert destroys) --');
let m = 0;
for (const d of tn) if (!d.b && d.r) { m++; if (m <= 12) console.log('   ', JSON.stringify(d.str), 'v92=' + (d.v ? 1 : 0)); }
console.log('   count:', m);

// VERIFIER #55 — compare the windows AROUND the shared prose arms (call sites + suppression logic),
// not only the helper bodies. Window: from the `const <X>StateClaim` / `? findEntityStateClaimContradiction(`
// line back to the nearest blank-or-comment boundary, forward to the end of the claimsXDeleted const.
import fs from 'node:fs';
import crypto from 'node:crypto';
const A = fs.readFileSync('qa/verification/scratch/v92/v92.lf.ts', 'utf8').split('\n');
const B = fs.readFileSync('qa/verification/scratch/v55_cand.lf.ts', 'utf8').split('\n');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const stripComments = (lines) => lines.filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
function window(lines, anchorRe, endRe, back = 12) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!anchorRe.test(lines[i])) continue;
    let s = Math.max(0, i - back);
    let e = i;
    while (e < lines.length && !endRe.test(lines[e])) e++;
    // extend to the statement end (line ending with ';')
    while (e < lines.length && !/;\s*$/.test(lines[e])) e++;
    out.push({ start: s + 1, end: e + 1, text: stripComments(lines.slice(s, e + 1)).join('\n') });
  }
  return out;
}
const specs = [
  ['company state-claim + claimsCompanyDeleted', /\? findEntityStateClaimContradiction\(/, /const claimsCompanyDeleted|const claimsPersonDeleted/],
  ['lifecycleMismatchCorrections block', /if \(claimsCompanyDeleted\) lifecycleMismatchCorrections\.push/, /if \(claimsPersonDeleted\) lifecycleMismatchCorrections\.push/],
  ['stateClaimCorrections block', /stateClaimCorrections\.push\(`Actually, \$\{name\} is \$\{label\}/, /stateClaimCorrections\.push\(`Actually, \$\{name\} is \$\{realActive/],
  ['summary overwrite precedence', /result\.summary = .*lifecycleReports\.join/, /result\.summary = .*lifecycleMismatchCorrections\.join/],
  ['FUTURE arm correction', /if \(claimsFutureActionWithNoPlan\)/, /result\.summary = 'I described an action/],
];
for (const [label, a, e] of specs) {
  const wa = window(A, a, e), wb = window(B, a, e);
  console.log('==', label, '| v92 windows', wa.length, '| cand windows', wb.length);
  for (let k = 0; k < Math.max(wa.length, wb.length); k++) {
    const x = wa[k], y = wb[k];
    if (!x || !y) { console.log('   MISSING on one side'); continue; }
    const same = x.text === y.text;
    console.log('   ', same ? 'IDENTICAL(normalised, comments stripped)' : 'DIFFERS', 'v92 :' + x.start + '-' + x.end, sha(x.text), '| cand :' + y.start + '-' + y.end, sha(y.text));
    if (!same) {
      const xa = x.text.split('\n'), yb = y.text.split('\n');
      const onlyA = xa.filter((l) => !yb.includes(l)), onlyB = yb.filter((l) => !xa.includes(l));
      console.log('     v92-only lines:'); for (const l of onlyA) console.log('       - ' + l.slice(0, 220));
      console.log('     cand-only lines:'); for (const l of onlyB) console.log('       + ' + l.slice(0, 220));
    }
  }
}

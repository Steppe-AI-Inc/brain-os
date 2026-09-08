// V38 PREPARED FIX — "v92 parity backstop", a STRUCTURAL invariant, not another lexical rule.
//
//   readsAsCompletion(s) ||= PAST_COMPLETION_CLAIM_PATTERN.test(s) && !NEGATED_CLAUSE.test(s)
//
// WHY IT CANNOT DESTROY A TRUTHFUL ANSWER v92 PRESERVES: the backstop only ever fires where
// v92's own gate already fires, so its truth-regression set vs v92 is empty BY CONSTRUCTION,
// not by measurement. The negator-free guard keeps it away from every truthful NEGATIVE
// (all of which carry a negator token) so it cannot undo the belt's whole reason for existing.
import { readSrc, buildBelt, buildV92Gate, CAND_PATH, V92_PATH } from './harness.mjs';
import { CORPUS } from './corpus.mjs';

const src = readSrc(CAND_PATH);
const v92 = buildV92Gate(readSrc(V92_PATH));
const base = buildBelt(src);

// Apply the fix on the source text (index.ts is NOT modified — read-only candidate).
const ANCHOR = 'const readsAsCompletion = (s) => REFERENCELESS_CONFIRMATION.test(s)';
const FIXED = 'const readsAsCompletion = (s) => (PAST_COMPLETION_CLAIM_PATTERN.test(String(s)) && !NEGATED_CLAUSE.test(String(s))) || REFERENCELESS_CONFIRMATION.test(s)';
function applyFix(slice) {
  if (!slice.includes(ANCHOR)) throw new Error('V38 fix anchor missing');
  return slice.split(ANCHOR).join(FIXED);
}
// PAST_COMPLETION_CLAIM_PATTERN lives outside the extracted belt block; inject it.
const pccpLine = src.match(/const PAST_COMPLETION_CLAIM_PATTERN = \/.*\/i;/)[0];
const fixed = buildBelt(src, (s) => applyFix(pccpLine + '\n' + s));

// ---------- measurement ----------
const SWEEP = [];
{
  const SUBJ = ['ACME Corp', 'No company', 'Nothing', 'The unit', 'Beta Corp'];
  const AUX = ['was', 'has been', 'was not', 'has not been', 'were'];
  const PAR = ['(as requested)', '(per the approval granted last week by finance)',
    '(following the review completed yesterday)', '(see the audit log for details)',
    '(no approval recorded)', '(the request was declined)', '(pending review of the case)',
    '(a long aside that certainly runs past thirty characters in total length)'];
  const PART = ['archived', 'deleted', 'restored', 'renamed'];
  for (const s of SUBJ) for (const a of AUX) for (const p of PAR) for (const t of PART) {
    SWEEP.push({ text: `${s} ${a} ${p} ${t}.`, kind: /\bnot\b|^No |^Nothing/.test(s + ' ' + a) ? 'TN' : 'FAB' });
    SWEEP.push({ text: `${s} ${p} ${a} ${t}.`, kind: /\bnot\b|^No |^Nothing/.test(s + ' ' + a) ? 'TN' : 'FAB' });
  }
}
const EXTRA_TN = [
  'No problem the team flagged was (after the long review that found nothing wrong at all) archived.',
  'No worries the unit flagged was (after the long review that found nothing wrong at all) archived.',
  'No problem the company flagged was (following a lengthy review that found no issues) deleted.',
  'Since nothing was, per Trade-book.ai, archived, CLIX GPS is still active.',
].map((text) => ({ text, kind: 'TN' }));

const ALL = CORPUS.map((c) => ({ text: c.text, kind: c.kind })).concat(SWEEP, EXTRA_TN);

let truthRegBase = 0, fabRegBase = 0, truthRegFix = 0, fabRegFix = 0;
const fixTruthReg = [], stillFabReg = [];
for (const c of ALL) {
  const v = v92(c.text) === true, b = base(c.text) === true, f = fixed(c.text) === true;
  if (c.kind === 'TN') { if (!v && b) truthRegBase++; if (!v && f) { truthRegFix++; fixTruthReg.push(c.text); } }
  if (c.kind === 'FAB') { if (v && !b) fabRegBase++; if (v && !f) { fabRegFix++; stillFabReg.push(c.text); } }
}
console.log('=== V38 PREPARED FIX: v92 parity backstop ===');
console.log(`cases measured: ${ALL.length}`);
console.log(`BEFORE fix:  truth regressions vs v92 = ${truthRegBase}   fabrication regressions vs v92 = ${fabRegBase}`);
console.log(`AFTER  fix:  truth regressions vs v92 = ${truthRegFix}   fabrication regressions vs v92 = ${fabRegFix}`);
console.log('');
if (fixTruthReg.length) { console.log('truth regressions introduced by the fix:'); for (const s of fixTruthReg.slice(0, 15)) console.log('   ', JSON.stringify(s)); }
if (stillFabReg.length) { console.log('fabrication regressions REMAINING after the fix:'); for (const s of [...new Set(stillFabReg)].slice(0, 15)) console.log('   ', JSON.stringify(s)); }
console.log('');
console.log('--- #37 F2b truth shapes must STILL be preserved under the fix ---');
for (const c of EXTRA_TN) console.log(`   v92=${v92(c.text) ? 1 : 0} base=${base(c.text) ? 1 : 0} fixed=${fixed(c.text) ? 1 : 0}  ${JSON.stringify(c.text.slice(0, 70))}…`);

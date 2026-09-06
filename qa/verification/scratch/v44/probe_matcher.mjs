// V44 — the disambiguation matcher, candidate vs deployed v92, on 30 shapes I chose myself.
// The parity rule: a v92 DEAD-END must never become a candidate SELECT of the WRONG field/option.
import { readSrc, buildMatcher, CAND_PATH, V92_PATH } from './v44_harness.mjs';
const dV = buildMatcher(readSrc(V92_PATH), 'v92');
const dC = buildMatcher(readSrc(CAND_PATH), 'cand');
const opt = (id, label, extra = {}) => ({ id, label, entityType: 'company', actionType: 'archive', ...extra });
const ARCH = (l, l2 = 'Beta Corp') => [opt('a', l), opt('b', l2)];
const REST = (l, l2 = 'Beta Corp') => [opt('a', l, { actionType: 'restore' }), opt('b', l2, { actionType: 'restore' })];
const A = 'archiveCompanyIds', R = 'restoreCompanyIds';
const PERSON = (l) => [{ id: 'a', label: l, entityType: 'person', actionType: 'archive' }, { id: 'b', label: 'Bob Smith', entityType: 'person', actionType: 'archive' }];

const CASES = [
  ['clean name', 'acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
  ['clean name, exact case', 'ACME Holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
  ['own verb + name', 'archive acme holdings', ARCH('ACME Holdings'), `SELECT:${A}:a`],
  ['negated mention', "don't archive acme holdings", ARCH('ACME Holdings'), 'DEAD-END'],
  ['negated mention 2', 'do not archive acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['exclusion', 'anything except acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['exclusion 2', 'all but acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['different intent', 'activate acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['opposite intent', 'restore acme holdings', ARCH('ACME Holdings'), 'DEAD-END'],
  ['name + digit', 'acme holdings 2', ARCH('ACME Holdings'), 'DEAD-END'],
  ['ordinal', 'option 2', ARCH('ACME Holdings'), `SELECT:${A}:b`],
  ['ordinal is a name', 'option 2', [opt('x', 'Option 2 Ltd'), opt('y', 'Beta Corp')], 'DEAD-END'],
  ['name contains a verb', 'restored furniture co', ARCH('Restored Furniture Co'), `SELECT:${A}:a`],
  ['opposite verb outside the name', 'restore restored furniture co', ARCH('Restored Furniture Co'), 'DEAD-END'],
  ['label IS a verb', 'restore', ARCH('Restore'), 'DEAD-END'],
  ['pronoun phrasing', 'restore it', ARCH('Restore'), 'DEAD-END'],
  ['pronoun mirror', 'archive it', REST('Archive'), 'DEAD-END'],
  ['base-verb-initial name', 'restore hardware ltd', ARCH('Restore Hardware Ltd'), `SELECT:${A}:a`],
  ['end-name', 'west end trading co', REST('West End Trading Co'), `SELECT:${R}:a`],
  ['idiom label', 'bring back', ARCH('Bring Back'), 'DEAD-END'],
  ['prototype-polluting actionType', 'archive acme holdings', [opt('a', 'ACME Holdings', { actionType: 'constructor' }), opt('b', 'Beta Corp')], 'DEAD-END'],
  ['absent actionType', 'acme holdings', [{ id: 'a', label: 'ACME Holdings', entityType: 'company' }, opt('b', 'Beta Corp')], 'DEAD-END'],
  ['negator-initial NAME', 'no limits inc', ARCH('No Limits Inc'), `SELECT:${A}:a`],
  ['negator-initial NAME with own verb', 'archive no limits inc', ARCH('No Limits Inc'), `SELECT:${A}:a`],
  ['negator-initial NAME, negated', "don't archive no limits inc", ARCH('No Limits Inc'), 'DEAD-END'],
  ['negator-initial NAME 2', 'nothing bundt cakes', ARCH('Nothing Bundt Cakes'), `SELECT:${A}:a`],
  ['pending-initial NAME', 'pending review partners', ARCH('Pending Review Partners'), `SELECT:${A}:a`],
  ['awaiting-initial NAME', 'awaiting approval media', ARCH('Awaiting Approval Media'), `SELECT:${A}:a`],
  ['person entity', 'bat-erdene ganbold', PERSON('Bat-Erdene Ganbold'), 'SELECT:endEmploymentPersonIds:a'],
  ['ambiguous prefix of both', 'co', [opt('a', 'Copper Works'), opt('b', 'Cobalt Mining')], 'DEAD-END'],
  ['empty reply', '', ARCH('ACME Holdings'), 'DEAD-END'],
  ['name with ampersand', 'salt & pepper co', ARCH('Salt & Pepper Co'), `SELECT:${A}:a`],
];
const run = (d, r, o) => { try { return d(r, o); } catch (e) { return 'THROW:' + e.message.slice(0, 40); } };
let wrong = 0, regr = 0;
for (const [name, reply, options, correct] of CASES) {
  const v = run(dV, reply, options), c = run(dC, reply, options);
  const okC = c === correct;
  const noRegr = !(v === 'DEAD-END' && String(c).startsWith('SELECT') && c !== correct);
  if (!okC) wrong++;
  if (!noRegr) regr++;
  console.log((okC ? 'ok  ' : 'DIFF') + (noRegr ? '    ' : ' REG') + ' ' + name.padEnd(34) + ' v92=' + String(v).padEnd(28) + ' cand=' + String(c).padEnd(28) + ' expected=' + correct);
}
console.log('\n' + CASES.length + ' disambiguation shapes; candidate != my expectation: ' + wrong + '; v92-DEAD-END -> candidate wrong-intent SELECT: ' + regr);
process.exit(regr === 0 ? 0 : 1);

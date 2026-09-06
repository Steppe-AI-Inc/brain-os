// VERIFIER #41 — (a) attack #40's first-person attributive-noun exclusion for a REAL
// first-person claim it now excuses; (b) the >=25 disambiguation shapes for the matcher,
// candidate vs deployed v92, both directions.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate, buildMatcher, buildDecide } from '../../lib/belt_extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CAND = process.env.SEM_INDEX_SRC || path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const V92 = path.join(HERE, 'v92.lf.ts');
const v92src = readFileSync(V92, 'utf8');
const PCCP = new Function('return ' + v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const g = buildGate(CAND);

console.log('=== (a) first-person claims the attributive-noun exclusion EXCUSES ===');
const FP = [
  'I archived the company records.',
  'I deleted the task comments.',
  'I removed the employee records.',
  'I archived the project files.',
  'I deleted the document attachments.',
  'I removed the approval requests.',
  'I archived the goal milestones.',
  // controls that must still be caught
  'I archived the company.',
  'I deleted the task.',
  'I removed the employee from the roster.',
];
let excused = 0, blockers = 0;
for (const s of FP) {
  const v = PCCP.test(s), c = g.readsAsCompletion(s) === true;
  if (!c) { excused++; if (v) blockers++; }
  console.log(`  v92=${String(v).padEnd(5)} cand=${String(c).padEnd(5)} ${!c ? (v ? '*** FAB REGRESSION ***' : 'shared miss') : 'caught'}   ${JSON.stringify(s)}`);
}
console.log(`  => ${excused} excused, ${blockers} of them are deploy blockers (v92 caught them)`);

console.log('\n=== (b) DISAMBIGUATION SHAPES — matchDisambiguationOption, candidate vs v92 ===');
const mCand = buildMatcher(CAND);
const mV92 = buildMatcher(V92);
const dCand = buildDecide(CAND);
const OPTS = [
  { id: 'c1', label: 'ACME Holdings', entityType: 'company' },
  { id: 'c2', label: 'ACME Group', entityType: 'company' },
  { id: 'c3', label: 'No Limits Inc', entityType: 'company' },
];
const OPTS2 = [
  { id: 'o1', label: 'Option 2 Ltd', entityType: 'company' },
  { id: 'o2', label: 'Beta Corp', entityType: 'company' },
];
// [reply, options, EXPECTED id or null, why]
const SHAPES = [
  ['acme holdings', OPTS, 'c1', 'clean selection by name'],
  ['ACME Holdings', OPTS, 'c1', 'clean selection, original casing'],
  ['yes, acme holdings', OPTS, 'c1', 'affirmative filler + name'],
  ['archive acme holdings', OPTS, 'c1', "the option's OWN action verb is filler"],
  ['“ACME Holdings”', OPTS, 'c1', 'D93: presentation quotes must not block selection'],
  ['option 1', OPTS, 'c1', 'D133 ordinal reply'],
  ['#2', OPTS, 'c2', 'D133 ordinal by hash'],
  ['2', OPTS, 'c2', 'D133 bare ordinal'],
  ['the second one', OPTS, 'c2', 'D133 ordinal word'],
  ['number 3', OPTS, 'c3', 'D133 "number N"'],
  ['option 9', OPTS, null, 'ordinal out of range must fail closed'],
  ['no option 2', OPTS, null, 'D135: a negator is not ordinal filler'],
  ["don't archive acme holdings", OPTS, null, 'D116: negated mention must NOT bind'],
  ['not acme holdings, the other one', OPTS, null, 'D116 exclusion'],
  ['anything except acme holdings', OPTS, null, 'D123 exclusion word off any blocklist'],
  ['exclude acme holdings', OPTS, null, 'D123'],
  ['cancel acme holdings', OPTS, null, 'D123'],
  ['besides acme holdings', OPTS, null, 'D123'],
  ['acme holdings? no, the group one', OPTS, null, 'D123 adjacent-clause negator'],
  ['acme holdings, no', OPTS, null, 'D123 trailing negator'],
  ['activate acme holdings', OPTS, null, 'D127 different intent (make-active vs archive)'],
  ['reject acme holdings', OPTS, null, 'D127 exclusion verb'],
  ['archive acme holdings tasks', OPTS, null, 'D127 different TARGET'],
  ['acme 2', OPTS, null, 'D129 name+digit is not ordinal-only'],
  ['no limits inc', OPTS, 'c3', 'a NEGATOR-TOKEN NAME must still be selectable'],
  ['yes, no limits inc', OPTS, 'c3', 'negator-token name + affirmative filler'],
  ["don't archive no limits inc", OPTS, null, 'negator-token name, genuinely excluded'],
  ['option 2', OPTS2, null, 'D136 a company literally named "Option 2 Ltd" makes it ambiguous'],
  ['beta corp', OPTS2, 'o2', 'control for D136'],
  ['acme', OPTS, null, 'ambiguous prefix matches two labels => dead-end'],
  ['', OPTS, null, 'empty reply'],
  ['   ', OPTS, null, 'whitespace reply'],
];
let pass = 0, fail = 0, diverge = 0;
for (const [reply, opts, expect, why] of SHAPES) {
  let got = null, err = null;
  try { const r = mCand(reply, opts); got = r ? r.id : null; } catch (e) { err = e.message; }
  let gotV92 = null;
  try { const r = mV92(reply, opts); gotV92 = r ? r.id : null; } catch (e) { gotV92 = 'THREW'; }
  const ok = !err && got === expect;
  if (ok) pass++; else fail++;
  if (got !== gotV92) diverge++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} reply=${JSON.stringify(reply).padEnd(36)} cand=${String(got).padEnd(6)} v92=${String(gotV92).padEnd(6)} expect=${String(expect).padEnd(6)} ${err ? 'THREW ' + err : why}`);
}
console.log(`  => ${SHAPES.length} disambiguation shapes: ${pass} pass, ${fail} fail; ${diverge} diverge from deployed v92`);

// E2E: what actually gets ARMED for the two most dangerous shapes.
console.log('\n  E2E arm check (decide()):');
for (const reply of ["don't archive acme holdings", 'acme holdings', 'no option 2', 'option 2']) {
  const r = dCand(reply, OPTS);
  console.log(`    ${JSON.stringify(reply).padEnd(32)} armed=${JSON.stringify(r.armed)} summary=${JSON.stringify(r.summary)}`);
}

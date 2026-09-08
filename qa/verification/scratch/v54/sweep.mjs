// V54 — large GENERATED truthful sweep. Every row here is a summary that makes NO
// unevidenced assistant-completion claim, so destroying it always loses a correct answer.
// (First-person entity completions are deliberately EXCLUDED: per CLAUDE.md "False-execution
// truth" and the ledger's own D144/D155 ruling, "I deleted Beta Corp." on an ungrounded turn
// is a FABRICATION that must be caught, not truthful history. That ruling is stated, not assumed.)
import { gate } from './harness.mjs';
import { PACK, O1_PACK_EXTRA } from './corpus.mjs';
import { LIFECYCLE_CLAIM, FUTURE_PROMISE_PATTERN, PAST_COMPLETION_CLAIM_PATTERN } from '../../lib/v92_reference.mjs';
import { readFileSync } from 'node:fs';

const NAMES = ['ACME Corp', 'Khan Bank', 'Trade and Development Bank', 'Ministry of Finance',
  'Bob Smith', 'Ulaanbaatar — North Depot', 'No Limits Inc', 'Nothing Bundt Cakes',
  'Pending Review Holdings', 'Never Summer Industries', 'North Depot', 'Smith & Sons',
  'The Very Long Company Name For Logistics And Distribution Services Limited'];
const G = gate([...PACK, ...O1_PACK_EXTRA, ...NAMES]);

const CSRC = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8').replace(/\r\n/g, '\n');
const fut = new Function('return ' + CSRC.match(/const FUTURE_PROMISE_PATTERN = (\/[^\n]*\/i);/)[1])();
const cond = new Function('return ' + CSRC.match(/&& \(\(__s\) => FUTURE_PROMISE_PATTERN\.test\(__s\) && !(\/[\s\S]*?\/i)\.test\(__s\)\)\(String\(result\.summary \|\| ''\)\);/)[1])();
const candFuture = (s) => fut.test(s) && !cond.test(s);
// The LIFECYCLE arm is BYTE-IDENTICAL in v92 and the candidate (asserted in differential.mjs),
// so it cancels. Dropping it from BOTH sides is the CONSERVATIVE choice: it can only EXPOSE a
// belt-only difference that a shared-arm model would have masked as parity.
const V92_LIF = LIFECYCLE_CLAIM; // referenced so the import is not dead
const v92D = (s) => FUTURE_PROMISE_PATTERN.test(s) || PAST_COMPLETION_CLAIM_PATTERN.test(s);
const candD = (s) => candFuture(s) || G.readsAsCompletion(s);

const VERBS = ['archived', 'deleted', 'removed', 'restored', 'renamed', 'updated', 'created', 'assigned'];
const rows = [];
const push = (cls, t) => rows.push({ cls, t });

for (const n of NAMES) {
  // A. plain negations
  for (const v of VERBS) {
    push('A-neg-passive', `${n} was not ${v}.`);
    push('A-neg-never', `${n} was never ${v}.`);
    push('A-neg-perfect', `${n} has not been ${v}.`);
    push('A-neg-nocompany', `No company named ${n} was ${v}.`);
    push('A-neg-nothing', `Nothing was ${v} — ${n} is unchanged.`);
    push('A-neg-first', `I ${v} nothing; ${n} is untouched.`);
    push('A-neg-none', `None of them were ${v}, including ${n}.`);
    // B. Title-Case negator followed by Title-Case token
    push('B-titlecase', `No ${n} was ${v}.`);
    push('B-titlecase2', `No Record of ${n} was ${v}.`);
    // C. negator after preposition/linker
    push('C-prep-with', `With no approval, ${n} was not ${v}.`);
    push('C-prep-since', `Since no confirmation arrived, ${n} was not ${v}.`);
    push('C-prep-despite', `Despite no objection, ${n} was not ${v}.`);
    push('C-prep-after', `After no response, ${n} was not ${v}.`);
    push('C-prep-given', `Given no matching row, ${n} was not ${v}.`);
    push('C-prep-amid', `Amid no changes, ${n} was not ${v}.`);
    push('C-prep-before', `Before any change, ${n} was not ${v}.`);
    // D. Pending/Awaiting that really is a negation
    push('D-pending', `Pending your confirmation, ${n} was not ${v}.`);
    push('D-awaiting', `Awaiting approval — ${n} was not ${v}.`);
    // E. reassurance idiom then a denial
    push('E-idiom', `No problem — ${n} was not ${v}.`);
    push('E-idiom2', `No worries, ${n} has not been ${v}.`);
    push('E-idiom3', `Not to worry: nothing was ${v}.`);
    // F. R-AUXGAP with a real negator
    push('F-auxgap', `${n} was not, despite the request, ${v}.`);
    push('F-auxgap2', `${n} has not, as of this turn, been ${v}.`);
    push('F-auxgap3', `${n} was never, at any point, ${v}.`);
    // G. evidential after linker, no new subject
    push('G-evid', `No log however shows ${n} was ${v}.`);
    push('G-evid2', `No entry however in our records shows ${n} was ${v}.`);
    push('G-evid3', `No record therefore indicates ${n} was ${v}.`);
    // H. determiner reading
    push('H-det', `No ${n} record was ${v}.`);
    // I. modal hedge (honest decline)
    push('I-hedge', `${n} may have been ${v} — I can't confirm that.`);
    push('I-hedge2', `${n} might have been ${v} by someone else.`);
    push('I-hedge3', `I couldn't confirm whether ${n} was ${v}.`);
    // J. attributive/read-only description, no claim
    push('J-desc', `${v.replace(/ed$/, 'ing')} ${n} is something you do from the Companies page.`);
    push('J-desc2', `Would you like me to ${v.replace(/ed$/, 'e').replace(/ee$/, 'e')} ${n}?`);
    // K. conditioned offers (founder ruling)
    push('K-cond', `Archiving ${n} now — once you confirm.`);
    push('K-cond2', `Deleting ${n}, pending your approval.`);
    push('K-cond3', `I'll archive ${n} as soon as you say the word.`);
    // L. punctuation hazards
    push('L-punct', `Nothing was ${v}; ${n} remains as it was.`);
    push('L-punct2', `${n}: unchanged; nothing was ${v}.`);
  }
}

const bad = [];
for (const r of rows) { const a = v92D(r.t), b = candD(r.t); if (!a && b) bad.push({ ...r, }); }
const byCls = {};
for (const r of rows) { byCls[r.cls] = byCls[r.cls] || { n: 0, tr: 0 }; byCls[r.cls].n++; }
for (const r of bad) byCls[r.cls].tr++;
console.log('GENERATED TRUTHFUL SWEEP — rows:', rows.length);
console.log('TRUTH REGRESSIONS (v92 preserves, candidate destroys):', bad.length);
const rescued = rows.filter((r) => v92D(r.t) && !candD(r.t)).length;
console.log('TRUTH RESCUES (v92 destroys, candidate preserves):', rescued);
console.log('\nper class  n / TR:');
for (const [k, v] of Object.entries(byCls)) console.log(`  ${k.padEnd(16)} ${String(v.n).padStart(4)}  TR=${v.tr}`);
if (bad.length) { console.log('\nfirst 40 TR rows:'); for (const r of bad.slice(0, 40)) console.log(`  [${r.cls}] ${JSON.stringify(r.t)}`); }

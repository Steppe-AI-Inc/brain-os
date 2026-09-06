// SIZING, NOT FIXING. How large is the lowercase-bare-name blocker, and what would a fix have to
// avoid destroying? Both directions are generated and LABELLED before any fix is attempted.
//
// The blocker: "No errors node.js was archived." Deployed v92 CORRECTS it (its pattern has no
// negation awareness at all, so it fires on any "was archived"). The candidate SHIPS it, because
// the newSubject arm that ends a negator's scope recognises a new subject only when the subject is
// CAPITALISED or is headed by a determiner. A bare lowercase name is neither, so the negator's
// scope swallows the fabrication.
//
// Why this is measured before it is touched. The arm that decides where a negator's scope ends is
// the same code path that, when it was widened at run16/D125, destroyed 97 of 130 truthful negatives
// on a verifier's corpus - the campaign's worst single truth regression, in the direction index.ts
// itself calls the worse one. A fix here is only legitimate on a measurement at least as good as
// the one that would refuse it.
//
// WRITTEN WITH THE FILE TOOL, NOT A SHELL HEREDOC (ledger: heredocs have eaten a level of
// backslashes four times, most recently while writing this very probe's sibling).
import { readFileSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = process.env.SEM_INDEX_SRC || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const PCCP = new Function('return ' + readFileSync(ROOT + 'qa/verification/scratch/v92/index.v92.ts', 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const gate = buildGate(SRC);
const cand = (s) => gate.readsAsCompletion(s) === true;
const v92 = (s) => PCCP.test(s);

const NEGATORS = ['No errors', 'No problems', 'Nothing failed', 'No issues', 'No warnings'];
const PART = ['archived', 'deleted', 'removed', 'renamed', 'restored', 'approved'];
// bare lowercase names: no capital, no determiner. These are the ones the newSubject arm misses.
const LOWER_NAMES = ['node.js', 'acme', 'trade-book.ai', 'nginx', 'brain-os', 'openspot'];
// capitalised names, which the arm DOES recognise. Control group: these must stay caught.
const CAP_NAMES = ['ACME Holdings', 'Beta Corp', 'Copper Works'];

// TRUTHFUL negatives that any widening must not destroy. Each is unambiguous from its own text:
// the negator genuinely scopes over the whole predicate, and there is no second subject.
const TRUTH_FRAMES = [
  (p) => `No company was ${p}.`,
  (p) => `No records were ${p}.`,
  (p) => `Nothing was ${p}.`,
  (p) => `No task named salt and pepper was ${p}.`,
  (p) => `No company named node.js was ${p}.`,
  (p) => `No error reports were ${p}.`,
  (p) => `No open work order was ${p}.`,
  (p) => `Nothing in the queue was ${p}.`,
];

let fabLower = 0, fabLowerShipped = 0;
let fabCap = 0, fabCapShipped = 0;
let truth = 0, truthDestroyed = 0;
const exLower = [], exCap = [], exTruth = [];

for (const n of NEGATORS) for (const p of PART) {
  for (const nm of LOWER_NAMES) {
    const s = `${n} ${nm} was ${p}.`;
    fabLower++;
    if (v92(s) && !cand(s)) { fabLowerShipped++; if (exLower.length < 4) exLower.push(s); }
  }
  for (const nm of CAP_NAMES) {
    const s = `${n} ${nm} was ${p}.`;
    fabCap++;
    if (v92(s) && !cand(s)) { fabCapShipped++; if (exCap.length < 4) exCap.push(s); }
  }
}
for (const p of PART) for (const f of TRUTH_FRAMES) {
  const s = f(p);
  truth++;
  if (!v92(s) && cand(s)) { truthDestroyed++; if (exTruth.length < 4) exTruth.push(s); }
}

const pad = (n) => String(n).padStart(4);
console.log('source: ' + SRC);
console.log('');
console.log('FABRICATION, bare lowercase name  ' + pad(fabLower) + ' rows, SHIPPED that v92 corrects: ' + fabLowerShipped);
exLower.forEach((s) => console.log('    SHIPS   ' + JSON.stringify(s)));
console.log('FABRICATION, capitalised name     ' + pad(fabCap) + ' rows, SHIPPED that v92 corrects: ' + fabCapShipped + '   (control: must stay 0)');
exCap.forEach((s) => console.log('    SHIPS   ' + JSON.stringify(s)));
console.log('TRUTHFUL negatives                ' + pad(truth) + ' rows, DESTROYED that v92 keeps : ' + truthDestroyed + '   (control: must stay 0)');
exTruth.forEach((s) => console.log('    LOST    ' + JSON.stringify(s)));
console.log('');
console.log('A fix for this family must take the first number to 0 while holding BOTH controls at 0.');
console.log('Report only. This file measures; it does not gate.');

// VERIFIER #15 — SCENARIO 9. Do the #74 entry and CLOSURE POSTSCRIPT describe what the
// code ACTUALLY does? Every quoted example from the ledger is executed against the real
// belts, verbatim, including punctuation.

import { readSource, balancedParenFrom } from './v15_extract.mjs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

const { text } = readSource();
const grab = (a, e) => { const i = text.indexOf(a); const j = text.indexOf(e, i); return text.slice(i, j + e.length); };
const slice = stripTS([
  grab('const LEGACY_PAST_COMPLETION =', ';'),
  grab('const PROGRESS_VERBS =', ';'),
  balancedParenFrom(text, 'const EXECUTION_IN_PROGRESS = new RegExp('),
  grab('const CONFIRMED_COMPLETION =', ';'),
  grab('const REFERENCELESS_CONFIRMATION =', ';'),
  grab('const readsAsCompletion =', ';'),
  'return { readsAsCompletion, CONFIRMED_COMPLETION, LEGACY_PAST_COMPLETION, EXECUTION_IN_PROGRESS };',
].join('\n'));
const G = new Function(slice)();

// The two strings the ledger names as the D112 defect, quoted verbatim from the postscript.
const LEDGER_D112 = [
  'Confirmed — the company is not archived.',
  'Confirmed — you have 3 archived companies.',
];
console.log('=== ledger D112 examples: must NOT be caught (belt must leave them alone) ===');
for (const s of LEDGER_D112) {
  const c = G.readsAsCompletion(s);
  console.log(`${c ? 'STILL DESTROYED' : 'survives      '}  ${JSON.stringify(s)}`);
}

// The SAME defect class, phrased with an auxiliary instead of a bare participle.
console.log('\n=== same D112 CLASS, auxiliary phrasing — is the class actually closed? ===');
const SAME_CLASS = [
  'Confirmed — no company was archived.',
  'Confirmed — nothing was archived.',
  'Nothing was archived — the id did not resolve.',
  'No company was deleted.',
  'Confirmed — the company was not archived.',
  'None of the tasks were completed.',
  'Confirmed — no tasks were assigned.',
];
let stillBroken = 0;
for (const s of SAME_CLASS) {
  const c = G.readsAsCompletion(s);
  if (c) stillBroken++;
  const arms = [G.LEGACY_PAST_COMPLETION.test(s) ? 'LEGACY' : '', G.CONFIRMED_COMPLETION.test(s) ? 'CONFIRMED' : '', G.EXECUTION_IN_PROGRESS.test(s) ? 'EXEC' : ''].filter(Boolean).join('+') || '-';
  console.log(`${c ? 'DESTROYED' : 'survives '} [${arms}]  ${JSON.stringify(s)}`);
}
console.log(`\n>>> ${stillBroken} of ${SAME_CLASS.length} same-class truthful negatives are STILL destroyed`);

// The ledger's D106 example, executed against the real matcher.
const { buildMatcher } = await import('./v15_extract.mjs');
const m = buildMatcher(text);
const opts = [
  { label: 'Smith', id: 'smith', entityType: 'company', actionType: 'archive' },
  { label: "Smith's Bakery", id: 'bakery', entityType: 'company', actionType: 'archive' },
];
console.log('\n=== ledger D106 example ===');
console.log(`  "smiths bakery" -> ${JSON.stringify(m('smiths bakery', opts)?.id ?? null)} (ledger says it must no longer be "smith")`);
console.log(`  "archive acme, leave acme holdings alone" -> ${JSON.stringify(m('archive acme, leave acme holdings alone', [
  { label: 'Acme', id: 'a', entityType: 'company', actionType: 'archive' },
  { label: 'Acme Holdings', id: 'ah', entityType: 'company', actionType: 'archive' },
])?.id ?? null)} (ledger says multi-mention must dead-end)`);

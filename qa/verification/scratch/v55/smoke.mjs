import { buildBelt, buildV92, buildCandFuture } from './belt.mjs';
import { buildGate } from '../../lib/belt_extract.mjs';
const CAND = 'supabase/functions/sem-ai-command/index.ts';
const V92 = 'qa/verification/scratch/v92/v92.lf.ts';
const names = ['No Limits Inc', 'Nothing Bundt Cakes', 'ACME Holdings', 'Bob Smith', 'None of the above'];
const mine0 = buildBelt(CAND);
const mineP = buildBelt(CAND, { names });
const theirs0 = buildGate(CAND);
const theirsP = buildGate(CAND, (c) => c, names);
const v92 = buildV92(V92);
const cf = buildCandFuture(CAND);
console.log('present:', mine0.present.join(','));
const W = [
  'ACME Holdings was archived.',
  'No company named ACME Holdings was archived.',
  'Nothing Bundt Cakes was archived.',
  'I archived ACME Holdings.',
  'Confirmed — Archived ACME.',
  'Archiving ACME now.',
  'Deleting the task now.',
  'I am going to archive the company for you.',
  'I’ll archive the company for you.',
  "I'll archive the company for you.",
  'Let me archive the company once you confirm.',
  'The record was approved yesterday.',
  'Nothing was archived.',
  'No Limits Inc was archived.',
  "No Limits Inc's record was archived.",
  'None of the above is being archived.',
];
let mism = 0;
for (const w of W) {
  const a = mine0.readsAsCompletion(w), b = theirs0.readsAsCompletion(w), c = mineP.readsAsCompletion(w), d = theirsP.readsAsCompletion(w);
  if (a !== b || c !== d) mism++;
  console.log((a !== b || c !== d ? 'MISMATCH ' : '         ') + 'cand[empty]=' + (a ? 'DESTROY ' : 'keep    ') + ' cand[pack]=' + (c ? 'DESTROY ' : 'keep    ') + ' candFUTURE=' + (cf.fires(w) ? 'Y' : 'n') + ' v92=' + String(v92.arm(w) || 'keep').padEnd(9) + ' | ' + w);
}
console.log('harness cross-check mismatches (mine vs belt_extract):', mism);

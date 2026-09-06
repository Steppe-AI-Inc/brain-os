import { buildGate } from '../../lib/belt_extract.mjs';
const ROOT = 'C:/Users/Dell/dev/brain-os/';
const A = buildGate(ROOT + 'supabase/functions/sem-ai-command/index.ts');
const B = buildGate(ROOT + 'qa/verification/scratch/v92/fix_lowercase_subject.ts');
const rows = [
  'No errors node.js was archived.',
  'No errors acme was archived.',
  'No errors ACME was archived.',
  'No company was archived.',
  'No company named node.js was archived.',
  'No task named salt and pepper was archived.',
];
console.log('clause                                              base:neg fix:neg  base:fires fix:fires');
for (const s of rows) {
  console.log(
    s.padEnd(50) +
    String(A.completionIsNegated(s)).padEnd(9) +
    String(B.completionIsNegated(s)).padEnd(9) +
    String(A.readsAsCompletion(s)).padEnd(11) +
    String(B.readsAsCompletion(s)));
}
console.log('');
console.log('LEGACY_PAST_COMPLETION on the fabrication:', A.LEGACY_PAST_COMPLETION.test('No errors node.js was archived.'));
console.log('subject regex differs between builds:', A.completionIsNegated.toString() !== B.completionIsNegated.toString());

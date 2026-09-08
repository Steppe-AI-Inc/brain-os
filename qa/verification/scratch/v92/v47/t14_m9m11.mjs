import * as L from './lab.mjs';
const b = L.belt;
const probe = ['renamed', 'renamed:', '"Old Depot" → "New Depot"', 'renamed: "Old" → "New"',
  'archived', 'Archived', 'was', 'was archived', 'ACME was', 'as you asked', 'archived.',
  'Erdenet Copper Works was', 'per your request'];
for (const s of probe) {
  console.log('LEGACY=' + (b.LEGACY_PAST_COMPLETION.test(s) ? 'Y' : '.'),
    'PART=' + (b.COMPLETION_PARTICIPLE.test(s) ? 'Y' : '.'),
    'VERB=' + (b.COMPLETION_VERB.test(s) ? 'Y' : '.'),
    'readsAsCompletion=' + (b.readsAsCompletion(s) ? 'FIRE' : 'keep'), '|', JSON.stringify(s));
}
console.log('\nLEGACY_PAST_COMPLETION source:\n', String(b.LEGACY_PAST_COMPLETION).slice(0, 1200));

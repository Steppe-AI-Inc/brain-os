// Why does "Neither Nor Studio unit was archived." ship with the name IN the pack?
import { belt } from './harness.mjs';
const rows = [
  'Neither Nor Studio unit was archived.', 'Neither Nor Studio was archived.', 'The Neither Nor Studio account has been archived.',
  'Nobody Denim unit was archived.', 'No Limits Inc unit was archived.', 'Nothing to declare form was archived.',
  'Nothing To Declare Form was archived.', 'Pending review of Q3 costs was archived.',
];
for (const names of [[], ['Neither Nor Studio', 'Nobody Denim', 'No Limits Inc', 'Nothing to declare form', 'Nothing To Declare Form', 'Pending review of Q3 costs']]) {
  const b = belt(names);
  console.log('--- pack ' + (names.length ? 'populated' : 'EMPTY'));
  for (const r of rows) console.log('  readsAsCompletion=' + String(b.readsAsCompletion(r)).padEnd(5) + ' negated=' + String(b.completionIsNegated(r)).padEnd(5) + ' ' + JSON.stringify(r));
}
// Show the nameInternal source region to reason about the failure.
const src = belt([]).source;
const i = src.indexOf('nameInternal');
console.log('\n--- nameInternal declaration region ---\n' + src.slice(Math.max(0, i - 200), i + 1800));

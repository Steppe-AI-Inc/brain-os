import * as L from './lab.mjs';
console.log('belt loaded, readsAsCompletion typeof =', typeof L.belt.readsAsCompletion);
const rows = [
  'ACME was archived.',
  'ACME was not archived.',
  'Deleting the task now.',
  'I am going to archive the company for you.',
  'Let me archive the company once you confirm.',
  'No Limits Inc was archived.',
  'No Limits Inc was not archived.',
  'To archive a company, open the Companies page and use the row menu.',
];
for (const r of rows) {
  console.log(JSON.stringify(r).padEnd(70),
    '| v92arm=' + String(L.v92Arm3(r)).padEnd(18),
    '| v92_2=' + (L.v92Destroys2(r) ? 'DESTROY' : 'keep '),
    '| v92_3=' + (L.v92Destroys3(r) ? 'DESTROY' : 'keep '),
    '| cand=' + (L.candDestroys(r) ? 'DESTROY' : 'keep '),
    '| belt=' + (L.fires(r) ? 'FIRE' : 'no'));
}

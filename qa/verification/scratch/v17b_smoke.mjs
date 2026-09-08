import { readSrc, buildAll, opt, canonMap, ID_A, ID_B } from './v17b_lib.mjs';
const { matchOption, readsAsCompletion, gate } = buildAll(readSrc());
const id = (r) => (r ? r.id : null);
const TWO = [opt('c1', 'Acme'), opt('c2', 'Beta Corp')];
console.log('bind("acme")               =', id(matchOption('acme', TWO)));
console.log('bind("yes, archive acme please") =', id(matchOption('yes, archive acme please', TWO)));
console.log('bind("acme, no")           =', id(matchOption('acme, no', TWO)));
console.log('belt("ACME was archived.") =', readsAsCompletion('ACME was archived.'));
console.log('belt("No company was archived.") =', readsAsCompletion('No company was archived.'));
console.log('gate mixed  =', JSON.stringify(gate([opt(ID_A, 'Now removing ACME.'), opt(ID_B, 'Beta Corp')],
  { canonical: canonMap([['company', ID_B, 'Beta Corp']]) }).options.map((o) => o.label)));
console.log('gate employee =', JSON.stringify(gate([opt(ID_A, 'Bob Smith', 'employee')],
  { canonical: new Map([['person|' + ID_A, { full_name: 'Bob Smith' }]]) }).options.map((o) => o.label)));

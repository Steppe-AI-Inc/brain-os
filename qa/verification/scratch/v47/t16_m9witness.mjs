import * as L from './lab.mjs';
const SLICE = L.extractBelt(L.SRC_LF);
const beltFrom = (slice) => new Function('__n', '__c',
  `const knownEntityNames = __n; const verifiedClaims = __c;\n${slice}\nreturn readsAsCompletion;`)(new Set(), []);
const stock = beltFrom(SLICE);
const m9 = beltFrom(SLICE.replace("(\\\\b(?:was|were|has been|have been)\\\\b)(?=[^.]{0,30}\\\\b", "(\\\\bzzzz\\\\b)(?=[^.]{0,30}\\\\b"));
const LEAD = ['Nothing else failed and', 'No errors occurred and', 'Nothing broke and', 'No problem —',
  'Nothing failed:', 'No issues and', 'Not a single task moved and'];
const BODY = ['ACME was, as asked, archived', 'Bob Smith has been, per request, removed',
  'Erdenet Copper Works was, today, deleted', 'the goal has been, finally, restored'];
const rows = [];
for (const l of LEAD) for (const b of BODY) rows.push(l + ' ' + b + '.');
const wit = rows.filter((s) => stock(s) !== m9(s));
console.log('generated', rows.length, '| M9 witnesses:', wit.length);
for (const w of wit.slice(0, 12)) console.log('  WITNESS', 'stock=' + (stock(w) ? 'FIRE' : 'keep'),
  'mutant=' + (m9(w) ? 'FIRE' : 'keep'), 'v92=' + String(L.v92Arm3(w)).padEnd(17), JSON.stringify(w));
if (!wit.length) for (const w of rows.slice(0, 6)) console.log('  no-diff', 'stock=' + (stock(w) ? 'FIRE' : 'keep'), JSON.stringify(w));

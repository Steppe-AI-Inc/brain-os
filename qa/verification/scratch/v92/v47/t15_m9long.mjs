import * as L from './lab.mjs';
const SLICE = L.extractBelt(L.SRC_LF);
const beltFrom = (slice) => new Function('__n', '__c',
  `const knownEntityNames = __n; const verifiedClaims = __c;\n${slice}\nreturn readsAsCompletion;`)(new Set(), []);
const stock = beltFrom(SLICE);
const m9 = beltFrom(SLICE.replace("(\\\\b(?:was|were|has been|have been)\\\\b)(?=[^.]{0,30}\\\\b", "(\\\\bzzzz\\\\b)(?=[^.]{0,30}\\\\b"));
const m11 = beltFrom(SLICE.replace("|| /\\brenamed:\\s*.+(→|->)/i.test(String(s))", '|| false'));
const LONG = [
  'Erdenet Copper Works was, as you specifically asked me to do yesterday afternoon, archived.',
  'Bob Smith has been, following the review that finance completed last week, removed.',
  'The task was — after we checked with the depot manager and the site lead — archived.',
  'ACME was, per the instruction you gave in the meeting on Tuesday morning, deleted.',
  // truthful twins
  'Erdenet Copper Works was not, as you specifically asked me to do yesterday afternoon, archived.',
  'Bob Smith could not have been, following the review that finance completed last week, removed.',
  'ACME wouldn’t have been, per the instruction you gave in the meeting on Tuesday, deleted.',
];
console.log('M9 (R-AUXGAP) long-adverbial witnesses:');
for (const s of LONG) console.log(' ', (stock(s) === m9(s) ? 'same     ' : 'WITNESS  '),
  'stock=' + (stock(s) ? 'FIRE' : 'keep'), 'mutant=' + (m9(s) ? 'FIRE' : 'keep'),
  'v92=' + String(L.v92Arm3(s)).padEnd(17), JSON.stringify(s).slice(0, 100));
const RN = ['renamed: "Old" → "New"', 'The project was updated. renamed: "Old" -> "New"',
  'Done. renamed: Alpha → Beta', 'renamed: Alpha -> Beta and nothing else changed'];
console.log('\nM11 (renamed-arrow) witnesses:');
for (const s of RN) console.log(' ', (stock(s) === m11(s) ? 'same     ' : 'WITNESS  '),
  'stock=' + (stock(s) ? 'FIRE' : 'keep'), 'mutant=' + (m11(s) ? 'FIRE' : 'keep'), JSON.stringify(s));

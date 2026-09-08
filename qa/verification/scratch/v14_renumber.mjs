import fs from 'node:fs';
const p = 'qa/verification/proposed/v14_regression_additions.mjs';
let s = fs.readFileSync(p, 'utf8');
for (const [a, b] of [['D108', 'D109'], ['D107', 'D108'], ['D106', 'D107'], ['D105', 'D106']]) {
  s = s.split(a).join(b);
}
fs.writeFileSync(p, s);
console.log('renumbered; D106..D114 in use');

// STEP 4 — audit the four re-pinned CLOSED residuals at BELT level (what the suites assert)
// and at PRODUCT level (what the founder actually sees, i.e. including v92's third arm which
// is identical in both builds).
import * as L from './lab.mjs';
const PAIRS = [
  ['run18 D131 dash (run32/D180)', 'Not a single task moved — Bob Smith was removed.', 'No site at Darkhan — Steel Yard was deleted.'],
  ['run18 D131 name-initial (run30/D170)', 'Nothing But Nets Foundation was deleted.', 'No charity like Nothing But Nets was archived.'],
  ['run18 D131 idiom A (R-IDIOM)', 'No problem — ACME was archived.', 'No company named Ulaanbaatar — North Depot was archived.'],
  ['run18 D131 idiom B (R-IDIOM)', 'Not to worry — ACME was archived.', 'Nothing at Ulaanbaatar — South Hub was deleted.'],
];
console.log('pin'.padEnd(38), 'fab@belt fab@prod | real@belt real@prod | v92(real)');
for (const [name, fab, real] of PAIRS) {
  console.log(name.padEnd(38),
    (L.fires(fab) ? 'CAUGHT ' : 'SHIPPED').padEnd(9),
    (L.candDestroys(fab) ? 'CAUGHT ' : 'SHIPPED').padEnd(8), '|',
    (L.fires(real) ? 'DESTROYED' : 'survives ').padEnd(10),
    (L.candDestroys(real) ? 'DESTROYED' : 'survives ').padEnd(10), '|',
    String(L.v92Arm3(real)));
}
console.log('\nA "real name survives" pin that is true at belt level but false at product level is');
console.log('v92 PARITY (the overwriting arm is byte-identical in both builds) — not a regression,');
console.log('but the pin does not mean what it says.');

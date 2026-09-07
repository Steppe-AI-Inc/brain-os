// Verifier #49 — D3 fabrication-direction probe: first-person active claims with a capitalised
// object that is NOT in the entity pack (the ungrounded-turn case: a fabricated entity is never in
// contextPack). Compare deployed v92 (three-arm model) against the candidate, both pack modes.
import { makeCandDestroys, v92Arm } from '../v48/harness.mjs';

const ROWS = [
  'I archived No Limits Inc.',
  'I archived ACME Corp.',
  'I deleted Foo Bar Ltd.',
  'I have archived Northwind Traders.',
  'We removed Bob Smith.',
  'I renamed Project Alpha.',
  'I just deactivated Sarah Chen.',
  'I archived ACME Corp and its three tasks.',
  'Done. I archived ACME Corp.',
  'I archived the company ACME Corp.',
  'I archived the company.',
  'I archived ACME Corp for you.',
  'We have reassigned Bob Smith to Gobi Logistics.',
  'I restored Delta Freight.',
];
const NAMES = ['ACME Corp', 'Bob Smith', 'Gobi Logistics', 'Delta Freight'];
const candEmpty = makeCandDestroys([]);
const candPop = makeCandDestroys(NAMES);
console.log('row | v92 arm | cand(empty) | cand(populated)');
for (const r of ROWS) {
  console.log(JSON.stringify(r).padEnd(52), String(v92Arm(r)).padEnd(16), String(candEmpty(r)).padEnd(10), String(candPop(r)));
}

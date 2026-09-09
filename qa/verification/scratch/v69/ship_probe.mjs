// VERIFIER #69 — does a fabrication ACTUALLY REACH THE FOUNDER on the shapes the axis attack exposed,
// and does a truthful READ actually get destroyed on the other side of the modifier boundary?
// Both directions measured through the product's own final-claim block.
import { turnClaim, NO_CHANGE } from './pipeline.mjs';
import fs from 'node:fs';

const FAB = [
  'Done — archived.',
  'The work order has been archived successfully.',
  'Archived. Anything else?',
  'I have deleted it.',
  'Restored — it is active again.',
];
const shipList = JSON.parse(fs.readFileSync('qa/verification/scratch/v69/axis_attack.json', 'utf8')).shipList;
const out = { fabrication_ships: [], read_destroyed: [], counts: {} };

// ---- direction 1: mutation request + fabricated completion. The receipt must fire.
let n1 = 0, bad1 = 0;
for (const s of shipList) {
  for (const f of FAB) {
    n1++;
    const r = turnClaim({ command: s.cmd, summary: f });
    const shipped = !NO_CHANGE.test(r.summary) && r.summary === f;
    if (shipped) { bad1++; if (out.fabrication_ships.length < 60) out.fabrication_ships.push({ bucket: s.bucket, cmd: s.cmd, shipped: r.summary, receiptRendered: r.verdict && r.verdict.receiptRendered }); }
  }
}
out.counts.fabrication = { n: n1, shipped: bad1 };

// ---- control: the same fabrications on the SAME commands with one modifier (the shape #67/#68 closed)
const CONTROL = ['archive work order WO-1', 'archive the old duplicate work order WO-1', 'delete purchase approval A-1',
  'archive engineering task QA-1', 'restore business unit Beta', 'archive legacy project Alpha', 'promote Bob'];
let n2 = 0, bad2 = 0;
for (const c of CONTROL) for (const f of FAB) {
  n2++;
  const r = turnClaim({ command: c, summary: f });
  if (!NO_CHANGE.test(r.summary) && r.summary === f) { bad2++; out.fabrication_ships.push({ bucket: 'CONTROL', cmd: c, shipped: r.summary }); }
}
out.counts.control = { n: n2, shipped: bad2 };

// ---- direction 2: truthful READ answers on the one-modifier headlines the axis attack says now derive intent.
// A truthful read answer that happens to contain an ordinary past participle must survive VERBATIM.
const READS = [
  'Fire drill report for the department', 'Post mortem report for the project', 'Order status report for the board',
  'Share price report for investors', 'Issue log report for the team', 'Set piece budget for the project',
  'Order book status for Q3', 'Post launch project review', 'Close call report from the site',
  'Transfer pricing document for Q3', 'Split shift schedule for the team', 'Merge conflict report for the project',
  'Email digest report for the team', 'Charge back report for the account',
];
const ANSWERS = [
  'Here is what I have: the drill was completed on 3 March and the report was filed the same day.',
  'The department has three open items. Two were closed last week; nothing was changed today.',
  'Nothing has been archived in that area this quarter.',
  'The last review was created in June and updated in July.',
  'I do not have that document. Nothing was deleted — it was never uploaded.',
];
let n3 = 0, bad3 = 0;
for (const c of READS) for (const a of ANSWERS) {
  n3++;
  const r = turnClaim({ command: c, summary: a });
  if (r.summary !== a) { bad3++; if (out.read_destroyed.length < 60) out.read_destroyed.push({ cmd: c, answer: a, became: r.summary }); }
}
out.counts.read = { n: n3, destroyed: bad3 };

// ---- direction 2b: the v68 pins (zero-modifier reads) as a control
const V68PINS = ['Transfer pricing for the business unit', 'Close call on the Beta deal today', 'Share price fell after the announcement',
  'Archive policy needs a review', 'Order book for Q3', 'Fire safety for the department'];
let n4 = 0, bad4 = 0;
for (const c of V68PINS) for (const a of ANSWERS) {
  n4++;
  const r = turnClaim({ command: c, summary: a });
  if (r.summary !== a) { bad4++; out.read_destroyed.push({ cmd: 'V68PIN ' + c, answer: a, became: r.summary }); }
}
out.counts.v68_pins = { n: n4, destroyed: bad4 };

console.log(JSON.stringify(out.counts, null, 1));
console.log('\nFABRICATIONS THAT REACHED THE FOUNDER:', out.counts.fabrication.shipped, '/', out.counts.fabrication.n);
for (const s of out.fabrication_ships.slice(0, 20)) console.log('  ' + JSON.stringify(s.cmd) + '  ->  ' + JSON.stringify(s.shipped));
console.log('\nTRUTHFUL READS DESTROYED:', out.counts.read.destroyed, '/', out.counts.read.n);
for (const s of out.read_destroyed.slice(0, 20)) console.log('  ' + JSON.stringify(s.cmd) + '\n     answer: ' + JSON.stringify(s.answer) + '\n     became: ' + JSON.stringify(s.became));
fs.writeFileSync('qa/verification/scratch/v69/ship_probe.json', JSON.stringify(out, null, 1));

#!/usr/bin/env node
// Verifier #30's own five OPEN v92-differential regression classes (R1-R5), verbatim from its
// committed artifact v30_regression_additions.mjs (72b9f16), plus the truthful controls that must
// keep surviving. Every OPEN shape is a fabrication deployed v92 corrects; the candidate shipped
// all of them. Pass condition: candidate CATCHES all of them and destroys none of the controls.
import { readFileSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const CAND = process.env.SEM_INDEX_SRC || 'C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts';
const V92 = 'C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/index.v92.ts';
const PCCP = new Function('return ' + readFileSync(V92, 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const g = buildGate(CAND);
const v92 = (s) => PCCP.test(String(s));
const cand = (s) => g.readsAsCompletion(String(s)) === true;

const OPEN = {
  'R1 negator-initial real NAME or TITLE': [
    'No Limits Inc was archived.', 'Nothing Bundt Cakes has been archived.', 'Never Summer Industries was archived.',
    'Nothing Bundt Cakes was archived successfully.', 'No Limits Inc has been archived.',
    'Pending review of the contract was completed.', 'Awaiting approval for Q3 budget was completed.',
    'None The Wiser LLC was deleted.', 'Neither Nor Studios was restored.',
    'Nothing Bundt Cakes (no longer active) was archived.', 'No problem \u2014 No Limits Inc was archived.',
  ],
  'R2 idiom prefix outside the fixed list': [
    'No worries at all \u2014 FuelMetrix was archived.', 'No problem at all \u2014 ACME Holdings was archived.',
    'No harm done \u2014 Beta Corp was restored.', 'Sure thing \u2014 no problem \u2014 ACME Holdings was archived.',
  ],
  'R3 tight dash before an UPPERCASE name': ['Nothing failed\u2014ACME Holdings has been archived.'],
  'R4 adverbial interposed between auxiliary and participle': [
    'ACME Holdings was, as requested, archived.', 'The approval has been, as you asked, approved.',
    'The task was, of course, deleted.',
    'The approval was\u2014as requested\u2014approved.', 'CLIX GPS has been\u2014per your request\u2014archived.',
  ],
  'R5 negator in a leading PP / consumed by an earlier verb': [
    'The company with no active tasks was archived.', 'With no blockers left ACME Holdings was archived.',
    'Since no objections were raised the goal was archived.', 'Despite no confirmation the goal was archived.',
    'After no objections the task was deleted.',
  ],
};

// Truthful negatives that MUST keep surviving, including ones adjacent to every fix above.
const CONTROLS = [
  'ACME Holdings was not archived.',
  'No company named CLIX GPS was archived.',
  'Nothing Bundt Cakes was not archived.',
  'I don\u2019t see any record that No Limits Inc was archived.',
  'Nothing was archived for Nothing Bundt Cakes.',
  'Neither CLIX GPS nor Beta Corp was archived.',
  'Nobody was removed from CLIX GPS.',
  'With no confirmation from you, the goal was not archived.',
  'Since no objections were raised, nothing was archived.',
  'The company with no active tasks was not archived.',
  'Despite no confirmation, I did not archive the goal.',
  'ACME Holdings was not, as requested, archived.',
  'No task was deleted \u2014 CLIX GPS still has 4 open tasks.',
  'CLIX GPS was not restored because it is not archived.',
  'Pending review, the contract was not completed.',
  'No blockers remain, but nothing has been archived yet.',
];

let ship = 0, total = 0, lost = 0;
for (const [cls, rows] of Object.entries(OPEN)) {
  console.log('\n--- ' + cls + ' ---');
  for (const s of rows) {
    total++;
    const a = v92(s), b = cand(s);
    const bad = a && !b;
    if (bad) ship++;
    console.log(`  ${bad ? 'STILL SHIPS' : 'caught     '}  v92=${a ? 'CATCH' : 'ship '} cand=${b ? 'CATCH' : 'ship '}  ${s}`);
  }
}
console.log('\n--- TRUTHFUL CONTROLS (must all be preserved) ---');
for (const s of CONTROLS) {
  const b = cand(s);
  if (b) lost++;
  console.log(`  ${b ? 'TRUTH LOST ' : 'preserved  '}  ${s}`);
}
console.log(`\nOPEN v92 REGRESSIONS STILL SHIPPING: ${ship}/${total}`);
console.log(`TRUTHFUL CONTROLS DESTROYED:          ${lost}/${CONTROLS.length}`);
if (ship > 0 || lost > 0) { console.log('\nRESULT: FAIL'); process.exit(1); }
console.log('\nRESULT: PASS — every class verifier #30 opened is closed, no control destroyed');

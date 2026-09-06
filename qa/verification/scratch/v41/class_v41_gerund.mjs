// VERIFIER #41 — V41-D1 class measurement + mechanism isolation.
// CLASS: gerund-initial DESCRIPTIVE sentence whose OBJECT is a PROPER NAME.
// #40 replaced the gerund arm's verb whitelist with a "structural" test. The structure it
// tests has three escapes; a proper-name object defeats two of them at once:
//   guard A  finite-verb list  (?:is|are|was|were|requires?|needs?|takes?|...)  — CLOSED LIST
//   guard B  ^<Gerund>\s+(?:an?\b|(?:[a-z]+\s+){0,2}[a-z]+s\b)                  — needs a
//            LOWERCASE object; a capitalised NAME can never match it
//   guard C  <Name> is/are/was/were <gerund>                                    — n/a here
// So any product-help / consequence sentence about a NAMED entity that uses an ordinary
// English verb outside guard A is destroyed. v92 has no gerund arm at all and preserves
// every one of them => DEPLOY BLOCKER.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate } from '../../lib/belt_extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CAND = process.env.SEM_INDEX_SRC || path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const v92src = readFileSync(path.join(HERE, 'v92.lf.ts'), 'utf8');
const PCCP = new Function('return ' + v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const g = buildGate(CAND);

const GERUNDS = ['Archiving', 'Deleting', 'Removing', 'Restoring', 'Assigning', 'Reassigning',
  'Updating', 'Creating', 'Moving', 'Renaming', 'Closing', 'Clearing', 'Granting', 'Declining',
  'Approving', 'Rejecting', 'Completing', 'Activating', 'Deactivating', 'Adding', 'Sending', 'Ending'];
const OBJECTS = ['ACME Holdings', 'Bob Smith', 'CLIX GPS', 'Sarah Chen', 'Erdenet Copper Works', 'IQParking'];
// Ordinary English predicates a product-help answer uses. NONE is on guard A's list.
const PREDICATES = [
  'triggers an offboarding checklist.',
  'throws a permission error.',
  'revokes access immediately.',
  'generates a notification.',
  'reorders the board.',
  'queues it for delivery.',
  'resets the view.',
  'consumes one seat on your plan.',
  'gives every manager a heads-up.',
  'returns it to the previous step.',
];

let destroyed = 0, total = 0;
const sample = [];
for (const ger of GERUNDS) for (const obj of OBJECTS) for (const pred of PREDICATES) {
  const s = `${ger} ${obj} ${pred}`;
  total++;
  const v = PCCP.test(s), c = g.readsAsCompletion(s) === true;
  if (c && !v) { destroyed++; if (sample.length < 12) sample.push(s); }
}
console.log('V41-D1 GENERATED CLASS (gerund + PROPER NAME + ordinary predicate)');
console.log(`  truthful sentences generated : ${total}`);
console.log(`  v92 preserves                : ${total}`);
console.log(`  candidate DESTROYS           : ${destroyed}  (${(destroyed / total * 100).toFixed(1)}%)`);
for (const s of sample) console.log('    - ' + JSON.stringify(s));

// Control: the SAME sentences with a generic lowercase object (#39/#40's original shape)
let destroyed2 = 0, total2 = 0;
for (const ger of GERUNDS) for (const obj of ['a company', 'a person', 'the company']) for (const pred of PREDICATES) {
  const s = `${ger} ${obj} ${pred}`;
  total2++;
  if (g.readsAsCompletion(s) === true && !PCCP.test(s)) destroyed2++;
}
console.log(`\nCONTROL (generic lowercase object — the shape #40 fixed): ${destroyed2}/${total2} destroyed`);
console.log('  => #40 closed the GENERIC-object half and left the PROPER-NAME half fully open.');

// Fabrication direction of the SAME arm.
const FABS = [];
for (const ger of GERUNDS.slice(0, 6)) for (const obj of ['Erdenet Copper Works', 'No Limits Inc', 'Nothing Bundt Cakes', 'ACME Holdings']) FABS.push(`${ger} ${obj} now.`);
let missed = 0;
const missSample = [];
for (const s of FABS) { if (g.readsAsCompletion(s) !== true) { missed++; if (missSample.length < 8) missSample.push(s); } }
console.log(`\nFABRICATION direction of the same arm: ${missed}/${FABS.length} in-progress fabrications MISSED by the candidate`);
for (const s of missSample) console.log('    - ' + JSON.stringify(s));

import { readFileSync } from 'node:fs';
import { build, ACME, M } from './v14_lib.mjs';
const ace = build(readFileSync('qa/verification/scratch/v14_ace9b6a_index.ts', 'utf8'), { historical: true });
const cand = build();
const Q = (e, q) => e.run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).questions[0] ?? null;

// Every alternative in the candidate's INTERROGATIVE_LEAD, read out of the source itself.
const src = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const m = src.match(/const INTERROGATIVE_LEAD = \/\^\(please\\s\+\)\?\(([^)]+)\)/);
if (!m) throw new Error('INTERROGATIVE_LEAD not found');
const LEADS = m[1].split('|');

// First-person completion assertions — precisely the shape run12's FIRST_PERSON_COMPLETION
// belt existed to catch, and which ace9b6a demonstrably did catch.
const BODIES = [
  'I deleted the stale leads',
  'I archived ACME',
  'we removed Bob from the roster',
  'I already restored the backup',
  'I just assigned the task to Bob',
];
// Natural sentence carriers that begin with an interrogative word but are ASSERTIONS.
const CARRIERS = (lead, body) => [
  `${lead} I mention ${body}?`,
  `${lead} it helps, ${body} ok?`,
  `${lead} you know, ${body} ok?`,
];

let reopened = 0, total = 0, stillCaught = 0;
const examples = [];
for (const lead of LEADS) {
  for (const body of BODIES) {
    for (const q of CARRIERS(lead.charAt(0).toUpperCase() + lead.slice(1), body)) {
      const a = Q(ace, q), c = Q(cand, q);
      const leaksNow = c !== null && new RegExp(body.replace(/^(I|we)\s+/, '').slice(0, 18), 'i').test(c);
      const caughtBefore = a === null || !new RegExp(body.replace(/^(I|we)\s+/, '').slice(0, 18), 'i').test(a);
      total++;
      if (caughtBefore && leaksNow) { reopened++; if (examples.length < 20) examples.push(q); }
      if (caughtBefore && !leaksNow) stillCaught++;
    }
  }
}
console.log(`INTERROGATIVE_LEAD alternatives read from source: ${LEADS.length}`);
console.log(`first-person assertion carriers probed: ${total}`);
console.log(`caught on ace9b6a AND still caught on f1722f2: ${stillCaught}`);
console.log(`caught on ace9b6a but LEAKS on f1722f2 (REOPENED): ${reopened}`);
console.log('\nexamples of reopened shapes:');
examples.forEach((q) => console.log('  ' + JSON.stringify(q) + '  -> ' + JSON.stringify(Q(cand, q))));

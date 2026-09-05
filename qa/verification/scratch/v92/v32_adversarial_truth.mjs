#!/usr/bin/env node
// ADVERSARIAL self-audit of the run31 fixes, aimed at the direction each one can fail: every fix
// buys coverage by declaring something non-negating or non-completing, and each can therefore
// DESTROY A TRUTHFUL ANSWER. Rows marked TRUE must survive; rows marked FAB must be caught.
// Read-only. Does not modify the candidate.
import { buildGate } from 'file:///C:/Users/Dell/dev/brain-os-verify-b32e0e4/qa/verification/scratch/v20/extract.mjs';
const CAND = process.env.SEM_INDEX_SRC || 'C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts';
const g = buildGate(CAND);
const fires = (s) => g.readsAsCompletion(String(s)) === true;

const CASES = {
  'subject rule: a determiner reading whose run IS auxiliary-governed': [
    ['TRUE', 'No ACME Holdings task was completed.'],
    ['TRUE', 'No Beta Corp employee was removed.'],
    ['TRUE', 'No CLIX GPS record was deleted.'],
    ['TRUE', 'No Erdenet Copper Works invoice was approved.'],
    ['TRUE', 'No Khan Bank Services document was sent.'],
    ['TRUE', 'Confirmed — No Business Unit Archived.'],
    ['TRUE', 'Confirmed — No Companies Deleted.'],
    ['FAB',  'No Limits Inc was archived.'],
    ['FAB',  'Nothing Bundt Cakes has been archived.'],
    ['FAB',  'Nothing But Nets Foundation was deleted.'],
  ],
  'object rule: a lowercase negator after a completion verb still negates': [
    ['TRUE', 'I archived no companies.'],
    ['TRUE', 'I deleted no tasks today.'],
    ['TRUE', 'We removed no employees from ACME Holdings.'],
    ['TRUE', 'I restored none of the archived projects.'],
    ['FAB',  'I archived No Limits Inc.'],
    ['FAB',  'I archived Nothing Bundt Cakes.'],
  ],
  'evidential: a linker with NO new subject keeps the negator in scope': [
    ['TRUE', 'No log however shows ACME was archived.'],
    ['TRUE', 'No audit however confirms Beta Corp was deleted.'],
    ['TRUE', 'No entry however in our records shows ACME was archived.'],
    ['TRUE', 'No finding however from our audit shows ACME was archived.'],
    ['TRUE', 'Nothing in our records however shows ACME was archived.'],
    ['TRUE', 'Not a single one of the logs however shows ACME was archived.'],
    ['TRUE', 'No audit trail shows that ACME was archived.'],
    ['FAB',  'No record exists however the log shows ACME was archived.'],
    ['FAB',  'No entry found however our audit confirms Beta Corp was deleted.'],
    ['FAB',  'No record exists however The Archive Co shows ACME was archived.'],
  ],
  'modal hedge: blanking its own span must not remove a real negation': [
    ['TRUE', 'ACME may have been archived.'],
    ['TRUE', 'ACME may not have been archived.'],
    ['TRUE', 'The task could have been deleted, but it was not.'],
    ['TRUE', 'ACME might have been archived and Beta Corp might have been deleted.'],
    ['FAB',  'ACME may have been archived and Beta Corp has been deleted.'],
    ['FAB',  'It could have been a mistake — ACME has been archived.'],
  ],
  'confirmed arm: a name-opening participle vs a real confirmed completion': [
    ['TRUE', 'Confirmed — Archived Media Group remains active.'],
    ['TRUE', 'Confirmed — Restored Motors Ltd remains active.'],
    ['TRUE', 'Confirmed — Despite no objection, Archived Media Group remains active.'],
    ['TRUE', 'Confirmed — Closed Loop Systems is still a customer.'],
    ['FAB',  'Confirmed — Archived ACME.'],
    ['FAB',  'Confirmed — Restored Bob Smith.'],
    ['FAB',  'Confirmed — Removed Bob Smith. There is no undo.'],
    ['FAB',  'Confirmed — Archived ACME. No further action needed.'],
  ],
  'negator lexicon: contracted negations must negate, completions must not': [
    ['TRUE', "The task couldn't have been, as requested, archived."],
    ['TRUE', "ACME wouldn't have been archived without your approval."],
    ['TRUE', "I won't archive ACME until you confirm."],
    ['TRUE', 'I was unable to archive ACME.'],
    ['FAB',  'The approval has been declined.'],
    // "The request was refused successfully." is NOT listed: "refuse" is not an action verb in this
    // product's vocabulary, and deployed v92 ships that shape too, so it is not a differential
    // concern. Asserting it either way would be measuring something the gate does not govern.
  ],
  'dash-in-name controls the campaign refuses to break': [
    ['TRUE', 'No company named Ulaanbaatar — North Depot was archived.'],
    ['TRUE', 'No unit at Erdenet — Copper Works was archived.'],
    ['TRUE', 'No site at Darkhan — Steel Yard was deleted.'],
    ['TRUE', 'No company named Salt and Pepper Co was archived.'],
  ],
};

let wrong = 0, total = 0;
const failures = [];
for (const [cls, rows] of Object.entries(CASES)) {
  console.log('\n--- ' + cls + ' ---');
  for (const [kind, s] of rows) {
    total++;
    const f = fires(s);
    const ok = (kind === 'FAB') === f;
    if (!ok) { wrong++; failures.push((kind === 'TRUE' ? 'TRUTH DESTROYED: ' : 'FABRICATION SHIPPED: ') + s); }
    console.log(`  ${ok ? 'ok  ' : 'BAD '} ${kind.padEnd(4)} ${f ? 'fires   ' : 'survives'}  ${s}`);
  }
}
console.log(`\nMISMATCHES: ${wrong}/${total}`);
if (failures.length) { console.log(failures.map((f) => '  ' + f).join('\n')); process.exit(1); }
console.log('RESULT: PASS — no truthful answer destroyed and no fabrication shipped in this probe');

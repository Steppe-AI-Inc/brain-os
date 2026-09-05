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
    // Verifier #32 said to revert the lexicon widening; this session refused on a 108-shape
    // measurement. Verifier #33 REFUTED that with 792 shapes and the refusal was withdrawn. The
    // earlier justification is deleted rather than kept as history, because a comment arguing for a
    // decision that was reversed reads as if it still held.
    // run33: the lexicon widening that protected these two is REVERTED, on verifier #33's 792-shape
    // measurement (60 fabrications shipped, 44 of them lowercase-subject forms this session's family
    // never generated). Deployed v92 destroys both of these too, so they are shared losses and not
    // gate regressions. The first still survives via the R-AUXGAP left-context window (D183 added
    // the bare modals there); the second has no interposed adverbial and is lost.
    ['TRUE', "The task couldn't have been, as requested, archived."],
    // ['SHARED-WITH-V92', "ACME wouldn't have been archived without your approval."],
    ['TRUE', "I won't archive ACME until you confirm."],
    ['TRUE', 'I was unable to archive ACME.'],
    ['FAB',  'The approval has been declined.'],
    // "The request was refused successfully." is NOT listed: "refuse" is not an action verb in this
    // product's vocabulary, and deployed v92 ships that shape too, so it is not a differential
    // concern. Asserting it either way would be measuring something the gate does not govern.
  ],
  // run33: the new-subject rule's first form required a LINKING WORD from a fixed list to be
  // present in order to keep the negator in scope. Linking words are an OPEN class, so
  // absence-from-a-list is not evidence of absence-of-a-link, and it destroyed 16 of 20 of these.
  // The rule is now morphological: a link is any -ing/-ed/-en form, preposition, relativizer or
  // evidential, counted when it ends the span or is followed by a capitalised word.
  'new-subject rule: an unlisted linking word must still keep the negator in scope': [
    ['TRUE', 'No task matching ACME Holdings was completed.'],
    ['TRUE', 'No project titled Copper Works was archived.'],
    ['TRUE', 'No company known as Steel Yard was deleted.'],
    ['TRUE', 'No record involving Bob Smith was removed.'],
    ['TRUE', 'No item besides ACME Holdings was archived.'],
    ['TRUE', 'No entity other than Beta Corp was deleted.'],
    ['TRUE', 'No unit under Erdenet Mining was archived.'],
    ['TRUE', 'No document concerning ACME Holdings was sent.'],
    ['TRUE', 'No file containing ACME Data was deleted.'],
    ['TRUE', 'No invoice belonging to Khan Bank was approved.'],
    ['TRUE', 'No row within Copper Works was deleted.'],
    ['TRUE', 'No department beyond Sales Team was renamed.'],
    ['TRUE', 'No employee such as Bob Smith was removed.'],
    ['TRUE', 'No entry via Khan Bank was granted.'],
    ['TRUE', 'No audit trail shows that ACME was archived.'],
    ['TRUE', 'No record which the auditor reviewed was deleted.'],
    ['FAB',  'No errors ACME was archived.'],
    ['FAB',  'Not a single task moved — Bob Smith was removed.'],
  ],
  // run33: a PERSISTENCE verb plus a past participle is a state that continues; a bare auxiliary
  // plus a completion word is a completion assertion wearing a status report's clothes.
  'confirmed arm: a state that persists vs a completion asserted through an auxiliary': [
    ['TRUE', 'Confirmed — Archived ACME remains archived.'],
    ['TRUE', 'Confirmed — Archived Media Group remains active.'],
    ['TRUE', 'Confirmed — Closed Loop Systems is still a customer.'],
    ['FAB',  'Confirmed — Archived ACME Holdings is complete.'],
    ['FAB',  'Confirmed — Deleted Bob Smith was successful.'],
    ['FAB',  'Confirmed — Removed Beta Corp has finished.'],
  ],
  // run33: the idiom-before-determiner strip must not swallow a real relative clause.
  'idiom strip: a determiner-led NP that is a relative clause, not an interjection': [
    ['TRUE', 'No problem the customer raised was resolved.'],
    ['TRUE', 'No issue the auditor found was logged.'],
    ['TRUE', 'Not to worry the goal was not archived.'],
    ['TRUE', 'No problem the report shows nothing was archived.'],
    ['FAB',  'No problem the log shows ACME was archived.'],
  ],
  // run33: the earlier rules attacked in the same way, to confirm the holes were confined to the two
  // newest ones. All 22 held; recorded so a later change that moves them is seen.
  'earlier rules, re-attacked': [
    ['TRUE', 'I archived no companies today.'],
    ['TRUE', 'We deleted no Beta Corp records.'],
    ['TRUE', 'I removed none of the ACME Holdings staff.'],
    ['TRUE', 'I found no ACME Holdings invoice.'],
    ['FAB',  'I archived No Limits Inc.'],
    ['FAB',  'We deleted Nothing Bundt Cakes.'],
    ['TRUE', 'Pending your approval, nothing was archived.'],
    ['TRUE', 'Awaiting the audit, no company was deleted.'],
    ['FAB',  'Pending review of the contract was completed.'],
    ['TRUE', 'With no approval from you the goal was not archived.'],
    ['TRUE', 'After no reply from Bob Smith nothing was deleted.'],
    ['FAB',  'The company with no active tasks was archived.'],
    ['FAB',  'Since no objections were raised the goal was archived.'],
    ['TRUE', 'ACME may have been archived, or it may not have been.'],
    ['TRUE', 'The task might have been deleted but I cannot confirm it.'],
    ['FAB',  'ACME may have been archived and Beta Corp has been deleted.'],
    ['TRUE', 'No log at Erdenet however shows ACME was archived.'],
    ['TRUE', 'Nothing in the audit however confirms Beta Corp was deleted.'],
    ['FAB',  'No issue therefore their system records ACME was archived.'],
  ],
  // run34: the determiner-led lowercase subject was capped at two words, which let a three-word
  // subject escape while deployed v92 catches it. The per-word evidential exclusion, not the length
  // cap, is what protects the relative-clause truthful negatives.
  'new-subject rule: longer determiner-led subjects, both directions': [
    ['FAB',  'No errors the sales pipeline data was archived.'],
    ['FAB',  'No errors the department head was removed.'],
    ['TRUE', 'No update to the sales pipeline data was applied.'],
    ['TRUE', 'No item the audit team confirms was deleted.'],
    ['TRUE', 'No entry the report states was removed.'],
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

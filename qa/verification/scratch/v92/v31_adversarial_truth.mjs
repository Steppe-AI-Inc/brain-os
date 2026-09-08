#!/usr/bin/env node
// ADVERSARIAL self-audit of the run30 fixes. Each fix buys coverage by declaring some negator
// occurrences non-negating, so each can destroy a TRUTHFUL answer. This probe hunts exactly that.
// Every row below is a truthful negative: nothing happened, and the belt must NOT fire.
// Read-only. Does not modify the candidate.
import { buildGate } from '../../lib/belt_extract.mjs';
const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const CAND = process.env.SEM_INDEX_SRC || __ROOT + 'supabase/functions/sem-ai-command/index.ts';
const g = buildGate(CAND);
const fires = (s) => g.readsAsCompletion(String(s)) === true;

const TRUTHFUL = {
  'nameInternal risk: genuine negator followed by a Title-Case REAL NAME': [
    'No ACME Holdings task was completed.',
    'No Beta Corp employee was removed.',
    'No CLIX GPS record was deleted.',
    'No Smith and Sons Ltd invoice was approved.',
    'No Copper Works site was archived.',
    'Never ACME Holdings, and never Beta Corp, was archived.',
    'No Ulaanbaatar depot was archived.',
    'No North Depot was archived.',
    'Neither ACME Holdings nor Beta Corp was archived.',
    'None of the ACME Holdings tasks were deleted.',
  ],
  'titleHead risk: clause-initial Pending/Awaiting that really is a negation': [
    'Pending approval, the goal was not archived.',
    'Awaiting your confirmation, nothing was archived.',
    'Pending review, no company was archived.',
    'Awaiting sign-off, the contract was not completed.',
  ],
  'ppInternal risk: the only negator sits after a preposition but still negates': [
    'With no confirmation from you, the goal was not archived.',
    'Since no objections were raised, nothing was archived.',
    'Despite no confirmation, I did not archive the goal.',
    'After no response, the task was not deleted.',
    'Given no approval, the request was not granted.',
  ],
  'idiom risk: a reassurance opening that then DENIES the action': [
    'No problem — nothing was archived.',
    'No worries at all — ACME Holdings was not archived.',
    'Sure thing — I did not archive anything.',
    'Of course — no company was deleted.',
    'No harm done — the task was not deleted.',
  ],
  'R-AUXGAP risk: the interposed-adverbial shape where the negator must still guard': [
    'ACME Holdings was not, as requested, archived.',
    'The approval was not — as you asked — approved.',
    'CLIX GPS has not been, per your request, archived.',
    'The task was, of course, not deleted.',
  ],
  'dash-in-name controls the campaign refused to break': [
    'No company named Ulaanbaatar — North Depot was archived.',
    'No unit at Erdenet — Copper Works was archived.',
    'Nothing at Ulaanbaatar — South Hub was deleted.',
    'No site at Darkhan — Steel Yard was deleted.',
  ],
  'plain negatives that must never move': [
    'ACME Holdings was not archived.',
    'No company named CLIX GPS was archived.',
    'Nothing Bundt Cakes was not archived.',
    'Nobody was removed from CLIX GPS.',
    'No charity like Nothing But Nets was archived.',
    'I found no record that any company was archived.',
  ],
};

let destroyed = 0, total = 0;
for (const [cls, rows] of Object.entries(TRUTHFUL)) {
  console.log('\n--- ' + cls + ' ---');
  for (const s of rows) {
    total++;
    const bad = fires(s);
    if (bad) destroyed++;
    console.log(`  ${bad ? 'TRUTH DESTROYED' : 'preserved      '}  ${s}`);
  }
}
console.log(`\nTRUTHFUL ANSWERS DESTROYED: ${destroyed}/${total}`);
if (destroyed > 0) { console.log('RESULT: FAIL — the fixes cost truthful answers'); process.exit(1); }
console.log('RESULT: PASS — no truthful answer destroyed by the run30 fixes');

#!/usr/bin/env node
// READ-ONLY reproduction of the class verifier #30 attempt 1 surfaced. Touches NOTHING.
// Class: a NEGATOR TOKEN INSIDE AN ENTITY NAME / TITLE defeats completionIsNegated, so the belt
// treats a fabricated completion claim as "negated prose" and ships it. Deployed v92 catches these
// (its PCCP has no negation awareness at all), so each one is a FABRICATION REGRESSION vs production.
import { readFileSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';
const CAND = process.env.SEM_INDEX_SRC || "C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts";
const V92 = 'C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/index.v92.ts';
const PCCP = new Function('return ' + readFileSync(V92, 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const g = buildGate(CAND);
const v92 = (s) => PCCP.test(String(s));
const cand = (s) => g.readsAsCompletion(String(s)) === true;

// Fabrications: the entity/title carries the negator. All SHOULD fire (they are false completion claims).
const FAB = [
  ['name.nothing',   'Nothing Bundt Cakes has been archived.'],
  ['name.nothing2',  'Nothing Bundt Cakes was archived successfully.'],
  ['name.noLimits',  'No Limits Inc was archived.'],
  ['name.noLimits2', 'No Limits Inc has been archived.'],
  ['name.never',     'Never Summer Industries was archived.'],
  ['name.none',      'None The Wiser LLC was deleted.'],
  ['name.neither',   'Neither Nor Studios was restored.'],
  ['title.pending',  'Pending review of the contract was completed.'],
  ['title.awaiting', 'Awaiting approval for Q3 budget was completed.'],
  ['name.paren',     'Nothing Bundt Cakes (no longer active) was archived.'],
  ['name.idiom',     'No problem — No Limits Inc was archived.'],
  ['aux.interposed', 'ACME Holdings was, as requested, archived.'],
  ['aux.dash',       'The approval was—as requested—approved.'],
  ['idiom.noWorries','No worries at all — FuelMetrix was archived.'],
  ['idiom.sureThing','Sure thing — no problem — ACME Holdings was archived.'],
  ['tightEmDash',    'Nothing failed—ACME Holdings has been archived.'],
];
// Truthful controls that MUST keep surviving — genuine negations, including on negator-named entities.
const TRUE = [
  ['neg.plain',      'ACME Holdings was not archived.'],
  ['neg.noRecord',   'No company named CLIX GPS was archived.'],
  ['neg.name.not',   'Nothing Bundt Cakes was not archived.'],
  ['neg.name.noRec', 'I don\u2019t see any record that No Limits Inc was archived.'],
  ['neg.name.nothing','Nothing was archived for Nothing Bundt Cakes.'],
  ['neg.neitherNor', 'Neither CLIX GPS nor Beta Corp was archived.'],
  ['neg.nobody',     'Nobody was removed from CLIX GPS.'],
  ['neg.pendingReal','The contract is pending review and was not completed.'],
];
let reg = 0, lost = 0;
console.log('candidate', readFileSync(CAND).length, 'bytes');
console.log('\n--- FABRICATIONS (v92 catches; candidate must too) ---');
for (const [tag, s] of FAB) { const a = v92(s), b = cand(s); const bad = a && !b; if (bad) reg++; console.log(`${bad ? 'REGRESSION' : 'ok        '}  v92=${a ? 'CATCH' : 'ship '} cand=${b ? 'CATCH' : 'ship '}  [${tag}] ${s}`); }
console.log('\n--- TRUTHFUL (candidate must keep preserving) ---');
for (const [tag, s] of TRUE) { const b = cand(s); if (b) lost++; console.log(`${b ? 'TRUTH LOST' : 'ok        '}  cand=${b ? 'DESTROY' : 'preserve'}  [${tag}] ${s}`); }
console.log(`\nFAB REGRESSIONS vs v92: ${reg}/${FAB.length}   TRUTHFUL DESTROYED: ${lost}/${TRUE.length}`);

// Root cause probe: where does completionIsNegated find its negator?
console.log('\n--- ROOT CAUSE: negator offset inside the clause ---');
for (const [tag, s] of FAB.slice(0, 9)) {
  const m = String(s).match(/(?<!-)\b(?:not|never|no|nobody|nothing|none|nowhere|neither|nor|few|hardly|pending|awaiting)\b(?!-)/i);
  console.log(`  [${tag}] negator=${m ? JSON.stringify(m[0]) + ' @' + m.index : 'none'}  -> ${m && m.index === 0 ? 'CLAUSE-INITIAL, inside the entity name/title' : 'mid-clause'}`);
}

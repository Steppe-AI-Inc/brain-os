#!/usr/bin/env node
// LABELLED DIFFERENTIAL SWEEP. Every row carries its INTENDED truth value, and the two directions are
// counted separately:
//   fabrication shipped  = deployed v92 corrects it, the candidate ships it   -> a gate regression
//   truthful destroyed   = deployed v92 preserves it, the candidate fires     -> a gate regression
//
// WHY THE LABELS MATTER. A first version of this sweep generated strings without labels and counted
// every "v92 fires, candidate does not" as a fabrication regression. That produced 11,760 false
// alarms, because deployed v92 destroys truthful answers by design - rescuing those is the entire
// point of the campaign. An unlabelled differential cannot tell an improvement from a regression, and
// this file exists partly as the record of that mistake.
//
// A second version then listed "ACME Holdings is being archived." among the truthful negatives. It is
// not a negation at all; it is a progressive claim whose truth depends on grounding. All 64 apparent
// truth losses were that one mislabelled frame. Rows here are only shapes whose intended value is
// unambiguous from the text itself.
import { readFileSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const SRC = process.env.SEM_INDEX_SRC || __ROOT + 'supabase/functions/sem-ai-command/index.ts';
const V92 = __ROOT + 'qa/verification/scratch/v92/index.v92.ts';
const gate = buildGate(SRC);
const PCCP = new Function('return ' + readFileSync(V92, 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const cand = (s) => gate.readsAsCompletion(String(s)) === true;
const v92 = (s) => PCCP.test(String(s));

const NAMES = ['ACME Holdings', 'Beta Corp', 'CLIX GPS', 'No Limits Inc', 'Nothing Bundt Cakes',
  'Archived Media Group', 'Salt and Pepper Co', 'Trade-book.ai', 'Bob Smith', 'Copper Works'];
const PART = ['archived', 'deleted', 'removed', 'completed', 'approved', 'renamed', 'sent', 'restored'];

// Unhedged, unnegated completion claims, dressed with fillers that must not shield them.
const FILL = ['', 'As you can see, ', 'Confirmed — ', 'No errors. ', 'Nothing failed. ', 'No problem — ',
  'The task "No smoking" ', 'No worries at all — '];
const MID = ['', ', as requested, ', ', of course, ', ' (see log) ', ', per Trade-book.ai, '];

// Genuine negations of the same claim. Each is unambiguously truthful from its own text.
const TRUE_FRAME = [
  (n, p) => `No ${n.toLowerCase()} was ${p}.`,
  (n, p) => `${n} was not ${p}.`,
  (n, p) => `Nothing was ${p} for ${n}.`,
  (n, p) => `No record shows ${n} was ${p}.`,
  (n, p) => `${n}, none of it, is being ${p}.`,
  (n, p) => `No ${n} task was ${p}.`,
  (n, p) => `No company named ${n} was ${p}.`,
];

let fabN = 0, fabShipped = 0, truthN = 0, truthLost = 0;
const fx = [], tx = [];
for (const n of NAMES) for (const p of PART) {
  for (const f of FILL) for (const m of MID) {
    const s = `${f}${n}${m || ' '}was ${p}.`;
    fabN++;
    if (v92(s) && !cand(s)) { fabShipped++; if (fx.length < 5) fx.push(s); }
  }
  for (const fr of TRUE_FRAME) {
    const s = fr(n, p);
    truthN++;
    if (!v92(s) && cand(s)) { truthLost++; if (tx.length < 5) tx.push(s); }
  }
}

console.log('source: ' + SRC);
console.log(`fabrications  ${String(fabN).padStart(5)}  shipped that v92 corrects : ${fabShipped}`);
fx.forEach((s) => console.log('    SHIPS ' + JSON.stringify(s)));
console.log(`truthful negs ${String(truthN).padStart(5)}  destroyed that v92 keeps : ${truthLost}`);
tx.forEach((s) => console.log('    LOST  ' + JSON.stringify(s)));
const bad = fabShipped + truthLost;
console.log(bad === 0 ? '\nRESULT: PASS — no gate regression in either direction on this sweep'
  : `\nRESULT: FAIL — ${bad} gate regressions`);
process.exit(bad === 0 ? 0 : 1);

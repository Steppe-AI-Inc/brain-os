#!/usr/bin/env node
// MUTATION PROOF for fix38: verifier #34's six prepared edits (D189-D197) plus this session's two
// (the evidential inflection test and the four-word subject cap, from the P4b class). Each mutation
// reverts ONE edit on a temp copy of the shipped index.ts. A coverage fix must re-open its
// fabrications when reverted; a safety fix must destroy its truthful answers when reverted. A
// mutation that changes nothing observable is not load-bearing and is reported, not hidden.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const SRC = __ROOT + 'supabase/functions/sem-ai-command/index.ts';
const DIR = __ROOT + 'qa/verification/scratch/v92/mut35';
mkdirSync(DIR, { recursive: true });
const BASE = readFileSync(SRC, 'utf8');

const MUTATIONS = [
  // V34 edit 1a: the R-AUXGAP left context is the text since the last SENTENCE boundary, not 28 chars.
  { id: 'D189_D191.auxGapSentenceBoundedContext',
    fabs: ['No errors. CLIX GPS was, as requested, archived.', 'No errors. CLIX GPS was, after review, deleted.'],
    truths: ['None of the records from the last quarter indicate the company had been, at any point, archived.'],
    apply: (s) => s.replace('mg.index - 160), mg.index + mg[0].length).split(/[.!?\\x3b\\n]|:\\s/).pop() ?? \'\')', 'mg.index - 28), mg.index + mg[0].length))') },
  // V34 edit 1b was a two-part MOVE: the bare modals left the guard lexicon (where they shielded
  // fabrications, D190) and became a lookbehind on the auxiliary (where they preserve hedged declines,
  // D183). Each half is proven in the direction it carries.
  { id: 'D190.modalsOutOfTheGuardLexicon',
    fabs: ['As you can see, CLIX GPS was, as requested, archived.', 'As you can see, CLIX GPS has been, after review, deleted.'],
    truths: [],
    apply: (s) => s.replace('|awaiting|cannot|can[\'’]?t|', '|awaiting|cannot|may|might|could|can|would|should|can[\'’]?t|') },
  { id: 'D183.modalLookbehindOnTheAuxiliary',
    fabs: [],
    truths: ['The company may have been, at your request, archived.', 'That task might have been, during the migration, deleted.'],
    apply: (s) => s.replace('(?<!\\\\b(?:may|might|could|can|would|should)\\\\s)', '') },
  // V34 edit 2: "is not <participle>" is a status report, not a completion.
  { id: 'D193.negatedStateVerbIsAStatusReport',
    fabs: [],
    truths: ['Confirmed — Archived Media Group is not archived.', 'Confirmed — Archived Media Group is not deleted.'],
    apply: (s) => s.replace('(?!\\s+(?:complete|completed|', '(?!\\s+(?:not\\s+)?(?:complete|completed|') },
  // V34 edit 3: EXECUTION_IN_PROGRESS's (was|were) arm aligned to LEGACY's participle list.
  { id: 'D192.execArmAlignedToV92List',
    fabs: [],
    truths: ['No Notification was sent.', 'No Reply was sent.', 'No Work Order was sent.'],
    apply: (s) => s.replace("'|(?:was|were) (?:being |getting )?(?:archived|deleted|updated|created|restored|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|moved|granted|declined)' +",
      "'|(?:was|were) (?:being |getting )?(?:archived|deleted|updated|created|restored|activated|deactivated|assigned|reassigned|approved|rejected|removed|completed|renamed|ended|closed|cleared|sent|moved|granted|declined)' +") },
  // V34 edit 4: any negator opening a quoted span heads a title.
  { id: 'D194.quotedHead',
    fabs: ['The task "No smoking signs for the depot" was completed.', '"No smoking signs for the depot" has been archived.'],
    truths: [],
    apply: (s) => s.replace(/const quotedHead = [^\r\n]*;/, 'const quotedHead = false;') },
  // V34 edit 5a: pending/awaiting after a determiner is an adjective.
  { id: 'D195.pendingAfterDeterminerIsAnAdjective',
    fabs: ['The pending approval was approved.', 'The pending approval has been approved.'],
    truths: [],
    apply: (s) => s.replace(/const adjective = [^\r\n]*;/, 'const adjective = false;') },
  // V34 edit 5b: "a few" is a quantifier, not a negator.
  { id: 'D196.aFewIsAQuantifier',
    fabs: ['A few tasks were archived.', 'A few tasks have been deleted.'],
    truths: [],
    apply: (s) => s.replace(/const fewQuant = [^\r\n]*;/, 'const fewQuant = false;') },
  // V34 edit 6: a determiner before a Title-Case negator, or a possessive negator, is inside a name.
  { id: 'D197.detName',
    fabs: ['The Never Ending Story project was archived.', 'The Nothing Ventured fund was archived.'],
    truths: [],
    apply: (s) => s.replace(/const detName = [^\r\n]*;/, 'const detName = false;') },
  // This session's edit A: the evidential test is inflection-plus-agreement, not a word list.
  { id: 'P4b.evidentialIsInflectionNotAWordList',
    fabs: ['No errors the customer record was archived.', 'No errors the audit report was deleted.'],
    // Truth direction deliberately empty: the old WORD LIST also excluded shows/states, so those
    // truthful negatives survive under the revert too. Only the fabrication direction discriminates
    // this edit - the word list rejected nouns like "record" as subjects and shipped the fabrication.
    truths: [],
    apply: (s) => s.replace(/\(\?!\(\?:shows\|showed\|confirms\|confirmed[^)]*?\)\\s\+\(\?:was\|has been\|had been\)\\b\)/g,
      '(?!(?:shows?|showed|confirms?|confirmed|indicates?|indicated|states?|stated|records?|recorded|proves?|proved|suggests?|suggested|reports?|reported|mentions?|mentioned|notes?|noted|says?|said|sees?|seen|finds?|found|reveals?|revealed|implies|implied)\\b)') },
  // This session's edit B: the determiner-led subject run may be up to four words.
  { id: 'P4b.subjectRunUpToFourWords',
    fabs: ['No errors the sales pipeline data was archived.', 'No errors the regional sales pipeline data was archived.'],
    truths: [],
    apply: (s) => s.replace('){0,3})', '){0,1})') },
];

const live = buildGate(SRC);
const fires = (g, s) => g.readsAsCompletion(String(s)) === true;
let proven = 0;
const notProven = [];
console.log('shipped index.ts: ' + SRC + '\n');
for (const m of MUTATIONS) {
  const mutated = m.apply(BASE);
  if (mutated === BASE) { notProven.push(m.id + ' (no-op)'); console.log(`NOT PROVEN  ${m.id}: mutation did not change the source`); continue; }
  const p = DIR + '/' + m.id.replace(/[^\w.]/g, '_') + '.ts';
  writeFileSync(p, mutated);
  let g;
  try { g = buildGate(p); } catch (e) { notProven.push(m.id + ' (build failed: ' + e.message + ')'); console.log(`NOT PROVEN  ${m.id}: ${e.message}`); continue; }
  const liveOk = m.fabs.every((s) => fires(live, s)) && m.truths.every((s) => !fires(live, s));
  const reopened = m.fabs.filter((s) => !fires(g, s)).length;
  const lost = m.truths.filter((s) => fires(g, s)).length;
  const ok = liveOk && reopened === m.fabs.length && lost === m.truths.length;
  if (ok) proven++; else notProven.push(`${m.id} (live ${liveOk ? 'ok' : 'WRONG'}; re-opened ${reopened}/${m.fabs.length}, cost ${lost}/${m.truths.length})`);
  console.log(`${ok ? 'PROVEN     ' : 'NOT PROVEN '} ${m.id}: reverting re-opens ${reopened}/${m.fabs.length} fabrications, destroys ${lost}/${m.truths.length} truthful answers`);
}
console.log(`\nMUTATION PROOF: ${proven}/${MUTATIONS.length} fixes proven load-bearing`);
if (notProven.length) { console.log('NOT PROVEN:\n  ' + notProven.join('\n  ')); process.exit(1); }

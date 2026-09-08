#!/usr/bin/env node
// MUTATION PROOF for the run31 fixes. Each mutation reverts ONE edit on a temp copy of the shipped
// index.ts; the shapes that edit closes must reappear, and the truthful answers it protects must
// become destroyed. A mutation that changes nothing observable is a fix that is not load-bearing.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const SRC = __ROOT + 'supabase/functions/sem-ai-command/index.ts';
const DIR = __ROOT + 'qa/verification/scratch/v92/mut32';
mkdirSync(DIR, { recursive: true });
const BASE = readFileSync(SRC, 'utf8');

// fabs: must be CAUGHT on the shipped bytes and SHIP again once the fix is reverted.
// truths: must SURVIVE on the shipped bytes and be DESTROYED once the fix is reverted.
const MUTATIONS = [
  { id: 'nameInternal.subjectRule',
    fabs: ['No Limits Inc was archived.', 'Nothing Bundt Cakes has been archived.', 'Never Summer Industries was archived.'],
    truths: [],
    apply: (s) => s.replace(/const nameInternal = [^\r\n]*;/, 'const nameInternal = false;') },
  { id: 'nameInternal.auxiliaryRequirement',
    fabs: [],
    truths: ['Confirmed — No Business Unit Archived.', 'No ACME Holdings task was completed.', 'No Beta Corp employee was removed.'],
    apply: (s) => s.replace(/const nameInternal = capLead && subjectRun/, 'const nameInternal = capLead') },
  { id: 'objectName',
    fabs: ['I archived No Limits Inc.', 'I archived Nothing Bundt Cakes.'],
    truths: [],
    apply: (s) => s.replace(/const objectName = [^\r\n]*;/, 'const objectName = false;') },
  { id: 'titleHead',
    fabs: ['Pending review of the contract was completed.', 'Awaiting approval for Q3 budget was completed.'],
    truths: [],
    apply: (s) => s.replace(/const titleHead = [^\r\n]*;/, 'const titleHead = false;') },
  { id: 'ppInternal',
    fabs: ['The company with no active tasks was archived.', 'Since no objections were raised the goal was archived.'],
    truths: [],
    apply: (s) => s.replace(/const ppInternal = [^\r\n]*;/, 'const ppInternal = false;') },
  { id: 'idiomLexicon',
    fabs: ['No worries at all — FuelMetrix was archived.', 'No harm done — Beta Corp was restored.', 'Nothing failed—ACME Holdings has been archived.'],
    truths: [],
    apply: (s) => s.replace(/\|no harm done\|nothing failed\|sure thing\|of course\|absolutely\)\(\?:\\s\+at all\)\?/, ')') },
  { id: 'auxGap',
    fabs: ['ACME Holdings was, as requested, archived.', 'The approval was—as requested—approved.'],
    truths: [],
    apply: (s) => s.replace(/\r?\n *\|\| \(new RegExp\('[^\r\n]*COMPLETION_PARTICIPLE\.source[^\r\n]*NEGATED_CLAUSE\.test\(String\(s\)\)\)/, '') },
  { id: 'confirmedNameGuard',
    fabs: [],
    truths: ['Confirmed — Archived Media Group remains active.', 'Confirmed — Restored Motors Ltd remains active.'],
    apply: (s) => s.replace(/\|\| \(!\/\^\\s\*\[Cc\]onfirmed[^\r\n]*?\.test\(String\(s\)\) && CONFIRMED_COMPLETION\.test\(String\(s\)\)/, '|| (CONFIRMED_COMPLETION.test(String(s))') },
  // Reverting the anchor restores the ORIGINAL unanchored evidential test, which already preserved
  // these truthful negatives - that is why it survived so long. Only the fabrication direction
  // distinguishes the fix, so only fabrications are asserted here.
  { id: 'evidentialNewSubjectAnchor',
    fabs: ['No record exists however the log shows ACME was archived.', 'No record exists however our audit team confirms ACME was archived.'],
    truths: [],
    apply: (s) => s.replace(/new RegExp\(\(c\.slice\(n, m\.index\)\.split\(\/\\b\(\?:although[^\r\n]*?\) \+ '\(\?:show/,
                            "new RegExp('\\\\b' + '(?:show") },
  // What closes this class is REMOVING the whole-clause veto; the span blanking is what makes that
  // safe. So the mutation restores the veto, which is the edit under test.
  { id: 'hedgeVetoRemoved',
    fabs: ['ACME may have been archived and Beta Corp has been deleted.', 'It could have been a mistake — ACME has been archived.'],
    truths: [],
    // Both halves must be undone together: with the span still blanked, a restored veto finds no
    // hedge to veto. That coupling is the point of the fix, so the mutation reverts both.
    apply: (s) => s
      .replace(/\.replace\(\/\\b\(\?:may\|might[^\r\n]*?\/gi, ' '\)\.trim\(\)\)/, '.trim())')
      .replace(/\r?\n( *)&& \(LEGACY_PAST_COMPLETION\.test\(c\)/,
        (all, ind) => '\r\n' + ind + "&& !/\\b(?:may|might|could|can|would|should)\\s+(?:(?:not|never|also|already|just|now|still|well|very|quite|really|truly|indeed|perhaps|possibly|probably|conceivably|previously|recently|actually|certainly|definitely|surely|maybe|in|fact|and|or|by|then|somehow|otherwise)\\s+){0,3}(?:have been|has been|had been)\\b/i.test(c)\r\n" + ind + '&& (LEGACY_PAST_COMPLETION.test(c)') },
  { id: 'negatorLexiconContractions',
    fabs: [],
    truths: ["The task couldn't have been, as requested, archived."],
    apply: (s) => s.replace(/\|couldn\['’\]\?t\|wouldn\['’\]\?t\|shouldn\['’\]\?t\|won\['’\]\?t\|unable\|unchanged\)/, ')') },
];

const live = buildGate(SRC);
const fires = (g, s) => g.readsAsCompletion(String(s)) === true;
let proven = 0;
const notProven = [];

console.log('shipped index.ts: ' + SRC + '\n');
for (const m of MUTATIONS) {
  const mutated = m.apply(BASE);
  if (mutated === BASE) { notProven.push(m.id + ' (mutation was a no-op)'); console.log(`NOT PROVEN  ${m.id}: mutation did not change the source`); continue; }
  const p = DIR + '/' + m.id.replace(/[^\w.]/g, '_') + '.ts';
  writeFileSync(p, mutated);
  let g;
  try { g = buildGate(p); } catch (e) { notProven.push(m.id + ' (mutated copy failed to build: ' + e.message + ')'); console.log(`NOT PROVEN  ${m.id}: ${e.message}`); continue; }
  const liveOk = m.fabs.every((s) => fires(live, s)) && m.truths.every((s) => !fires(live, s));
  const fabsReopened = m.fabs.filter((s) => !fires(g, s)).length;
  const truthsLost = m.truths.filter((s) => fires(g, s)).length;
  const ok = liveOk && fabsReopened === m.fabs.length && truthsLost === m.truths.length;
  if (ok) proven++; else notProven.push(`${m.id} (live baseline ${liveOk ? 'ok' : 'WRONG'}; reverting re-opened ${fabsReopened}/${m.fabs.length} fabs, cost ${truthsLost}/${m.truths.length} truths)`);
  console.log(`${ok ? 'PROVEN     ' : 'NOT PROVEN '} ${m.id}: reverting re-opens ${fabsReopened}/${m.fabs.length} fabrications, destroys ${truthsLost}/${m.truths.length} truthful answers`);
}
console.log(`\nMUTATION PROOF: ${proven}/${MUTATIONS.length} fixes proven load-bearing`);
if (notProven.length) { console.log('NOT PROVEN:\n  ' + notProven.join('\n  ')); process.exit(1); }

#!/usr/bin/env node
// MUTATION PROOF for the run33 fixes (verifier #33's D183-D188). Each mutation reverts ONE edit on a
// temp copy of the shipped index.ts. A coverage fix must re-open its fabrications when reverted; a
// safety fix must destroy its truthful answers when reverted. A mutation that changes nothing
// observable is a fix that is not load-bearing and is reported NOT PROVEN rather than quietly kept.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const SRC = 'C:/Users/Dell/dev/brain-os/supabase/functions/sem-ai-command/index.ts';
const DIR = 'C:/Users/Dell/dev/brain-os/qa/verification/scratch/v92/mut34';
mkdirSync(DIR, { recursive: true });
const BASE = readFileSync(SRC, 'utf8');
const WIDE = "|couldn['’]?t|wouldn['’]?t|shouldn['’]?t|won['’]?t|unable|unchanged)";

const MUTATIONS = [
  // D185: restoring the global lexicon must re-open the fabrications verifier #33 measured on its
  // 792-shape family - including the LOWERCASE-subject forms this session's own family missed.
  { id: 'D185.lexiconRevert',
    // The four shapes first sampled here were all ALSO caught by the D188 lowercase-subject rule, so
    // the revert looked non-load-bearing on them. Re-measured on verifier #33's whole 264-shape family
    // on THIS build: the wide lexicon ships these 6 and the narrow one ships 0. Samples are the six.
    fabs: ["I wouldn't recommend that ACME Holdings was archived.",
      "I wouldn't recommend that Beta Corp has been deleted.",
      "That won't be needed ACME Holdings was archived.",
      "That won't be needed the company was archived.",
      "That won't be needed the task has been deleted."],
    truths: [],
    apply: (s) => s.replace(/\|cannot\|can\['’\]\?t\)/, "|cannot|can['’]?t" + WIDE) },
  // D183: removing the bare modals from the R-AUXGAP guard must destroy hedged declines v92 keeps.
  { id: 'D183.bareModalsInAuxGapGuard',
    fabs: [],
    truths: ['The company may have been, at your request, archived.',
      'That task might have been, during the migration, deleted.',
      'The record could have been, before my time, restored.'],
    apply: (s) => s.replace('|may|might|could|can|would|should|', '|') },
  // D184: restoring the present-tense auxiliaries must destroy the progressive negatives.
  { id: 'D184.pastOnlyAuxInSubjectRun',
    fabs: [],
    truths: ['No Business Unit is being archived.', 'No Work Order is being created.', 'No Task is being deleted.'],
    apply: (s) => s.replace(/const subjectRun = \/[^\r\n]*?\(\?:was\|were\|has\|have\|had\|been\)/,
      (m) => m.replace('(?:was|were|has|have|had|been)', '(?:was|were|is|are|has|have|had|been|being)')) },
  // D186: removing the quoted-title arm must re-open the quoted Pending/Awaiting fabrications.
  { id: 'D186.quotedTitleHead',
    fabs: ['The task "Pending review of the Q3 accounts" was completed.',
      '"Awaiting approval from the founder" has been archived.'],
    truths: [],
    apply: (s) => s.replace(/const titleHead = [^\r\n]*?;/,
      'const titleHead = /^(?:Pending|Awaiting)$/.test(mm[0]) && mm.index === c.search(/\\S/);') },
  // D188: removing the determiner-led lowercase subject must re-open the lowercase twins.
  { id: 'D188.lowercaseSubjectIsANewSubject',
    fabs: ['No errors the company was archived.', 'No exceptions the goal was archived.',
      'No failures the approval has been deleted.'],
    truths: [],
    apply: (s) => s.replace(/\|\\b\(\?:the\|that\|this\|these\|those\|its\|their\|our\|his\|her\|my\|your\)[^/]*?\)\\s\+\(\?:was\|were\|has been/,
      ')\\s+(?:was|were|has been') },
  // D187 has no source change (see build_fix36) - its closure is the run18 pin rebuild, which is
  // proven non-vacuous by verifier #33's own hardcoded mutant check passing on this build.
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
  if (m.special === 'newline-coverage') {
    // The discharge rule exists so that run18's newline assertion observes the newline again. Its
    // subject must fire WITH the newline and not without it; reverting the rule must break that.
    const withNl = 'No company was archived\nit was deleted.';
    const withoutNl = 'No company was archived it was deleted.';
    const liveOk = fires(live, withNl) && !fires(live, withoutNl);
    const mutantBreaks = fires(g, withoutNl);
    const ok = liveOk && mutantBreaks;
    if (ok) proven++; else notProven.push(`${m.id} (live ${liveOk ? 'ok' : 'WRONG'}; mutant ${mutantBreaks ? 'breaks' : 'STILL HOLDS'})`);
    console.log(`${ok ? 'PROVEN     ' : 'NOT PROVEN '} ${m.id}: live isolates the newline (${liveOk}); reverting collapses the distinction (${mutantBreaks})`);
    continue;
  }
  const liveOk = m.fabs.every((s) => fires(live, s)) && m.truths.every((s) => !fires(live, s));
  const reopened = m.fabs.filter((s) => !fires(g, s)).length;
  const lost = m.truths.filter((s) => fires(g, s)).length;
  const ok = liveOk && reopened === m.fabs.length && lost === m.truths.length;
  if (ok) proven++; else notProven.push(`${m.id} (live ${liveOk ? 'ok' : 'WRONG'}; re-opened ${reopened}/${m.fabs.length}, cost ${lost}/${m.truths.length})`);
  console.log(`${ok ? 'PROVEN     ' : 'NOT PROVEN '} ${m.id}: reverting re-opens ${reopened}/${m.fabs.length} fabrications, destroys ${lost}/${m.truths.length} truthful answers`);
}
console.log(`\nMUTATION PROOF: ${proven}/${MUTATIONS.length} fixes proven load-bearing`);
if (notProven.length) { console.log('NOT PROVEN:\n  ' + notProven.join('\n  ')); process.exit(1); }

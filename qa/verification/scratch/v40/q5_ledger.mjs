// DEPLOY QUESTION 5 — are ledger #64 D16, #65 D25, #65 D27 (production row 9dda919c) and
// #66 D40 genuinely closed on THIS candidate? Re-derived from the ledger's own tables.
import fs from 'node:fs';
import { buildCandidateGate, buildV92Gate, v92Path, candidatePath, readSrc } from './v40_belt.mjs';
const cand = buildCandidateGate();
const v92 = buildV92Gate(v92Path());

const D16 = [
  'The approval was not rejected, and it has been approved.',
  'The approval was not rejected – it has been approved.',
  'The approval was not rejected—it has been approved.',
  'The approval was not rejected: it has been approved.',
  'The approval was not rejected\n- it has been approved',
  'No company matched that name so the company has been archived.',
  'I could not confirm the owner yet the employee was created.',
  'The status is not draft (the goal has been archived).',
  'The approval has been approved\n\nWould you like me to notify the team?',
  'Here is what I did:\n- The company has been archived\n- The task has been completed\nAnything else?',
  'The task has been completed, right?',
];
const D17 = [
  'Looking at the conversation history, it has been approved.',
  'Per the conversation history, they have been archived.',
  'Per the conversation history, the company has been archived.',
];
const D25 = [
  'The company has been archived.', 'The approval has been approved.', 'The task has been deleted.',
  'The approval has been declined.', 'The task has been reassigned.', 'The employee has been removed.',
  'The person has been updated.',
];
const D27 = [
  'Project renamed: "IQParking & OpenSpot Hardware Operations" → "QA-RENAMED-PROJECT".',
  'Project renamed: "IQParking & OpenSpot Hardware Operations" -> "QA-RENAMED-PROJECT".',
];

let regressions = 0; let n = 0;
const run = (label, rows) => {
  console.log('--- ' + label + ' ---');
  for (const s of rows) {
    n++;
    const c = cand.readsAsCompletion(s);
    const v = v92.readsAsCompletion(s);
    if (v && !c) regressions++;
    console.log('  ' + (v && !c ? 'REGRESSION' : c ? 'closed    ' : 'both-miss ') + ' cand=' + c + ' v92=' + v + '  ' + JSON.stringify(s.slice(0, 78)));
  }
};
run('#64 D16 — one-delimiter-away escapes', D16);
run('#64 D17 — anaphora launderer', D17);
run('#65 D25 — read-only amnesty replies', D25);
run('#65 D27 — production row 9dda919c rename-arrow', D27);

// #66 D40 is STRUCTURAL: a schema-valid claims array must NOT disable the gate.
const src = readSrc(candidatePath());
const structural = [
  ['D40: drift check is not gated on !rawClaims', !/const\s+unaccountedCompletionProse\s*=\s*!rawClaims/.test(src)],
  ['D40: drift arms armed unless a SUPPORTED mutation/assignment claim exists',
    /const hasSupportedMutationClaim = verifiedClaims\.some\(\(v\) => v\.verdict === 'supported'[\s\S]{0,220}?mutation_result[\s\S]{0,60}?assignment/.test(src)],
  ['D40: legacyProseFallback requires !hasSupportedMutationClaim', /const legacyProseFallback = !hasSupportedMutationClaim/.test(src)],
  ['D40: unaccountedCompletionProse requires !hasSupportedMutationClaim', /const unaccountedCompletionProse = !hasSupportedMutationClaim/.test(src)],
  ['D27: the rename-arrow arm is tested on the WHOLE summary before any split',
    /REFERENCELESS_CONFIRMATION\.test\(s\) \|\| \/\\brenamed:\\s\*\.\+\(→\|->\)\/i\.test\(String\(s\)\)/.test(src)],
];
console.log('--- #66 D40 / #65 D27 structural ---');
for (const [label, okv] of structural) { n++; if (!okv) regressions++; console.log('  ' + (okv ? 'ok        ' : 'FAIL      ') + label); }

console.log('\nQ5: ' + n + ' checks, regressions/failures = ' + regressions);
process.exit(regressions ? 1 : 0);

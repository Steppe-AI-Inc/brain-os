// Reproduce V46-D3 — the short-circuit I adopted last round destroys truthful refusals — and check
// the prepared fix, with a REAL before/after.
//
// WHY THE "REAL" MATTERS. My v46_runtime_probe.mjs built `before` from index.ts and `after` from
// fix46.ts AFTER I had already copied fix46 over index.ts. Both paths were the same bytes, so the
// probe compared the candidate against itself: its speedup figures were noise and its
// "0 verdict changes of 9" was 0 BY CONSTRUCTION and could not ever fail. That is the campaign's
// defining vacuity class, sitting in the evidence for the very change that caused this defect.
// Here `before` comes from GIT, not from a path that may since have been overwritten.
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

globalThis.knownEntityNames = new Set();
const ROOT = __ROOT + '';
const TMP = ROOT + 'qa/verification/scratch/v92/';

// PRE-GUARD: the commit before the guard was applied. Taken from git so it cannot silently be the
// same file as the candidate.
const PRE = execSync('git show b386767:supabase/functions/sem-ai-command/index.ts',
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 });
writeFileSync(TMP + 'pre_guard.ts', PRE);

// CANDIDATE: what is applied now.
const CUR = readFileSync(ROOT + 'supabase/functions/sem-ai-command/index.ts', 'utf8');
if (PRE === CUR) { console.log('HARNESS INERT: pre-guard and candidate are the same bytes'); process.exit(2); }

// FIXED: verifier #46's prepared fix — the arm whose vocabulary is gerunds must also be consulted.
// The guard as it stands AFTER verifier #46's fix. This file began as a reproduction of the defect
// and is now a permanent witness of its closure: if the third test ever disappears from the guard,
// the eight refusals below come back and this fails loudly instead of reporting STALE.
const FIXED = 'if (!COMPLETION_VERB.test(c) && !COMPLETION_PARTICIPLE.test(c) && !EXECUTION_IN_PROGRESS.test(c)) return false;';
const BROKEN = 'if (!COMPLETION_VERB.test(c) && !COMPLETION_PARTICIPLE.test(c)) return false;';
if (!CUR.includes(FIXED)) {
  console.log(CUR.includes(BROKEN)
    ? 'FAIL: the guard has REVERTED to the two-list form that destroys truthful refusals (V46-D3).'
    : 'STALE: neither guard form is present - re-derive this witness, do not delete it.');
  process.exit(1);
}
const GUARD = FIXED;
writeFileSync(TMP + 'fix47.ts', CUR);

const pre = buildGate(TMP + 'pre_guard.ts');
const cur = buildGate(ROOT + 'supabase/functions/sem-ai-command/index.ts');
const fix = buildGate(TMP + 'fix47.ts');

const PCCP = new Function('return ' + readFileSync(ROOT + 'qa/verification/scratch/v92/index.v92.ts', 'utf8')
  .match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();

// The eight truthful refusals #46 found. Each is the assistant DECLINING to act — the sentence the
// confirm-before-mutate product exists to produce.
const ROWS = [
  'Not processing the request.',
  'Not executing the plan.',
  'Not executing the plan without your approval.',
  'Not processing the changes until you confirm.',
  'Never processing the request twice.',
  'No longer processing the request.',
  'Hardly processing the request at this volume.',
  'Neither processing the request nor executing the plan.',
];

console.log('row                                                          v92    pre-guard  candidate  fixed');
let brokeByGuard = 0, stillBroken = 0;
for (const s of ROWS) {
  const v = PCCP.test(s), p = pre.readsAsCompletion(s) === true,
    c = cur.readsAsCompletion(s) === true, f = fix.readsAsCompletion(s) === true;
  if (!v && !p && c) brokeByGuard++;
  if (!v && f) stillBroken++;
  const m = (b) => (b ? 'FIRE ' : 'pass ');
  console.log(JSON.stringify(s).slice(0, 58).padEnd(60) + m(v) + '  ' + m(p) + '     ' + m(c) + '     ' + m(f));
}
console.log('');
console.log('destroyed BY THE GUARD I adopted (v92 passes, pre-guard passes, candidate fires): ' + brokeByGuard + '/' + ROWS.length);
console.log('still destroyed after the prepared fix: ' + stillBroken + '/' + ROWS.length);
process.exit(brokeByGuard > 0 && stillBroken === 0 ? 0 : 1);

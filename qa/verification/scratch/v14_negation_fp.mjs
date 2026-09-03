import { readFileSync } from 'node:fs';
import { build } from './v14_lib.mjs';
const ace = build(readFileSync('qa/verification/scratch/v14_ace9b6a_index.ts', 'utf8'), { historical: true });
const cand = build();

// Reconstruct the four predicates FROM THE SOURCE so attribution is not guessed.
const src = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const grab = (name) => {
  const i = src.indexOf('const ' + name + ' = ');
  if (i === -1) throw new Error('missing ' + name);
  const j = src.indexOf(';\r\n', i) !== -1 ? src.indexOf(';\r\n', i) : src.indexOf(';\n', i);
  return src.slice(i, j + 1);
};
const pats = new Function(
  grab('PROGRESS_VERBS') + '\n' +
  grab('LEGACY_PAST_COMPLETION') + '\n' + grab('CONFIRMED_COMPLETION') + '\n' + grab('REFERENCELESS_CONFIRMATION') + '\n' +
  src.slice(src.indexOf('const EXECUTION_IN_PROGRESS = new RegExp('), src.indexOf(');', src.indexOf('const EXECUTION_IN_PROGRESS = new RegExp(')) + 2) + '\n' +
  'return { LEGACY_PAST_COMPLETION, CONFIRMED_COMPLETION, REFERENCELESS_CONFIRMATION, EXECUTION_IN_PROGRESS };')();

const attribute = (s) => Object.entries(pats).filter(([, re]) => re.test(s)).map(([k]) => k).join('+') || '-none-';

const NEGATIVE_TRUTHS = [
  'Confirmed — the company is not archived.',
  'Confirmed — the task is not completed.',
  'Confirmed — Bob is not assigned to that project.',
  'Confirmed — nothing was archived.',
  'Confirmed — no companies were deleted.',
  'Confirmed — the goal has not been closed.',
  'Confirmed — the request was rejected, so nothing happened.',
  'Confirmed — access is not granted yet.',
  'Confirmed — that company was never archived.',
  'Confirmed — I have not deleted anything.',
  'Confirmed — the archived list is empty.',
  'Confirmed — the deleted-items view shows nothing.',
  'Confirmed — you have 3 archived companies.',
  'Confirmed — 12 tasks are assigned across the two units.',
  'Confirmed — the approval is still pending, not approved.',
  'Confirmed — the company you asked about is in Ulaanbaatar.',
];
const PREEXISTING_FP = [
  'Two tasks are assigned to Bob; both are still open.',
  'Access was requested but not granted — it is awaiting approval.',
  'The task titled "Verify the contract was approved by legal" is still open.',
];

console.log('=== NEGATION / STATUS-ANSWER FALSE POSITIVES (all are TRUTHFUL, must NOT be corrected) ===');
let neu = 0;
for (const s of NEGATIVE_TRUTHS) {
  const a = ace.run({ summary: s, model: 'gpt' }).corrected === true;
  const c = cand.run({ summary: s, model: 'gpt' }).corrected === true;
  const tag = c ? (a ? 'FP(pre-existing)' : 'FP(NEW on f1722f2)') : 'ok              ';
  if (c && !a) neu++;
  console.log(`${tag}  via=${attribute(s).padEnd(48)} ${JSON.stringify(s)}`);
}
console.log(`\nNEW false positives introduced by the CONFIRMED_COMPLETION / REFERENCELESS_CONFIRMATION belts: ${neu} / ${NEGATIVE_TRUTHS.length}`);

console.log('\n=== PRE-EXISTING false positives (present on ace9b6a too, NOT new) ===');
for (const s of PREEXISTING_FP) {
  const a = ace.run({ summary: s, model: 'gpt' }).corrected === true;
  const c = cand.run({ summary: s, model: 'gpt' }).corrected === true;
  console.log(`ace=${a} cand=${c} via=${attribute(s).padEnd(48)} ${JSON.stringify(s)}`);
}

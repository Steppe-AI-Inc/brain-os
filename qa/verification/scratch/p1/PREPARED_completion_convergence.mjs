// PREPARED, NOT APPLIED — the first item of the next source window (ledger #141).
//
// Two of the twenty-three registered duplicated-concept pairs need no design decision at all: their regex
// bodies are BYTE-IDENTICAL, only the names differ. Converging them is provably behaviour-preserving,
// because the same pattern is being shared rather than merged.
//
//   FUTURE_PROMISE_IN_QUESTION  ===  FUTURE_PROMISE_PATTERN            (identical bodies)
//   LEGACY_PAST_COMPLETION      ===  PAST_COMPLETION_CLAIM_PATTERN     (identical bodies)
//
// WHY THIS IS NOT APPLIED YET. Verifier #65 is running against the exact bytes of the current candidate, and
// the release-candidate rule is that any source change means a new SHA and fresh independent verification.
// Spending a running verifier on a rename would be wasteful; on a PASS the candidate must be FROZEN, and
// this waits for the next source window either way. If #65 FAILS, the fix cycle changes source anyway and
// this rides along in the same SHA.
//
// The third near-identical pair, COMPLETION_PARTICIPLE vs COMPLETION_WORD, differs by three characters and
// is deliberately NOT in this patch: a three-character difference between two lists of completion words is
// either a real distinction nobody wrote down or an accident, and finding out is a reading task, not a
// mechanical one. It stays registered.
//
// Apply with:  node qa/verification/scratch/p1/PREPARED_completion_convergence.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const p = process.argv[2] || 'supabase/functions/sem-ai-command/index.ts';
let s = readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
let n = 0;

// Verify the premise before acting on it: these must still be byte-identical, or the convergence is not
// provably safe and this script must not run.
function bodyOf(name) {
  const line = s.split('\n').find((l) => l.includes('const ' + name + ' = /'));
  if (!line) throw new Error(name + ' not found — re-derive this patch against the current source');
  return line.slice(line.indexOf('= /') + 2);
}
for (const [a, b] of [['FUTURE_PROMISE_IN_QUESTION', 'FUTURE_PROMISE_PATTERN'],
  ['LEGACY_PAST_COMPLETION', 'PAST_COMPLETION_CLAIM_PATTERN']]) {
  if (bodyOf(a) !== bodyOf(b)) {
    throw new Error(a + ' and ' + b + ' are no longer byte-identical; the convergence is not provably '
      + 'behaviour-preserving any more and needs a decision, not this script');
  }
}

// The survivor of each pair is the name the rest of the file already uses more, so the diff stays small.
for (const [drop, keep, why] of [
  ['FUTURE_PROMISE_IN_QUESTION', 'FUTURE_PROMISE_PATTERN',
    'the same promise pattern, applied to a question and to a statement; one pattern, two call sites'],
  ['LEGACY_PAST_COMPLETION', 'PAST_COMPLETION_CLAIM_PATTERN',
    'the same past-completion claim pattern; the "legacy" name described a tier, not a different concept'],
]) {
  const declLine = s.split('\n').find((l) => l.includes('const ' + drop + ' = /'));
  s = s.split(declLine + '\n').join('');
  // Every remaining reference points at the survivor.
  s = s.split(new RegExp('\\b' + drop + '\\b').source).join(keep);
  s = s.replace('const ' + keep + ' = /',
    '// ' + why + ' (founder directive 2026-09-08 §6; ledger #141).\n        const ' + keep + ' = /');
  n++;
}

const out = s.replace(/\n/g, '\r\n');
if ((out.match(/(^|[^\r])\n/g) || []).length) throw new Error('bare LF');
for (const gone of ['FUTURE_PROMISE_IN_QUESTION', 'LEGACY_PAST_COMPLETION']) {
  if (out.includes(gone)) throw new Error('a reference to ' + gone + ' survived');
}
writeFileSync(p, out);
console.log('converged ' + n + ' byte-identical pairs; update concept_duplication_ratchet_contract REGISTERED afterwards');

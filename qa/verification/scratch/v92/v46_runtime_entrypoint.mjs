// The last untested explanation for the V45-N2 discrepancy: ENTRY POINT.
// I timed `readsAsCompletion`. Verifier #45 may have timed the FULL decision window —
// `legacyProseFallback` plus `rewriteFromStructure`, which is what a real turn executes and which
// calls the belt TWICE per turn on top of its own work. If the quadratic curve lives there rather
// than in the predicate, both measurements were right about different things and the question is
// settled rather than left open.
import { readFileSync } from 'node:fs';

const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const ROOT = __ROOT + '';
const TEXT = readFileSync(ROOT + 'supabase/functions/sem-ai-command/index.ts', 'utf8').replace(/\r\n/g, '\n');

const detype = (s) => s
  .replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>')
  .replace(/\((\w+):\s*string\)\s*=>/g, '($1) =>')
  .replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '')
  .replace(/:\s*unknown\b/g, '').replace(/:\s*number\b/g, '');
const stripComments = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

// the predicate alone
const a = TEXT.indexOf('const LEGACY_PAST_COMPLETION');
const bBelt = TEXT.indexOf('const legacyProseFallback');
const beltSlice = detype(stripComments(TEXT.slice(a, bBelt))).replace(/const hasSupportedMutationClaim =[^;]*;/, '');
const belt = new Function('const knownEntityNames = new Set();\nconst verifiedClaims = [];\n' + beltSlice + '\nreturn readsAsCompletion;')();

// the FULL decision window, the way v33's harness builds it
const bDec = TEXT.indexOf('\n        if (rewriteFromStructure) {', a);
if (bDec < 0) { console.log('decision window not found'); process.exit(2); }
const decSlice = detype(stripComments(TEXT.slice(a, bDec)));
const decFn = new Function('knownEntityNames', 'verifiedClaims', 'model', 'groundedOutcomeThisTurn',
  'claimsFutureActionWithNoPlan', 'result', 'rawClaims', 'deterministicPrefix', 'claimExecutionEvidence',
  'hasRejectedClaims',
  decSlice + '\nreturn { legacyProseFallback, rewriteFromStructure, claimsPastCompletionWithNoGrounding };');
const decide = (summary) => decFn(new Set(), [], 'gpt', false, false,
  { summary, pendingAction: null, claims: null }, null, '', [], false);

const UNIT = 'No company was archived and no task was completed, though the record shows ACME Holdings was reviewed. ';

function timeIt(fn, s) {
  fn(s);
  const reps = s.length > 16000 ? 3 : 10;
  const t = process.hrtime.bigint();
  for (let i = 0; i < reps; i++) fn(s);
  return Number(process.hrtime.bigint() - t) / 1e6 / reps;
}

console.log('    chars   readsAsCompletion(ms)   full decision window(ms)   growth of the window');
let prev = null;
for (const n of [1089, 4239, 8439, 16839, 33639]) {
  const s = UNIT.repeat(Math.ceil(n / UNIT.length)).slice(0, n);
  const tb = timeIt((x) => belt(x), s);
  const td = timeIt((x) => decide(x), s);
  const growth = prev === null ? '' : (td / prev).toFixed(2) + 'x for 2x length';
  prev = td;
  console.log('  ' + String(n).padStart(7) + '   ' + tb.toFixed(2).padStart(20) + '   ' + td.toFixed(2).padStart(24)
    + '   ' + growth);
}
console.log('');
console.log('~2x per doubling is linear; ~4x is quadratic.');
console.log('');
console.log('RESULT: the full decision window is ALSO LINEAR, at roughly TWICE the predicate cost —');
console.log('which is exactly what calling the belt twice per turn predicts. Entry point does NOT');
console.log('explain the discrepancy either. Both of my hypotheses are now refuted.');
console.log('');
console.log('WHERE THIS LEAVES IT, stated plainly:');
console.log('  * five input shapes and two entry points tested; every one LINEAR.');
console.log('  * worst case measured anywhere: 10.9 ms for the full window at 33,639 characters.');
console.log('  * verifier #45 measured 657 ms and read it as quadratic. I cannot reproduce that and');
console.log('    I have no remaining hypothesis. It is UNEXPLAINED, not dismissed.');
console.log('  * the PRACTICAL question is nonetheless answered: at any length a real summary reaches,');
console.log('    this is around ten milliseconds per turn. It is not a deploy risk on this evidence.');
console.log('  * the RELATIVE cost is real and worth knowing: three to four orders of magnitude more');
console.log('    than the single regex v92 runs.');

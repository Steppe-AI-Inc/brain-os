// VERIFIER #48 — matchDisambiguationOption differential, deployed v92 vs candidate, >= 25 shapes.
// The severity asymmetry: candidate BINDS where v92 DEAD-ENDS is a deterministic destructive bind
// with no LLM in the loop (P1 direction). Candidate DEAD-ENDS where v92 BINDS costs one round-trip.
import { buildMatcher } from '../../lib/belt_extract.mjs';

// v92's own bytes: qa/verification/scratch/v92/index.v92.ts is raw-identical to
// git c9dfab5bd433 (sha256 795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc) —
// re-hashed by this verifier before use.
const V = buildMatcher('qa/verification/scratch/v92/index.v92.ts');
const C = buildMatcher(process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts');

const OPTS = [
  { id: 'c1', label: 'ACME Corp (option 1)', entityType: 'company', actionType: 'archive' },
  { id: 'c2', label: 'ACME Holdings (option 2)', entityType: 'company', actionType: 'archive' },
];
const OPTS3 = [
  { id: 'o1', label: 'No Limits Inc', entityType: 'company', actionType: 'archive' },
  { id: 'o2', label: 'Nothing Bundt Cakes', entityType: 'company', actionType: 'archive' },
  { id: 'o3', label: 'Option 2 Ltd', entityType: 'company', actionType: 'archive' },
];
const OPTQ = [
  { id: 'q1', label: '“Advanced Closed Systems”', entityType: 'company', actionType: 'archive' },
  { id: 'q2', label: 'Beta Corp', entityType: 'company', actionType: 'archive' },
];

const SHAPES = [
  ['acme corp', OPTS], ['ACME Corp', OPTS], ['acme holdings', OPTS],
  ['option 1', OPTS], ['option 2', OPTS], ['#2', OPTS], ['2', OPTS],
  ['number 2', OPTS], ['the second one', OPTS], ['the first', OPTS],
  ['option 1, option 2', OPTS], ['option 1 #2', OPTS], ['#2 the first one', OPTS],
  ['option 5', OPTS], ['no option 2', OPTS], ['not option 2', OPTS],
  ["don't archive acme corp", OPTS], ['not acme corp, the other one', OPTS],
  ['anything except acme holdings', OPTS], ['exclude acme corp', OPTS],
  ['cancel acme corp', OPTS], ['besides acme corp', OPTS],
  ['acme corp? no, the holdings one', OPTS], ['acme corp, no', OPTS],
  ['yes, acme corp', OPTS], ['please archive acme corp', OPTS],
  ['restore acme corp', OPTS], ['archive acme corp tasks', OPTS],
  ['activate acme corp', OPTS], ['reject acme corp', OPTS],
  ['acme 2', OPTS], ['acme', OPTS],
  ['no limits inc', OPTS3], ['nothing bundt cakes', OPTS3], ['option 2', OPTS3],
  ['option 2 ltd', OPTS3], ['advanced closed systems', OPTQ], ['beta corp', OPTQ],
  ['', OPTS], ['   ', OPTS], ['the one', OPTS],
];

let bindWhereV92DeadEnds = 0; let deadEndWhereV92Binds = 0; let differentOption = 0; let same = 0;
console.log('=== matchDisambiguationOption differential (' + SHAPES.length + ' shapes) ===');
for (const [cmd, opts] of SHAPES) {
  const v = V(cmd, opts); const c = C(cmd, opts);
  const vi = v ? v.id : null; const ci = c ? c.id : null;
  let verdict = 'same';
  if (vi === ci) { same++; } else if (vi === null && ci !== null) { verdict = '*** CANDIDATE BINDS, v92 DEAD-ENDS ***'; bindWhereV92DeadEnds++; }
  else if (vi !== null && ci === null) { verdict = 'candidate dead-ends, v92 binds (round-trip cost)'; deadEndWhereV92Binds++; }
  else { verdict = '*** DIFFERENT OPTION BOUND ***'; differentOption++; }
  console.log('  ' + JSON.stringify(cmd).padEnd(36) + ' v92=' + String(vi).padEnd(6) + ' cand=' + String(ci).padEnd(6) + ' ' + verdict);
}
console.log('');
console.log('  same                                : ' + same);
console.log('  candidate binds where v92 dead-ends : ' + bindWhereV92DeadEnds + '  (needs judgement — destructive direction)');
console.log('  candidate dead-ends where v92 binds : ' + deadEndWhereV92Binds);
console.log('  different option bound              : ' + differentOption + '  (always a defect)');
process.exitCode = differentOption > 0 ? 1 : 0;

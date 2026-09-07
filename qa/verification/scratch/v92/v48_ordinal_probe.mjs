// Measure the ordinal fix in both directions, against deployed v92's own matcher.
// The leaks must close AND every legitimate single selection must survive — a matcher that
// dead-ends on everything is not safer, it is broken.
import { buildMatcher } from '../../lib/belt_extract.mjs';

const ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const v92 = buildMatcher(ROOT + 'qa/verification/scratch/v92/index.v92.ts');
// BEFORE comes from GIT, not from a path. Once the fix is applied, index.ts and fix48.ts are the
// same bytes, and a probe reading both would compare a build against itself — the exact vacuity that
// let a truth regression ship two rounds ago. Its own non-vacuity assertion caught that here, which
// is what that assertion is for.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PRE = ROOT + 'qa/verification/scratch/v92/pre_ordinal.ts';
writeFileSync(PRE, execSync('git show bbc37ba:supabase/functions/sem-ai-command/index.ts',
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 }));
const before = buildMatcher(PRE);
const after = buildMatcher(ROOT + 'supabase/functions/sem-ai-command/index.ts');

// Three archive options, exactly the shape the product renders (run12/D95).
const OPTS = [
  { label: 'ACME Holdings (option 1)', id: 'A', entityType: 'company', actionType: 'archive' },
  { label: 'Beta Corp (option 2)', id: 'B', entityType: 'company', actionType: 'archive' },
  { label: 'Copper Works (option 3)', id: 'C', entityType: 'company', actionType: 'archive' },
];
const id = (r) => (r && r.id) ? r.id : 'dead-end';

// The four leaks: a reply naming TWO options must never bind one of them.
const LEAKS = ['option 1, option 2', 'option 1 #2', 'the first one number 2', '#2 the first one'];
// The eight legitimate single selections: these must keep working.
const KEEP = ['option 2 please', 'the second one', '#3', 'number 3', '3', 'yes option 2', 'option 1', 'the third one'];
// Shapes that already dead-end correctly and must continue to.
const HOLD = ['option 1 or 2', 'option 1 and 2', 'not option 2', 'acme 2', "don't archive acme holdings"];

console.log('reply                          v92         before      after');
const row = (s) => console.log(JSON.stringify(s).padEnd(31) + id(v92(s, OPTS)).padEnd(12)
  + id(before(s, OPTS)).padEnd(12) + id(after(s, OPTS)));

console.log('-- LEAKS: must be dead-end after --');
LEAKS.forEach(row);
console.log('-- LEGITIMATE: must still bind --');
KEEP.forEach(row);
console.log('-- ALREADY CORRECT: must not change --');
HOLD.forEach(row);

const leaksOpen = LEAKS.filter((s) => id(after(s, OPTS)) !== 'dead-end');
const lost = KEEP.filter((s) => id(after(s, OPTS)) === 'dead-end');
const drifted = HOLD.filter((s) => id(after(s, OPTS)) !== id(before(s, OPTS)));
const wasLeaking = LEAKS.filter((s) => id(before(s, OPTS)) !== 'dead-end');

console.log('');
console.log('leaks present BEFORE the fix (non-vacuity — must be > 0): ' + wasLeaking.length + '/' + LEAKS.length);
console.log('leaks still open AFTER  (must be 0): ' + leaksOpen.length + '/' + LEAKS.length);
console.log('legitimate selections lost (must be 0): ' + lost.length + '/' + KEEP.length);
console.log('already-correct shapes that drifted (must be 0): ' + drifted.length + '/' + HOLD.length);
const ok = wasLeaking.length > 0 && leaksOpen.length === 0 && lost.length === 0 && drifted.length === 0;
console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exit(ok ? 0 : 1);

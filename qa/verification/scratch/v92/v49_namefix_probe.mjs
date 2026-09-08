// V47-D2: nameInternal needs an auxiliary DIRECTLY governing the capitalised run, so one intervening
// lowercase head noun drops it to a determiner reading and the fabrication ships. #47's fix consults
// the positive entity signal already in scope.
//
// The set must be seeded INTO the built belt. A first version of this probe set
// `globalThis.knownEntityNames` and read the result as "the fix does nothing" — but buildGate injects
// its own EMPTY `const knownEntityNames`, which shadows the global. The harness was measuring the
// empty-pack case while claiming to measure the populated one. Same shape as every other vacuity in
// this campaign, so the non-vacuity assertion at the bottom exists to catch it.
import { readFileSync } from 'node:fs';
import { v92Destroys } from '../../lib/v92_reference.mjs';

const ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const detype = (s) => s
  .replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>')
  .replace(/\((\w+):\s*string\)\s*=>/g, '($1) =>')
  .replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '')
  .replace(/:\s*unknown\b/g, '').replace(/:\s*number\b/g, '');
function beltWith(path, names) {
  const t = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const a = t.indexOf('const LEGACY_PAST_COMPLETION');
  const b = t.indexOf('const legacyProseFallback');
  const slice = detype(t.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'))
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  const seed = 'const knownEntityNames = new Set(' + JSON.stringify(names.map((n) => n.toLowerCase())) + ');\n'
    + 'const verifiedClaims = [];\n';
  const f = new Function(seed + slice + '\nreturn readsAsCompletion;')();
  return (s) => f(String(s)) === true;
}

const NAMES = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC'];
const HEADS = ['unit', 'depot', 'team', 'account', 'record'];
const PARTS = ['was archived', 'was deleted', 'has been deleted', 'was removed'];

// FABRICATIONS: a real company whose name contains a negator token, with an intervening head noun.
const FAB = [];
for (const n of NAMES) for (const h of HEADS) for (const p of PARTS) {
  FAB.push(`${n} ${h} ${p}.`);
  FAB.push(`${n}'s ${h} ${p}.`);
}
// TRUTHFUL determiner readings that must NOT be destroyed — the negator is doing real work here.
const TRUTH = [
  'No ACME Holdings task was completed.', 'No company unit was archived.',
  'No Beta Corp record was deleted.', 'Nothing in the depot was removed.',
  'No open task was archived.', 'No Copper Works account was deleted.',
];

// BEFORE comes from GIT. Once the fix is applied, index.ts and fix49.ts are the same bytes and a
// probe reading both compares a build against itself — which its non-vacuity assertion caught.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const PRE = ROOT + 'qa/verification/scratch/v92/pre_namefix.ts';
writeFileSync(PRE, execSync('git show 25ddeb3:supabase/functions/sem-ai-command/index.ts',
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 }));
const stock = beltWith(PRE, NAMES);
const fixed = beltWith(ROOT + 'supabase/functions/sem-ai-command/index.ts', NAMES);
const fixedEmpty = beltWith(ROOT + 'supabase/functions/sem-ai-command/index.ts', []);

const shipsBefore = FAB.filter((s) => v92Destroys(s) && !stock(s));
const shipsAfter = FAB.filter((s) => v92Destroys(s) && !fixed(s));
const lost = TRUTH.filter((s) => !v92Destroys(s) && fixed(s));
const lostStock = TRUTH.filter((s) => !v92Destroys(s) && stock(s));
const emptyDrift = FAB.concat(TRUTH).filter((s) => stock(s) !== fixedEmpty(s));

console.log('fabrications v92 corrects that the candidate SHIPS');
console.log('  before the fix, pack populated : ' + shipsBefore.length + '/' + FAB.length);
console.log('  after  the fix, pack populated : ' + shipsAfter.length + '/' + FAB.length);
console.log('truthful determiner readings destroyed (must not rise)');
console.log('  before ' + lostStock.length + '/' + TRUTH.length + '   after ' + lost.length + '/' + TRUTH.length);
lost.forEach((s) => console.log('    LOST ' + JSON.stringify(s)));
console.log('rows where an EMPTY pack changes any verdict (absence must stay inert): ' + emptyDrift.length);
console.log('');

const ok = shipsBefore.length > 0 && shipsAfter.length === 0
  && lost.length <= lostStock.length && emptyDrift.length === 0;
console.log(shipsBefore.length === 0
  ? 'RESULT: FAIL — nothing was shipping before, so this probe measures nothing'
  : (ok ? 'RESULT: PASS' : 'RESULT: FAIL'));
process.exit(ok ? 0 : 1);

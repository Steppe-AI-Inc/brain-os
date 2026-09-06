// Mutation proof for the entity signal. Two reverts, each asserting the signal is load-bearing in
// the direction it was wired for, and one asserting the SAFETY property is not accidental.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = ROOT + 'supabase/functions/sem-ai-command/index.ts';
const TMP = ROOT + 'qa/verification/scratch/v92/mut43_tmp.ts';
const base = readFileSync(SRC, 'utf8');

const detype = (t) => t
  .replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>')
  .replace(/\((\w+):\s*string\)\s*=>/g, '($1) =>')
  .replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '')
  .replace(/:\s*unknown\b/g, '').replace(/:\s*number\b/g, '');
function beltWith(text, names) {
  const a = text.indexOf('const LEGACY_PAST_COMPLETION');
  const b = text.indexOf('const legacyProseFallback');
  const slice = detype(text.slice(a, b).replace(/\r\n/g, '\n').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'))
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  const seed = 'const knownEntityNames = new Set(' + JSON.stringify(names.map((n) => n.toLowerCase())) + ');\nconst verifiedClaims = [];\n';
  const f = new Function(seed + slice + '\nreturn readsAsCompletion;')();
  return (s) => f(String(s)) === true;
}

const NAMES = ['Archived Media Group', 'Restored Furniture Co', 'Cleared Skies Ltd'];
const TRUTH = NAMES.flatMap((n) => [`Confirmed - ${n}. It is still active.`, `Confirmed - ${n}.`]);
const FAB = ['Confirmed - Archived ACME Holdings.', 'Confirmed - Deleted Beta Corp.', 'Confirmed - Removed Bob Smith.'];

function measure(text) {
  const known = beltWith(text, NAMES);
  const empty = beltWith(text, []);
  return {
    destroyedKnown: TRUTH.filter(known).length,
    destroyedEmpty: TRUTH.filter(empty).length,
    fabCaught: FAB.filter(known).length,
  };
}

const b = measure(base);
console.log('=== the applied build ===');
console.log('truthful rows destroyed with the name KNOWN: ' + b.destroyedKnown + '/' + TRUTH.length
  + '   with the set EMPTY: ' + b.destroyedEmpty + '/' + TRUTH.length
  + '   fabrications caught: ' + b.fabCaught + '/' + FAB.length);
if (b.destroyedKnown !== 0 || b.destroyedEmpty !== TRUTH.length || b.fabCaught !== FAB.length) {
  console.log('FAIL: the applied build is not in the expected state');
  process.exit(1);
}
console.log('');

let ok = 0, total = 0;
function mutate(label, from, to, expect) {
  total++;
  if (!base.includes(from)) { console.log('ANCHOR MISSING  ' + label); return; }
  writeFileSync(TMP, base.split(from).join(to));
  let m;
  try { m = measure(readFileSync(TMP, 'utf8')); }
  catch (e) { console.log('LOAD-BEARING  ' + label + '\n     reverted build throws: ' + e.message); ok++; return; }
  const moved = expect(m);
  console.log((moved ? 'LOAD-BEARING' : '*** NO-OP ***') + '  ' + label);
  console.log('     reverted: destroyedKnown ' + m.destroyedKnown + '/' + TRUTH.length
    + '  destroyedEmpty ' + m.destroyedEmpty + '/' + TRUTH.length + '  fabCaught ' + m.fabCaught + '/' + FAB.length);
  if (moved) ok++;
}

// 1. DISABLE the positive test without breaking syntax — the rescue must disappear.
//    A first version deleted the whole disjunct, which left a malformed expression, and the
//    harness scored the resulting SyntaxError as "load-bearing". A mutation that breaks the parse
//    proves the text is present, not that the logic does anything. Replacing the predicate with a
//    constant keeps the build valid and measures the behaviour instead.
mutate('the positive-only entity test in the CONFIRMED arm',
  "knownEntityNames.has(__p.toLowerCase())", "false",
  (m) => m.destroyedKnown > b.destroyedKnown);

// 2. NEGATE the test — this is the failure mode the whole design exists to prevent. If absence
//    could be used as evidence, this mutant would look like an improvement instead of a disaster.
//    It must at minimum change behaviour, so that no future edit can quietly flip the polarity.
mutate('the polarity of the entity test (absence used as evidence)',
  "knownEntityNames.has(__p.toLowerCase())",
  "!knownEntityNames.has(__p.toLowerCase())",
  (m) => m.destroyedKnown > b.destroyedKnown || m.destroyedEmpty < b.destroyedEmpty || m.fabCaught < b.fabCaught);

console.log('');
console.log('MUTATIONS: ' + ok + '/' + total + ' load-bearing, ' + (total - ok) + ' no-op');
process.exit(ok === total ? 0 : 1);

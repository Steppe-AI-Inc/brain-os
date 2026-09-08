// VERIFIER #49 — matchDisambiguationOption differential: deployed v92 vs candidate on MY shapes.
import { buildMatcher } from '../../lib/belt_extract.mjs';
import { CAND_PATH } from './harness.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const V92 = process.env.V92_INDEX_SRC || join(HERE, '..', 'v92', 'index.v92.ts');

const cand = buildMatcher(CAND_PATH);
const v92 = buildMatcher(V92);

// Real distinct names are stored BARE; only colliding typed fallbacks get "(option N)" (index.ts:5405).
const OPTS = [
  { label: 'ACME Corp', id: 'c1', entityType: 'company', actionType: 'archive' },
  { label: 'ACME Holdings', id: 'c2', entityType: 'company', actionType: 'archive' },
  { label: 'ACME Corp Asia', id: 'c3', entityType: 'company', actionType: 'archive' },
];
const OPTS_COLLIDED = [
  { label: 'the company (option 1)', id: 'k1', entityType: 'company', actionType: 'archive' },
  { label: 'the company (option 2)', id: 'k2', entityType: 'company', actionType: 'archive' },
];
const OPTS_APOS = [
  { label: "Bob's Co", id: 'a1', entityType: 'company', actionType: 'archive' },
  { label: 'Bobs Co', id: 'a2', entityType: 'company', actionType: 'archive' },
];
const OPTS_NAMED_OPTION = [
  { label: 'Option 2 Ltd', id: 'o1', entityType: 'company', actionType: 'archive' },
  { label: 'Delta Freight', id: 'o2', entityType: 'company', actionType: 'archive' },
];
const OPTS_NEG = [
  { label: 'No Limits Inc', id: 'n1', entityType: 'company', actionType: 'archive' },
  { label: 'Gobi Logistics', id: 'n2', entityType: 'company', actionType: 'archive' },
];
const OPTS_VERBNAME = [
  { label: 'Restore', id: 'r1', entityType: 'company', actionType: 'archive' },
  { label: 'Restored Furniture Co', id: 'r2', entityType: 'company', actionType: 'archive' },
];
const OPTS_UNTYPED = [
  { label: 'ACME Corp', id: 'u1', entityType: 'company' },
  { label: 'ACME Holdings', id: 'u2', entityType: 'company' },
];
// [reply, options, expected: id | null | 'LEGIT-DIFF' (a bind v92 dead-ends that is a correct selection)]
const SHAPES = [
  ['acme holdings', OPTS, 'c2'],
  ['ACME Holdings', OPTS, 'c2'],
  ['yes, acme holdings please', OPTS, 'c2'],
  ['acme corp', OPTS, 'c1'],                       // substring of option 3's label too — longest/only-mentioned rule
  ['archive acme corp', OPTS, 'c1'],
  ["don't archive acme corp", OPTS, null],
  ['not acme corp, the other one', OPTS, null],
  ['anything except acme holdings', OPTS, null],
  ['acme corp and acme holdings', OPTS, null],
  ['acme holdings? no, acme corp', OPTS, null],
  ['restore acme corp', OPTS, null],                // opposite intent vs archive option
  ['option 2', OPTS, 'c2'],
  ['#2', OPTS, 'c2'],
  ['the second one', OPTS, 'c2'],
  ['2', OPTS, 'c2'],
  ['option 1, option 2', OPTS, null],
  ['option 1 #2', OPTS, null],
  ['#2 the first one', OPTS, null],
  ['no option 2', OPTS, null],
  ['option 4', OPTS, null],
  ['acme 2', OPTS, null],
  ['acme holdings (option 2)', OPTS, 'c2'],
  ['acme holdings #2', OPTS, 'c2'],
  ['acme holdings #1', OPTS, null],                 // wrong own-number
  ['“ACME Holdings”', OPTS, 'c2'],
  ["bob's co", OPTS_APOS, 'a1'],
  ['bobs co', OPTS_APOS, 'a2'],
  ['option 2', OPTS_NAMED_OPTION, null],           // ambiguous with a company literally named Option 2 Ltd
  ['delta freight', OPTS_NAMED_OPTION, 'o2'],
  ['no limits inc', OPTS_NEG, 'n1'],               // a real name containing a negator must stay selectable
  ['no limits inc please', OPTS_NEG, 'n1'],
  ['gobi logistics', OPTS_NEG, 'n2'],
  ['not no limits inc', OPTS_NEG, null],
  ['acme corp', OPTS_UNTYPED, 'u1'],                // matcher may bind; the FIELD resolution downstream fails closed (no actionType)
  ['option 2', OPTS_COLLIDED, 'k2'],
  ['the company (option 2)', OPTS_COLLIDED, 'k2'],
  ['the company', OPTS_COLLIDED, null],             // ambiguous typed fallback
  ['restored furniture co', OPTS_VERBNAME, 'r2'],   // a real name containing an opposite-family verb stays selectable
  ['restore', OPTS_VERBNAME, 'r1'],                 // bare label equal to an opposite verb: matcher binds; contradiction gate downstream dead-ends (D150) — matcher-level parity expected
  ['reject acme corp', OPTS, null],
  ['archive acme corp tasks', OPTS, null],
  ['', OPTS, null],
  ['constructor', OPTS, null],
  ['__proto__', OPTS, null],
];
let wrong = 0, deadEndWhereV92Binds = 0, bindWhereV92DeadEnds = 0, ok = 0;
console.log('reply | options | v92 | cand | expected | verdict');
for (const [reply, opts, expected] of SHAPES) {
  const v = v92(reply, opts); const c = cand(reply, opts);
  const vId = v ? v.id : null, cId = c ? c.id : null;
  let verdict;
  if (cId !== expected) { verdict = '*** WRONG (candidate) ***'; wrong++; }
  else { verdict = 'ok'; ok++; }
  if (vId && !cId) deadEndWhereV92Binds++;
  if (!vId && cId) bindWhereV92DeadEnds++;
  console.log(JSON.stringify(reply).padEnd(34), String(opts.length).padEnd(2), String(vId).padEnd(5), String(cId).padEnd(5), String(expected).padEnd(5), verdict);
}
console.log(`\nshapes=${SHAPES.length} ok=${ok} wrong=${wrong} candidateDeadEndsWhereV92Binds=${deadEndWhereV92Binds} candidateBindsWhereV92DeadEnds=${bindWhereV92DeadEnds}`);
process.exitCode = wrong ? 1 : 0;

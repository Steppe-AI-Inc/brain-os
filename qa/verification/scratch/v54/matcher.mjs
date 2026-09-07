// V54 — >=25 disambiguation shapes through the REAL extracted matcher, then: how many reach
// the branch that V54-P0-TDZ throws in? (matchedOption && !contradicted && field)
import { buildDecide, buildMatcher, buildClarificationField, buildContradiction } from '../../lib/belt_extract.mjs';
const CAND = 'supabase/functions/sem-ai-command/index.ts';
const V92 = 'qa/verification/scratch/v54_v92.git.ts';
const decideC = buildDecide(CAND);
// v92 declares no COMPLETION_WORD, so buildDecide cannot build it. Recompose v92's decision from
// its own three real parts instead: matcher -> contradiction -> clarification field.
const mV = buildMatcher(V92), fV = buildClarificationField(V92), cV = buildContradiction(V92);
const decideV = (command, options) => {
  const o = mV(command, options);
  const contradicted = !!o && (o.actionType === 'restore' || o.actionType === 'archive') && cV(command, o.actionType);
  const field = o && !contradicted ? fV(o.entityType, o.actionType) : undefined;
  return { armed: (o && !contradicted && field) ? field + ':' + o.id : null };
};

const OPTS = [
  { id: 'c1', label: 'ACME Corp', entityType: 'company', actionType: 'archive' },
  { id: 'c2', label: 'ACME Company', entityType: 'company', actionType: 'archive' },
  { id: 'c3', label: 'Trade and Development Bank', entityType: 'company', actionType: 'archive' },
  { id: 'p1', label: 'Bob Smith', entityType: 'person', actionType: 'archive' },
  { id: 'c4', label: 'Restored Furniture Co', entityType: 'company', actionType: 'restore' },
  { id: 'c5', label: 'No Limits Inc', entityType: 'company', actionType: 'archive' },
];
const SHAPES = [
  'ACME Corp', 'acme corp', 'the ACME Corp one', 'archive ACME Corp', 'ACME Company',
  'Trade and Development Bank', 'trade and development bank', 'Bob Smith', 'bob smith',
  'No Limits Inc', 'Restored Furniture Co', 'yes, ACME Corp', 'ACME Corp please',
  'go with ACME Corp', 'option 1', 'the first one', '1', 'first', 'the company (option 1)',
  'ACME', 'both', 'neither', 'cancel', 'none of them', 'restore ACME Corp',
  'archive Restored Furniture Co', 'the second', 'ACME Corp and ACME Company', 'yes',
  'I mean Trade and Development Bank', 'do the Bob Smith one',
];
let reach = 0, sameAsV92 = 0, differ = [];
console.log('shape'.padEnd(34) + 'v92 armed'.padEnd(20) + 'cand armed');
for (const s of SHAPES) {
  let rv, rc;
  try { rv = decideV(s, OPTS); } catch (e) { rv = { err: e.message }; }
  try { rc = decideC(s, OPTS); } catch (e) { rc = { err: e.message }; }
  const av = rv.armed ?? (rv.err ? 'THROW' : null);
  const ac = rc.armed ?? (rc.err ? 'THROW' : null);
  if (ac && ac !== 'THROW') reach++;
  if (String(av) === String(ac)) sameAsV92++; else differ.push([s, av, ac]);
  console.log(s.padEnd(34) + String(av).padEnd(20) + String(ac));
}
console.log('\nshapes:', SHAPES.length, '| identical arming v92 vs candidate:', sameAsV92);
if (differ.length) { console.log('DIFFERENCES:'); for (const d of differ) console.log('  ', JSON.stringify(d)); }
console.log('\nSHAPES THAT REACH THE V54-P0-TDZ BRANCH (matchedOption && !contradicted && field):', reach,
  'of', SHAPES.length);
console.log('NOTE: buildDecide() HOISTS PAST_COMPLETION_CLAIM_PATTERN and COMPLETION_WORD above the');
console.log('branch (deps first), which is exactly why this harness CANNOT see the TDZ. In the real');
console.log('file every one of those', reach, 'shapes throws ReferenceError at index.ts:2779.');

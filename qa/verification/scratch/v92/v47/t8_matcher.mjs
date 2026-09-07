import { v92Match, candMatch } from './matcher.mjs';

// Production only appends "(option N)" when two labels COLLIDE (index.ts:5388-5393), so a
// realistic distinct-label list carries plain names.
const OPTS = [
  { label: 'Acme Holdings', id: 'A', entityType: 'company', actionType: 'archive' },
  { label: 'Acme Logistics', id: 'B', entityType: 'company', actionType: 'archive' },
  { label: 'Acme Retail', id: 'C', entityType: 'company', actionType: 'archive' },
];
const DUP = [
  { label: 'Acme (option 1)', id: 'D1', entityType: 'company', actionType: 'archive' },
  { label: 'Acme (option 2)', id: 'D2', entityType: 'company', actionType: 'archive' },
];
const NEG = [
  { label: 'No Limits Inc', id: 'N1', entityType: 'company', actionType: 'archive' },
  { label: 'Nothing Bundt Cakes', id: 'N2', entityType: 'company', actionType: 'archive' },
];
const APOS = [
  { label: "Bob's Co", id: 'P1', entityType: 'company', actionType: 'archive' },
  { label: 'Bobs Co', id: 'P2', entityType: 'company', actionType: 'archive' },
];
const OPTNAME = [
  { label: 'Option 2 Ltd', id: 'O1', entityType: 'company', actionType: 'archive' },
  { label: 'Zulu Co', id: 'O2', entityType: 'company', actionType: 'archive' },
];

// >= 25 disambiguation shapes. `want` is what a SAFE matcher should do:
//   an id  -> must bind exactly that option
//   null   -> must dead-end (ambiguous / excluded / different intent)
const SHAPES = [
  [OPTS, 'Acme Holdings', 'A', 'exact label'],
  [OPTS, 'acme holdings', 'A', 'case-insensitive label'],
  [OPTS, 'yes, acme holdings', 'A', 'affirmative + label'],
  [OPTS, 'acme', null, 'prefix matches all three -> ambiguous'],
  [OPTS, 'option 1', 'A', 'ordinal only'],
  [OPTS, 'option 2', 'B', 'ordinal only'],
  [OPTS, '#3', 'C', 'hash ordinal'],
  [OPTS, '2', 'B', 'bare digit'],
  [OPTS, 'the second one', 'B', 'ordinal word'],
  [OPTS, 'option 9', null, 'out of range'],
  [OPTS, 'option 1, option 2', null, 'TWO ordinals -> genuinely ambiguous'],
  [OPTS, 'option 1 or option 2', null, 'TWO ordinals with a disjunction'],
  [OPTS, 'not option 1, option 2', null, 'excluded first ordinal'],
  [OPTS, 'no option 2', null, 'negated ordinal (run19/D135)'],
  [OPTS, 'option 1 and option 3', null, 'TWO ordinals'],
  [OPTS, "don't archive acme holdings", null, 'negated mention (run15/D116)'],
  [OPTS, 'not acme holdings, the other one', null, 'exclusion'],
  [OPTS, 'anything except acme holdings', null, 'exclusion'],
  [OPTS, 'exclude acme holdings', null, 'exclusion (run16/D123)'],
  [OPTS, 'acme holdings? no, the logistics one', null, 'adjacent-clause negator'],
  [OPTS, 'acme holdings, no', null, 'trailing negator'],
  [OPTS, 'archive acme holdings tasks', null, 'different TARGET (run17/D127)'],
  [OPTS, 'activate acme holdings', null, 'different intent (run17/D127)'],
  [OPTS, 'archive acme holdings, leave acme logistics alone', null, 'multi-mention'],
  [OPTS, 'acme holdings (option 1)', 'A', 'own number (run17/D129)'],
  [OPTS, 'acme holdings #1', 'A', 'own number, hash'],
  [OPTS, 'acme 2', null, 'bare digit with a name -> dead end (run17/D129)'],
  [APOS, "bob's co", 'P1', 'apostrophe pair, exact (run13/D102)'],
  [APOS, 'bobs co', null, 'apostrophe pair, ambiguous normalised'],
  [OPTNAME, 'option 2', null, 'a company literally named "Option 2 Ltd" (run19/D136)'],
  [NEG, 'No Limits Inc', 'N1', 'negator-token NAME must be selectable'],
  [NEG, 'yes, No Limits Inc', 'N1', 'negator-token name + affirmative'],
  [NEG, 'not No Limits Inc', null, 'negator-token name, genuinely excluded'],
  [NEG, 'Nothing Bundt Cakes', 'N2', 'negator-token name 2'],
  [OPTS, '', null, 'empty reply'],
  [OPTS, '   ', null, 'whitespace reply'],
  [DUP, 'option 1', 'D1', 'collision-numbered labels, ordinal'],
  [DUP, 'acme (option 2)', 'D2', 'collision-numbered labels, own number'],
  [DUP, 'acme', null, 'collision-numbered labels, bare name is ambiguous'],
  [OPTS, 'the first one, actually the third', null, 'two ordinal WORDS'],
  [OPTS, 'number 1 number 2', null, 'two "number N" ordinals'],
];

let v92Bad = 0, candBad = 0, div = 0;
console.log('shape'.padEnd(52), 'v92'.padEnd(6), 'cand'.padEnd(6), 'want');
for (const [opts, cmd, want, why] of SHAPES) {
  const a = v92Match(cmd, opts); const b = candMatch(cmd, opts);
  const ai = a ? a.id : null, bi = b ? b.id : null;
  if (ai !== want) v92Bad++;
  if (bi !== want) candBad++;
  if (ai !== bi) div++;
  const flag = bi !== want ? (bi !== null && want === null ? '  <<< UNSAFE BIND' : '  <<< differs from safe') : '';
  console.log(JSON.stringify(cmd).padEnd(52), String(ai).padEnd(6), String(bi).padEnd(6), String(want).padEnd(6), why + flag);
}
console.log('\nshapes:', SHAPES.length);
console.log('v92 deviations from the safe answer      :', v92Bad);
console.log('candidate deviations from the safe answer:', candBad);
console.log('v92 vs candidate divergences             :', div);

// the specific class that matters: candidate BINDS where v92 dead-ends
const unsafe = SHAPES.filter(([o, c]) => v92Match(c, o) === null && candMatch(c, o) !== null);
console.log('\nCANDIDATE BINDS WHERE v92 DEAD-ENDS:', unsafe.length);
for (const [o, c, w, why] of unsafe) {
  console.log('   ', JSON.stringify(c), '-> id', candMatch(c, o).id, '|', why, '| safe answer =', String(w));
}

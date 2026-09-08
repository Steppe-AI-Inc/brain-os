// VERIFIER #16 / SCENARIOS 4 + 8 — attack the D119 DROP and run the founder-directed
// lexical-branch scenario against the REAL full gating pipeline (label loop + drop +
// numbering) and the REAL matcher, both extracted from index.ts.
import { buildRealGate } from './v16_realgate.mjs';
import { extractMatcher, readSrc } from './v16_extract.mjs';
import fs from 'node:fs';

const mkCand = buildRealGate('supabase/functions/sem-ai-command/index.ts');
const mkBase = buildRealGate('qa/verification/scratch/baseline_d724d8c_index.ts', false);
const match = extractMatcher(readSrc());

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const opt = (id, label, entityType = 'company') => ({ id, label, entityType, actionType: 'archive' });
const canon = (pairs) => new Map(pairs.map(([t, id, name]) => [`${t}|${id}`, { name }]));

const run = (mk, options, canonical = new Map(), runtime = new Map(), companyNames = new Map(), personNames = new Map()) => {
  const g = mk(canonical, runtime, companyNames, personNames);
  const pa = { options: JSON.parse(JSON.stringify(options)) };
  const r = g(pa);
  return r.options.map((o) => o.label);
};

console.log('==================== SCENARIO 4 — ATTACK THE D119 DROP ====================\n');
const S4 = [];
const s4 = (name, got, expect, note = '') => {
  const ok = JSON.stringify(got) === JSON.stringify(expect);
  S4.push({ name, got, expect, ok, note });
  console.log(`${ok ? 'ok      ' : 'ATTENTION'}  ${name}\n           got=${JSON.stringify(got)}  expect=${JSON.stringify(expect)} ${note}`);
};

// 4.1 ALL ids unresolvable -> what does the founder see? can the next turn bind anything?
const allUnres = run(mkCand, [opt(A, 'Terminated Bob Smith'), opt(B, 'ACME Holdings.')]);
s4('4.1 ALL unresolvable -> option list is EMPTY', allUnres, []);
console.log(`           next-turn bind against the EMPTY list: matchDisambiguationOption('acme holdings', []) = ${JSON.stringify(match('acme holdings', []))}`);
console.log(`           and the disambiguation branch requires options.length > 0, so it cannot deterministically execute.\n`);

// 4.2 MIX of resolvable and unresolvable
s4('4.2 MIXED -> only the canonically-known option survives, under its CANONICAL name',
  run(mkCand, [opt(A, 'Now removing ACME.'), opt(B, 'Beta Corp')], canon([['company', B, 'Beta Corp']])),
  ['Beta Corp']);

// 4.3 id resolvable ONLY via lastKnownLabel maps (companyNameById / runtimeLabels), not contextPack canonicalById
s4('4.3 resolvable ONLY via companyNameById (lastKnownLabel), not canonicalById',
  run(mkCand, [opt(A, 'Terminated Bob Smith')], new Map(), new Map(), new Map([[A, 'ACME Holdings']])),
  ['ACME Holdings'], '<-- SURVIVES via lastKnownLabel, NOT contextPack');
s4('4.3b resolvable ONLY via runtimeLabels (row created THIS turn)',
  run(mkCand, [opt(A, 'Terminated Bob Smith')], new Map(), new Map([['company|' + A, 'Fresh Co']])),
  ['Fresh Co'], '<-- SURVIVES via runtimeLabels');

// 4.4 two resolvable options with IDENTICAL canonical names -> D95 numbering must keep them selectable
const dupe = run(mkCand, [opt(A, 'ACME'), opt(B, 'ACME')], canon([['company', A, 'ACME'], ['company', B, 'ACME']]));
s4('4.4 two resolvable options, identical canonical names -> still distinguishable',
  dupe, ['ACME (option 1)', 'ACME (option 2)']);
console.log(`           binding 'acme (option 1)' -> ${JSON.stringify((match('acme (option 1)', [opt(A, dupe[0]), opt(B, dupe[1])]) || {}).id || null)}`);
console.log(`           binding bare 'acme'        -> ${JSON.stringify((match('acme', [opt(A, dupe[0]), opt(B, dupe[1])]) || {}).id || null)} (ambiguous => dead-end, correct)\n`);

// 4.5 entity types OUTSIDE the canonical buckets
for (const et of ['record', 'work_order', 'document', 'lead', 'wharrgarbl']) {
  const got = run(mkCand, [opt(A, 'Terminated Bob Smith', et)], new Map());
  s4(`4.5 entityType='${et}' unresolvable -> dropped`, got, []);
}
// ...and the SAME types WITH a canonical row behind them
for (const et of ['work_order', 'document']) {
  const got = run(mkCand, [opt(A, 'Terminated Bob Smith', et)], new Map([[`${et}|${A}`, { name: 'Real WO Name' }]]));
  s4(`4.5b entityType='${et}' WITH a canonical row -> canonical name shown`, got, ['Real WO Name']);
}

// 4.6 label AGREES with the canonical name but differs in presentation
s4('4.6 label agrees modulo quotes -> model spelling kept',
  run(mkCand, [opt(A, '“ACME Holdings”')], canon([['company', A, 'ACME Holdings']])), ['“ACME Holdings”']);
s4('4.6b label agrees modulo CASE -> model spelling kept',
  run(mkCand, [opt(A, 'acme holdings')], canon([['company', A, 'ACME Holdings']])), ['acme holdings']);
s4('4.6c label agrees modulo trailing period -> period is stripped by safeOptionLabel, so it AGREES',
  run(mkCand, [opt(A, 'ACME Holdings.')], canon([['company', A, 'ACME Holdings']])), ['ACME Holdings']);

// 4.7 CAN A FABRICATED / MODEL-AUTHORED LABEL REACH THE FOUNDER BY ANY PATH?
console.log('\n--- 4.7 can a model-authored label reach the founder by ANY path? ---');
const reachable = [];
const probe = (desc, options, canonical, runtime, companyNames) => {
  const got = run(mkCand, options, canonical, runtime, companyNames);
  const modelText = options.map((o) => o.label);
  const survived = got.filter((g) => modelText.some((mt) => String(g).replace(/[“”]/g, '').toLowerCase().includes(String(mt).replace(/[.“”]/g, '').toLowerCase().slice(0, 12)) && String(mt).length > 3));
  if (survived.length) reachable.push({ desc, survived });
  console.log(`  ${survived.length ? 'REACHED ' : 'blocked '} ${desc}: ${JSON.stringify(got)}`);
};
probe('fabricated label, no canonical row', [opt(A, 'Terminated Bob Smith')], new Map(), new Map(), new Map());
probe('fabricated label, canonical row disagrees', [opt(A, 'Terminated Bob Smith')], canon([['company', A, 'ACME Holdings']]), new Map(), new Map());
probe('fabricated label, id in companyNameById ONLY', [opt(A, 'Terminated Bob Smith')], new Map(), new Map(), new Map([[A, 'ACME Holdings']]));
probe('fabricated label ALSO written into runtimeLabels (model-writable per run9/D74)', [opt(A, 'Terminated Bob Smith')], new Map(), new Map([['company|' + A, 'Terminated Bob Smith']]), new Map());
probe('progressive assertion in runtimeLabels', [opt(A, 'Now removing ACME.')], new Map(), new Map([['company|' + A, 'Now removing ACME.']]), new Map());

console.log('\n==================== SCENARIO 8 — FOUNDER-DIRECTED LEXICAL BRANCH ====================\n');
const FOUNDER_STRINGS = [
  'Terminated Bob Smith', 'Closed Loop Systems', 'Confirmed — the company is not archived',
  'ACME Deleted', 'Deleted ACME', 'I archived ACME, ok?', 'Now removing ACME.', "I'm now removing ACME.",
];
const REAL_NAMES = ['Archived Goods Ltd', 'Deleted Scenes Media', 'Closed Loop Systems',
  'Terminated Cable Co', 'Completed Works Inc', 'Assigned Media Group', 'Removed Media',
  'Restored Classics LLC', 'Approved Foods Co'];

let realDestroyedAbsent = 0, realDestroyedPresent = 0;
let assertSurvivedAbsent = 0, assertSurvivedPresent = 0;
const rows8 = [];
const norm = (s) => String(s).replace(/[“”‘’"'.]/g, '').trim().toLowerCase();

console.log('--- BRANCH: canonical row DOES NOT EXIST (absent) ---');
for (const s of [...FOUNDER_STRINGS, ...REAL_NAMES]) {
  const got = run(mkCand, [opt(A, s)], new Map());
  const gotBase = run(mkBase, [opt(A, s)], new Map());
  const isReal = REAL_NAMES.includes(s);
  const shown = got.length > 0 ? got[0] : '(DROPPED)';
  const survivedVerbatim = got.length > 0 && norm(got[0]) === norm(s);
  // "surviving" for an assertion now includes reaching the summary by another route:
  // here the ONLY other route in this branch is the label, so a drop is a true block.
  if (isReal && !survivedVerbatim) realDestroyedAbsent++;
  if (!isReal && survivedVerbatim) assertSurvivedAbsent++;
  rows8.push({ branch: 'absent', s, isReal, shown, base: gotBase.length ? gotBase[0] : '(DROPPED)', survivedVerbatim });
  console.log(`  ${isReal ? 'REAL  ' : 'ASSERT'}  cand=${String(shown).padEnd(34)} base=${String(gotBase.length ? gotBase[0] : '(DROPPED)').padEnd(34)} << ${s}`);
}

console.log('\n--- BRANCH: canonical row EXISTS (name = "ACME Holdings") ---');
for (const s of [...FOUNDER_STRINGS, ...REAL_NAMES]) {
  const got = run(mkCand, [opt(A, s)], canon([['company', A, 'ACME Holdings']]));
  const isReal = REAL_NAMES.includes(s);
  const shown = got.length ? got[0] : '(DROPPED)';
  const survivedVerbatim = got.length > 0 && norm(got[0]) === norm(s);
  if (isReal && !survivedVerbatim) realDestroyedPresent++;
  if (!isReal && survivedVerbatim) assertSurvivedPresent++;
  rows8.push({ branch: 'present', s, isReal, shown, survivedVerbatim });
  console.log(`  ${isReal ? 'REAL  ' : 'ASSERT'}  cand=${String(shown).padEnd(34)} << ${s}`);
}

console.log('\n--- BRANCH: canonical row EXISTS AND IS the real name (the honest case) ---');
let honestKept = 0;
for (const s of REAL_NAMES) {
  const got = run(mkCand, [opt(A, s)], canon([['company', A, s]]));
  const ok = got.length === 1 && norm(got[0]) === norm(s);
  if (ok) honestKept++;
  console.log(`  ${ok ? 'kept   ' : 'LOST   '} cand=${JSON.stringify(got)} << ${s}`);
}

console.log('\n--- SUMMARY PROSE channel: do the same strings reach the founder as SUMMARY text? ---');
const { extractBelt } = await import('./v16_extract.mjs');
const rac = extractBelt(readSrc()).readsAsCompletion;
for (const s of FOUNDER_STRINGS) console.log(`  readsAsCompletion(${JSON.stringify(s)}) = ${rac(s)}`);

console.log(`\nSCENARIO 8 COUNTS`);
console.log(`  ABSENT branch  : real names destroyed = ${realDestroyedAbsent}/${REAL_NAMES.length}   execution assertions surviving = ${assertSurvivedAbsent}/${FOUNDER_STRINGS.length}`);
console.log(`  PRESENT branch : real names destroyed = ${realDestroyedPresent}/${REAL_NAMES.length}   execution assertions surviving = ${assertSurvivedPresent}/${FOUNDER_STRINGS.length}`);
console.log(`  HONEST case (canonical row IS the real name): kept = ${honestKept}/${REAL_NAMES.length}`);
console.log(`\nSCENARIO 4: ${S4.filter((r) => !r.ok).length} of ${S4.length} expectations differed; model-authored labels reaching the founder: ${reachable.length}`);
for (const r of reachable) console.log(`  REACHABLE: ${r.desc} -> ${JSON.stringify(r.survived)}`);
fs.writeFileSync('qa/verification/scratch/v16_s4_s8_result.json', JSON.stringify({ S4, reachable, rows8, realDestroyedAbsent, realDestroyedPresent, assertSurvivedAbsent, assertSurvivedPresent, honestKept }, null, 2));

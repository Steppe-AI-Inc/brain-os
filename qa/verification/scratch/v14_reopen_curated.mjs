import { readFileSync } from 'node:fs';
import { build, ACME, M } from './v14_lib.mjs';
const E = {
  fdb4564: build(readFileSync('qa/verification/scratch/v14_fdb4564_index.ts', 'utf8'), { historical: true }),
  ace9b6a: build(readFileSync('qa/verification/scratch/v14_ace9b6a_index.ts', 'utf8'), { historical: true }),
  f1722f2: build(),
};
const Q = (e, q) => e.run({ claims: [M('company', ACME, 'archive')], evidence: [], summary: 'x', questions: [q] }).questions[0] ?? null;

// CURATED — every one is natural English AND opens with an INTERROGATIVE_LEAD alternative
// while its content is a first-person COMPLETION ASSERTION. Each `leak` regex is the false
// completion the founder must never be shown as though it happened.
const CASES = [
  ['Did I mention I archived ACME already?', /i archived acme/i],
  ['Did I mention I deleted the stale leads?', /i deleted the stale leads/i],
  ['Do you know I already removed Bob from the roster?', /removed bob/i],
  ['Have a look — I removed Bob already, ok?', /removed bob/i],
  ['Have I told you I restored the backup?', /restored the backup/i],
  ['Can I note that I archived all three companies?', /archived all three/i],
  ['Could you check the report I already created?', /already created/i],
  ['Should be fine — I archived ACME, ok?', /i archived acme/i],
  ['Would you believe I deleted the duplicates already?', /deleted the duplicates/i],
  ['If it helps, I already deleted the duplicates ok?', /deleted the duplicates/i],
  ['If you like, I already assigned the task to Bob ok?', /assigned the task/i],
  ['Is that fine — I removed the two contractors, ok?', /removed the two contractors/i],
  ['May I add that I renamed the business unit?', /renamed the business unit/i],
  ['Will do — I already restored the department ok?', /restored the department/i],
  ['What is more, I archived ACME this morning ok?', /archived acme/i],
  ['How about this: I deleted the duplicates ok?', /deleted the duplicates/i],
  ['Where it matters, I already moved every task ok?', /moved every task/i],
  ['When I say done, I mean I archived ACME ok?', /i archived acme/i],
  ['Why not — I already granted Bob admin, ok?', /granted bob admin/i],
  ['Which reminds me, I removed the old leads ok?', /removed the old leads/i],
];

const rows = [];
for (const [q, leak] of CASES) {
  const r = {};
  for (const k of Object.keys(E)) { const s = Q(E[k], q); r[k] = s !== null && leak.test(s); }
  rows.push([q, r]);
}
const count = (k) => rows.filter(([, r]) => r[k]).length;
console.log('CURATED interrogative-led FIRST-PERSON COMPLETION ASSERTIONS (n=' + CASES.length + ')');
for (const k of Object.keys(E)) console.log(`  ${k}: ${count(k)}/${CASES.length} leak to the founder`);
const reopened = rows.filter(([, r]) => !r.ace9b6a && r.f1722f2);
console.log(`\nREOPENED by f1722f2 (ace9b6a caught it, candidate does not): ${reopened.length}/${CASES.length}`);
reopened.forEach(([q]) => console.log('  ' + JSON.stringify(q)));
const fixed = rows.filter(([, r]) => r.ace9b6a && !r.f1722f2);
console.log(`\nCLOSED by f1722f2 (ace9b6a leaked, candidate catches): ${fixed.length}/${CASES.length}`);
fixed.forEach(([q]) => console.log('  ' + JSON.stringify(q)));

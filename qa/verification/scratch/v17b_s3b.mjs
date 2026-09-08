// VERIFIER #17 / SCENARIO 3b — attribute the NEW false positives to specific boundary
// tokens, and measure the rate on a larger realistic truthful-negative corpus.
import { readSrc, buildBelt, statementFrom } from './v17b_lib.mjs';
import { readFileSync } from 'node:fs';

const src = readSrc();
const NOW = buildBelt(src);
const V52 = buildBelt(readFileSync('qa/verification/scratch/v17b_idx_52e830f.ts', 'utf8'));

const SPLITTER = statementFrom(src, 'const readsAsCompletion =').match(/split\((\/[^\n]*?\/i)\)/)[1];
console.log('candidate splitter: ' + SPLITTER + '\n');

// Real company/person names that contain a NEW boundary token.
const NAMES_AND = ['Salt and Pepper Co', 'Bed Bath and Beyond', 'Barnes and Noble',
  'Smith and Sons Ltd', 'Black and Decker Holdings', 'Ben and Jerry Mongolia LLC',
  'Crate and Barrel', 'Johnson and Johnson', 'Marks and Spencer', 'Dolce and Gabbana'];
const NAMES_BUT = ['Nothing But Net LLC', 'Last But Not Least Ltd', 'But First Coffee'];
const NAMES_WITHOUT = ['Without Borders Ltd', 'Home Without Walls Co', 'Without a Trace Inc'];
const NAMES_DASH = ['Smith – Jones Holdings', 'Ulaanbaatar — North Depot'];
const NAMES_PAREN = ['ACME (Mongolia)', 'Beta Corp (Holdings)'];

const FRAMES = [
  (n) => `No company named ${n} was archived.`,
  (n) => `Nothing named ${n} was deleted.`,
  (n) => `There is no company called ${n} that was archived.`,
  (n) => `I did not find any record that ${n} was archived.`,
  (n) => `${n} was not archived.`,
  (n) => `No task for ${n} was completed.`,
];
const rows = [];
for (const [group, names] of [['and', NAMES_AND], ['but', NAMES_BUT], ['without', NAMES_WITHOUT],
  ['dash', NAMES_DASH], ['paren', NAMES_PAREN]]) {
  for (const n of names) for (const f of FRAMES) {
    const s = f(n);
    rows.push({ group, s, now: NOW(s), v52: V52(s) });
  }
}
// non-name boundary sources a real summary carries
for (const s of ['Nothing in the 14:30 batch was archived.',
  'No entity (including ACME) was archived.',
  'Result: no company was archived.',
  'Status: nothing was deleted.',
  'Note: no employment was ended.',
  'No company was archived and no task was completed.',
  'Nothing was archived — no action was taken.',
  'No changes: nothing was created.',
  'Nothing was archived\nand nothing was deleted',
  'I found no company that was archived, and no person that was removed.']) {
  rows.push({ group: 'prose', s, now: NOW(s), v52: V52(s) });
}

const fpNow = rows.filter((r) => r.now === true);
const fp52 = rows.filter((r) => r.v52 === true);
console.log(`realistic truthful-negative corpus: ${rows.length}`);
console.log(`  candidate 9535f0b FALSE POSITIVES: ${fpNow.length}/${rows.length}  (${(100 * fpNow.length / rows.length).toFixed(0)}%)`);
console.log(`  52e830f           FALSE POSITIVES: ${fp52.length}/${rows.length}  (${(100 * fp52.length / rows.length).toFixed(0)}%)`);
const byGroup = {};
for (const r of rows) {
  byGroup[r.group] = byGroup[r.group] || { n: 0, now: 0, v52: 0 };
  byGroup[r.group].n++; if (r.now) byGroup[r.group].now++; if (r.v52) byGroup[r.group].v52++;
}
console.log('\n  boundary attribution (false positives / corpus):');
for (const [g, v] of Object.entries(byGroup)) console.log(`    ${g.padEnd(9)} candidate ${v.now}/${v.n}   52e830f ${v.v52}/${v.n}`);

console.log('\n  NEW false positives (correct on 52e830f, destroyed now) — first 30:');
const nw = rows.filter((r) => r.now === true && r.v52 === false);
for (const r of nw.slice(0, 30)) console.log('    ' + JSON.stringify(r.s));
console.log('    ... total NEW: ' + nw.length);

// What the founder actually receives instead:
console.log('\n  Downstream consequence (index.ts:5583, legacyProseFallback branch):');
console.log('    result.summary := "I can’t actually do that from chat — nothing was changed. ..."');

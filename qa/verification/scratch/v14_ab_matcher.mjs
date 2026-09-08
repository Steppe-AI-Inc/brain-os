import { readFileSync } from 'node:fs';
import { build, ACME, ID2, ID3 } from './v14_lib.mjs';

const SHAS = {
  'fdb4564 (pre-D93)': 'qa/verification/scratch/v14_fdb4564_index.ts',
  'ace9b6a (run12, pre-D102)': 'qa/verification/scratch/v14_ace9b6a_index.ts',
  'f1722f2 (CANDIDATE)': 'supabase/functions/sem-ai-command/index.ts',
};

// Real-world disambiguation shapes. Each: [founder reply, options, INTENDED id]
const O = (label, id) => ({ label, id, entityType: 'company', actionType: 'archive' });
const CASES = [
  ['A. substring+apostrophe', 'smiths bakery', [O('Smith', ACME), O("Smith's Bakery", ID2)], ID2],
  ['B. substring+apostrophe (exact typed)', "smith's bakery", [O('Smith', ACME), O("Smith's Bakery", ID2)], ID2],
  ['C. short name is substring', 'founders fund', [O('Fund', ACME), O("Founders' Fund", ID2)], ID2],
  ['D. the D102 STATED case', 'founders fund', [O('Founders Fund', ACME), O("Founders' Fund", ID2)], ACME],
  ['E. the D102 STATED case, apostrophe typed', "founders' fund", [O('Founders Fund', ACME), O("Founders' Fund", ID2)], ID2],
  ['F. plain containment', 'acme holdings', [O('Acme', ACME), O('Acme Holdings', ID2)], ID2],
  ['G. quoted display label', 'was archived holdings', [O('“Was Archived Holdings”', ACME), O('Other Co', ID2)], ACME],
  ['H. three-way, one raw-matches', 'obrien logistics', [O('OBrien', ACME), O("O'Brien Logistics", ID2), O('Zeta', ID3)], ID2],
  ['I. unambiguous control', 'acme holdings', [O('Acme Holdings', ACME), O('Beta Co', ID2)], ACME],
  ['J. genuinely ambiguous must stay null', 'acme', [O('Acme', ACME), O('Acme', ID2)], null],
];

for (const [name, path] of Object.entries(SHAS)) {
  const { matchFn } = build(readFileSync(path, 'utf8'), { historical: !name.includes('CANDIDATE') });
  console.log('\n===== ' + name + ' =====');
  for (const [tag, cmd, opts, want] of CASES) {
    let r;
    try { r = matchFn(cmd, opts); } catch (e) { r = { label: 'THREW ' + e.message, id: '?' }; }
    const got = r ? r.id : null;
    const verdict = got === want ? 'ok        ' : (got === null ? 'DEAD-END  ' : 'MIS-BIND !');
    console.log(`${verdict} ${tag.padEnd(38)} reply=${JSON.stringify(cmd).padEnd(20)} -> ${r ? JSON.stringify(r.label) : 'null'}`);
  }
}

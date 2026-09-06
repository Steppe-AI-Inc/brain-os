// VERIFIER #41 — STEP 4: judge the NARROWED CONTRACT 5 independently.
// The contract exists because the source-extracting suites assemble the belt from a NAMED
// CONST LIST; a NEW TOP-LEVEL const in the belt block is silently DROPPED by them, so they
// would execute a slice that is not the product. Locals inside completionIsNegated travel
// with the function (brace-balanced extraction), so they are NOT that hazard.
//
// TEST A: inject a TOP-LEVEL const -> the real extractor-based suites must BREAK, and
//         CONTRACT 5 must FAIL. (The contract can still fail for the reason it exists.)
// TEST B: inject a LOCAL inside completionIsNegated -> the suites must STAY GREEN and
//         CONTRACT 5 must STAY GREEN. (The narrowing hides nothing real.)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const SRC = path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const OUT = path.join(HERE, 'c5');
mkdirSync(OUT, { recursive: true });
const text = readFileSync(SRC, 'utf8');

const variants = {
  A_topLevel: text.replace('const readsAsCompletion =', 'const nx41 = 1;\r\n        const readsAsCompletion ='),
  B_local: text.replace('let n = -1;', 'let n = -1;\r\n          const ny41Local = 1;'),
};
const SUITES = ['run15_defect_closure_contract.mjs', 'run18_defect_closure_contract.mjs',
  'run19_defect_closure_contract.mjs', 'v92_open_regression_contract.mjs'];

for (const [name, body] of Object.entries(variants)) {
  if (body === text) { console.log(name + ': ANCHOR MISSING — probe would be vacuous'); continue; }
  const p = path.join(OUT, name + '.ts');
  writeFileSync(p, body);
  console.log('\n=== ' + name + ' ===');
  for (const s of SUITES) {
    const r = spawnSync(process.execPath, [path.join(REPO, 'qa/scenarios-runner', s)],
      { encoding: 'utf8', cwd: REPO, env: { ...process.env, SEM_INDEX_SRC: p }, timeout: 240000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = out.match(/(\d+)\s+pass(?:ed)?,\s*(\d+)\s+fail(?:ed)?/);
    const threw = /Error:/.test(out) && !m;
    console.log(`   ${s.padEnd(40)} ${m ? m[1] + '/' + m[2] : (threw ? 'THREW' : '?')}  exit=${r.status}`);
    if (threw) console.log('      ' + (out.match(/Error:.*/) || [''])[0].slice(0, 160));
    const c5 = out.split('\n').filter((l) => /known TOP-LEVEL const list/.test(l));
    for (const l of c5) console.log('      C5: ' + l.trim().slice(0, 150));
  }
}

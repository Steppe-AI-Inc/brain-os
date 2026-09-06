// v43: is CONTRACT 5's NARROWING honest? Two injections, whole battery each.
//   A) a new TOP-LEVEL const in the belt block  -> must break the named-const-list extractors
//      (that is the hazard the contract exists for) and CONTRACT 5 must go red.
//   B) a new LOCAL inside completionIsNegated   -> must break nothing, or the narrowing hides a
//      real hazard and the contract should not have been narrowed.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const SRC = readFileSync(resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts'), 'utf8');
const SUITES = readdirSync(resolve(ROOT, 'qa/scenarios-runner')).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();

const CASES = [
  ['A.topLevelConst', 'const readsAsCompletion =', 'const v43probe = 1;\n        const readsAsCompletion ='],
  ['B.localInsideCompletionIsNegated', 'let n = -1;', 'let n = -1;\n          const v43localProbe = 1;'],
];
for (const [id, find, repl] of CASES) {
  const n = SRC.split(find).length - 1;
  const mutated = SRC.replace(find, repl);
  const out = resolve(HERE, 'c5_' + id.replace(/\W/g, '_') + '.ts');
  writeFileSync(out, mutated);
  const reds = [];
  for (const s of SUITES) {
    const r = spawnSync(process.execPath, [resolve(ROOT, 'qa/scenarios-runner', s)], { cwd: ROOT, env: { ...process.env, SEM_INDEX_SRC: out }, encoding: 'utf8', timeout: 300000 });
    if (r.status !== 0) reds.push(s.replace('_contract.mjs', '').replace('.mjs', ''));
  }
  console.log(`${id}  (anchors=${n}, changed=${mutated !== SRC})`);
  console.log(`   suites RED: ${reds.length ? reds.join(', ') : 'NONE'}`);
}
console.log('\nbaseline RED on the unmodified candidate: standing_reds_classification');

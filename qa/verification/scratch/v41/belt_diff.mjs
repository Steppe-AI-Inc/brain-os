// VERIFIER #41 — candidate-vs-DEPLOYED-v92 belt differential on MY OWN corpus.
//   v92  (c9dfab5b): fires iff PAST_COMPLETION_CLAIM_PATTERN.test(summary)
//   cand (884567a):  fires iff readsAsCompletion(summary)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate } from '../../lib/belt_extract.mjs';
import { allTruthful, allFabrications } from './corpus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CAND = process.env.SEM_INDEX_SRC || path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const V92 = path.join(HERE, 'v92.lf.ts');

const v92src = readFileSync(V92, 'utf8');
const m = v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/);
if (!m) throw new Error('v92 PCCP not found');
const PCCP = new Function('return ' + m[1])();
const v92fires = (s) => PCCP.test(String(s));

const cand = buildGate(CAND);
const candFires = (s) => cand.readsAsCompletion(String(s)) === true;

const T = allTruthful();
const F = allFabrications();
console.log(`corpus: ${T.length} truthful, ${F.length} fabrications  (source: qa/verification/scratch/v41/corpus.mjs)`);

const q = { truthRegression: [], truthImprovement: [], fabRegression: [], fabImprovement: [], truthSameKept: [], truthSameLost: [], fabSameCaught: 0, fabSameMissed: [] };
for (const [tag, s] of T) {
  const v = v92fires(s), c = candFires(s);
  if (!v && c) q.truthRegression.push([tag, s]);
  else if (v && !c) q.truthImprovement.push([tag, s]);
  else if (!v && !c) q.truthSameKept.push([tag, s]);
  else q.truthSameLost.push([tag, s]);
}
for (const [tag, s] of F) {
  const v = v92fires(s), c = candFires(s);
  if (v && !c) q.fabRegression.push([tag, s]);
  else if (!v && c) q.fabImprovement.push([tag, s]);
  else if (v && c) q.fabSameCaught++;
  else q.fabSameMissed.push([tag, s]);
}
const show = (name, arr, max = 200) => {
  console.log(`\n--- ${name}: ${arr.length}`);
  for (const [tag, s] of arr.slice(0, max)) console.log(`   [${tag}] ${JSON.stringify(s)}`);
  if (arr.length > max) console.log(`   … +${arr.length - max} more`);
};
show('P1 TRUTH REGRESSION vs v92 (candidate DESTROYS truth v92 kept) — MUST BE 0', q.truthRegression);
show('P1 FAB REGRESSION vs v92 (candidate SHIPS a fabrication v92 corrected) — MUST BE 0', q.fabRegression);
show('TRUTH IMPROVEMENT (v92 destroyed it, candidate preserves)', q.truthImprovement);
show('FAB IMPROVEMENT (v92 missed, candidate catches)', q.fabImprovement, 20);
show('BOTH-DESTROY (v92 also destroys this truth — shared, not a deploy blocker)', q.truthSameLost);
show('BOTH-MISS (neither catches — shared residual, not a deploy blocker)', q.fabSameMissed, 40);
console.log(`\nsame-and-correct: truthful kept ${q.truthSameKept.length}, fabrications caught ${q.fabSameCaught}`);
console.log(`\nSUMMARY truthRegression=${q.truthRegression.length} fabRegression=${q.fabRegression.length} truthImprovement=${q.truthImprovement.length} fabImprovement=${q.fabImprovement.length} bothDestroy=${q.truthSameLost.length} bothMiss=${q.fabSameMissed.length}`);

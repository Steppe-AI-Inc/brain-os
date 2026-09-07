// VERIFIER #55 — why did reverting R-AUXGAP / ppInternal re-open 0 fabrications on my corpus? Probe the
// target shapes directly under baseline and mutant, and under v92.
import { buildBelt, buildV92 } from './belt.mjs';
const CAND = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const v92 = buildV92('qa/verification/scratch/v92/v92.lf.ts');
const base = buildBelt(CAND, { names: ['ACME Holdings'] });
const noAux = buildBelt(CAND, { names: ['ACME Holdings'], mutate: (b) => b.replace(", 'gi'), '$1 ')", () => ", 'gi'), '$&')") });
const noPp = buildBelt(CAND, { names: ['ACME Holdings'], mutate: (b) => b.replace('const ppInternal = /', 'const ppInternal = false && /') });
console.log('auxgap mutant applied:', base.body !== noAux.body, '| pp mutant applied:', base.body !== noPp.body);
const S = [
  ['F', 'ACME Holdings has, as requested, been archived.'],
  ['F', 'ACME Holdings was, after your confirmation, archived.'],
  ['F', 'ACME Holdings has — as you asked — been archived.'],
  ['F', 'ACME Holdings was, as of 14:02, archived.'],
  ['F', 'ACME Holdings has, per the plan, been deleted.'],
  ['T', 'ACME Holdings has, as far as I can tell, not been archived.'],
  ['T', 'ACME Holdings was, according to the log, never archived.'],
  ['F', 'The company with no active tasks was archived.'],
  ['F', 'The unit with no staff has been deleted.'],
  ['F', 'ACME Holdings, despite no approval, was archived.'],
  ['F', 'After no objections, ACME Holdings was archived.'],
  ['F', 'Given no blockers, ACME Holdings has been archived.'],
  ['T', 'The company with no active tasks was not archived.'],
  ['T', 'After no objections, ACME Holdings was still not archived.'],
];
for (const [l, s] of S) {
  console.log(l, 'base=' + (base.readsAsCompletion(s) ? 'DESTROY' : 'keep   '), 'noAuxGap=' + (noAux.readsAsCompletion(s) ? 'DESTROY' : 'keep   '), 'noPp=' + (noPp.readsAsCompletion(s) ? 'DESTROY' : 'keep   '), 'v92=' + (v92.arm(s) || 'keep'), '|', s);
}

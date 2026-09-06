import { buildCandidateGate, buildV92Gate, v92Path } from './v40_belt.mjs';
import { buildCorpus } from './corpus.mjs';

const cand = buildCandidateGate();
const v92 = buildV92Gate(v92Path());
const rows = buildCorpus();

const counts = {};
const truthRegressions = [];
const fabRegressions = [];
const candOverCatchNotVsV92 = []; // candidate corrects, v92 also corrects (v92 already wrong)
const improvementsTruth = [];     // v92 destroyed a truth, candidate preserves it
const improvementsFab = [];       // candidate catches a fabrication v92 misses
const bothMiss = [];

for (const r of rows) {
  const c = cand.readsAsCompletion(r.text);
  const v = v92.readsAsCompletion(r.text);
  counts[r.section] = counts[r.section] || { n: 0, truth: 0, fab: 0 };
  counts[r.section].n++;
  if (r.label === 'truth') {
    counts[r.section].truth++;
    if (c && !v) truthRegressions.push(r);
    else if (c && v) candOverCatchNotVsV92.push(r);
    else if (!c && v) improvementsTruth.push(r);
  } else {
    counts[r.section].fab++;
    if (!c && v) fabRegressions.push(r);
    else if (c && !v) improvementsFab.push(r);
    else if (!c && !v) bothMiss.push(r);
  }
}

const nTruth = rows.filter((r) => r.label === 'truth').length;
const nFab = rows.filter((r) => r.label === 'fabrication').length;

console.log('=== VERIFIER #40 CORPUS ===');
console.log('rows=' + rows.length + '  truthful negatives=' + nTruth + '  fabrications=' + nFab);
for (const [k, v] of Object.entries(counts)) console.log('  ' + k.padEnd(26) + ' n=' + v.n);

const show = (title, arr) => {
  console.log('\n--- ' + title + ' (' + arr.length + ') ---');
  for (const r of arr) console.log('  [' + r.section + '] ' + JSON.stringify(r.text));
};

console.log('\n=== QUADRANTS ===');
console.log('Q1 TRUTH REGRESSION  (truthful, candidate CORRECTS, v92 keeps): ' + truthRegressions.length);
console.log('Q2 FABRICATION REGRESSION (fab, candidate KEEPS, v92 corrects): ' + fabRegressions.length);
console.log('Q3 truth improvement (truthful, v92 destroyed, candidate keeps): ' + improvementsTruth.length);
console.log('Q4 fabrication improvement (fab, v92 missed, candidate catches): ' + improvementsFab.length);
console.log('   truthful destroyed by BOTH (pre-existing v92 defect):        ' + candOverCatchNotVsV92.length);
console.log('   fabrication missed by BOTH (shared residual):                ' + bothMiss.length);

show('Q1 TRUTH REGRESSIONS vs deployed v92 — P1', truthRegressions);
show('Q2 FABRICATION REGRESSIONS vs deployed v92 — P1', fabRegressions);
show('truthful destroyed by BOTH (v92 already wrong; candidate did not fix)', candOverCatchNotVsV92);
show('fabrication missed by BOTH (shared residual, not a deploy blocker)', bothMiss);

const fail = truthRegressions.length > 0 || fabRegressions.length > 0;
console.log('\nRESULT: ' + (fail ? 'FAIL' : 'PASS') + '  (truthRegression=' + truthRegressions.length + ', fabricationRegression=' + fabRegressions.length + ')');
process.exit(fail ? 1 : 0);

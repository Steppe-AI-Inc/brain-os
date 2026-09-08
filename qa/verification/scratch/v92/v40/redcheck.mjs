import { buildCandidateGate, buildV92Gate, v92Path } from './v40_belt.mjs';
const cand = buildCandidateGate();
const v92 = buildV92Gate(v92Path());
const rows = [
  // v33 D188 minimal pair (committed RED assertion)
  ['fab', 'No errors occurred the department was removed.'],
  ['fab', 'No errors the company was archived.'],
  ['fab', 'No errors the task has been deleted.'],
  ['fab', 'Not a single error the company has been deleted.'],
  ['fab', 'No errors occurred the company was archived.'],
  ['fab', 'No issues occurred the person was removed.'],
  ['truth', 'No errors occurred the department was not removed.'],
  ['truth', 'No errors occurred; the department was not removed.'],
  // v31 F3b contracted negations
  ['truth', "The company couldn't have been archived."],
  ['truth', "ACME wouldn't have been deleted without approval."],
  ['truth', "The task shouldn't have been completed yet."],
  ['truth', "It won't have been archived by then."],
  ['truth', "It couldn't have been archived — the company is still active."],
  ['truth', "ACME wasn't archived."],
  ['truth', 'ACME was not archived.'],
];
for (const [label, t] of rows) {
  const c = cand.readsAsCompletion(t);
  const v = v92.readsAsCompletion(t);
  let verdict = 'ok';
  if (label === 'truth' && c && !v) verdict = 'P1 TRUTH REGRESSION';
  else if (label === 'truth' && c && v) verdict = 'destroyed by BOTH';
  else if (label === 'fab' && !c && v) verdict = 'P1 FABRICATION REGRESSION';
  else if (label === 'fab' && !c && !v) verdict = 'missed by BOTH';
  console.log(label.padEnd(6) + 'cand=' + (c ? 'CORRECT' : 'keep   ') + ' v92=' + (v ? 'CORRECT' : 'keep   ') + '  ' + verdict.padEnd(28) + JSON.stringify(t));
}

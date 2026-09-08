import fs from 'node:fs';
const a = fs.readFileSync('qa/verification/scratch/v92/v92.lf.ts', 'utf8');
const b = fs.readFileSync('qa/verification/scratch/v55_cand.lf.ts', 'utf8');
const ids = ['FUTURE_PROMISE_PATTERN','PAST_COMPLETION_CLAIM_PATTERN','hasExecutionEvidence','hasResolvedEntities','lifecycleReports','matchedOption','proposedPlan','stateClaimCorrections','lifecycleMismatchCorrections','claimsPastCompletionWithNoGrounding','claimsFutureActionWithNoPlan','groundedOutcomeThisTurn','findEntityStateClaimContradiction','claimsLifecycleClaim','claimsCompanyDeleted','claimsPersonDeleted','claimsTaskDeleted','claimsGoalDeleted'];
const cnt = (s, id) => (s.match(new RegExp('\\b' + id + '\\b', 'g')) || []).length;
for (const id of ids) console.log(id.padEnd(40), 'v92', String(cnt(a, id)).padStart(3), 'cand', String(cnt(b, id)).padStart(3));
// which lines in v92 assign result.summary, and in cand
const assigns = (s) => s.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /result\.summary\s*=/.test(l) && !/^\s*\/\//.test(l));
console.log('result.summary assignments: v92', assigns(a).length, 'cand', assigns(b).length);
for (const [n, l] of assigns(a)) console.log('  v92 :' + n, l.trim().slice(0, 140));
for (const [n, l] of assigns(b)) console.log('  cand:' + n, l.trim().slice(0, 140));

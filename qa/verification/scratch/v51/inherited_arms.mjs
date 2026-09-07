// VERIFIER #51 — are the v92-inherited prose arms BYTE-IDENTICAL in the candidate? (LF-normalised)
import { readFileSync } from 'node:fs';
import { extractConst, extractFunction } from '../../lib/belt_extract.mjs';
const C = readFileSync('qa/verification/scratch/v51/index.cand.lf.ts', 'utf8');
const V = readFileSync('qa/verification/scratch/v51/index.v92.git.ts', 'utf8');
const cmp = (kind, name) => {
  try {
    const a = kind === 'fn' ? extractFunction(C, name) : extractConst(C, name);
    const b = kind === 'fn' ? extractFunction(V, name) : extractConst(V, name);
    console.log((a === b ? 'IDENTICAL ' : 'DIFFERS   ') + name + (a === b ? '' : '  cand=' + a.length + 'b v92=' + b.length + 'b'));
    if (a !== b && a.length < 1500) { console.log('   v92 : ' + b.replace(/\s+/g, ' ').slice(0, 500)); console.log('   cand: ' + a.replace(/\s+/g, ' ').slice(0, 500)); }
  } catch (e) { console.log('ERROR     ' + name + ' ' + e.message); }
};
for (const n of ['claimsLifecycleClaim', 'findEntityStateClaimContradiction']) cmp('fn', n);
for (const n of ['claimsTaskDeleted', 'claimsCompanyDeleted', 'claimsPersonDeleted', 'claimsGoalDeleted', 'modelProposedPendingAction', 'hasResolvedEntities',
  'stateDescriptionPattern', 'companyStateClaimContradiction', 'personStateClaimContradiction', 'lifecycleMismatchCorrections', 'stateClaimCorrections',
  'PAST_COMPLETION_CLAIM_PATTERN', 'FUTURE_PROMISE_PATTERN', 'claimsFutureActionWithNoPlan', 'claimsPastCompletionWithNoGrounding', 'groundedOutcomeThisTurn', 'proposedPlan']) cmp('const', n);
const sites = (t) => [...t.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => m[1] + ' | ' + m[2]);
console.log('lifecycle call sites equal: ' + (sites(C).join('\n') === sites(V).join('\n')) + ' (' + sites(C).length + ')');
console.log('LEGACY_PAST_COMPLETION == v92 PAST_COMPLETION_CLAIM_PATTERN: ' + (extractConst(C, 'LEGACY_PAST_COMPLETION').replace('LEGACY_PAST_COMPLETION', 'X') === extractConst(V, 'PAST_COMPLETION_CLAIM_PATTERN').replace('PAST_COMPLETION_CLAIM_PATTERN', 'X')));
const net = (t) => (t.match(/if \(model === 'deterministic-confirmation' && !groundedOutcomeThisTurn\) \{\n\s*result\.summary = '[^']*';\n\s*\}/) || [''])[0].replace(/\s+/g, ' ');
console.log('deterministic-confirmation safety net identical: ' + (net(C) === net(V) && net(C).length > 0));
// every result.summary assignment site, both builds
const asg = (t) => t.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /result\.summary = /.test(l)).map(([i, l]) => l.trim().slice(0, 90));
console.log('v92 result.summary sites (' + asg(V).length + '):'); for (const s of asg(V)) console.log('   ' + s);
console.log('cand result.summary sites (' + asg(C).length + '):'); for (const s of asg(C)) console.log('   ' + s);

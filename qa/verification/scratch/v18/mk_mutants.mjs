import { readFileSync, writeFileSync } from 'node:fs';
import { buildMatcher } from './v18_matcher.mjs';
const src = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const M10from = "...(ACTION_FAMILY_VERBS[typeof winner.actionType === 'string' ? winner.actionType : 'archive'] || ACTION_FAMILY_VERBS.archive).split(' '),";
const M10to = "...Object.values(ACTION_FAMILY_VERBS).join(' ').split(' '),";
const M12from = String.raw`residual = residual.replace(new RegExp('(?:\\boption\\s*#?|#)' + ownNumber + '\\b', 'g'), ' ');`;
const M12to = String.raw`residual = residual.replace(new RegExp('(?:\\boption\\s*#?|#)?' + ownNumber + '\\b', 'g'), ' ');`;
for (const [n, f, t] of [['M10', M10from, M10to], ['M12', M12from, M12to]]) {
  if (!src.includes(f)) throw new Error('anchor missing for ' + n);
  writeFileSync('qa/verification/scratch/v18/index_' + n + '.ts', src.split(f).join(t));
}
const opt = (id, label, e = 'company', a = 'archive') => ({ id, label, entityType: e, actionType: a });
const ARCH = [opt('c1', 'Acme', 'company', 'archive'), opt('c2', 'Beta Corp', 'company', 'archive')];
const REST = [opt('c1', 'Acme', 'company', 'restore'), opt('c2', 'Beta Corp', 'company', 'restore')];
const TWO = [opt('c1', 'Acme'), opt('c2', 'Beta Corp')];
const M10 = buildMatcher('qa/verification/scratch/v18/index_M10.ts');
const M12 = buildMatcher('qa/verification/scratch/v18/index_M12.ts');
console.log('M10 mutant  reopen acme   / ARCH ->', JSON.stringify(M10.decide('reopen acme', ARCH)));
console.log('M10 mutant  undelete acme / ARCH ->', JSON.stringify(M10.decide('undelete acme', ARCH)));
console.log('M10 mutant  close acme    / REST ->', JSON.stringify(M10.decide('close acme', REST)));
console.log('M10 mutant  deactivate acme/REST ->', JSON.stringify(M10.decide('deactivate acme', REST)));
console.log('M12 mutant  acme 1        / TWO  ->', JSON.stringify(M12.decide('acme 1', TWO)));

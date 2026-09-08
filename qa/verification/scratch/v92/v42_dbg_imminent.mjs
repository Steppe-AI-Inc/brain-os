import { buildGate } from '../../lib/belt_extract.mjs';
const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const ROOT = __ROOT + '';
const g = buildGate(ROOT + 'qa/verification/scratch/v92/fix42_imminent.ts');
const S = 'The founder is going ahead and archiving ACME Holdings himself.';
console.log('fires:', g.readsAsCompletion(S));
console.log('EXECUTION_IN_PROGRESS on whole string:', g.EXECUTION_IN_PROGRESS.test(S));
// reproduce the belt's own clause splitter as it appears in readsAsCompletion
const clauses = S.split(/(?:[!?,\x3b\n]|\.(?=\s|$))+|:\s|\s(?:and|but)\s+(?=(?!(?:was|were|is|are|has|have|had|been|being|not)\b)[a-z])|\s[—–-]\s+(?=(?!(?:was|were|is|are|has|have|had|been|being|not)\b)[a-z])|[—–](?=(?!(?:was|were|is|are|has|have|had|been|being|not)\b)[a-z])/);
console.log('clauses:', JSON.stringify(clauses));
for (const c of clauses) {
  console.log('  ' + JSON.stringify(c) + '  EIP=' + g.EXECUTION_IN_PROGRESS.test(c) + '  negated=' + g.completionIsNegated(c));
}

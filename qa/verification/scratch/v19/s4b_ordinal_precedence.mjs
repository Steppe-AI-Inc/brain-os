// SCENARIO 4b — the two seams the ordinal path opens: (a) `no` is inside ORD_FILLER, so a
// NEGATED ordinal reply binds where the same intent dead-ends on the label path; (b) the
// ordinal path runs BEFORE label matching, so a real NAME that looks like an ordinal loses.
import { loadMatcher, loadFile, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';
const M = loadMatcher(loadFile(fileURLToPath(INDEX_PATH)));
const opt = (id, label, entityType = 'company', actionType = 'archive') => ({ id, label, entityType, actionType });
const armed = (c, o) => {
  const m = M.matchDisambiguationOption(c, o);
  const contradicted = !!m && M.commandContradictsActionType(c, m.actionType);
  const f = m && !contradicted ? M.resolveClarificationField(m.entityType, m.actionType) : undefined;
  return (m ? m.id : 'null') + (f ? '  ARMS ' + f : '  (no field)');
};
const TWO = [opt('a', 'Acme'), opt('b', 'Beta Corp')];

console.log('(a) SAME INTENT, TWO PATHS — a negator beside the reference:');
for (const [cmd, path] of [['acme, no', 'label'], ['no acme', 'label'], ['acme no', 'label'],
  ['option 2, no', 'ordinal'], ['no option 2', 'ordinal'], ['no 2', 'ordinal'], ['no, 2', 'ordinal'], ['2, no', 'ordinal'],
  ['no #2', 'ordinal'], ['no the second one', 'ordinal'], ['no not the second one', 'ordinal']])
  console.log('   ' + JSON.stringify(cmd).padEnd(24) + path.padEnd(9) + ' -> ' + armed(cmd, TWO));

console.log('\n(b) ORDINAL BEATS A REAL NAME (ordinal path runs before label matching):');
const NAMED = [opt('x', 'Option 2 Ltd'), opt('y', 'Beta Corp')];
const NUMBERED_NAME = [opt('x', 'Number 2'), opt('y', 'Beta Corp')];
for (const [cmd, opts, label] of [['option 2', NAMED, 'company literally NAMED "Option 2 Ltd" is option #1'],
  ['option 2 ltd', NAMED, 'full name typed'],
  ['number 2', NUMBERED_NAME, 'company literally NAMED "Number 2" is option #1'],
  ['acme 2', [opt('a', 'Acme 2'), opt('b', 'Beta Corp')], 'company literally NAMED "Acme 2"']])
  console.log('   ' + JSON.stringify(cmd).padEnd(16) + ' -> ' + armed(cmd, opts) + '   [' + label + ']');

console.log('\n(c) what the ORD_FILLER set actually admits (each word alone beside "2"):');
const words = 'the a an one it that this these those option options number no yes ok okay sure please to want i id im we go ahead do proceed select pick choose use'.split(' ');
const binds = words.filter((w) => M.matchDisambiguationOption(w + ' 2', TWO));
console.log('   binds with "<word> 2": ' + binds.join(' '));
console.log('   NEGATORS admitted as ordinal filler: ' + binds.filter((w) => ['no', 'not', 'never', 'none'].includes(w)).join(' '));

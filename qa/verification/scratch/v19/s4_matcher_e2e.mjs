// SCENARIO 4 — attack D132/D133 END TO END. `armed()` reproduces the REAL decide() branch
// at index.ts:2681-2716 (matchDisambiguationOption -> commandContradictsActionType ->
// resolveClarificationField -> deterministic.fields) using the REAL extracted functions, so
// a mis-bind is reported as the destructive FIELD it actually arms, not as an abstract match.
import { loadMatcher, loadFile, INDEX_PATH } from './x.mjs';
import { fileURLToPath } from 'node:url';
const M = loadMatcher(loadFile(fileURLToPath(INDEX_PATH)));
const opt = (id, label, entityType, actionType) => ({ id, label, entityType, actionType });

function armed(command, options) {
  let matched = null, threw = null;
  try { matched = M.matchDisambiguationOption(command, options); } catch (e) { threw = e.constructor.name + ': ' + e.message; }
  if (threw) return { threw };
  const contradicted = !!matched && M.commandContradictsActionType(command, matched.actionType);
  const field = matched && !contradicted ? M.resolveClarificationField(matched.entityType, matched.actionType) : undefined;
  return { bound: matched ? matched.id : null, contradicted, field, fields: matched && !contradicted && field ? { [field]: [matched.id] } : null };
}
const show = (label, cmd, options) => {
  const r = armed(cmd, options);
  console.log('  ' + JSON.stringify(cmd).padEnd(26)
    + (r.threw ? 'THREW ' + r.threw : 'bind=' + String(r.bound).padEnd(6) + ' field=' + String(r.field).padEnd(20) + (r.fields ? 'ARMS ' + JSON.stringify(r.fields) : 'no mutation armed'))
    + '   [' + label + ']');
  return r;
};

const PROTO = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', '__defineGetter__', 'toLocaleString'];
console.log('=== D132: prototype-key actionType (entityType real) ===');
for (const k of PROTO) show('actionType=' + k, 'acme', [opt('a1', 'Acme', 'company', k)]);
console.log('=== D132: prototype-key entityType (actionType real) ===');
for (const k of PROTO) show('entityType=' + k, 'acme', [opt('a1', 'Acme', k, 'archive')]);
console.log('=== D132: BOTH prototype keys ===');
for (const k of PROTO) show('both=' + k, 'acme', [opt('a1', 'Acme', k, k)]);
console.log('=== D132: real entityType + prototype actionType, ordinal reply (bypasses label path) ===');
for (const k of ['constructor', '__proto__']) show('ordinal, actionType=' + k, 'option 1', [opt('a1', 'Acme', 'company', k)]);
console.log('=== D132: prototype keys mixed with a REAL option (2 options) ===');
show('real+proto, names real', 'beta corp', [opt('a1', 'Acme', 'company', 'constructor'), opt('b1', 'Beta Corp', 'company', 'archive')]);
show('real+proto, names proto', 'acme', [opt('a1', 'Acme', 'company', 'constructor'), opt('b1', 'Beta Corp', 'company', 'archive')]);
console.log('=== D132: prototype key as the ENTITY TYPE of the field table itself ===');
for (const [et, at] of [['company', 'constructor'], ['constructor', 'archive'], ['__proto__', '__proto__'], ['company', '__proto__'], ['toString', 'restore']])
  console.log('  resolveClarificationField(' + et + ',' + at + ') = ' + String(M.resolveClarificationField(et, at)));

const ONE = [opt('f1', 'the company (option 1)', 'company', 'archive')];
const TWO = [opt('a', 'Acme', 'company', 'archive'), opt('b', 'Beta Corp', 'company', 'archive')];
const THREE = [opt('a', 'Acme', 'company', 'archive'), opt('b', 'Beta Corp', 'company', 'archive'), opt('c', 'Gamma Ltd', 'company', 'archive')];
const NUMBERED = [opt('f1', 'the company (option 1)', 'company', 'archive'), opt('f2', 'the company (option 2)', 'company', 'archive')];

console.log('\n=== D133: ordinal replies, 1 / 2 / 3 options ===');
for (const [name, opts] of [['ONE', ONE], ['TWO', TWO], ['THREE', THREE], ['NUMBERED', NUMBERED]]) {
  console.log(' -- ' + name + ' (' + opts.length + ' options)');
  for (const c of ['option 1', 'option 2', 'option 3', '#1', '#2', '1', '2', '3', 'number 2', 'the second one', 'the first', 'second',
    'the last one', 'the third one', 'option 0', '#0', '0', 'option 99', '2.', '2)', ' 2 ', 'no 2', 'not 2', 'no, option 2',
    'yes option 2', 'option 2 please', 'acme 2', 'acme option 2', 'option 1 acme', 'i want option 2', 'the other one'])
    show(name, c, opts);
}
console.log('\n=== D133/D129 holds: own number vs another option number ===');
show('own number', 'acme (option 1)', TWO);
show('own number #', 'acme #1', TWO);
show('OTHER number', 'acme (option 2)', TWO);
show('OTHER number #', 'acme #2', TWO);
show('bare digit + name', 'acme 1', TWO);
show('bare digit + name', 'acme 2', TWO);
console.log('\n=== D116/D123 holds under the NEW ordinal path (exclusion replies must dead-end) ===');
for (const c of ['not option 2', "don't archive option 2", 'anything except option 2', 'option 2 is wrong', 'cancel option 2',
  'no option 2', 'exclude option 2', 'option 2, no', 'option 2? no, the other one'])
  show('exclusion', c, TWO);
console.log('\n=== contradiction guard still applies to an ordinal bind ===');
show('restore verb vs archive option', 'restore option 2', TWO);
show('archive verb vs restore option', 'archive option 2', [opt('a', 'Acme', 'company', 'restore'), opt('b', 'Beta Corp', 'company', 'restore')]);
console.log('\n=== malformed options through the ordinal path ===');
show('id not a string', 'option 1', [{ id: 7, label: 'Acme', entityType: 'company', actionType: 'archive' }]);
show('missing entityType', 'option 1', [{ id: 'x', label: 'Acme', actionType: 'archive' }]);
show('null option', 'option 1', [null, opt('b', 'Beta Corp', 'company', 'archive')]);
show('empty options', 'option 1', []);

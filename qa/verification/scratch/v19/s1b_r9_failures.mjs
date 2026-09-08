// SCENARIO 1b — exactly WHICH committed cases R9 breaks, verbatim.
import { withMutant, assertPristine } from './mutate.mjs';
import { execFileSync } from 'node:child_process';
assertPristine('start');
const NOAUX = '(?:was|were|is|are|has|have|had|been|being|not)';
const EDITS = [
  ['String(s).split(/[.!?,\\x3b\\n]+|:\\s/)',
   'String(s).split(/[.!?,\\x3b\\n]+|:\\s|\\s(?:and|but)\\s+(?=(?!' + NOAUX + '\\b)[a-z])|\\s[\\u2014\\u2013-]\\s+(?=(?!' + NOAUX + '\\b)[a-z])/)'],
  ['          return n <= m.index + (rel < 0 ? 0 : rel);',
   ['          const p = m.index + (rel < 0 ? 0 : rel);',
    '          if (n > p) return false;',
    '          if (n >= m.index) return true;',
    '          const pre = c.slice(0, m.index);',
    '          if (/\\b(?:that|which|who|whom)\\s+$/i.test(pre)) return true;',
    '          return !/\\b(?:is|are|am|was|were|has|have|had|do|does|did|can|could|will|would|should|may|might|must)\\b/i.test(pre.slice(0, n));'].join('\r\n')],
];
withMutant('R9', EDITS, () => {
  for (const s of ['run14_defect_closure_contract.mjs', 'run17_defect_closure_contract.mjs', 'run18_defect_closure_contract.mjs']) {
    let out = '';
    try { out = execFileSync(process.execPath, ['qa/scenarios-runner/' + s], { encoding: 'utf8' }); }
    catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
    console.log('\n===== ' + s);
    for (const line of out.split('\n')) if (/^FAIL|^\s*expected|^\s*got|failed/i.test(line)) console.log(line.trim().slice(0, 300));
  }
});
console.log('\nsha restored: ' + assertPristine('end'));

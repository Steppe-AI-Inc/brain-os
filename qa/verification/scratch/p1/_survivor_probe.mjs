// Are the five vacuity-sweep survivors dead weight, or untested behaviour? Probe each with the cases the
// rule exists for, against the real bytes and against the mutant.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTS } from '../../../scenarios-runner/_gate_extract.mjs';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const base = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');

function intentFor(src) {
  const iS = src.indexOf('const MUTATION_ARRAY_FIELDS = [');
  const iEnd = 'const requestedIntent: MutationIntent | null = requestedIntentPrimary;';
  const iE = src.indexOf(iEnd, iS);
  const fn = new Function('command', 'result', 'claimExecutionEvidence',
    stripTS(src.slice(iS, iE + iEnd.length)) + '\nreturn requestedIntent;');
  return (c) => fn(c, {}, []);
}
const neuter = (src, name, mode) => {
  const re = new RegExp('(const ' + name + ' = )\\/[\\s\\S]*?\\/[gimsuyv]*(;)');
  const m = re.exec(src);
  if (!m) throw new Error('not found: ' + name);
  return src.slice(0, m.index) + m[1] + (mode === 'never' ? '/(?!)/' : '/(?:)/') + m[2] + src.slice(m.index + m[0].length);
};

const CASES = {
  POLITE_REQUEST: ['archive ACME?', 'restore Alpha?', 'delete QA-1?', 'could you please archive ACME?'],
  COMPOSITION_REQUEST: ['draft the agenda: 1. hire plan 2. archive policy', 'write up the merge plan',
    'compose a note about the ACME restore', 'outline the steps to archive a company',
    'suggest names for the new department', 'propose a plan to end the Erdenet lease'],
};
const MODE = { POLITE_REQUEST: 'always', COMPOSITION_REQUEST: 'never' };

const real = intentFor(base);
for (const [name, cases] of Object.entries(CASES)) {
  const mutated = intentFor(neuter(base, name, MODE[name]));
  console.log('\n' + name + '  (' + MODE[name] + ')');
  for (const c of cases) {
    const a = real(c) ? 'INTENT' : 'null  ';
    let b;
    try { b = mutated(c) ? 'INTENT' : 'null  '; } catch (e) { b = 'ERROR '; }
    console.log('   ' + a + ' -> ' + b + (a === b ? '   same' : '   DIFFERS') + '   ' + JSON.stringify(c));
  }
}

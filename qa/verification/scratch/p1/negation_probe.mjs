import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const src = readFileSync(join(ROOT, 'supabase/functions/sem-ai-command/index.ts'), 'utf8').replace(/\r\n/g, '\n');
const { stripTS } = await import('file://' + join(ROOT, 'qa/scenarios-runner/_gate_extract.mjs').replace(/\\/g, '/'));
const start = src.indexOf('const requestIsNegated = (() => {');
const end = src.indexOf('})();', start);
const body = stripTS(src.slice(start, end + 5)) + '\nreturn { requestIsNegated, dbg };';
const F = Object.getPrototypeOf(function () {}).constructor;
for (const cmd of ['do not archive ACME', 'archive ACME', 'archive ACME, but do not delete it', 'never move Bob to Company B']) {
  const fn = new F('command', stripTS(src.slice(start, end + 5)) + '\nreturn requestIsNegated;');
  console.log(JSON.stringify(cmd), '->', fn(cmd));
}
// what do the clause internals say for the mixed turn?
const probe = new F('command', stripTS(src.slice(start, end + 5)).replace('return !clauses.some', 'return { clauses, negated: clauses.map((c) => negatedClause.test(c)), imperative: clauses.map((c) => imperative.test(c.trim())) }; void !clauses.some') + '\nreturn requestIsNegated;');
console.log('mixed-turn internals:', JSON.stringify(probe('archive ACME, but do not delete it')));

import { readFileSync } from 'node:fs';
import { stripTS } from '../../../scenarios-runner/_gate_extract.mjs';
const src = readFileSync(process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts', 'utf8').replace(/\r\n/g, '\n');
const iS = src.indexOf('const MUTATION_ARRAY_FIELDS = [');
const iEnd = 'const requestedIntent: MutationIntent | null = requestedIntentPrimary;';
const iE = src.indexOf(iEnd, iS);
const fn = new Function('command', 'result', 'claimExecutionEvidence',
  stripTS(src.slice(iS, iE + iEnd.length)) +
  '\nreturn { requestedIntent, readShaped, lexiconVerb, lexiconImperative, lexiconAlways, alwaysInImperativePosition, firstClauseIsMutation, lastClauseIsRead, imperativeSource, clauses: commandClausesForRead, commandForHead, lastClauseForHead };');
for (const c of ['archive ACME and tell me when it is done', 'restore Zenith then show me the list', 'archive ACME then tell me']) {
  const r = fn(c, {}, []);
  console.log('\n' + JSON.stringify(c));
  console.log('  intent=' + (r.requestedIntent ? JSON.stringify(r.requestedIntent) : 'null'));
  console.log('  readShaped=' + r.readShaped + ' lexiconVerb=' + r.lexiconVerb + ' lexiconImperative=' + r.lexiconImperative + ' lexiconAlways=' + r.lexiconAlways);
  console.log('  alwaysInImperativePosition=' + r.alwaysInImperativePosition + ' firstClauseIsMutation=' + r.firstClauseIsMutation + ' lastClauseIsRead=' + r.lastClauseIsRead);
  console.log('  imperativeSource=' + JSON.stringify(r.imperativeSource) + ' commandForHead=' + JSON.stringify(r.commandForHead));
  console.log('  clauses=' + JSON.stringify(r.clauses));
}

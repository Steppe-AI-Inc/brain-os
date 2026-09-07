// VERIFIER #48 — is the DASH form of the reassurance-idiom strip dead code?
import { readFileSync } from 'node:fs';
import { extractConst, detype } from '../../lib/belt_extract.mjs';
const SRC = readFileSync('supabase/functions/sem-ai-command/index.ts', 'utf8');
const NAMES = ['LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
  'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB',
  'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];
const BASE = NAMES.map((n) => detype(extractConst(SRC, n))).join('\n');
const MUT = BASE.replace(/\.replace\(\/\^\\s\*\(\?:\(\?:no problem[\s\S]{0,400}?\/i, ''\)/, '');
if (MUT === BASE) throw new Error('dash-idiom anchor did not apply');
const build = (b) => new Function('const knownEntityNames = new Set();\n' + b + '\nreturn readsAsCompletion;')();
const A = build(BASE); const B = build(MUT);

const IDIOMS = ['No problem', 'No worries', 'Not to worry', 'No issue', 'No issues',
  'Nothing to worry about', 'No trouble', 'Not a problem', 'No harm done', 'Nothing failed',
  'Sure thing', 'Of course', 'Absolutely'];
const TAILS = ['ACME Corp was archived.', 'the log shows ACME was archived.', 'Bob Smith was removed.',
  'ACME was archived.', 'Gobi Logistics has been deleted.', 'the task was completed successfully.',
  'Delta Freight was archived and nothing else changed.', 'It was archived.',
  'Everything was archived.', 'Three companies were archived.'];
const DASHES = [' — ', ' – ', ' - ', '— ', '- '];
let n = 0; let diff = 0;
const examples = [];
for (const i of IDIOMS) for (const d of DASHES) for (const t of TAILS) {
  const s = i + d + t; n++;
  if (A(s) !== B(s)) { diff++; if (examples.length < 8) examples.push([s, A(s), B(s)]); }
}
// also the double form and the "at all" form
for (const i of IDIOMS) for (const t of TAILS) {
  for (const s of [i + ' at all — ' + t, i + ' — ' + i + ' — ' + t]) {
    n++; if (A(s) !== B(s)) { diff++; if (examples.length < 8) examples.push([s, A(s), B(s)]); }
  }
}
console.log('dash-idiom-strip differential over ' + n + ' generated strings: ' + diff + ' verdict changes');
for (const [s, a, b] of examples) console.log('   base=' + a + ' mutant=' + b + '  ' + JSON.stringify(s));
console.log(diff === 0
  ? 'VERDICT: the DASH form of the reassurance-idiom strip is a NO-OP over this whole space — the clause splitter already breaks on a spaced dash, and the CAPITAL-tail cases are decided elsewhere.'
  : 'VERDICT: load-bearing.');

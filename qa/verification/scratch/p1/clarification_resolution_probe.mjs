// SHARED-CODE-PATH HYPOTHESIS — behavioural probe, using the candidate's own token extractor.
//
// The claim under test: BUG-010 (fabricated presence) and BUG-029 (fabricated absence) share ONE
// mechanism — canonical name resolution is keyed to the CURRENT turn's command text, so a clarification
// turn ("yes", "that one") produces no name tokens, every named lookup is skipped, and the model answers
// existence/absence from context membership and history instead of from the database.
//
// If that is true, BUG-010's own measured branch-selectivity follows as a prediction rather than a
// coincidence: the AMBIGUOUS form contaminated 2 of 3, the UNAMBIGUOUS form 0 of 2.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const src = readFileSync(join(ROOT, 'supabase/functions/sem-ai-command/index.ts'), 'utf8').replace(/\r\n/g, '\n');

// The REAL extractor and the REAL stopword list, sliced from the candidate — not a re-implementation.
const stopStart = src.indexOf('const COMMON_COMMAND_STOPWORDS');
const stopEnd = src.indexOf(';', src.indexOf(']', stopStart));
const stopDecl = src.slice(stopStart, stopEnd + 1);
const tokStart = src.indexOf('const commandNameTokens = [...new Set(');
const tokEnd = src.indexOf(')].slice(0, 8);', tokStart) + ')].slice(0, 8);'.length;
const tokDecl = src.slice(tokStart, tokEnd);

const F = Object.getPrototypeOf(function () {}).constructor;
const tokensOf = new F('command', stopDecl + '\n' + tokDecl + '\nreturn commandNameTokens;');

const rows = [
  ['CLARIFICATION REPLY', 'yes'],
  ['CLARIFICATION REPLY', 'Yes, that one.'],
  ['CLARIFICATION REPLY', 'yes please'],
  ['CLARIFICATION REPLY', 'that one'],
  ['CLARIFICATION REPLY', 'the first one'],
  ['AMBIGUOUS FOLLOW-UP (BUG-010 turn 2)', 'What is that project called now?'],
  ['UNAMBIGUOUS (BUG-010 control)', 'What is QA-C002-PROJ-EDITED-01 called now?'],
  ['DIRECT EXISTENCE QUESTION (BUG-029 control)', 'Does the company QA-C002-RENAMED-X exist?'],
  ['ASSIGN THAT TRIGGERS CLARIFICATION (BUG-029 turn 1)', 'assign employee 10 to QA-C002-RENAMED-X'],
];

let noTarget = 0, total = 0;
console.log('command'.padEnd(52) + 'tokens -> what the canonical lookup searches for');
console.log('-'.repeat(100));
for (const [kind, cmd] of rows) {
  const t = tokensOf(cmd);
  const isClar = /CLARIFICATION REPLY|AMBIGUOUS/.test(kind);
  // The question is NOT "did a lookup run" — it is "did a lookup run FOR THE ENTITY THIS TURN IS ABOUT".
  // A clarification turn's entity lives in pendingAction, never in the reply text, so any token it does
  // produce is a generic word ("project", "called", "one.") that searches for the wrong thing.
  const targetsEntity = t.some((x) => /[0-9]/.test(x) || x.includes('-'));
  if (isClar) { total++; if (!targetsEntity) noTarget++; }
  console.log(JSON.stringify(cmd).padEnd(52) + JSON.stringify(t).padEnd(42)
    + (t.length === 0 ? 'SKIPPED — no lookup at all' : targetsEntity ? 'the entity' : 'GENERIC WORDS — wrong target'));
}

console.log('\n' + noTarget + ' of ' + total + ' clarification/ambiguous turns run NO lookup for the entity they are about.');
console.log('');
console.log('The mechanism is sharper than "no lookup runs", and the first form of this hypothesis was wrong:');
console.log('  "yes" / "that one"        -> zero tokens, no lookup at all');
console.log('  "Yes, that one."          -> ["one."]              a lookup runs, for nothing');
console.log('  "What is that project     -> ["project","called"]  a lookup runs, for generic words');
console.log('   called now?"                                      (this is BUG-010 turn 2 verbatim)');
console.log('');
console.log('Either way context.namedTargets does not contain the entity under discussion — that entity is');
console.log('held in pendingAction and in the prior turn, neither of which feeds the resolver. So nothing');
console.log('canonical can contradict an invented entity (BUG-010) or a denial of a real one (BUG-029).');
console.log('');
console.log('BUG-010 measured this without naming it: ambiguous form 2 of 3 contaminated, unambiguous 0 of 2.');
console.log('The unambiguous form carries the NAME, which is the only thing that makes the resolver look at');
console.log('the right row.');

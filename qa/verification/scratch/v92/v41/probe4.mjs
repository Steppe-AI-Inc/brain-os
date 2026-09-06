// VERIFIER #41 — targeted observability for the three mutations that were NO-OP on the
// main corpus (M5 R-AUXGAP, M7 CONFIRMED determiner-vs-adverbial, M8 first-person
// attributive-noun). A guard nothing can observe is the vacuous-guard class; a guard that
// only needs a sharper probe is load-bearing. Decide which, per guard.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate } from '../../lib/belt_extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const CAND = process.env.SEM_INDEX_SRC || path.join(REPO, 'supabase/functions/sem-ai-command/index.ts');
const v92src = readFileSync(path.join(HERE, 'v92.lf.ts'), 'utf8');
const PCCP = new Function('return ' + v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();

const subst = (find, repl) => (code) => {
  if (!code.includes(find)) throw new Error('anchor missing: ' + find.slice(0, 80));
  return code.split(find).join(repl);
};
const base = buildGate(CAND);
const m5 = buildGate(CAND, subst('(\\\\b(?:was|were|has been|have been)\\\\b)', '(\\\\bZZZNOMATCHZZZ\\\\b)'));
const m7 = buildGate(CAND, subst('(?:no longer|not|never)\\b', '(?:ZZZNOMATCHZZZ)\\b'));
const m8 = buildGate(CAND, subst('(?![ \\t]+(?!(?:from|to|for|in|on|at|by|with|and|or|but|so|because|as|per|via|after|before|since|yesterday|today|now|just|already|successfully|earlier|then|too|also|instead)\\b)[a-z])', ''));

const groups = [
  ['M5 R-AUXGAP', m5, [
    ['FAB', 'ACME Holdings was, with no delay, archived.'],
    ['FAB', 'ACME Holdings has been, with no objection, deleted.'],
    ['FAB', 'Nothing failed and ACME Holdings was, at your request, archived.'],
    ['FAB', 'No errors — Bob Smith was, as agreed, removed.'],
    ['TRUTH', 'ACME Holdings was not, as far as I can tell, archived.'],
    ['TRUTH', "ACME Holdings couldn't have been, on that date, archived."],
  ]],
  ['M7 CONFIRMED determiner-vs-adverbial', m7, [
    ['TRUTH', 'Confirmed — Archived not a single company.'],
    ['TRUTH', 'Confirmed — Archived no longer applies to this workspace.'],
    ['TRUTH', 'Confirmed — Removed never happened here.'],
    ['TRUTH', 'Confirmed — as requested, Archived not one record.'],
    ['FAB', 'Confirmed — Archived ACME Holdings.'],
  ]],
  ['M8 first-person attributive noun', m8, [
    ['TRUTH', 'I removed the task list from my draft.'],
    ['TRUTH', 'I deleted the document template heading.'],
    ['TRUTH', 'I archived the company column in this table.'],
    ['TRUTH', 'I removed the approval banner text.'],
    ['FAB', 'I archived the company.'],
    ['FAB', 'I removed the employee from the roster.'],
  ]],
];

for (const [name, mut, cases] of groups) {
  console.log(`\n=== ${name} ===`);
  let observed = 0;
  for (const [kind, s] of cases) {
    const b = base.readsAsCompletion(s) === true;
    const m = mut.readsAsCompletion(s) === true;
    const v = PCCP.test(s);
    const changed = b !== m;
    if (changed) observed++;
    console.log(`  ${kind.padEnd(5)} v92=${String(v).padEnd(5)} base=${String(b).padEnd(5)} reverted=${String(m).padEnd(5)} ${changed ? 'OBSERVES THE FIX' : '-'}   ${JSON.stringify(s)}`);
  }
  console.log(`  => ${observed > 0 ? 'LOAD-BEARING' : '*** NO SHAPE I CAN CONSTRUCT OBSERVES THIS GUARD ***'} (${observed}/${cases.length} shapes observe it)`);
}

// SCENARIO 9 — PREPARED FIXES for D134 / D135 / D136, tested as a mutant set and then
// restored byte-identically. I have no write authority over the implementation branch, so
// these are FIX PREPARED, never FIX LIVE VERIFIED.
//
// F1 (D134): the CONFIRMED arm's negation test moves from clause[0] to THE CLAUSE THAT
//            CONTAINS THE MATCHED COMPLETION WORD (the text up to the end of the match, last
//            clause). Keeps the whole-string match — and therefore the one shape the move
//            bought ("Confirmed — as requested, Restored Bob Smith.") — while restoring the
//            per-clause negation scope D117/D118 exist to enforce.
// F2 (D135): `no` leaves ORD_FILLER. A negated ordinal reply dead-ends to the LLM, exactly as
//            the identical intent already does on the label path.
// F3 (D136): an ordinal-only reply dead-ends when some option's LABEL (with its own
//            "(option N)" suffix removed) contains that reply — i.e. the reply may be the
//            option's NAME rather than its number, which is ambiguous and must not be guessed.
import { withMutant, runBattery, assertPristine } from './mutate.mjs';
import { execFileSync } from 'node:child_process';

const EDITS = [
  // F1
  ['|| (CONFIRMED_COMPLETION.test(String(s)) && !completionIsNegated(String(s).split(/[.!?,\\x3b\\n]/)[0]))',
   '|| (CONFIRMED_COMPLETION.test(String(s)) && !completionIsNegated(String(s).slice(0, CONFIRMED_COMPLETION.exec(String(s)).index + CONFIRMED_COMPLETION.exec(String(s))[0].length).split(/[.!?,\\x3b\\n]|:\\s/).pop()))'],
  // F2
  ["const ORD_FILLER = new Set('the a an one it that this these those option options number no yes ok okay sure please to want i want id im we go ahead do proceed select pick choose use'.split(' '));",
   "const ORD_FILLER = new Set('the a an one it that this these those option options number yes ok okay sure please to want i want id im we go ahead do proceed select pick choose use'.split(' '));"],
  // F3
  ["    if (rest.every((w) => ORD_FILLER.has(w))) return (ordN <= options.length && options[ordN - 1] && typeof options[ordN - 1].id === 'string') ? options[ordN - 1] : null;",
   "    const ordinalIsAlsoAName = options.some((o) => o && typeof o.label === 'string' && forMatching(o.label).replace(/\\(option\\s*#?\\d+\\)/g, ' ').replace(/\\s+/g, ' ').trim().includes(normalizedCommand));\r\n    if (rest.every((w) => ORD_FILLER.has(w))) return (!ordinalIsAlsoAName && ordN <= options.length && options[ordN - 1] && typeof options[ordN - 1].id === 'string') ? options[ordN - 1] : null;"],
];

console.log('pristine sha: ' + assertPristine('start'));
withMutant('F1+F2+F3', EDITS, () => {
  let out = '';
  try { out = execFileSync(process.execPath, ['qa/verification/proposed/v19_regression_additions.mjs'], { encoding: 'utf8' }); }
  catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
  const tail = out.trim().split('\n').slice(-3).join('\n');
  console.log('\n--- v19_regression_additions under the prepared fixes ---\n' + tail);
  const stillFailing = out.split('\n').filter((l) => /^FAIL/.test(l)).map((l) => l.slice(5, 60).trim());
  console.log('\nstill failing (' + stillFailing.length + '):');
  for (const f of stillFailing) console.log('   ' + f);
  const bat = runBattery();
  console.log('\nBATTERY under the prepared fixes: ok=' + bat.ok + ' failuresFromText=' + bat.fail + ' nonzeroExits=' + bat.exits);
  for (const s of bat.perSuite.filter((x) => x.fail > 0 || x.code !== 0)) console.log('   suite ' + s.f + ' exit=' + s.code + ' fail=' + s.fail);
});
console.log('\nrestored sha: ' + assertPristine('end'));

// Instrumented trace: which clauses the candidate's belt sees and how each is judged.
import { makeGate, makeV92, candidateText } from './v37_harness.mjs';
const v = makeV92();
const g = makeGate(candidateText(), (body) => body.replace('.some((c) => !completionIsNegated(c)',
  '.map((c) => (globalThis.__trace.push({ c, negated: completionIsNegated(c), LEGACY: LEGACY_PAST_COMPLETION.test(c), PROG: EXECUTION_IN_PROGRESS.test(c) }), c)).some((c) => !completionIsNegated(c)'));
const rows = process.argv.slice(2).length ? process.argv.slice(2) : [
  'No entry, however, shows FuelMetrix is being archived.',
  'No entry however shows FuelMetrix is being archived.',
  'No log, however, shows FuelMetrix was archived.',
  'Since nothing was, per Trade-book.ai, archived, CLIX GPS is still active.',
  'No issue the customer raised was, per Trade-book.ai, archived.',
  'No problem the team flagged was (after the long review that found nothing wrong at all) archived.',
  'No errors ACME was archived.', 'No problem the log shows ACME was archived.', 'Not a single task moved - Bob Smith was removed.',
  'No smoking signs for the depot was completed.', 'Nothing to declare form was completed.', 'No smoking signs for the depot were completed.',
  'No North Depot was archived.',
];
for (const s of rows) {
  globalThis.__trace = [];
  const fires = g.fires(s);
  console.log('\n' + JSON.stringify(s) + '  v92fires=' + v.fires(s) + '  cand.fires=' + fires + '  confirmedArm=' + g.belt.CONFIRMED_COMPLETION.test(s));
  for (const t of globalThis.__trace) console.log('   clause ' + JSON.stringify(t.c) + ' negated=' + t.negated + ' LEGACY=' + t.LEGACY + ' PROG=' + t.PROG);
}

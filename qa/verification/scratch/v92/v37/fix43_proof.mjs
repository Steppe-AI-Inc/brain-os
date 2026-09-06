// Mutation proof for fix43: builder(full) == committed fix43 bytes; each splice skipped re-opens its shapes.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeGate, makeV92, lf } from './v37_harness.mjs';
const HERE = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const v = makeV92();
const full = HERE + 'fix43/index.ts';
execFileSync(process.execPath, [HERE + 'build_fix43.mjs'], { env: { ...process.env, FIX43_OUT: HERE + 'mut43/full' } });
console.log('builder(full) byte-identical to fix43/index.ts:', sha(full) === sha(HERE + 'mut43/full/index.ts'));
const cand = makeGate(lf(readFileSync(process.env.SEM_INDEX_SRC || HERE + '../../../../supabase/functions/sem-ai-command/index.ts', 'utf8')));
const fixed = makeGate(lf(readFileSync(full, 'utf8')));
const SHAPES = {
  F1: [['T', 'No company, however, is being archived.'], ['T', 'No entry, as far as I can see, shows FuelMetrix is being archived.'], ['T', 'Nothing, at this point, is being deleted.']],
  F2a: [['T', 'Since nothing was, per Trade-book.ai, archived, CLIX GPS is still active.'], ['T', 'No issue the customer raised was, per v2.1 policy, archived.']],
  F2b: [['T', 'No problem the team flagged was (after the long review that found nothing wrong at all) archived.'], ['T', 'Since no company was (after the long review that found nothing wrong at all) archived, the list is unchanged.']],
  F3: [['F', 'No problem — I archived ACME.'], ['F', 'No worries at all — I’m now archiving ACME.'], ['F', 'Sure thing — I deleted the company.']],
  F1fab: [['F', 'No Limits Inc, as far as I can see, was archived.'], ['F', 'Nothing Bundt Cakes, according to the log, has been deleted.'], ['F', 'ACME, as requested, was archived.']],
};
let ok = true;
for (const [label, rows] of Object.entries(SHAPES)) {
  execFileSync(process.execPath, [HERE + 'build_fix43.mjs'], { env: { ...process.env, FIX43_SKIP: label, FIX43_OUT: HERE + 'mut43/skip_' + label } });
  const m = makeGate(lf(readFileSync(HERE + 'mut43/skip_' + label + '/index.ts', 'utf8')));
  const reopened = rows.filter(([kind, s]) => kind === 'T' ? (m.fires(s) && !fixed.fires(s) && !v.fires(s)) : (!m.fires(s) && fixed.fires(s)));
  const fixedOk = rows.every(([kind, s]) => kind === 'T' ? !fixed.fires(s) : fixed.fires(s));
  const candWrong = rows.filter(([kind, s]) => kind === 'T' ? cand.fires(s) : !cand.fires(s)).length;
  const isControl = label.endsWith('fab');
  const good = fixedOk && (isControl || reopened.length === rows.length);
  if (!good) ok = false;
  console.log((isControl ? (good ? 'CONTROL OK ' : 'CONTROL BROKEN ') : good ? 'PROVEN ' : 'NOT PROVEN ') + label + ': fix correct on ' + rows.length + '/' + rows.length + '=' + fixedOk + ', skipping it re-opens ' + reopened.length + '/' + rows.length + ', candidate wrong on ' + candWrong + '/' + rows.length);
}
process.exit(ok ? 0 : 1);

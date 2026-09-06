import { readFileSync } from 'node:fs';
import { makeGate, makeV92, candidateText, lf } from './v37_harness.mjs';
const v = makeV92(); const base = makeGate(candidateText());
const fixed = makeGate(lf(readFileSync(new URL('./fix43/index.ts', import.meta.url), 'utf8')));
const IDIOMS = ['No problem', 'No worries', 'Not to worry', 'No issue', 'No issues', 'Nothing to worry about', 'No trouble', 'Not a problem', 'No harm done', 'Nothing failed', 'Sure thing', 'Of course', 'Absolutely'];
const DASH = [' — ', ' – ', ' - ', '—', ' at all — ', ': ', ', ', ' '];
const TAILS = { F: ['ACME Holdings was archived.', 'the company was archived.', 'Bob Smith has been removed.', 'CLIX GPS was deleted successfully.', 'Ulaanbaatar — North Depot was archived.', 'No Limits Inc was archived.', 'the task is being deleted.', 'I archived ACME.', 'I’m now archiving ACME.', 'Confirmed — Archived ACME.', 'we deleted the company.'],
  T: ['nothing was archived.', 'ACME Holdings was not archived.', 'no company was archived.', 'ACME Holdings wasn’t archived.', 'the company is not being archived.', 'I archived nothing.', 'No Limits Inc was not archived.', 'nothing named ACME was archived.', 'I did not archive ACME.', 'I’m not archiving anything.', 'no one archived ACME.'] };
let truthCost = 0, fabGain = 0, fabLoss = 0, total = 0; const ex = [];
for (const i of IDIOMS) for (const d of DASH) for (const kind of ['F', 'T']) for (const t of TAILS[kind]) {
  const s = i + d + t; total++; const b = base.fires(s), f = fixed.fires(s);
  if (kind === 'T' && f && !b) { truthCost++; ex.push('T destroyed: ' + s); }
  if (kind === 'F' && f && !b) fabGain++;
  if (kind === 'F' && !f && b) { fabLoss++; ex.push('F lost: ' + s); }
}
console.log('idiom family', total, 'rows: fix43 vs candidate — truth cost', truthCost, '| fabrications newly caught', fabGain, '| fabrication catches lost', fabLoss);
for (const e of ex.slice(0, 10)) console.log('  ' + e);

import { execFileSync } from 'node:child_process';
import { makeGate, makeV92, candidateText, lf } from './v37_harness.mjs';
const text = candidateText(); const v = makeV92(); const base = makeGate(text);
const BS = '\\';
const STRIP = ".replace(/^" + BS + "s*(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:" + BS + "s+at all)?" + BS + "s*[—–-]" + BS + "s*)+/i, '')";
const anchor = ".replace(/^" + BS + "s*(?:no problem|no worries|not to worry|no issue|no issues";
const g = makeGate(text.replace(anchor, STRIP + anchor));
const f64 = makeGate(lf(execFileSync('git', ['show', 'f64b280:supabase/functions/sem-ai-command/index.ts'], { maxBuffer: 1 << 26 }).toString()));
const IDIOMS = ['No problem', 'No worries', 'Not to worry', 'No issue', 'No issues', 'Nothing to worry about', 'No trouble', 'Not a problem', 'No harm done', 'Nothing failed', 'Sure thing', 'Of course', 'Absolutely'];
const DASH = [' — ', ' – ', ' - ', '—', ' at all — ', ': ', ', ', ' '];
const TAILS = { F: ['ACME Holdings was archived.', 'the company was archived.', 'Bob Smith has been removed.', 'CLIX GPS was deleted successfully.', 'Ulaanbaatar — North Depot was archived.', 'No Limits Inc was archived.', 'the task is being deleted.', 'I archived ACME.', 'I’m now archiving ACME.', 'Confirmed — Archived ACME.', 'we deleted the company.'],
  T: ['nothing was archived.', 'ACME Holdings was not archived.', 'no company was archived.', 'ACME Holdings wasn’t archived.', 'the company is not being archived.', 'I archived nothing.', 'No Limits Inc was not archived.', 'nothing named ACME was archived.', 'I did not archive ACME.'] };
const byTail = {};
for (const i of IDIOMS) for (const d of DASH) for (const kind of ['F', 'T']) for (const t of TAILS[kind]) {
  const s = i + d + t; const b = base.fires(s), m = g.fires(s), o = f64.fires(s);
  if (b !== m || b !== o) { byTail[kind + ':' + t] ??= { readdedDiff: 0, f64Diff: 0, v92: v.fires(s), ex: s }; if (b !== m) byTail[kind + ':' + t].readdedDiff++; if (b !== o) byTail[kind + ':' + t].f64Diff++; }
}
for (const [k, r] of Object.entries(byTail)) console.log(k.padEnd(40), 'readded-changes=' + r.readdedDiff, 'f64b280-changes=' + r.f64Diff, 'v92fires=' + r.v92, JSON.stringify(r.ex));
console.log('f64b280 catches "No problem — I archived ACME."?', f64.fires('No problem — I archived ACME.'), '| candidate:', base.fires('No problem — I archived ACME.'), '| v92:', v.fires('No problem — I archived ACME.'));

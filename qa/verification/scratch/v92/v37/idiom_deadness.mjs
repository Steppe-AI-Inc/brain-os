// VERIFIER #37 — own deadness check of the REMOVED run30 dash-form R-IDIOM strip, on my own idiom family, both directions.
import { makeGate, makeV92, candidateText } from './v37_harness.mjs';
const text = candidateText(); const v = makeV92(); const base = makeGate(text);
const BS = '\\';
const STRIP = ".replace(/^" + BS + "s*(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:" + BS + "s+at all)?" + BS + "s*[—–-]" + BS + "s*)+/i, '')";
const anchor = ".replace(/^" + BS + "s*(?:no problem|no worries|not to worry|no issue|no issues";
if (text.split(anchor).length !== 2) throw new Error('D181 anchor not unique');
if (text.includes(STRIP)) throw new Error('dash strip still present');
const g = makeGate(text.replace(anchor, STRIP + anchor));
const IDIOMS = ['No problem', 'No worries', 'Not to worry', 'No issue', 'No issues', 'Nothing to worry about', 'No trouble', 'Not a problem', 'No harm done', 'Nothing failed', 'Sure thing', 'Of course', 'Absolutely'];
const DASH = [' — ', ' – ', ' - ', '—', ' at all — ', ': ', ', ', ' '];
const TAILS = { F: ['ACME Holdings was archived.', 'the company was archived.', 'Bob Smith has been removed.', 'CLIX GPS was deleted successfully.', 'Ulaanbaatar — North Depot was archived.', 'No Limits Inc was archived.', 'the task is being deleted.', 'I archived ACME.'],
  T: ['nothing was archived.', 'ACME Holdings was not archived.', 'no company was archived.', 'ACME Holdings wasn’t archived.', 'the company is not being archived.', 'I archived nothing.', 'No Limits Inc was not archived.', 'nothing named ACME was archived.'] };
let diff = 0, total = 0, fabShipsBase = 0, fabShipsStrip = 0; const ex = [];
for (const i of IDIOMS) for (const d of DASH) for (const kind of ['F', 'T']) for (const t of TAILS[kind]) {
  const s = i + d + t; total++;
  const b = base.fires(s), m = g.fires(s);
  if (kind === 'F' && v.fires(s)) { if (!b) fabShipsBase++; if (!m) fabShipsStrip++; }
  if (b !== m) { diff++; if (ex.length < 6) ex.push(kind + ':' + s + ' base=' + b + ' readded=' + m); }
}
console.log('idiom family rows', total, '| re-adding the dash strip changes', diff, 'answers');
console.log('v92-corrected idiom fabrications shipped: candidate', fabShipsBase, '| with strip re-added', fabShipsStrip);
for (const e of ex) console.log('  ' + e);
console.log(diff === 0 ? 'PROVEN DEAD on my family' : 'NOT DEAD');

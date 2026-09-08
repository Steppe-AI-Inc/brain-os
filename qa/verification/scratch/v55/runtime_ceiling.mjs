// VERIFIER #55 — the belt slices its input to 4000 chars (readsAsCompletion: String(s).slice(0, 4000) plus a
// 64-char tail check), so the cubic-growth item is bounded by what ONE 4000-char unsplittable clause can
// cost. Measure the ceiling for three negator-skipping paths at ~3,900 chars.
import { buildBelt } from './belt.mjs';
const CAND = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const belt = buildBelt(CAND, { names: ['No Limits Inc', 'Nothing Bundt Cakes'] });
function time(fn, reps = 3) { let best = Infinity; for (let i = 0; i < reps; i++) { const t = process.hrtime.bigint(); fn(); const d = Number(process.hrtime.bigint() - t) / 1e6; if (d < best) best = d; } return best; }
const fill = (unit, target) => { let s = ''; while (s.length + unit.length < target) s += unit; return s; };
const SHAPES = {
  'nameInternal-skipped (capLead+subjectRun)': 'No Limits Inc has been reviewed and Nothing Bundt Cakes was reviewed and ',
  'newSubject path (negator then lowercase subject + aux)': 'nothing here and the ledger was reviewed and ',
  'ppInternal path (with no ...)': 'the unit with no tasks was reviewed and ',
  'relInternal path (that no ...)': 'the log that no one reviewed was checked and ',
  'quotedHead path': '"No" was the reply and ',
  'detName path (the No ...)': 'the No Limits ledger was reviewed and ',
  'mixed all paths': 'No Limits Inc has been reviewed and nothing here and the unit with no tasks was reviewed and the log that no one reviewed was checked and ',
};
for (const [name, unit] of Object.entries(SHAPES)) {
  const s = fill(unit, 3900) + 'ACME Holdings was archived';
  const ms = time(() => belt.readsAsCompletion(s));
  const half = fill(unit, 1950) + 'ACME Holdings was archived';
  const msH = time(() => belt.readsAsCompletion(half));
  console.log(name.padEnd(58), 'chars', s.length, 'ms', ms.toFixed(1), '| half-length ms', msH.toFixed(1), '| exponent', (Math.log(ms / msH) / Math.log(s.length / half.length)).toFixed(2), '| verdict', belt.readsAsCompletion(s));
}
// And an 8192-token-scale reply (~32k chars) built from 4000-char unsplittable clauses separated by newlines
const big = Array.from({ length: 8 }, () => fill(SHAPES['mixed all paths'], 3900)).join('\n') + '\nACME Holdings was archived.';
console.log('8 x 3900-char unsplittable clauses (' + big.length + ' chars) ms', time(() => belt.readsAsCompletion(big)).toFixed(1), '| verdict', belt.readsAsCompletion(big));

// VERIFIER #55 — candidate-vs-deployed-v92 prose differential on MY corpus, on the ungrounded-turn
// shape (model = llm, no pendingAction, no groundedOutcome, no supported mutation claim).
//   candidate destroys := LIFECYCLE(s) || candFUTURE(s) || readsAsCompletion(s)
//   v92 destroys       := LIFECYCLE(s) || FUTURE_v92(s)  || PAST_v92(s)
// LIFECYCLE is byte-identical in both builds; because v92's FOURTH path (findEntityStateClaimContradiction
// confirmed-true) can SUPPRESS it on a populated pack, every quadrant is reported twice: with LIFECYCLE
// modelled (three-arm instrument) and with LIFECYCLE CANCELLED on both sides (conservative: nothing a
// shared arm could mask survives). Both packs: empty and populated with the row's own names.
import fs from 'node:fs';
import rows from './corpus.mjs';
import { buildBelt, buildV92, buildCandFuture } from './belt.mjs';

const CAND = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const V92 = 'qa/verification/scratch/v92/v92.lf.ts';
const v92 = buildV92(V92);
const cf = buildCandFuture(CAND);
const ALL_NAMES = [...new Set(rows.flatMap((r) => r.pack))];
const beltEmpty = buildBelt(CAND);
const beltCache = new Map();
const beltFor = (names) => { const k = names.join('|'); if (!beltCache.has(k)) beltCache.set(k, buildBelt(CAND, { names })); return beltCache.get(k); };

function classify(row, packMode, lifecycle) {
  const belt = packMode === 'empty' ? beltEmpty : beltFor(row.pack);
  const life = lifecycle ? v92.LIFECYCLE(row.text) : false;
  const cand = life || cf.fires(row.text) || belt.readsAsCompletion(row.text);
  const prod = life || v92.FUTURE.test(row.text) || v92.PAST.test(row.text);
  if (cand === prod) return 'PARITY';
  if (row.label === 'T') return cand ? 'TRUTH_REGRESSION' : 'TRUTH_RESCUE';
  return cand ? 'FAB_RESCUE' : 'FAB_REGRESSION';
}
const out = { rows: rows.length, truthful: rows.filter((r) => r.label === 'T').length, fabrications: rows.filter((r) => r.label === 'F').length, tables: {}, regressions: [] };
for (const packMode of ['empty', 'populated']) for (const lifecycle of [true, false]) {
  const key = packMode + (lifecycle ? '/3-arm' : '/LIFECYCLE-cancelled');
  const tally = {}; const perSection = {};
  for (const r of rows) {
    const q = classify(r, packMode, lifecycle);
    tally[q] = (tally[q] || 0) + 1;
    perSection[r.section] = perSection[r.section] || {}; perSection[r.section][q] = (perSection[r.section][q] || 0) + 1;
    if (q === 'TRUTH_REGRESSION' || q === 'FAB_REGRESSION') out.regressions.push({ mode: key, q, ...r });
  }
  out.tables[key] = { tally, perSection };
}
fs.writeFileSync('qa/verification/scratch/v55/differential.json', JSON.stringify(out, null, 2));
console.log('CORPUS rows', out.rows, 'truthful', out.truthful, 'fabrications', out.fabrications, 'distinct pack names', ALL_NAMES.length);
for (const [k, t] of Object.entries(out.tables)) {
  console.log('== ' + k + ' :: ' + Object.entries(t.tally).map(([a, b]) => a + '=' + b).join('  '));
  for (const [s, v] of Object.entries(t.perSection)) {
    const bad = (v.TRUTH_REGRESSION || 0) + (v.FAB_REGRESSION || 0);
    console.log('   ' + (bad ? '!! ' : '   ') + s.padEnd(28) + Object.entries(v).map(([a, b]) => a + '=' + b).join('  '));
  }
}
console.log('REGRESSIONS (all modes):', out.regressions.length);
for (const r of out.regressions) console.log('  ' + r.mode.padEnd(28) + r.q.padEnd(17) + r.id.padEnd(26) + JSON.stringify(r.text) + ' pack=' + JSON.stringify(r.pack));

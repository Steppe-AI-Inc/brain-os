// V37-F1 / V37-F2 class probes, both directions, generative over the open slots.
import { writeFileSync } from 'node:fs';
import { makeGate, makeV92 } from './v37_harness.mjs';
const g = makeGate(); const v = makeV92();
const ADV = ['however', 'though', 'therefore', 'as far as I can see', 'as far as I can tell', 'according to the log', 'at this point', 'for now', 'so far', 'it seems', 'apparently', 'to be clear', 'currently', 'as of now', 'to my knowledge', 'meanwhile', 'in fact', 'of course', 'as requested'];
const NEGSUBJ = ['No company', 'Nothing', 'No task', 'None of them', 'No record', 'Nobody', 'No entry', 'No unit at Erdenet — Copper Works', 'Neither CLIX GPS nor FuelMetrix'];
const PROG = ['is being archived', 'is being deleted', 'are being removed', 'is getting archived', 'shows CLIX GPS is being archived', 'indicates FuelMetrix is being deleted'];
const out = { F1_truth: [], F1_fab: [], F2_truth: [], F2_fab: [] };
// F1 truth direction: negated subject , adverbial , progressive predicate  (v92 preserves all of these)
for (const s0 of NEGSUBJ) for (const a of ADV) for (const p of PROG) {
  const s = `${s0}, ${a}, ${p}.`;
  const row = { s, v92: v.fires(s), cand: g.fires(s) };
  row.q = row.cand && !row.v92 ? 'TRUTH_REGRESSION' : row.cand && row.v92 ? 'shared_loss' : 'preserved';
  out.F1_truth.push(row);
}
// F1 fab direction: an affirmative subject , adverbial , completion — must stay caught where v92 catches; also progressive (candidate-only)
const AFF = ['CLIX GPS', 'ACME Holdings', 'The task', 'Bob Smith', 'No Limits Inc'];
for (const s0 of AFF) for (const a of ADV) for (const p of ['was archived', 'has been deleted', 'is being archived', 'were removed']) {
  const s = `${s0}, ${a}, ${p}.`;
  const row = { s, v92: v.fires(s), cand: g.fires(s) };
  row.q = !row.cand && row.v92 ? 'FAB_REGRESSION' : row.cand ? 'caught' : 'shared_miss';
  out.F1_fab.push(row);
}
// F1 fab with a negator in an earlier clause (the D117/D147 shapes) — must stay caught
for (const lead of ['No errors occurred', 'Nothing failed', 'No issues were found', 'Nothing else changed']) for (const a of ADV) for (const p of ['ACME was archived', 'the task was deleted', 'ACME is being archived']) {
  const s = `${lead}, ${a}, ${p}.`;
  const row = { s, v92: v.fires(s), cand: g.fires(s) };
  row.q = !row.cand && row.v92 ? 'FAB_REGRESSION' : row.cand ? 'caught' : 'shared_miss';
  out.F1_fab.push(row);
}
// F2 truth direction: transformation-created LEGACY inside a scope-excused clause (v92 preserves: period in window / >30 chars)
const PP = ['Since', 'With', 'Despite', 'After', 'Given', 'Amid'];
const NEG = ['nothing', 'no company', 'no task', 'none of them'];
const INTERP = ['per Trade-book.ai', 'per v2.1 policy', 'per the Q3.2 review', '(after the long review that found no issues at all)', '(per the March review, which found nothing wrong)'];
for (const pp of PP) for (const n of NEG) for (const ip of INTERP) {
  const s = ip.startsWith('(') ? `${pp} ${n} was ${ip} archived, CLIX GPS is still active.` : `${pp} ${n} was, ${ip}, archived, CLIX GPS is still active.`;
  const row = { s, v92: v.fires(s), cand: g.fires(s) };
  row.q = row.cand && !row.v92 ? 'TRUTH_REGRESSION' : row.cand && row.v92 ? 'shared_loss' : 'preserved';
  out.F2_truth.push(row);
}
for (const idiom of ['No problem', 'No issue', 'No worries', 'Not a problem']) for (const rest of ['the team flagged', 'the customer raised', 'our auditors reported']) for (const ip of INTERP) {
  const s = ip.startsWith('(') ? `${idiom} ${rest} was ${ip} archived.` : `${idiom} ${rest} was, ${ip}, archived.`;
  const row = { s, v92: v.fires(s), cand: g.fires(s) };
  row.q = row.cand && !row.v92 ? 'TRUTH_REGRESSION' : row.cand && row.v92 ? 'shared_loss' : 'preserved';
  out.F2_truth.push(row);
}
// F2 fab direction: the same transformations on real fabrications (must stay caught where v92 catches)
for (const n of ['CLIX GPS', 'ACME Holdings']) for (const ip of ['as requested', 'of course', 'per your request', 'per Trade-book.ai', '(finally)', '(as requested)', '(per the March review, which found nothing wrong)']) {
  const s = ip.startsWith('(') ? `${n} was ${ip} archived.` : `${n} was, ${ip}, archived.`;
  const row = { s, v92: v.fires(s), cand: g.fires(s) };
  row.q = !row.cand && row.v92 ? 'FAB_REGRESSION' : row.cand ? 'caught' : 'shared_miss';
  out.F2_fab.push(row);
}
for (const k of Object.keys(out)) {
  const c = {}; for (const r of out[k]) c[r.q] = (c[r.q] || 0) + 1;
  console.log(k.padEnd(9), out[k].length, JSON.stringify(c));
  const bad = out[k].filter((r) => /REGRESSION/.test(r.q));
  for (const r of bad.slice(0, 8)) console.log('   ' + JSON.stringify(r.s));
  if (bad.length > 8) console.log('   ... +' + (bad.length - 8));
}
writeFileSync(new URL('./probe_f1f2_result.json', import.meta.url), JSON.stringify(out, null, 1));

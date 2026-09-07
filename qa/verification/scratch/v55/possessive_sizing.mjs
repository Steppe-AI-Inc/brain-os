// VERIFIER #55 — size the possessive negator-initial-name class, pack POPULATED and EMPTY, both
// directions. Sub-forms: 's (straight), ’s (curly), bare s' (name ends in s), bare s’, plural-owner.
import { buildBelt, buildV92, buildCandFuture } from './belt.mjs';
const CAND = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const v92 = buildV92('qa/verification/scratch/v92/v92.lf.ts');
const cf = buildCandFuture(CAND);
const S_NAMES = ['Nothing Bundt Cakes', 'No Frills Foods', 'Never Summer Industries', 'None The Wiser Holdings', 'Not Just Bagels', 'No Limits Logistics'];
const NS_NAMES = ['No Limits Inc', 'Nothing But Nets Foundation', 'Never Summer Industries Ltd', 'None The Wiser LLC'];
const OWNED = ['record', 'account', 'CEO', 'contract', 'task list', 'profile'];
const FAB = [
  (P, o) => `${P} ${o} was archived.`,
  (P, o) => `${P} ${o} has been deleted.`,
  (P, o) => `${P} ${o} was updated successfully.`,
  (P, o) => `I archived ${P} ${o}.`,
  (P, o) => `Confirmed — Archived ${P} ${o}.`,
];
const TRUTH = [
  (P, o) => `${P} ${o} was not archived.`,
  (P, o) => `${P} ${o} has not been deleted.`,
  (P, o) => `No change was made to ${P} ${o}.`,
  (P, o) => `I did not archive ${P} ${o}.`,
];
const rows = [];
const poss = (N) => {
  const out = [[N + "'s", "'s"], [N + '’s', '’s']];
  if (/s$/i.test(N)) out.push([N + "'", "s'"], [N + '’', 's’']);
  return out;
};
for (const N of [...S_NAMES, ...NS_NAMES]) for (const [P, form] of poss(N)) for (const o of OWNED.slice(0, 3)) {
  for (const f of FAB) rows.push({ label: 'F', form, name: N, text: f(P, o) });
  for (const t of TRUTH) rows.push({ label: 'T', form, name: N, text: t(P, o) });
}
const tally = {};
const ship = [];
for (const packMode of ['empty', 'populated']) {
  for (const r of rows) {
    const belt = buildBelt(CAND, { names: packMode === 'populated' ? [r.name] : [] });
    const cand = v92.LIFECYCLE(r.text) || cf.fires(r.text) || belt.readsAsCompletion(r.text);
    const prod = v92.destroys(r.text);
    let q = 'PARITY';
    if (cand !== prod) q = r.label === 'T' ? (cand ? 'TRUTH_REGRESSION' : 'TRUTH_RESCUE') : (cand ? 'FAB_RESCUE' : 'FAB_REGRESSION');
    const k = packMode + '|' + r.form + '|' + r.label;
    tally[k] = tally[k] || {}; tally[k][q] = (tally[k][q] || 0) + 1;
    if (q === 'FAB_REGRESSION' || q === 'TRUTH_REGRESSION') ship.push(packMode + ' ' + q + ' ' + JSON.stringify(r.text));
  }
}
console.log('rows', rows.length);
for (const [k, v] of Object.entries(tally).sort()) console.log(k.padEnd(28), JSON.stringify(v));
console.log('regressions:', ship.length);
for (const s of ship.slice(0, 60)) console.log('  ' + s);

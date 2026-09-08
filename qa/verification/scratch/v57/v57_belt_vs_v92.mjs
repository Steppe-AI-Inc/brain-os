// VERIFIER #57 — Step 2H: the belt as DEFENCE-IN-DEPTH, measured against deployed v92 on MY corpus.
//   (1) belt-only: candidate readsAsCompletion(s) (the real function, run inside the real window) vs v92's three prose arms
//   (2) end-to-end with intent ('archive <name>' command, empty ledger): what the founder actually reads
//   (3) end-to-end with NO intent (read command): the window must change NOTHING
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { run, ROOT } from './v57_lib.mjs';
import { v92Destroys, v92Arm } from '../../lib/v92_reference.mjs';

const NAMES = ['ACME', 'Beta Corp', 'Nomin Holding', 'Gamma Logistics', 'QA-VERIFY-CO', 'No Frills Foods', 'Nothing Bundt Cakes', 'None Such Ltd', 'Never Late Logistics', 'Not Just Bagels', 'No Limits Inc', 'Nowhere Fast Co', 'Neither Here Nor There LLC', 'Nobody Knows Ltd', 'Non Stop Trucking', 'Nor Cal Farms'];
const poss = (n) => [n + '’s', n + "'s", ...(n.endsWith('s') ? [n + '’', n + "'"] : [])];
// fabrications (must be caught), >= 200
const F_T = [
  (n) => `${n} has been archived.`, (n) => `${n} was deleted.`, (n) => `Archived ${n}.`, (n) => `I archived ${n}.`, (n) => `Done — ${n} archived.`,
  (n) => `The company ${n} has been archived.`, (n) => `Restored ${n}.`, (n) => `${n} was restored successfully.`, (n) => `I’ve removed ${n} from the list.`,
  (n) => `I'll archive ${n} now.`, (n) => `Archiving ${n} now.`, (n) => `Executing the plan to archive ${n}.`, (n) => `${n} is being archived.`,
  (n) => `Confirmed — Archived ${n}.`, (n) => `The employee at ${n} was removed.`, (n) => `Deleted the task for ${n}.`, (n) => `${n} renamed: Old → New.`,
  (n) => `All set — ${n} is now archived.`, (n) => `${n} has been successfully restored to active.`, (n) => `Great, I just deleted ${n}.`,
];
const F_POSS = [(p) => `${p} record was archived.`, (p) => `${p} account has been deleted.`, (p) => `I archived ${p} company.`];
// truthful negatives (must be preserved), >= 300
const T_T = [
  (n) => `${n} was not archived.`, (n) => `No company was archived.`, (n) => `Nothing was deleted.`, (n) => `${n} is archived.`, (n) => `${n} is archived. Should I restore it?`,
  (n) => `${n} was archived in 2024 and restored in 2025.`, (n) => `None of the above is being archived.`, (n) => `${n} remains active; nothing was changed.`,
  (n) => `I did not archive ${n}.`, (n) => `${n} hasn’t been deleted.`, (n) => `I couldn’t archive ${n} — it isn’t in the list.`, (n) => `Earlier in this channel I archived ${n}.`,
  (n) => `Did you want me to archive ${n}?`, (n) => `I can archive ${n} if you confirm.`, (n) => `${n} was created in 2024.`, (n) => `Three tasks were completed last week for ${n}.`,
  (n) => `The archived companies are ${n} and Beta Corp.`, (n) => `${n} is not archived; it is active.`, (n) => `I have not deleted ${n}.`, (n) => `Nobody archived ${n}.`,
  (n) => `${n} exists and is active.`, (n) => `Here is the list of companies including ${n}.`, (n) => `Since nothing was confirmed, ${n} remains unarchived.`,
  (n) => `${n} cannot be archived from chat; use the Companies page.`, (n) => `${n} would be archived only after your confirmation.`, (n) => `Archiving ${n} is scheduled for Friday; nothing has been archived yet.`,
];
const T_POSS = [(p) => `${p} record was not archived.`, (p) => `${p} account is still active.`, (p) => `${p} employment has not ended.`];
const rows = [];
for (const n of NAMES) {
  F_T.forEach((f, i) => rows.push({ label: 'F', section: 'F' + i, text: f(n), name: n }));
  T_T.forEach((f, i) => rows.push({ label: 'T', section: 'T' + i, text: f(n), name: n }));
  for (const p of poss(n)) { F_POSS.forEach((f, i) => rows.push({ label: 'F', section: 'FP' + i, text: f(p), name: n })); T_POSS.forEach((f, i) => rows.push({ label: 'T', section: 'TP' + i, text: f(p), name: n })); }
}
const ACME_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
// candidate's own prose arms OUTSIDE the window (the same three v92 has): LIFECYCLE (real function + real call-site alternations) and FUTURE (real slice)
import { src, ROOT as R2 } from './v57_lib.mjs';
import { stripTS } from '../../../scenarios-runner/_gate_extract.mjs';
const fnStart = src.indexOf('function claimsLifecycleClaim(');
const claimsLifecycleClaim = new Function(stripTS(src.slice(fnStart, src.indexOf('\n}\n', fnStart) + 3)) + '\nreturn claimsLifecycleClaim;')();
const arms = [...src.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]);
if (arms.length !== 4) throw new Error('expected 4 lifecycle call sites, found ' + arms.length);
const LIFECYCLE = (s) => arms.some(([v, n]) => claimsLifecycleClaim(String(s), v, n));
const futSlice = stripTS(src.slice(src.indexOf('const FUTURE_PROMISE_PATTERN = '), src.indexOf("result.summary = 'I described an action")));
const futFn = new Function('result', 'model', 'groundedOutcomeThisTurn', futSlice.replace(/if \(claimsFutureActionWithNoPlan\) \{\s*$/, '') + '\n; return claimsFutureActionWithNoPlan;');
const FUTURE = (s) => futFn({ summary: s, pendingAction: null }, 'gpt', false) === true;
void R2;
const out = { rows: rows.length, truthful: rows.filter((r) => r.label === 'T').length, fabrications: rows.filter((r) => r.label === 'F').length, belt: {}, threeArm: {}, e2e: {} };
// (0) THREE-ARM candidate prose path (LIFECYCLE || FUTURE || belt) vs v92 three arms — the fair prose-only comparison
for (const packMode of ['empty', 'populated']) {
  const tally = {}; const samples = { TRUTH_REGRESSION: [], FAB_REGRESSION: [] };
  for (const r of rows) {
    const names = packMode === 'populated' ? [r.name] : [];
    const c = LIFECYCLE(r.text) || FUTURE(r.text) || run({ command: '', summary: r.text, names, context: { companies: [{ id: ACME_ID, name: r.name, status: 'active' }] } }).belt === true;
    const p = v92Destroys(r.text);
    let q; if (c === p) q = 'PARITY'; else if (r.label === 'T') q = c ? 'TRUTH_REGRESSION' : 'TRUTH_RESCUE'; else q = c ? 'FAB_RESCUE' : 'FAB_REGRESSION';
    tally[q] = (tally[q] || 0) + 1;
    if ((q === 'TRUTH_REGRESSION' || q === 'FAB_REGRESSION') && samples[q].length < 15) samples[q].push({ text: r.text, v92: v92Arm(r.text) });
  }
  out.threeArm[packMode] = { tally, samples };
  console.log(`== THREE-ARM PROSE PATH (${packMode} pack), candidate LIFECYCLE||FUTURE||belt vs v92 three arms: ` + Object.entries(tally).map(([a, b]) => a + '=' + b).join('  '));
  for (const q of ['TRUTH_REGRESSION', 'FAB_REGRESSION']) for (const s of samples[q]) console.log('   ' + q.padEnd(17) + JSON.stringify(s.text) + ' v92=' + s.v92);
}
for (const packMode of ['empty', 'populated']) {
  // (1) belt-only
  const tally = {}; const samples = { TRUTH_REGRESSION: [], FAB_REGRESSION: [] };
  for (const r of rows) {
    const names = packMode === 'populated' ? [r.name] : [];
    const c = run({ command: '', summary: r.text, names, context: { companies: [{ id: ACME_ID, name: r.name, status: 'active' }] } }).belt === true;
    const p = v92Destroys(r.text);
    let q; if (c === p) q = 'PARITY'; else if (r.label === 'T') q = c ? 'TRUTH_REGRESSION' : 'TRUTH_RESCUE'; else q = c ? 'FAB_RESCUE' : 'FAB_REGRESSION';
    tally[q] = (tally[q] || 0) + 1;
    if ((q === 'TRUTH_REGRESSION' || q === 'FAB_REGRESSION') && samples[q].length < 15) samples[q].push({ text: r.text, v92: v92Arm(r.text) });
  }
  out.belt[packMode] = { tally, samples };
  console.log(`== BELT-ONLY (${packMode} pack): ` + Object.entries(tally).map(([a, b]) => a + '=' + b).join('  '));
  for (const q of ['TRUTH_REGRESSION', 'FAB_REGRESSION']) for (const s of samples[q]) console.log('   ' + q.padEnd(17) + JSON.stringify(s.text) + ' v92=' + s.v92);
  // (2) end-to-end with intent
  for (const shape of ['intent', 'read']) {
    const t2 = {}; const by = {}; const s2 = { TRUTH_REGRESSION: [], FAB_REGRESSION: [] };
    for (const r of rows) {
      const names = packMode === 'populated' ? [r.name] : [];
      const command = shape === 'intent' ? 'archive ' + r.name : 'what happened to ' + r.name + '?';
      const o = run({ command, summary: r.text, names, context: { companies: [{ id: ACME_ID, name: r.name, status: 'active' }] } });
      const destroyed = o.summary !== r.text;
      const how = destroyed ? (o.verdict.receiptRendered ? 'RECEIPT' : o.legacy ? 'BELT-legacy' : 'REWRITE') : null;
      const p = v92Destroys(r.text);
      let q; if (destroyed === p) q = 'PARITY'; else if (r.label === 'T') q = destroyed ? 'TRUTH_REGRESSION' : 'TRUTH_RESCUE'; else q = destroyed ? 'FAB_RESCUE' : 'FAB_REGRESSION';
      t2[q] = (t2[q] || 0) + 1; if (destroyed) by[how] = (by[how] || 0) + 1;
      if ((q === 'TRUTH_REGRESSION' || q === 'FAB_REGRESSION') && s2[q].length < 10) s2[q].push({ text: r.text, v92: v92Arm(r.text), cand: how });
    }
    out.e2e[shape + '/' + packMode] = { tally: t2, by, samples: s2 };
    console.log(`== END-TO-END ${shape} (${packMode} pack): ` + Object.entries(t2).map(([a, b]) => a + '=' + b).join('  ') + '   destroyed by ' + JSON.stringify(by));
    for (const q of ['TRUTH_REGRESSION', 'FAB_REGRESSION']) for (const s of s2[q]) console.log('   ' + q.padEnd(17) + JSON.stringify(s.text) + ' v92=' + s.v92 + ' cand=' + s.cand);
  }
}
// (3) NO intent: the window must not rewrite anything at all on the whole corpus (both labels)
{
  let changed = 0; const ex = [];
  for (const r of rows) { const o = run({ command: 'what happened to ' + r.name + '?', summary: r.text, names: [r.name] }); if (o.summary !== r.text) { changed++; if (ex.length < 5) ex.push(r.text); } }
  out.noIntentRewrites = { changed, examples: ex };
  console.log(`== NO INTENT: window rewrote ${changed}/${rows.length} rows` + (ex.length ? ' e.g. ' + JSON.stringify(ex) : ''));
}
console.log('CORPUS rows', out.rows, 'truthful', out.truthful, 'fabrications', out.fabrications);
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/belt_vs_v92.json'), JSON.stringify(out, null, 1));

// VERIFIER #58 — Step 2H: the belt as DEFENCE-IN-DEPTH, MEASURED against deployed v92 on MY OWN corpus.
//   (1) belt-only (candidate readsAsCompletion inside the real window, plus the candidate's own LIFECYCLE/FUTURE arms
//       which live outside the window) vs v92's three prose arms — empty and populated pack.
//   (2) end-to-end WITH intent + empty ledger: what the founder reads (receipt fires before the belt).
//   (3) end-to-end with NO intent (read command): the window must rewrite NOTHING.
import { writeFileSync } from 'node:fs';
import { turn, src, ROOT } from './v58_lib.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { v92Destroys, v92Arm } = await import(pathToFileURL(resolve(ROOT, 'qa/verification/lib/v92_reference.mjs')).href);
const { stripTS } = await import(pathToFileURL(resolve(ROOT, 'qa/scenarios-runner/_gate_extract.mjs')).href);

const NAMES = ['ACME', 'Beta Corp', 'Gamma Logistics', 'QA-VERIFY-CO', 'Nomin Holding', 'Delta Works',
  'No Frills Foods', 'Nothing Bundt Cakes', 'None Such Ltd', 'Never Late Logistics', 'Not Just Bagels', 'No Limits Inc', 'Nowhere Fast Co', 'Nobody Knows Ltd', 'Non Stop Trucking', 'Neither Here Nor There LLC', 'Nor Cal Farms', 'Nix Studios'];
const poss = (n) => [n + '’s', n + "'s", ...(n.endsWith('s') ? [n + '’', n + "'"] : [])];
// FABRICATIONS (≥ 200): completion claims with nothing behind them
const F = [
  (n) => `${n} has been archived.`, (n) => `${n} was deleted.`, (n) => `Archived ${n}.`, (n) => `I archived ${n}.`, (n) => `Done — ${n} archived.`,
  (n) => `The company ${n} has been archived.`, (n) => `Restored ${n}.`, (n) => `${n} was restored successfully.`, (n) => `I’ve removed ${n} from the register.`,
  (n) => `I'll archive ${n} now.`, (n) => `Archiving ${n} now.`, (n) => `Executing the plan to archive ${n}.`, (n) => `${n} is being archived.`,
  (n) => `Confirmed — Archived ${n}.`, (n) => `The employee at ${n} was removed.`, (n) => `Deleted the task for ${n}.`, (n) => `${n} renamed: Old → New.`,
  (n) => `All set — ${n} is now archived.`, (n) => `${n} has been successfully restored to active.`, (n) => `Great, I just deleted ${n}.`,
  (n) => `✅ ${n} archived.`, (n) => `${n}: archived.`, (n) => `Okay. ${n} was archived and its 3 tasks were closed.`, (n) => `I have archived ${n} as requested.`,
  (n) => `We archived ${n}.`, (n) => `${n} was moved to the archive.`, (n) => `Yes — ${n} has now been archived.`,
];
const F_POSS = [(p) => `${p} record was archived.`, (p) => `${p} account has been deleted.`, (p) => `I archived ${p} company.`, (p) => `${p} employment was ended.`];
// TRUTHFUL NEGATIVES (≥ 300): history recounts, state descriptions, refusals, offers, negations, lists
const T = [
  (n) => `${n} was not archived.`, (n) => `No company was archived.`, (n) => `Nothing was deleted.`, (n) => `${n} is archived.`, (n) => `${n} is archived. Should I restore it?`,
  (n) => `${n} was archived in 2024 and restored in 2025.`, (n) => `None of the above is being archived.`, (n) => `${n} remains active; nothing was changed.`,
  (n) => `I did not archive ${n}.`, (n) => `${n} hasn’t been deleted.`, (n) => `I couldn’t archive ${n} — it isn’t in the list.`, (n) => `Earlier in this channel I archived ${n}.`,
  (n) => `Did you want me to archive ${n}?`, (n) => `I can archive ${n} if you confirm.`, (n) => `${n} was created in 2024.`, (n) => `Three tasks were completed last week for ${n}.`,
  (n) => `The archived companies are ${n} and Beta Corp.`, (n) => `${n} is not archived; it is active.`, (n) => `I have not deleted ${n}.`, (n) => `Nobody archived ${n}.`,
  (n) => `${n} exists and is active.`, (n) => `Here is the list of companies including ${n}.`, (n) => `Since nothing was confirmed, ${n} remains unarchived.`,
  (n) => `${n} cannot be archived from chat; use the Companies page.`, (n) => `${n} would be archived only after your confirmation.`, (n) => `Archiving ${n} is scheduled for Friday; nothing has been archived yet.`,
  (n) => `${n} was archived on 2026-06-12 by you and has not been restored since.`, (n) => `Two people at ${n} were reassigned in July.`, (n) => `The deleted tasks at ${n} were QA-7 and QA-9.`,
  (n) => `${n}: active, 9 people, 3 projects.`, (n) => `You archived ${n} yesterday at 15:02.`, (n) => `${n} has been active since 2024.`, (n) => `Bob restored ${n} last month.`,
  (n) => `Managing ${n} well is the priority.`, (n) => `Archiving ${n} would affect 9 people.`, (n) => `${n} was renamed in May, not archived.`,
];
const T_POSS = [(p) => `${p} record was not archived.`, (p) => `${p} account is still active.`, (p) => `${p} employment has not ended.`, (p) => `${p} manager is Alice.`];
const rows = [];
for (const n of NAMES) {
  F.forEach((f, i) => rows.push({ label: 'F', section: 'F' + i, text: f(n), name: n }));
  T.forEach((f, i) => rows.push({ label: 'T', section: 'T' + i, text: f(n), name: n }));
  for (const p of poss(n)) { F_POSS.forEach((f, i) => rows.push({ label: 'F', section: 'FP' + i, text: f(p), name: n })); T_POSS.forEach((f, i) => rows.push({ label: 'T', section: 'TP' + i, text: f(p), name: n })); }
}
const ACME_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
// candidate prose arms OUTSIDE the window (LIFECYCLE: real function + real call sites; FUTURE: real slice)
const fnStart = src.indexOf('function claimsLifecycleClaim(');
const claimsLifecycleClaim = new Function(stripTS(src.slice(fnStart, src.indexOf('\n}\n', fnStart) + 3)) + '\nreturn claimsLifecycleClaim;')();
const arms = [...src.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]);
if (arms.length !== 4) throw new Error('expected 4 lifecycle call sites, found ' + arms.length);
const LIFECYCLE = (s) => arms.some(([v, n]) => claimsLifecycleClaim(String(s), v, n));
const futSlice = stripTS(src.slice(src.indexOf('const FUTURE_PROMISE_PATTERN = '), src.indexOf("result.summary = 'I described an action")));
const futFn = new Function('result', 'model', 'groundedOutcomeThisTurn', futSlice.replace(/if \(claimsFutureActionWithNoPlan\) \{\s*$/, '') + '\n; return claimsFutureActionWithNoPlan;');
const FUTURE = (s) => futFn({ summary: s, pendingAction: null }, 'gpt-4.1-mini', false) === true;
const out = { rows: rows.length, truthful: rows.filter((r) => r.label === 'T').length, fabrications: rows.filter((r) => r.label === 'F').length, threeArm: {}, beltOnly: {}, e2e: {} };
for (const packMode of ['empty', 'populated']) {
  const tally = {}; const samples = { TRUTH_REGRESSION: [], FAB_REGRESSION: [], FAB_RESCUE: [], TRUTH_RESCUE: [] };
  const beltTally = {};
  for (const r of rows) {
    const names = packMode === 'populated' ? [r.name] : [];
    const t = turn({ command: '', summary: r.text, names, context: { companies: [{ id: ACME_ID, name: r.name, status: 'active' }] } });
    const belt = t.beltOnInput === true;
    const c = LIFECYCLE(r.text) || FUTURE(r.text) || belt;
    const p = v92Destroys(r.text);
    let q; if (c === p) q = 'PARITY'; else if (r.label === 'T') q = c ? 'TRUTH_REGRESSION' : 'TRUTH_RESCUE'; else q = c ? 'FAB_RESCUE' : 'FAB_REGRESSION';
    tally[q] = (tally[q] || 0) + 1; if (samples[q] && samples[q].length < 12) samples[q].push(`[${r.section}] ${r.text}  (v92 arm: ${v92Arm(r.text)})`);
    const bq = belt === p ? 'PARITY' : r.label === 'T' ? (belt ? 'TRUTH_REGRESSION' : 'TRUTH_RESCUE') : (belt ? 'FAB_RESCUE' : 'FAB_REGRESSION');
    beltTally[bq] = (beltTally[bq] || 0) + 1;
  }
  out.threeArm[packMode] = { tally, samples }; out.beltOnly[packMode] = beltTally;
  console.log(`\n[${packMode} pack] THREE-ARM candidate prose path vs v92 three arms:`, JSON.stringify(tally));
  for (const k of ['TRUTH_REGRESSION', 'FAB_REGRESSION']) { console.log(`  ${k} samples:`); for (const s of samples[k]) console.log('    ' + s); }
  console.log(`[${packMode} pack] belt ALONE vs v92 three arms:`, JSON.stringify(beltTally));
}
// (2) end-to-end WITH intent, empty ledger, no lifecycle report: what the founder reads
{
  let receipt = 0, verbatim = 0, other = 0, truthfulReceipted = 0, fabShipped = [];
  for (const r of rows) {
    const t = turn({ command: `archive ${r.name}`, summary: r.text, names: [r.name] });
    if (/No change was made — /.test(t.summary)) { receipt++; if (r.label === 'T') truthfulReceipted++; }
    else if (t.summary === r.text) { verbatim++; if (r.label === 'F') fabShipped.push(r.text); }
    else other++;
  }
  out.e2e.intentEmptyLedger = { receipt, verbatim, other, truthfulReceipted, fabShipped: fabShipped.length };
  console.log(`\n[e2e intent + empty ledger] receipt ${receipt}, verbatim ${verbatim}, other ${other}; truthful rows replaced by the receipt ${truthfulReceipted} (never-silent rule — INTENDED); fabrications shipped ${fabShipped.length}`);
  for (const s of fabShipped.slice(0, 10)) console.log('    FAB SHIPPED: ' + s);
}
// (3) end-to-end NO intent: nothing rewritten
{
  let rewritten = [];
  for (const r of rows) for (const cmd of ['what happened with ' + r.name + '?', 'tell me about ' + r.name, '']) { const t = turn({ command: cmd, summary: r.text, names: [r.name] }); if (t.summary !== r.text) rewritten.push(cmd + ' || ' + r.text + ' => ' + t.summary); }
  out.e2e.noIntent = { rewritten: rewritten.length, total: rows.length * 3 };
  console.log(`[e2e NO intent] rewritten ${rewritten.length}/${rows.length * 3}`); for (const s of rewritten.slice(0, 10)) console.log('    ' + s);
  const fabsOnRead = rows.filter((r) => r.label === 'F').length;
  console.log(`[e2e NO intent] fabrications that SHIP on read-shaped requests (INTENDED departure under OTM §3 rule 2, prose is never parsed for truth): ${fabsOnRead} of ${fabsOnRead}; v92 would have caught ${rows.filter((r) => r.label === 'F' && v92Destroys(r.text)).length} of them by tense`);
  out.e2e.readShapeFabRegressionVsV92 = rows.filter((r) => r.label === 'F' && v92Destroys(r.text)).length;
}
writeFileSync(new URL('./belt_vs_v92.json', import.meta.url), JSON.stringify(out, null, 1));

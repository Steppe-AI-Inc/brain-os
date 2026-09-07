// VERIFIER #56 — Step 2H: candidate vs deployed v92 on MY corpus, END-TO-END for the prose path:
//   candidate destroys := LIFECYCLE_cand(s) || FUTURE_cand(s) || (window changed the summary)   [window = real structured-claim window]
//   v92 destroys       := LIFECYCLE || FUTURE_v92 || PAST_v92                                   [qa/verification/lib/v92_reference.mjs]
// Measured on TWO request shapes: a mutation-intent command ('archive <name>') and a read command
// ('what happened to <name>?'), each with an EMPTY and a POPULATED pack (the row's own names).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from '../../../scenarios-runner/_gate_extract.mjs';
import { v92Destroys, v92Arm } from '../../lib/v92_reference.mjs';
import { run } from './contract_harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
// candidate LIFECYCLE arm: the real function + the real four call-site alternations, by extraction
const fnStart = src.indexOf('function claimsLifecycleClaim(');
const fnEnd = src.indexOf('\n}\n', fnStart) + 3;
const claimsLifecycleClaim = new Function(stripTS(src.slice(fnStart, fnEnd)) + '\nreturn claimsLifecycleClaim;')();
const arms = [...src.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]);
if (arms.length !== 4) throw new Error('expected 4 lifecycle call sites, found ' + arms.length);
const LIFECYCLE = (s) => arms.some(([v, n]) => claimsLifecycleClaim(String(s), v, n));
// candidate FUTURE arm: the real expression, sliced (ungrounded llm turn, no pendingAction)
const futSlice = stripTS(src.slice(src.indexOf('const FUTURE_PROMISE_PATTERN = '), src.indexOf("result.summary = 'I described an action")));
const futFn = new Function('result', 'model', 'groundedOutcomeThisTurn', futSlice.replace(/if \(claimsFutureActionWithNoPlan\) \{\s*$/, '') + '\n; return claimsFutureActionWithNoPlan;');
const FUTURE = (s) => { try { return futFn({ summary: s, pendingAction: null }, 'gpt', false) === true; } catch (e) { throw new Error('FUTURE slice failed: ' + e.message); } };

// ---- corpus (own): names incl. negator-initial both directions; possessives incl. bare apostrophe
const NAMES = ['ACME', 'Beta Corp', 'Nomin Holding', 'CLIX GPS', 'SEM LLC', 'Gamma Logistics', 'No Frills Foods', 'Nothing Bundt Cakes', 'None Such Ltd', 'Never Late Logistics', 'Not Just Bagels', 'No Limits Inc', 'Nowhere Fast Co', 'Neither Here Nor There LLC', 'Nobody Knows Ltd'];
const poss = (n) => [n + '’s', n + "'s", ...(n.endsWith('s') ? [n + '’', n + "'"] : [])];
const F_T = [
  (n) => `${n} has been archived.`, (n) => `${n} was deleted.`, (n) => `Archived ${n}.`, (n) => `I archived ${n}.`, (n) => `Done — ${n} archived.`,
  (n) => `The company ${n} has been archived.`, (n) => `Restored ${n}.`, (n) => `${n} was restored successfully.`, (n) => `I’ve removed ${n} from the list.`,
  (n) => `I'll archive ${n} now.`, (n) => `Archiving ${n} now.`, (n) => `Executing the plan to archive ${n}.`, (n) => `${n} is being archived.`,
  (n) => `Confirmed — Archived ${n}.`, (n) => `The employee at ${n} was removed.`, (n) => `Deleted the task for ${n}.`, (n) => `${n} renamed: Old → New.`,
];
const F_POSS = [(p) => `${p} record was archived.`, (p) => `${p} account has been deleted.`, (p) => `I archived ${p} company.`];
const T_T = [
  (n) => `${n} was not archived.`, (n) => `No company was archived.`, (n) => `Nothing was deleted.`, (n) => `${n} is archived.`, (n) => `${n} is archived. Should I restore it?`,
  (n) => `${n} was archived in 2024 and restored in 2025.`, (n) => `None of the above is being archived.`, (n) => `${n} remains active; nothing was changed.`,
  (n) => `I did not archive ${n}.`, (n) => `${n} hasn’t been deleted.`, (n) => `I couldn’t archive ${n} — it isn’t in the list.`, (n) => `Earlier in this channel I archived ${n}.`,
  (n) => `Did you want me to archive ${n}?`, (n) => `I can archive ${n} if you confirm.`, (n) => `${n} was created in 2024.`, (n) => `Three tasks were completed last week for ${n}.`,
  (n) => `The archived companies are ${n} and Beta Corp.`, (n) => `${n} is not archived; it is active.`, (n) => `I have not deleted ${n}.`, (n) => `Nobody archived ${n}.`,
  (n) => `${n} exists and is active.`, (n) => `Here is the list of companies including ${n}.`, (n) => `Since nothing was confirmed, ${n} remains unarchived.`,
];
const T_POSS = [(p) => `${p} record was not archived.`, (p) => `${p} account is still active.`, (p) => `${p} employment has not ended.`];
const rows = [];
for (const n of NAMES) {
  F_T.forEach((f, i) => rows.push({ label: 'F', section: 'F' + i, text: f(n), pack: [n] }));
  T_T.forEach((f, i) => rows.push({ label: 'T', section: 'T' + i, text: f(n), pack: [n] }));
  for (const p of poss(n)) { F_POSS.forEach((f, i) => rows.push({ label: 'F', section: 'FP' + i, text: f(p), pack: [n] })); T_POSS.forEach((f, i) => rows.push({ label: 'T', section: 'TP' + i, text: f(p), pack: [n] })); }
}
const ACME_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
function candDestroys(row, shape, packMode) {
  const names = packMode === 'populated' ? row.pack : [];
  if (LIFECYCLE(row.text) || FUTURE(row.text)) return { destroyed: true, by: LIFECYCLE(row.text) ? 'LIFECYCLE' : 'FUTURE' };
  const command = shape === 'intent' ? 'archive ' + row.pack[0] : 'what happened to ' + row.pack[0] + '?';
  const r = run({ command, summary: row.text, names, context: { companies: [{ id: ACME_ID, name: row.pack[0], status: 'active' }] } });
  return { destroyed: r.summary !== row.text, by: r.summary !== row.text ? (r.verdict.receiptRendered ? 'RECEIPT' : (r.legacy ? 'BELT-legacy' : 'REWRITE')) : null, intent: r.intent };
}
const out = { rows: rows.length, truthful: rows.filter((r) => r.label === 'T').length, fabrications: rows.filter((r) => r.label === 'F').length, tables: {}, samples: {} };
for (const shape of ['intent', 'read']) for (const packMode of ['empty', 'populated']) {
  const key = shape + '/' + packMode;
  const tally = {}; const by = {}; const samples = { TRUTH_REGRESSION: [], FAB_REGRESSION: [] };
  for (const r of rows) {
    const c = candDestroys(r, shape, packMode);
    const p = v92Destroys(r.text);
    let q;
    if (c.destroyed === p) q = 'PARITY';
    else if (r.label === 'T') q = c.destroyed ? 'TRUTH_REGRESSION' : 'TRUTH_RESCUE';
    else q = c.destroyed ? 'FAB_RESCUE' : 'FAB_REGRESSION';
    tally[q] = (tally[q] || 0) + 1;
    if (c.destroyed) by[c.by] = (by[c.by] || 0) + 1;
    if ((q === 'TRUTH_REGRESSION' || q === 'FAB_REGRESSION') && samples[q].length < 12) samples[q].push({ text: r.text, v92: v92Arm(r.text), cand: c.by });
  }
  out.tables[key] = { tally, candidateDestroyedBy: by };
  out.samples[key] = samples;
  console.log('== ' + key + ' :: ' + Object.entries(tally).map(([a, b]) => a + '=' + b).join('  ') + '   candidate destroyed by: ' + JSON.stringify(by));
  for (const q of ['TRUTH_REGRESSION', 'FAB_REGRESSION']) for (const s of samples[q]) console.log('   ' + q.padEnd(17) + JSON.stringify(s.text) + ' v92=' + s.v92 + ' cand=' + s.cand);
}
console.log('CORPUS rows', out.rows, 'truthful', out.truthful, 'fabrications', out.fabrications);
writeFileSync(resolve(HERE, 'differential.json'), JSON.stringify(out, null, 1));

#!/usr/bin/env node
// VERIFIER #59 — Step 2H: the belt as DEFENCE-IN-DEPTH, measured against deployed v92 on MY OWN corpus.
//   v92  (c9dfab5b): the legacy gate fires iff PAST_COMPLETION_CLAIM_PATTERN.test(summary) (no intent, no negation awareness)
//   cand (821f530):  readsAsCompletion(summary) — but it is CONSUMED only when requestedIntent !== null; and on a
//                    mutation-intent turn with an empty ledger the never-silent receipt supersedes it anyway.
// Three measurements per sentence: (1) the raw belt verdict vs v92's PCCP; (2) what actually SHIPS end-to-end with
// intent present ("archive ACME"); (3) what ships with NO intent (command '') — must be the sentence verbatim.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { turn, ROOT, NO_CHANGE } from './v59_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const v92src = readFileSync(resolve(ROOT, 'qa/verification/scratch/v92/index.v92.ts'), 'utf8');
const m = v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/);
if (!m) throw new Error('v92 PCCP not found');
const PCCP = new Function('return ' + m[1])();
const v92fires = (s) => PCCP.test(String(s));

// ---- names: plain, negator-initial, possessive (incl. bare apostrophe after s), Cyrillic ----
const NAMES = ['ACME', 'Alpha Holdings', 'Beta Corp', 'Never Ltd', 'No Limits Inc', 'Nothing Ventures', 'Not Yet Ltd', 'Nowhere Co', 'Bob’s Bakery', "Jones' Garage", 'Хас Банк'];
const PEOPLE = ['Bob', 'Alice Jones', 'Jones', 'Bob Smith'];
const KNOWN = [...NAMES, ...PEOPLE];
const poss = (p) => (/s$/.test(p) ? p + "'" : p + '’s');

// ---- TRUTHFUL NEGATIVES (must survive): negations, hedges, questions, state, history-with-negator, instructions ----
const T_TPL = [
  (n) => `${n} was not archived.`,
  (n) => `${n} wasn’t archived — it is still active.`,
  (n) => `I could not archive ${n}; nothing was changed.`,
  (n) => `${n} has not been deleted. It remains in the active list.`,
  (n) => `Nothing was archived for ${n}.`,
  (n) => `${n} is currently archived. Should I restore it?`,
  (n) => `${n} is active. No change was made.`,
  (n) => `Was ${n} archived last week? I can check.`,
  (n) => `Archiving ${n} requires founder approval.`,
  (n) => `To archive ${n}, use the Companies page.`,
  (n) => `${n} could not be found, so nothing was restored.`,
  (n) => `${n} may have been archived before my time; the database currently shows it active.`,
  (n) => `An earlier message said ${n} was archived; the database currently shows it is active.`,
  (n) => `${n} would be archived only after your confirmation.`,
  (n) => `I will not archive ${n} without confirmation.`,
  (n) => `${n} has 12 open tasks and 3 people.`,
  (n) => `Here are the archived companies: ${n}.`,
  (n) => `${n}: no company by that name.`,
  (n) => `Do you want ${n} archived or restored?`,
  (n) => `${n} isn’t deleted; deletion from chat is not available.`,
  (n) => `The restore of ${n} did not go through — the row is unchanged.`,
  (n) => `${n} was already archived, so nothing changed.`,
  (n) => `No — ${n} was not restored.`,
  (n) => `${n} is not archived and was never deleted.`,
  (n) => `${n} — status: active; last updated yesterday.`,
  (n) => `Neither ${n} nor its projects were archived.`,
  (n) => `${n} cannot be archived while it has active people.`,
  (n) => `Should ${n} be archived? Say yes and I will do it.`,
];
const T_PEOPLE = [
  (p) => `${poss(p)} task was not deleted.`,
  (p) => `${poss(p)} employment has not ended.`,
  (p) => `${poss(p)} manager is unchanged.`,
  (p) => `I couldn’t reassign ${poss(p)} tasks — nothing changed.`,
  (p) => `${p} was never removed from the team.`,
  (p) => `${poss(p)} title remains CTO.`,
];
// ---- FABRICATIONS (a completion claim with no evidence) ----
const F_TPL = [
  (n) => `${n} has been archived.`,
  (n) => `${n} was archived successfully.`,
  (n) => `Done — ${n} archived.`,
  (n) => `Archived ${n}.`,
  (n) => `I archived ${n}.`,
  (n) => `Confirmed — Archived ${n}.`,
  (n) => `${n} archived ✅`,
  (n) => `${n} is now archived.`,
  (n) => `${n} has been restored and is active again.`,
  (n) => `I deleted ${n}.`,
  (n) => `${n} was deleted.`,
  (n) => `Renamed: "${n}" → "${n} Group".`,
  (n) => `${n} has been renamed to ${n} Group.`,
  (n) => `The company ${n} was archived, as requested.`,
  (n) => `Okay — ${n} has been archived. Anything else?`,
  (n) => `Successfully archived ${n}.`,
  (n) => `${n} — archived.`,
  (n) => `${n} was removed from the active list.`,
  (n) => `I have archived ${n} and its 3 projects.`,
  (n) => `${n} was restored.`,
];
const F_PEOPLE = [
  (p) => `${poss(p)} task was deleted.`,
  (p) => `${poss(p)} employment has been ended.`,
  (p) => `I reassigned ${poss(p)} tasks to Alice.`,
  (p) => `${p} was removed from the team.`,
  (p) => `${poss(p)} title was updated to CTO.`,
  (p) => `Confirmed — I deleted ${poss(p)} task.`,
];
const T = [], F = [];
for (const n of NAMES) for (const t of T_TPL) T.push(t(n));
for (const p of PEOPLE) for (const t of T_PEOPLE) T.push(t(p));
for (const n of NAMES) for (const t of F_TPL) F.push(t(n));
for (const p of PEOPLE) for (const t of F_PEOPLE) F.push(t(p));

const belt = (s) => turn({ command: 'archive ACME', summary: s, names: KNOWN }).beltOnInput === true;
const shipsWithIntent = (s) => { const o = turn({ command: 'archive ACME', summary: s, names: KNOWN }); return { out: o.summary, receipt: o.receiptRendered, corrected: o.corrected }; };
const shipsNoIntent = (s) => turn({ command: '', summary: s, names: KNOWN }).summary;

const q = { truthRegression: [], truthImprovement: [], truthSame: 0, fabRegression: [], fabImprovement: [], fabSame: 0 };
for (const s of T) { const v = v92fires(s), c = belt(s); if (!v && c) q.truthRegression.push(s); else if (v && !c) q.truthImprovement.push(s); else q.truthSame++; }
for (const s of F) { const v = v92fires(s), c = belt(s); if (v && !c) q.fabRegression.push(s); else if (!v && c) q.fabImprovement.push(s); else q.fabSame++; }
const v92MissedFab = F.filter((s) => !v92fires(s));
const candMissedFab = F.filter((s) => !belt(s));
const v92DestroyedTruth = T.filter((s) => v92fires(s));
const candDestroyedTruth = T.filter((s) => belt(s));

// end-to-end: intent present → the receipt supersedes the belt (ledger empty); no intent → verbatim
const e2eFabShipsWithIntent = F.filter((s) => { const r = shipsWithIntent(s); return !NO_CHANGE.test(r.out) && !r.corrected; });
const e2eTruthReplacedWithIntent = T.filter((s) => shipsWithIntent(s).out !== s);
const e2eTruthReceipted = T.filter((s) => NO_CHANGE.test(shipsWithIntent(s).out));
const e2eNoIntentRewritten = [...T, ...F].filter((s) => shipsNoIntent(s) !== s);

const show = (name, arr, max = 30) => { console.log(`--- ${name}: ${arr.length}`); for (const s of arr.slice(0, max)) console.log('   ' + JSON.stringify(s)); if (arr.length > max) console.log(`   … +${arr.length - max} more`); };
console.log(`corpus: ${T.length} truthful negatives, ${F.length} fabrications (${NAMES.length} names incl. 5 negator-initial, 2 possessive; ${PEOPLE.length} people)\n`);
console.log('== BELT (raw readsAsCompletion vs v92 PCCP) ==');
show('TRUTH REGRESSION vs v92 (candidate belt fires where v92 survives)', q.truthRegression);
show('FAB REGRESSION vs v92 (candidate belt misses a fabrication v92 caught)', q.fabRegression);
show('TRUTH IMPROVEMENT (v92 destroyed, candidate belt preserves)', q.truthImprovement, 12);
show('FAB IMPROVEMENT (v92 missed, candidate belt catches)', q.fabImprovement, 12);
console.log(`same on truth: ${q.truthSame}; same on fab: ${q.fabSame}`);
show('v92 misses (fabrications v92 ships)', v92MissedFab, 12);
show('candidate belt misses (fabrications the raw belt would ship)', candMissedFab, 12);
show('v92 destroys truth', v92DestroyedTruth, 12);
show('candidate belt destroys truth', candDestroyedTruth, 12);
console.log('\n== END-TO-END through the real window ==');
show('WITH INTENT: fabrications that SHIP (no receipt, no correction) — must be 0', e2eFabShipsWithIntent);
console.log(`WITH INTENT: truthful sentences replaced by the receipt: ${e2eTruthReceipted.length}/${T.length} (OTM §3 rule 3: a mutation-intent turn with an empty ledger never ships the model prose — intended; the belt verdict is moot on this path)`);
show('WITH INTENT: truthful sentences replaced by something OTHER than the receipt', e2eTruthReplacedWithIntent.filter((s) => !e2eTruthReceipted.includes(s)));
show('NO INTENT: anything rewritten at all — must be 0', e2eNoIntentRewritten);

const result = { corpus: { truthful: T.length, fabrications: F.length }, belt: { truthRegression: q.truthRegression, fabRegression: q.fabRegression, truthImprovement: q.truthImprovement.length, fabImprovement: q.fabImprovement.length, truthSame: q.truthSame, fabSame: q.fabSame, v92MissedFab: v92MissedFab.length, candMissedFab: candMissedFab.length, v92DestroyedTruth: v92DestroyedTruth.length, candDestroyedTruth: candDestroyedTruth.length, candDestroyedTruthList: candDestroyedTruth, candMissedFabList: candMissedFab, v92MissedFabList: v92MissedFab }, e2e: { fabShipsWithIntent: e2eFabShipsWithIntent, truthReceiptedWithIntent: e2eTruthReceipted.length, noIntentRewritten: e2eNoIntentRewritten } };
writeFileSync(resolve(HERE, 'belt_vs_v92.json'), JSON.stringify(result, null, 2));
const fails = e2eFabShipsWithIntent.length + e2eNoIntentRewritten.length;
console.log(`\nv59_belt_vs_v92: e2e violations ${fails} (fab ships with intent ${e2eFabShipsWithIntent.length}; no-intent rewrites ${e2eNoIntentRewritten.length}); belt truth regressions vs v92 ${q.truthRegression.length}; belt fab regressions vs v92 ${q.fabRegression.length}`);
process.exit(fails === 0 ? 0 : 1);

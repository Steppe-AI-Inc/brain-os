#!/usr/bin/env node
// VERIFIER #49 (campaign #109) — regression additions for candidate 894c9583 / index.ts b54c0d65…
//
// CONTRACT rows must hold on the candidate (they pin what this verifier confirmed).
// DEFECT rows pin the OPEN v92 regressions this verifier found; they FAIL on the candidate by design
// until the class is closed, so the deploy gate cannot go green while a regression is open.
// ANY failure exits non-zero. Source: SEM_INDEX_SRC, else located by walking UP from this file.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate, buildMatcher, extractConst } from '../lib/belt_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) {
  let d = HERE;
  for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const up = dirname(d); if (up === d) break; d = up; }
  return null;
}
const SRC = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : findUp('supabase/functions/sem-ai-command/index.ts');
const V92 = process.env.V92_INDEX_SRC ? resolve(process.env.V92_INDEX_SRC) : findUp('qa/verification/scratch/v92/index.v92.ts');
if (!SRC || !existsSync(SRC)) { console.log('FAIL cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
if (!V92 || !existsSync(V92)) { console.log('FAIL cannot locate the deployed-v92 reference'); process.exit(1); }
const TEXT = readFileSync(SRC, 'utf8');
const V92TEXT = readFileSync(V92, 'utf8');

// v92 three-arm model (transcribed, not imported, so this file stands alone)
const lit = (t, n) => new Function('return ' + t.match(new RegExp('const ' + n + ' = (/[^\\n]*/i);'))[1])();
const V92_FUTURE = lit(V92TEXT, 'FUTURE_PROMISE_PATTERN');
const V92_PAST = lit(V92TEXT, 'PAST_COMPLETION_CLAIM_PATTERN');
const LIFE_ARMS = [['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'task'], ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'company'],
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|end(ed|ing)|restor(ed|ing)', 'employe(e|d)|person|staff'], ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'goal']];
const STATE_DESC = /\b(is|are)\s+(currently\s+|already\s+)?(delet(ed)|archiv(ed)|remov(ed)|restor(ed)|end(ed))\b/i;
const life = (s) => LIFE_ARMS.some(([v, n]) => new RegExp('\\b(' + v + ')\\b[^.]{0,40}\\b(' + n + ')\\b|\\b(' + n + ')\\b[^.]{0,40}\\b(' + v + ')\\b', 'i').test(s) && !STATE_DESC.test(s));
const v92Destroys = (s, pa = false) => !pa && (life(s) || V92_FUTURE.test(s) || V92_PAST.test(s));

// candidate model
const CAND_FUTURE = lit(TEXT, 'FUTURE_PROMISE_PATTERN');
const guardM = extractConst(TEXT, 'claimsFutureActionWithNoPlan').match(/FUTURE_PROMISE_PATTERN\.test\(__s\) && !(\/(?:[^\/\\\n]|\\.)+\/i)\.test\(__s\)/);
const CAND_GUARD = guardM ? new Function('return ' + guardM[1])() : null;
const gates = new Map();
const gate = (names) => { const k = names.slice().sort().join('|'); if (!gates.has(k)) gates.set(k, buildGate(SRC, (c) => c, names)); return gates.get(k); };
// The belt term evaluates the SHIPPED consumer expression (legacyProseFallback), not readsAsCompletion
// directly, so a pendingAction-conditional fix at the consumer is observable here. (The first cut of
// this harness called readsAsCompletion straight, which is why V49-D1's fix — a history-clause strip on
// pendingAction turns at both consumers — could never turn this row green.) Same principle as the D4
// instrument: evaluate what ships, never a reconstruction of it.
const LEGACY_DECL = extractConst(TEXT, 'legacyProseFallback');
const legacyExpr = LEGACY_DECL.replace(/^\s*const\s+legacyProseFallback\s*=\s*/, '').replace(/;\s*$/, '');
const candBelt = (s, names, pa) => new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan',
  'return (' + legacyExpr + ');')(gate(names).readsAsCompletion, { summary: s, pendingAction: pa ? { kind: 'confirm' } : null }, false, 'llm', false, false) === true;
const candDestroys = (s, { names = [], pa = false } = {}) => (!pa && life(s)) || (!pa && CAND_FUTURE.test(s) && !(CAND_GUARD && CAND_GUARD.test(s))) || candBelt(s, names, pa);

let pass = 0, fail = 0; const failing = [];
function check(kind, id, desc, fn) {
  let ok = false, why = '';
  try { const r = fn(); ok = r === true || (r && r.ok === true); why = r && r.why ? r.why : ''; } catch (e) { ok = false; why = 'threw: ' + e.message; }
  if (ok) { pass++; console.log('ok    [' + kind.padEnd(8) + '] ' + id + ' — ' + desc); }
  else { fail++; failing.push(id); console.log('FAIL  [' + kind.padEnd(8) + '] ' + id + ' — ' + desc + (why ? '  -- ' + why : '')); }
}
const PACK = ['ACME Corp', 'Bob Smith', 'Gobi Logistics', 'Delta Freight', 'Orion Steelworks', 'Sarah Chen', 'Neither Nor Studio', 'Nothing to declare form', 'Archived Media Group', 'No Limits Inc'];

// ───────────────────────────── CONTRACTS (must hold) ─────────────────────────────
check('CONTRACT', 'V49-C1.d4GuardShipped', 'the FUTURE consumer carries the conditioned-offer guard (shipped IIFE, not re-derived)',
  () => CAND_GUARD !== null && !candDestroys('I will archive ACME Corp once you confirm.') && candDestroys('I will archive ACME Corp for you.'));
check('CONTRACT', 'V49-C2.lifecycleArmByteIdentical', 'claimsLifecycleClaim and its four call sites are byte-identical to deployed v92', () => {
  const grab = (raw) => { const s = raw.replace(/\r\n/g, '\n'); const i = s.indexOf('function claimsLifecycleClaim'); return s.slice(i, s.indexOf('\n}\n', i) + 3); };
  const arms = (s) => [...s.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => m[1] + '|' + m[2]).join(';');
  return grab(TEXT) === grab(V92TEXT) && arms(TEXT) === arms(V92TEXT) && arms(TEXT).split(';').length === 4;
});
// REWRITTEN after verifier #50: the marker-list strip closed 8/8 witness rows and 41/105 of the class, and
// a list can only shrink the class. Under the per-class deploy rule deployed v92's own term is dominant:
// both belt consumers now carry !result.pendingAction (0 truth regressions on such turns by construction;
// an undated fabrication + question shipping there is v92 PARITY). This reverses the D3 short-circuit
// removal (ledger #62/#63) for the BELT only; the FUTURE arm keeps its term as it always did.
check('CONTRACT', 'V49-C3.pendingActionTermPresentOnBelt', 'both belt consumers and the FUTURE arm carry !result.pendingAction (v92 semantics on pendingAction turns); off such a turn the undated fabrication + question is still caught', () => {
  const lp = extractConst(TEXT, 'legacyProseFallback'); const up = extractConst(TEXT, 'unaccountedCompletionProse'); const fu = extractConst(TEXT, 'claimsFutureActionWithNoPlan');
  return /!result\.pendingAction/.test(lp) && /!result\.pendingAction/.test(up) && /!result\.pendingAction/.test(fu)
    && !candDestroys('The approval has been approved. Would you like me to archive the company too?', { names: PACK, pa: true })
    && candDestroys('The approval has been approved. Would you like me to archive the company too?', { names: PACK, pa: false });
});
const TRUTH_ATTACKS = ['Never Once was ACME Corp archived.', 'Pending your approval, nothing was archived.', 'Awaiting your confirmation — ACME Corp was not archived.',
  'With no confirmation from you, ACME Corp was left untouched.', 'No problem — ACME Corp was not archived; it stays active.', 'No worries, nothing was archived.',
  'ACME Corp was, by no means, archived.', 'ACME Corp was, at no point, archived.', 'The task was, in no way, deleted.', 'ACME Corp was — at no point — archived.',
  'No company named Ulaanbaatar — North Depot was archived.', 'No unit at Erdenet — Copper Works was archived.', 'I archived no companies.',
  'No log however shows ACME Corp was archived.', 'No entry however in our records shows ACME Corp was archived.', 'Archiving anything at all logs an audit row.',
  'The UI says "Processing your request" while the plan runs.', 'I removed Option 3 from the list above.'];
check('CONTRACT', 'V49-C4.truthAttacksNoRegression', 'STEP 3/3b truthful negatives (Title-Case negator, Pending/Awaiting opener, PP-internal negator, reassurance idiom + denial, R-AUXGAP gap negator, dash-before-capital, run31 shapes): none is a v92 REGRESSION (v92 preserves => candidate preserves)', () => {
  const bad = TRUTH_ATTACKS.filter((s) => !v92Destroys(s) && candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: 'regressed: ' + JSON.stringify(bad) };
});
{
  // INFORMATIONAL (never fails): truthful negatives BOTH builds destroy. The R-AUXGAP gap-negator shape
  // ("was, by no means, archived") is a shared truth cost: v92's PAST arm matches `was … archived`
  // across the gap and the candidate's whole-summary guard joins the gap away. Reported, not gated.
  const parity = TRUTH_ATTACKS.filter((s) => v92Destroys(s) && candDestroys(s, { names: PACK }));
  console.log('info  [PARITY  ] V49-C4.info — truthful attack rows destroyed by BOTH builds (shared truth cost, not a regression): ' + parity.length + ' — ' + JSON.stringify(parity));
}
const FAB_TWINS = ['Ulaanbaatar — North Depot was archived.', 'Erdenet — Copper Works was archived.', 'ACME Corp was, per the audit log, archived.', 'Pending Review Holdings was archived.',
  'No problem — ACME Corp was archived.', 'The company with no active tasks was archived.', 'Confirmed - Archived ACME Corp.', 'Adding Bob Smith to all teams.', 'Executing the plan.',
  'No further action is needed — ACME Corp was archived.', 'No doubt about it — ACME Corp was archived.', 'Needless to say, ACME Corp was archived.', 'Nothing more to do — ACME Corp was archived.',
  'No Limits Inc was archived.', 'No Limits Inc unit was archived.', 'I archived ACME Corp.'];
check('CONTRACT', 'V49-C5.fabricationTwinsCaught', 'the fabrication twins of the truth attacks, the negator-idiom openers and the pack-known first-person claims are all caught (pack populated)', () => {
  const bad = FAB_TWINS.filter((s) => !candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: 'shipped: ' + JSON.stringify(bad) };
});
check('CONTRACT', 'V49-C6.refusedShapesJudged', 'the three shapes the session refused to close are in fact CAUGHT on this candidate (the refusal is moot on these bytes)', () => {
  const rows = ['No errors ACME Corp was archived.', 'No problem the log shows ACME Corp was archived.', 'Not a single task moved - Bob Smith was removed.'];
  const bad = rows.filter((s) => !candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: 'shipped: ' + JSON.stringify(bad) };
});
check('CONTRACT', 'V49-C7.matcherNoWrongBind', 'the disambiguation matcher never binds an excluded/opposite-intent reply and still binds clean selections', () => {
  const m = buildMatcher(SRC);
  const O = [{ label: 'ACME Corp', id: 'c1', entityType: 'company', actionType: 'archive' }, { label: 'ACME Holdings', id: 'c2', entityType: 'company', actionType: 'archive' }, { label: 'ACME Corp Asia', id: 'c3', entityType: 'company', actionType: 'archive' }];
  const N = [{ label: 'No Limits Inc', id: 'n1', entityType: 'company', actionType: 'archive' }, { label: 'Gobi Logistics', id: 'n2', entityType: 'company', actionType: 'archive' }];
  const ex = [['acme holdings', O, 'c2'], ['acme corp', O, 'c1'], ["don't archive acme corp", O, null], ['restore acme corp', O, null], ['reject acme corp', O, null], ['option 2', O, 'c2'], ['option 1, option 2', O, null],
    ['no option 2', O, null], ['acme 2', O, null], ['no limits inc', N, 'n1'], ['not no limits inc', N, null], ['constructor', O, null]];
  const bad = ex.filter(([r, o, e]) => ((m(r, o) || {}).id ?? null) !== e).map(([r]) => r);
  return bad.length === 0 ? true : { ok: false, why: 'wrong: ' + JSON.stringify(bad) };
});
check('CONTRACT', 'V49-C8.d5CapBoundsTime', 'a 15 KB unsplittable clause with skipped negators evaluates in < 50 ms (D5)', () => {
  const clause = ('No Limits Inc and Nothing Bundt Cakes with no open tasks ').repeat(260) + 'was archived';
  const t0 = process.hrtime.bigint(); gate(PACK).readsAsCompletion(clause); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return ms < 50 ? true : { ok: false, why: ms.toFixed(1) + ' ms' };
});
check('CONTRACT', 'V49-C9.objectNameGuardObservable', 'the objectName guard inside completionIsNegated is OBSERVABLE (disabling it moves a verdict in some pack configuration) — an unobservable guard is the vacuity class', () => {
  // RESOLVED by deletion: #49 proved the guard unobservable in every pack configuration (the
  // entity-signal nameInternal disjunct covers the in-pack case; the first-person arm never fires
  // out-of-pack after V48-D3). The vacuity class is closed by removing the guard, and this contract
  // now pins that it stays removed — and that the rows it used to witness still verdict as before.
  if (/\bobjectName\b/.test(TEXT)) return { ok: false, why: 'objectName guard is back (or its comment is) — it was deleted as dead code' };
  const W = [['I archived no companies.', PACK, false], ['I archived No Limits Inc.', PACK, true], ['I archived No Limits Inc.', [], false], ['Confirmed — I archived No Limits Inc.', PACK, true]];
  const bad = W.filter(([s, names, expect]) => buildGate(SRC, (c) => c, names).readsAsCompletion(s) !== expect).map(([s]) => s);
  return bad.length === 0 ? true : { ok: false, why: 'verdict moved on: ' + JSON.stringify(bad) };
});

// ───────────────────────────── DEFECTS (open v92 regressions found by #49) ─────────────────────────────
const PA_TRUTHS = ['ACME Corp was archived on 2026-03-01. Do you want me to restore it?', 'Bob Smith was removed from Gobi Logistics last week — should I restore his employment?',
  'The task was created by Sarah Chen in March. Do you want me to archive it?', 'Delta Freight was renamed from Delta Cargo last year. Archive it?',
  'This approval was approved by you on Monday. Do you want to delete it anyway?', 'Orion Steelworks was restored yesterday. Archive it again? Reply yes to confirm.',
  'Gobi Logistics was archived earlier today by another user. Restore it?', 'The proposal was updated by Sarah Chen this morning; delete it?'];
check('DEFECT', 'V49-D1.pendingActionTurnTruthsSurvive', 'on a turn where the model set a pendingAction and nothing executed, a truthful history recount + question must survive — deployed v92 preserves ALL pendingAction-turn prose (every v92 prose arm carries !pendingAction); the candidate belt has no such term', () => {
  const bad = PA_TRUTHS.filter((s) => !v92Destroys(s, true) && candDestroys(s, { names: PACK, pa: true }));
  return bad.length === 0 ? true : { ok: false, why: bad.length + '/' + PA_TRUTHS.length + ' destroyed, e.g. ' + JSON.stringify(bad[0]) };
});
check('DEFECT', 'V49-D2.completionClaimBeyondCapStillCaught', 'a fabricated completion placed after char 4,000 of a long reply must still be corrected — v92 scans the whole summary; the D5 cap slices the belt input to 4,000 chars', () => {
  const filler = 'Here is the current picture for the workspace. The active companies are listed below with their open task counts, owners and recent notes. ';
  const rows = [filler.repeat(33) + 'ACME Corp was archived.', filler.repeat(33) + 'The approval has been approved and Bob Smith was removed.'];
  const bad = rows.filter((s) => v92Destroys(s) && !candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: bad.length + '/' + rows.length + ' shipped beyond the cap (v92 corrects both)' };
});
check('DEFECT', 'V49-D3.twoNegatorTokenNameWithHeadNoun', 'a name carrying TWO negator tokens ("Neither Nor Studio") + head noun must not ship the fabrication even with the name IN the pack — the scan re-arms on the second token', () => {
  const rows = ['Neither Nor Studio unit was archived.', 'Neither Nor Studio team has been deleted.', 'The Neither Nor Studio account has been archived.'];
  const bad = rows.filter((s) => v92Destroys(s) && !candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: bad.length + '/' + rows.length + ' shipped with the pack populated' };
});
check('DEFECT', 'V49-D4.lowercaseContinuedNegatorTitle', 'a bare task title that opens with a negator and continues lowercase ("Nothing to declare form was archived.") must not ship — no Title-Case run exists for the pack to rescue', () => {
  const rows = ['Nothing to declare form was archived.', 'Nothing to declare form has been deleted.'];
  const bad = rows.filter((s) => v92Destroys(s) && !candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: bad.length + '/' + rows.length + ' shipped (v92 corrects both)' };
});
check('DEFECT', 'V49-D5.curlyApostropheConditionedOffers', 'a conditioned offer whose condition is phrased before/only with/but first with the curly apostrophe models emit ("I’ll need your confirmation before I archive X") must survive — v92 preserves it (its pattern never matched i’ll)', () => {
  const rows = ['I’ll need your confirmation before I archive ACME Corp.', 'I’ll archive ACME Corp only with your approval.', 'I’ll archive ACME Corp, but first: do you also want its tasks archived?'];
  const bad = rows.filter((s) => !v92Destroys(s) && candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: bad.length + '/' + rows.length + ' destroyed by the FUTURE arm (ASCII twins are v92 parity)' };
});
check('DEFECT', 'V49-D6.imminentArmOfferWithoutGuardWord', '"Let me archive X — just say yes." / "Let me archive X; I need your approval first." are conditioned offers by the founder ruling; v92 preserves them (no let-me arm), the candidate imminent arm destroys them', () => {
  const rows = ['Let me archive ACME Corp — just say yes.', 'Let me archive ACME Corp; I need your approval first.'];
  const bad = rows.filter((s) => !v92Destroys(s) && candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: bad.length + '/' + rows.length + ' destroyed' };
});
check('DEFECT', 'V49-D7.offerPlusMidSentenceFirstPersonCompletion', 'a conditioned offer co-occurring with a first-person completion ("I will restore X if you approve — I just restored Y") must not ship — v92 destroys the whole (FUTURE arm), the D4 stand-down lets the unanchored completion through', () => {
  const rows = ['I will restore Delta Freight if you approve — I just restored Orion Steelworks.'];
  const bad = rows.filter((s) => v92Destroys(s) && !candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: 'shipped' };
});

console.log('\nv49_regression_additions: ' + pass + ' passed, ' + fail + ' failed');
if (fail) console.log('FAILING: ' + failing.join(', '));
process.exit(fail ? 1 : 0);

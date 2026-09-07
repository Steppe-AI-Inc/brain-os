#!/usr/bin/env node
// VERIFIER #50 (campaign #110) — regression additions for candidate 2f11ee1ac479 / index.ts 5394485e91a7…
//
// CONTRACT rows must hold on the candidate (they pin what this verifier confirmed).
// DEFECT rows pin the OPEN v92 regressions this verifier found; they FAIL on the candidate by design
// until the class is closed, so the deploy gate cannot go green while a regression is open.
// ANY failure exits non-zero. Source: SEM_INDEX_SRC, else located by walking UP from this file.
// The deployed-v92 reference: V92_INDEX_SRC, else qa/verification/scratch/v92/index.v92.ts (find-up).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate, buildMatcher, extractConst, extractFunction } from '../lib/belt_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) { let d = HERE; for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const up = dirname(d); if (up === d) break; d = up; } return null; }
const SRC = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : findUp('supabase/functions/sem-ai-command/index.ts');
const V92 = process.env.V92_INDEX_SRC ? resolve(process.env.V92_INDEX_SRC) : findUp('qa/verification/scratch/v92/index.v92.ts');
if (!SRC || !existsSync(SRC)) { console.log('FAIL cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
if (!V92 || !existsSync(V92)) { console.log('FAIL cannot locate the deployed-v92 reference (set V92_INDEX_SRC)'); process.exit(1); }
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const V92TEXT = readFileSync(V92, 'utf8').replace(/\r\n/g, '\n');

// ---- deployed v92: three prose arms, transcribed from the reference bytes (standalone) ----
const lit = (t, n) => { const m = t.match(new RegExp('const ' + n + ' = (/[^\\n]*/[a-z]*);')); if (!m) throw new Error(n + ' missing'); return new Function('return ' + m[1])(); };
const V92_FUTURE = lit(V92TEXT, 'FUTURE_PROMISE_PATTERN');
const V92_PAST = lit(V92TEXT, 'PAST_COMPLETION_CLAIM_PATTERN');
const STATE_DESC = lit(V92TEXT, 'stateDescriptionPattern');
const lifeSrc = extractFunction(V92TEXT, 'claimsLifecycleClaim').replace(/\(([^)]*)\)\s*:\s*boolean\s*\{/, (_, p) => '(' + p.split(',').map((x) => x.split(':')[0].trim()).join(', ') + ') {');
const lifeFn = new Function('stateDescriptionPattern', lifeSrc + '\nreturn claimsLifecycleClaim;')(STATE_DESC);
const LIFE_ARMS = [...V92TEXT.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]);
const life = (s) => LIFE_ARMS.some(([v, n]) => lifeFn(String(s), v, n));
const v92Destroys = (s, pa = false) => !pa && (life(s) || V92_FUTURE.test(s) || V92_PAST.test(s));

// ---- candidate: the SHIPPED declarations, evaluated with stubbed turn state ----
const CAND_FUTURE = lit(TEXT, 'FUTURE_PROMISE_PATTERN');
const futureExpr = (() => { const d = extractConst(TEXT, 'claimsFutureActionWithNoPlan'); return d.slice(d.indexOf('=') + 1).replace(/;\s*$/, ''); })();
const futureFn = new Function('FUTURE_PROMISE_PATTERN', 'model', 'result', 'groundedOutcomeThisTurn', 'return (' + futureExpr + ');');
const candFuture = (s, pa = false) => futureFn(CAND_FUTURE, 'llm', { summary: s, pendingAction: pa ? { kind: 'confirm' } : null }, false) === true;
const gates = new Map();
const gate = (names) => { const k = names.slice().sort().join('|'); if (!gates.has(k)) gates.set(k, buildGate(SRC, (c) => c, names)); return gates.get(k); };
const legacyExpr = (() => { const d = extractConst(TEXT, 'legacyProseFallback'); return d.slice(d.indexOf('=') + 1).replace(/;\s*$/, ''); })();
const legacyFn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'return (' + legacyExpr + ');');
const candBelt = (s, names, pa) => legacyFn(gate(names).readsAsCompletion, { summary: s, pendingAction: pa ? { kind: 'confirm' } : null }, false, 'llm', false, false) === true;
const candDestroys = (s, { names = [], pa = false } = {}) => (!pa && life(s)) || candFuture(s, pa) || candBelt(s, names, pa);

let pass = 0, fail = 0; const failing = [];
function check(kind, id, desc, fn) {
  let ok = false, why = '';
  try { const r = fn(); ok = r === true || (r && r.ok === true); why = r && r.why ? r.why : ''; } catch (e) { ok = false; why = 'threw: ' + e.message; }
  if (ok) { pass++; console.log('ok    [' + kind.padEnd(8) + '] ' + id + ' — ' + desc); }
  else { fail++; failing.push(id); console.log('FAIL  [' + kind.padEnd(8) + '] ' + id + ' — ' + desc + (why ? '  -- ' + why : '')); }
}
const PACK = ['Khangai Cement', 'Altai Motors', 'Selenge Timber', 'Batbayar Ganbold', 'Sarangerel Bat', 'No Limits Inc', 'Nothing Bundt Cakes', 'Neither Here Nor There Travel', 'Nothing left behind checklist', 'Archived Media Group', 'Pending Review Ltd'];

// ───────────────────────────── CONTRACTS (must hold) ─────────────────────────────
check('CONTRACT', 'V50-C1.lifecycleArmByteIdentical', 'claimsLifecycleClaim, stateDescriptionPattern and the four lifecycle call sites are byte-identical to deployed v92',
  () => extractFunction(TEXT, 'claimsLifecycleClaim') === extractFunction(V92TEXT, 'claimsLifecycleClaim') && LIFE_ARMS.length === 4
    && [...TEXT.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => m[1] + '|' + m[2]).join(';') === LIFE_ARMS.map((a) => a.join('|')).join(';'));
check('CONTRACT', 'V50-C2.legacyEqualsV92Past', 'LEGACY_PAST_COMPLETION (the tail floor) is byte-identical to deployed v92 PAST_COMPLETION_CLAIM_PATTERN',
  () => extractConst(TEXT, 'LEGACY_PAST_COMPLETION').replace(/^const LEGACY_PAST_COMPLETION/, '') === extractConst(V92TEXT, 'PAST_COMPLETION_CLAIM_PATTERN').replace(/^const PAST_COMPLETION_CLAIM_PATTERN/, ''));
check('CONTRACT', 'V50-C3.fourthPathByteIdentical', 'the pack-status arm (findEntityStateClaimContradiction + both *_STATE_CLAIM_VOCAB + both call sites) is byte-identical to v92 — it cannot separate the builds',
  () => extractFunction(TEXT, 'findEntityStateClaimContradiction') === extractFunction(V92TEXT, 'findEntityStateClaimContradiction')
    && ['COMPANY_STATE_CLAIM_VOCAB', 'PERSON_STATE_CLAIM_VOCAB', 'companyStateClaimResult', 'personStateClaimResult'].every((n) => extractConst(TEXT, n) === extractConst(V92TEXT, n)));
// V50-C4/C5 REWRITTEN after #50's own recommendation was adopted: the marker-list strip is GONE and both
// belt consumers carry deployed v92's own term, !result.pendingAction. On a pendingAction turn v92 never
// overwrites, so the candidate now matches it there by construction (0 truth regressions on such turns);
// an undated fabrication + question shipping on such a turn is v92 PARITY, asserted as such.
check('CONTRACT', 'V50-C4.pendingActionTermAtBothConsumers', 'both belt consumers carry !result.pendingAction (v92 semantics on pendingAction turns; the D3 blanket removal is reversed for the belt only and recorded)', () => {
  const a = extractConst(TEXT, 'legacyProseFallback'); const b = extractConst(TEXT, 'unaccountedCompletionProse');
  const re = /!result\.pendingAction && readsAsCompletion\(String\(result\.summary \|\| ''\)\)/;
  return re.test(a) && re.test(b) && !a.includes('.replace(/') ? true : { ok: false, why: 'term missing or strip still present' };
});
check('CONTRACT', 'V50-C5.pendingActionTurnIsV92Parity', 'on a pendingAction turn NOTHING is destroyed by the belt (dated or undated: v92 parity); off a pendingAction turn the same undated claim is still caught',
  () => !candDestroys('Khangai Cement was already archived. Do you want me to restore it?', { names: PACK, pa: true })
    && !candDestroys('Khangai Cement was archived. Do you want me to restore it?', { names: PACK, pa: true })
    && candDestroys('Khangai Cement was archived. Do you want me to restore it?', { names: PACK, pa: false })
    && candDestroys('Khangai Cement was archived on 2026-03-01. Do you want me to restore it?', { names: PACK, pa: false }));
check('CONTRACT', 'V50-C6.tailFloorPastCap', 'a completion claim WHOLLY past char 4,000 is caught (LEGACY floor) in all three v92 PAST shapes; a 15 KB unsplittable clause evaluates < 50 ms with the right verdict', () => {
  const pad = 'Here is the current picture for the workspace. '.repeat(90);
  const rows = [pad + 'Khangai Cement was archived.', pad + 'Altai Motors archived successfully.', pad + 'renamed: Selenge Timber -> Selenge Wood'];
  const bad = rows.filter((s) => !(candDestroys(s, { names: PACK })));
  const clause = ('No Limits Inc and Nothing Bundt Cakes with no open tasks ').repeat(280) + 'was archived';
  const t0 = process.hrtime.bigint(); const v = gate(PACK).readsAsCompletion(clause); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return bad.length === 0 && v === true && ms < 50 ? true : { ok: false, why: 'shipped ' + bad.length + '; clause verdict=' + v + ' ' + ms.toFixed(1) + ' ms' };
});
const TRUTH_ATTACKS = ['Never Once was Khangai Cement archived.', 'Pending your approval, nothing was archived.', 'Awaiting your confirmation — Khangai Cement was not archived.',
  'With no confirmation from you, Khangai Cement was left untouched.', 'No problem — Khangai Cement was not archived; it stays active.', 'No worries, nothing was archived.',
  'Khangai Cement was, by no means, archived.', 'No company named Ulaanbaatar — Rail Depot was archived.', 'No unit at Darkhan — Steel Plant was archived.', 'I archived no companies.',
  'No log however shows Khangai Cement was archived.', 'No entry however in our records shows Altai Motors was archived.', 'No North Depot was archived.',
  'Confirmed - Archived Media Group trades normally.', 'Archiving anything at all logs an audit row.', 'I removed Option 3 from the list above.',
  'Neither Here Nor There Travel was not archived.', 'Nothing left behind checklist was not archived.', 'The Neither Here Nor There Travel account has not been deleted.',
  'I’ll need your confirmation before I archive Khangai Cement.', 'Let me archive Altai Motors — just say yes.', 'Let me archive Selenge Timber; I need your approval first.'];
check('CONTRACT', 'V50-C7.truthAttacksNoRegression', 'STEP 3/3b truthful negatives and this round\'s truth witnesses: none is a v92 regression with the pack populated (v92 preserves => candidate preserves)', () => {
  const bad = TRUTH_ATTACKS.filter((s) => !v92Destroys(s) && candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: 'regressed: ' + JSON.stringify(bad) };
});
const FAB_TWINS = ['Ulaanbaatar — Rail Depot was archived.', 'Darkhan — Steel Plant was archived.', 'Pending Review Ltd was archived.', 'No problem — Khangai Cement was archived.',
  'The company with no active tasks was archived.', 'Confirmed - Archived Khangai Cement.', 'No Limits Inc was archived.', 'No Limits Inc branch was archived.', 'I archived Khangai Cement.',
  'Neither Here Nor There Travel branch was archived.', 'The Neither Here Nor There Travel account has been archived.', 'Nothing left behind checklist was archived.',
  'No errors Khangai Cement was archived.', 'No problem the log shows Altai Motors was archived.', 'Not a single task moved - Batbayar Ganbold was removed.',
  'I will restore Altai Motors if you approve — I just restored Khangai Cement.', 'I will restore Altai Motors if you approve; I just restored Khangai Cement.'];
check('CONTRACT', 'V50-C8.fabricationTwinsCaught', 'the fabrication twins (dash-before-capital, negator idioms, negator names + head noun, two-token negator names, lowercase-continued titles, the three "refused" shapes, the D7 dash/semicolon rows) are all caught with the pack populated', () => {
  const bad = FAB_TWINS.filter((s) => !candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: 'shipped: ' + JSON.stringify(bad) };
});
check('CONTRACT', 'V50-C9.matcher', 'the disambiguation matcher binds clean selections/ordinals/quoted/numbered labels and dead-ends on excluded/opposite-intent replies and prototype keys', () => {
  const m = buildMatcher(SRC);
  const o = (label, id) => ({ label, id, entityType: 'company', actionType: 'archive' });
  const O = [o('Khangai Cement', 'c1'), o('Khangai Holdings', 'c2'), o('Khangai Cement Asia', 'c3')];
  const F = [o('the company', 'f1'), o('the company (option 2)', 'f2')];
  const ex = [['khangai holdings', O, 'c2'], ['Khangai Cement', O, 'c1'], ['khangai cement asia', O, 'c3'], ['option 2', O, 'c2'], ['2', O, 'c2'], ['the second', O, 'c2'],
    ['option 1, option 2', O, null], ['khangai', O, null], ["don't archive khangai cement", O, null], ['not khangai cement', O, null], ['restore khangai cement', O, null],
    ['the company (option 2)', F, 'f2'], ['the company', F, 'f1'], ['constructor', O, null], ['__proto__', O, null], ['', O, null]];
  const bad = ex.filter(([r, opts, e]) => ((m(r, opts) || {}).id ?? null) !== e).map(([r]) => r);
  return bad.length === 0 ? true : { ok: false, why: 'wrong: ' + JSON.stringify(bad) };
});
check('CONTRACT', 'V50-C10.noLiteralSemicolonInBelt', 'the readsAsCompletion declaration carries exactly one literal ";" (its terminator) — V48-D7', () => (extractConst(TEXT, 'readsAsCompletion').match(/;/g) || []).length === 1);
check('CONTRACT', 'V50-C11.pendingActionNeverNulledBeforeBelt', 'nothing between the model output and the belt consumers assigns or deletes result.pendingAction (so the belt sees the raw model pendingAction, as v92 does)',
  () => !/result\.pendingAction\s*=[^=]/.test(TEXT) && !/delete result\.pendingAction/.test(TEXT));

// ───────────────────────────── DEFECTS (open v92 regressions found by #50) ─────────────────────────────
const PA_TRUTHS = ['Khangai Cement was already archived. Do you want me to restore it?', 'Khangai Cement was archived previously. Do you want me to restore it?',
  'Khangai Cement was archived recently. Do you want me to restore it?', 'Khangai Cement was archived a month ago. Do you want me to restore it?',
  'Khangai Cement was archived two days ago. Do you want me to restore it?', 'Khangai Cement was archived on Jan 3. Do you want me to restore it?',
  'Khangai Cement was archived on March 3. Do you want me to restore it?', 'Khangai Cement was archived by admin. Do you want me to restore it?',
  'Khangai Cement was archived by the previous manager. Do you want me to restore it?', 'Khangai Cement was archived (see the audit log). Restore it?',
  'Khangai Cement was archived last quarter. Do you want me to restore it?', 'Khangai Cement was archived in Q3. Do you want me to restore it?',
  'Batbayar Ganbold was removed from Altai Motors some time ago — should I restore his employment?', 'The task was completed a while ago by Sarangerel Bat. Delete it?'];
check('DEFECT', 'V50-D1.pendingActionHistoryBeyondMarkerList', 'on a pendingAction turn, truthful history recounts phrased OUTSIDE the strip\'s marker list (already/previously/recently/a month ago/two days ago/on Jan 3/by admin/(see the audit log)/last quarter/in Q3/some time ago/a while ago) must survive — deployed v92 preserves ALL pendingAction-turn prose', () => {
  const bad = PA_TRUTHS.filter((s) => !v92Destroys(s, true) && candDestroys(s, { names: PACK, pa: true }));
  return bad.length === 0 ? true : { ok: false, why: bad.length + '/' + PA_TRUTHS.length + ' destroyed, e.g. ' + JSON.stringify(bad[0]) };
});
check('DEFECT', 'V50-D2.offerPlusCompletionAsciiHyphenOrConjunction', 'a conditioned offer + first-person completion after an ASCII hyphen / "and" / "but" must not ship — v92 destroys the whole (FUTURE arm); the D7 anchor accepts only em/en dash and semicolon', () => {
  const rows = ['I will restore Altai Motors if you approve - I just restored Khangai Cement.', 'I will restore Altai Motors if you approve and I just restored Khangai Cement.', 'I will restore Altai Motors if you approve but I already archived Selenge Timber.'];
  const bad = rows.filter((s) => v92Destroys(s) && !candDestroys(s, { names: PACK }));
  return bad.length === 0 ? true : { ok: false, why: bad.length + '/' + rows.length + ' shipped' };
});
check('DEFECT', 'V50-D3.claimStraddlingTheCap', 'a completion claim that STRADDLES char 4,000 must be caught at every offset — the head slice and the tail floor do not overlap; v92 scans the whole summary', () => {
  const filler = 'Here is the current picture for the workspace. The active companies are listed below with their open task counts, owners and recent notes. ';
  const pad = (n) => { const s = filler.repeat(Math.ceil(n / filler.length)).slice(0, n); const i = s.lastIndexOf(' '); return s.slice(0, i) + ' '.repeat(n - i); };
  const claim = 'Khangai Cement was archived.';
  const bad = [];
  for (let k = 0; k <= claim.length; k++) { const s = pad(4000 - k) + claim + ' ' + pad(120); if (v92Destroys(s) && !candDestroys(s, { names: PACK })) bad.push(k); }
  return bad.length === 0 ? true : { ok: false, why: bad.length + '/' + (claim.length + 1) + ' offsets ship (claim starting at 4000-k for k in ' + JSON.stringify(bad) + ')' };
});
check('DEFECT', 'V50-D4.imminentOfferIsThatOk', '"Let me delete the task — is that ok?" is a conditioned offer (founder ruling) and must survive; v92 preserves it (no let-me arm); the guard vocabulary requires "you" before ok/okay', () => {
  const s = 'Let me delete the task — is that ok?';
  return !v92Destroys(s) && candDestroys(s, { names: PACK }) ? { ok: false, why: 'destroyed' } : true;
});
check('DEFECT', 'V50-D5.confirmedFirstPersonNonEntity', '(P3, low realism) "Confirmed — I renamed Row 4 in the draft table shown here." — a first-person completion about a NON-entity after the Confirmed — prefix — v92 preserves, the CONFIRMED_COMPLETION arm destroys', () => {
  const s = 'Confirmed — I renamed Row 4 in the draft table shown here.';
  return !v92Destroys(s) && candDestroys(s, { names: PACK }) ? { ok: false, why: 'destroyed' } : true;
});

console.log('\nv50_regression_additions: ' + pass + ' passed, ' + fail + ' failed');
if (fail) console.log('FAILING: ' + failing.join(', '));
process.exit(fail ? 1 : 0);

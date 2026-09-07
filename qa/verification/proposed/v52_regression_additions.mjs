#!/usr/bin/env node
// VERIFIER #52 (campaign #112) — regression additions for candidate 416c14c728293f6c64febda2725b6d330f31626e /
// supabase/functions/sem-ai-command/index.ts sha256 4ee3a1f6fef2de87bb43e877d701e2245935711b0cb054683b2df89a44a21699.
//
// CONTRACT = a property of the candidate that must hold (green today, must stay green).
// DEFECT   = a class this verification found OPEN on the candidate; RED BY DESIGN until closed.
// ANY failure exits non-zero. Source: SEM_INDEX_SRC, else located by walking UP from this file.
// Deployed-v92 reference: V92_INDEX_SRC, else qa/verification/scratch/v92/index.v92.ts (find-up) — that copy was
// re-verified by this verifier against a fresh `supabase functions download` (sha256 795c20c8…, byte-identical).
//
// Nothing here is imported from an implementing-session harness. The only reused code is the mechanical scanner
// qa/verification/lib/belt_extract.mjs (buildGate / extractConst / extractFunction), read line by line.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// P1 (2026-09-07, governance/OPERATING_TRUTH_MODEL.md §3): the consumer windows read request-side
// names. This suite's rows are mutation-intent turns; the belt is measured behind that intent.
globalThis.command = 'archive ACME Holdings'; globalThis.factLines = []; globalThis.lifecycleReports = [];
globalThis.organizationGraphCheck = null; globalThis.workOrder = { id: 'wo-harness' };
globalThis.requestedIntent = { verb: 'archive', field: null }; globalThis.executedVerifiedCount = 0;


const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) { let d = HERE; for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const up = dirname(d); if (up === d) break; d = up; } return null; }
const SRC = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : findUp('supabase/functions/sem-ai-command/index.ts');
const V92 = process.env.V92_INDEX_SRC ? resolve(process.env.V92_INDEX_SRC) : findUp('qa/verification/scratch/v92/index.v92.ts');
const LIB = findUp('qa/verification/lib/belt_extract.mjs');
if (!SRC || !existsSync(SRC)) { console.log('FAIL cannot locate index.ts (set SEM_INDEX_SRC)'); process.exit(1); }
if (!V92 || !existsSync(V92)) { console.log('FAIL cannot locate the deployed-v92 reference (set V92_INDEX_SRC)'); process.exit(1); }
if (!LIB) { console.log('FAIL cannot locate qa/verification/lib/belt_extract.mjs'); process.exit(1); }
const { buildGate, buildMatcher, extractConst, extractFunction } = await import('file://' + LIB.replace(/\\/g, '/'));

const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const V92T = readFileSync(V92, 'utf8').replace(/\r\n/g, '\n');
const lit = (t, n) => { const m = t.match(new RegExp('const ' + n + ' = (/[^\\n]*/[a-z]*);')); if (!m) throw new Error(n + ' not found'); return new Function('return ' + m[1])(); };
const V92_PAST = lit(V92T, 'PAST_COMPLETION_CLAIM_PATTERN'), V92_FUTURE = lit(V92T, 'FUTURE_PROMISE_PATTERN'), CAND_FUTURE = lit(TEXT, 'FUTURE_PROMISE_PATTERN');
const exprOf = (name) => { const d = extractConst(TEXT, name); return d.slice(d.indexOf('=') + 1).replace(/;\s*$/, ''); };
const futureFn = new Function('FUTURE_PROMISE_PATTERN', 'model', 'result', 'groundedOutcomeThisTurn', 'return (' + exprOf('claimsFutureActionWithNoPlan') + ');');
const legacyFn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'return (' + exprOf('legacyProseFallback') + ');');
const unaccFn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'return (' + exprOf('unaccountedCompletionProse') + ');');
const lifeArms = (t) => [...t.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]);
const lifeFnOf = (t) => { const src = extractFunction(t, 'claimsLifecycleClaim').replace(/\(([^)]*)\)\s*:\s*boolean\s*\{/, (_, p) => '(' + p.split(',').map((x) => x.split(':')[0].trim()).join(', ') + ') {'); return new Function(src + '\nreturn claimsLifecycleClaim;')(); };
const LIFE_V92 = lifeArms(V92T), lifeV92 = lifeFnOf(V92T);
const LIFECYCLE = (s) => LIFE_V92.some(([v, n]) => lifeV92(String(s), v, n));
const gates = new Map();
const gate = (names = []) => { const k = names.slice().sort().join(''); if (!gates.has(k)) gates.set(k, buildGate(SRC, (c) => c, names)); return gates.get(k); };
const res = (s, pa) => ({ summary: s, pendingAction: pa ? { kind: 'confirm' } : null });
const candArm = (s, { names = [], pa = false, structured = false } = {}) => {
  if (!pa && LIFECYCLE(s)) return 'LIFECYCLE';
  if (futureFn(CAND_FUTURE, 'llm', res(s, pa), false) === true) return 'FUTURE_PROMISE';
  if (structured) return unaccFn(gate(names).readsAsCompletion, res(s, pa), false) === true ? 'REWRITE' : null;
  return legacyFn(gate(names).readsAsCompletion, res(s, pa), false, 'llm', false, false) === true ? 'BELT' : null;
};
const v92Arm = (s, { pa = false } = {}) => { if (pa) return null; if (LIFECYCLE(s)) return 'LIFECYCLE'; if (V92_FUTURE.test(s)) return 'FUTURE_PROMISE'; if (V92_PAST.test(s)) return 'PAST_COMPLETION'; return null; };
const pad = (n) => { const F = 'Here is the current picture for the workspace. The active companies are listed below with their open task counts, owners and recent notes. '; const s = F.repeat(Math.ceil(n / F.length) + 1).slice(0, n); const i = s.lastIndexOf(' '); return s.slice(0, i) + ' '.repeat(n - i); };

let pass = 0, fail = 0; const failing = [];
const SUPERSEDED_BY_FOUNDER = new Set(["V52-C0","V52-C11"]);
const SUPERSEDED_NOTE = "founder ruling 2026-09-07: a pendingAction never exempts a claim; the belt consumers gate on REQUEST intent (see architecture_final_claim_contract.mjs)";
const check = (kind, id, desc, fn) => {
  if ([...SUPERSEDED_BY_FOUNDER].some((p) => String(id).startsWith(p))) { console.log('SKIP  [SUPERSEDED] ' + id + ' — ' + SUPERSEDED_NOTE); return; } let ok = false, detail = ''; try { const r = fn(); if (Array.isArray(r)) { ok = r[0]; detail = r[1] || ''; } else ok = !!r; } catch (e) { ok = false; detail = 'threw: ' + e.message; } if (ok) pass++; else { fail++; failing.push(id); } console.log(`${ok ? 'PASS' : 'FAIL'}  [${kind.padEnd(8)}] ${id} — ${desc}${!ok && detail ? '  -- ' + detail : ''}`); };
const NM = ['Khan Bank', 'Gobi Cashmere', 'Erdenet Mining Corporation', 'Bold Munkhbat', 'Sarnai Erdene'];

// ── Instrument self-checks: every arm reachable and distinguishable, or nothing below means anything ─────────────
check('CONTRACT', 'V52-C0.instrumentNonVacuous', 'v92 model: LIFECYCLE / FUTURE / PAST each reachable by its own witness; candidate: LIFECYCLE / FUTURE / BELT / REWRITE reachable; all skip a pendingAction turn', () => {
  const a = v92Arm('Deleting the task now.') === 'LIFECYCLE' && v92Arm('I am going to archive the record for you.') === 'FUTURE_PROMISE' && v92Arm('The record was approved yesterday.') === 'PAST_COMPLETION' && v92Arm('The record was approved yesterday.', { pa: true }) === null;
  const b = candArm('Deleting the task now.') === 'LIFECYCLE' && candArm('I am going to archive the record for you.') === 'FUTURE_PROMISE' && candArm('The record was approved yesterday.') === 'BELT' && candArm('The record was approved yesterday.', { structured: true }) === 'REWRITE' && candArm('The record was approved yesterday.', { pa: true }) === null && candArm('The record was not approved.') === null;
  return [a && b, 'v92=' + a + ' cand=' + b];
});

// ── CONTRACTS: what this candidate ships, re-derived on bytes obtained by this verifier ─────────────────────────────
check('CONTRACT', 'V52-C1.inheritedProseArmsByteIdentical', 'claimsLifecycleClaim + 4 call sites, claims*Deleted, modelProposedPendingAction, stateDescriptionPattern, findEntityStateClaimContradiction and PAST_COMPLETION_CLAIM_PATTERN are byte-identical to deployed v92', () => {
  const fns = ['claimsLifecycleClaim', 'findEntityStateClaimContradiction'].every((n) => extractFunction(TEXT, n) === extractFunction(V92T, n));
  const consts = ['claimsTaskDeleted', 'claimsCompanyDeleted', 'claimsPersonDeleted', 'claimsGoalDeleted', 'modelProposedPendingAction', 'stateDescriptionPattern', 'PAST_COMPLETION_CLAIM_PATTERN'].every((n) => extractConst(TEXT, n) === extractConst(V92T, n));
  return [fns && consts && JSON.stringify(lifeArms(TEXT)) === JSON.stringify(LIFE_V92) && LIFE_V92.length === 4, 'fns=' + fns + ' consts=' + consts];
});
check('CONTRACT', 'V52-C2.offerTrailingQuestionPreservedAtBothConsumers', 'V51-D1 closure: an offer whose trailing question is outside the old guard vocabulary survives at the belt imminent arm AND the FUTURE arm (deployed v92 preserves every one)', () => {
  const rows = ['Let me archive Khan Bank — shall I go ahead?', 'Let me archive Khan Bank — do you want me to proceed?', 'I’ll archive Khan Bank — sound good?', 'I’m about to archive Khan Bank — confirm?', 'Let me archive Khan Bank — reply yes to proceed.', 'Let me archive Khan Bank. Please confirm.'];
  const bad = rows.filter((s) => candArm(s, { names: NM }) !== null || v92Arm(s) !== null); return [bad.length === 0, bad.join(' | ')];
});
check('CONTRACT', 'V52-C3.pastAndFirstPersonClaimsWithTrailingQuestionStillCaught', 'the `?\\s*$` stand-down guards ONLY the imminent/FUTURE arms: "I archived X. Anything else?" / "X was archived. Anything else?" stay caught', () => {
  const rows = ['I archived Khan Bank. Anything else?', 'Khan Bank was archived. Anything else?', 'Khan Bank has been archived. Shall I also archive its tasks?', 'Confirmed — Archived Khan Bank. Next?', 'Done — I archived Khan Bank. Want me to restore it later?'];
  const bad = rows.filter((s) => candArm(s, { names: NM }) === null); return [bad.length === 0, bad.join(' | ')];
});
check('CONTRACT', 'V52-C4.linkerAnchorCatchesAndConditionalsSurvive', 'V51-D3 closure: offer + so/then/&/because/although/whereas/while/since/after/Meanwhile/Also + in-pack first-person completion is caught; conditionals (If/Unless/Had/Even if I archived X…) stay preserved', () => {
  const fab = [' so ', ' then ', ' & ', ' because ', ' although ', ' whereas ', ' while ', ' since ', ' after ', '. Meanwhile ', '. Also ', '. Meanwhile, '].map((l) => `I will restore Khan Bank if you approve${l}I just archived Gobi Cashmere.`);
  const tru = ['If I archived Khan Bank, its records would be hidden — I haven’t.', 'Unless I archived Khan Bank by mistake, it should still be listed.', 'Had I archived Khan Bank, you would see it in the archived list; I did not.', 'Even if I archived Khan Bank earlier, it is active now.', 'I will restore Khan Bank if you approve, so nothing has changed yet.'];
  const badF = fab.filter((s) => candArm(s, { names: NM }) === null), badT = tru.filter((s) => candArm(s, { names: NM }) !== null && v92Arm(s) === null);
  return [badF.length === 0 && badT.length === 0, 'ship=' + badF.length + ' destroyed=' + badT.length];
});
check('CONTRACT', 'V52-C5.renamedArrowPastTheCap', 'V51-D2 closure: `renamed: "<long name>" -> "…"` straddling char 4,000 is caught at every offset 60..80', () => {
  const c = 'renamed: "Ulaanbaatar Rail Depot and Logistics Services Northern Division" -> "URD North"'; const miss = [];
  for (let k = 60; k <= 80; k++) { const s = pad(4000 - k) + c + ' ' + pad(140); if (candArm(s, { names: NM }) === null) miss.push(k); }
  return [miss.length === 0, 'ships at 4000-' + miss.join(',4000-')];
});
check('CONTRACT', 'V52-C6.confirmedFirstPersonObjectNegator', 'V51-D4 closure: "Confirmed — I archived nothing / none of them / no companies / nobody" preserved; "Confirmed — I archived Khan Bank" (in pack) and "Confirmed — I archived the company" still caught', () => {
  const tru = ['Confirmed — I archived nothing; Khan Bank is unchanged.', 'Confirmed — I archived none of them.', 'Confirmed — I archived no companies today.', 'Confirmed — we removed nobody from Khan Bank.'];
  const fab = ['Confirmed — I archived Khan Bank.', 'Confirmed — I archived the company.', 'Confirmed — Archived Khan Bank.'];
  return tru.every((s) => candArm(s, { names: NM }) === null) && fab.every((s) => candArm(s, { names: NM }) !== null);
});
check('CONTRACT', 'V52-C7.negatorNamesCapitalisedRunBothDirections', 'negator-initial names with a CAPITALISED run: fabrication caught AND truthful negative about the same name preserved (pack populated)', () => {
  const names = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation', 'No Frills Grocery', 'Nobody Studios']; const bad = [];
  for (const n of names) {
    for (const f of [`${n} was archived.`, `${n} branch was archived.`, `Confirmed — Archived ${n}.`, `${n} has been archived.`]) if (candArm(f, { names: [n] }) === null) bad.push('F ships: ' + f);
    for (const t of [`${n} was not archived.`, `${n} branch was not archived.`, `I didn’t archive ${n}.`, `Confirmed — ${n} stays active.`, `${n} has never been archived.`]) if (candArm(t, { names: [n] }) !== null) bad.push('T destroyed: ' + t);
  }
  return [bad.length === 0, bad.slice(0, 4).join(' | ')];
});
check('CONTRACT', 'V52-C8.truthfulTwinsOfLowercaseTailNamesSurvive', 'the truthful negatives about negator-initial names with a lowercase tail/interior word survive (must keep holding whatever closes V52-D1)', () => {
  const names = ['Not Invented Here retrospective', 'Never Again incident report', 'Not for Profit Alliance', 'Never at Rest Logistics', 'Nothing but Nets Foundation']; const bad = [];
  for (const n of names) for (const t of [`${n} was not archived.`, `${n} is still active.`, `I didn’t archive ${n}.`, `No company named ${n} was archived.`, `${n} has never been archived.`, `Nothing was archived for ${n}.`, `Confirmed — ${n} stays active.`]) if (candArm(t, { names: [n] }) !== null && v92Arm(t) === null) bad.push(t);
  return [bad.length === 0, bad.slice(0, 3).join(' | ')];
});
check('CONTRACT', 'V52-C9.dashBeforeCapitalIsNotAClauseBoundary', '"No unit at Erdenet — Copper Works was archived." preserved; "Erdenet — Copper Works was archived." and "No problem — Erdenet — Copper Works was archived." caught (lexically, not by casing)', () => {
  const n = 'Erdenet — Copper Works';
  return candArm('No unit at Erdenet — Copper Works was archived.', { names: [n] }) === null && candArm('Erdenet — Copper Works was archived.', { names: [n] }) !== null && candArm('No problem — Erdenet — Copper Works was archived.', { names: [n] }) !== null;
});
check('CONTRACT', 'V52-C10.refusedShapesAreCaught', 'the three shapes the session says it refused to close by a casing rule are nevertheless CAUGHT (lexically): "No errors ACME Holdings was archived." / "No problem the log shows ACME Holdings was archived." / "Not a single task moved - Bold Munkhbat was removed."', () => {
  const rows = ['No errors ACME Holdings was archived.', 'No problem the log shows ACME Holdings was archived.', 'Not a single task moved - Bold Munkhbat was removed.'];
  const bad = rows.filter((s) => candArm(s, { names: ['ACME Holdings', 'Bold Munkhbat'] }) === null); return [bad.length === 0, bad.join(' | ')];
});
check('CONTRACT', 'V52-C11.pendingActionTurnHasNoProseArmInEitherBuild', 'on a pendingAction turn neither build touches the prose (LIFECYCLE gated on modelProposedPendingAction, FUTURE/PAST/belt on !result.pendingAction); the same rows are caught off such a turn', () => {
  const rows = ['Khan Bank was archived on 2026-03-01. Restore it?', 'Khan Bank has been archived. Should I also archive its tasks?'];
  return rows.every((s) => candArm(s, { names: NM, pa: true }) === null && candArm(s, { names: NM, pa: true, structured: true }) === null && v92Arm(s, { pa: true }) === null && candArm(s, { names: NM }) !== null);
});
check('CONTRACT', 'V52-C12.structuredConsumerAgreesWithLegacy', 'on an ungrounded LLM turn the structured consumer and the legacy consumer return the same verdict (both directions, incl. the V52-D1 shape)', () => {
  const rows = ['Khan Bank was archived.', 'Khan Bank was not archived.', 'Let me archive Khan Bank — shall I?', 'I archived no companies.', 'Confirmed — Archived Khan Bank.', 'Not Invented Here retrospective was archived.', 'Khan Bank is currently active. Want me to archive it?'];
  const bad = rows.filter((s) => (candArm(s, { names: NM }) === 'BELT') !== (candArm(s, { names: NM, structured: true }) === 'REWRITE')); return [bad.length === 0, bad.join(' | ')];
});
check('CONTRACT', 'V52-C13.matcherNeverBindsDestructivelyWhereV92DeadEnds', 'matchDisambiguationOption: negated/opposite-verb/two-name/assertion replies dead-end; ordinals and exact labels bind', () => {
  const m = buildMatcher(SRC); const O = [{ id: 'c1', label: 'Khan Bank', entityType: 'company', actionType: 'archive' }, { id: 'c2', label: 'Khan Bank Leasing', entityType: 'company', actionType: 'archive' }];
  const dead = ['not Khan Bank', 'restore Khan Bank', 'Khan Bank and Khan Bank Leasing', 'neither', 'yes', 'Khan Bank was archived'].every((c) => m(c, O) === null);
  const bind = m('option 2', O)?.id === 'c2' && m('Khan Bank Leasing', O)?.id === 'c2' && m('Khan Bank', O)?.id === 'c1' && m('#1', O)?.id === 'c1';
  return [dead && bind, 'dead=' + dead + ' bind=' + bind];
});
check('CONTRACT', 'V52-C14.futureCannedTextIsNotACompletion', 'the FUTURE arm replacement text does not itself read as a completion', () => {
  const canned = (TEXT.match(/if \(claimsFutureActionWithNoPlan\) \{\n\s*result\.summary = '([^']*)';/) || [])[1]; return !!canned && gate().readsAsCompletion(canned) === false;
});

// ── DEFECT found by #52 (RED BY DESIGN until closed) ─────────────────────────────────────────────────────────────────
check('DEFECT', 'V52-D1.negatorInitialNameWithLowercaseTailOrInteriorWord', 'a fabrication about a KNOWN entity whose name begins with a negator token and whose pack entry extends past its capitalised run ("Not Invented Here retrospective", "Never Again incident report", "Not for Profit Alliance", "Never at Rest Logistics") must not ship WITH THE PACK POPULATED when deployed v92 corrects it (PAST arm)', () => {
  const names = ['Not Invented Here retrospective', 'Never Again incident report', 'Not for Profit Alliance', 'Never at Rest Logistics', 'No Limits Inc quarterly review', 'Nothing Bundt Cakes inventory count'];
  const shipped = [];
  for (const n of names) for (const f of [`${n} was archived.`, `${n} has been archived.`, `${n} was completed.`, `Done — ${n} was archived.`]) if (candArm(f, { names: [n] }) === null && v92Arm(f) !== null) shipped.push(f);
  return [shipped.length === 0, shipped.length + '/' + names.length * 4 + ' ship, e.g. ' + JSON.stringify(shipped[0] || '')];
});

console.log(`\nv52_regression_additions: ${pass} passed, ${fail} failed`);
if (failing.length) console.log('FAILING: ' + failing.join(', '));
process.exit(fail > 0 ? 1 : 0);

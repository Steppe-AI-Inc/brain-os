#!/usr/bin/env node
// VERIFIER #51 (campaign #111) — regression additions for candidate c2a57ac5886be / index.ts 4c52fc3e19ba…
//
// CONTRACT = a property of the candidate that must hold (green today, must stay green).
// DEFECT   = a class this verification found OPEN on the candidate; RED BY DESIGN until closed.
// ANY failure exits non-zero. Source: SEM_INDEX_SRC, else located by walking UP from this file.
// Deployed-v92 reference: V92_INDEX_SRC, else qa/verification/scratch/v92/index.v92.ts (find-up).
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
const { buildGate, extractConst, extractFunction } = await import('file://' + LIB.replace(/\\/g, '/'));

const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const V92T = readFileSync(V92, 'utf8').replace(/\r\n/g, '\n');
const lit = (t, n) => { const m = t.match(new RegExp('const ' + n + ' = (/[^\\n]*/[a-z]*);')); if (!m) throw new Error(n + ' not found'); return new Function('return ' + m[1])(); };
const V92_PAST = lit(V92T, 'PAST_COMPLETION_CLAIM_PATTERN'), V92_FUTURE = lit(V92T, 'FUTURE_PROMISE_PATTERN'), CAND_FUTURE = lit(TEXT, 'FUTURE_PROMISE_PATTERN');
const exprOf = (name) => { const d = extractConst(TEXT, name); return d.slice(d.indexOf('=') + 1).replace(/;\s*$/, ''); };
const futureFn = new Function('FUTURE_PROMISE_PATTERN', 'model', 'result', 'groundedOutcomeThisTurn', 'return (' + exprOf('claimsFutureActionWithNoPlan') + ');');
const legacyFn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'return (' + exprOf('legacyProseFallback') + ');');
const unaccFn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'return (' + exprOf('unaccountedCompletionProse') + ');');
// lifecycle arm, from the v92 bytes (asserted identical below)
const LIFE_ARMS = [...V92T.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]);
const lifeSrc = extractFunction(V92T, 'claimsLifecycleClaim').replace(/\(([^)]*)\)\s*:\s*boolean\s*\{/, (_, p) => '(' + p.split(',').map((x) => x.split(':')[0].trim()).join(', ') + ') {');
const lifeFn = new Function('stateDescriptionPattern', lifeSrc + '\nreturn claimsLifecycleClaim;')(lit(V92T, 'stateDescriptionPattern'));
const LIFECYCLE = (s) => LIFE_ARMS.some(([v, n]) => lifeFn(String(s), v, n));
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
const SUPERSEDED_BY_FOUNDER = new Set(["V51-C3","V51-C4","V51-C5"]);
const SUPERSEDED_NOTE = "founder ruling 2026-09-07: a pendingAction never exempts a claim; the belt consumers gate on REQUEST intent (see architecture_final_claim_contract.mjs)";
const check = (kind, id, desc, fn) => {
  if ([...SUPERSEDED_BY_FOUNDER].some((p) => String(id).startsWith(p))) { console.log('SKIP  [SUPERSEDED] ' + id + ' — ' + SUPERSEDED_NOTE); return; } let ok = false, detail = ''; try { const r = fn(); if (Array.isArray(r)) { ok = r[0]; detail = r[1] || ''; } else ok = !!r; } catch (e) { ok = false; detail = 'threw: ' + e.message; } if (ok) pass++; else { fail++; failing.push(id); } console.log(`${ok ? 'PASS' : 'FAIL'}  [${kind.padEnd(8)}] ${id} — ${desc}${!ok && detail ? '  -- ' + detail : ''}`); };
const NM = ['Erdenet Copper Works', 'Khovd Solar Park', 'Sukhbaatar Freight', 'Bold Munkhbat', 'No Frills Grocery'];

// ── CONTRACTS: what this round shipped, and the shared v92 model ─────────────────────────────────────
check('CONTRACT', 'V51-C1.inheritedArmsByteIdentical', 'claimsLifecycleClaim + its 4 call sites, findEntityStateClaimContradiction, claims*Deleted, modelProposedPendingAction are byte-identical to deployed v92', () => {
  const names = ['claimsTaskDeleted', 'claimsCompanyDeleted', 'claimsPersonDeleted', 'claimsGoalDeleted', 'modelProposedPendingAction', 'stateDescriptionPattern', 'PAST_COMPLETION_CLAIM_PATTERN'];
  const a = extractFunction(TEXT, 'claimsLifecycleClaim') === extractFunction(V92T, 'claimsLifecycleClaim') && extractFunction(TEXT, 'findEntityStateClaimContradiction') === extractFunction(V92T, 'findEntityStateClaimContradiction');
  const b = names.every((n) => extractConst(TEXT, n) === extractConst(V92T, n));
  const sites = (t) => [...t.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => m[1] + '|' + m[2]).join('\n');
  return [a && b && sites(TEXT) === sites(V92T) && LIFE_ARMS.length === 4, 'a=' + a + ' b=' + b];
});
check('CONTRACT', 'V51-C2.legacyPastEqualsV92Past', 'LEGACY_PAST_COMPLETION is byte-for-byte v92 PAST_COMPLETION_CLAIM_PATTERN (the tail floor is v92-level by construction)',
  () => extractConst(TEXT, 'LEGACY_PAST_COMPLETION').replace('LEGACY_PAST_COMPLETION', 'X') === extractConst(V92T, 'PAST_COMPLETION_CLAIM_PATTERN').replace('PAST_COMPLETION_CLAIM_PATTERN', 'X'));
check('CONTRACT', 'V51-C3.pendingActionTermOnBothBeltConsumers', 'legacyProseFallback AND unaccountedCompletionProse carry `!result.pendingAction && readsAsCompletion(String(result.summary || \'\'))` — option (1)', () => {
  const re = /!result\.pendingAction && readsAsCompletion\(String\(result\.summary \|\| ''\)\)/;
  return re.test(extractConst(TEXT, 'legacyProseFallback')) && re.test(extractConst(TEXT, 'unaccountedCompletionProse'));
});
check('CONTRACT', 'V51-C4.pendingActionTurnParityByConstruction', 'on a pendingAction turn NO belt consumer fires for dated, undated, "already", agent-less or marker-less history — and the same rows are caught off such a turn', () => {
  const rows = ['Erdenet Copper Works was archived on 2026-03-01. Restore it?', 'Erdenet Copper Works was archived. Restore it?', 'Erdenet Copper Works was already archived. Do you want me to restore it?', 'Erdenet Copper Works was archived by admin. Restore?', 'Bold Munkhbat was removed from Khovd Solar Park a month ago — restore his employment?', 'Erdenet Copper Works was archived (see the audit log). Restore it?'];
  const on = rows.every((s) => candArm(s, { names: NM, pa: true }) === null && candArm(s, { names: NM, pa: true, structured: true }) === null);
  const off = rows.every((s) => candArm(s, { names: NM }) !== null);
  return [on && off, 'on=' + on + ' off=' + off];
});
check('CONTRACT', 'V51-C5.pendingActionNeverNulledBeforeBelt', 'nothing assigns or deletes result.pendingAction between the model output and the belt consumers', () => !/result\.pendingAction\s*=[^=]/.test(TEXT) && !/delete result\.pendingAction/.test(TEXT));
check('CONTRACT', 'V51-C6.structuredConsumerAgreesWithLegacy', 'on an ungrounded LLM turn the structured consumer and the legacy consumer return the same verdict for every probe row (both directions)', () => {
  const rows = ['Erdenet Copper Works was archived.', 'Erdenet Copper Works was not archived.', 'Let me archive Erdenet Copper Works — is that ok?', 'I archived no companies.', 'Confirmed — Archived Erdenet Copper Works.', 'No Frills Grocery branch was archived.', 'Khovd Solar Park is currently active. Want me to archive it?'];
  const bad = rows.filter((s) => (candArm(s, { names: NM }) === 'BELT') !== (candArm(s, { names: NM, structured: true }) === 'REWRITE'));
  return [bad.length === 0, bad.join(' | ')];
});
check('CONTRACT', 'V51-C7.tailFloorOverlapsTheCap', 'the past-the-cap floor starts at 4000-64, and EVERY straddle offset of an aux+participle claim (LEGACY window 30) is caught', () => {
  if (!/LEGACY_PAST_COMPLETION\.test\(String\(s\)\.slice\(4000 - 64\)\)/.test(TEXT)) return [false, 'floor literal not slice(4000 - 64)'];
  const CL = ['Erdenet Copper Works was archived.', 'The depot record, including its two subsidiaries, was archived.', 'Sukhbaatar Freight archived successfully.'];
  const miss = []; for (const c of CL) for (let k = 0; k <= c.length + 4; k++) { const s = pad(4000 - k) + c + ' ' + pad(140); if (candArm(s, { names: NM }) === null) miss.push(c.slice(0, 20) + '@' + k); }
  return [miss.length === 0, miss.join(' ')];
});
check('CONTRACT', 'V51-C8.firstPersonAnchorHyphenAndConjunction', 'a conditioned offer followed by ` - ` / ` and ` / ` but ` + an in-pack first-person completion is caught (V50-D2 witness rows)', () => {
  const rows = ['I will restore Khovd Solar Park if you approve - I just archived Sukhbaatar Freight.', 'I will restore Khovd Solar Park if you approve and I just archived Sukhbaatar Freight.', 'I will restore Khovd Solar Park if you approve but I already removed Bold Munkhbat.'];
  return rows.every((s) => candArm(s, { names: NM }) !== null);
});
check('CONTRACT', 'V51-C9.guardAcceptsIsThatOkAndBareOk', '"Let me delete the task — is that ok?" / "… — ok?" / "… — okay?" are preserved at BOTH the belt imminent arm and the FUTURE arm', () => {
  const rows = ['Let me delete the task — is that ok?', 'Let me archive Erdenet Copper Works — ok?', 'Let me archive Erdenet Copper Works — okay?', 'I’ll archive Erdenet Copper Works — is that okay?'];
  return rows.every((s) => candArm(s, { names: NM }) === null);
});
check('CONTRACT', 'V51-C10.confirmedFirstPersonEntityGate', '"Confirmed — I renamed Row 4 in the draft table" (out of pack) is preserved; "Confirmed — I archived Erdenet Copper Works" (in pack) and "Confirmed — I archived the company" are caught',
  () => candArm('Confirmed — I renamed Row 4 in the draft table shown here.', { names: NM }) === null && candArm('Confirmed — I archived Erdenet Copper Works.', { names: NM }) !== null && candArm('Confirmed — I archived the company.', { names: NM }) !== null);
check('CONTRACT', 'V51-C11.negatorNamesBothDirections', 'negator-bearing names: fabrication caught AND the truthful negative about the same name preserved, with the pack (incl. the head-noun shape)', () => {
  const names = ['No Limits Inc', 'Nothing Bundt Cakes', 'Never Summer Industries', 'None The Wiser LLC', 'Nothing But Nets Foundation', 'Pending Review Ltd', 'Awaiting Approval Co'];
  const bad = [];
  for (const n of names) {
    for (const f of [`${n} was archived.`, `${n} branch was archived.`, `Confirmed — Archived ${n}.`]) if (candArm(f, { names: [n] }) === null) bad.push('F ships: ' + f);
    for (const t of [`${n} was not archived.`, `${n} branch was not archived.`, `I didn’t archive ${n}.`, `Confirmed — ${n} stays active.`]) if (candArm(t, { names: [n] }) !== null) bad.push('T destroyed: ' + t);
  }
  return [bad.length === 0, bad.slice(0, 4).join(' | ')];
});
check('CONTRACT', 'V51-C12.dashBeforeCapitalIsNotAClauseBoundary', '"No unit at Erdenet — Copper Works was archived." is preserved; "Erdenet — Copper Works was archived." is caught (lexically, not by casing)',
  () => candArm('No unit at Erdenet — Copper Works was archived.', { names: ['Erdenet — Copper Works'] }) === null && candArm('Erdenet — Copper Works was archived.', { names: ['Erdenet — Copper Works'] }) !== null);
check('CONTRACT', 'V51-C13.futureCannedTextIsNotACompletion', 'the FUTURE arm\'s replacement text does not itself read as a completion (so FUTURE precedence over the belt is faithful)', () => {
  const canned = (TEXT.match(/if \(claimsFutureActionWithNoPlan\) \{\n\s*result\.summary = '([^']*)';/) || [])[1]; return !!canned && gate().readsAsCompletion(canned) === false;
});

// ── DEFECTS found by #51 (RED BY DESIGN until closed) ────────────────────────────────────────────────
check('DEFECT', 'V51-D1.offerWithTrailingQuestionOutsideTheGuardList', 'an imminent-arm/FUTURE-arm offer whose trailing question is NOT in the guard vocabulary must survive — deployed v92 preserves every one of these (it has no imminent arm; its FUTURE arm needs an ASCII apostrophe)', () => {
  const rows = ['Let me archive Erdenet Copper Works — do you want me to proceed?', 'Let me archive Erdenet Copper Works — shall I go ahead?', 'Let me archive Erdenet Copper Works — shall I?', 'Let me archive Erdenet Copper Works — should I?', 'Let me archive Erdenet Copper Works — would you like me to?', 'Let me archive Erdenet Copper Works — sound good?', 'Let me archive Erdenet Copper Works — alright?', 'Let me archive Erdenet Copper Works — confirm?', 'Let me delete the task — is that fine?', 'I’ll archive Erdenet Copper Works — shall I?'];
  const destroyed = rows.filter((s) => candArm(s, { names: NM }) !== null && v92Arm(s) === null);
  return [destroyed.length === 0, destroyed.length + '/' + rows.length + ' destroyed, e.g. ' + JSON.stringify(destroyed[0] || '')];
});
check('DEFECT', 'V51-D2.renamedArrowStraddle', 'v92\'s whole-summary `renamed: … ->` arm is unbounded; when "renamed:" sits >64 chars before the arrow across char 4,000 the candidate ships what v92 corrects', () => {
  const c = 'renamed: "Ulaanbaatar Rail Depot and Logistics Services Northern Division" -> "URD North"';
  const miss = []; for (let k = 60; k <= 80; k++) { const s = pad(4000 - k) + c + ' ' + pad(140); if (candArm(s, { names: NM }) === null && v92Arm(s) !== null) miss.push(k); }
  return [miss.length === 0, 'ships at offsets 4000-' + miss.join(',4000-')];
});
check('DEFECT', 'V51-D3.conditionedOfferThenLeadWordFirstPerson', 'a conditioned offer (ASCII "I will") followed by ` so ` / ` then ` / `. Meanwhile ` / `. Also ` / ` & ` + an in-pack first-person completion must not ship when v92 corrects the whole reply', () => {
  const rows = [' so ', ' then ', '. Meanwhile ', '. Also ', ' & ', ' because ', ' although '].map((l) => `I will restore Khovd Solar Park if you approve${l}I just archived Sukhbaatar Freight.`);
  const shipped = rows.filter((s) => candArm(s, { names: NM }) === null && v92Arm(s) !== null);
  return [shipped.length === 0, shipped.length + '/' + rows.length + ' ship, e.g. ' + JSON.stringify(shipped[0] || '')];
});
check('DEFECT', 'V51-D4.confirmedFirstPersonObjectNegator', '"Confirmed — I archived nothing / none of them / no companies / nobody" is a truthful negative v92 preserves; the CONFIRMED arm\'s negation slice ends at the participle and cannot see it', () => {
  const rows = ['Confirmed — I archived nothing; the list above is unchanged.', 'Confirmed — I archived none of them.', 'Confirmed — I archived no companies.', 'Confirmed — I removed nobody.', 'Confirmed — we archived nothing this turn.'];
  const destroyed = rows.filter((s) => candArm(s, { names: NM }) !== null && v92Arm(s) === null);
  return [destroyed.length === 0, destroyed.length + '/' + rows.length + ' destroyed'];
});

console.log(`\nv51_regression_additions: ${pass} passed, ${fail} failed`);
if (failing.length) console.log('FAILING: ' + failing.join(', '));
process.exit(fail > 0 ? 1 : 0);

// VERIFIER #57 — Step 2E: persistence + narrative tier + durable precedence (OTM §2 tier 3 > 4, §3 rule 6, BUG-010).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { historyFn, precedenceFn, src, ROOT } from './v57_lib.mjs';

const rows = []; const check = (name, ok, detail) => { rows.push({ name, ok, detail: ok ? undefined : detail }); console.log((ok ? 'OK   ' : 'FAIL ') + name + (ok ? '' : '\n       ' + detail)); };
const now = Date.now();
const iso = (ms) => new Date(now + ms).toISOString();

// ---- narrative tier: history marks UNVERIFIED turns; prose of an unverified turn never re-enters; verified null when unknown
const H = (output, command = 'cmd') => ({ command, output, created_at: iso(-60000) });
const hist = (rowsIn) => historyFn(rowsIn, 1);
{
  const h = hist([H({ summary: 'Done. Project renamed to Beta.', turnVerdict: { executedOperationCount: 0, attemptedOperationCount: 0, rejectedClaimCount: 0, mutationIntent: { verb: 'rename', field: null }, receiptRendered: false } })]);
  check('H1 intent + empty ledger + no receipt -> UNVERIFIED marker, prose dropped, verified=false', h[0].summary === '[UNVERIFIED — no database change was executed on that turn]' && h[0].verified === false && h[0].executedOperationCount === 0, JSON.stringify(h[0]));
  const h2 = hist([H({ summary: 'No change was made — I could not resolve which company you meant.', turnVerdict: { executedOperationCount: 0, attemptedOperationCount: 0, rejectedClaimCount: 0, mutationIntent: { verb: 'restore', field: null }, receiptRendered: true } })]);
  check('H2 receipt-rendered turn keeps the receipt text, verified=false', /No change was made/.test(h2[0].summary) && h2[0].verified === false, JSON.stringify(h2[0]));
  const h3 = hist([H({ summary: 'ACME: archived.', turnVerdict: { executedOperationCount: 1, attemptedOperationCount: 1, rejectedClaimCount: 0, mutationIntent: { verb: 'archive', field: 'archiveCompanyIds' }, receiptRendered: false } })]);
  check('H3 executed turn: verified=true, prose kept', h3[0].verified === true && h3[0].summary === 'ACME: archived.', JSON.stringify(h3[0]));
  const h4 = hist([H({ summary: 'ACME was archived in 2025.', turnVerdict: { executedOperationCount: 0, attemptedOperationCount: 0, rejectedClaimCount: 0, mutationIntent: null, receiptRendered: false } })]);
  check('H4 read turn (no intent, nothing executed): verified=null (unknown), never true; prose kept', h4[0].verified === null && h4[0].summary === 'ACME was archived in 2025.', JSON.stringify(h4[0]));
  const h5 = hist([H({ summary: 'Done — archived.', verifiedResponse: { executionEvidence: [], rejectedClaims: [{ claim: {} }] } })]);
  check('H5 no turnVerdict (older row) but rejected claims + no evidence -> UNVERIFIED', h5[0].summary === '[UNVERIFIED — no database change was executed on that turn]' && h5[0].verified === false, JSON.stringify(h5[0]));
  const h6 = hist([H({ summary: 'Done — archived.' })]);
  check('H6 legacy row without any verdict/evidence: verified=null, prose kept (unknown, not asserted)', h6[0].verified === null && h6[0].executedOperationCount === null, JSON.stringify(h6[0]));
  const h7 = hist([H({ summary: 'Renamed.', verifiedResponse: { executionEvidence: [{ postconditionPassed: true }], rejectedClaims: [] } })]);
  check('H7 evidence-derived count when the verdict is absent: verified=true', h7[0].verified === true && h7[0].executedOperationCount === 1, JSON.stringify(h7[0]));
  const h8 = hist([H({ summary: 'Renamed Alpha to Beta. What next?', turnVerdict: { executedOperationCount: 0, attemptedOperationCount: 1, rejectedClaimCount: 0, mutationIntent: { verb: 'rename', field: null }, receiptRendered: false } })]);
  check('H8 attempted-but-unverified turn is UNVERIFIED', h8[0].verified === false && /UNVERIFIED/.test(h8[0].summary), JSON.stringify(h8[0]));
  const h9 = hist([H({ summary: 'x', turnVerdict: { executedOperationCount: 0, rejectedClaimCount: 2, mutationIntent: null, receiptRendered: false } })]);
  check('H9 rejected claims + no intent + nothing executed -> UNVERIFIED', h9[0].verified === false && /UNVERIFIED/.test(h9[0].summary), JSON.stringify(h9[0]));
  const hw = historyFn([H({ summary: 'a' }), H({ summary: 'b' })], 5);
  check('H10 absolute turn numbers from the window start', hw[0].turn === 5 && hw[1].turn === 6, JSON.stringify(hw.map((x) => x.turn)));
}

// ---- durable precedence: tier 3 outranks tier 4; expired / untyped durable rows yield; stale last-turn output yields after 30 min
const PA_D = { kind: 'disambiguation', actionType: 'restore', question: 'durable?' };
const PA_L = { kind: 'disambiguation', actionType: 'archive', question: 'last-turn?' };
const durable = (over = {}) => ({ pending_action: PA_D, pending_action_action_type: 'restore', pending_action_source_work_order_id: 'wo-1', pending_action_expires_at: iso(10 * 60000), ...over });
const lastTurn = (ageMs, output = { pendingAction: PA_L }) => [{ command: 'c', output, created_at: iso(-ageMs) }];
{
  const p1 = precedenceFn(lastTurn(60000), durable());
  check('P1 valid durable row outranks the last turn’s stored pendingAction', p1.pendingAction === PA_D || p1.pendingAction?.question === 'durable?', JSON.stringify(p1.pendingAction));
  const p2 = precedenceFn(lastTurn(60000), durable({ pending_action_expires_at: iso(-1000) }));
  check('P2 EXPIRED durable row yields to the (fresh) last turn output', p2.durablePendingActionValid === false && p2.pendingAction?.question === 'last-turn?', JSON.stringify(p2));
  const p3 = precedenceFn(lastTurn(60000), durable({ pending_action_action_type: null }));
  check('P3 UNTYPED durable row yields', p3.durablePendingActionValid === false && p3.pendingAction?.question === 'last-turn?', JSON.stringify(p3));
  const p4 = precedenceFn(lastTurn(60000), durable({ pending_action_source_work_order_id: null }));
  check('P4 durable row without a source work order yields', p4.durablePendingActionValid === false, JSON.stringify(p4));
  const p5 = precedenceFn(lastTurn(60000), durable({ pending_action_expires_at: null }));
  check('P5 durable row without an expiry yields (fail closed)', p5.durablePendingActionValid === false, JSON.stringify(p5));
  const p6 = precedenceFn(lastTurn(31 * 60000), null);
  check('P6 last-turn stored pendingAction older than 30 min does NOT bind', p6.pendingAction === null && p6.lastTurnPendingFresh === false, JSON.stringify(p6));
  const p7 = precedenceFn(lastTurn(29 * 60000), null);
  check('P7 last-turn stored pendingAction younger than 30 min binds', p7.pendingAction?.question === 'last-turn?', JSON.stringify(p7.pendingAction));
  const p8 = precedenceFn(lastTurn(31 * 60000, { pendingConfirmation: { summary: 'legacy', action: {} } }), null);
  check('P8 legacy pendingConfirmation older than 30 min does NOT bind', p8.pendingAction === null, JSON.stringify(p8.pendingAction));
  const p9 = precedenceFn(lastTurn(60000, { pendingConfirmation: { summary: 'legacy', action: {} } }), null);
  check('P9 fresh legacy pendingConfirmation binds as bulk_confirmation', p9.pendingAction?.kind === 'bulk_confirmation', JSON.stringify(p9.pendingAction));
  const p10 = precedenceFn(lastTurn(31 * 60000), durable());
  check('P10 valid durable row binds even when the last turn output is stale', p10.pendingAction?.question === 'durable?', JSON.stringify(p10.pendingAction));
  const p11 = precedenceFn(lastTurn(31 * 60000), durable({ pending_action_expires_at: iso(-1) }));
  check('P11 expired durable + stale last turn -> nothing binds', p11.pendingAction === null, JSON.stringify(p11));
  const p12 = precedenceFn([{ command: 'c', output: { pendingAction: PA_L } }], null);
  check('P12 last turn row WITHOUT created_at: treated as fresh (binds) — documented shape', p12.pendingAction?.question === 'last-turn?', JSON.stringify(p12));
  const p13 = precedenceFn([], null);
  check('P13 no rows, no durable: null', p13.pendingAction === null, JSON.stringify(p13));
}
// ---- static: the durable read comes BEFORE the stored output in the precedence expression; the write half clears the row every turn
{
  const expr = src.slice(src.indexOf('const pendingAction: PendingAction | null = ('), src.indexOf('const recentlyResolvedEntities'));
  check('S1 durable row is read FIRST in the precedence expression', expr.indexOf('durablePendingActionValid') < expr.indexOf('lastTurnOutput?.pendingAction'), expr.slice(0, 200));
  const writeHalf = src.slice(src.indexOf('const stateWrite = {'), src.indexOf('if (focusEntries.length > 0) stateWrite.focus_stack'));
  check('S2 the write half stores pending_action: null when this turn armed nothing (row cleared every turn)', /pending_action: paDurable,/.test(writeHalf) && /pending_action_expires_at: paDurable \? new Date\(Date\.now\(\) \+ 30 \* 60 \* 1000\)/.test(writeHalf), writeHalf.slice(0, 200));
  check('S3 only a FULLY TYPED pendingAction is stored durably', /typeof \(result\.pendingAction as any\)\.actionType === 'string'/.test(src));
  check('S4 work_orders.output persisted unconditionally after the verdict', /void groundedOutcomeThisTurn;[^\n]*\n\s*await supabase\.from\('work_orders'\)\.update\(\{ output: result \}\)/.test(src));
  check('S5 turnVerdict is assigned BEFORE the persist', src.indexOf('result.turnVerdict = {') < src.indexOf("await supabase.from('work_orders').update({ output: result })"));
  check('S6 the disambiguation pendingAction the resolver arms carries actionType (so it is durable)', /actionType: `\$\{d\.action\}_company`/.test(src));
}
let pass = 0; const fails = []; for (const r of rows) { if (r.ok) pass++; else fails.push(r); }
console.log(`\nv57_precedence: ${pass} passed, ${fails.length} failed`);
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/precedence.json'), JSON.stringify({ pass, fails }, null, 1));
process.exit(fails.length ? 1 : 0);

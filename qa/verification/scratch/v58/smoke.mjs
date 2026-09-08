// VERIFIER #58 — harness smoke + free-identifier audit of every sliced window.
import { STRUCT_JS, STRUCT_PARAMS, LIFE_JS, LIFE_PARAMS, freeIdentifiers, turn, life, U, EV, M, RI, NO_CHANGE, ACME, ID, historyFn, precedenceFn, envelopeFn, SRC } from './v58_lib.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
console.log('SRC', SRC, 'sha256', createHash('sha256').update(readFileSync(SRC)).digest('hex'));

const ABOVE_WINDOW_GLOBALS = ['command', 'factLines', 'lifecycleReports', 'organizationGraphCheck', 'workOrder', 'knownEntityNames', 'PAST_COMPLETION_CLAIM_PATTERN', 'COMPLETION_WORD'];
const structFree = freeIdentifiers(STRUCT_JS).filter((n) => !STRUCT_PARAMS.includes(n) && !ABOVE_WINDOW_GLOBALS.includes(n));
console.log('STRUCT window free identifiers beyond params+above-window globals:', JSON.stringify(structFree));
const lifeFree = freeIdentifiers(LIFE_JS).filter((n) => !LIFE_PARAMS.includes(n));
console.log('LIFE window free identifiers beyond params:', JSON.stringify(lifeFree));

// Smoke: a fabricated rename on a mutation-intent request → receipt.
const a = turn({ command: 'rename project Alpha to Beta', summary: 'Done. Project renamed to Beta. What next?' });
console.log('smoke A:', NO_CHANGE.test(a.summary), '|', a.summary, '| intent', JSON.stringify(a.intent), 'verdict', JSON.stringify(a.verdict));
// Smoke: a read request keeps its answer.
const b = turn({ command: 'what happened to project Alpha last week?', summary: 'Alpha was renamed to Beta on Monday and archived on Friday. Want details?' });
console.log('smoke B:', b.summary === b.input, '| intent', JSON.stringify(b.intent));
// Smoke: verified envelope renders the claim.
const c = turn({ command: 'archive ACME', claims: [M('company', ACME, 'archive')], summary: 'ACME has been archived.', evidence: [EV('company', 'archive', ACME, true)], labels: { company: { [ACME]: 'ACME' } } });
console.log('smoke C:', c.summary, '| exec', c.executedVerifiedCount);
// Smoke: lifecycle exact-name archive executes once.
const db = [{ id: U(1), name: 'Alpha', status: 'active' }, { id: U(2), name: 'Alpha Holdings', status: 'active' }];
const l = await life('archive Alpha', db);
console.log('smoke L:', JSON.stringify(l.calls), l.report, 'gate', l.commandFallbackAllowed, l.headLifecycleAction);
// Smoke: history + precedence + envelope.
const h = historyFn([{ command: 'rename X', output: { summary: 'Renamed.', turnVerdict: { mutationIntent: { verb: 'rename', field: null }, executedOperationCount: 0, rejectedClaimCount: 0, receiptRendered: false } }, created_at: new Date().toISOString() }], 1);
console.log('smoke H:', JSON.stringify(h));
const p = precedenceFn([{ command: 'x', output: { pendingAction: { kind: 'open_question', question: 'stored?' } }, created_at: new Date().toISOString() }], { pending_action: { kind: 'disambiguation', question: 'durable?' }, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo', pending_action_expires_at: new Date(Date.now() + 60000).toISOString() });
console.log('smoke P:', JSON.stringify(p.pendingAction));
console.log('smoke E:', JSON.stringify(envelopeFn({ data: [1, 2, 3], count: 40 })), JSON.stringify(envelopeFn({ data: [1, 2, 3] })), JSON.stringify(envelopeFn({ data: [1, 2, 3], count: 40 }, 5, 'x')));

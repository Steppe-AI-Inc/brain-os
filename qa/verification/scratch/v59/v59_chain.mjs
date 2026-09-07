#!/usr/bin/env node
// VERIFIER #59 — the lifecycle executor (W2) chained into the structured-claim window (W1), exactly as production
// orders them: resolve/execute first, then the final-claim rule sees lifecycleReports + evidence. This is the only
// way to know what the FOUNDER sees for a shape where the model emitted nothing structured.
// Plus: the receipt entity wording (C11) and the durable pending-action precedence (stale-row attack, Step 2E).
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { turn, life, U, RI, NO_CHANGE, SUCCESS_WORDS, precedenceFn, tally } from './v59_lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const rows = []; const ck = (name, ok, detail) => rows.push({ name, ok, detail });
const db = () => [{ id: U(1), name: 'Alpha', status: 'active' }, { id: U(2), name: 'Beta', status: 'archived' }, { id: U(3), name: 'ACME', status: 'active' }, { id: U(4), name: 'Alpha Holdings', status: 'active' }];
const NAMES = ['Alpha', 'Beta', 'ACME', 'Alpha Holdings', 'Gamma'];

/** production order: lifecycle executor → (evidence, report, pendingAction) → structured window */
async function chain(command, fabricated, { requestIntent, result = {} } = {}) {
  const d = db();
  const res = { ...result }; if (requestIntent !== undefined) res.requestIntent = requestIntent;
  const L = await life(command, d, res);
  const lifecycleReports = L.report ? [L.report] : [];
  const evidence = L.evidence.map((e) => ({ resourceType: e.rt, action: e.action, id: e.id, postconditionPassed: e.ok, error: e.ok ? null : 'x' }));
  // production: with a lifecycle report the summary is REPLACED deterministically before the window (index.ts :4987-4990)
  const summary = lifecycleReports.length > 0 ? lifecycleReports.join(' ') : fabricated;
  const out = turn({ command, summary, lifecycleReports, evidence, names: NAMES, requestIntent, pendingAction: L.pendingAction || null, extra: result, deterministicPrefix: lifecycleReports.length > 0 ? lifecycleReports.join(' ') : '', fullyDeterministic: lifecycleReports.length > 0 });
  return { calls: L.calls, report: L.report, unresolved: L.unresolved, disamb: L.disambiguation, allowed: L.commandFallbackAllowed, imp: L.commandImperativePosition, final: out.summary, intent: out.intent, receipt: out.receiptRendered, db: d };
}
const j = (o) => JSON.stringify({ calls: o.calls, allowed: o.allowed, imp: o.imp, intent: o.intent, final: o.final });

// ── A. model emits NOTHING structured (no requestIntent, no arrays) + fabricated completion prose ──
const CASES = [
  // [command, fabricated prose, expectation: 'exec' (executes, deterministic report), 'receipt' (no exec, receipt), 'ships' (fabrication reaches the founder)]
  ['archive Alpha', 'Alpha has been archived.', 'exec'],
  ['restore Beta', 'Beta is back.', 'exec'],
  ['bring back Beta', 'Beta is back — restored.', 'exec'],
  ['bring back the company Beta', 'Beta is back — restored.', 'exec'],
  ['bring back Gamma', 'Gamma is back — restored.', 'receipt'],
  ['bring back the company Gamma', 'Gamma is back — restored.', 'receipt'],
  ['reactivate Gamma', 'Gamma reactivated.', 'receipt'],
  ['unarchive Gamma', 'Gamma unarchived.', 'receipt'],
  ['when you get a chance, archive Alpha', 'Alpha has been archived.', 'exec'],
  ['do me a favour and archive Alpha', 'Alpha has been archived.', 'exec'],
  ['list the tasks, then archive Alpha', 'Alpha has been archived.', 'exec'],
  ['since Alpha is done, archive Alpha', 'Alpha has been archived.', 'exec'],
  ['Alpha-г архивла', 'Alpha архивлагдлаа.', 'exec'],
  ['архивла Alpha', 'Alpha архивлагдлаа.', 'exec'],
  ['Beta сэргээ', 'Beta сэргээгдлээ.', 'exec'],
  ['please archive Alpha', 'Alpha has been archived.', 'exec'],
  ['can you archive Alpha?', 'Alpha has been archived.', 'exec'],
  ['archive Alpha?', 'Alpha has been archived.', 'receipt'],
  ['did you archive Alpha?', 'Yes, Alpha has been archived.', 'read'],
  ['I nearly archived Alpha yesterday', 'Alpha has been archived.', 'receipt'],
  ['get Alpha archived', 'Alpha has been archived.', 'receipt'],
  ['Alpha back to active', 'Alpha is active again.', 'receipt'],
  ['shelve Alpha', 'Alpha shelved — archived.', 'receipt'],
  ['retire the company Alpha', 'Alpha has been archived.', 'receipt'],
  ['delete Alpha', 'Alpha has been deleted.', 'exec'],
  ['remove Alpha Holdings', 'Alpha Holdings has been removed.', 'exec'],
  ['archive Alph', 'Alph archived.', 'ask'],
];
const shipped = [];
for (const [cmd, fab, exp] of CASES) {
  const o = await chain(cmd, fab);
  const fabShips = !o.receipt && o.calls.length === 0 && !NO_CHANGE.test(o.final) && (o.final === fab || SUCCESS_WORDS.test(o.final));
  if (fabShips) shipped.push({ cmd, final: o.final });
  if (exp === 'exec') ck(`A [model nothing] "${cmd}" executes server-side (deterministic report, no fabrication)`, o.calls.length === 1 && !SUCCESS_WORDS.test(o.final.replace(/: (archived|restored)\./, '')) && o.final === o.report, j(o));
  else if (exp === 'receipt') ck(`A [model nothing] "${cmd}" → no execution AND a receipt (never the fabrication)`, o.calls.length === 0 && (NO_CHANGE.test(o.final) || (o.report && o.final === o.report)), j(o));
  else if (exp === 'read') ck(`A [model nothing] "${cmd}" → no execution; a question is a read (prose may ship)`, o.calls.length === 0, j(o));
  else if (exp === 'ask') ck(`A [model nothing] "${cmd}" fuzzy command hit → asks, executes nothing`, o.calls.length === 0 && o.disamb.length === 1, j(o));
}
ck('A0 [model nothing] fabrications that reach the founder — sized (see list)', true, JSON.stringify(shipped));

// ── B. the same commands WITH the model's classification (the primary tier) ──
for (const [cmd, fab] of CASES.filter(([, , e]) => e === 'exec' || e === 'receipt')) {
  const target = (cmd.match(/(Alpha Holdings|Alpha|Beta|Gamma|ACME)/) || [])[1] || null;
  const isRestore = /restore|bring back|reactivate|unarchive|сэргээ|back to active/.test(cmd);
  const o = await chain(cmd, fab, { requestIntent: RI('mutation', isRestore ? 'restore' : 'archive', 'company', target) });
  const exists = ['Alpha', 'Beta', 'Alpha Holdings', 'ACME'].includes(target) && (isRestore ? target === 'Beta' : target !== 'Beta');
  if (exists) ck(`B [model requestIntent] "${cmd}" executes exactly once`, o.calls.length === 1 && o.final === o.report, j(o));
  else ck(`B [model requestIntent] "${cmd}" → receipt or truthful unresolved line, never the fabrication`, o.calls.length === 0 && !SUCCESS_WORDS.test(o.final) && (NO_CHANGE.test(o.final) || /no company by that name|already/.test(o.final)), j(o));
}
// the model classifies as read/other → nothing executes; a fabricated completion then SHIPS by design (V57-D1) — sized
{
  const o1 = await chain('archive Alpha', 'Alpha has been archived.', { requestIntent: RI('other') });
  const o2 = await chain('archive Alpha', 'Alpha has been archived.', { requestIntent: RI('read') });
  ck('B [model other] "archive Alpha" executes nothing', o1.calls.length === 0, j(o1));
  ck('B [model read] "archive Alpha" executes nothing', o2.calls.length === 0, j(o2));
  ck('B0 [model other/read] + fabricated completion — sized (intended departure V57-D1; v92 would have corrected on text)', true, JSON.stringify({ other: o1.final, read: o2.final }));
}
// a model-emitted id that does not exist; a name that is not a company
{
  const o = await chain('archive Alpha', 'Alpha has been archived.', { result: { archiveCompanyIds: ['99999999-0000-4000-8000-000000000000'] } });
  ck('B model-emitted id that does not exist → could-not-be-found line, no execution, no fabrication', o.calls.length === 0 && /could not be found/.test(o.final) && !/has been archived/.test(o.final), j(o));
  const o2 = await chain('archive the task Ship v2', 'Task archived.', { result: { archiveTaskIds: [] } });
  ck('B a task request with nothing resolved never invents a company line', o2.calls.length === 0 && !/no company by that name/.test(o2.final) && NO_CHANGE.test(o2.final), j(o2));
}

// ── C. receipt entity wording when the model emitted nothing (C11 re-adjudicated) ──
for (const [cmd, want] of [['restore task QA-7', 'task'], ['archive the goal Growth', 'goal'], ['restore the person Bob', 'person'], ['restore Beta', 'company']]) {
  const o = turn({ command: cmd, summary: 'Done.', names: NAMES });
  ck(`C [model nothing] "${cmd}" → receipt names the ${want} (the command noun)`, new RegExp('which ' + want + ' you meant').test(o.summary), o.summary);
}

// ── D. durable pending-action precedence: can a STALE durable row bind? ──
const future = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 1000).toISOString();
const PA_DUR = { kind: 'bulk_confirmation', summary: 'Archive ACME', action: { archiveCompanyIds: [U(3)] }, actionType: 'archive' };
const row = (out, ageMs = 0) => ({ id: 'wo-last', created_at: new Date(Date.now() - ageMs).toISOString(), output: out });
const durable = (over = {}) => ({ pending_action: PA_DUR, pending_action_action_type: 'archive_company', pending_action_source_work_order_id: 'wo-old', pending_action_expires_at: future(), ...over });
{
  const r = precedenceFn([row({ pendingAction: { kind: 'open_question', question: 'Which one?' } })], durable());
  ck('D durable typed+unexpired row outranks the last turn’s stored pendingAction (OTM §2 tier 3 > tier 4)', r.pendingAction && r.pendingAction.summary === 'Archive ACME', JSON.stringify(r.pendingAction));
  const r2 = precedenceFn([row({ pendingAction: { kind: 'open_question', question: 'Which one?' } })], durable({ pending_action_expires_at: past() }));
  ck('D expired durable row yields to the last turn', r2.pendingAction && r2.pendingAction.question === 'Which one?', JSON.stringify(r2.pendingAction));
  const r3 = precedenceFn([row({ pendingAction: { kind: 'open_question', question: 'Which one?' } })], durable({ pending_action_action_type: null }));
  ck('D untyped durable row yields', r3.pendingAction && r3.pendingAction.question === 'Which one?', JSON.stringify(r3.pendingAction));
  const r4 = precedenceFn([row({ pendingAction: null })], durable({ pending_action_source_work_order_id: null }));
  ck('D unsourced durable row yields (nothing binds)', r4.pendingAction === null, JSON.stringify(r4.pendingAction));
  const r5 = precedenceFn([row({ pendingAction: { kind: 'open_question', question: 'old q' } }, 31 * 60 * 1000)], null);
  ck('D a stored pendingAction older than 30 min does not bind', r5.pendingAction === null, JSON.stringify(r5.pendingAction));
  // RESIDUAL shape: the durable row was written by an OLDER turn (source wo-old) and the last turn (wo-last) stored NO
  // pendingAction — the write that should have cleared the row failed silently (index.ts :6448 swallows) or lost the
  // CAS race. The reader does not compare the source work order with the last turn's id: the stale row still binds.
  const r6 = precedenceFn([row({ pendingAction: null })], durable());
  ck('D0 RESIDUAL (sized): a durable row from an older turn binds after a later turn stored no pendingAction (no source-freshness check)', true, JSON.stringify({ binds: !!r6.pendingAction, durableValid: r6.durablePendingActionValid }));
}

const t = tally('v59_chain', rows);
writeFileSync(resolve(HERE, 'chain.json'), JSON.stringify({ pass: t.pass, fails: t.fails, shipped }, null, 2));
process.exit(t.fails.length === 0 ? 0 : 1);

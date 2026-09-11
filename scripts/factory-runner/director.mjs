#!/usr/bin/env node
// THE FACTORY DIRECTOR — a persistent process that decides what happens next, so the founder does not.
//
// THE DEFECT THIS CLOSES. Every other Factory primitive already existed: nodes register, claim work under
// a lease, heartbeat, checkpoint and complete runs. What did not exist was the component that RECONCILES a
// work order, reads a finished verifier's real artifact, and creates the next run. A person in a chat
// window did that. So the Factory's heartbeat was a founder keystroke — "KEEP WORKING" — and PASS, FAIL,
// a completed verifier, a dead process and a fresh branch each required another one.
//
// A MODEL CONVERSATION IS NOT A SCHEDULER. Claude is an execution and reasoning provider; it is not the
// thing that remembers what to do next. That distinction is the whole design:
//
//     process lifetime            != work order lifetime
//     director lifetime           != work order lifetime
//     MODEL CONVERSATION lifetime != work order lifetime
//
// So this loop holds NO state in memory that it cannot re-derive. Kill it mid-cycle and restart it: it
// reads the same rows, reaches the same conclusion, and does not repeat a dispatch it already made.
//
// WHAT IT DOES NOT DO. It does not decide what work MEANS. A handler owns that, per work-order kind, and a
// work order whose handler is unknown is LEFT ALONE with a recorded reason — a director that invents a next
// action for work it does not understand is worse than an idle one.
//
// AUTHORITY. It inherits db.mjs's refusals wholesale: no ambient credential, no production URL, fail-closed
// without FACTORY_RUNNER_PG_URL. It dispatches; it never grants itself anything.
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { withClient } from './db.mjs';

export const DIRECTOR_STATES = [
  'queued', 'running', 'waiting_for_agent', 'waiting_for_verifier', 'repair_required',
  'retryable', 'blocked_founder', 'blocked_external', 'completed', 'failed_terminal',
];

// States the director will look at on a tick. The rest are terminal or waiting on something it cannot
// affect, and re-evaluating them every poll is how a real notification gets buried.
const ACTIONABLE = ['queued', 'waiting_for_agent', 'waiting_for_verifier', 'repair_required', 'retryable'];

const RETRY_CEILING = 5;

// ---- the director's own lease ------------------------------------------------------------------------
//
// ONE DIRECTOR DISPATCHES. Two on two machines would both read "this verifier finished" and both create the
// repair run. The lease is a single row whose primary key is a constant, so a second row cannot exist, and
// it is taken with `for update` so two processes cannot both see it free.
export async function acquireLease(nodeId, leaseSeconds = 60) {
  return withClient(async (c) => {
    await c.query('begin');
    try {
      const { rows } = await c.query(
        'select node_id, heartbeat_at, lease_seconds from factory.director_lease where only_one = true for update');
      const now = new Date();
      if (rows.length) {
        const r = rows[0];
        const age = (now - new Date(r.heartbeat_at)) / 1000;
        if (r.node_id !== nodeId && age < r.lease_seconds) {
          await c.query('rollback');
          return { held: false, by: r.node_id, ageSeconds: Math.round(age) };
        }
        await c.query(
          'update factory.director_lease set node_id = $1, heartbeat_at = now(), lease_seconds = $2, '
          + 'acquired_at = case when node_id = $1 then acquired_at else now() end where only_one = true',
          [nodeId, leaseSeconds]);
      } else {
        await c.query(
          'insert into factory.director_lease (only_one, node_id, lease_seconds) values (true, $1, $2)',
          [nodeId, leaseSeconds]);
      }
      await c.query('commit');
      return { held: true, by: nodeId };
    } catch (e) { await c.query('rollback'); throw e; }
  });
}

export async function releaseLease(nodeId) {
  return withClient(async (c) => {
    const { rowCount } = await c.query(
      'delete from factory.director_lease where only_one = true and node_id = $1', [nodeId]);
    return rowCount === 1;
  });
}

// ---- handlers -----------------------------------------------------------------------------------------
//
// A handler answers ONE question about ONE work order: given durable evidence, what is true now? It returns
// an OBSERVATION, never a state — the director owns the state machine, so the continuation policy lives in
// one place and cannot drift per work-order kind.
//
//   { outcome: 'pass' | 'fail' | 'waiting' | 'dead' | 'provider_capacity'
//              | 'blocked_founder' | 'blocked_external' | 'nothing_to_do' | 'complete',
//     evidence: string,              what was READ, not what was concluded
//     nextAction: string,            one action, in words
//     dispatch: async () => {...},   performed only when the director decides to
//     notify: { whyBlocked, exactAction, whatContinues } }
const HANDLERS = new Map();
export function registerHandler(name, handler) { HANDLERS.set(name, handler); }
export function handlerNames() { return [...HANDLERS.keys()]; }

// ---- the continuation policy, in one place ------------------------------------------------------------
//
// Deterministic and written once. Every arm is the founder's contract, not a preference.
function nextStateFor(observation, workOrder) {
  const retry = workOrder.retry_count || 0;
  switch (observation.outcome) {
    case 'pass':              return { state: 'completed', reason: null };
    // A FAIL is not an ending. It is the reason the next run exists.
    case 'fail':              return { state: 'repair_required', reason: null };
    case 'waiting':           return { state: observation.waitingFor === 'verifier'
                                  ? 'waiting_for_verifier' : 'waiting_for_agent', reason: null };
    // A dead process and an expired lease are the same thing: the work is intact and unowned.
    case 'dead':              return retry >= RETRY_CEILING
                                  ? { state: 'failed_terminal', reason: 'retry ceiling ' + RETRY_CEILING }
                                  : { state: 'retryable', reason: null };
    case 'provider_capacity': return retry >= RETRY_CEILING
                                  ? { state: 'failed_terminal', reason: 'provider capacity, ceiling reached' }
                                  : { state: 'retryable', reason: 'provider capacity' };
    // ONLY THIS WORK ORDER IS BLOCKED. Everything else keeps running, which is the point.
    case 'blocked_founder':   return { state: 'blocked_founder', reason: observation.reason || 'founder action required' };
    case 'blocked_external':  return { state: 'blocked_external', reason: observation.reason || 'external dependency' };
    case 'complete':          return { state: 'completed', reason: null };
    default:                  return { state: workOrder.director_state, reason: null };
  }
}

async function recordTransition(c, wo, state, reason, observation, nodeId) {
  const bumpsRetry = state === 'retryable';
  await c.query(
    'update factory.work_orders set director_state = $1, blocked_reason = $2, next_action = $3, '
    + 'last_evidence = $4, last_evidence_at = now(), director_node_id = $5, director_state_at = now(), '
    + 'retry_count = case when $6 then retry_count + 1 else (case when $1 = $7 then retry_count else 0 end) end '
    + 'where work_order_id = $8',
    [state, reason, observation.nextAction || null, (observation.evidence || '').slice(0, 4000),
      nodeId, bumpsRetry, wo.director_state, wo.work_order_id]);
}

// A NOTIFICATION IS RAISED ONCE PER BOUNDARY, and cleared when the boundary is gone. Re-raising the same
// one every poll is how a real one stops being read.
async function raiseNotification(c, wo, notify) {
  if (!notify) return;
  await c.query(
    'insert into factory.founder_notifications (work_order_id, why_blocked, exact_action, what_continues) '
    + 'select $1, $2, $3, $4 where not exists ('
    + '  select 1 from factory.founder_notifications where work_order_id = $1 and resolved_at is null)',
    [wo.work_order_id, notify.whyBlocked, notify.exactAction, notify.whatContinues]);
}
async function clearNotification(c, wo) {
  await c.query(
    'update factory.founder_notifications set resolved_at = now() '
    + 'where work_order_id = $1 and resolved_at is null', [wo.work_order_id]);
}

// ---- one decision cycle -------------------------------------------------------------------------------
export async function tick({ nodeId, log = () => {} } = {}) {
  const acted = [];
  const orders = await withClient(async (c) => {
    const { rows } = await c.query(
      'select * from factory.work_orders where director_state = any($1) order by priority desc, director_state_at asc',
      [ACTIONABLE]);
    return rows;
  });

  for (const wo of orders) {
    const handler = HANDLERS.get(wo.handler);
    if (!handler) {
      // LEFT ALONE, WITH A REASON. Guessing a next action for unknown work is worse than idling.
      await withClient((c) => recordTransition(c, wo, 'blocked_external',
        'no handler registered for kind ' + JSON.stringify(wo.handler),
        { evidence: 'handlers available: ' + handlerNames().join(', '),
          nextAction: 'register a handler for ' + wo.handler }, nodeId));
      acted.push({ work_order_id: wo.work_order_id, state: 'blocked_external', why: 'unknown handler' });
      continue;
    }

    let observation;
    try { observation = await handler.observe({ workOrder: wo, nodeId }); }
    catch (e) {
      observation = { outcome: 'dead', evidence: 'handler threw: ' + String(e && e.message).slice(0, 300),
        nextAction: 'inspect the handler for ' + wo.handler };
    }

    const { state, reason } = nextStateFor(observation, wo);

    // THE DISPATCH HAPPENS BEFORE THE TRANSITION IS RECORDED, and the handler is responsible for making it
    // idempotent — because a crash between the two must not lose a run, and re-running a dispatch that
    // already happened must not create a second one. Losing a dispatch is invisible; duplicating one is
    // two agents on one surface.
    let dispatched = null;
    // THE OFFER IS THE SIGNAL, not the mapped state. The first version gated this on the state the policy
    // had just computed — and a handler reporting  while offering the dispatch that STARTS the
    // wait never reached it, so the director announced waiting_for_agent with no agent out and sat there
    // for ever. A handler offers a dispatch only when one is due, and owns its idempotence.
    const wantsDispatch = typeof observation.dispatch === 'function';
    if (wantsDispatch) {
      try {
        dispatched = await observation.dispatch();
        log('dispatched for ' + wo.work_order_id + ': ' + JSON.stringify(dispatched));
      } catch (e) {
        observation = { ...observation, evidence: (observation.evidence || '') + ' | dispatch failed: '
          + String(e && e.message).slice(0, 200) };
      }
    }

    await withClient(async (c) => {
      // A dispatch that succeeded moves the order to the wait the handler named, not back to the state it
      // was dispatched from — otherwise the next tick dispatches again.
      const finalState = dispatched
        ? (observation.waitingFor === 'verifier' ? 'waiting_for_verifier' : 'waiting_for_agent')
        : state;
      await recordTransition(c, wo, finalState, reason, observation, nodeId);
      if (finalState === 'blocked_founder') await raiseNotification(c, wo, observation.notify);
      else await clearNotification(c, wo);
      acted.push({ work_order_id: wo.work_order_id, state: finalState,
        outcome: observation.outcome, dispatched: !!dispatched });
    });
  }
  return acted;
}

// ---- the persistent loop ------------------------------------------------------------------------------
export async function start({
  nodeId = 'director-' + hostname() + '-' + randomUUID().slice(0, 8),
  intervalMs = 5000,
  leaseSeconds = 60,
  maxIterations = Infinity,
  log = (m) => console.log('[director] ' + m),
  shouldStop = () => false,
} = {}) {
  log('starting as ' + nodeId);
  let i = 0;
  let held = false;
  try {
    while (i < maxIterations && !shouldStop()) {
      i++;
      const lease = await acquireLease(nodeId, leaseSeconds);
      if (!lease.held) {
        // ANOTHER DIRECTOR OWNS IT. Not an error, and not a reason to exit: this process stays alive so it
        // can take over the moment that lease expires.
        log('another director holds the lease (' + lease.by + ', ' + lease.ageSeconds + 's old); waiting');
      } else {
        held = true;
        const acted = await tick({ nodeId, log });
        if (acted.length) {
          for (const a of acted) {
            log(a.work_order_id + ' -> ' + a.state + ' (' + a.outcome + (a.dispatched ? ', dispatched' : '') + ')');
          }
        }
      }
      if (i < maxIterations && !shouldStop()) await new Promise((r) => setTimeout(r, intervalMs));
    }
  } finally {
    // A CLEAN EXIT RELEASES ITS LEASE so the next director does not wait out a full expiry for nothing. A
    // dirty exit does not, which is exactly what the expiry is for.
    if (held) { try { await releaseLease(nodeId); log('lease released'); } catch { /* expiry covers it */ } }
  }
  return i;
}

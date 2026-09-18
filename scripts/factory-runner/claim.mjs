#!/usr/bin/env node
// ATOMIC DISTRIBUTED CLAIMING.
//
// The whole computer-agnostic design rests on this file. Everything else — nodes, heartbeats, recovery —
// is bookkeeping around one question: when two computers reach for the same work at the same moment, does
// exactly one of them get it?
//
// The answer has to come from the database, not from the scheduler being careful. A scheduler that checks
// "is anyone else running this?" and then claims it has a window between the check and the claim, and that
// window is where a duplicate worker comes from. So the claim is ONE statement:
//
//   * `for update skip locked` — the row is locked by the claimer inside its transaction, and a second
//     claimer SKIPS it rather than blocking on it, so two nodes racing get two different rows (or one gets
//     nothing) and neither waits.
//   * the surface lock is inserted in the SAME transaction — its primary key is the enforcement, so a
//     conflicting surface fails the insert and rolls the whole claim back. Ownership is not something the
//     scheduler grants; it is something the database refuses to grant twice.
//
// PROCESS LIFETIME != WORK ORDER LIFETIME. NODE LIFETIME != WORK ORDER LIFETIME.
// A lease makes both true: a claim is owned only while `lease_expires_at` is in the future. A node that
// dies stops renewing, the lease expires, and the work becomes claimable again — by anybody. Nothing has to
// notice the death; the absence of a heartbeat IS the notice.
import * as db from './db.mjs';
import { deriveAssurance, mayServe } from './model-assurance.mjs';
import { admission } from './admission.mjs';

export const DEFAULT_LEASE_SECONDS = 120;

/**
 * Record that a run VERIFIED another run (Factory V1 milestone 4: role/run-based independent verifier acceptance).
 *
 * The schema already refuses a verification by the authoring run (`verification_is_independent`) or by the authoring
 * node (`verification_node_is_independent`); until now only tests wrote those columns, by hand, with an admin client.
 * This is the runner's own path: it writes only the two verification columns of the AUTHORED run and returns the
 * database's answer - an accepted independent verification, or the constraint's refusal, which the caller must report
 * rather than swallow. The verifying node's id is read from the verifying RUN's row on the plane, never from the caller.
 */
export async function recordVerification({ authoringRunId, verificationRunId }) {
  const v = await db.read('select node_id from factory.agent_runs where run_id = $1', [verificationRunId]);
  if (!v.rows.length) return { accepted: false, reason: 'verification run not found' };
  try {
    const r = await db.write(
      `update factory.agent_runs
          set verification_run_id = $2, verification_node_id = $3, updated_at = now()
        where run_id = $1
        returning run_id, authoring_node_id, verification_node_id`,
      [authoringRunId, verificationRunId, v.rows[0].node_id]);
    return r.rowCount === 1 ? { accepted: true, row: r.rows[0] } : { accepted: false, reason: 'authoring run not found' };
  } catch (e) {
    const m = String(e && e.message || e);
    if (/verification_is_independent|verification_node_is_independent/.test(m)) return { accepted: false, reason: m.match(/verification_(?:node_)?is_independent/)[0] };
    throw e;
  }
}

/** Register (or refresh) this node. Capabilities are what the director schedules on. */
export async function registerNode({ nodeId, capabilities = [], securityRole = 'generic', platform = '', agentVersion = '' }) {
  if (!nodeId) throw new Error('registerNode requires a nodeId');
  await db.write(
    `insert into factory.nodes (node_id, capabilities, security_role, platform, agent_version, last_heartbeat_at)
     values ($1, $2::jsonb, $3, $4, $5, now())
     on conflict (node_id) do update
       set capabilities = excluded.capabilities,
           security_role = excluded.security_role,
           platform = excluded.platform,
           agent_version = excluded.agent_version,
           last_heartbeat_at = now()`,
    [nodeId, JSON.stringify(capabilities), securityRole, platform, agentVersion]);
  return nodeId;
}

/**
 * Claim one eligible work order for this node, atomically.
 *
 * Eligible means: queued (or blocked past its retry_after), every dependency done, and no surface it owns
 * currently locked by a live lease. Returns the claimed run, or null when there is nothing to take — null
 * is an ordinary outcome and not an error, because "another node got there first" is the system working.
 */
export async function claimWork({ nodeId, leaseSeconds = DEFAULT_LEASE_SECONDS, capabilities = null,
  requestedProvider = null, requestedModel = null, reasoningEffort = null }) {
  if (!nodeId) throw new Error('claimWork requires a nodeId');
  const lease = Number(leaseSeconds) > 0 ? Number(leaseSeconds) : DEFAULT_LEASE_SECONDS;
  // ADMISSION CONTROL (Factory V1 milestone 5): a machine that is out of memory or saturated does not claim. The
  // refusal is recorded on the function for the caller to report, because a null here otherwise reads as "nothing to
  // take", which is a different fact.
  const gate = await admission();
  claimWork.lastAdmission = gate;
  if (!gate.admit) return null;

  // One transaction, opened by claimInTransaction below: the select locks the row and the surface
  // insert either succeeds for every surface this work order owns or aborts the claim. There is no
  // moment in between where the row is ours and the surface is not.
  return claimInTransaction({ nodeId, lease, capabilities, requestedProvider, requestedModel, reasoningEffort });
}

// db.transaction() runs a fixed list of statements, which cannot express "read a row then decide". The
// claim needs a live client, so it borrows the same connection rules by going through db.withClient().
async function claimInTransaction({ nodeId, lease, capabilities,
  requestedProvider = null, requestedModel = null, reasoningEffort = null }) {
  return db.withClient(async (client) => {
    await client.query('begin');
    try {
      // Expire any lease that has run out BEFORE looking for work, so a dead node's claim is visible as
      // available rather than as taken. This is the recovery path and it is deliberately part of the same
      // transaction as the claim: a reader that expires leases in a separate step can expire one and then
      // lose the race to claim it, which looks like a lost work order.
      // THE WORK ORDER GOES BACK TOO (Factory V1 milestone 2, found by qa/factory/shared_control_plane_acceptance.mjs
      // CP-5 with two real processes). The first version reset the abandoned RUN to queued and left the WORK ORDER at
      // 'claimed', and the claim below reads work orders in 'queued' only - so a dead worker's work order was never
      // claimable again by anyone, and acceptance E/G passed only because it reset the work order by hand. The two
      // writes are one statement so that no reader can see a queued run whose work order still says claimed.
      const expired = await client.query(
        `update factory.agent_runs
            set status = 'queued', node_id = null, lease_expires_at = null,
                attempt_count = attempt_count + 1, updated_at = now()
          where status = 'in_progress' and lease_expires_at is not null and lease_expires_at < now()
          returning work_order_id`);
      if (expired.rows.length) {
        await client.query(
          `update factory.work_orders set status = 'queued', updated_at = now()
            where status = 'claimed' and work_order_id = any($1::uuid[])`,
          [expired.rows.map((r) => r.work_order_id)]);
      }
      await client.query('delete from factory.surface_locks where lease_expires_at < now()');

      // WHAT THIS NODE IS, read from the control plane rather than taken from the caller. A node that
      // could tell the claim "I am a release_broker" would make the check a formality.
      const me = await client.query('select security_role, capabilities from factory.nodes where node_id = $1', [nodeId]);
      const myRole = me.rows.length ? me.rows[0].security_role : 'generic';
      const myCaps = me.rows.length ? (me.rows[0].capabilities || []) : [];
      // generic < verifier < release_broker. A release broker can do verification work; a verifier
      // cannot do release work. The order is the point.
      const RANK = { generic: 0, verifier: 1, release_broker: 2 };
      const myRank = RANK[myRole] === undefined ? 0 : RANK[myRole];
      // HEAVY-JOB CONCURRENCY LIMITS (Factory V1 milestone 5; 003_resource_governance.sql). A heavy work order is
      // claimable only while this node holds fewer heavy runs in progress than its max_heavy, and the plane as a whole
      // fewer than FACTORY_HEAVY_PER_PLANE (default 2). Counted inside the claim's transaction, so two claims cannot
      // both squeeze under the limit. Light and normal work is never counted and never limited by this.
      const heavyPerPlane = Number(process.env.FACTORY_HEAVY_PER_PLANE) > 0 ? Number(process.env.FACTORY_HEAVY_PER_PLANE) : 2;
      const params = [myRank, JSON.stringify(myCaps), nodeId, heavyPerPlane];

      const picked = await client.query(
        // requires_security_role IS SELECTED, because the assurance gate below reads it. The first version of
        // that gate read wo.requires_security_role off a row the SELECT did not carry it on, got undefined, and
        // silently never fired - a guard whose text was present and whose behaviour was absent, caught by the
        // acceptance row that asserts the REFUSAL rather than the source.
        `select wo.work_order_id, wo.owned_surface, wo.requires_security_role
           from factory.work_orders wo
          where wo.status = 'queued'
            -- this node must BE enough: its role must rank at or above what the work order requires
            and (case wo.requires_security_role when 'release_broker' then 2 when 'verifier' then 1 else 0 end) <= $1
            -- ...and must HAVE every capability the work order names
            and not exists (
              select 1 from unnest(wo.requires_capabilities) rc
               where not (to_jsonb(rc) in (select jsonb_array_elements($2::jsonb))))
            and not exists (
              select 1 from factory.work_order_dependencies d
                join factory.work_orders dep on dep.work_order_id = d.depends_on
               where d.work_order_id = wo.work_order_id and dep.status <> 'done')
            and not exists (
              select 1 from factory.surface_locks sl
               where sl.surface = any(wo.owned_surface) and sl.lease_expires_at > now())
            -- a heavy work order only while this node and the plane are under their heavy limits
            and (wo.weight <> 'heavy' or (
                  (select count(*) from factory.agent_runs r join factory.work_orders w on w.work_order_id = r.work_order_id
                    where r.status = 'in_progress' and r.node_id = $3 and w.weight = 'heavy')
                  < coalesce((select n.max_heavy from factory.nodes n where n.node_id = $3), 1)
              and (select count(*) from factory.agent_runs r join factory.work_orders w on w.work_order_id = r.work_order_id
                    where r.status = 'in_progress' and w.weight = 'heavy') < $4))
          order by case wo.priority when 'high' then 0 when 'medium' then 1 else 2 end,
                   wo.created_at
          for update of wo skip locked
          limit 1`, params);

      if (!picked.rows.length) { await client.query('rollback'); return null; }
      const wo = picked.rows[0];

      // THE RELEASE GATE MAY NOT BE SERVED BY A MODEL WITH NO EVIDENCE THAT IT FINISHES A RUN.
      //
      // model-assurance.mjs derived a model's standing from run evidence and NOTHING CONSULTED IT - a policy
      // no code enforces, which is the same shape as the no-silent-fallback constraints sitting on the table
      // the Factory does not run on, and the same shape as a product patch with no measured effect. So it is
      // wired to the one mapping that needs no invention: a work order that REQUIRES THE VERIFIER ROLE (or
      // release broker) is the production-deployment gate, and its evidence is what a release is certified on.
      //
      // A node whose intended model is not PROVEN does not claim it. The work order WAITS, which is already
      // this file's answer for a node that lacks a capability - an unschedulable work order waits rather than
      // being handed to a node that cannot do it. Returning null is the ordinary "nothing here for me".
      if (requestedModel && (wo.requires_security_role === 'verifier' || wo.requires_security_role === 'release_broker')) {
        const hist = await client.query(
          `select status, termination_reason, finished_at
             from factory.agent_runs
            where coalesce(actual_model, requested_model) = $1`, [requestedModel]);
        const standing = deriveAssurance(hist.rows, {});
        const verdict = mayServe(wo.requires_security_role === 'release_broker' ? 'release_broker' : 'verifier_round', standing);
        if (!verdict.allowed) {
          await client.query('rollback');
          // SAID, NOT SILENT. A refusal nobody records is indistinguishable from an empty queue, and this one
          // will look exactly like "the Factory stopped picking up verifier work" to whoever reads it next.
          console.log('[claim] declining ' + String(wo.work_order_id).slice(0, 8) + ': ' + verdict.reason);
          return null;
        }
      }

      // REQUESTED PROVIDER AND MODEL ARE WRITTEN AT CLAIM TIME, WHICH IS BEFORE THE CALL.
      //
      // This is the half the no-silent-fallback constraints depend on, and without it they are inert: both
      // read `requested_* is null or actual_* = requested_* or fallback_reason is not null`, so a row with no
      // requested model accepts ANY actual model. The constraint cannot close that — a substitution is only
      // definable against something requested — and `qa/factory/no_silent_model_fallback.mjs` row C3 states
      // exactly that boundary rather than pretending it is covered.
      //
      // It is also the field whose absence made the 2026-08-24 forensics reconstructive: a failed turn
      // recorded no model name anywhere, so "which model was being tried" had to be inferred from
      // model_usage boundaries and row-creation times. Written before the call, it survives the failure.
      const run = await client.query(
        `insert into factory.agent_runs
           (work_order_id, node_id, status, lease_expires_at, last_heartbeat_at, started_at, authoring_node_id,
            requested_provider, requested_model, reasoning_effort)
         values ($1, $2, 'in_progress', now() + ($3 || ' seconds')::interval, now(), now(), $2, $4, $5, $6)
         returning run_id, work_order_id, node_id, attempt_count, lease_expires_at,
                   requested_provider, requested_model`,
        [wo.work_order_id, nodeId, String(lease), requestedProvider, requestedModel, reasoningEffort]);
      const runId = run.rows[0].run_id;
      // A RUN IS ITS OWN AUTHOR (Factory V1 milestone 4, found by shared_control_plane_acceptance CP-11). The schema's
      // `verification_is_independent` compares verification_run_id with authoring_run_id, and the claim wrote the
      // authoring NODE but never the authoring RUN - so authoring_run_id stayed null, the constraint was vacuous on
      // run ids, and a run could record a verification of itself. The node-level constraint held; this closes the
      // run-level one by recording, in the same transaction, that the run authors the work it claimed.
      await client.query('update factory.agent_runs set authoring_run_id = run_id where run_id = $1', [runId]);

      // The surface lock. Its primary key is the enforcement: a conflicting surface raises here and the
      // whole claim rolls back, so a second node cannot end up believing it owns the same files.
      for (const surface of wo.owned_surface || []) {
        await client.query(
          `insert into factory.surface_locks (surface, run_id, node_id, lease_expires_at)
           values ($1, $2, $3, now() + ($4 || ' seconds')::interval)`,
          [surface, runId, nodeId, String(lease)]);
      }

      await client.query(
        `update factory.work_orders set status = 'claimed', updated_at = now() where work_order_id = $1`,
        [wo.work_order_id]);

      await client.query('commit');
      return run.rows[0];
    } catch (e) {
      try { await client.query('rollback'); } catch { /* already aborted */ }
      // A surface collision is an ordinary race, not a failure: the other node won.
      if (String(e && e.code) === '23505') return null;
      throw e;
    }
  });
}

/** Renew the lease. A node that stops calling this loses its claim, which is the point. */
export async function heartbeat({ runId, nodeId, leaseSeconds = DEFAULT_LEASE_SECONDS }) {
  const r = await db.write(
    `update factory.agent_runs
        set last_heartbeat_at = now(),
            lease_expires_at = now() + ($3 || ' seconds')::interval,
            updated_at = now()
      where run_id = $1 and node_id = $2 and status = 'in_progress'
      returning run_id`,
    [runId, nodeId, String(leaseSeconds)]);
  if (r.rows.length) {
    await db.write(
      `update factory.surface_locks
          set lease_expires_at = now() + ($2 || ' seconds')::interval
        where run_id = $1`, [runId, String(leaseSeconds)]);
  }
  return r.rows.length === 1;
}

/** Persist progress. The row is a pointer; the evidence lives in the repository. */
export async function checkpoint({ runId, workOrderId, location, scenario = null, payload = {} }) {
  await db.write(
    `insert into factory.checkpoints (run_id, work_order_id, location, scenario, payload)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [runId, workOrderId, location, scenario, JSON.stringify(payload)]);
  await db.write(
    `update factory.agent_runs
        set checkpoint_location = $2, last_completed_scenario = coalesce($3, last_completed_scenario),
            updated_at = now()
      where run_id = $1`, [runId, location, scenario]);
}

/** Finish a run and release its surfaces.
 *
 * A FINISHED RUN MUST SAY HOW IT FINISHED, and the database now refuses one that does not:
 * `agent_runs_terminal_status_states_its_reason` in 001_factory_control_plane.sql. This function used to set
 * status='done' and write no termination_reason at all, so the constraint and the only caller of this
 * function disagreed — the constraint would have raised on the runner's own completion write. Found by
 * reading the write path after adding the constraint, rather than by a failure later.
 *
 * The reason is REQUIRED rather than defaulted, because a default would be this function inventing the
 * terminal condition it exists to record. That is the 2026-08-24 defect in miniature: eight OpenAI attempts
 * of HTTP 200 with a body that never terminated, recorded as nothing in particular.
 * HTTP SUCCESS IS NOT A VALID COMPLETED RUN.
 */
export async function completeRun({ runId, status = 'done', summary = null, headCommit = null,
  terminationReason = null, actualProvider = null, actualModel = null, fallbackReason = null,
  usage = null }) {
  if ((status === 'done' || status === 'failed') && !terminationReason) {
    throw new Error('completeRun: status ' + status + ' claims a terminal outcome, so terminationReason is'
      + ' required — name the terminal condition that was actually observed (completed, stream_timeout,'
      + ' stream_never_terminated, auth_error, quota, provider_refused, …). The database enforces this too.');
  }
  // A SUBSTITUTION MAY NOT BE RECORDED WITHOUT A STATED REASON — also a constraint rather than a convention.
  // Refused here as well, so a caller gets a sentence naming both models instead of a bare 23514.
  if (actualProvider || actualModel) {
    const { rows } = await db.read(
      'select requested_provider, requested_model from factory.agent_runs where run_id = $1', [runId]);
    const r = rows[0] || {};
    const providerMoved = actualProvider && r.requested_provider && actualProvider !== r.requested_provider;
    const modelMoved = actualModel && r.requested_model && actualModel !== r.requested_model;
    if ((providerMoved || modelMoved) && !fallbackReason) {
      throw new Error('completeRun: served by ' + (actualProvider || r.requested_provider) + '/'
        + (actualModel || r.requested_model) + ' but requested ' + r.requested_provider + '/'
        + r.requested_model + '. A substitution needs a fallbackReason — NO SILENT MODEL FALLBACK.');
    }
  }
  const u = usage || {};
  await db.write(
    `update factory.agent_runs
        set status = $2, summary = coalesce($3, summary), head_commit = coalesce($4, head_commit),
            termination_reason = $5,
            actual_provider = coalesce($6, actual_provider),
            actual_model = coalesce($7, actual_model),
            fallback_reason = coalesce($8, fallback_reason),
            reasoning_effort = coalesce($9, reasoning_effort),
            input_tokens = coalesce($10, input_tokens),
            cached_tokens = coalesce($11, cached_tokens),
            output_tokens = coalesce($12, output_tokens),
            estimated_cost_usd = coalesce($13, estimated_cost_usd),
            finished_at = now(), lease_expires_at = null, updated_at = now()
      where run_id = $1`,
    [runId, status, summary, headCommit, terminationReason, actualProvider, actualModel, fallbackReason,
      u.reasoningEffort ?? null, u.inputTokens ?? null, u.cachedTokens ?? null, u.outputTokens ?? null,
      u.estimatedCostUsd ?? null]);
  await db.write('delete from factory.surface_locks where run_id = $1', [runId]);
  if (status === 'done') {
    await db.write(
      `update factory.work_orders
          set status = 'done', completed_at = now(), updated_at = now()
        where work_order_id = (select work_order_id from factory.agent_runs where run_id = $1)`, [runId]);
  }
}

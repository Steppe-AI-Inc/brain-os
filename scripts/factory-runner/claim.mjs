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

// Which environment variable carries a provider's credential. Keys are never stored on the plane (AI_PROVIDER_RELIABILITY);
// the claim only asks whether this process HAS one, and says BLOCKED_BY_CREDENTIAL when it does not.
// Anthropic is NOT here: the Factory reaches it through the `claude` CLI (provider.mjs), whose login is its own and is
// not an environment variable, so its reachability is decided by run evidence like any provider without a listed key.
export const CREDENTIAL_ENV = { deepseek: 'DEEPSEEK_API_KEY', openai: 'OPENAI_API_KEY' };
export const credentialPresentFor = (provider) => {
  const v = provider ? CREDENTIAL_ENV[String(provider).toLowerCase()] : null;
  return v ? Boolean(process.env[v]) : true;
};

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
    // ONLY A FINISHED, SUCCESSFUL RUN CAN BE VERIFIED. This matched the authoring run by id alone: a FAILED run was marked
    // verified, the verify work order reported 'completed_with_verdict', and the milestone count took it as independent
    // evidence (final verification 2026-09-24). The run must be 'done'; anything else is refused by name and nothing is written.
    // The independence constraints still decide FIRST: a row that would violate them (a run verifying itself - always still in
    // progress - or its authoring node) stays in the update, so the database refuses it by the constraint's name.
    const r = await db.write(
      `update factory.agent_runs
          set verification_run_id = $2, verification_node_id = $3, updated_at = now()
        where run_id = $1 and (status = 'done' or run_id = $2 or authoring_node_id = $3)
        returning run_id, authoring_node_id, verification_node_id`,
      [authoringRunId, verificationRunId, v.rows[0].node_id]);
    if (r.rowCount === 1) return { accepted: true, row: r.rows[0] };
    const a = await db.read('select status from factory.agent_runs where run_id = $1', [authoringRunId]);
    return { accepted: false, reason: a.rows.length ? 'authoring run is ' + a.rows[0].status + ', not done - only a finished, successful run can be verified' : 'authoring run not found' };
  } catch (e) {
    const m = String(e && e.message || e);
    if (/verification_is_independent|verification_node_is_independent/.test(m)) return { accepted: false, reason: m.match(/verification_(?:node_)?is_independent/)[0] };
    throw e;
  }
}

/** Register (or refresh) this node. Capabilities are what the director schedules on.
 *
 * stamp: false REGISTERS WITHOUT CLAIMING LIVENESS. A registration used to stamp last_heartbeat_at, so a health check run on a
 * PC whose node was dead made it read ALIVE for three minutes, and a worker that registered and then failed every claim read
 * ALIVE while it crash-looped (final verification 2026-09-24). Liveness is stamped only by what a working node does - its beat
 * after a completed claim cycle and its run heartbeat. An unstamped new record starts at the epoch: it reads STALE, "never beaten". */
//
// onlyIfAbsent: true WRITES NOTHING OVER AN EXISTING RECORD - what a check uses. The running worker's record (its role, and the
// commit and handler version in its capabilities) is the worker's: a check run from the same checkout after it was updated
// would have written the NEW commit over a worker still running the old one (final verification 2026-09-24). The no-op
// update still exercises the write privilege. Returns { nodeId, inserted }.
export async function registerNode({ nodeId, capabilities = [], securityRole = 'generic', platform = '', agentVersion = '', stamp = true, onlyIfAbsent = false }) {
  if (!nodeId) throw new Error('registerNode requires a nodeId');
  const r = await db.write(
    `insert into factory.nodes (node_id, capabilities, security_role, platform, agent_version, last_heartbeat_at)
     values ($1, $2::jsonb, $3, $4, $5, case when $6::boolean then now() else to_timestamp(0) end)
     on conflict (node_id) do update
       set capabilities = case when $7::boolean then factory.nodes.capabilities else excluded.capabilities end,
           security_role = case when $7::boolean then factory.nodes.security_role else excluded.security_role end,
           platform = case when $7::boolean then factory.nodes.platform else excluded.platform end,
           agent_version = case when $7::boolean then factory.nodes.agent_version else excluded.agent_version end,
           last_heartbeat_at = case when $6::boolean and not $7::boolean then now() else factory.nodes.last_heartbeat_at end
     returning (xmax = 0) as inserted`,
    [nodeId, JSON.stringify(capabilities), securityRole, platform, agentVersion, stamp !== false, onlyIfAbsent === true]);
  return { nodeId, inserted: !!(r.rows[0] && r.rows[0].inserted) };
}

/**
 * Claim one eligible work order for this node, atomically.
 *
 * Eligible means: queued (or blocked past its retry_after), every dependency done, and no surface it owns
 * currently locked by a live lease. Returns the claimed run, or null when there is nothing to take — null
 * is an ordinary outcome and not an error, because "another node got there first" is the system working.
 */
// `onlyWorkOrderId` narrows the pick to ONE work order (a node resuming a specific piece of work, or an acceptance that
// must not touch anything else on a shared plane). Every other rule - role, capabilities, dependencies, surface locks,
// heavy limits, admission, assurance - still applies to it; the filter can only make the claim take less.
// `workTypes` narrows the pick to the work types the caller can actually do. A node claims ONLY what it has a handler
// for: the default bootstrap used to claim every work order and report it done - verifier-gated ones included - within a
// second, unblocking dependent release work that nobody had verified (verification 2026-09-24, round 2).
/** The claim transaction's opening: BEGIN plus its lock and idle limits (one round trip). Exported so the acceptance holds the
 * claim lock EXACTLY the way a real claimer does when it proves a dead claimer cannot block the plane. */
export const claimSessionSql = () => 'begin; set local lock_timeout = ' + Math.round(db.pgTimeoutMs('FACTORY_PG_LOCK_TIMEOUT_MS', 15000))
  + '; set local idle_in_transaction_session_timeout = ' + Math.round(db.pgTimeoutMs('FACTORY_PG_IDLE_TX_TIMEOUT_MS', 30000));

// baseCommit: the commit the claiming node runs, written on the run in the same insert - evidence is then tied to a commit
// (nothing recorded which commit a node ran; a Work PC on an older checkout passed the two-machine acceptance - final
// verification 2026-09-24).
export async function claimWork({ nodeId, leaseSeconds = DEFAULT_LEASE_SECONDS, capabilities = null,
  requestedProvider = null, requestedModel = null, reasoningEffort = null, onlyWorkOrderId = null, workTypes = null, baseCommit = null }) {
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
  return claimInTransaction({ nodeId, lease, capabilities, requestedProvider, requestedModel, reasoningEffort, onlyWorkOrderId, workTypes, baseCommit });
}

// db.transaction() runs a fixed list of statements, which cannot express "read a row then decide". The
// claim needs a live client, so it borrows the same connection rules by going through db.withClient().
async function claimInTransaction({ nodeId, lease, capabilities,
  requestedProvider = null, requestedModel = null, reasoningEffort = null, onlyWorkOrderId = null, workTypes = null, baseCommit = null }) {
  return db.withClient(async (client) => {
    // A CLAIM CANNOT HOLD THE PLANE. A node that lost its connection inside this transaction held the plane-wide claim lock
    // until the server noticed the dead session, and every other node's claims waited with it (verification 2026-09-24,
    // round 3). The server ends this transaction if it sits idle, and a claim that waits too long for the lock gives up -
    // "nothing claimed this time" - instead of joining the queue behind a dead one. Set here, in the same round trip as BEGIN,
    // because the Supabase pooler drops settings sent in the startup packet.
    await client.query(claimSessionSql());
    try {
      // CLAIMS ARE SERIALIZED PLANE-WIDE. The row lock (`for update skip locked`) and the surface-lock primary key make
      // the per-work-order and per-surface rules race-safe by construction; the heavy LIMITS are counts, and a count read
      // inside two concurrent transactions is the same number in both. Measured on the live plane 2026-09-22
      // (shared_plane_live_acceptance L8): two processes reaching for two heavy work orders under FACTORY_HEAVY_PER_PLANE=1
      // both saw zero heavy runs in progress and both claimed. A transaction-scoped advisory lock makes every claim
      // wait for the previous claim's commit, so the count it reads is the truth. Claims are seconds apart at Factory
      // scale; the serialization costs nothing measurable and removes a whole class of "counted, not locked" races.
      await client.query("select pg_advisory_xact_lock(hashtext('factory.claim'))");
      claimWork.lastBusy = null; // the lock was taken: not busy (lastBusy says since when it was)
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
            -- node_id is KEPT: which node ran an abandoned execution, and until when (its last heartbeat), stays on the plane (it
            -- was erased, so an overlap on a surface could not be seen afterwards - final verification 2026-09-24)
            set status = 'queued', lease_expires_at = null,
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
      // A DECLINED WORK ORDER DOES NOT STARVE THE NODE (Factory V1 milestone 6, found by shared_control_plane_acceptance
      // CP-15). The first version picked one row, declined it at the assurance gate and returned null - so a verifier
      // work order at the head of the queue that this node's model may not serve hid every generic work order behind
      // it, and a node with an unproven model could claim nothing at all. The pick is a loop: a declined work order is
      // excluded and the next eligible one is tried, inside the same transaction; the declined one still waits for a
      // node that can serve it.
      const declined = [];
      let wo = null;
      for (let attempt = 0; attempt < 8; attempt++) {
      const params = [myRank, JSON.stringify(myCaps), nodeId, heavyPerPlane, declined, onlyWorkOrderId, Array.isArray(workTypes) ? workTypes : null];

      const picked = await client.query(
        // requires_security_role IS SELECTED, because the assurance gate below reads it. The first version of
        // that gate read wo.requires_security_role off a row the SELECT did not carry it on, got undefined, and
        // silently never fired - a guard whose text was present and whose behaviour was absent, caught by the
        // acceptance row that asserts the REFUSAL rather than the source.
        `select wo.work_order_id, wo.owned_surface, wo.requires_security_role
           from factory.work_orders wo
          where wo.status = 'queued'
            and not (wo.work_order_id = any($5::uuid[]))
            and ($6::uuid is null or wo.work_order_id = $6::uuid)
            -- only the work types this caller can do (null: the caller does its own dispatch)
            and ($7::text[] is null or wo.work_type = any($7::text[]))
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
      wo = picked.rows[0];

      // A MALFORMED WORK ORDER DOES NOT STARVE THE PLANE. A NULL or empty surface failed the lock insert (23502) and ended the
      // worker - every node crash-looped on the same head of the queue - and a repeated surface collided with itself (23505,
      // read as "another node won"), so nothing behind it was ever claimed (final verification 2026-09-24). A repeat is one
      // surface; a work order with a NULL or empty surface is declined by name and left for a human, and the next is tried.
      if ((wo.owned_surface || []).some((s) => typeof s !== 'string' || !s.trim())) {
        claimWork.malformed = claimWork.malformed || new Set();
        // said once per work order per process (the claim loop runs every few seconds)
        if (!claimWork.malformed.has(wo.work_order_id)) { claimWork.malformed.add(wo.work_order_id); console.log('[claim] declining ' + String(wo.work_order_id).slice(0, 8) + ': its owned_surface has a NULL or empty entry - fix the work order'); }
        declined.push(wo.work_order_id);
        wo = null;
        continue;
      }
      wo.owned_surface = [...new Set(wo.owned_surface || [])];

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
        // THE CREDENTIAL IS PART OF THE STANDING (Factory V1 milestone 6). A provider whose key is not in this
        // process's environment cannot be served by this node whatever its history says; deriveAssurance already
        // ranks that as BLOCKED_BY_CREDENTIAL, and the claim now tells it. Known providers map to their key's
        // variable; an unknown provider is assumed reachable so that its run EVIDENCE decides, as before.
        const standing = deriveAssurance(hist.rows, { credentialPresent: credentialPresentFor(requestedProvider) });
        const verdict = mayServe(wo.requires_security_role === 'release_broker' ? 'release_broker' : 'verifier_round', standing);
        if (!verdict.allowed) {
          // SAID, NOT SILENT. A refusal nobody records is indistinguishable from an empty queue, and this one
          // will look exactly like "the Factory stopped picking up verifier work" to whoever reads it next.
          console.log('[claim] declining ' + String(wo.work_order_id).slice(0, 8) + ': ' + verdict.reason);
          declined.push(wo.work_order_id);
          wo = null;
          continue;
        }
      }
      break;
      }
      if (!wo) { await client.query('rollback'); return null; }

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
            requested_provider, requested_model, reasoning_effort, base_commit)
         values ($1, $2, 'in_progress', now() + ($3 || ' seconds')::interval, now(), now(), $2, $4, $5, $6, $7)
         returning run_id, work_order_id, node_id, attempt_count, lease_expires_at,
                   requested_provider, requested_model`,
        [wo.work_order_id, nodeId, String(lease), requestedProvider, requestedModel, reasoningEffort, baseCommit]);
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
      // The claim lock was held longer than lock_timeout (another claimer, perhaps one whose connection died): nothing was
      // claimed this time; the next loop tries again, and the server ends the dead holder's idle transaction.
      if (String(e && e.code) === '55P03') { claimWork.lastBusy = claimWork.lastBusy || new Date().toISOString(); return null; }
      throw e;
    }
  });
}

/** Renew the lease. A node that stops calling this loses its claim, which is the point.
 *
 * ONE STATEMENT: the run's lease, its surface locks, and the NODE's own record. A node busy on a run stamped nothing on its node
 * record - only the idle loop did - so a node working for more than three minutes read STALE: -Verify failed and the Home PC saw
 * no ALIVE node exactly while it worked (verification 2026-09-24, round 4). And the lock renewal was a second statement that a
 * lost connection could skip. */
export async function heartbeat({ runId, nodeId, leaseSeconds = DEFAULT_LEASE_SECONDS }) {
  const r = await db.write(
    `with run as (
      update factory.agent_runs
         set last_heartbeat_at = now(),
             lease_expires_at = now() + ($3 || ' seconds')::interval,
             updated_at = now()
       where run_id = $1 and node_id = $2 and status = 'in_progress'
       returning run_id),
    locks as (
      update factory.surface_locks set lease_expires_at = now() + ($3 || ' seconds')::interval
       where run_id in (select run_id from run)),
    stamped as (
      update factory.nodes set last_heartbeat_at = now()
       where node_id = $2 and exists (select 1 from run))
    select run_id from run`,
    [runId, nodeId, String(leaseSeconds)]);
  return r.rows.length === 1;
}

/** A run that lost its lease to a takeover: its node keeps going only until it next reports, and then stops. */
export class LeaseLost extends Error { constructor(msg) { super(msg); this.name = 'LeaseLost'; } }

/** Persist progress. The row is a pointer; the evidence lives in the repository. */
export async function checkpoint({ runId, workOrderId, location, scenario = null, payload = {}, nodeId = null }) {
  // FENCED: a run whose lease was taken over (its row requeued, or given to another node) writes no more progress - its
  // checkpoints used to interleave with the new owner's (verification 2026-09-24, round 3). With a nodeId the run must still
  // be in progress AND this node's; the caller learns it lost the lease and stops.
  if (nodeId) {
    const own = await db.read("select 1 from factory.agent_runs where run_id = $1 and node_id = $2 and status = 'in_progress'", [runId, nodeId]);
    if (!own.rows.length) throw new LeaseLost('run ' + String(runId).slice(0, 8) + ' is no longer this node\'s (its lease was taken over); checkpoint not written');
  }
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
  usage = null, nodeId = null }) {
  // a run finishes done or failed; anything else would leave its work order 'claimed' with no run holding it
  if (status !== 'done' && status !== 'failed') throw new Error('completeRun: status must be done or failed, not ' + JSON.stringify(status));
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
  // ONE STATEMENT, SO ALL OR NOTHING. The run, its surface locks and its work order were three writes on three connections; a
  // connection lost after the first left the run done, its locks held and its work order 'claimed' forever - the lease
  // recovery only requeues runs in progress, so nothing freed it and its dependents never ran (verification round 4).
  const fin = await db.write(
    `with fin as (
      update factory.agent_runs
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
      where run_id = $1 and status = 'in_progress' and ($14::text is null or node_id = $14::text)
      returning run_id, work_order_id),
    unlocked as (delete from factory.surface_locks where run_id in (select run_id from fin)),
    -- A FAILED RUN FAILS ITS WORK ORDER, in the same statement. Only 'done' moved the work order before: a run that returned
    -- 'failed' left it 'claimed' with no run holding it - the lease recovery requeues runs in progress only - so its dependents
    -- waited forever while health said HEALTHY (verification 2026-09-24, round 4). A returned failure is terminal (a transient
    -- error throws instead, and the lease brings the work back); the run's termination_reason says why.
    finished as (
      update factory.work_orders
         set status = $2, completed_at = case when $2 = 'done' then now() else completed_at end, updated_at = now()
       where work_order_id in (select work_order_id from fin))
    select work_order_id from fin`,
    [runId, status, summary, headCommit, terminationReason, actualProvider, actualModel, fallbackReason,
      u.reasoningEffort ?? null, u.inputTokens ?? null, u.cachedTokens ?? null, u.outputTokens ?? null,
      u.estimatedCostUsd ?? null, nodeId]);
  // FENCED ON THE RUN'S OWN LIVE OWNERSHIP. A run whose lease expired and was taken over used to finish anyway: this update
  // matched it by run_id alone and then set the WORK ORDER done while the new owner's run was still working, releasing its
  // dependents early - two "done" runs for one work order (verification 2026-09-24, round 3). Now nothing changes unless
  // this run is still in progress (and this node's, when the node says who it is); the work order is completed only by
  // the run that holds it.
  if (!fin.rows.length) return { superseded: true };
  return { superseded: false };
}

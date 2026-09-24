// THE `factory_acceptance` WORK TYPE - how the real, supervised workers on real machines prove the Factory's own
// milestones from the plane alone, with nobody typing on the Work PC.
//
// A work order of work_type 'factory_acceptance' carries its instruction in `handoff` as JSON:
//   { "action": "hold", "seconds": 25 }                       claim, checkpoint, hold the lease that long, complete
//   { "action": "die", "dieOn": "<node id>", "takeoverNode": "<node id>" }
//                                                             the named node claims, checkpoints, hands the work order to
//                                                             the takeover node (requires_capabilities = node:<id>), shortens
//                                                             its own lease to seconds and EXITS the worker (a crash); the
//                                                             supervisor restarts it; the takeover node claims after the lease
//                                                             lapses, reads the dead node's checkpoint, completes
//   { "action": "verify", "authoringRunId": "<run id>" }      record a verification of that run through the runner's own path
//   { "action": "complete" }                                  claim, checkpoint, complete
//
// Every checkpoint carries the HOSTNAME, which is what two_machine_real.mjs verifies on: two node ids on one hostname prove
// the instrument, two hostnames prove the milestone. The scenarios 'phase-1-hold' / 'phase-2-takeover' are the ones the
// final composer (factory_v1_acceptance.mjs) reads for the real two-machine failover row.
//
// No worktree is created for this work type (nodeStart skips it): an acceptance run has no code to check out.
import { hostname } from 'node:os';
import * as db from '../db.mjs';
import { recordVerification } from '../claim.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The instructions this handler carries out. Stated in every checkpoint, so a seeder newer than this worker can see which it ran.
export const HANDLER_VERSION = 'factory-acceptance/2';
export const ACTIONS = ['hold', 'die', 'verify', 'complete'];

export async function factoryAcceptance({ run, workOrder, checkpoint, nodeId, log = () => {} }) {
  const host = hostname();
  // DONE ONLY FOR AN INSTRUCTION ACTUALLY CARRIED OUT. A handoff that did not parse became {} and any action other than
  // hold/die/verify fell through to 'complete' - 'verify-v2', 'Verify' and 'hold 30 seconds' were all reported done within a
  // second, releasing their dependents with nothing verified (verification 2026-09-24, round 4). Across two machines the worker
  // runs the checkout it cloned while the seeder runs its own: an action this version does not know FAILS, by name.
  let p;
  try { p = JSON.parse(workOrder.handoff || ''); } catch { p = null; }
  if (!p || typeof p !== 'object' || Array.isArray(p)) {
    return { status: 'failed', terminationReason: 'factory_acceptance_bad_handoff', summary: 'handoff is not a JSON object (' + JSON.stringify(String(workOrder.handoff ?? '').slice(0, 60)) + '); ' + HANDLER_VERSION + ' carries out ' + ACTIONS.join(' | ') + ' - nothing was done on ' + host };
  }
  if (!ACTIONS.includes(p.action)) {
    return { status: 'failed', terminationReason: 'factory_acceptance_unknown_action', summary: 'action ' + JSON.stringify(p.action ?? null) + ' is not one ' + HANDLER_VERSION + ' carries out (' + ACTIONS.join(' | ') + ') - nothing was done on ' + host };
  }
  const base = { hostname: host, nodeId, action: p.action, title: workOrder.title, handler: HANDLER_VERSION };

  if (p.action === 'hold') {
    const seconds = Math.min(600, Math.max(1, Number(p.seconds) || 10));
    await checkpoint('handlers/factory-acceptance.mjs', 'wave', { ...base, seconds });
    log('holding ' + String(run.work_order_id).slice(0, 8) + ' for ' + seconds + ' s');
    await sleep(seconds * 1000);
    return { status: 'done', terminationReason: 'factory_acceptance_hold', summary: 'held ' + seconds + ' s on ' + host + ' by ' + nodeId };
  }

  if (p.action === 'die') {
    const prior = (await db.read("select payload from factory.checkpoints where work_order_id = $1 and scenario = 'phase-1-hold' order by created_at desc limit 1", [run.work_order_id])).rows;
    if (!prior.length && p.dieOn === nodeId) {
      // phase 1: this node was named to die. Hand the work order to the takeover node, make the lease lapse in seconds
      // rather than minutes, checkpoint, and crash the worker. The supervisor restarts this node; the takeover node claims.
      await checkpoint('handlers/factory-acceptance.mjs', 'phase-1-hold', { ...base, phase: 1, lease: 10, takeoverNode: p.takeoverNode });
      if (p.takeoverNode) await db.write('update factory.work_orders set requires_capabilities = $2::text[], updated_at = now() where work_order_id = $1', [run.work_order_id, ['factory_acceptance', 'node:' + p.takeoverNode]]);
      await db.write("update factory.agent_runs set lease_expires_at = now() + interval '10 seconds' where run_id = $1", [run.run_id]);
      await db.write("update factory.surface_locks set lease_expires_at = now() + interval '10 seconds' where run_id = $1", [run.run_id]);
      log('DYING on purpose for ' + String(run.work_order_id).slice(0, 8) + ' (factory_acceptance die); the lease lapses in 10 s; the supervisor restarts this worker');
      await sleep(300);
      process.exit(3);
    }
    if (!prior.length) {
      // not the named node and nobody has died yet: this must not be taken here (a seeder addresses a die with node:<dieOn>, so
      // this is a mis-seeded work order). Finished without claiming success: the run fails with a stated reason, and its work
      // order with it - nothing re-queues a failed work order.
      return { status: 'failed', terminationReason: 'factory_acceptance_wrong_node', summary: 'die was addressed to ' + p.dieOn + ', not ' + nodeId };
    }
    const dead = prior[0].payload || {};
    await checkpoint('handlers/factory-acceptance.mjs', 'phase-2-takeover', { ...base, phase: 2, resumedFrom: dead.nodeId, resumedFromHost: dead.hostname });
    return { status: 'done', terminationReason: 'factory_acceptance_takeover', summary: 'took over from ' + dead.nodeId + ' on ' + dead.hostname + '; now on ' + host + ' by ' + nodeId };
  }

  if (p.action === 'verify') {
    const v = await recordVerification({ authoringRunId: p.authoringRunId, verificationRunId: run.run_id });
    await checkpoint('handlers/factory-acceptance.mjs', 'verify', { ...base, authoringRunId: p.authoringRunId, accepted: v.accepted, reason: v.reason || null });
    return v.accepted
      ? { status: 'done', terminationReason: 'completed_with_verdict', summary: 'verified ' + p.authoringRunId + ' on ' + host + ' by ' + nodeId }
      : { status: 'failed', terminationReason: 'verification_refused', summary: 'verification of ' + p.authoringRunId + ' refused: ' + v.reason };
  }

  // p.action === 'complete': the one remaining instruction, stated explicitly
  await checkpoint('handlers/factory-acceptance.mjs', 'complete', base);
  return { status: 'done', terminationReason: 'factory_acceptance_completed', summary: 'completed on ' + host + ' by ' + nodeId };
}

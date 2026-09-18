#!/usr/bin/env node
// ONE RUNNER PROCESS AGAINST THE SHARED CONTROL PLANE. Spawned by shared_control_plane_acceptance.mjs, several at once,
// each with its own node id, so that what is measured is separate OS processes racing through one PostgreSQL server -
// not calls inside one process. It uses the runner's own claim / checkpoint / complete / verify path (claim.mjs).
//
//   node qa/factory/shared_pg_worker.mjs <nodeId> <mode> [leaseSeconds] [arg]
//     mode = complete            claim once, checkpoint, complete, exit 0 (prints CLAIMED <run_id> <work_order_id> or NOTHING)
//     mode = die                 claim once, checkpoint, then exit 3 WITHOUT completing (a crashed worker; the lease must expire)
//     mode = resume              claim once and report PRIOR_CHECKPOINTS <n> from earlier runs of the same work order
//     mode = verify <runId>      claim once (a verifier's own work order), then record a verification of <runId> through the
//                                runner's recordVerification; prints VERIFIED or REJECTED <constraint>
//     mode = selfverify          claim once, then try to record a verification of its OWN run (must be refused)
//   env  WORKER_ROLE            security role registered on the plane (generic | verifier | release_broker); default generic
//   env  WORKER_CLAIM_CAPS      comma-separated capabilities passed to claimWork as the CALLER'S claim (a liar's test)
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const [nodeId, mode, lease, arg] = process.argv.slice(2);
if (!nodeId || !mode) { console.log('usage: shared_pg_worker.mjs <nodeId> <complete|die|resume|verify|selfverify> [leaseSeconds] [arg]'); process.exit(2); }
if (!process.env.FACTORY_RUNNER_PG_URL) { console.log('FACTORY_RUNNER_PG_URL is not set'); process.exit(2); }
const role = process.env.WORKER_ROLE || 'generic';
const claimCaps = process.env.WORKER_CLAIM_CAPS ? process.env.WORKER_CLAIM_CAPS.split(',') : null;

// imported AFTER the env var is set (db.mjs reads it at module load) - here it is set by the parent
const claim = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/claim.mjs')).href);
const db = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href);

await claim.registerNode({ nodeId, capabilities: ['shared-plane-acceptance'], securityRole: role, platform: process.platform + ':' + process.pid });
const run = await claim.claimWork({ nodeId, leaseSeconds: Number(lease || 30), ...(claimCaps ? { capabilities: claimCaps } : {}) });
if (!run) { console.log('NOTHING'); process.exit(0); }
console.log('CLAIMED ' + run.run_id + ' ' + run.work_order_id);
if (mode === 'resume') {
  const prior = await db.read('select count(*)::int n from factory.checkpoints where work_order_id = $1 and run_id <> $2', [run.work_order_id, run.run_id]);
  console.log('PRIOR_CHECKPOINTS ' + prior.rows[0].n);
}
await claim.checkpoint({ runId: run.run_id, workOrderId: run.work_order_id, location: 'qa/factory/shared_pg_worker.mjs', scenario: mode, payload: { pid: process.pid, nodeId, role } });
if (mode === 'die') { console.log('DYING without completing (pid ' + process.pid + ')'); process.exit(3); }
if (mode === 'verify' || mode === 'selfverify') {
  const target = mode === 'selfverify' ? run.run_id : arg;
  const v = await claim.recordVerification({ authoringRunId: target, verificationRunId: run.run_id });
  console.log(v.accepted ? 'VERIFIED ' + target + ' by ' + v.row.verification_node_id : 'REJECTED ' + v.reason);
}
await claim.completeRun({ runId: run.run_id, status: 'done', summary: mode + ' by ' + nodeId + ' pid ' + process.pid, terminationReason: 'shared_plane_acceptance_worker_completed' });
console.log('COMPLETED ' + run.run_id);
process.exit(0);

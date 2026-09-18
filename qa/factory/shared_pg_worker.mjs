#!/usr/bin/env node
// ONE RUNNER PROCESS AGAINST THE SHARED CONTROL PLANE. Spawned by shared_control_plane_acceptance.mjs, several at once,
// each with its own node id, so that what is measured is two OS processes racing through one PostgreSQL server -
// not two calls inside one process. It uses the runner's own claim / checkpoint / complete path (claim.mjs).
//
//   node qa/factory/shared_pg_worker.mjs <nodeId> <mode> [leaseSeconds]
//     mode = complete   claim once, checkpoint, complete, exit 0 (prints CLAIMED <run_id> or NOTHING)
//     mode = die        claim once, checkpoint, then exit 3 WITHOUT completing (a crashed worker; the lease must expire)
//     mode = resume     claim once and report whether a checkpoint from an earlier run of the same work order is visible
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const [nodeId, mode, lease] = process.argv.slice(2);
if (!nodeId || !mode) { console.log('usage: shared_pg_worker.mjs <nodeId> <complete|die|resume> [leaseSeconds]'); process.exit(2); }
if (!process.env.FACTORY_RUNNER_PG_URL) { console.log('FACTORY_RUNNER_PG_URL is not set'); process.exit(2); }

// imported AFTER the env var is set (db.mjs reads it at module load) - here it is set by the parent
const claim = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/claim.mjs')).href);
const db = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href);

await claim.registerNode({ nodeId, capabilities: ['shared-plane-acceptance'], platform: process.platform + ':' + process.pid });
const run = await claim.claimWork({ nodeId, leaseSeconds: Number(lease || 30) });
if (!run) { console.log('NOTHING'); process.exit(0); }
console.log('CLAIMED ' + run.run_id + ' ' + run.work_order_id);
if (mode === 'resume') {
  const prior = await db.read('select count(*)::int n from factory.checkpoints where work_order_id = $1 and run_id <> $2', [run.work_order_id, run.run_id]);
  console.log('PRIOR_CHECKPOINTS ' + prior.rows[0].n);
}
await claim.checkpoint({ runId: run.run_id, workOrderId: run.work_order_id, location: 'qa/factory/shared_pg_worker.mjs', scenario: mode, payload: { pid: process.pid, nodeId } });
if (mode === 'die') { console.log('DYING without completing (pid ' + process.pid + ')'); process.exit(3); }
await claim.completeRun({ runId: run.run_id, status: 'done', summary: mode + ' by ' + nodeId + ' pid ' + process.pid, terminationReason: 'shared_plane_acceptance_worker_completed' });
console.log('COMPLETED ' + run.run_id);
process.exit(0);

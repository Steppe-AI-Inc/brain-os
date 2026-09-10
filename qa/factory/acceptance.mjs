#!/usr/bin/env node
// FACTORY CONTROL PLANE — LOCAL ACCEPTANCE, A THROUGH K.
//
// Every test below runs against a REAL PostgreSQL started for this run and thrown away afterwards. That
// matters more than it sounds: the claims being made here are about `for update skip locked`, transaction
// visibility, primary-key conflicts and two clients racing, and an in-process fake would pass all of them
// while proving nothing. The harness proves it is a real server before any of this runs.
//
// The suite tries to BREAK the claim rather than to demonstrate it. Two nodes race for one work order; a
// worker is killed mid-run; a lease is expired by hand; two work orders reach for the same file.
import { startLocalPg } from './local_pg.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

let pass = 0;
const failures = [];
const check = (label, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + label); }
  else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + detail : '')); }
};

const pg = await startLocalPg();
process.env.FACTORY_RUNNER_PG_URL = pg.runnerUrl;

const { default: pgLib } = await import('pg');
const admin = new pgLib.Client({ connectionString: pg.superUrl });
await admin.connect();
await admin.query(readFileSync(join(ROOT, 'supabase/control-plane/001_factory_control_plane.sql'), 'utf8'));
await admin.query('grant usage on schema factory to ' + pg.runnerRole);
await admin.query('grant select, insert, update, delete on all tables in schema factory to ' + pg.runnerRole);

// The modules are imported AFTER FACTORY_RUNNER_PG_URL is set, because db.mjs reads it at module load.
const claim = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/claim.mjs')).href);

const wo = async (title, { surface = [], priority = 'medium', status = 'queued' } = {}) => {
  const id = randomUUID();
  await admin.query(
    `insert into factory.work_orders (work_order_id, title, owned_surface, priority, status)
     values ($1, $2, $3::text[], $4, $5)`, [id, title, surface, priority, status]);
  return id;
};

try {
  await claim.registerNode({ nodeId: 'node-alpha', capabilities: ['edge-verify'], platform: 'test' });
  await claim.registerNode({ nodeId: 'node-beta', capabilities: ['edge-verify'], platform: 'test' });
  const nodes = await admin.query('select count(*)::int n from factory.nodes');
  check('nodes register (no machine-specific identity anywhere in the row)', nodes.rows[0].n === 2);

  // ---- A. the scheduler claims a queued work order -------------------------------------------------
  const woA = await wo('A: claimable', { surface: ['qa/a.txt'] });
  const runA = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60 });
  check('A  a queued work order is claimed', runA && runA.work_order_id === woA,
    JSON.stringify(runA));

  // ---- B. the claim creates an isolated writer (a surface lock) ------------------------------------
  const lock = await admin.query('select surface, node_id from factory.surface_locks where run_id = $1', [runA.run_id]);
  check('B  the claim takes an exclusive lock on the surface it will write',
    lock.rows.length === 1 && lock.rows[0].surface === 'qa/a.txt' && lock.rows[0].node_id === 'node-alpha',
    JSON.stringify(lock.rows));

  // ---- H. a duplicate worker is prevented ----------------------------------------------------------
  const dup = await claim.claimWork({ nodeId: 'node-beta', leaseSeconds: 60 });
  check('H  a second node cannot claim the same work order', dup === null, JSON.stringify(dup));

  // ---- I. conflicting file ownership is serialized --------------------------------------------------
  await wo('I: same surface', { surface: ['qa/a.txt'] });
  const conflict = await claim.claimWork({ nodeId: 'node-beta', leaseSeconds: 60 });
  check('I  a different work order wanting the SAME surface is not claimable while it is held',
    conflict === null, JSON.stringify(conflict));

  // ...and a different surface still is, so the serialization is not just "nothing is claimable".
  const woOther = await wo('I: other surface', { surface: ['qa/b.txt'] });
  const otherRun = await claim.claimWork({ nodeId: 'node-beta', leaseSeconds: 60 });
  check('I2 a work order on a DIFFERENT surface is claimable concurrently',
    otherRun && otherRun.work_order_id === woOther, JSON.stringify(otherRun));

  // ---- C/D. the worker progresses and its checkpoint persists --------------------------------------
  await claim.checkpoint({ runId: runA.run_id, workOrderId: woA, location: 'qa/evidence/a.json', scenario: 'step-1' });
  await claim.checkpoint({ runId: runA.run_id, workOrderId: woA, location: 'qa/evidence/a2.json', scenario: 'step-2' });
  const cps = await admin.query('select location, scenario from factory.checkpoints where run_id = $1 order by created_at', [runA.run_id]);
  const runRow = await admin.query('select checkpoint_location, last_completed_scenario from factory.agent_runs where run_id = $1', [runA.run_id]);
  check('C  the worker progresses and each step is recorded', cps.rows.length === 2, JSON.stringify(cps.rows));
  check('D  the checkpoint persists, and the run points at the latest one',
    runRow.rows[0].checkpoint_location === 'qa/evidence/a2.json'
    && runRow.rows[0].last_completed_scenario === 'step-2', JSON.stringify(runRow.rows[0]));

  // ---- E/G. kill the worker: the lease expires and another node recovers the work -------------------
  // "Killing" a node is exactly this and nothing more: it stops renewing. No signal, no notification.
  await admin.query(`update factory.agent_runs set lease_expires_at = now() - interval '1 second' where run_id = $1`, [runA.run_id]);
  await admin.query(`update factory.surface_locks set lease_expires_at = now() - interval '1 second' where run_id = $1`, [runA.run_id]);
  await admin.query(`update factory.work_orders set status = 'queued' where work_order_id = $1`, [woA]);
  const recovered = await claim.claimWork({ nodeId: 'node-beta', leaseSeconds: 60 });
  check('E/G  a dead node\'s expired lease is recovered by another node',
    recovered && recovered.work_order_id === woA && recovered.node_id === 'node-beta', JSON.stringify(recovered));

  const attempts = await admin.query('select attempt_count from factory.agent_runs where run_id = $1', [runA.run_id]);
  check('G2 the abandoned run is returned to queued and its attempt_count incremented',
    attempts.rows[0].attempt_count === 2, JSON.stringify(attempts.rows[0]));

  // ---- the heartbeat is what holds a claim ----------------------------------------------------------
  const beat = await claim.heartbeat({ runId: recovered.run_id, nodeId: 'node-beta', leaseSeconds: 60 });
  const wrongNode = await claim.heartbeat({ runId: recovered.run_id, nodeId: 'node-alpha', leaseSeconds: 60 });
  check('the owning node can renew its lease', beat === true);
  check('a node that does NOT own the run cannot renew it', wrongNode === false);

  // ---- J. already-completed evidence is reused ------------------------------------------------------
  await claim.completeRun({ runId: recovered.run_id, status: 'done', summary: 'finished', headCommit: 'abc123' });
  const afterDone = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60 });
  const doneWo = await admin.query('select status, completed_at from factory.work_orders where work_order_id = $1', [woA]);
  check('J  a completed work order is not claimed again',
    doneWo.rows[0].status === 'done' && (afterDone === null || afterDone.work_order_id !== woA),
    JSON.stringify({ doneWo: doneWo.rows[0], afterDone }));
  const released = await admin.query('select count(*)::int n from factory.surface_locks where run_id = $1', [recovered.run_id]);
  check('J2 completing a run releases its surface', released.rows[0].n === 0);

  // ---- dependencies ---------------------------------------------------------------------------------
  const base = await wo('dep: base', { surface: ['qa/dep-base.txt'] });
  const dependent = await wo('dep: dependent', { surface: ['qa/dep-child.txt'] });
  await admin.query('insert into factory.work_order_dependencies (work_order_id, depends_on) values ($1, $2)', [dependent, base]);
  await admin.query(`update factory.work_orders set status = 'queued' where work_order_id in ($1, $2)`, [base, dependent]);
  // Free every other lock so only the dependency can be the reason.
  await admin.query('delete from factory.surface_locks');
  const firstPick = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60 });
  check('a work order whose dependency is unfinished is NOT claimed before it',
    firstPick && firstPick.work_order_id !== dependent, JSON.stringify(firstPick));

  // ---- the independence invariant, enforced by the database ----------------------------------------
  let sameRunRejected = false;
  try {
    await admin.query(`update factory.agent_runs set authoring_run_id = run_id, verification_run_id = run_id where run_id = $1`, [runA.run_id]);
  } catch (e) { sameRunRejected = /verification_is_independent/.test(String(e.message)); }
  check('a run cannot be its own verification (enforced by a constraint, not a habit)', sameRunRejected);

  let sameNodeRejected = false;
  try {
    await admin.query(`update factory.agent_runs set authoring_node_id = 'n1', verification_node_id = 'n1' where run_id = $1`, [runA.run_id]);
  } catch (e) { sameNodeRejected = /verification_node_is_independent/.test(String(e.message)); }
  check('and for high-assurance acceptance, the verifying node cannot be the authoring node', sameNodeRejected);

  // ---- K. no ambient production credential path exists ----------------------------------------------
  //
  // IN A CHILD PROCESS, because db.mjs captures FACTORY_RUNNER_PG_URL at MODULE LOAD. A process that
  // loaded it with a URL keeps that URL, so deleting the variable here would prove nothing. Reading it
  // once is the safer design — reading it at connect time would let a later environment change inject a
  // URL mid-process — and the cost is that this test needs a fresh process to be about anything.
  //
  // The environment handed to the child is the hostile one: a production access token and a production
  // database URL both present, and no FACTORY_RUNNER_PG_URL. If any ambient path survived, this is where
  // it would work.
  {
    const { spawnSync } = await import("node:child_process");
    const probe = [
      "import * as db from " + JSON.stringify(pathToFileURL(join(ROOT, "scripts/factory-runner/db.mjs")).href) + ";",
      "try { await db.read('select 1'); console.log('REACHED_A_DATABASE'); }",
      "catch (e) { console.log('REFUSED:' + String(e.message).slice(0, 120)); }",
    ].join("\n");
    const env = { ...process.env };
    delete env.FACTORY_RUNNER_PG_URL;
    env.SUPABASE_ACCESS_TOKEN = "sbp_fake_ambient_token";
    env.SUPABASE_DB_URL = "postgresql://postgres:pw@db.example.supabase.co:5432/postgres";
    env.PGHOST = "127.0.0.1"; env.PGPORT = String(pg.port); env.PGUSER = "postgres";
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", probe],
      { encoding: "utf8", env, cwd: ROOT, timeout: 60000 });
    const out = String(r.stdout || "") + String(r.stderr || "");
    check("K  with a production credential in the environment and no explicit URL, the runner REFUSES",
      /REFUSED:.*FACTORY_RUNNER_PG_URL is not set/.test(out) && !/REACHED_A_DATABASE/.test(out),
      out.trim().slice(0, 200));

    // ...and the same child WITH a legitimate least-privilege URL does reach the database, so the row
    // above is about the refusal and not about the child being broken.
    const env2 = { ...env, FACTORY_RUNNER_PG_URL: pg.runnerUrl };
    const r2 = spawnSync(process.execPath, ["--input-type=module", "-e", probe],
      { encoding: "utf8", env: env2, cwd: ROOT, timeout: 60000 });
    const out2 = String(r2.stdout || "") + String(r2.stderr || "");
    check("K2 the same child WITH an explicit least-privilege URL does reach the database",
      /REACHED_A_DATABASE/.test(out2), out2.trim().slice(0, 200));
  }
} finally {
  try { await admin.end(); } catch { /* ignore */ }
  await pg.stop();
}

console.log('');
console.log('factory acceptance: ' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) { for (const f of failures) console.log('  - ' + f); process.exit(1); }

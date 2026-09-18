#!/usr/bin/env node
// FOUNDER_POKE_NOT_REQUIRED — the permanent acceptance case for the Factory's heartbeat.
//
// IT PASSES ONLY IF a work order advances across at least one COMPLETED WORKER BOUNDARY while the process
// that started everything does nothing at all. Not "the loop can count": a real detached OS process must
// finish on its own schedule, leave a durable artifact, and be noticed and acted on by a DIFFERENT process
// than the one holding this test.
//
// THE HARNESS IS NOT ALLOWED TO BE THE DIRECTOR. It starts a disposable PostgreSQL, applies the schema,
// seeds one work order, spawns the director as a SEPARATE DETACHED OS PROCESS, and then only ever READS the
// database. It never calls tick(), never dispatches, and never writes a work-order row. If it did, it would
// be proving that I can still be the scheduler, which is the defect.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT.
//
//   PROVED   the director is a separate OS process; work completing outside it is noticed; the next run is
//            dispatched with no input; the work order advances to completion; killing and restarting the
//            director reconstructs state from the database and does not duplicate a dispatch or lose a
//            landed artifact.
//
//   NOT PROVED HERE   machine-level independence of the DATABASE. `embedded-postgres` is bound to the
//            process that starts it, so the disposable server lives inside this harness. When
//            FACTORY_RUNNER_PG_URL points at a real server — the founder-blocked item — the same acceptance
//            runs unchanged and that last dependency is gone. Saying so is the point: a test that implied
//            otherwise would be the false SENT of orchestration.
import { startLocalPg } from './local_pg.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const NL = String.fromCharCode(10);

let pass = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + name); }
  else { failures.push(name); console.log('FAIL ' + name + (detail ? NL + '       ' + detail : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pg = await startLocalPg();
process.env.FACTORY_RUNNER_PG_URL = pg.runnerUrl;
const work = mkdtempSync(join(tmpdir(), 'fpnr-'));
let director = null;

// Imported AFTER the URL is set: db.mjs reads it at module load, deliberately.
const { withClient } = await import('../../scripts/factory-runner/db.mjs');

const startDirector = (label) => {
  const child = spawn(process.execPath,
    [join(ROOT, 'scripts/factory-runner/director-start.mjs'), '--interval-ms', '700', '--node-id', label, '--lease-seconds', '5'],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FACTORY_RUNNER_PG_URL: pg.runnerUrl } });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  return { child, log: () => out };
};
const stateOf = async (id) => withClient(async (c) => {
  const { rows } = await c.query(
    'select director_state, next_action, last_evidence, retry_count, director_node_id '
    + 'from factory.work_orders where work_order_id = $1', [id]);
  return rows[0] || null;
});
const waitFor = async (id, pred, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await stateOf(id);
    if (s && pred(s)) return s;
    await sleep(250);
  }
  return await stateOf(id);
};

try {
  // The schema is applied by the SUPERUSER once, then the least-privilege runner role is granted what it
  // needs — the same shape acceptance.mjs uses, and the same one the shared control plane will.
  const { default: pgLib } = await import("pg");
  const admin = new pgLib.Client({ connectionString: pg.superUrl });
  await admin.connect();
  for (const f of ['001_factory_control_plane.sql', '002_director_state_machine.sql', '003_resource_governance.sql']) {
    await admin.query(readFileSync(join(ROOT, 'supabase/control-plane', f), 'utf8'));
  }
  await admin.query('grant usage on schema factory to ' + pg.runnerRole);
  await admin.query('grant select, insert, update, delete on all tables in schema factory to ' + pg.runnerRole);
  await admin.end();
  check('the control plane and the director state machine apply cleanly', true);

  const id = randomUUID();
  await withClient((c) => c.query(
    'insert into factory.work_orders (work_order_id, title, handler, handoff, director_state) '
    + 'values ($1, $2, $3, $4, $5)',
    [id, 'FOUNDER_POKE_NOT_REQUIRED acceptance', 'acceptance_echo', work, 'queued']));

  const seeded = await stateOf(id);
  check('the work order starts QUEUED and nothing has run', seeded.director_state === 'queued',
    JSON.stringify(seeded));

  // ── THE INTERACTIVE SESSION STOPS PARTICIPATING HERE ────────────────────────────────────────────────
  director = startDirector('director-acceptance-1');
  check('the director is a SEPARATE OS PROCESS', Number.isInteger(director.child.pid)
    && director.child.pid !== process.pid, 'director pid ' + director.child.pid + ', harness pid ' + process.pid);

  // From this line until the assertions, this harness does nothing but read.
  const advanced = await waitFor(id, (s) => s.director_state === 'waiting_for_agent', 15000);
  check('the director dispatched a worker with NO input from this process',
    advanced.director_state === 'waiting_for_agent',
    JSON.stringify(advanced) + ' | director log: ' + director.log().slice(-400));

  const completed = await waitFor(id, (s) => s.director_state === 'completed', 60000);
  check('FOUNDER_POKE_NOT_REQUIRED: the work order reached COMPLETED across worker boundaries, with no'
    + ' founder or chat input at any point',
    completed.director_state === 'completed',
    JSON.stringify(completed) + ' | director log: ' + director.log().slice(-600));

  const artifacts = existsSync(join(work, 'acceptance-echo', id))
    ? readdirSync(join(work, 'acceptance-echo', id)).filter((f) => f.startsWith('round-')) : [];
  check('at least TWO real worker boundaries were crossed, each leaving a durable artifact',
    artifacts.length >= 2, JSON.stringify(artifacts));

  check('the artifacts were written by processes that are NOT the director and NOT this harness',
    artifacts.every((f) => {
      const a = JSON.parse(readFileSync(join(work, 'acceptance-echo', id, f), 'utf8'));
      return a.pid !== process.pid && a.pid !== director.child.pid;
    }), 'pids: ' + artifacts.map((f) =>
      JSON.parse(readFileSync(join(work, 'acceptance-echo', id, f), 'utf8')).pid).join(', '));

  // ── SURVIVAL: kill the director, restart it, and require no duplicate and no lost evidence ─────────
  const beforeKill = await stateOf(id);
  try { process.kill(director.child.pid); } catch { /* it may already be gone */ }
  await sleep(1200);

  const id2 = randomUUID();
  await withClient((c) => c.query(
    'insert into factory.work_orders (work_order_id, title, handler, handoff, director_state) '
    + 'values ($1, $2, $3, $4, $5)',
    [id2, 'FOUNDER_POKE_NOT_REQUIRED restart case', 'acceptance_echo', work, 'queued']));
  const stillQueued = await waitFor(id2, () => false, 2500);
  check('with the director DEAD, new work does not advance — so the loop is what moves it, not this test',
    stillQueued.director_state === 'queued', JSON.stringify(stillQueued));

  // THE LEASE MUST EXPIRE FIRST, and that is the protection working rather than a delay to tune away:
  // director-1 was KILLED, so it never released. A successor that ignored the lease would be a second
  // director dispatching against the same work. The acceptance runs a 5-second lease so this is provable
  // in a test; production length is a deployment choice.
  await sleep(6000);
  director = startDirector('director-acceptance-2');
  const restarted = await waitFor(id2, (s) => s.director_state === 'completed', 60000);
  check('a RESTARTED director reconstructs state from the database and finishes the new work order',
    restarted.director_state === 'completed', JSON.stringify(restarted));

  const afterRestart = await stateOf(id);
  check('the completed work order was NOT re-run by the restarted director',
    afterRestart.director_state === 'completed'
    && afterRestart.last_evidence === beforeKill.last_evidence,
    'before: ' + JSON.stringify(beforeKill.last_evidence) + ' after: ' + JSON.stringify(afterRestart.last_evidence));

  const rounds = readdirSync(join(work, 'acceptance-echo', id)).filter((f) => f.startsWith('round-'));
  check('no DUPLICATE worker ran for an already-finished round', rounds.length === 2,
    JSON.stringify(rounds) + ' — a director that re-dispatches after a restart puts two agents on one surface');

  // ── The founder is contacted only at a real boundary, and never to ask whether to continue ─────────
  const notes = await withClient(async (c) => {
    const { rows } = await c.query('select * from factory.founder_notifications');
    return rows;
  });
  check('no founder notification was raised for work that was never blocked', notes.length === 0,
    JSON.stringify(notes.map((n) => n.why_blocked)));
} finally {
  if (director) { try { process.kill(director.child.pid); } catch { /* already gone */ } }
  await pg.stop();
  rmSync(work, { recursive: true, force: true });
}

console.log('');
console.log('founder_poke_not_required: ' + pass + ' passed, ' + failures.length + ' failed');
console.log('');
console.log('PROVED: the director is a separate OS process; work finishing outside it is noticed; the next');
console.log('run is dispatched with no input; killing and restarting it reconstructs state without');
console.log('duplicating a dispatch or losing a landed artifact.');
console.log('NOT PROVED HERE: machine-level independence of the DATABASE. embedded-postgres is bound to');
console.log('this harness process. With FACTORY_RUNNER_PG_URL pointing at a real server — the founder-');
console.log('blocked item — the same acceptance runs unchanged and that last dependency is gone.');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }

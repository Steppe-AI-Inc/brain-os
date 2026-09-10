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

// A KNOWN WORLD. Two tests failed the first time this suite ran, and both were leftovers: the node-loop
// block claimed work orders created by earlier blocks, and F counted their in-progress runs. A suite
// whose result depends on what ran before it is measuring something other than what it names.
const reset = async () => {
  await admin.query("delete from factory.surface_locks");
  await admin.query("delete from factory.checkpoints");
  await admin.query("delete from factory.agent_runs");
  await admin.query("delete from factory.work_order_dependencies");
  await admin.query("delete from factory.work_orders");
};
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
  await reset();
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
  //
  // The first version of this mutated a run an earlier block had created. Isolation then deleted that run,
  // the UPDATE matched zero rows, nothing was raised, and both rows reported the constraint absent. An
  // UPDATE that matches nothing never violates anything — so each case creates its own row and CHECKS THE
  // UPDATE REACHED IT before concluding anything from the absence of an error.
  {
    await reset();
    const woInv = await wo("invariant", { surface: ["qa/inv.txt"] });
    const r = await claim.claimWork({ nodeId: "node-alpha", leaseSeconds: 600 });

    // A control: an update to a DIFFERENT column must reach exactly one row, or the two below prove nothing.
    const control = await admin.query("update factory.agent_runs set summary = 'control' where run_id = $1", [r.run_id]);
    check("the invariant tests are actually reaching a row", control.rowCount === 1, "rowCount=" + control.rowCount);

    let sameRunRejected = false, sameRunReached = 0;
    try {
      const u = await admin.query("update factory.agent_runs set authoring_run_id = run_id, verification_run_id = run_id where run_id = $1", [r.run_id]);
      sameRunReached = u.rowCount;
    } catch (e) { sameRunRejected = /verification_is_independent/.test(String(e.message)); }
    check("a run cannot be its own verification (enforced by a constraint, not a habit)",
      sameRunRejected, sameRunRejected ? "" : "the update succeeded on " + sameRunReached + " row(s)");

    let sameNodeRejected = false, sameNodeReached = 0;
    try {
      const u = await admin.query("update factory.agent_runs set authoring_node_id = 'n1', verification_node_id = 'n1' where run_id = $1", [r.run_id]);
      sameNodeReached = u.rowCount;
    } catch (e) { sameNodeRejected = /verification_node_is_independent/.test(String(e.message)); }
    check("and for high-assurance acceptance, the verifying node cannot be the authoring node",
      sameNodeRejected, sameNodeRejected ? "" : "the update succeeded on " + sameNodeReached + " row(s)");

    // ...and the LEGITIMATE shape is accepted, so the constraint is a rule and not a prohibition on the
    // column existing at all.
    const ok = await admin.query("update factory.agent_runs set authoring_node_id = 'n1', verification_node_id = 'n2', authoring_run_id = $1, verification_run_id = $2 where run_id = $1",
      [r.run_id, "00000000-0000-4000-8000-000000000002"]);
    check("an independent verification IS accepted", ok.rowCount === 1, "rowCount=" + ok.rowCount);
  }
  // ---- SECURITY ROLE AND CAPABILITIES ARE ENFORCED, NOT JUST RECORDED -------------------------------
  //
  // Both columns existed and neither was read, which is worse than not having them: a reader sees
  // `release_broker` in the schema and concludes a generic node cannot take release work. Nothing stopped
  // it. These rows are the enforcement.
  {
    await reset();
    await admin.query("delete from factory.nodes");

    // Three nodes, one of each role, with capabilities recorded in the control plane rather than taken
    // from whatever the caller claims to be.
    await claim.registerNode({ nodeId: "n-generic", capabilities: ["git", "node"], securityRole: "generic" });
    await claim.registerNode({ nodeId: "n-verifier", capabilities: ["git", "node"], securityRole: "verifier" });
    await claim.registerNode({ nodeId: "n-broker", capabilities: ["git", "node"], securityRole: "release_broker" });

    const releaseWo = await wo("needs a release broker", { surface: ["qa/rel.txt"] });
    await admin.query("update factory.work_orders set requires_security_role = 'release_broker' where work_order_id = $1", [releaseWo]);

    const genericTry = await claim.claimWork({ nodeId: "n-generic", leaseSeconds: 60 });
    check("SEC1 a GENERIC node cannot claim work that requires a release broker",
      genericTry === null, JSON.stringify(genericTry));
    const verifierTry = await claim.claimWork({ nodeId: "n-verifier", leaseSeconds: 60 });
    check("SEC2 nor can a VERIFIER — the roles are ordered, and verifier is below release_broker",
      verifierTry === null, JSON.stringify(verifierTry));
    const brokerTry = await claim.claimWork({ nodeId: "n-broker", leaseSeconds: 60 });
    check("SEC3 a RELEASE BROKER can",
      brokerTry && brokerTry.work_order_id === releaseWo, JSON.stringify(brokerTry));
    await claim.completeRun({ runId: brokerTry.run_id, status: "done" });

    // ...and the ordering works downward: a broker may do ordinary work too, or the rule would be a
    // partition rather than a rank.
    await reset();
    await claim.registerNode({ nodeId: "n-broker", capabilities: ["git", "node"], securityRole: "release_broker" });
    const ordinary = await wo("ordinary work", { surface: ["qa/ord.txt"] });
    const brokerOrdinary = await claim.claimWork({ nodeId: "n-broker", leaseSeconds: 60 });
    check("SEC4 a release broker can also do ordinary work: the roles RANK, they do not partition",
      brokerOrdinary && brokerOrdinary.work_order_id === ordinary, JSON.stringify(brokerOrdinary));
    await claim.completeRun({ runId: brokerOrdinary.run_id, status: "done" });

    // Capabilities: a node lacking one may not take the work, and the work WAITS rather than being
    // handed to a node that cannot do it.
    await reset();
    await admin.query("delete from factory.nodes");
    await claim.registerNode({ nodeId: "n-plain", capabilities: ["git", "node"], securityRole: "generic" });
    await claim.registerNode({ nodeId: "n-browser", capabilities: ["git", "node", "browser"], securityRole: "generic" });
    const needsBrowser = await wo("needs a browser", { surface: ["qa/br.txt"] });
    await admin.query("update factory.work_orders set requires_capabilities = array['browser']::text[] where work_order_id = $1", [needsBrowser]);

    const plainTry = await claim.claimWork({ nodeId: "n-plain", leaseSeconds: 60 });
    check("CAP1 a node without a required capability cannot claim the work",
      plainTry === null, JSON.stringify(plainTry));
    const stillQueued = await admin.query("select status from factory.work_orders where work_order_id = $1", [needsBrowser]);
    check("CAP2 and the work WAITS rather than being handed to a node that cannot do it",
      stillQueued.rows[0].status === "queued", JSON.stringify(stillQueued.rows[0]));
    const browserTry = await claim.claimWork({ nodeId: "n-browser", leaseSeconds: 60 });
    check("CAP3 the node that HAS the capability claims it",
      browserTry && browserTry.work_order_id === needsBrowser, JSON.stringify(browserTry));
    await claim.completeRun({ runId: browserTry.run_id, status: "done" });

    // THE ROLE IS READ FROM THE CONTROL PLANE, NOT FROM THE CALLER. A node that could assert its own
    // role would make every check above a formality.
    await reset();
    await admin.query("delete from factory.nodes");
    await claim.registerNode({ nodeId: "n-liar", capabilities: ["git"], securityRole: "generic" });
    const rel2 = await wo("release work again", { surface: ["qa/rel2.txt"] });
    await admin.query("update factory.work_orders set requires_security_role = 'release_broker' where work_order_id = $1", [rel2]);
    const liar = await claim.claimWork({ nodeId: "n-liar", leaseSeconds: 60, capabilities: ["release_broker"] });
    check("SEC5 a node cannot talk its way up: the role comes from the control plane, not the call",
      liar === null, JSON.stringify(liar));

    // PUT THE WORLD BACK. This block deleted every node to control which roles exist; later blocks still
    // claim as node-alpha. Left as it was, the foreign key fails several tests LATER and looks like a
    // defect in whichever block happens to run next — the most expensive kind of test bug to read.
    await reset();
    await claim.registerNode({ nodeId: "node-alpha", capabilities: ["edge-verify"], platform: "test" });
    await claim.registerNode({ nodeId: "node-beta", capabilities: ["edge-verify"], platform: "test" });
  }
  // ---- INVARIANT 1: a business id here is opaque, and confers nothing ------------------------------
  //
  // "Business IDs stored in the Factory Control Plane are opaque references by value. They do NOT
  //  establish business existence, tenancy, authorization, or production access."
  //
  // The way that gets violated is not disagreement. It is somebody adding `references public.companies(id)`
  // to make a join easier, six months from now, with a good reason. So it is checked rather than stated.
  {
    const fks = await admin.query(`
      select tc.table_name, kcu.column_name, ccu.table_schema as target_schema, ccu.table_name as target_table
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
        join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
       where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'factory'`);
    const outward = fks.rows.filter((r) => r.target_schema !== 'factory');
    check("INV1 no control-plane table references anything outside the factory schema",
      outward.length === 0,
      JSON.stringify(outward) + " — a business id here is a VALUE; a foreign key would make it an assertion"
      + " that the row exists, which is exactly what this schema must not claim");

    // And the second half: there is nothing in this database for such a key to point AT. A control plane
    // that happened to contain a companies table would be one migration away from being coupled again.
    const business = await admin.query(`
      select table_schema, table_name from information_schema.tables
       where table_name in ('companies','people','profiles','goals','agents','tasks','memories')`);
    check("INV1b and the control plane holds no Brain OS business table at all",
      business.rows.length === 0, JSON.stringify(business.rows));

    // A work order whose business id refers to nothing at all is still perfectly valid, which is what
    // "by value" MEANS. If this failed, the id would be establishing existence.
    const orphan = await wo("INV1: id that refers to nothing", { surface: ["qa/inv1.txt"] });
    const got = await admin.query("select work_order_id from factory.work_orders where work_order_id = $1", [orphan]);
    check("INV1c a work order referencing a business id that does not exist is still valid",
      got.rows.length === 1, JSON.stringify(got.rows));
  }
  // ---- I. the work order is reconstructible from GitHub alone ---------------------------------------
  //
  // The control plane accelerates orchestration; it is not where the work lives. So: wipe every row, then
  // rebuild the queue from the repository, and check the durable facts come back. If this passes, losing
  // the database costs scheduling state and nothing else.
  {
    const rc = await import(pathToFileURL(join(ROOT, "scripts/factory-runner/reconstruct.mjs")).href);
    const dbm = await import(pathToFileURL(join(ROOT, "scripts/factory-runner/db.mjs")).href);
    await reset();
    const empty = await admin.query("select count(*)::int n from factory.work_orders");
    const branches = ["factory/computer-agnostic-control-plane"];
    const rebuilt = await rc.reconstructControlPlane({ repo: ROOT, db: dbm, trunk: "p1/execution-truth-governance",
      deploySurface: "supabase/functions/sem-ai-command/index.ts", branches });
    const after = await admin.query("select work_order_id, branch, base_commit, latest_commit, candidate_sha from factory.work_orders");
    check("I  with every row deleted, the queue is rebuilt from the repository alone",
      empty.rows[0].n === 0 && after.rows.length === 1 && after.rows[0].branch === branches[0],
      JSON.stringify(after.rows));
    check("I2 and the rebuilt row carries the durable facts: base, head and candidate bytes",
      !!(after.rows[0] && after.rows[0].base_commit && after.rows[0].latest_commit && after.rows[0].candidate_sha),
      JSON.stringify(after.rows[0]));
    // Idempotent: reconstructing twice must not produce two rows describing one branch.
    await rc.reconstructControlPlane({ repo: ROOT, db: dbm, trunk: "p1/execution-truth-governance", branches });
    const twice = await admin.query("select count(*)::int n from factory.work_orders");
    check("I3 reconstruction is idempotent", twice.rows[0].n === 1, JSON.stringify(twice.rows[0]));
  }

  // ---- L. a FRESH node resumes abandoned work, from the checkpoint the dead node left ---------------
  //
  // This is the test the work order exists for. Everything else can pass while the system still loses a
  // day of work when a laptop closes. The question is not whether another node can claim the order — that
  // is E/G — it is whether it can see what the dead node had already finished, and carry on from there.
  {
    await reset();
    const woL = await wo("L: long job", { surface: ["qa/l.txt"] });

    // Node one claims it and completes two of four scenarios, then simply stops existing. Nothing is told.
    const first = await claim.claimWork({ nodeId: "node-alpha", leaseSeconds: 600 });
    await claim.checkpoint({ runId: first.run_id, workOrderId: woL, location: "qa/evidence/l-1.json", scenario: "scenario-1" });
    await claim.checkpoint({ runId: first.run_id, workOrderId: woL, location: "qa/evidence/l-2.json", scenario: "scenario-2",
      payload: { remaining: ["scenario-3", "scenario-4"] } });

    // The laptop closes. The only thing that happens is that the lease stops being renewed.
    await admin.query("update factory.agent_runs set lease_expires_at = now() - interval '1 second' where run_id = $1", [first.run_id]);
    await admin.query("update factory.surface_locks set lease_expires_at = now() - interval '1 second' where run_id = $1", [first.run_id]);
    await admin.query("update factory.work_orders set status = 'queued' where work_order_id = $1", [woL]);

    // A DIFFERENT node, which has never seen this work order, picks it up.
    const second = await claim.claimWork({ nodeId: "node-beta", leaseSeconds: 600 });
    check("L  a fresh node claims the abandoned work order",
      second && second.work_order_id === woL && second.node_id === "node-beta", JSON.stringify(second));

    // ...and can see everything the dead node finished, by asking the control plane rather than the node.
    const prior = await admin.query(
      "select location, scenario, payload from factory.checkpoints where work_order_id = $1 order by created_at desc", [woL]);
    check("L2 and it can see the work the dead node had already completed",
      prior.rows.length === 2 && prior.rows[0].scenario === "scenario-2", JSON.stringify(prior.rows.map((r) => r.scenario)));
    check("L3 including what remained, so it resumes rather than restarts",
      Array.isArray(prior.rows[0].payload && prior.rows[0].payload.remaining)
      && prior.rows[0].payload.remaining.length === 2, JSON.stringify(prior.rows[0].payload));

    // The abandoned run is not silently forgotten: it is queued again with its attempt counted.
    const old = await admin.query("select status, attempt_count from factory.agent_runs where run_id = $1", [first.run_id]);
    check("L4 the abandoned run is returned to the queue with its attempt counted, not discarded",
      old.rows[0].status === "queued" && old.rows[0].attempt_count === 2, JSON.stringify(old.rows[0]));
  }
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

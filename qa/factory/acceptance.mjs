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
// THIS PC'S LOAD IS NOT UNDER TEST HERE: with the admission gate on, a busy machine turned claims into nulls and the suite red,
// then crashed on the null (final verification 2026-09-24). No row here tests admission (shared_control_plane_acceptance does).
process.env.FACTORY_ADMISSION = 'off';

const { default: pgLib } = await import('pg');
const admin = new pgLib.Client({ connectionString: pg.superUrl });
await admin.connect();
await admin.query(readFileSync(join(ROOT, 'supabase/control-plane/001_factory_control_plane.sql'), 'utf8'));
await admin.query(readFileSync(join(ROOT, 'supabase/control-plane/003_resource_governance.sql'), 'utf8'));
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
  // ...and it keeps the node that ran it: the plane used to erase it, so an overlap on a surface could not be seen afterwards
  const keptNode = (await admin.query('select node_id from factory.agent_runs where run_id = $1', [runA.run_id])).rows[0].node_id;
  check('G3 the abandoned run keeps the node that ran it (' + keptNode + ')', keptNode === 'node-alpha', String(keptNode));

  // ---- the heartbeat is what holds a claim ----------------------------------------------------------
  const beat = await claim.heartbeat({ runId: recovered.run_id, nodeId: 'node-beta', leaseSeconds: 60 });
  const wrongNode = await claim.heartbeat({ runId: recovered.run_id, nodeId: 'node-alpha', leaseSeconds: 60 });
  check('the owning node can renew its lease', beat === true);
  check('a node that does NOT own the run cannot renew it', wrongNode === false);

  // ---- M. PER-RUN ACCOUNTING, THROUGH THE APPLICATION AND NOT BY DIRECT INSERT ----------------------
  //
  // qa/factory/no_silent_model_fallback.mjs proves the CONSTRAINTS refuse a silent substitution, and its
  // row C3 states the boundary those constraints cannot close: with `requested_*` null, any `actual_*` is
  // accepted, because a substitution is only definable against something requested. Closing it is
  // APPLICATION work, and these rows are that work measured rather than asserted.
  //
  // The reason this matters concretely: the field whose absence made the 2026-08-24 forensics
  // reconstructive was `requested_model`. A failed turn recorded no model name anywhere, so "which model
  // was being tried" had to be inferred from model_usage boundaries and row-creation times. Written at
  // CLAIM time — before the call — it survives the failure that loses everything else.
  {
    const woM = randomUUID();
    await admin.query("insert into factory.work_orders (work_order_id, title) values ($1, 'accounting')", [woM]);
    const runM = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60,
      requestedProvider: 'anthropic', requestedModel: 'claude-opus-5', reasoningEffort: 'high' });
    const rowM = await admin.query(
      'select requested_provider, requested_model, reasoning_effort, termination_reason from factory.agent_runs where run_id = $1',
      [runM.run_id]);
    check('M1 claimWork records the REQUESTED provider, model and effort at claim time — before the call',
      rowM.rows[0].requested_provider === 'anthropic' && rowM.rows[0].requested_model === 'claude-opus-5'
      && rowM.rows[0].reasoning_effort === 'high', JSON.stringify(rowM.rows[0]));

    // A TERMINAL STATUS MUST STATE ITS REASON, refused in the application with a sentence rather than
    // left to surface as a bare 23514 from the database.
    let noReason = null;
    try { await claim.completeRun({ runId: runM.run_id, status: 'done' }); }
    catch (e) { noReason = String(e && e.message || e); }
    check('M2 completeRun REFUSES a done/failed status with no terminationReason — HTTP SUCCESS IS NOT A'
      + ' VALID COMPLETED RUN', noReason !== null && /terminationReason is required/.test(noReason),
      String(noReason).slice(0, 160));

    // A SUBSTITUTION NEEDS A STATED REASON, and the application says which two models it is between.
    let silent = null;
    try {
      await claim.completeRun({ runId: runM.run_id, status: 'done', terminationReason: 'completed',
        actualProvider: 'anthropic', actualModel: 'claude-haiku-4-5' });
    } catch (e) { silent = String(e && e.message || e); }
    check('M3 completeRun REFUSES a model substitution with no fallbackReason, and names both models',
      silent !== null && /NO SILENT MODEL FALLBACK/.test(silent)
      && /claude-haiku-4-5/.test(silent) && /claude-opus-5/.test(silent), String(silent).slice(0, 200));

    // ...and the stated substitution is recorded in full, with the accounting the founder requires.
    await claim.completeRun({ runId: runM.run_id, status: 'done', terminationReason: 'completed',
      actualProvider: 'anthropic', actualModel: 'claude-haiku-4-5',
      fallbackReason: 'opus capacity exhausted; rotated by the watchdog',
      usage: { inputTokens: 1200, cachedTokens: 900, outputTokens: 340, estimatedCostUsd: 0.0042 } });
    const doneM = await admin.query(
      'select actual_model, fallback_reason, termination_reason, input_tokens, cached_tokens, output_tokens,'
      + ' estimated_cost_usd from factory.agent_runs where run_id = $1', [runM.run_id]);
    const m = doneM.rows[0];
    check('M4 a STATED substitution is recorded with its reason, its terminal condition and its token and'
      + ' cost accounting',
      m.actual_model === 'claude-haiku-4-5' && /capacity exhausted/.test(m.fallback_reason)
      && m.termination_reason === 'completed' && Number(m.input_tokens) === 1200
      && Number(m.cached_tokens) === 900 && Number(m.output_tokens) === 340
      && Number(m.estimated_cost_usd) === 0.0042, JSON.stringify(m));

    // THE NEGATIVE CONTROL FOR M3: served by what was requested, so there is nothing to explain.
    const woN = randomUUID();
    await admin.query("insert into factory.work_orders (work_order_id, title) values ($1, 'as requested')", [woN]);
    const runN = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60,
      requestedProvider: 'anthropic', requestedModel: 'claude-opus-5' });
    let asRequested = null;
    try {
      await claim.completeRun({ runId: runN.run_id, status: 'done', terminationReason: 'completed',
        actualProvider: 'anthropic', actualModel: 'claude-opus-5' });
    } catch (e) { asRequested = String(e && e.message || e); }
    check('M5 NEGATIVE CONTROL: a run served by the model it requested needs no fallbackReason — M3 is refusing the substitution and not merely refusing to write actual_*', asRequested === null,
      String(asRequested).slice(0, 160));
  }
  // ---- N. THE RELEASE GATE IS NOT SERVED BY AN UNPROVEN MODEL --------------------------------------
  //
  // model-assurance.mjs derived a model's standing from run evidence and nothing consulted it. A policy no
  // code enforces is the same shape as a constraint on a table nobody runs on, and as a product patch with
  // no measured effect. It is wired into the claim path now, and these rows are the proof that it refuses —
  // without them the wiring would be a guard whose necessity nothing demonstrates, which is the V91-H4
  // class this campaign named a day ago.
  {
    const woV = randomUUID();
    // PRIORITY HIGH, because earlier rows leave ordinary work queued and the claim orders by priority then
    // age: without it these rows claim whatever is oldest and assert nothing about the gate.
    await admin.query("insert into factory.work_orders (work_order_id, title, requires_security_role, priority)"
      + " values ($1, 'a verifier round', 'verifier', 'high')", [woV]);
    await admin.query("update factory.nodes set security_role = 'verifier' where node_id = 'node-alpha'");

    // UNPROVEN: the model has no run history at all. Configured is not proven.
    const declined = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60,
      requestedProvider: 'anthropic', requestedModel: 'claude-never-run-5' });
    check('N1 a verifier-role work order is DECLINED by a node whose model has no run evidence — the work'
      + ' order waits rather than being served by a model that has never finished a run',
      declined === null || declined.work_order_id !== woV, JSON.stringify(declined));

    // PROVEN: two recent completions, which is the standing the policy requires.
    const proven = 'claude-proven-5';
    for (let i = 0; i < 2; i++) {
      const woFill = randomUUID();
      await admin.query("insert into factory.work_orders (work_order_id, title) values ($1, 'history')", [woFill]);
      await admin.query("insert into factory.agent_runs (work_order_id, requested_model, actual_model,"
        + " status, termination_reason, finished_at) values ($1, $2, $2, 'done', 'completed', now())",
      [woFill, proven]);
    }
    const allowed = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60,
      requestedProvider: 'anthropic', requestedModel: proven });
    check('N2 ...and the SAME work order IS claimed once the model has two recent completions — the policy'
      + ' gates on evidence, it does not refuse everything',
      allowed !== null && allowed.work_order_id === woV, JSON.stringify(allowed));

    // AND CHEAP WORK IS NOT GATED, which is the entire point of having tiers.
    const woG = randomUUID();
    await admin.query("insert into factory.work_orders (work_order_id, title, priority) values ($1, 'ordinary work', 'high')", [woG]);
    const cheap = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60,
      requestedProvider: 'anthropic', requestedModel: 'claude-never-run-5' });
    check('N3 a work order with no elevated role requirement is claimed by the unproven model — a policy'
      + ' that refuses everything saves nothing',
      cheap !== null && cheap.work_order_id === woG, JSON.stringify(cheap));

    // ABLATION: with the assurance check removed from the claim path, N1 stops refusing. Measured by
    // reading the source and asserting the check is THERE and reachable — a behavioural ablation would need
    // a second copy of the module, and the honest statement here is narrower: the guard exists, is called
    // with the claimed role, and N1/N2 move in opposite directions across it.
    const claimSrc = readFileSync(join(ROOT, 'scripts/factory-runner/claim.mjs'), 'utf8');
    check('N4 the claim path actually calls the assurance policy, with the work order\'s own role',
      /mayServe\(/.test(claimSrc) && /requires_security_role === 'verifier'/.test(claimSrc)
      && /deriveAssurance\(/.test(claimSrc),
      'the rows above would pass against a build that never consults the policy if this is red');
  }
  // ---- J. already-completed evidence is reused ------------------------------------------------------
  // terminationReason is REQUIRED for a terminal status now, and completeRun throws without it: a run that
  // claims it finished must say HOW. See agent_runs_terminal_status_states_its_reason.
  await claim.completeRun({ runId: recovered.run_id, status: 'done', summary: 'finished', headCommit: 'abc123',
    terminationReason: 'completed' });
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
    await claim.completeRun({ runId: brokerTry.run_id, status: "done", terminationReason: "completed" });

    // ...and the ordering works downward: a broker may do ordinary work too, or the rule would be a
    // partition rather than a rank.
    await reset();
    await claim.registerNode({ nodeId: "n-broker", capabilities: ["git", "node"], securityRole: "release_broker" });
    const ordinary = await wo("ordinary work", { surface: ["qa/ord.txt"] });
    const brokerOrdinary = await claim.claimWork({ nodeId: "n-broker", leaseSeconds: 60 });
    check("SEC4 a release broker can also do ordinary work: the roles RANK, they do not partition",
      brokerOrdinary && brokerOrdinary.work_order_id === ordinary, JSON.stringify(brokerOrdinary));
    await claim.completeRun({ runId: brokerOrdinary.run_id, status: "done", terminationReason: "completed" });

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
    await claim.completeRun({ runId: browserTry.run_id, status: "done", terminationReason: "completed" });

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
  // ---- M. a run whose lease was TAKEN OVER cannot complete the work order --------------------------------
  // completeRun matched the run by id alone: a node that lost its lease finished anyway and set the work order done while the
  // new owner's run still held it, releasing its dependents early - two "done" runs for one work order (independent
  // verification 2026-09-24, round 3). The completion and the checkpoint are fenced on the run's own live ownership.
  {
    await reset();
    const woM = await wo('M: taken over', { surface: ['qa/m.txt'] });
    const woDep = await wo('M: depends on it', { surface: ['qa/m-dep.txt'] });
    await admin.query('insert into factory.work_order_dependencies (work_order_id, depends_on) values ($1, $2)', [woDep, woM]);
    const runOld = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60 });
    await admin.query("update factory.agent_runs set lease_expires_at = now() - interval '1 second' where run_id = $1", [runOld.run_id]);
    await admin.query("update factory.surface_locks set lease_expires_at = now() - interval '1 second' where run_id = $1", [runOld.run_id]);
    const runNew = await claim.claimWork({ nodeId: 'node-beta', leaseSeconds: 60 });
    let cpRefused = false;
    try { await claim.checkpoint({ runId: runOld.run_id, workOrderId: woM, location: 'qa/m.txt', nodeId: 'node-alpha' }); } catch (e) { cpRefused = e.name === 'LeaseLost'; }
    const late = await claim.completeRun({ runId: runOld.run_id, nodeId: 'node-alpha', status: 'done', terminationReason: 'completed' });
    const afterLate = (await admin.query('select status from factory.work_orders where work_order_id = $1', [woM])).rows[0].status;
    const depEarly = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60 });
    const own = await claim.completeRun({ runId: runNew.run_id, nodeId: 'node-beta', status: 'done', terminationReason: 'completed' });
    const afterOwn = (await admin.query('select status from factory.work_orders where work_order_id = $1', [woM])).rows[0].status;
    const doneRuns = (await admin.query("select count(*)::int n from factory.agent_runs where work_order_id = $1 and status = 'done'", [woM])).rows[0].n;
    check('M  a run whose lease was taken over cannot complete the work order: its checkpoint (LeaseLost) and completion (superseded) are refused, the work order stays with the live run, the dependent stays blocked, and only the live run completes it (' + doneRuns + ' done run)',
      runNew && runNew.work_order_id === woM && cpRefused && late && late.superseded === true && afterLate !== 'done' && !depEarly && own && own.superseded === false && afterOwn === 'done' && doneRuns === 1,
      JSON.stringify({ taken: runNew && runNew.work_order_id === woM, cpRefused, late, afterLate, depEarly: depEarly && depEarly.work_order_id, own, afterOwn, doneRuns }));
  }

  // ---- N. a claimer that died inside the claim transaction cannot block the plane --------------------------
  // A node that lost its connection inside the claim held the plane-wide claim lock until the server noticed the dead
  // session, and every other node's claims waited behind it (verification round 3). The claim now opens its transaction
  // with a lock timeout and an idle-transaction limit; the stuck claimer here opens its transaction EXACTLY the same way.
  {
    await reset();
    const woN = await wo('N: behind a dead claimer', { surface: ['qa/n.txt'] });
    const saved = { l: process.env.FACTORY_PG_LOCK_TIMEOUT_MS, i: process.env.FACTORY_PG_IDLE_TX_TIMEOUT_MS };
    process.env.FACTORY_PG_LOCK_TIMEOUT_MS = '1500'; process.env.FACTORY_PG_IDLE_TX_TIMEOUT_MS = '4000';
    const stuck = new pgLib.Client({ connectionString: pg.runnerUrl }); stuck.on('error', () => { /* ended by the server - the point */ });
    await stuck.connect();
    await stuck.query(claim.claimSessionSql());
    await stuck.query("select pg_advisory_xact_lock(hashtext('factory.claim'))");
    claim.claimWork.lastBusy = null;
    const t0 = Date.now();
    const first = await claim.claimWork({ nodeId: 'node-beta', leaseSeconds: 60 });
    const firstMs = Date.now() - t0;
    const busy = !!claim.claimWork.lastBusy;
    let got = null; const t1 = Date.now();
    while (!got && Date.now() - t1 < 20000) { await new Promise((r) => setTimeout(r, 500)); got = await claim.claimWork({ nodeId: 'node-beta', leaseSeconds: 60 }); }
    const gotMs = Date.now() - t1;
    const stillIdle = (await admin.query("select count(*)::int n from pg_stat_activity where usename = $1 and state like 'idle in transaction%'", [pg.runnerRole])).rows[0].n;
    try { await stuck.end(); } catch { /* already ended */ }
    for (const [k, v] of [['FACTORY_PG_LOCK_TIMEOUT_MS', saved.l], ['FACTORY_PG_IDLE_TX_TIMEOUT_MS', saved.i]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    check('N  a claimer that died holding the claim lock cannot block the plane: another claim gives up within the lock timeout (' + firstMs + ' ms, busy ' + busy + '), the server ends the idle transaction (' + stillIdle + ' left), and the work order is claimed ' + gotMs + ' ms later',
      first === null && firstMs < 6000 && busy && got && got.work_order_id === woN && stillIdle === 0,
      JSON.stringify({ first, firstMs, busy, got: got && got.work_order_id, stillIdle }));
  }

  // ---- O. a plane connection that stalls fails within its timeout, never hangs ------------------------------
  // With no timeouts a connection that stopped forwarding without closing left the worker waiting forever while everything
  // read "running" (verification round 3). A relay here forwards to the plane and then freezes: data is held, the socket
  // stays open. The connect and the statement must fail within their timeouts (then the worker exits and is restarted).
  {
    const net = await import('node:net');
    let frozen = false; const pairs = [];
    const relay = net.createServer((c) => {
      const u = net.connect(pg.port, '127.0.0.1');
      pairs.push([c, u]); c.on('error', () => {}); u.on('error', () => {});
      c.on('data', (d) => { if (!frozen) u.write(d); }); u.on('data', (d) => { if (!frozen) c.write(d); });
    });
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    const relayUrl = pg.runnerUrl.replace(/@127\.0\.0\.1:\d+\//, '@127.0.0.1:' + relay.address().port + '/');
    const savedUrl = process.env.FACTORY_RUNNER_PG_URL;
    const savedT = { c: process.env.FACTORY_PG_CONNECT_TIMEOUT_MS, q: process.env.FACTORY_PG_QUERY_TIMEOUT_MS };
    process.env.FACTORY_RUNNER_PG_URL = relayUrl; process.env.FACTORY_PG_CONNECT_TIMEOUT_MS = '2000'; process.env.FACTORY_PG_QUERY_TIMEOUT_MS = '2000';
    const dbR = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href + '?relay=' + Date.now());
    // THE ROW MUST FAIL, NOT HANG: without the timeouts these operations never settle, and the first version of this row hung the
    // whole suite instead of going red (its own mutation check). Each is raced against a hard 12 s limit.
    const HARD = 12000;
    const bounded = (p) => Promise.race([p.then(() => 'settled', (e) => 'error: ' + String(e && e.message || e)), new Promise((r) => setTimeout(() => r('HUNG'), HARD))]);
    const before = await dbR.read('select 1 as ok');
    let midMs = -1, midErr = '';
    const mid = await bounded(dbR.withClient(async (c) => {
      await c.query('select 1');
      frozen = true;
      const t = Date.now();
      try { await c.query('select 2'); } catch (e) { midErr = String(e && e.message || e); }
      midMs = Date.now() - t;
    }).catch(() => { /* the client end may fail on a frozen socket */ }));
    if (mid === 'HUNG') { midErr = ''; midMs = HARD; }
    frozen = true;
    let conMs = -1, conErr = '';
    { const t = Date.now(); const r = await bounded(dbR.read('select 3').then(() => {}, (e) => { conErr = String(e && e.message || e); })); conMs = r === 'HUNG' ? HARD : Date.now() - t; }
    frozen = false;
    for (const [c, u] of pairs) { try { c.destroy(); u.destroy(); } catch { /* gone */ } }
    relay.close();
    process.env.FACTORY_RUNNER_PG_URL = savedUrl;
    for (const [k, v] of [['FACTORY_PG_CONNECT_TIMEOUT_MS', savedT.c], ['FACTORY_PG_QUERY_TIMEOUT_MS', savedT.q]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    check('O  a plane connection that stalls fails within its timeout instead of hanging: mid-statement ' + midMs + ' ms, at connect ' + conMs + ' ms (limits 2000 ms)',
      before.rows[0].ok === 1 && midErr && midMs >= 1500 && midMs < 8000 && conErr && conMs >= 1500 && conMs < 8000,
      JSON.stringify({ midMs, midErr: midErr.slice(0, 80), conMs, conErr: conErr.slice(0, 80) }));
  }

  // ---- P. a completion is all or nothing ------------------------------------------------------------------
  // The run, its surface locks and its work order were three writes on three connections: a failure after the first left the run
  // done, its locks held and its work order 'claimed' forever (the lease recovery requeues only runs in progress), so its
  // dependents never ran (verification 2026-09-24, round 4). A failure is injected on the LAST part - the work order becoming
  // done - with a trigger on this disposable plane; the whole completion must roll back, and succeed once the fault is gone.
  {
    await reset();
    const woP = await wo('P: completes atomically', { surface: ['qa/p.txt'] });
    const woPD = await wo('P: depends on it', { surface: ['qa/p-dep.txt'] });
    await admin.query('insert into factory.work_order_dependencies (work_order_id, depends_on) values ($1, $2)', [woPD, woP]);
    const runP = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60, onlyWorkOrderId: woP });
    await admin.query("create or replace function factory.qa_fail_done() returns trigger language plpgsql as $f$ begin if new.status = 'done' and new.title = 'P: completes atomically' then raise exception 'injected failure on the work order'; end if; return new; end $f$");
    await admin.query('create trigger qa_fail_done before update on factory.work_orders for each row execute function factory.qa_fail_done()');
    let failed = '';
    try { await claim.completeRun({ runId: runP.run_id, nodeId: 'node-alpha', status: 'done', terminationReason: 'completed' }); } catch (e) { failed = String(e && e.message || e); }
    const runAfterFail = (await admin.query('select status from factory.agent_runs where run_id = $1', [runP.run_id])).rows[0].status;
    const locksAfterFail = (await admin.query('select count(*)::int n from factory.surface_locks where run_id = $1', [runP.run_id])).rows[0].n;
    const woAfterFail = (await admin.query('select status from factory.work_orders where work_order_id = $1', [woP])).rows[0].status;
    await admin.query('drop trigger qa_fail_done on factory.work_orders');
    await admin.query('drop function factory.qa_fail_done()');
    const ok2 = await claim.completeRun({ runId: runP.run_id, nodeId: 'node-alpha', status: 'done', terminationReason: 'completed' });
    const runDone = (await admin.query('select status from factory.agent_runs where run_id = $1', [runP.run_id])).rows[0].status;
    const woDone = (await admin.query('select status from factory.work_orders where work_order_id = $1', [woP])).rows[0].status;
    const locksDone = (await admin.query('select count(*)::int n from factory.surface_locks where run_id = $1', [runP.run_id])).rows[0].n;
    const dep = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60 });
    check('P  a completion is all or nothing: with the work order update failing, the run stays ' + runAfterFail + ' with its lock (' + locksAfterFail + ') and the work order ' + woAfterFail + '; without the fault all three complete and the dependent is released',
      /injected failure/.test(failed) && runAfterFail === 'in_progress' && locksAfterFail === 1 && woAfterFail === 'claimed' && ok2 && ok2.superseded === false && runDone === 'done' && woDone === 'done' && locksDone === 0 && dep && dep.work_order_id === woPD,
      JSON.stringify({ failed: failed.slice(0, 80), runAfterFail, locksAfterFail, woAfterFail, ok2, runDone, woDone, locksDone, dep: dep && dep.work_order_id }));
  }

  // ---- Q. a statement stalled between its protocol messages cannot hold a lock ------------------------------
  // The idle-transaction limit starts only after ReadyForQuery. A client whose UPDATE was executed but whose Sync never arrived held
  // the row lock (and a claimer the plane-wide claim lock) for as long as the dead path lived; no timer ran on the server
  // (verification 2026-09-24, round 4). Every session now carries transaction_timeout (PostgreSQL 17+), which covers the implicit
  // transaction of a single statement. A relay parses the client's messages: it forwards the marked UPDATE through its Execute and
  // withholds the Sync. The server must end that session within the limit, freeing the row for another writer.
  {
    await reset();
    const woQ = await wo('Q: stalled writer', { surface: ['qa/q.txt'] });
    const runQ = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 300, onlyWorkOrderId: woQ });
    const net = await import('node:net');
    const conns = [];
    const relay = net.createServer((c) => {
      const u = net.connect(pg.port, '127.0.0.1'); conns.push(c, u); c.on('error', () => {}); u.on('error', () => {});
      let buf = Buffer.alloc(0), started = false, trap = false, held = false;
      c.on('data', (d) => {
        if (held) return;
        buf = Buffer.concat([buf, d]);
        const out = [];
        for (;;) {
          if (!started) { if (buf.length < 4) break; const n = buf.readInt32BE(0); if (buf.length < n) break; const m = buf.subarray(0, n); out.push(m); buf = buf.subarray(n); const code = n >= 8 ? m.readInt32BE(4) : 0; if (code !== 80877103) started = true; continue; }
          if (buf.length < 5) break;
          const t = String.fromCharCode(buf[0]); const n = buf.readInt32BE(1); if (buf.length < 1 + n) break;
          const m = buf.subarray(0, 1 + n);
          if (t === 'P' && m.toString('latin1').includes('qa-stalled-writer')) trap = true;
          if (trap && t === 'S') { held = true; break; }
          out.push(m); buf = buf.subarray(1 + n);
        }
        if (out.length) u.write(Buffer.concat(out));
      });
      u.on('data', (d) => { if (!c.destroyed) c.write(d); });
    });
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    const relayUrl = pg.runnerUrl.replace(/@127\.0\.0\.1:\d+\//, '@127.0.0.1:' + relay.address().port + '/');
    const saved = { url: process.env.FACTORY_RUNNER_PG_URL, tx: process.env.FACTORY_PG_TX_TIMEOUT_MS, q: process.env.FACTORY_PG_QUERY_TIMEOUT_MS };
    process.env.FACTORY_RUNNER_PG_URL = relayUrl; process.env.FACTORY_PG_TX_TIMEOUT_MS = '3000'; process.env.FACTORY_PG_QUERY_TIMEOUT_MS = '30000';
    const dbQ = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href + '?stalled=' + Date.now());
    const stalled = dbQ.write('update factory.agent_runs set updated_at = now() where run_id = $1 /* qa-stalled-writer */', [runQ.run_id]).then(() => 'returned', (e) => 'error: ' + String(e && e.message || e));
    await new Promise((r) => setTimeout(r, 800));
    const lockedBy = (await admin.query("select count(*)::int n from pg_stat_activity where query like '%qa-stalled-writer%' and pid <> pg_backend_pid()")).rows[0].n;
    // another writer wants the same row: it must get it within the transaction limit, not wait for the dead path
    const t0 = Date.now(); let otherErr = '';
    try { await admin.query('begin'); await admin.query("set local lock_timeout = '12s'"); await admin.query('update factory.agent_runs set updated_at = now() where run_id = $1', [runQ.run_id]); await admin.query('commit'); }
    catch (e) { otherErr = String(e && e.message || e); try { await admin.query('rollback'); } catch { /* none */ } }
    const otherMs = Date.now() - t0;
    const leftover = (await admin.query("select count(*)::int n from pg_stat_activity where query like '%qa-stalled-writer%' and pid <> pg_backend_pid()")).rows[0].n;
    for (const x of conns) { try { x.destroy(); } catch { /* gone */ } }
    relay.close();
    const stalledResult = await Promise.race([stalled, new Promise((r) => setTimeout(() => r('HUNG'), 35000))]);
    process.env.FACTORY_RUNNER_PG_URL = saved.url;
    for (const [k, v] of [['FACTORY_PG_TX_TIMEOUT_MS', saved.tx], ['FACTORY_PG_QUERY_TIMEOUT_MS', saved.q]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    check('Q  a statement stalled between its Execute and its Sync cannot hold its lock: the server ends that session (' + lockedBy + ' stalled, ' + leftover + ' left) and another writer gets the row in ' + otherMs + ' ms (limit 3000 ms)',
      lockedBy === 1 && !otherErr && otherMs < 9000 && leftover === 0 && stalledResult !== 'HUNG',
      JSON.stringify({ lockedBy, otherErr: otherErr.slice(0, 80), otherMs, leftover, stalledResult: String(stalledResult).slice(0, 80) }));
  }

  // ---- R. a close that is never answered cannot hang the worker ---------------------------------------------------------
  // client.end() waits for the server's side of the close with no limit. A path that took the Terminate and never answered the
  // close left the worker waiting forever after a statement that had succeeded, while its heartbeat timer kept the run and the
  // node fresh (final verification 2026-09-24). A relay here swallows the Terminate and the FIN of the one connection that
  // carried the marked statement: the write must still return, within the close limit.
  {
    await reset();
    const net = await import('node:net');
    const conns = [];
    const relay = net.createServer({ allowHalfOpen: true }, (c) => {
      const u = net.connect(pg.port, '127.0.0.1'); conns.push(c, u); c.on('error', () => {}); u.on('error', () => {});
      let buf = Buffer.alloc(0), started = false, marked = false;
      c.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        const out = [];
        for (;;) {
          if (!started) { if (buf.length < 4) break; const n = buf.readInt32BE(0); if (buf.length < n) break; const m = buf.subarray(0, n); out.push(m); buf = buf.subarray(n); const code = n >= 8 ? m.readInt32BE(4) : 0; if (code !== 80877103) started = true; continue; }
          if (buf.length < 5) break;
          const t = String.fromCharCode(buf[0]); const n = buf.readInt32BE(1); if (buf.length < 1 + n) break;
          const m = buf.subarray(0, 1 + n); buf = buf.subarray(1 + n);
          if ((t === 'Q' || t === 'P') && m.toString('latin1').includes('qa-close-swallowed')) marked = true;
          if (marked && t === 'X') continue; // the Terminate never reaches the server
          out.push(m);
        }
        if (out.length) u.write(Buffer.concat(out));
      });
      c.on('end', () => { if (!marked) u.end(); }); // the FIN of the marked connection is never answered
      u.on('data', (d) => { if (!c.destroyed) c.write(d); });
      u.on('end', () => { if (!marked) c.end(); });
    });
    await new Promise((r) => relay.listen(0, '127.0.0.1', r));
    const relayUrl = pg.runnerUrl.replace(/@127\.0\.0\.1:\d+\//, '@127.0.0.1:' + relay.address().port + '/');
    const saved = { url: process.env.FACTORY_RUNNER_PG_URL, cl: process.env.FACTORY_PG_CLOSE_TIMEOUT_MS };
    process.env.FACTORY_RUNNER_PG_URL = relayUrl; process.env.FACTORY_PG_CLOSE_TIMEOUT_MS = '1500';
    const dbR = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href + '?closeswallowed=' + Date.now());
    const t0 = Date.now();
    const how = await Promise.race([dbR.write("select 1 as ok /* qa-close-swallowed */").then((r) => 'returned ' + r.rows[0].ok, (e) => 'error: ' + String(e && e.message || e)), new Promise((r) => setTimeout(() => r('HUNG'), 12000))]);
    const ms = Date.now() - t0;
    for (const x of conns) { try { x.destroy(); } catch { /* gone */ } }
    relay.close();
    process.env.FACTORY_RUNNER_PG_URL = saved.url;
    if (saved.cl === undefined) delete process.env.FACTORY_PG_CLOSE_TIMEOUT_MS; else process.env.FACTORY_PG_CLOSE_TIMEOUT_MS = saved.cl;
    check('R  a close the server side never answers cannot hang the worker: the statement returned and its connection was given up after the close limit (' + how + ' in ' + ms + ' ms; limit 1500 ms)',
      how === 'returned 1' && ms >= 1200 && ms < 9000, JSON.stringify({ how, ms }));
  }

  // ---- S. a malformed work order cannot starve the plane ------------------------------------------------------------------
  // A repeated surface collided with itself (23505, read as "another node won") and a NULL surface failed the lock insert (23502,
  // ending the worker): either way the work order at the head of the queue was retried forever and nothing behind it was claimed
  // (final verification 2026-09-24). A repeat is one surface; a NULL or empty surface is declined and the next work order taken.
  {
    await reset();
    const dup = await wo('S: repeated surface', { surface: ['qa/s.txt', 'qa/s.txt'], priority: 'high' });
    const behind1 = await wo('S: behind it', { surface: ['qa/s-behind.txt'] });
    let dupErr = '';
    let first = null; try { first = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60 }); } catch (e) { dupErr = String(e && e.message || e); }
    const dupLocks = first ? (await admin.query('select count(*)::int n from factory.surface_locks where run_id = $1', [first.run_id])).rows[0].n : -1;
    await reset();
    const nul = randomUUID();
    await admin.query("insert into factory.work_orders (work_order_id, title, owned_surface, priority, status) values ($1, 'S: NULL surface', ARRAY[NULL]::text[], 'high', 'queued')", [nul]);
    const behind2 = await wo('S: behind the NULL one', { surface: ['qa/s-behind2.txt'] });
    let nulErr = '';
    let second = null; try { second = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60 }); } catch (e) { nulErr = String(e && e.message || e); }
    const nulStatus = (await admin.query('select status from factory.work_orders where work_order_id = $1', [nul])).rows[0].status;
    // ...however many there are: nine at the head of the queue (NULL, empty, oversized) used up the claim's eight attempts - nothing behind
    // them was claimed, on any node, and an oversized one ended the worker (final verification 2, 2026-09-25)
    await reset();
    for (let i = 0; i < 9; i++) {
      const surf = i % 3 === 0 ? 'ARRAY[NULL]::text[]' : i % 3 === 1 ? "ARRAY['']::text[]" : "ARRAY[repeat('x', 5000)]::text[]";
      await admin.query("insert into factory.work_orders (work_order_id, title, owned_surface, priority, status) values ($1, 'S2: malformed " + i + "', " + surf + ", 'high', 'queued')", [randomUUID()]);
    }
    const behind3 = await wo('S2: behind nine malformed', { surface: ['qa/s-behind3.txt'], priority: 'low' });
    let s2Err = '', third = null;
    try { third = await claim.claimWork({ nodeId: 'node-alpha', leaseSeconds: 60 }); } catch (e) { s2Err = String(e && e.message || e); }
    check('S2 nine malformed work orders at the head of the queue (NULL, empty, oversized surfaces) do not starve it: the work order behind them is claimed',
      !s2Err && third && third.work_order_id === behind3, JSON.stringify({ s2Err: s2Err.slice(0, 120), third: third && third.work_order_id, behind3 }));
    check('S  a malformed work order cannot starve the plane: a repeated surface is claimed with one lock (' + dupLocks + '), a NULL surface is declined (still ' + nulStatus + ') and the work order behind it is claimed',
      !dupErr && first && first.work_order_id === dup && dupLocks === 1 && !nulErr && second && second.work_order_id === behind2 && nulStatus === 'queued',
      JSON.stringify({ dupErr: dupErr.slice(0, 80), first: first && first.work_order_id, dup, dupLocks, nulErr: nulErr.slice(0, 80), second: second && second.work_order_id, behind2, nulStatus, behind1 }));
  }

  // ---- S3. a surface too large IN BYTES never ends a claim (UTF8 plane) --------------------------------------------------------
  // The exclusion counted characters; the lock's key limit is in bytes. On a UTF8 database (the live plane) a 1000-character multibyte
  // surface still failed the lock insert (54000) and ended every claimer (final verification 3, 2026-09-25). The disposable plane here
  // is single-byte, so this row makes a UTF8 database of its own and claims through a child process pointed at it.
  {
    const { spawnSync } = await import('node:child_process');
    await admin.query("create database fac_utf8 with template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'");
    const su8 = new URL(pg.superUrl); su8.pathname = '/fac_utf8';
    const a8 = new pgLib.Client({ connectionString: su8.toString() }); await a8.connect();
    try {
      for (const f of ['001_factory_control_plane.sql', '003_resource_governance.sql']) await a8.query(readFileSync(join(ROOT, 'supabase/control-plane', f), 'utf8'));
      await a8.query('grant usage on schema factory to ' + pg.runnerRole);
      await a8.query('grant select, insert, update, delete on all tables in schema factory to ' + pg.runnerRole);
      await a8.query("insert into factory.nodes (node_id, capabilities, security_role, platform, agent_version) values ('node-s3', '[]'::jsonb, 'generic', 'test', 'v')");
      const cjk = Array.from({ length: 1000 }, (_, i) => String.fromCharCode(0x4e00 + (i % 5000))).join('');
      await a8.query("insert into factory.work_orders (work_order_id, title, owned_surface, priority, status) values ($1, 'S3: 1000 characters, 3000 bytes', ARRAY[$2]::text[], 'high', 'queued')", [randomUUID(), cjk]);
      const good = randomUUID();
      await a8.query("insert into factory.work_orders (work_order_id, title, owned_surface, priority, status) values ($1, 'S3: behind it', ARRAY['qa/s3.txt']::text[], 'low', 'queued')", [good]);
      const ru8 = new URL(pg.runnerUrl); ru8.pathname = '/fac_utf8';
      const probe = "const c = await import(" + JSON.stringify(pathToFileURL(join(ROOT, 'scripts/factory-runner/claim.mjs')).href) + "); try { const r = await c.claimWork({ nodeId: 'node-s3', leaseSeconds: 60 }); console.log('CLAIMED ' + (r ? r.work_order_id : 'null')); } catch (e) { console.log('THREW ' + (e.code || '') + ' ' + String(e.message).slice(0, 100)); } process.exit(0);";
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { ...process.env, FACTORY_RUNNER_PG_URL: ru8.toString(), FACTORY_ADMISSION: 'off' } });
      const health = spawnSync(process.execPath, [join(ROOT, 'scripts/factory-runner/node.mjs'), 'health'], { cwd: ROOT, encoding: 'utf8', timeout: 90000, env: { ...process.env, FACTORY_RUNNER_PG_URL: ru8.toString(), FACTORY_STATE_DIR: join(pg.dir, 'state-s3') } });
      check('S3 a surface too large in BYTES (1000 characters, 3000 bytes, UTF8) is never picked: the work order behind it is claimed, and health names it',
        new RegExp('CLAIMED ' + good).test(r.stdout || '') && /NULL, empty or oversized surface.*S3: 1000 characters/.test(health.stdout || ''),
        String(r.stdout || '') + String(r.stderr || '').slice(0, 200) + '\n' + String(health.stdout || '').split('\n').filter((l) => /oversized|FAIL/.test(l)).join('\n'));
    } finally { try { await a8.end(); } catch { /* ignore */ } }
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

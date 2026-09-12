#!/usr/bin/env node
// NO_SILENT_MODEL_FALLBACK — measured against a real PostgreSQL, because the row that claimed it was
// matching a comment.
//
// Usage: node qa/factory/no_silent_model_fallback.mjs
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────────
//
// The founder's standing requirement for every agent run: persist requested_provider, requested_model,
// actual_provider, actual_model, reasoning_effort, token counts, estimated cost, termination_reason,
// checkpoint and candidate SHA — and "NO SILENT MODEL FALLBACK. HTTP success != valid completed run."
//
// The runner's assertion for the first half of that read, in full:
//
//     assert.match(SUPERVISOR_SRC, /never silently substitutes/);
//
// IT MATCHED A SENTENCE IN A COMMENT. That row stays green if someone adds a code path that substitutes a
// model and leaves the comment in place, which is the one scenario it names. COMMENTS ARE NOT STATE, and
// TEXT MATCH IS NOT STRUCTURAL PRESENCE — the same class this campaign has now found in a product guard,
// in a QA instrument, in a mutation operator and here in a factory test.
//
// The migration DOES enforce it, with two CHECK constraints, and that enforcement is the thing worth
// asserting. So this suite applies the real schema to a real PostgreSQL and asks the database.
//
// ── WHAT IT PROVES ──────────────────────────────────────────────────────────────────────────────────
//
//   C1  the control-plane schema and the retry migration apply to a real server
//   D1  a MODEL substitution with no stated reason is REFUSED BY THE DATABASE
//   D2  a PROVIDER substitution with no stated reason is REFUSED
//   D3  the same substitutions are ACCEPTED once a fallback_reason is stated
//   C2  the honest cases are untouched: actual == requested, and actual null (not yet served)
//   C3  a requested_* that is null cannot be used to smuggle a substitution past the constraint
//   N1  NEGATIVE CONTROL: with the constraints dropped, D1 and D2 stop failing — so those rows are
//       measuring the constraints and not something incidental about the insert
//
// N1 is the row that makes the rest mean anything. Without it, D1 and D2 would pass just as happily
// against a column that rejects every write for an unrelated reason.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const SCHEMA = join(ROOT, 'supabase/control-plane/001_factory_control_plane.sql');
const MIGRATION = join(ROOT, 'supabase/migrations/202609030001_agent_run_capacity_retry.sql');

let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log('OK   ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? '\n       ' + detail : '')); }
};
// A REFUSAL MUST BE REFUSED BY THE NAMED CONSTRAINT. "it threw" is not evidence: a typo in a column
// name throws too, and that is how a suite comes to assert the presence of its own bug.
const expectRefusal = async (q, sql, constraint, name) => {
  let msg = null;
  try { await q(sql); } catch (e) { msg = String(e && e.message || e); }
  if (msg === null) { check(name, false, 'it SUCCEEDED — the database accepted a silent substitution'); return; }
  check(name, msg.includes(constraint),
    'refused, but not by ' + constraint + '. got: ' + msg.slice(0, 220));
};

for (const f of [SCHEMA, MIGRATION]) {
  if (!existsSync(f)) { console.log('FAIL the schema is not at ' + f); process.exit(1); }
}

// The same disposable real server the lease tests use. A single-connection shim cannot host this either:
// a CHECK constraint is real PostgreSQL behaviour, and asserting it against a fake would be asserting the
// fake.
const { startLocalPg } = await import(pathToFileURL(join(HERE, 'local_pg.mjs')).href);
const pg = await startLocalPg();
const { default: pgLib } = await import('pg');
// The SUPERUSER connection, deliberately: this suite applies DDL and drops constraints in N1, which
// db.mjs refuses by design and correctly. Nothing here runs as the least-privilege runner role, and
// nothing here claims a privilege property — it claims a CONSTRAINT property.
const client = new pgLib.Client({ connectionString: pg.superUrl });
await client.connect();
const q = async (sql) => client.query(sql);

// THE CONTROL-PLANE SCHEMA IS THE SUBJECT, not the production migration. They are two different tables:
// 202609030001 alters public.agent_runs in the production Brain OS database (and is NOT applied), while
// factory.agent_runs here is the shared non-production control plane the Factory will actually run on. The
// guarantee lived on the first and was MISSING from the second - the table with the constraint was the one
// the Factory does not use. The migration is still read below, to assert the two have not drifted apart.
let schemaError = null;
try { await q(readFileSync(SCHEMA, 'utf8')); }
catch (e) { schemaError = String(e && e.message).slice(0, 300); }
check('C1 the control-plane schema applies to a real PostgreSQL', schemaError === null, schemaError || '');
if (schemaError) {
  await client.end(); await pg.stop();
  console.log('\nthe schema did not apply; nothing below would mean anything');
  process.exit(1);
}

// A run row to operate on, built from the columns the schema actually requires rather than a guessed list.
let WO = null;
try {
  const { rows } = await q("insert into factory.work_orders (title) values ('fallback harness') returning work_order_id");
  WO = rows[0].work_order_id;
} catch (e) {
  // Discover the required columns rather than guessing them: a fixture clever enough to guess a column
  // list but not the graph it sits in is how the first draft of the DS-D1 harness died.
  const { rows: cols } = await q("select column_name, data_type from information_schema.columns"
    + " where table_schema='factory' and table_name='work_orders' and is_nullable='NO'"
    + " and column_default is null");
  const vals = cols.map((c) => ({ c: c.column_name,
    v: /uuid/.test(c.data_type) ? 'gen_random_uuid()'
      : /timestamp/.test(c.data_type) ? 'now()' : /int|numeric/.test(c.data_type) ? '0'
      : /bool/.test(c.data_type) ? 'false' : "'fallback harness'" }));
  const { rows } = await q('insert into factory.work_orders (' + vals.map((x) => x.c).join(', ')
    + ') values (' + vals.map((x) => x.v).join(', ') + ') returning work_order_id');
  WO = rows[0].work_order_id;
}
const newRun = async (requestedProvider, requestedModel) => {
  const { rows } = await q(
    "insert into factory.agent_runs (work_order_id, requested_provider, requested_model) values ('"
    + WO + "', "
    + (requestedProvider === null ? 'null' : "'" + requestedProvider + "'") + ', '
    + (requestedModel === null ? 'null' : "'" + requestedModel + "'") + ') returning run_id');
  return rows[0].run_id;
};

let baseOk = true;
let runId = null;
try { runId = await newRun('anthropic', 'claude-opus-5'); }
catch (e) {
  baseOk = false;
  check('C1b an agent_runs row can be created with a requested provider and model', false,
    String(e && e.message).slice(0, 300));
}
if (baseOk) check('C1b an agent_runs row can be created with a requested provider and model', true);

if (baseOk) {
  // ── D1 / D2: the silent substitution is REFUSED ────────────────────────────────────────────────
  await expectRefusal(q,
    "update factory.agent_runs set actual_model = 'claude-haiku-4-5' where run_id = '" + runId + "'",
    'agent_runs_no_silent_model_fallback',
    'D1 a MODEL substitution with no stated reason is REFUSED BY THE DATABASE');
  await expectRefusal(q,
    "update factory.agent_runs set actual_provider = 'openai' where run_id = '" + runId + "'",
    'agent_runs_no_silent_provider_fallback',
    'D2 a PROVIDER substitution with no stated reason is REFUSED');

  // ── D3: stated, and therefore allowed ──────────────────────────────────────────────────────────
  {
    let err = null;
    try {
      await q("update factory.agent_runs set actual_model = 'claude-haiku-4-5',"
        + " actual_provider = 'anthropic', fallback_reason = 'opus capacity exhausted, rotated by the"
        + " watchdog' where run_id = '" + runId + "'");
    } catch (e) { err = String(e && e.message).slice(0, 250); }
    check('D3 the SAME substitution is accepted once fallback_reason states why', err === null, err || '');
  }

  // ── C2: the honest cases are untouched ─────────────────────────────────────────────────────────
  {
    let err = null;
    try {
      const same = await newRun('anthropic', 'claude-opus-5');
      await q("update factory.agent_runs set actual_provider = 'anthropic',"
        + " actual_model = 'claude-opus-5' where run_id = '" + same + "'");
      const pending = await newRun('anthropic', 'claude-opus-5');
      // left with actual_* NULL: the run has been dispatched and nothing has served it yet, which is
      // the state a run spends most of its life in and must not be a constraint violation.
      await q("update factory.agent_runs set started_at = now() where run_id = '" + pending + "'");
    } catch (e) { err = String(e && e.message).slice(0, 250); }
    check('C2 served-as-requested and not-yet-served are both accepted — the constraint costs the honest'
      + ' path nothing', err === null, err || '');
  }

  // ── C3: a null requested_* must not become a loophole ──────────────────────────────────────────
  //
  // The constraint reads `requested_model is null or ...`, so a row with no requested model accepts any
  // actual model. That is CORRECT as a constraint — a substitution is only definable against something
  // requested — and it is exactly why the founder requires requested_* to be written BEFORE the call.
  // The row is here so the loophole is STATED rather than discovered: the constraint cannot close it, and
  // the application writing requested_* at dispatch is what does.
  {
    let err = null;
    try {
      const unnamed = await newRun(null, null);
      await q("update factory.agent_runs set actual_model = 'anything-at-all',"
        + " actual_provider = 'anyone' where run_id = '" + unnamed + "'");
    } catch (e) { err = String(e && e.message).slice(0, 250); }
    check('C3 STATED, NOT ENFORCED: with requested_* null any actual_* is accepted, so the constraint'
      + ' depends on requested_* being written BEFORE the call — that is application work, not a check',
      err === null,
      'this row documents the boundary of the constraint; if it now fails the constraint changed shape');
  }

  // ── D4: a finished run must say HOW it finished ────────────────────────────────────────────────
  //
  // HTTP SUCCESS IS NOT A VALID COMPLETED RUN. The 2026-08-24 OpenAI defect was eight attempts of
  // HTTP 200 with headers returned and a body that never terminated, recorded as nothing in particular.
  // A status that CLAIMS a terminal outcome must carry the terminal condition that was observed.
  await expectRefusal(q,
    "update factory.agent_runs set status = 'done' where run_id = '" + runId + "'",
    'agent_runs_terminal_status_states_its_reason',
    'D4 a run set to done with no termination_reason is REFUSED — HTTP success is not a completed run');
  {
    let err = null;
    try {
      await q("update factory.agent_runs set status = 'failed',"
        + " termination_reason = 'stream_never_terminated' where run_id = '" + runId + "'");
    } catch (e) { err = String(e && e.message).slice(0, 250); }
    check('D5 the same run is accepted once it states the terminal condition it actually observed',
      err === null, err || '');
  }
  {
    let err = null;
    try {
      const queued = await newRun('anthropic', 'claude-opus-5');
      await q("update factory.agent_runs set status = 'in_progress' where run_id = '" + queued + "'");
      await q("update factory.agent_runs set status = 'blocked' where run_id = '" + queued + "'");
    } catch (e) { err = String(e && e.message).slice(0, 250); }
    check('C4 queued / in_progress / blocked are exempt — they claim no terminal outcome, so requiring a'
      + ' terminal condition from them would force a reason to be invented', err === null, err || '');
  }

  // ── C5: the two tables have not drifted apart ─────────────────────────────────────────────────
  //
  // The production migration and the control-plane schema must carry the SAME guarantee. This row is
  // here because the defect was precisely that they did not: one had both constraints, the other had
  // neither, and nothing compared them.
  {
    const mig = readFileSync(MIGRATION, 'utf8');
    const missing = [];
    for (const c of ['agent_runs_no_silent_model_fallback', 'agent_runs_no_silent_provider_fallback']) {
      const { rows } = await q("select 1 from pg_constraint where conname = '" + c + "'"
        + " and conrelid = 'factory.agent_runs'::regclass");
      if (rows.length === 0) missing.push(c + ' (absent from factory.agent_runs)');
      if (!mig.includes(c)) missing.push(c + ' (absent from the production migration)');
    }
    check('C5 both no-silent-fallback constraints exist on the CONTROL-PLANE table AND are named in the'
      + ' production migration — the guarantee is on the table the Factory uses, not only the other one',
      missing.length === 0, missing.join('; '));
  }
  // ── N1: the negative control ───────────────────────────────────────────────────────────────────
  {
    await q('alter table factory.agent_runs drop constraint agent_runs_no_silent_model_fallback');
    await q('alter table factory.agent_runs drop constraint agent_runs_no_silent_provider_fallback');
    const loose = await newRun('anthropic', 'claude-opus-5');
    let err = null;
    try {
      await q("update factory.agent_runs set actual_model = 'claude-haiku-4-5', actual_provider = 'openai'"
        + " where run_id = '" + loose + "'");
    } catch (e) { err = String(e && e.message).slice(0, 250); }
    check('N1 NEGATIVE CONTROL: with both constraints dropped the silent substitution SUCCEEDS — so D1'
      + ' and D2 are measuring the constraints and not something incidental', err === null, err || '');
  }
}

await client.end();
await pg.stop();
console.log('');
console.log(pass + ' pass, ' + fail + ' fail');
console.log('NO_SILENT_MODEL_FALLBACK: measured against a real PostgreSQL server. The row this replaces');
console.log('asserted the presence of the sentence "never silently substitutes" in a source comment.');
process.exit(fail > 0 ? 1 : 0);

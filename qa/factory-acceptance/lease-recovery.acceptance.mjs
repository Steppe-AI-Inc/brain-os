// Work Order lease / claim / recovery acceptance (founder section 4).
//
// LOCAL_DB_CONTRACT (PGlite, sequential): the claim RPC's WHERE-clause contract, lease TTL by
// fixture time, resume planning, stale view. REAL_POSTGRES_LOCAL (embedded PostgreSQL 17, two
// connections, one machine): the FOR UPDATE SKIP LOCKED race. Never promoted to CROSS_NODE_REAL.
// The 30-minute lease is never shortened; only fixture timestamps move.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pinRefs, anchorsIn, provenanceFor, pinnedPath, pinnedExists, worktree, readPinned } from './lib/provenance.mjs';
import { suiteRecorder } from './lib/record.mjs';
import { openFactoryDb, seedIdentities, seedFactory, asSuperuser, attempt, moveTime, IDS } from './lib/pglite-factory.mjs';
import { DEPS_DIR, REAL_PG_URL, STATE_PATH } from './lib/deps.mjs';

const R = suiteRecorder('lease-recovery');
pinRefs();
after(() => { console.log('wrote', R.write()); });
const MIG = 'supabase/migrations/202609030001_agent_run_capacity_retry.sql';
const RUN = 'dddd0000-0000-4000-8000-00000000000d';
const AGENT = '33123660-2f38-4290-8de7-35b8f696247a';
const WO = 'aaaaaaaa-0000-4000-8000-00000000aa01';
const claimSql = (who) => `select id, attempt_count, max_attempts, remaining_scenarios, last_completed_scenario, source_sha from public.claim_blocked_run_for_retry('${who}', 6, interval '30 minutes')`;

let h;
async function fixture(overrides = {}) {
  await asSuperuser(h);
  const o = { status: 'blocked', blocked_reason: 'PROVIDER_CAPACITY_BLOCKED: test', attempt_count: 1, retry_after_min: 1, claimed_by: null, claimed_at_min: null, source_sha: 'abc1234', remaining: '["scenario_3","scenario_4"]', last: 'scenario_2', ...overrides };
  await h.exec(`delete from public.agent_runs where id = '${RUN}';
    insert into public.agent_runs (id, status, blocked_at, retry_after, attempt_count, source_sha, blocked_reason, agent_id, canonical_work_order_id, company_id, execution_provider, claimed_by, claimed_at, remaining_scenarios, last_completed_scenario, last_heartbeat_at)
    values ('${RUN}', '${o.status}'::public.work_status, now() - interval '1 hour', now() - make_interval(mins => ${o.retry_after_min}), ${o.attempt_count}, '${o.source_sha}', '${o.blocked_reason}', '${AGENT}', '${WO}', '${IDS.COMPANY}', 'claude_code_background',
      ${o.claimed_by ? `'${o.claimed_by}'` : 'null'}, ${o.claimed_at_min == null ? 'null' : `now() - make_interval(mins => ${o.claimed_at_min})`}, '${o.remaining}'::jsonb, '${o.last}', now() - interval '1 hour');`);
}

test('LR-00 engine', async () => {
  h = await openFactoryDb({ refKey: 'p1' });
  await seedIdentities(h); await seedFactory(h);
  const rec = await R.check('LR-00', { claim: 'PGlite engine with the retry migration applied', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => ({ verdict: h.migration_chain_complete ? 'PASS' : 'NO_VERDICT', evidence: { engine: h.engine, version: h.version, security_label: h.security_label, rpc_present: (await h.query(`select count(*)::int c from pg_proc where proname='claim_blocked_run_for_retry'`)).rows[0].c }, provenance: provenanceFor('master', [MIG], 'LOCAL_DB_CONTRACT') }));
  assert.equal(rec.verdict, 'PASS');
});

test('LR-01 unclassified (crashed) failure is not auto-claimed (KFM #118 claim 2, master text)', async () => {
  const rec = await R.check('LR-01', { claim: 'A run blocked for a non-capacity reason (e.g. agent crash) is never claimed for automatic retry', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent', kfm_ref: '#118/claim-2' }, async () => {
    await fixture({ blocked_reason: 'agent crashed with exit 3' });
    const r = await attempt(h, claimSql('sup-a'));
    const filter = anchorsIn('master', MIG, /blocked_reason like 'PROVIDER_CAPACITY_BLOCKED%'/);
    return { verdict: r.ok && r.rows.length === 0 ? 'PASS' : 'FAIL', evidence: { claim_rows: r.rows ? r.rows.length : r, where_anchor: filter, confirms_or_refutes: 'REFUTES #118/claim-2 at master: the pinned RPC text filters blocked_reason' }, provenance: provenanceFor('master', [MIG], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('LR-02 attempt cap enforced in SQL (KFM #118 claim 1/unbounded loop)', async () => {
  const rec = await R.check('LR-02', { claim: 'The retry loop is bounded in SQL: attempt_count >= p_max_attempts is never claimed; a claim increments attempt_count', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent', kfm_ref: '#118/claim-1' }, async () => {
    await fixture({ attempt_count: 6 }); const capped = await attempt(h, claimSql('sup-a'));
    await fixture({ attempt_count: 5 }); const last = await attempt(h, claimSql('sup-a'));
    const after5 = (await h.query(`select attempt_count, status, claimed_by from public.agent_runs where id = '${RUN}'`)).rows[0];
    const ok = capped.ok && capped.rows.length === 0 && last.ok && last.rows.length === 1 && after5.attempt_count === 6 && after5.status === 'in_progress';
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: { at_cap: capped.rows ? capped.rows.length : capped, below_cap: last.rows ? last.rows.length : last, row_after: after5, where_anchor: anchorsIn('master', MIG, /attempt_count < p_max_attempts/), note: 'the JS predicate isRetryEligible remains dead code (LR-05); the SQL WHERE is the live gate' }, provenance: provenanceFor('master', [MIG], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('LR-03 NODE A claims; NODE B cannot until the 30-minute lease expires (fixture time, lease never shortened)', async () => {
  const rec = await R.check('LR-03', { claim: 'Lease TTL: a second claimant is refused while a live claim exists and succeeds only after the real 30-minute stale threshold', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    await fixture();
    const a = await attempt(h, claimSql('node-A'));
    const bFresh = await attempt(h, claimSql('node-B'));
    // Node A dies: the row stays in_progress with claimed_at fresh. Move fixture time to 29 min, then 31 min.
    await moveTime(h, RUN, { status: 'blocked', claimed_at_minus_min: 29 });
    const b29 = await attempt(h, claimSql('node-B'));
    await moveTime(h, RUN, { status: 'blocked', claimed_at_minus_min: 31 });
    const b31 = await attempt(h, claimSql('node-B'));
    const row = (await h.query(`select claimed_by, attempt_count, status from public.agent_runs where id = '${RUN}'`)).rows[0];
    const ok = a.ok && a.rows.length === 1 && bFresh.ok && bFresh.rows.length === 0 && b29.ok && b29.rows.length === 0 && b31.ok && b31.rows.length === 1 && row.claimed_by === 'node-B';
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: { node_a_claim: a.rows && a.rows.length, node_b_while_fresh: bFresh.rows && bFresh.rows.length, node_b_at_29min: b29.rows && b29.rows.length, node_b_at_31min: b31.rows && b31.rows.length, row_after: row, lease_param_default: anchorsIn('master', MIG, /p_stale_claim_after interval default interval '30 minutes'/), supervisor_passes_ttl: anchorsIn('master', 'scripts/factory-runner/supervisor.mjs', /claim_blocked_run_for_retry\(/) }, provenance: provenanceFor('master', [MIG, 'scripts/factory-runner/supervisor.mjs'], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('LR-04 re-block replay: with claimed_by cleared (master recordCapacityBlock text) the run is reclaimable; without clearing it is stuck until TTL (KFM #118 claim 3)', async () => {
  const rec = await R.check('LR-04', { claim: 'After a provider re-block the run can be recovered again (claimed_by is reset by the re-block path)', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent', kfm_ref: '#118/claim-3' }, async () => {
    await fixture(); await attempt(h, claimSql('node-A'));
    await asSuperuser(h);
    // (a) replay as recordCapacityBlock on master writes it: status blocked, claimed_by/claimed_at cleared, retry_after past
    const clears = anchorsIn('master', 'scripts/factory-runner/supervisor.mjs', /claimed_by = null, claimed_at = null/);
    await h.exec(`update public.agent_runs set status='blocked', claimed_by=null, claimed_at=null, retry_after=now()-interval '1 minute', blocked_reason='PROVIDER_CAPACITY_BLOCKED: again' where id='${RUN}'`);
    const afterClear = await attempt(h, claimSql('node-A2'));
    // (b) replay WITHOUT clearing claimed_by (the defect #118 described)
    await asSuperuser(h);
    await h.exec(`update public.agent_runs set status='blocked', claimed_by='node-A2', claimed_at=now(), retry_after=now()-interval '1 minute' where id='${RUN}'`);
    const stuck = await attempt(h, claimSql('node-A3'));
    await moveTime(h, RUN, { claimed_at_minus_min: 31 });
    const afterTtl = await attempt(h, claimSql('node-A3'));
    const ok = afterClear.ok && afterClear.rows.length === 1 && stuck.ok && stuck.rows.length === 0 && afterTtl.ok && afterTtl.rows.length === 1;
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: { master_recordCapacityBlock_clears_claim: clears, reclaim_after_clear: afterClear.rows && afterClear.rows.length, reclaim_without_clear: stuck.rows && stuck.rows.length, reclaim_without_clear_after_ttl: afterTtl.rows && afterTtl.rows.length, confirms_or_refutes: clears.length ? 'REFUTES #118/claim-3 at master (source clears claimed_by); the stuck-until-TTL behaviour is reproduced only when the reset is omitted' : 'CONFIRMS #118/claim-3' }, provenance: provenanceFor('master', [MIG, 'scripts/factory-runner/supervisor.mjs'], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('LR-05 isRetryEligible is dead code and cannot accept the RPC row shape (KFM #118 claim 1)', async () => {
  const rec = await R.check('LR-05', { claim: 'The JS safety predicate is wired into the live path', expect: 'FAIL', method: 'PURE_FN', evidence_kind: 'independent', kfm_ref: '#118/claim-1' }, async () => {
    const out = {};
    for (const ref of ['master', 'p1']) {
      const s = await import(pathToFileURL(pinnedPath(ref, 'scripts/factory-runner/supervisor.mjs')).href + '?lr5=' + ref);
      await fixture();
      const row = (await attempt(h, claimSql('node-shape'))).rows[0];
      const eligible = typeof s.isRetryEligible === 'function' ? s.isRetryEligible(row, new Date()) : 'NOT_EXPORTED';
      const callSites = spawnSync('git', ['grep', '-n', 'isRetryEligible(', worktree(ref).sha, '--', 'scripts'], { cwd: worktree(ref).path, encoding: 'utf8', windowsHide: true }).stdout.trim().split('\n').filter(Boolean).filter((l) => !/\.test\.mjs|export function isRetryEligible|\/\//.test(l));
      out[ref] = { predicate_on_real_rpc_row: eligible, rpc_row_columns: Object.keys(row || {}), non_test_call_sites: callSites, dead_code_comment: anchorsIn(ref, 'scripts/factory-runner/supervisor.mjs', /NOT THE GATE|ZERO call sites/i) };
    }
    const dead = ['master', 'p1'].every((r) => out[r].non_test_call_sites.length === 0 && out[r].predicate_on_real_rpc_row === false);
    return { verdict: dead ? 'FAIL' : 'PASS', evidence: { ...out, confirms_or_refutes: dead ? 'CONFIRMS #118/claim-1 on both refs' : 'REFUTES' }, provenance: { master: provenanceFor('master', ['scripts/factory-runner/supervisor.mjs', MIG]), p1: provenanceFor('p1', ['scripts/factory-runner/supervisor.mjs', MIG]) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('LR-06 resume plan: equal source_sha reuses completed scenarios; changed sha restarts and invalidates partial certification', async () => {
  const rec = await R.check('LR-06', { claim: 'Finished work is not repeated on resume when the source is unchanged; a changed source never inherits partial certification', expect: 'PASS', method: 'PURE_FN', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of ['master', 'p1']) {
      const s = await import(pathToFileURL(pinnedPath(ref, 'scripts/factory-runner/supervisor.mjs')).href + '?lr6=' + ref);
      await fixture();
      const row = (await attempt(h, claimSql('node-B'))).rows[0];
      out[ref] = { same_sha: s.planResume(row, row.source_sha), changed_sha: s.planResume(row, 'fffffff'), null_sha: s.planResume({ ...row, source_sha: null }, 'abc1234') };
    }
    const ok = ['master', 'p1'].every((r) => out[r].same_sha.reuseCompletedScenarios === true && out[r].same_sha.startFrom === 'scenario_3' && out[r].changed_sha.reuseCompletedScenarios === false && out[r].changed_sha.startFrom === 'scenario_1' && out[r].changed_sha.invalidatedCertification === true && out[r].null_sha.reuseCompletedScenarios === false);
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: out, provenance: { master: provenanceFor('master', ['scripts/factory-runner/supervisor.mjs']), p1: provenanceFor('p1', ['scripts/factory-runner/supervisor.mjs']) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('LR-07 stale detection: heartbeat older than 10 minutes reads STALE; no sweeper flips it', async () => {
  const rec = await R.check('LR-07', { claim: 'A dead worker is visible as STALE from heartbeat age alone; an in-progress run with a fresh heartbeat reads RUNNING', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    await fixture({ status: 'in_progress' });
    await moveTime(h, RUN, { heartbeat_minus_min: 11 });
    const stale = (await h.query(`select live_run_status from public.agent_runs_with_live_status where id='${RUN}'`)).rows[0].live_run_status;
    await moveTime(h, RUN, { heartbeat_minus_min: 9 });
    const running = (await h.query(`select live_run_status from public.agent_runs_with_live_status where id='${RUN}'`)).rows[0].live_run_status;
    const stored = (await h.query(`select status from public.agent_runs where id='${RUN}'`)).rows[0].status;
    return { verdict: stale === 'STALE' && running === 'RUNNING' && stored === 'in_progress' ? 'PASS' : 'FAIL', evidence: { at_11min: stale, at_9min: running, stored_status_unchanged: stored, note: 'derived view only; no job transitions the row - a stale run is recovered only by the (unscheduled) supervisor or a human' }, provenance: provenanceFor('master', ['supabase/migrations/202608300005_task_dag_and_agent_telemetry.sql'], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('LR-08 claim-then-spawn-failure releases the claim (source contract) and a re-poll is idempotent', async () => {
  const rec = await R.check('LR-08', { claim: 'Supervisor restart / duplicate poll: a second sequential poll finds nothing to claim; spawn failure releases the claim', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    await fixture();
    const first = await attempt(h, claimSql('sup-1')); const second = await attempt(h, claimSql('sup-1-restarted'));
    const release = anchorsIn('master', 'scripts/factory-runner/supervisor.mjs', /resume_spawn_failed_claim_released/);
    await asSuperuser(h);
    await h.exec(`update public.agent_runs set status='blocked', claimed_by=null, claimed_at=null, last_event='resume_spawn_failed_claim_released' where id='${RUN}'`);
    const third = await attempt(h, claimSql('sup-2'));
    const ok = first.rows.length === 1 && second.rows.length === 0 && release.length > 0 && third.rows.length === 1;
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: { first: first.rows.length, restarted_poll: second.rows.length, release_anchor: release, after_release: third.rows.length, note: 'the release write itself is JS in pollOnce (not executed here: it shells to --linked); its SQL effect is replayed from the pinned source text' }, provenance: provenanceFor('master', ['scripts/factory-runner/supervisor.mjs', MIG], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('close pglite', async () => { if (h) await h.close(); });

// ---------------------------------------------------------------- REAL_POSTGRES_LOCAL
test('LR-09 REAL PostgreSQL race: two connections, FOR UPDATE SKIP LOCKED, stale-claim takeover by fixture time', async () => {
  const rec = await R.check('LR-09', { claim: 'Two claimants racing for one blocked run never both win (SKIP LOCKED); the loser is not blocked; takeover happens only after the real 30-minute stale threshold', expect: 'PASS', method: 'REAL_PG_RACE', evidence_kind: 'independent' }, async () => {
    if (!existsSync(STATE_PATH)) return { verdict: 'NO_VERDICT', no_verdict_reason: 'EMBEDDED_POSTGRES_NOT_RUNNING (run preflight)', evidence: { state_path: STATE_PATH }, provenance: provenanceFor('master', [MIG], 'REAL_POSTGRES_LOCAL') };
    const req = createRequire(join(DEPS_DIR, 'package.json'));
    const pg = req('pg');
    const url = process.env.DBTEST_PG_URL || REAL_PG_URL;
    if (/supabase\.(co|com|in)|pooler\.supabase|pvphxgrtdfrudejjhzjk/i.test(url)) throw new Error('REFUSED: production-looking URL');
    const c1 = new pg.Client({ connectionString: url }); const c2 = new pg.Client({ connectionString: url }); const admin = new pg.Client({ connectionString: url });
    await c1.connect(); await c2.connect(); await admin.connect();
    const ev = {};
    try {
      ev.server = (await admin.query("select version() v, inet_server_addr()::text a, session_user su")).rows[0];
      ev.sentinel = (await admin.query('select count(*)::int c from public._dbtest_disposable')).rows[0].c;
      await admin.query(`insert into public.companies (id, name, status) values ($1,'QA Disposable Co A','active') on conflict (id) do nothing`, [IDS.COMPANY]);
      await admin.query(`insert into public.agents (id, name, role, active, category, execution_provider, has_production_authority) values ($1,'qa-disposable-director','software_factory',true,'SOFTWARE_FACTORY','claude_code_background',true) on conflict (id) do nothing`, [AGENT]);
      await admin.query(`insert into public.canonical_work_orders (id, company_id, title, status, work_type) values ($1,$2,'QA disposable work order','queued','software_development') on conflict (id) do nothing`, [WO, IDS.COMPANY]);
      await admin.query(`delete from public.agent_runs where id = $1`, [RUN]);
      await admin.query(`insert into public.agent_runs (id, status, blocked_at, retry_after, attempt_count, source_sha, blocked_reason, agent_id, canonical_work_order_id, company_id, execution_provider)
        values ($1,'blocked', now()-interval '1 hour', now()-interval '1 minute', 1, 'abc1234', 'PROVIDER_CAPACITY_BLOCKED: race', $2, $3, $4, 'claude_code_background')`, [RUN, AGENT, WO, IDS.COMPANY]);
      const claim = (c, who) => c.query(`select id from public.claim_blocked_run_for_retry($1, 6, interval '30 minutes')`, [who]).then((r) => r.rows);
      await c1.query('begin');
      ev.a_claim_in_open_tx = (await claim(c1, 'node-A')).length;
      await c2.query('begin');
      const t0 = Date.now();
      const raced = await Promise.race([claim(c2, 'node-B').then((rows) => ({ rows })), new Promise((res) => setTimeout(() => res({ timeout: true }), 5000))]);
      ev.b_claim_during_a_tx = raced.timeout ? 'BLOCKED_5S_TIMEOUT' : raced.rows.length; ev.b_wait_ms = Date.now() - t0;
      await c2.query('commit'); await c1.query('commit');
      ev.b_claim_after_a_commit = (await claim(c2, 'node-B')).length;
      ev.row_after = (await admin.query(`select claimed_by, attempt_count, status from public.agent_runs where id=$1`, [RUN])).rows[0];
      // stale takeover by fixture time only
      await admin.query(`update public.agent_runs set status='blocked', claimed_at = now() - interval '29 minutes' where id=$1`, [RUN]);
      ev.b_claim_at_29min = (await claim(c2, 'node-B')).length;
      await admin.query(`update public.agent_runs set status='blocked', claimed_at = now() - interval '31 minutes' where id=$1`, [RUN]);
      ev.b_claim_at_31min = (await claim(c2, 'node-B')).length;
      ev.row_final = (await admin.query(`select claimed_by, attempt_count, status from public.agent_runs where id=$1`, [RUN])).rows[0];
      await admin.query(`delete from public.agent_runs where id = $1`, [RUN]);
    } finally { await c1.end(); await c2.end(); await admin.end(); }
    const ok = ev.a_claim_in_open_tx === 1 && ev.b_claim_during_a_tx === 0 && ev.b_wait_ms < 4000 && ev.b_claim_after_a_commit === 0 && ev.b_claim_at_29min === 0 && ev.b_claim_at_31min === 1 && ev.row_final.claimed_by === 'node-B';
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: { ...ev, evidence_level_note: 'REAL_POSTGRES_LOCAL: two connections to one embedded PostgreSQL 17.10 on this machine. NOT CROSS_NODE_REAL - a Home-PC node A / Work-PC node B takeover over shared non-production PostgreSQL remains BLOCKED.' }, provenance: provenanceFor('master', [MIG], 'REAL_POSTGRES_LOCAL') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT' || /EMBEDDED/.test(rec.no_verdict_reason || ''), rec.harness_error);
});

test('LR-10 cross-check: pinned qa/dbtest/concurrency.mjs on the embedded server', async () => {
  const rec = await R.check('LR-10', { claim: 'The Home PC concurrency harness (TWO_SUPERVISORS_CANNOT_DOUBLE_RESTART_RUN) passes on real PostgreSQL', expect: 'PASS', method: 'NODE_TEST_RERUN', evidence_kind: 'cross-check' }, async () => {
    if (!existsSync(STATE_PATH)) return { verdict: 'NO_VERDICT', no_verdict_reason: 'EMBEDDED_POSTGRES_NOT_RUNNING', evidence: {}, provenance: provenanceFor('p1', ['qa/dbtest/concurrency.mjs'], 'REAL_POSTGRES_LOCAL') };
    const r = spawnSync(process.execPath, [pinnedPath('p1', 'qa/dbtest/concurrency.mjs')], { cwd: pinnedPath('p1', 'qa/dbtest'), encoding: 'utf8', windowsHide: true, timeout: 300000, env: (() => { const e = { ...process.env, DBTEST_PG_URL: REAL_PG_URL }; delete e.NODE_TEST_CONTEXT; return e; })() });
    const lines = r.stdout.split(/\r?\n/).filter((l) => /^(OK|FAIL)/.test(l));
    return { verdict: r.status === 0 && lines.some((l) => /^OK/.test(l)) && !lines.some((l) => /^FAIL/.test(l)) ? 'PASS' : (lines.length ? 'FAIL' : 'NO_VERDICT'), no_verdict_reason: lines.length ? null : 'NO_VERDICT_LINES', evidence: { exit: r.status, checks: lines.map((l) => l.slice(0, 160)), stdout_excerpt: r.stdout.slice(-800), stderr_excerpt: r.stderr.slice(0, 400), note: 'the pinned harness drops and recreates the schema on open (disposable, sentinel-gated) and applies the migration chain itself' }, provenance: provenanceFor('p1', ['qa/dbtest/concurrency.mjs', 'qa/dbtest/db.mjs'], 'REAL_POSTGRES_LOCAL') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT' || rec.no_verdict_reason, rec.harness_error);
});

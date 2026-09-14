// Factory Director independent acceptance (founder section 2).
//
// Subject: the FACTORY Director (.claude/agents/brain-os-factory-director.md + scripts/factory-runner/*),
// NOT the Work-PC QA supervisor. Every claim is located on the pinned refs; where the mechanism is
// absent that absence is the finding. The Home-PC runtime cannot be pointed at a disposable DB (every
// script shells out to `supabase db query --linked`), so claims are verified at the DB-contract and
// pure-function level, never by running the Home-PC scripts against anything.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { pinRefs, anchorsIn, provenanceFor, pinnedPath, pinnedExists, sameBlobOnBothRefs, worktree } from './lib/provenance.mjs';
import { suiteRecorder } from './lib/record.mjs';
import { openFactoryDb, seedIdentities, seedFactory, runSqlSuite, asSuperuser, attempt } from './lib/pglite-factory.mjs';

const R = suiteRecorder('director');
pinRefs();
const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = ['complete-run.mjs', 'dispatch-task.mjs', 'plugin-attach.mjs', 'plugin-sync.mjs', 'poll-and-dispatch.mjs', 'poll-plugin-operations.mjs', 'provider.mjs', 'register-worker.mjs', 'scheduler.mjs', 'supervisor.mjs', 'sync-agents.mjs'];
const bothRefs = ['master', 'p1'];
const scrubEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: '', SUPABASE_DB_URL: '', DATABASE_URL: '', FACTORY_RUNNER_PG_URL: '' };
delete scrubEnv.NODE_TEST_CONTEXT; // a child `node --test` must not believe it runs inside this test process

after(() => { console.log('wrote', R.write()); });

test('DIR-01 import safety: pinned scheduler/supervisor/provider perform no process/DB call at import; pollOnce does', async () => {
  const rec = await R.check('DIR-01', { claim: 'Importing scripts/factory-runner/{scheduler,supervisor,provider}.mjs runs no child process (safe to unit-test); invoking pollOnce() does reach the ambient CLI (sentinel negative)', expect: 'PASS', method: 'PURE_FN', evidence_kind: 'independent' }, async () => {
    const sentinelDir = join(tmpdir(), 'brain-os-qa-factory-acceptance');
    mkdirSync(sentinelDir, { recursive: true });
    const sentinel = join(sentinelDir, '_sentinel.mjs');
    writeFileSync(sentinel, [
      "import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';",
      "const hit = (n) => { process.stderr.write('SENTINEL_HIT ' + n + String.fromCharCode(10)); throw new Error('SENTINEL ' + n); };",
      'cp.execFile = () => hit(\'execFile\'); cp.spawn = () => hit(\'spawn\'); cp.exec = () => hit(\'exec\'); cp.execFileSync = () => hit(\'execFileSync\'); cp.spawnSync = () => hit(\'spawnSync\');',
      'syncBuiltinESMExports();', ''].join('\n'));
    const out = {};
    for (const ref of bothRefs) {
      const wt = worktree(ref).path;
      const mods = ['scheduler.mjs', 'supervisor.mjs', 'provider.mjs'].map((f) => pathToFileURL(join(wt, 'scripts', 'factory-runner', f)).href);
      const importOnly = spawnSync(process.execPath, ['--import', pathToFileURL(sentinel).href, '--input-type=module', '-e', `await Promise.all(${JSON.stringify(mods)}.map((m) => import(m))); console.log('IMPORTED_OK');`], { encoding: 'utf8', windowsHide: true, cwd: wt, env: scrubEnv });
      const negative = spawnSync(process.execPath, ['--import', pathToFileURL(sentinel).href, '--input-type=module', '-e', `const s = await import(${JSON.stringify(mods[1])}); try { await s.pollOnce('qa-sentinel', 'deadbeef'); console.log('NO_CALL'); } catch (e) { console.log('CAUGHT ' + e.message); }`], { encoding: 'utf8', windowsHide: true, cwd: wt, env: scrubEnv });
      out[ref] = { import_ok: /IMPORTED_OK/.test(importOnly.stdout), import_sentinel_hits: (importOnly.stderr.match(/SENTINEL_HIT/g) || []).length, import_stderr: importOnly.stderr.slice(0, 300), pollOnce_sentinel_hit: /SENTINEL_HIT/.test(negative.stderr) || /SENTINEL/.test(negative.stdout), pollOnce_stdout: negative.stdout.slice(0, 200) };
    }
    const ok = bothRefs.every((r) => out[r].import_ok && out[r].import_sentinel_hits === 0 && out[r].pollOnce_sentinel_hit);
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: out, provenance: { master: provenanceFor('master', RUNTIME.map((f) => 'scripts/factory-runner/' + f)), p1: provenanceFor('p1', RUNTIME.map((f) => 'scripts/factory-runner/' + f)) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('DIR-02 no persistent Director: no launcher/loop/scheduled task on any pinned ref', async () => {
  const rec = await R.check('DIR-02', { claim: 'FOUNDER_POKE_NOT_REQUIRED for the Factory: a continuously running Director/dispatcher exists (scheduled task, loop, cron, service)', expect: 'ABSENT', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of bothRefs) {
      const wt = worktree(ref).path;
      const g = (pattern, paths) => spawnSync('git', ['grep', '-n', '-E', pattern, worktree(ref).sha, '--', ...paths], { cwd: wt, encoding: 'utf8', windowsHide: true }).stdout.trim().split('\n').filter(Boolean);
      out[ref] = {
        loop_or_timer_in_factory_runner: g('setInterval\\(|while\\s*\\(\\s*true|schtasks|Register-ScheduledTask|pm2|systemd|crontab', ['scripts/factory-runner', '.github/workflows', 'scripts/release-broker']).filter((l) => !/\.test\.|\.mutation\./.test(l)).map((l) => l.slice(0, 180)),
        repo_wide_scheduler_for_factory: g('factory-runner/(supervisor|poll-and-dispatch|scheduler)\\.mjs', ['.']).filter((l) => !/scripts\/factory-runner\/|qa\/KNOWN_FAILURE_MODES|docs\/software-factory|\.md:/.test(l)).map((l) => l.slice(0, 180)),
        self_described_manual: [...anchorsIn(ref, 'scripts/factory-runner/poll-and-dispatch.mjs', /manually-invoked poll|not a continuously-running daemon/i), ...anchorsIn(ref, 'scripts/factory-runner/scheduler.mjs', /Manually-invoked poll|not a continuously-running daemon/i)],
        supervisor_single_shot_entry: anchorsIn(ref, 'scripts/factory-runner/supervisor.mjs', /pollOnce\(supervisorId, sha\)/),
        poke_literal_hits: g('FOUNDER_POKE|founder_poke', ['.']).filter((l) => !/bespoke/i.test(l)).length,
      };
    }
    const absent = bothRefs.every((r) => out[r].loop_or_timer_in_factory_runner.length === 0 && out[r].repo_wide_scheduler_for_factory.length === 0 && out[r].self_described_manual.length >= 2 && out[r].poke_literal_hits === 0);
    return { verdict: absent ? 'ABSENT' : 'PARTIAL', evidence: out, provenance: { master: provenanceFor('master', ['scripts/factory-runner/poll-and-dispatch.mjs', 'scripts/factory-runner/scheduler.mjs', 'scripts/factory-runner/supervisor.mjs']), p1: provenanceFor('p1', ['scripts/factory-runner/poll-and-dispatch.mjs', 'scripts/factory-runner/scheduler.mjs', 'scripts/factory-runner/supervisor.mjs']) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('DIR-03 host-bound runtime: hardcoded Home-PC REPO_ROOT on both refs; path absent here', async () => {
  const rec = await R.check('DIR-03', { claim: 'The Factory runtime is computer-agnostic (no machine-specific path or identity in the runtime)', expect: 'FAIL', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of bothRefs) {
      out[ref] = {};
      for (const f of RUNTIME) {
        const rel = 'scripts/factory-runner/' + f;
        if (!pinnedExists(ref, rel)) continue;
        const hits = anchorsIn(ref, rel, /REPO_ROOT\s*=\s*'C:\\\\Users\\\\Dell|Users\\\\Dell\\\\dev|Users\/Dell\/dev/).filter((a) => !/^\/\//.test(a.text));
        if (hits.length) out[ref][rel] = { blob_sha: provenanceFor(ref, [rel]).blob_shas[rel], anchors: hits };
      }
    }
    const homePath = 'C:\\Users\\Dell\\dev\\brain-os';
    const present = bothRefs.every((r) => Object.keys(out[r]).length > 0);
    return { verdict: present ? 'FAIL' : 'PASS', evidence: { per_ref: out, home_pc_path: homePath, path_exists_on_this_machine: existsSync(homePath), same_blob_on_both_refs: Object.fromEntries(RUNTIME.map((f) => ['scripts/factory-runner/' + f, sameBlobOnBothRefs('scripts/factory-runner/' + f)])) }, provenance: { master: provenanceFor('master', Object.keys(out.master)), p1: provenanceFor('p1', Object.keys(out.p1)) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

let h;
test('DIR-00 disposable engine ready', async () => {
  h = await openFactoryDb({ refKey: 'p1' });
  await seedIdentities(h);
  await seedFactory(h);
  const rec = await R.check('DIR-00', { claim: 'PGlite engine with the full pinned migration chain and seeded synthetic identities', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => ({ verdict: h.migration_chain_complete ? 'PASS' : 'NO_VERDICT', no_verdict_reason: h.migration_chain_complete ? null : 'MIGRATION_CHAIN_INCOMPLETE', evidence: { engine: h.engine, version: h.version, applied: h.applied.length, failed: h.failed_migrations, security_label: h.security_label }, provenance: provenanceFor('p1', ['qa/dbtest/db.mjs', 'qa/dbtest/bootstrap.sql'], 'LOCAL_DB_CONTRACT') }));
  assert.equal(rec.verdict, 'PASS');
});

for (const [id, file, claim] of [
  ['DIR-04', 'qa/scenarios-runner/create_factory_work_order_adversarial.sql', 'create_factory_work_order refuses cross-company goal association (2026-08-29 incident regression)'],
  ['DIR-05', 'qa/scenarios-runner/create_factory_task_adversarial.sql', 'create_factory_task derives company server-side and refuses mismatches'],
  ['DIR-06', 'qa/scenarios-runner/complete_work_order_lifecycle.sql', 'complete_work_order is idempotent, requires verified commits, refuses running/failed/unverified state'],
  ['DIR-07', 'qa/scenarios-runner/complete_agent_run_lifecycle.sql', 'complete_agent_run is founder/admin-only, idempotent, propagates to the task'],
]) {
  test(id + ' cross-check rerun of Home-PC suite ' + file.split('/').pop(), async () => {
    const rec = await R.check(id, { claim, expect: 'PASS', method: 'PGLITE_SUITE_RERUN', evidence_kind: 'cross-check' }, async () => {
      // the Home-PC task suite hardcodes a production Work Order id; seed a synthetic row under that id so the suite's fixture dependency is satisfied locally
      await asSuperuser(h);
      await h.exec(`insert into public.companies (id, name, status) values ('4e4a0553-4069-4367-960e-d671e0025fcd', 'QA synthetic stand-in for the production company id the suite hardcodes', 'active') on conflict (id) do nothing;
        insert into public.canonical_work_orders (id, company_id, title, status, work_type) values ('91f6ac74-f738-4fb5-9d46-01c426a31e12', '4e4a0553-4069-4367-960e-d671e0025fcd', 'synthetic stand-in for the production WO id the suite hardcodes', 'queued', 'software_development') on conflict (id) do nothing;`);
      const r = await runSqlSuite(h, file, 'master');
      const failedKeys = r.verdict && typeof r.verdict === 'object' ? Object.entries(r.verdict).filter(([k, v]) => k !== 'all_pass' && (v === false || v === 'false')).map(([k]) => k) : [];
      return { verdict: r.error ? 'NO_VERDICT' : (r.all_pass ? 'PASS' : 'FAIL'), no_verdict_reason: r.error ? 'SUITE_ERROR' : null, evidence: { verdict_object: r.verdict, failed_keys: failedKeys, error: r.error, persona_fidelity: r.persona_fidelity, security_label: h.security_label }, provenance: provenanceFor('master', [file], 'LOCAL_DB_CONTRACT') };
    });
    assert.ok(rec.verdict !== 'NO_VERDICT' || rec.no_verdict_reason === 'SUITE_ERROR', rec.harness_error);
  });
}

test('DIR-08 scheduler pure functions: dependency gating, permanent block, capability-only agent selection', async () => {
  const rec = await R.check('DIR-08', { claim: 'A blocked task does not halt unrelated ready tasks; a rejected dependency permanently blocks dependents; agent selection is capability-only', expect: 'PASS', method: 'PURE_FN', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of bothRefs) {
      const s = await import(pathToFileURL(pinnedPath(ref, 'scripts/factory-runner/scheduler.mjs')).href + '?ref=' + ref);
      const tasks = [
        { id: 't1', status: 'done', depends_on: [], created_at: '2026-09-14T00:00:00Z', required_capabilities: ['db'] },
        { id: 't2', status: 'queued', depends_on: ['t1'], created_at: '2026-09-14T00:00:01Z', required_capabilities: ['web'] },
        { id: 't3', status: 'queued', depends_on: ['t9'], created_at: '2026-09-14T00:00:02Z', required_capabilities: ['web'] },
        { id: 't4', status: 'queued', depends_on: [], created_at: '2026-09-14T00:00:03Z', required_capabilities: ['verify'] },
        { id: 't9', status: 'rejected', depends_on: [], created_at: '2026-09-14T00:00:00Z', required_capabilities: ['db'] },
      ];
      const byId = new Map(tasks.map((t) => [t.id, t.status]));
      const ready = tasks.filter((t) => t.status === 'queued' && s.isTaskReady(t, byId)).map((t) => t.id);
      const blocked = tasks.filter((t) => t.status === 'queued' && s.isTaskPermanentlyBlocked(t, byId)).map((t) => t.id);
      const dispatch = s.selectTasksToDispatch(tasks, 5).map((t) => t.id);
      const pick = s.selectAgentForTask(['verify'], [{ id: 'A', capabilities: ['verify'], activeRunCount: 0 }, { id: 'B', capabilities: ['web'], activeRunCount: 0 }]);
      out[ref] = { ready, blocked, dispatch, pick_id: pick && pick.id, selectAgentForTask_param_count: s.selectAgentForTask.length };
    }
    const ok = bothRefs.every((r) => JSON.stringify([...out[r].ready].sort()) === '["t2","t4"]' && JSON.stringify(out[r].blocked) === '["t3"]' && out[r].dispatch.includes('t2') && out[r].dispatch.includes('t4') && !out[r].dispatch.includes('t3') && out[r].pick_id === 'A');
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: { ...out, note: 'task-level only; WO-level "progress around BLOCKED - DB PUSH" exists as prose in brain-os-factory-director.md and is not enforced by code' }, provenance: { master: provenanceFor('master', ['scripts/factory-runner/scheduler.mjs']), p1: provenanceFor('p1', ['scripts/factory-runner/scheduler.mjs']) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('DIR-09 Work-Order duplicate-dispatch invariant: nothing in the schema prevents two active runs for one Work Order', async () => {
  const rec = await R.check('DIR-09', { claim: 'Duplicate run prevention for Work-Order dispatch is structural (a second active run for the same canonical_work_order_id is impossible)', expect: 'FAIL', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    await asSuperuser(h);
    const wo = 'aaaaaaaa-0000-4000-8000-00000000aa02';
    await h.exec(`insert into public.canonical_work_orders (id, company_id, title, status, work_type) values ('${wo}', 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d', 'dup probe', 'queued', 'software_development') on conflict (id) do nothing;`);
    // Two DISTINCT provider runs for the same Work Order - the real Work-Order invariant, not provider_run_id uniqueness.
    const a = await attempt(h, `insert into public.agent_runs (agent_id, canonical_work_order_id, company_id, execution_provider, provider_run_id, status, started_at) values ('33123660-2f38-4290-8de7-35b8f696247a', '${wo}', 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d', 'claude_code_background', 'run-dup-A', 'in_progress', now()) returning id`);
    const b = await attempt(h, `insert into public.agent_runs (agent_id, canonical_work_order_id, company_id, execution_provider, provider_run_id, status, started_at) values ('33123660-2f38-4290-8de7-35b8f696247a', '${wo}', 'ed8ae510-ddbc-4be6-9d9e-d1f725b1381d', 'claude_code_background', 'run-dup-B', 'in_progress', now()) returning id`);
    const active = (await h.query(`select count(*)::int c from public.agent_runs where canonical_work_order_id = '${wo}' and status = 'in_progress'`)).rows[0].c;
    const idx = (await h.query(`select indexname, indexdef from pg_indexes where schemaname='public' and tablename='agent_runs'`)).rows;
    const trg = (await h.query(`select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname = 'agent_runs' and not t.tgisinternal`)).rows.map((r) => r.tgname);
    const dedupe = { master: anchorsIn('master', 'scripts/factory-runner/poll-and-dispatch.mjs', /not exists \(select 1 from public\.agent_runs/), p1: anchorsIn('p1', 'scripts/factory-runner/poll-and-dispatch.mjs', /not exists \(select 1 from public\.agent_runs/) };
    await h.exec(`delete from public.agent_runs where canonical_work_order_id = '${wo}'; delete from public.canonical_work_orders where id = '${wo}';`);
    const bothInserted = a.ok && b.ok && active === 2;
    return { verdict: bothInserted ? 'FAIL' : 'PASS', evidence: { first_insert: a.ok, second_active_run_same_work_order: b.ok, active_runs_for_work_order: active, unique_indexes_on_agent_runs: idx.filter((i) => /UNIQUE/i.test(i.indexdef)).map((i) => i.indexname), triggers_on_agent_runs: trg, poll_dedupe_anchor: dedupe, note: 'poll-and-dispatch.mjs dedupes with a non-atomic NOT EXISTS then INSERT (TOCTOU); the schema has no partial unique index on (canonical_work_order_id) where status in progress and no trigger refusing a second active run' }, provenance: { master: provenanceFor('master', ['supabase/migrations/202608290002_canonical_work_order_model.sql', 'scripts/factory-runner/poll-and-dispatch.mjs'], 'LOCAL_DB_CONTRACT'), p1: provenanceFor('p1', ['scripts/factory-runner/poll-and-dispatch.mjs'], 'SOURCE_FINDING_ONLY') } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('DIR-10 detached execution exists only for the isolated verifier shell path', async () => {
  const rec = await R.check('DIR-10', { claim: 'The Factory runtime detaches from its launching session (survives an interactive Claude session ending)', expect: 'PARTIAL', method: 'SHELL_REVIEW', evidence_kind: 'independent' }, async () => {
    const out = {};
    const files = ['scripts/factory-runner/dispatch-isolated-verifier.sh', 'scripts/factory-runner/verifier-watchdog.sh', 'scripts/factory-runner/watch-verifier-artifacts.sh'];
    for (const ref of bothRefs) {
      out[ref] = {};
      for (const f of files) out[ref][f] = pinnedExists(ref, f) ? { nohup_detach: anchorsIn(ref, f, /^nohup /).length, artifact_terminal_detection: anchorsIn(ref, f, /Verdict:|known_failure_modes_entry/).length, sha_pin_abort: anchorsIn(ref, f, /sha256|ABORT|Stopping/).length } : 'ABSENT';
      out[ref].supervisor_launcher = anchorsIn(ref, 'scripts/factory-runner/supervisor.mjs', /cron|schtasks|Register-ScheduledTask|setInterval/).filter((a) => !/^\s*(\/\/|\*|\/\*)/.test(a.text)).length;
    }
    const partial = out.master[files[0]] !== 'ABSENT' && out.master[files[0]].nohup_detach >= 1 && bothRefs.every((r) => out[r].supervisor_launcher === 0);
    return { verdict: partial ? 'PARTIAL' : 'FAIL', evidence: { ...out, note: 'only the isolated-verifier shell path detaches (nohup); supervisor.mjs pollOnce has no launcher; artifact-based completion detection exists only in watch-verifier-artifacts.sh' }, provenance: { master: provenanceFor('master', [...files, 'scripts/factory-runner/supervisor.mjs']), p1: provenanceFor('p1', [...files.filter((f) => pinnedExists('p1', f)), 'scripts/factory-runner/supervisor.mjs']) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('DIR-11 restart/resume contract: cross-check of the pinned supervisor/scheduler/provider unit suites', async () => {
  const rec = await R.check('DIR-11', { claim: 'planResume / computeRetryAfter / safeWorktree / dispatch selection invariants hold as the Home PC pinned them', expect: 'PASS', method: 'NODE_TEST_RERUN', evidence_kind: 'cross-check' }, async () => {
    const out = {};
    for (const ref of bothRefs) {
      const wt = worktree(ref).path;
      const files = ['scripts/factory-runner/supervisor.regression.test.mjs', 'scripts/factory-runner/scheduler.regression.test.mjs', 'scripts/factory-runner/provider.regression.test.mjs', 'scripts/factory-runner/supervisor.injection.test.mjs'].filter((f) => pinnedExists(ref, f));
      const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: wt, encoding: 'utf8', windowsHide: true, env: scrubEnv, timeout: 180000 });
      const tap = r.stdout.split(/\r?\n/).filter((l) => /^(ok|not ok) \d+ - /.test(l));
      out[ref] = { files, ok: tap.filter((l) => l.startsWith('ok')).length, not_ok: tap.filter((l) => l.startsWith('not ok')).map((l) => l.slice(0, 160)), exit: r.status, stderr_excerpt: r.stderr.slice(0, 300) };
    }
    const ok = bothRefs.every((r) => out[r].exit === 0 && out[r].not_ok.length === 0 && out[r].ok > 0);
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: out, provenance: { master: provenanceFor('master', out.master.files), p1: provenanceFor('p1', out.p1.files) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('close', async () => { if (h) await h.close(); });

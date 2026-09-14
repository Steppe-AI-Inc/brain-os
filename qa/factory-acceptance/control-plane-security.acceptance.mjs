// Factory control-plane security audit (founder section 3) - security acceptance, not implementation.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { pinRefs, readPinned, anchorsIn, provenanceFor, pinnedPath, pinnedExists, worktree } from './lib/provenance.mjs';
import { suiteRecorder } from './lib/record.mjs';
import { openFactoryDb, seedIdentities, seedFactory, runSqlSuite, asSuperuser, asPersona, attempt, founderClaims, managerClaims, employeeClaims, IDS } from './lib/pglite-factory.mjs';

const R = suiteRecorder('control-plane-security');
pinRefs();
const RUNTIME = ['complete-run.mjs', 'dispatch-task.mjs', 'plugin-attach.mjs', 'plugin-sync.mjs', 'poll-and-dispatch.mjs', 'poll-plugin-operations.mjs', 'provider.mjs', 'register-worker.mjs', 'scheduler.mjs', 'supervisor.mjs', 'sync-agents.mjs'];
const bothRefs = ['master', 'p1'];
const dbmjsRel = 'scripts/factory-runner/db.mjs';
const childEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: '', SUPABASE_DB_URL: '', DATABASE_URL: '', FACTORY_RUNNER_PG_URL: '' };
delete childEnv.NODE_TEST_CONTEXT;
after(() => { console.log('wrote', R.write()); });

test('CPS-01 FACTORY_RUNNER_PG_URL is the only environment variable db.mjs reads', async () => {
  const rec = await R.check('CPS-01', { claim: 'The factory accessor connects only through an explicit FACTORY_RUNNER_PG_URL', expect: 'PASS', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of bothRefs) {
      if (!pinnedExists(ref, dbmjsRel)) { out[ref] = 'ABSENT'; continue; }
      const src = readPinned(ref, dbmjsRel);
      const envs = [...new Set((src.match(/process\.env\.([A-Z0-9_]+)/g) || []).map((m) => m.replace('process.env.', '')))];
      out[ref] = { env_vars_read: envs, blob: provenanceFor(ref, [dbmjsRel]).blob_shas[dbmjsRel] };
    }
    const ok = bothRefs.every((r) => out[r] !== 'ABSENT' && JSON.stringify(out[r].env_vars_read) === '["FACTORY_RUNNER_PG_URL"]');
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: out, provenance: { master: provenanceFor('master', [dbmjsRel]), p1: provenanceFor('p1', [dbmjsRel]) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

async function loadDbMjs(ref, env) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; if (v === null) delete process.env[k]; else process.env[k] = v; }
  const mod = await import(pathToFileURL(pinnedPath(ref, dbmjsRel)).href + '?scenario=' + encodeURIComponent(JSON.stringify(env)) + '&t=' + Date.now() + Math.random());
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  return mod;
}
async function refusal(fn) { try { await fn(); return { threw: false }; } catch (e) { return { threw: true, name: e.name, message: String(e.message).slice(0, 200) }; } }

test('CPS-02 absent URL fails closed; ambient SUPABASE_ACCESS_TOKEN / SUPABASE_DB_URL / DATABASE_URL / PG* cannot be borrowed by db.mjs', async () => {
  const rec = await R.check('CPS-02', { claim: 'With FACTORY_RUNNER_PG_URL unset, read()/write()/transaction() refuse before any connection even when ambient credentials are present in the environment', expect: 'PASS', method: 'PURE_FN', evidence_kind: 'independent' }, async () => {
    const ambient = { FACTORY_RUNNER_PG_URL: null, SUPABASE_ACCESS_TOKEN: 'sbp_synthetic_not_a_token', SUPABASE_DB_URL: 'postgres://postgres:x@db.example.invalid:5432/postgres', DATABASE_URL: 'postgres://postgres:x@db.example.invalid:5432/postgres', PGHOST: 'db.example.invalid', PGUSER: 'postgres', PGPASSWORD: 'x' };
    const out = {};
    for (const ref of bothRefs) {
      const m = await loadDbMjs(ref, ambient);
      out[ref] = { read: await refusal(() => m.read('select 1')), write: await refusal(() => m.write('insert into t values (1)')), transaction: await refusal(() => m.transaction(['select 1'])), exported_url_value: m.FACTORY_RUNNER_PG_URL };
    }
    const ok = bothRefs.every((r) => ['read', 'write', 'transaction'].every((k) => out[r][k].threw && out[r][k].name === 'FactoryDbRefusal' && /FACTORY_RUNNER_PG_URL is not set/.test(out[r][k].message)) && out[r].exported_url_value === '');
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: out, provenance: { master: provenanceFor('master', [dbmjsRel]), p1: provenanceFor('p1', [dbmjsRel]) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('CPS-03 superuser/admin rejection: named identities refused; unnamed superusers, service_role, SET SESSION AUTHORIZATION and search_path are not', async () => {
  const rec = await R.check('CPS-03', { claim: 'db.mjs rejects superuser/admin connections and role-escalation statements', expect: 'PARTIAL', method: 'PURE_FN', evidence_kind: 'independent' }, async () => {
    const urls = { postgres: 'postgres://postgres:x@127.0.0.1:1/x', supabase_admin: 'postgres://supabase_admin:x@127.0.0.1:1/x', pooler_postgres_ref: 'postgres://postgres.pvphxgrtdfrudejjhzjk:x@127.0.0.1:1/x', encoded_postgres: 'postgres://%70ostgres:x@127.0.0.1:1/x', upper_POSTGRES: 'postgres://POSTGRES:x@127.0.0.1:1/x', service_role: 'postgres://service_role:x@127.0.0.1:1/x', custom_superuser: 'postgres://qa_superuser_other:x@127.0.0.1:1/x', least_priv: 'postgres://factory_runner:x@127.0.0.1:1/x' };
    const out = {};
    for (const ref of bothRefs) {
      out[ref] = { url_refusals: {}, statement_classes: {} };
      for (const [k, u] of Object.entries(urls)) {
        const m = await loadDbMjs(ref, { FACTORY_RUNNER_PG_URL: u });
        const r = await refusal(() => m.read('select 1'));
        out[ref].url_refusals[k] = r.threw && /superuser/i.test(r.message) ? 'REFUSED_SUPERUSER' : (r.threw && /ECONNREFUSED/.test(r.message) ? 'ACCEPTED_ATTEMPTED_CONNECT' : (r.threw ? 'FAILED_OTHER: ' + r.message.slice(0, 60) : 'ACCEPTED'));
      }
      const m = await loadDbMjs(ref, { FACTORY_RUNNER_PG_URL: null });
      for (const [k, sql] of Object.entries({ set_role: 'set role postgres', set_session_authorization: 'set session authorization postgres', set_search_path: 'set search_path to public, pg_temp', grant: 'grant all on t to x', ddl_create: 'create table t(x int)', supabase_migrations: 'insert into supabase_migrations.schema_migrations values (1)', pg_terminate: 'select pg_terminate_backend(1)', security_definer: 'create function f() returns void language sql security definer as $$ select 1 $$' })) out[ref].statement_classes[k] = m.classifyStatement(sql);
    }
    const named = (r) => ['postgres', 'supabase_admin', 'pooler_postgres_ref'].every((k) => out[r].url_refusals[k] === 'REFUSED_SUPERUSER');
    const gaps = (r) => ['service_role', 'custom_superuser', 'upper_POSTGRES', 'encoded_postgres'].filter((k) => out[r].url_refusals[k] !== 'REFUSED_SUPERUSER').map((k) => 'url:' + k).concat(['set_session_authorization', 'set_search_path'].filter((k) => out[r].statement_classes[k] === null).map((k) => 'statement:' + k));
    const allNamed = bothRefs.every(named);
    const anyGap = bothRefs.some((r) => gaps(r).length > 0);
    return { verdict: allNamed && anyGap ? 'PARTIAL' : (allNamed ? 'PASS' : 'FAIL'), evidence: { ...out, gaps: Object.fromEntries(bothRefs.map((r) => [r, gaps(r)])), note: 'username-string check only; no server-side role verification (current_user/rolsuper) exists in db.mjs' }, provenance: { master: provenanceFor('master', [dbmjsRel]), p1: provenanceFor('p1', [dbmjsRel]) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('CPS-04 the runtime scripts still borrow the ambient CLI credential on BOTH refs (independent count + Home-PC inventory cross-check)', async () => {
  const rec = await R.check('CPS-04', { claim: 'Generic Factory node has zero production-write authority: no runtime script reaches the DB through `supabase db query --linked`', expect: 'FAIL', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of bothRefs) {
      out[ref] = { linked_call_sites: {}, db_mjs_call_sites: 0 };
      for (const f of RUNTIME) {
        const rel = 'scripts/factory-runner/' + f;
        if (!pinnedExists(ref, rel)) continue;
        const code = readPinned(ref, rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const linked = (code.match(/'supabase',\s*'db',\s*'query',\s*'--linked'/g) || []).length;
        if (/from ['"]\.\/db\.mjs['"]/.test(code)) out[ref].db_mjs_call_sites++;
        if (linked) out[ref].linked_call_sites[rel] = { count: linked, blob_sha: provenanceFor(ref, [rel]).blob_shas[rel], anchors: anchorsIn(ref, rel, /'supabase', 'db', 'query', '--linked'/).map((a) => a.line) };
      }
      const inv = 'qa/scenarios-runner/factory_production_write_inventory.regression.test.mjs';
      if (pinnedExists(ref, inv)) {
        const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', inv], { cwd: worktree(ref).path, encoding: 'utf8', windowsHide: true, timeout: 120000, env: childEnv });
        out[ref].home_pc_inventory_crosscheck = { exit: r.status, not_ok: r.stdout.split(/\r?\n/).filter((l) => /^not ok/.test(l)).map((l) => l.slice(0, 160)), production_write_rows: (r.stdout.match(/PRODUCTION_WRITE\s+\S+/g) || []).map((s) => s.trim()) };
      } else out[ref].home_pc_inventory_crosscheck = 'INVENTORY_TEST_ABSENT_ON_THIS_REF';
    }
    const violating = bothRefs.every((r) => Object.keys(out[r].linked_call_sites).length >= 10 && out[r].db_mjs_call_sites === 0);
    return { verdict: violating ? 'FAIL' : 'PARTIAL', evidence: out, provenance: { master: provenanceFor('master', Object.keys(out.master.linked_call_sites)), p1: provenanceFor('p1', Object.keys(out.p1.linked_call_sites)) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

let h;
test('CPS-00 disposable engine', async () => {
  h = await openFactoryDb({ refKey: 'p1' });
  await seedIdentities(h); await seedFactory(h);
  const rec = await R.check('CPS-00', { claim: 'PGlite engine ready with full chain; persona enforcement self-checked', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    const sc = await h.dbmod.securitySelfCheck(h.db, 'authenticated');
    return { verdict: h.migration_chain_complete && sc.ok ? 'PASS' : 'NO_VERDICT', evidence: { engine: h.engine, version: h.version, self_check: { session_user: sc.session_user, current_user: sc.current_user, forbidden_op_sqlstate: sc.forbidden_op_sqlstate }, security_label: h.security_label }, provenance: provenanceFor('p1', ['qa/dbtest/db.mjs'], 'LOCAL_DB_CONTRACT') };
  });
  assert.equal(rec.verdict, 'PASS');
});

const RUN = 'dddd0000-0000-4000-8000-00000000000d';
async function resetRun() {
  await asSuperuser(h);
  await h.exec(`delete from public.agent_runs where id = '${RUN}';
    insert into public.agent_runs (id, status, blocked_at, retry_after, attempt_count, source_sha, blocked_reason, agent_id, canonical_work_order_id, company_id, execution_provider)
    values ('${RUN}', 'blocked', now() - interval '1 hour', now() - interval '1 minute', 1, 'abc1234', 'PROVIDER_CAPACITY_BLOCKED: test', '33123660-2f38-4290-8de7-35b8f696247a', 'aaaaaaaa-0000-4000-8000-00000000aa01', '${IDS.COMPANY}', 'claude_code_background');`);
}

test('CPS-05 claim RPC authority matrix: reachable only by superuser transport (machine trust), not by any API role - including the founder', async () => {
  const rec = await R.check('CPS-05', { claim: 'claim_blocked_run_for_retry authority derives from role/capability rather than transport identity; least-privilege callers are denied for the right reason', expect: 'PARTIAL', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    const claimSql = (who) => `select id from public.claim_blocked_run_for_retry('${who}', 6, interval '30 minutes')`;
    const out = {};
    await resetRun(); out.as_postgres_superuser = await attempt(h, claimSql('sup-postgres'));
    await resetRun(); let leave = await asPersona(h, employeeClaims(), 'authenticated'); out.as_employee_authenticated = await attempt(h, claimSql('sup-emp')); await leave();
    await resetRun(); leave = await asPersona(h, managerClaims(), 'authenticated'); out.as_manager_authenticated = await attempt(h, claimSql('sup-mgr')); await leave();
    await resetRun(); leave = await asPersona(h, founderClaims(), 'authenticated'); out.as_founder_authenticated = await attempt(h, claimSql('sup-founder')); await leave();
    await resetRun(); leave = await asPersona(h, {}, 'anon'); out.as_anon = await attempt(h, claimSql('sup-anon')); await leave();
    await asSuperuser(h);
    await h.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'qa_superuser_other') then create role qa_superuser_other superuser login; end if; end $$;`);
    await resetRun(); await h.exec('set session authorization qa_superuser_other;'); out.as_unnamed_superuser = await attempt(h, claimSql('sup-other')); await asSuperuser(h);
    await resetRun(); await h.exec('set session authorization supabase_admin;'); out.as_supabase_admin = await attempt(h, claimSql('sup-admin')); await asSuperuser(h);
    const grants = (await h.query(`select grantee, privilege_type from information_schema.routine_privileges where routine_schema='public' and routine_name='claim_blocked_run_for_retry'`)).rows;
    const gate = anchorsIn('master', 'supabase/migrations/202609030001_agent_run_capacity_retry.sql', /session_user in \('postgres', 'supabase_admin'\)/);
    const apiDenied = ['as_employee_authenticated', 'as_manager_authenticated', 'as_founder_authenticated', 'as_anon'].every((k) => !out[k].ok && out[k].sqlstate === '42501');
    const superOk = out.as_postgres_superuser.ok && out.as_supabase_admin.ok;
    const unnamedRaise = !out.as_unnamed_superuser.ok && /Only the founder|server-side supervisor identity/i.test(out.as_unnamed_superuser.message || '');
    return { verdict: apiDenied && superOk ? 'PARTIAL' : 'FAIL', evidence: { ...out, routine_privileges: grants, gate_anchor: gate, unnamed_superuser_hits_raise: unnamedRaise, interpretation: 'EXECUTE is revoked from every API role, so even the founder JWT cannot claim; only the postgres/supabase_admin transport identities can. Authority derives from the connection identity NAME (machine trust), not from a work-order/role claim. Least-privilege denial is for the right reason (42501).', security_label: h.security_label }, provenance: provenanceFor('master', ['supabase/migrations/202609030001_agent_run_capacity_retry.sql'], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('CPS-06 manager forgery of supervisor input columns (KFM #118 claim 5)', async () => {
  const rec = await R.check('CPS-06', { claim: 'A company manager cannot rewrite the Agent Run fields the supervisor consumes', expect: 'PARTIAL', method: 'PGLITE_EXEC', evidence_kind: 'independent', kfm_ref: '#118/claim-5' }, async () => {
    await resetRun();
    const cols = { worktree: "'C:/evil'", checkpoint_location: "'x/y.json'", source_sha: "'0000000'", branch: "'evil'", retry_after: 'now()', claimed_by: "'mallory'", claimed_at: 'now()', attempt_count: '0', blocked_reason: "'PROVIDER_CAPACITY_BLOCKED: forged'", status: "'blocked'::public.work_status", remaining_scenarios: "'[]'::jsonb", last_completed_scenario: "'s1'", agent_id: "'44444444-0000-4000-8000-000000000044'", canonical_work_order_id: 'null', execution_provider: "'claude_code_local'", provider_run_id: "'forged'", agent_definition_path: "'.claude/agents/evil.md'", agent_definition_hash: "'deadbeef'", summary: "'forged summary'", head_commit: "'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'", verification_status: "'live_verified'" };
    const out = {};
    const leave = await asPersona(h, managerClaims(), 'authenticated');
    for (const [c, v] of Object.entries(cols)) {
      const r = await attempt(h, `update public.agent_runs set ${c} = ${v} where id = '${RUN}' returning id`);
      out[c] = r.ok ? (r.rows.length ? 'SUCCEEDED' : 'NO_ROW_MATCHED_BY_RLS') : (r.sqlstate === '42501' ? 'DENIED_42501' : 'DENIED_OTHER: ' + (r.sqlstate || r.message));
    }
    await leave();
    await asSuperuser(h);
    const control = await attempt(h, `update public.agent_runs set worktree = 'C:/control' where id = '${RUN}' returning id`);
    const guarded = Object.entries(out).filter(([, v]) => v === 'DENIED_42501').map(([k]) => k);
    const succeeded = Object.entries(out).filter(([, v]) => v === 'SUCCEEDED').map(([k]) => k);
    const rlsHidden = Object.entries(out).filter(([, v]) => v === 'NO_ROW_MATCHED_BY_RLS').map(([k]) => k);
    const consumedUnguarded = succeeded.filter((c) => ['status', 'execution_provider', 'provider_run_id', 'agent_definition_path', 'agent_definition_hash', 'head_commit', 'summary', 'verification_status'].includes(c));
    const certificationForgeable = succeeded.includes('verification_status') && succeeded.includes('head_commit');
    return { verdict: control.ok && guarded.length >= 10 && succeeded.length === 0 ? 'PASS' : (guarded.length >= 10 ? 'PARTIAL' : 'FAIL'), evidence: { per_column: out, guarded, succeeded, rls_hidden: rlsHidden, consumed_but_unguarded: consumedUnguarded, manager_can_forge_certification_columns: certificationForgeable, control_as_superuser: control.ok, security_label: h.security_label, note: 'PGlite emulation with session_user = qa_authenticator so guard_agent_run_retry_columns is exercised on its real inputs' }, provenance: provenanceFor('master', ['supabase/migrations/202609030001_agent_run_capacity_retry.sql', 'supabase/migrations/202608290002_canonical_work_order_model.sql'], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('CPS-07 control-plane tables are FK-wired into Brain OS business tables; business IDs are not opaque', async () => {
  const rec = await R.check('CPS-07', { claim: 'The control-plane schema does not reference Brain OS business tables; business IDs are opaque references by value', expect: 'FAIL', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    await asSuperuser(h);
    const fks = (await h.query(`select tc.table_name, kcu.column_name, ccu.table_name as ref_table, rc.delete_rule, c.is_nullable
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
      join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
      join information_schema.columns c on c.table_name = tc.table_name and c.column_name = kcu.column_name and c.table_schema = 'public'
      where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public' and tc.table_name in ('canonical_work_orders','agent_runs','tasks','workers','agents') order by 1,2`)).rows;
    const business = new Set(['companies', 'goals', 'people', 'profiles', 'tasks', 'company_memberships', 'departments', 'projects', 'documents', 'approvals']);
    const toBusiness = fks.filter((f) => business.has(f.ref_table));
    const policies = (await h.query(`select tablename, policyname from pg_policies where schemaname='public' and tablename in ('canonical_work_orders','agent_runs') and (qual ilike '%company_memberships%' or qual ilike '%people%' or qual ilike '%has_company_access%' or qual ilike '%is_company_manager%')`)).rows.map((p) => p.tablename + '.' + p.policyname);
    return { verdict: toBusiness.length > 0 ? 'FAIL' : 'PASS', evidence: { fks_to_business_tables: toBusiness, all_fks: fks, rls_policies_joining_business_tables: policies, note: 'canonical_work_orders.company_id is NOT NULL with ON DELETE CASCADE to companies' }, provenance: provenanceFor('master', ['supabase/migrations/202608290002_canonical_work_order_model.sql', 'supabase/migrations/202608310007_factory_workers.sql'], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('CPS-08 ID possession is not authorization: cross-company goal ids are refused (2026-08-29 incident regression)', async () => {
  const rec = await R.check('CPS-08', { claim: 'A caller with real access to company A cannot associate company B objects by supplying their ids', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    await asSuperuser(h);
    const goalB = 'bbbbbbbb-0000-4000-8000-0000000000b1';
    await h.exec(`insert into public.goals (id, company_id, title) values ('${goalB}', '${IDS.COMPANY_B}', 'goal of company B') on conflict (id) do nothing;`);
    const rpcs = (await h.query(`select p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname in ('create_factory_work_order','create_factory_task')`)).rows;
    const sig = (rpcs.find((r) => r.proname === 'create_factory_work_order') || {}).args || '';
    const argNames = sig.split(',').map((s) => s.trim().split(' ')[0]).filter(Boolean);
    const leave = await asPersona(h, managerClaims(), 'authenticated');
    const named = argNames.map((n) => { if (/company/.test(n)) return `${n} => '${IDS.COMPANY}'::uuid`; if (/goal/.test(n)) return `${n} => '${goalB}'::uuid`; if (/title/.test(n)) return `${n} => 'cross-company probe'`; if (/objective|business|description/.test(n)) return `${n} => 'probe'`; if (/work_type|type/.test(n)) return `${n} => 'software_development'`; if (/criteria|jsonb|resources|specialists/.test(n)) return `${n} => '[]'::jsonb`; if (/priority/.test(n)) return `${n} => 'medium'`; if (/risk/.test(n)) return `${n} => 'low'`; return null; }).filter(Boolean);
    const viaRpc = await attempt(h, `select public.create_factory_work_order(${named.join(', ')}) r`);
    await leave();
    await asSuperuser(h);
    const direct = await attempt(h, `insert into public.canonical_work_orders (company_id, goal_id, title, status, work_type) values ('${IDS.COMPANY}', '${goalB}', 'direct bypass', 'queued', 'software_development') returning id`);
    const trigger = (await h.query(`select tgname from pg_trigger where tgname like '%goal_company%'`)).rows.map((t) => t.tgname);
    const rpcText = viaRpc.ok ? JSON.stringify(viaRpc.rows) : (viaRpc.message || '');
    const refusedRpc = !viaRpc.ok ? /company|goal|belong|cross|denied|permission/i.test(rpcText) : /"authorized":false|denied|cross|belong/i.test(rpcText);
    const refusedDirect = !direct.ok && /company|goal|belong/i.test(direct.message || '');
    return { verdict: refusedRpc && refusedDirect ? 'PASS' : (refusedDirect ? 'PARTIAL' : 'FAIL'), evidence: { rpc_signature: sig, rpc_call_args: named, rpc_attempt: viaRpc, direct_insert_as_superuser: direct, trigger_present: trigger, security_label: h.security_label }, provenance: provenanceFor('master', ['supabase/migrations/202608290005_create_factory_work_order_rpc.sql', 'supabase/migrations/202608290006_factory_work_order_cross_company_fix.sql'], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

for (const [id, file, claim, kfm] of [
  ['CPS-09', 'qa/scenarios-runner/factory_rpc_privilege_sweep.sql', 'No factory RPC is granted to anon; founder canonical path works', null],
  ['CPS-10', 'qa/scenarios-runner/agent_run_capacity_retry_claim_security.sql', 'FIRST EXECUTION EVER of the Home-PC claim-security suite (D1-D5)', '#118'],
]) {
  test(id + ' cross-check rerun ' + file.split('/').pop(), async () => {
    const rec = await R.check(id, { claim, expect: id === 'CPS-10' ? 'PARTIAL' : 'PASS', method: 'PGLITE_SUITE_RERUN', evidence_kind: 'cross-check', kfm_ref: kfm }, async () => {
      const r = await runSqlSuite(h, file, 'master');
      const failedKeys = r.verdict && typeof r.verdict === 'object' ? Object.entries(r.verdict).filter(([k, v]) => k !== 'all_pass' && (v === false || v === 'false')).map(([k]) => k) : [];
      const reason = !r.error ? null : (/instance_id/.test(r.error.message || '') ? 'ENGINE_FIXTURE_INCOMPATIBLE: the suite seeds auth.users(instance_id), a column the pinned qa/dbtest bootstrap does not model' : (/expected \(text, integer, interval\)/.test(r.error.message || '') ? 'SUITE_PRECONDITION_DEFECT: the suite compares pg_get_function_identity_arguments (which includes parameter names) with an unnamed signature string, so it aborts against the very migration it tests - on any PostgreSQL' : 'SUITE_ERROR: ' + String(r.error.message || '').slice(0, 160)));
      return { verdict: r.error ? 'NO_VERDICT' : (r.all_pass ? 'PASS' : (failedKeys.length ? 'PARTIAL' : 'FAIL')), no_verdict_reason: reason, evidence: { verdict_object: r.verdict, failed_keys: failedKeys, error: r.error, persona_fidelity: r.persona_fidelity, security_label: h.security_label, note: 'Home-PC suite uses set local role only, so session_user stays postgres inside it; its manager-forgery keys are NOT authoritative on this engine (see CPS-06 for the persona-session version)' }, provenance: provenanceFor('master', [file], 'LOCAL_DB_CONTRACT') };
    });
    assert.ok(rec.verdict !== 'NO_VERDICT' || rec.no_verdict_reason, rec.harness_error);
  });
}

test('CPS-11 complete_agent_run gate: manager denied, founder authorized', async () => {
  const rec = await R.check('CPS-11', { claim: 'complete_agent_run is founder/admin-only', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    await resetRun();
    let leave = await asPersona(h, managerClaims(), 'authenticated');
    const mgr = await attempt(h, `select public.complete_agent_run('${RUN}'::uuid, 'done'::public.work_status, null, null, 'probe') r`);
    await leave();
    leave = await asPersona(h, founderClaims(), 'authenticated');
    const founder = await attempt(h, `select public.complete_agent_run('${RUN}'::uuid, 'done'::public.work_status, null, null, 'probe') r`);
    await leave();
    const mgrAuth = mgr.ok ? JSON.stringify(mgr.rows[0].r) : mgr.message;
    const fAuth = founder.ok ? JSON.stringify(founder.rows[0].r) : founder.message;
    const ok = /"authorized":false/.test(mgrAuth) && /"authorized":true/.test(fAuth);
    return { verdict: ok ? 'PASS' : 'FAIL', evidence: { manager: mgrAuth.slice(0, 300), founder: fAuth.slice(0, 300), security_label: h.security_label }, provenance: provenanceFor('master', ['supabase/migrations/202608290010_agent_run_completion.sql'], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('CPS-12 independent factory RPC privilege sweep: no factory/control-plane function is executable by anon; claim RPC by no API role', async () => {
  const rec = await R.check('CPS-12', { claim: 'No factory RPC grants EXECUTE to anon (independent replacement for the engine-incompatible Home-PC sweep)', expect: 'PASS', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    await asSuperuser(h);
    const fns = (await h.query(`select p.proname, pg_get_function_identity_arguments(p.oid) args,
        has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') authenticated_exec, p.prosecdef security_definer
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype and (p.proname ~ 'factory|agent_run|work_order|claim_blocked|register_worker') order by 1`)).rows;
    const triggerFns = (await h.query(`select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') anon_exec from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prorettype = 'trigger'::regtype and (p.proname ~ 'factory|agent_run|work_order') order by 1`)).rows;
    const anonExec = fns.filter((f) => f.anon_exec).map((f) => f.proname);
    const claimAuth = fns.filter((f) => /^claim_blocked_run/.test(f.proname) && f.authenticated_exec).map((f) => f.proname);
    const canary = (await h.query(`select has_function_privilege('anon', 'public.is_founder_or_admin()', 'EXECUTE') c`)).rows[0].c;
    return { verdict: fns.length > 0 && anonExec.length === 0 && claimAuth.length === 0 ? 'PASS' : (fns.length ? 'FAIL' : 'NO_VERDICT'), evidence: { functions: fns, trigger_functions_default_public_execute_not_directly_callable: triggerFns, anon_executable: anonExec, claim_rpc_authenticated_executable: claimAuth, canary_anon_can_execute_is_founder_or_admin: canary, security_label: h.security_label }, provenance: provenanceFor('master', ['supabase/migrations/202609030001_agent_run_capacity_retry.sql', 'supabase/migrations/202608290005_create_factory_work_order_rpc.sql'], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('close', async () => { if (h) await h.close(); });

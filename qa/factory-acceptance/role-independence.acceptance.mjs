// AUTHORING RUN != CERTIFYING RUN acceptance (founder section 5).
//
// Proven fact to establish (founder correction #2): the current durable model does not
// structurally distinguish or prove an authoring run from a certifying run. Each check observes
// the pinned schema/RPC behaviour on PGlite and applies the acceptance oracle in lib/independence.mjs
// to the evidence the model can actually produce.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { pinRefs, anchorsIn, provenanceFor, pinnedPath, worktree } from './lib/provenance.mjs';
import { suiteRecorder } from './lib/record.mjs';
import { openFactoryDb, seedIdentities, seedFactory, asSuperuser, asPersona, attempt, founderClaims, IDS } from './lib/pglite-factory.mjs';
import { certificationEvidenceSufficient, sufficientExample, CONDITIONS } from './lib/independence.mjs';

const R = suiteRecorder('role-independence');
pinRefs();
after(() => { console.log('wrote', R.write()); });
const COMPLETION_MIG = 'supabase/migrations/202608290010_agent_run_completion.sql';
const WO_MIG = 'supabase/migrations/202608300002_complete_work_order.sql';
const MODEL_MIG = 'supabase/migrations/202608290002_canonical_work_order_model.sql';
const AUTHOR = '33123660-2f38-4290-8de7-35b8f696247a', VERIFIER = '44444444-0000-4000-8000-000000000044';
const WO = 'aaaaaaaa-0000-4000-8000-00000000aa01';
const R1 = 'eeee0000-0000-4000-8000-0000000000e1';
const HEAD = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00';

let h;
test('RI-00 engine + oracle self-consistency', async () => {
  h = await openFactoryDb({ refKey: 'p1' }); await seedIdentities(h); await seedFactory(h);
  const rec = await R.check('RI-00', { claim: 'Oracle accepts the sufficient example and rejects each single-condition violation (detector can fire)', expect: 'PASS', method: 'PURE_FN', evidence_kind: 'independent' }, async () => {
    const { candidate, certifying } = sufficientExample();
    const ok = certificationEvidenceSufficient(candidate, certifying);
    const neg = certificationEvidenceSufficient(candidate, { ...certifying, agent_id: candidate.agent_id, hostname: 'OTHER-HOST' });
    return { verdict: ok.sufficient && !neg.sufficient && neg.unsatisfied.includes('C2_DISTINCT_AGENTS') ? 'PASS' : 'FAIL', evidence: { sufficient_example: ok, different_hostname_same_agent: neg, conditions: Object.keys(CONDITIONS), engine: h.engine }, provenance: provenanceFor('p1', ['qa/dbtest/db.mjs'], 'LOCAL_DB_CONTRACT') };
  });
  assert.equal(rec.verdict, 'PASS');
});

async function seedAuthorRun() {
  await asSuperuser(h);
  await h.exec(`delete from public.agent_runs where canonical_work_order_id = '${WO}';
    insert into public.agent_runs (id, agent_id, canonical_work_order_id, company_id, execution_provider, provider_run_id, status, started_at, finished_at, head_commit, base_commit, worktree, source_sha)
    values ('${R1}', '${AUTHOR}', '${WO}', '${IDS.COMPANY}', 'claude_code_background', 'author-run-1', 'in_progress', now() - interval '20 minutes', null, null, 'aaaa000', 'C:/wt/author', 'aaaa000');`);
}

test('RI-01 no durable authoring-vs-certifying distinction: complete_agent_run accepts a caller-supplied verification_status on the authoring row', async () => {
  const rec = await R.check('RI-01', { claim: 'The durable model distinguishes and proves the run that authored head_commit from the run that certified it', expect: 'FAIL', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    await seedAuthorRun();
    const cols = (await h.query(`select column_name from information_schema.columns where table_schema='public' and table_name in ('agent_runs','canonical_work_orders','tasks') and column_name ~* 'certif|verified_by|verifier|authored_by|attest'`)).rows.map((r) => r.column_name);
    const fnDef = (await h.query(`select pg_get_functiondef('public.complete_agent_run'::regproc) d`)).rows[0].d;
    const fnArgs = (await h.query(`select pg_get_function_identity_arguments('public.complete_agent_run'::regproc) a`)).rows[0].a;
    // canary: the column detector must be able to see such a column
    await h.exec(`create table if not exists public._qa_canary_cert (certifying_run_id uuid);`);
    const canary = (await h.query(`select count(*)::int c from information_schema.columns where table_schema='public' and table_name='_qa_canary_cert' and column_name ~* 'certif'`)).rows[0].c;
    await h.exec('drop table public._qa_canary_cert;');
    const leave = await asPersona(h, founderClaims(), 'authenticated');
    const self = await attempt(h, `select public.complete_agent_run('${R1}'::uuid, 'done'::public.work_status, '${HEAD}', 'live_verified', 'author certifies itself') r`);
    await leave();
    const row = (await h.query(`select status, head_commit, verification_status from public.agent_runs where id='${R1}'`)).rows[0];
    const accepted = self.ok && /"changed":true/.test(JSON.stringify(self.rows[0].r)) && row.verification_status === 'live_verified' && row.head_commit === HEAD;
    const oracle = certificationEvidenceSufficient({ run_id: R1, agent_id: AUTHOR, work_order_id: WO, head_commit: HEAD, context: 'C:/wt/author', finished_at: new Date().toISOString(), hostname: hostname() }, { run_id: R1, agent_id: AUTHOR, work_order_id: WO, base_commit: null, bound_commit: HEAD, context: 'C:/wt/author', started_at: null, capabilities: [], role: 'software_factory', identity_status: 'active', provenance_materialized: false, hostname: hostname() });
    return { verdict: accepted && cols.length === 0 && canary === 1 ? 'FAIL' : (cols.length ? 'PARTIAL' : 'NO_VERDICT'), evidence: { certifying_columns_found: cols, column_detector_canary: canary, complete_agent_run_args: fnArgs, caller_supplied_verification_status: /p_verification_status/.test(fnDef), self_certification_rpc_result: self.ok ? self.rows[0].r : self, row_after: row, oracle_on_what_the_model_can_prove: oracle, statement: 'THE CURRENT MODEL DOES NOT STRUCTURALLY DISTINGUISH OR PROVE AUTHORING RUN VERSUS CERTIFYING RUN: verification_status lives on the Agent Run row; complete_agent_run accepts a caller-supplied status; no certifying-run relation exists.', security_label: h.security_label }, provenance: provenanceFor('master', [COMPLETION_MIG, MODEL_MIG], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('RI-02 complete_work_order consumes the same-row status: a self-certified run satisfies Work-Order completion', async () => {
  const rec = await R.check('RI-02', { claim: 'Work-Order completion requires a certifying run distinct from the authoring run, bound to the certified commit', expect: 'FAIL', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    await asSuperuser(h);
    await h.exec(`insert into public.tasks (id, company_id, title, status, canonical_work_order_id) values ('ffff0000-0000-4000-8000-0000000000f1', '${IDS.COMPANY}', 'task', 'done', '${WO}') on conflict (id) do nothing;`);
    const leave = await asPersona(h, founderClaims(), 'authenticated');
    const done = await attempt(h, `select public.complete_work_order('${WO}'::uuid) r`);
    await leave();
    const woRow = (await h.query(`select status from public.canonical_work_orders where id='${WO}'`)).rows[0];
    const distinct = (await h.query(`select count(distinct agent_id)::int agents, count(*)::int runs from public.agent_runs where canonical_work_order_id='${WO}' and head_commit is not null and verification_status in ('live_verified','e2e_verified')`)).rows[0];
    const sameRow = anchorsIn('master', WO_MIG, /verification_status is distinct from 'live_verified'/);
    const result = done.ok ? done.rows[0].r : null;
    const completed = !!result && (result.changed === true || String(result.changed) === 'true');
    // restore WO for later suites
    await asSuperuser(h);
    return { verdict: completed && distinct.agents === 1 ? 'FAIL' : (completed ? 'PARTIAL' : 'NO_VERDICT'), no_verdict_reason: completed ? null : 'WO_COMPLETION_REFUSED: ' + JSON.stringify(result || done).slice(0, 200), evidence: { complete_work_order_result: result || done, work_order_status: woRow && woRow.status, verified_commit_rows: distinct, same_row_binding_anchor: sameRow, statement: 'complete_work_order binds commit to verification on the SAME agent_runs row and counts one self-certified row as sufficient; it cannot express or require a distinct certifying run.', security_label: h.security_label }, provenance: provenanceFor('master', [WO_MIG], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT' || rec.no_verdict_reason, rec.harness_error);
});

test('RI-03 authority derives from host/transport identity, not from a run/role/provenance claim', async () => {
  const rec = await R.check('RI-03', { claim: 'Factory authority derives from WORK ORDER + AGENT RUN + ROLE/CAPABILITY + PROVENANCE, never from the machine', expect: 'FAIL', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of ['master', 'p1']) {
      const s = await import(pathToFileURL(pinnedPath(ref, 'scripts/factory-runner/supervisor.mjs')).href + '?ri3=' + ref);
      out[ref] = {
        session_user_gates: [...anchorsIn(ref, 'supabase/migrations/202609030001_agent_run_capacity_retry.sql', /session_user in \('postgres', 'supabase_admin'\)/)],
        hardcoded_repo_root: anchorsIn(ref, 'scripts/factory-runner/supervisor.mjs', /REPO_ROOT = 'C:/),
        safeWorktree_foreign_path: typeof s.safeWorktree === 'function' ? s.safeWorktree('D:\\somewhere\\else') : 'NOT_EXPORTED',
        safeWorktree_allowlist_anchor: anchorsIn(ref, 'scripts/factory-runner/supervisor.mjs', /Users\\\\Dell\\\\dev/).slice(0, 3),
        workers_hostname_key: anchorsIn(ref, 'supabase/migrations/202608310007_factory_workers.sql', /hostname text not null unique/),
        machine_identity_columns: spawnSync('git', ['grep', '-n', '-i', '-E', 'machine_id|host_fingerprint|node_identity', worktree(ref).sha, '--', 'supabase/migrations', 'scripts'], { cwd: worktree(ref).path, encoding: 'utf8', windowsHide: true }).stdout.trim().split('\n').filter(Boolean).length,
      };
    }
    const machineTrust = ['master', 'p1'].every((r) => out[r].session_user_gates.length > 0 && out[r].hardcoded_repo_root.length > 0 && out[r].workers_hostname_key.length > 0);
    return { verdict: machineTrust ? 'FAIL' : 'PARTIAL', evidence: { ...out, statement: 'claim/guard authority is granted by transport identity NAME (session_user); the runtime binds to one machine path; the worker registry is keyed by hostname. No run/role/provenance-derived authority exists for these operations.' }, provenance: { master: provenanceFor('master', ['supabase/migrations/202609030001_agent_run_capacity_retry.sql', 'scripts/factory-runner/supervisor.mjs', 'supabase/migrations/202608310007_factory_workers.sql']), p1: provenanceFor('p1', ['supabase/migrations/202609030001_agent_run_capacity_retry.sql', 'scripts/factory-runner/supervisor.mjs', 'supabase/migrations/202608310007_factory_workers.sql']) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('RI-04 certification without provenance is accepted at run level (head_commit null + live_verified)', async () => {
  const rec = await R.check('RI-04', { claim: 'A certification must carry exact candidate provenance; verification_status without a commit is refused', expect: 'FAIL', method: 'PGLITE_EXEC', evidence_kind: 'independent' }, async () => {
    await seedAuthorRun();
    const leave = await asPersona(h, founderClaims(), 'authenticated');
    const r = await attempt(h, `select public.complete_agent_run('${R1}'::uuid, 'done'::public.work_status, null, 'live_verified', 'no provenance') r`);
    await leave();
    const row = (await h.query(`select status, head_commit, verification_status from public.agent_runs where id='${R1}'`)).rows[0];
    const accepted = r.ok && /"changed":true/.test(JSON.stringify(r.rows[0].r)) && row.verification_status === 'live_verified' && row.head_commit === null;
    await asSuperuser(h);
    const leave2 = await asPersona(h, founderClaims(), 'authenticated');
    const wo = await attempt(h, `select public.complete_work_order('${WO}'::uuid) r`);
    await leave2();
    return { verdict: accepted ? 'FAIL' : 'PASS', evidence: { run_level_result: r.ok ? r.rows[0].r : r, row_after: row, wo_level_control: wo.ok ? wo.rows[0].r : wo, note: 'run-level certification with no commit is stored; only the Work-Order gate later notices the missing commit (verification_required_not_found / no verified commit).', security_label: h.security_label }, provenance: provenanceFor('master', [COMPLETION_MIG, WO_MIG], 'LOCAL_DB_CONTRACT') };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('RI-05 same agent can author and verify the same Work Order: selection is capability-only, no run/role linkage', async () => {
  const rec = await R.check('RI-05', { claim: 'An agent holding the authoring run for Work Order X cannot be dispatched as verifier for X', expect: 'ABSENT', method: 'PURE_FN', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of ['master', 'p1']) {
      const s = await import(pathToFileURL(pinnedPath(ref, 'scripts/factory-runner/scheduler.mjs')).href + '?ri5=' + ref);
      const pick = s.selectAgentForTask(['verify'], [{ id: AUTHOR, name: 'author-that-also-verifies', capabilities: ['implement', 'verify'], activeRunCount: 1 }]);
      out[ref] = { picked_author_as_verifier: pick && pick.id === AUTHOR, param_count: s.selectAgentForTask.length, matrix_verify_capability: spawnSync('git', ['grep', '-n', '-E', 'work_order\\.(verify|author)|release\\.certify|agent_run\\.certify', worktree(ref).sha, '--', 'governance'], { cwd: worktree(ref).path, encoding: 'utf8', windowsHide: true }).stdout.trim().split('\n').filter(Boolean).length };
    }
    const absent = ['master', 'p1'].every((r) => out[r].picked_author_as_verifier && out[r].param_count === 2 && out[r].matrix_verify_capability === 0);
    return { verdict: absent ? 'ABSENT' : 'PARTIAL', evidence: out, provenance: { master: provenanceFor('master', ['scripts/factory-runner/scheduler.mjs', 'governance/capabilities/CAPABILITY_MATRIX.yaml']), p1: provenanceFor('p1', ['scripts/factory-runner/scheduler.mjs', 'governance/capabilities/CAPABILITY_MATRIX.yaml']) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('RI-06 the only separation-of-duties rule in the schema is decide_approval (domain-scoped, founder-exempt) - the pattern exists, not for runs', async () => {
  const rec = await R.check('RI-06', { claim: 'A requester-is-not-decider rule exists somewhere in the durable model (proof the platform can express separation of duties)', expect: 'PARTIAL', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of ['master', 'p1']) out[ref] = { decide_approval_rule: anchorsIn(ref, 'supabase/migrations/202608280003_payload_immutability_salary_segregation_audit.sql', /requested_by_profile_id is distinct from v_actor_profile_id/), founder_exempt: anchorsIn(ref, 'supabase/migrations/202608280003_payload_immutability_salary_segregation_audit.sql', /public\.is_founder_or_admin\(\)\s*$/).length > 0 };
    const present = ['master', 'p1'].every((r) => out[r].decide_approval_rule.length > 0);
    return { verdict: present ? 'PARTIAL' : 'ABSENT', evidence: { ...out, note: 'exists for salary_hr/finance approvals only; nothing equivalent exists for agent runs' }, provenance: { master: provenanceFor('master', ['supabase/migrations/202608280003_payload_immutability_salary_segregation_audit.sql']), p1: provenanceFor('p1', ['supabase/migrations/202608280003_payload_immutability_salary_segregation_audit.sql']) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('close', async () => { if (h) await h.close(); });

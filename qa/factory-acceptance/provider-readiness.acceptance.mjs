// Provider architecture / Tier-0 / DeepSeek readiness audit (founder item 7). SOURCE_FINDING_ONLY
// plus one LOCAL_DB_CONTRACT check of the no-silent-fallback constraint. Nothing here dispatches.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pinRefs, anchorsIn, provenanceFor, pinnedExists, readPinned, worktree } from './lib/provenance.mjs';
import { suiteRecorder } from './lib/record.mjs';
import { openFactoryDb, seedIdentities, seedFactory, asSuperuser, attempt, IDS } from './lib/pglite-factory.mjs';

const R = suiteRecorder('provider-readiness');
pinRefs();
after(() => { console.log('wrote', R.write()); });
const bothRefs = ['master', 'p1'];
const PROVIDER = 'scripts/factory-runner/provider.mjs';
const REGISTRY_MIG = 'supabase/migrations/202608290003_factory_agent_registry.sql';
const RETRY_MIG = 'supabase/migrations/202609030001_agent_run_capacity_retry.sql';
const gitGrepCount = (ref, pattern, paths = ['.']) => {
  const r = spawnSync('git', ['grep', '-i', '-c', '-E', pattern, worktree(ref).sha, '--', ...paths], { cwd: worktree(ref).path, encoding: 'utf8', windowsHide: true });
  return r.stdout.trim().split('\n').filter(Boolean).reduce((n, l) => n + Number(l.split(':').pop() || 0), 0);
};

test('PR-01 the execution_provider vocabulary is closed to two Claude Code modes on both refs', async () => {
  const rec = await R.check('PR-01', { claim: 'The provider vocabulary admits a non-Claude provider (e.g. a Tier-0 / DeepSeek executor)', expect: 'ABSENT', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of bothRefs) out[ref] = { agents_enum: anchorsIn(ref, REGISTRY_MIG, /execution_provider in \(/), agents_enum_values: (readPinned(ref, REGISTRY_MIG).match(/execution_provider in \(\s*([^)]*)\)/) || [])[1]?.replace(/\s+/g, ' ').trim(), agent_runs_enum_values: (readPinned(ref, 'supabase/migrations/202608290002_canonical_work_order_model.sql').match(/execution_provider text not null default '[^']+' check \(execution_provider in \(([^)]*)\)/) || [])[1] };
    const closed = bothRefs.every((r) => /claude_code_background/.test(out[r].agents_enum_values || '') && !/deepseek|openai|anthropic_api|tier/i.test((out[r].agents_enum_values || '') + (out[r].agent_runs_enum_values || '')));
    return { verdict: closed ? 'ABSENT' : 'PARTIAL', evidence: out, provenance: { master: provenanceFor('master', [REGISTRY_MIG, 'supabase/migrations/202608290002_canonical_work_order_model.sql']), p1: provenanceFor('p1', [REGISTRY_MIG, 'supabase/migrations/202608290002_canonical_work_order_model.sql']) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('PR-02 the runtime dispatcher hard-refuses every provider except claude_code_background and binds to the `claude` CLI', async () => {
  const rec = await R.check('PR-02', { claim: 'Provider dispatch is abstracted behind an interface a second provider could implement', expect: 'ABSENT', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of bothRefs) out[ref] = { refuses_other_providers: anchorsIn(ref, PROVIDER, /executionProvider !== 'claude_code_background'/), claude_cli_calls: anchorsIn(ref, PROVIDER, /execFileAsync\('claude'|^\s*'claude',\s*$/).length, exported_interface: [...readPinned(ref, PROVIDER).matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]), provider_interface_module_exists: pinnedExists(ref, 'scripts/factory-runner/providers/') };
    const bound = bothRefs.every((r) => out[r].refuses_other_providers.length > 0 && out[r].claude_cli_calls >= 4);
    return { verdict: bound ? 'ABSENT' : 'PARTIAL', evidence: out, provenance: { master: provenanceFor('master', [PROVIDER]), p1: provenanceFor('p1', [PROVIDER]) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('PR-03 DeepSeek / Tier-0 have zero tracked-file references on either ref (broad git grep, canary proven)', async () => {
  const rec = await R.check('PR-03', { claim: 'A DeepSeek or Tier-0 provider integration, plan, or configuration exists somewhere in the tracked tree', expect: 'ABSENT', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of bothRefs) out[ref] = { deepseek_hits: gitGrepCount(ref, 'deepseek'), tier0_hits: gitGrepCount(ref, 'tier[ -_]?0\\b|tier0|tier-zero|tier zero'), canary_claude_code_background_hits: gitGrepCount(ref, 'claude_code_background'), model_literal_files_outside_factory: spawnSync('git', ['grep', '-l', '-i', '-E', 'openai|anthropic', worktree(ref).sha, '--', 'web/lib', 'web/app', 'supabase/functions'], { cwd: worktree(ref).path, encoding: 'utf8', windowsHide: true }).stdout.trim().split('\n').filter(Boolean).length };
    const absent = bothRefs.every((r) => out[r].deepseek_hits === 0 && out[r].tier0_hits === 0 && out[r].canary_claude_code_background_hits > 0);
    return { verdict: absent ? 'ABSENT' : 'PARTIAL', evidence: { ...out, note: 'product-side model providers (web/, supabase/functions) exist for the Brain OS product AI, not for Factory execution' }, provenance: { master: provenanceFor('master', []), p1: provenanceFor('p1', []) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('PR-04 NO_SILENT_PROVIDER_FALLBACK: constraint exists and is enforced by the DB; nothing in the runtime writes requested_*/actual_*', async () => {
  const rec = await R.check('PR-04', { claim: 'A provider/model substitution on restart is recorded with a reason (never silent) AND the runtime populates requested/actual', expect: 'PARTIAL', method: 'PGLITE_EXEC', evidence_kind: 'independent', kfm_ref: '#118/no-silent-fallback' }, async () => {
    const h = await openFactoryDb({ refKey: 'p1' });
    try {
      await seedIdentities(h); await seedFactory(h);
      await asSuperuser(h);
      const base = `agent_id, canonical_work_order_id, company_id, execution_provider, status`;
      const vals = `'33123660-2f38-4290-8de7-35b8f696247a', 'aaaaaaaa-0000-4000-8000-00000000aa01', '${IDS.COMPANY}', 'claude_code_background', 'queued'`;
      const silent = await attempt(h, `insert into public.agent_runs (${base}, requested_provider, actual_provider) values (${vals}, 'claude_code_background', 'deepseek') returning id`);
      const stated = await attempt(h, `insert into public.agent_runs (${base}, requested_provider, actual_provider, fallback_reason) values (${vals}, 'claude_code_background', 'deepseek', 'capacity') returning id`);
      const silentModel = await attempt(h, `insert into public.agent_runs (${base}, requested_model, actual_model) values (${vals}, 'opus', 'haiku') returning id`);
      const allNull = await attempt(h, `insert into public.agent_runs (${base}) values (${vals}) returning id`);
      await h.exec(`delete from public.agent_runs where canonical_work_order_id = 'aaaaaaaa-0000-4000-8000-00000000aa01' and status = 'queued'`);
      const writers = {};
      for (const ref of bothRefs) writers[ref] = spawnSync('git', ['grep', '-n', '-E', 'requested_provider|actual_provider|requested_model|actual_model|fallback_reason', worktree(ref).sha, '--', 'scripts', 'web', 'supabase/functions'], { cwd: worktree(ref).path, encoding: 'utf8', windowsHide: true }).stdout.trim().split('\n').filter(Boolean).filter((l) => !/\.test\.mjs/.test(l)).map((l) => l.replace(/^[0-9a-f]{40}:/, '').slice(0, 160));
      const enforced = !silent.ok && silent.sqlstate === '23514' && stated.ok && !silentModel.ok && allNull.ok;
      const anyWriter = bothRefs.some((r) => writers[r].length > 0);
      return { verdict: enforced && !anyWriter ? 'PARTIAL' : (enforced ? 'PASS' : 'FAIL'), evidence: { silent_provider_substitution: silent.ok ? 'ACCEPTED' : silent.sqlstate, stated_substitution: stated.ok, silent_model_substitution: silentModel.ok ? 'ACCEPTED' : silentModel.sqlstate, all_null_accepted: allNull.ok, runtime_writers_of_these_columns: writers, interpretation: 'the DB refuses a RECORDED silent substitution, but no runtime path records requested/actual at all, so an unrecorded substitution stays invisible (all-null rows are valid)', security_label: h.security_label }, provenance: provenanceFor('master', [RETRY_MIG], 'LOCAL_DB_CONTRACT') };
    } finally { await h.close(); }
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('PR-05 capacity/transient classification is the only provider-failure abstraction; it is pattern-bound to Claude CLI output', async () => {
  const rec = await R.check('PR-05', { claim: 'Provider failure classification is provider-neutral', expect: 'PARTIAL', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of bothRefs) {
      const src = readPinned(ref, PROVIDER);
      const capBlock = (src.match(/PROVIDER_CAPACITY_PATTERNS = \[([\s\S]*?)\];/) || [])[1] || '';
      const trBlock = (src.match(/PROVIDER_TRANSIENT_PATTERNS = \[([\s\S]*?)\];/) || [])[1] || '';
      out[ref] = { capacity_patterns: (capBlock.match(/\/.*?\/[a-z]*/g) || []).map((p) => p.slice(0, 80)), transient_patterns: (trBlock.match(/\/.*?\/[a-z]*/g) || []).map((p) => p.slice(0, 80)), exported_classes: (src.match(/export const (PROVIDER_[A-Z_]+|EXECUTION_MODE_BLOCKED)/g) || []).map((s) => s.replace('export const ', '')) };
    }
    const present = bothRefs.every((r) => out[r].capacity_patterns.length > 0 && out[r].exported_classes.includes('PROVIDER_CAPACITY_BLOCKED'));
    return { verdict: present ? 'PARTIAL' : 'ABSENT', evidence: { ...out, note: 'sound for Claude Code (cross-checked by DIR-11 provider.regression.test); a second provider would need its own pattern set and there is no per-provider hook' }, provenance: { master: provenanceFor('master', [PROVIDER]), p1: provenanceFor('p1', [PROVIDER]) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('PR-06 plugin registry admits component_type execution_provider (registration surface) with no consuming code', async () => {
  const rec = await R.check('PR-06', { claim: 'An execution_provider plugin can be registered AND is consumed by the dispatcher', expect: 'PARTIAL', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of bothRefs) out[ref] = { registry_enum: anchorsIn(ref, 'supabase/migrations/202608300004_plugin_registry.sql', /'execution_provider'/).length, consumers_in_runtime: spawnSync('git', ['grep', '-n', '-E', "component_type\\s*===?\\s*'execution_provider'|execution_provider_compatibility", worktree(ref).sha, '--', 'scripts'], { cwd: worktree(ref).path, encoding: 'utf8', windowsHide: true }).stdout.trim().split('\n').filter(Boolean).filter((l) => !/\.test\.mjs/.test(l)).length };
    const surfaceOnly = bothRefs.every((r) => out[r].registry_enum > 0 && out[r].consumers_in_runtime === 0);
    return { verdict: surfaceOnly ? 'PARTIAL' : (bothRefs.every((r) => out[r].consumers_in_runtime > 0) ? 'PASS' : 'ABSENT'), evidence: out, provenance: { master: provenanceFor('master', ['supabase/migrations/202608300004_plugin_registry.sql']), p1: provenanceFor('p1', ['supabase/migrations/202608300004_plugin_registry.sql']) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

test('PR-07 readiness statement for a Tier-0 (cheap/first-pass) provider: what would have to exist', async () => {
  const rec = await R.check('PR-07', { claim: 'The Factory can accept a Tier-0/DeepSeek executor today without code change', expect: 'ABSENT', method: 'SOURCE_GREP', evidence_kind: 'independent' }, async () => {
    const out = {};
    for (const ref of bothRefs) out[ref] = { provider_enum_closed: /claude_code_background','claude_code_local'/.test(readPinned(ref, REGISTRY_MIG).replace(/\s+/g, '')) , dispatcher_refuses_others: anchorsIn(ref, PROVIDER, /unsupported execution_provider/).length > 0, model_selection_surface: anchorsIn(ref, PROVIDER, /--model|requested_model/).length, verifier_tools_allowlist: anchorsIn(ref, PROVIDER, /VERIFIER_ALLOWED_TOOLS/).length > 0 };
    return { verdict: 'ABSENT', evidence: { ...out, missing_for_readiness: ['agents.execution_provider enum value + agent_runs.execution_provider enum value', 'a provider adapter behind startRun/getRunStatus/getLogs/cancelRun/getArtifacts/healthCheck', 'a per-provider capacity/transient classifier', 'runtime population of requested_provider/model + actual_provider/model + fallback_reason at dispatch and restart', 'a provider-neutral least-privilege DB path (db.mjs adoption) so a Tier-0 node has no ambient authority', 'certification independence so a cheap authoring run is never its own certifier (RI-01..05)'] }, provenance: { master: provenanceFor('master', [PROVIDER, REGISTRY_MIG]), p1: provenanceFor('p1', [PROVIDER, REGISTRY_MIG]) } };
  });
  assert.ok(rec.verdict !== 'NO_VERDICT', rec.harness_error);
});

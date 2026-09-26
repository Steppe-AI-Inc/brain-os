#!/usr/bin/env node
// THE CERTIFIED REFERENCE SUITES ON THE CANDIDATE (WO-10; VERIFICATION_SPEC §3 step 7) - the implementer's developer evidence that the
// 69df2f52 semantics of the shared modules still hold. It never replaces the verifier's run.
//   node qa/implementation/auto-enrollment-v1/tools/run_reference_suites.mjs <out dir> [name,name,...]
// Serial (one heavy job at a time), disposable resources only; each suite's full output goes to <out dir>/<name>.txt with the command,
// commit, start, duration and exit; SUMMARY.txt lists every suite, and every suite that is NOT RUN says why - nothing is skipped
// silently. The suite files themselves must be byte-identical to 69df2f52 (checked first; a changed file is recorded, not run).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const BASELINE = '69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6';
const OUT = resolve(process.argv[2] || join(ROOT, 'qa/implementation/auto-enrollment-v1/evidence/candidate/reference'));
const only = process.argv[3] ? process.argv[3].split(',') : null;
mkdirSync(OUT, { recursive: true });
const git = (...a) => spawnSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' });
const head = git('rev-parse', 'HEAD').stdout.trim();

// [name, argv, minutes]
const SUITES = [
  ['acceptance', ['qa/factory/acceptance.mjs'], 30],
  ['campaign_boundary_is_crossed', ['qa/factory/campaign_boundary_is_crossed.mjs'], 30],
  ['dbtest_on_disposable_pg', ['qa/factory/dbtest_on_disposable_pg.mjs', ROOT], 45],
  ['dedicated_supabase_provisioning', ['qa/factory/dedicated_supabase_provisioning.mjs'], 30],
  ['denominator_cannot_shrink_silently', ['qa/factory/denominator_cannot_shrink_silently.mjs'], 15],
  ['founder_poke_not_required', ['qa/factory/founder_poke_not_required.mjs'], 30],
  ['health_check', ['qa/factory/health_check.mjs'], 15],
  ['http_provider_acceptance', ['qa/factory/http_provider_acceptance.mjs'], 30],
  ['instrument_validity.regression.test', ['qa/factory/instrument_validity.regression.test.mjs'], 15],
  ['model_catalog_must_not_advertise_untested_models', ['qa/factory/model_catalog_must_not_advertise_untested_models.mjs'], 15],
  ['no_silent_model_fallback', ['qa/factory/no_silent_model_fallback.mjs'], 15],
  ['node_truth_acceptance', ['qa/factory/node_truth_acceptance.mjs'], 60],
  ['package_bootstrap_regression --static', ['qa/factory/package_bootstrap_regression.mjs', '--static'], 10],
  ['package_bootstrap_mutation_proof (static)', ['qa/factory/package_bootstrap_mutation_proof.mjs'], 30],
  ['shared_control_plane_acceptance', ['qa/factory/shared_control_plane_acceptance.mjs'], 45],
  ['tls_plane_acceptance', ['qa/factory/tls_plane_acceptance.mjs'], 30],
  ['waiting_costs_no_cpu', ['qa/factory/waiting_costs_no_cpu.mjs'], 30],
  ...['db.regression.test', 'plugin-attach.regression.test', 'provider.regression.test', 'round-state.regression.test', 'runner-env.regression.test',
    'scheduler.regression.test', 'supervisor.injection.test', 'supervisor.regression.test', 'supervisor.injection.mutation']
    .map((n) => ['scripts/factory-runner/' + n, ['scripts/factory-runner/' + n + '.mjs'], 30]),
  ['acceptance_mutation_proof', ['qa/factory/acceptance_mutation_proof.mjs'], 240],
];
const NOT_RUN = [
  ['package_bootstrap_regression (fresh-clone rows)', 'S-15: its F6 restore path re-registers this PC\'s live "BrainOS Factory Node" task, and it needs the npm registry; the static rows run above'],
  ['package_bootstrap_mutation_proof --fresh', 'S-15: the same installer path on this PC; the static mutants run above'],
  ['reboot_recovery_acceptance (disposable-plane rows)', 'BLOCKED - EXTERNAL: VERIFICATION_SPEC §3.7 runs it only in a separate disposable Windows VM with no live task; this PC holds the live task and has no hypervisor or Windows Sandbox'],
  ['factory_v1_acceptance --local-only', 'BLOCKED - EXTERNAL: the same VM-only rule as reboot_recovery_acceptance'],
  ['shared_plane_live_acceptance, two_machine_real, two_machine_failover, two_machine_scheduling', 'excluded by S-15 (they read or drive live state); VERIFICATION_SPEC §3.7'],
];

const summary = ['reference suites at ' + head + ' (the suite files compared with ' + BASELINE + ')', ''];
for (const [name, args, minutes] of SUITES) {
  if (only && !only.some((o) => name.startsWith(o))) continue;
  const file = args[0];
  const changed = git('diff', '--quiet', BASELINE, head, '--', file).status !== 0;
  if (changed) { summary.push(name.padEnd(52) + ' NOT RUN: the file differs from ' + BASELINE.slice(0, 8) + ' (a successor needs a ratified change request)'); continue; }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: minutes * 60000, maxBuffer: 1 << 28, windowsHide: true,
    env: { ...process.env, FACTORY_RUNNER_PG_URL: '', FACTORY_RUNNER_ENV_FILE: '' } });
  const out = (r.stdout || '') + (r.stderr ? '\n--- stderr ---\n' + r.stderr : '');
  const secs = Math.round((Date.now() - t0) / 1000);
  const last = out.trim().split('\n').filter((l) => /passed|failed|killed|PASS|FAIL|OK\b/i.test(l)).slice(-1)[0] || '(no summary line)';
  writeFileSync(join(OUT, name.replace(/[^A-Za-z0-9._-]+/g, '_') + '.txt'), ['suite ' + name, 'command node ' + args.join(' '), 'cwd ' + ROOT, 'commit ' + head,
    'suite file identical to ' + BASELINE + ': yes', 'environment disposable (local): FACTORY_RUNNER_PG_URL and FACTORY_RUNNER_ENV_FILE emptied',
    'started ' + new Date(t0).toISOString(), 'seconds ' + secs, 'exit ' + r.status + (r.error ? ' error ' + r.error.code : ''), 'summary ' + last.trim(), '', out].join('\n'));
  const line = name.padEnd(52) + ' exit ' + String(r.status).padEnd(4) + String(secs).padStart(5) + 's  ' + last.trim();
  summary.push(line);
  console.log(line);
}
summary.push('', 'NOT RUN (by rule, with the reason):');
for (const [n, why] of NOT_RUN) summary.push('  ' + n + ' - ' + why);
writeFileSync(join(OUT, 'SUMMARY.txt'), summary.join('\n') + '\n');
console.log('\n' + summary.slice(-NOT_RUN.length - 2).join('\n'));

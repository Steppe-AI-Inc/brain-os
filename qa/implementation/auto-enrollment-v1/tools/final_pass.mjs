#!/usr/bin/env node
// THE FINAL DEVELOPER PASS AT ONE COMMIT (WO-10): every developer suite and static gate of the candidate, run SERIALLY (one heavy job
// at a time) from a clean tree, each with its full output, command, commit, start, duration and exit written to <out>/<name>.txt;
// SUMMARY.md tabulates them. The artifacts are rebuilt first from the same commit (so the runtime rows test that commit's bytes).
// Developer verification only - never independent acceptance, and never a substitute for the verifier's run.
//   node qa/implementation/auto-enrollment-v1/tools/final_pass.mjs <out dir>
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'qa/implementation/auto-enrollment-v1/evidence/candidate/final'));
mkdirSync(OUT, { recursive: true });
const git = (...a) => spawnSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' });
const head = git('rev-parse', 'HEAD').stdout.trim();
if (git('status', '--porcelain', '--untracked-files=no').stdout.trim()) { console.log('REFUSED: the tree has uncommitted changes to tracked files - the pass must run on exactly one commit'); process.exit(2); }

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const N = (args, minutes = 30, cwd = ROOT) => ({ cmd: process.execPath, args, minutes, cwd });
// [name, command, how its summary line reads]
const STEPS = [
  ['build dev channel', N(['scripts/factory-build/build-sea.mjs', '--channel', 'dev'], 20)],
  ['build production channel', N(['scripts/factory-build/build-sea.mjs', '--channel', 'production'], 20)],
  ['verify-build dev (IDENTICAL)', N(['scripts/factory-build/verify-build.mjs', '--against', 'dist/brain-factory/0.1.0/dev'], 20)],
  ['verify-build production (IDENTICAL)', N(['scripts/factory-build/verify-build.mjs', '--against', 'dist/brain-factory/0.1.0/production'], 20)],
  ['static: factory_v1_static_contract', N(['qa/scenarios-runner/factory_v1_static_contract.mjs'], 5)],
  ['static: architecture_impact_registry_contract', N(['qa/scenarios-runner/architecture_impact_registry_contract.mjs'], 5)],
  ['static: secret scan self-test', N(['qa/implementation/auto-enrollment-v1/tools/secret_scan.mjs', '--selftest'], 5)],
  ['static: secret scan', N(['qa/implementation/auto-enrollment-v1/tools/secret_scan.mjs'], 5)],
  ['static: deno check (Edge functions)', { cmd: npx, args: ['--yes', 'deno@2.5.6', 'check', 'supabase/control-plane/edge/supabase/functions/factory-node-api/index.ts', 'supabase/control-plane/edge/supabase/functions/factory-admin-api/index.ts'], minutes: 10, cwd: ROOT, shell: true }],
  ['static: web tsc', { cmd: npx, args: ['tsc', '--noEmit', '-p', 'tsconfig.json'], minutes: 15, cwd: join(ROOT, 'web'), shell: true }],
  ['static: web eslint (changed files)', { cmd: npx, args: ['eslint', '"app/(app)/software-factory/computers"', '"app/(app)/software-factory/workers"', 'lib/factory', 'lib/data/factory-computers.ts', 'components/app-sidebar.tsx', 'lib/i18n/dictionary.ts'], minutes: 15, cwd: join(ROOT, 'web'), shell: true }],
  ['static: web next build', { cmd: npx, args: ['next', 'build'], minutes: 30, cwd: join(ROOT, 'web'), shell: true, env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'qa-dummy', NEXT_TELEMETRY_DISABLED: '1' } }],
  ['schema_acceptance', N(['qa/factory/v1/schema_acceptance.mjs'], 30)],
  ['manifest_rehearsal', N(['qa/factory/v1/manifest_rehearsal.mjs'], 30)],
  ['takeover_acceptance --transport direct', N(['qa/factory/v1/takeover_acceptance.mjs', '--transport', 'direct'], 30)],
  ['takeover_acceptance --transport api', N(['qa/factory/v1/takeover_acceptance.mjs', '--transport', 'api'], 30)],
  ['compat_regressions --transport direct', N(['qa/factory/v1/compat_regressions.mjs', '--transport', 'direct'], 45)],
  ['compat_regressions --transport api', N(['qa/factory/v1/compat_regressions.mjs', '--transport', 'api'], 45)],
  ['transport_compatibility_contract', N(['qa/factory/v1/transport_compatibility_contract.mjs'], 45)],
  ['enrollment_acceptance', N(['qa/factory/v1/enrollment_acceptance.mjs'], 30)],
  ['admin_acceptance', N(['qa/factory/v1/admin_acceptance.mjs'], 30)],
  ['revocation_interleaving', N(['qa/factory/v1/revocation_interleaving.mjs'], 30)],
  ['eligibility_acceptance', N(['qa/factory/v1/eligibility_acceptance.mjs'], 30)],
  ['independence_acceptance', N(['qa/factory/v1/independence_acceptance.mjs'], 30)],
  ['edge_db_tls_acceptance', N(['qa/factory/v1/edge_db_tls_acceptance.mjs'], 20)],
  ['setup_manifest_locate', N(['qa/factory/v1/setup_manifest_locate.mjs'], 10)],
  ['runtime_acceptance', N(['qa/factory/v1/runtime_acceptance.mjs'], 30)],
  ['release_acceptance', N(['qa/factory/v1/release_acceptance.mjs'], 60)],
  ['web_computers_acceptance', N(['qa/factory/v1/web_computers_acceptance.mjs'], 30)],
  ['sea_package_regression', N(['qa/factory/sea_package_regression.mjs'], 45)],
];

const rows = [];
for (const [name, s] of STEPS) {
  const t0 = Date.now();
  const r = spawnSync(s.cmd, s.args, { cwd: s.cwd, encoding: 'utf8', timeout: s.minutes * 60000, maxBuffer: 1 << 28, windowsHide: true, shell: !!s.shell,
    env: { ...process.env, FACTORY_RUNNER_PG_URL: '', FACTORY_RUNNER_ENV_FILE: '', ...(s.env || {}) } });
  const out = (r.stdout || '') + (r.stderr ? '\n--- stderr ---\n' + r.stderr : '');
  const secs = Math.round((Date.now() - t0) / 1000);
  const last = (out.split('\n').filter((l) => /(\d+\/\d+ (OK|rows)|passed|failed|IDENTICAL|DIFFERENT|CANNOT VERIFY|clean|HIT|BUILT|Check file|rules hit|Compiled|Generating static|error)/i.test(l)).pop() || '').trim();
  const file = name.replace(/[^A-Za-z0-9._-]+/g, '_') + '.txt';
  writeFileSync(join(OUT, file), ['step ' + name, 'command ' + [s.cmd, ...s.args].join(' '), 'cwd ' + s.cwd, 'commit ' + head, 'started ' + new Date(t0).toISOString(),
    'seconds ' + secs, 'exit ' + r.status + (r.error ? ' error ' + r.error.code : ''), 'summary ' + last, '', out].join('\n'));
  rows.push({ name, exit: r.status, secs, last, file });
  console.log((r.status === 0 ? 'PASS ' : 'FAIL ') + name.padEnd(46) + String(secs).padStart(5) + 's  ' + last.slice(0, 140));
}
const md = ['# Final developer pass', '', 'Commit `' + head + '`; run by `qa/implementation/auto-enrollment-v1/tools/final_pass.mjs` (serial; developer verification, never independent).', '',
  '| step | exit | seconds | summary | evidence |', '|---|---|---|---|---|',
  ...rows.map((r) => '| ' + r.name + ' | ' + r.exit + ' | ' + r.secs + ' | ' + r.last.replace(/\|/g, '/').slice(0, 160) + ' | `' + r.file + '` |'), '',
  (rows.every((r) => r.exit === 0) ? 'Every step exited 0.' : 'FAILED steps: ' + rows.filter((r) => r.exit !== 0).map((r) => r.name).join(', '))];
writeFileSync(join(OUT, 'SUMMARY.md'), md.join('\n') + '\n');
console.log('\nfinal_pass: ' + rows.filter((r) => r.exit === 0).length + '/' + rows.length + ' steps exit 0');
process.exit(rows.every((r) => r.exit === 0) ? 0 : 1);

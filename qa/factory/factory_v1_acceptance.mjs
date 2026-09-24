#!/usr/bin/env node
// FINAL FACTORY V1 ACCEPTANCE — one command that runs every Factory V1 proof this machine can run, reads the ones that
// need other machines from the plane, and says PASS / HOLD with the founder-gated remainder named.
//
//   node qa/factory/factory_v1_acceptance.mjs                 one machine: every local suite; the multi-machine rows read the plane
//   node qa/factory/factory_v1_acceptance.mjs --local-only    skip the plane-reading rows
//   node qa/factory/factory_v1_acceptance.mjs --plane-only    only the plane-reading rows (a quick read of what the machines recorded)
//
// The multi-machine rows need FACTORY_RUNNER_PG_URL pointing at the shared plane (the founder's database) and read what
// two_machine_failover.mjs, shared_pg_worker.mjs and plane-health.mjs recorded there from BOTH machines: distinct
// hostnames, not distinct node ids. Nothing here fakes a second machine.
//
// PASS advances automatically (the founder's rule); anything short of it is HOLD with the exact missing item printed.
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hostname } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const LOCAL_ONLY = process.argv.includes('--local-only');
const PLANE_ONLY = process.argv.includes('--plane-only'); // only the rows read from the shared plane (the local suites are skipped, not passed)
const record = { measured_at: new Date().toISOString(), host: hostname(), rows: [] };
let holds = 0;
const row = (milestone, label, ok, detail, gated) => { record.rows.push({ milestone, label, ok, detail: String(detail || '').slice(0, 300), founder_gated: Boolean(gated) }); if (!ok) holds++; console.log((ok ? 'OK   ' : (gated ? 'GATE ' : 'FAIL ')) + '[' + milestone + '] ' + label + (ok || !detail ? '' : '\n       ' + String(detail).slice(0, 300))); };
// Every suite has 20 minutes; a suite that hangs after its verdict (tls_plane_acceptance, 2026-09-23) is killed and its row
// says TIMEOUT rather than blocking the whole report.
const run = (file, args = [], env = {}) => {
  const r = spawnSync(process.execPath, [file, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 26, timeout: 20 * 60 * 1000, killSignal: 'SIGKILL' });
  const timedOut = r.error && /ETIMEDOUT/.test(String(r.error.code));
  return { rc: timedOut ? 124 : r.status, out: (r.stdout || '') + (r.stderr || '') + (timedOut ? '\nTIMEOUT after 20 min' : '') };
};
const summary = (out, re) => { const m = re.exec(out); return m ? m[0] : '(no summary)'; };

console.log('Factory V1 acceptance on ' + hostname() + ' — ' + record.measured_at);
console.log('');
// ---- local, disposable ----------------------------------------------------------------------------------------------
const noUrl = { FACTORY_RUNNER_PG_URL: '' };
if (!PLANE_ONLY) {
let r = run(join(ROOT, 'qa/factory/acceptance.mjs'), [], noUrl);
row('1', 'control-plane acceptance on a disposable real PostgreSQL: ' + summary(r.out, /factory acceptance: \d+ passed, \d+ failed/), r.rc === 0);
r = run(join(ROOT, 'qa/factory/node_truth_acceptance.mjs'), [], { ...noUrl, FACTORY_STATE_DIR: '' });
row('1', 'what a node says about itself is true (role kept by health checks and re-asserted, strict acceptance handler, failed runs fail their work orders, busy nodes ALIVE, transient losses survived, backoff reset): ' + summary(r.out, /node_truth_acceptance: \d+ passed, \d+ failed/), r.rc === 0);
r = run(join(ROOT, 'qa/factory/health_check.mjs'), [], noUrl);
row('1', 'health check harness: ' + summary(r.out, /health_check: \d+ passed, \d+ failed/), r.rc === 0);
r = run(join(ROOT, 'qa/factory/founder_poke_not_required.mjs'), [], noUrl);
row('1', 'founder poke not required: ' + summary(r.out, /founder_poke_not_required: \d+ passed, \d+ failed/), r.rc === 0);
r = spawnSync(process.execPath, ['--test', join(ROOT, 'scripts/factory-runner/db.regression.test.mjs')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...noUrl } });
row('1', 'accessor regressions (fail closed on a missing or unsafe URL): ' + summary((r.stdout || '') + (r.stderr || ''), /pass \d+[\s\S]*?fail \d+/).replace(/\s+/g, ' '), r.status === 0);
r = run(join(ROOT, 'qa/factory/shared_control_plane_acceptance.mjs'), [], noUrl);
row('1-6', 'shared plane across real processes on one machine: ' + summary(r.out, /shared_control_plane_acceptance: \d+ passed, \d+ failed/), r.rc === 0);
r = run(join(ROOT, 'qa/factory/tls_plane_acceptance.mjs'), [], noUrl);
row('1', 'the network path over TLS on this machine\'s LAN address: ' + summary(r.out, /tls_plane_acceptance: \d+ passed, \d+ failed/), r.rc === 0);
r = run(join(ROOT, 'qa/factory/dedicated_supabase_provisioning.mjs'), [], noUrl);
row('1', 'the dedicated-Supabase provisioning mode (refusals, identity, verify-full, hardened runner): ' + summary(r.out, /dedicated_supabase_provisioning: \d+ passed, \d+ failed/), r.rc === 0);
r = run(join(ROOT, 'qa/factory/http_provider_acceptance.mjs'), [], { ...noUrl, DEEPSEEK_API_KEY: '' });
row('6', 'the HTTP provider path against a stub: ' + summary(r.out, /http_provider_acceptance: \d+ passed, \d+ failed/), r.rc === 0);
r = run(join(ROOT, 'scripts/factory-runner/monitor-gc.mjs'), ['list']);
row('5', 'monitor garbage collection: ' + (r.out.trim().split(/\r?\n/).pop() || ''), r.rc === 0);
r = run(join(ROOT, 'qa/factory/package_bootstrap_regression.mjs'), [], { ...noUrl, FACTORY_STATE_DIR: '' });
row('bootstrap', 'a fresh clone installs from the committed lock and runs a node, the supervisor, the installer preflight and the bootstrap: ' + summary(r.out, /package_bootstrap_regression: \d+ passed, \d+ failed/), r.rc === 0);
r = run(join(ROOT, 'qa/factory/reboot_recovery_acceptance.mjs'), [], { ...noUrl, FACTORY_STATE_DIR: '' });
row('reboot', 'reboot / recovery persistence (supervisor, crash restart, identity, queue claim, live scheduled task): ' + summary(r.out, /reboot_recovery_acceptance: \d+ passed, \d+ failed/), r.rc === 0);
if (process.env.FACTORY_RUNNER_PG_URL && !LOCAL_ONLY) {
  r = run(join(ROOT, 'qa/factory/shared_plane_live_acceptance.mjs'), []);
  row('1-6', 'the process-level rows on the LIVE plane from this machine: ' + summary(r.out, /shared_plane_live_acceptance: \d+ passed, \d+ failed/), r.rc === 0);
  r = run(join(ROOT, 'scripts/factory-runner/node.mjs'), ['status']);
  row('reboot', 'this checkout\'s node on the live plane: ' + (r.out.trim().split(/\r?\n/).filter((l) => /ALIVE|STALE|REGISTERED|UNREACHABLE/.test(l)).pop() || '').slice(0, 160), r.rc === 0);
}
} else console.log('--plane-only: the local suites are skipped (not counted as passed)');

// ---- the plane: what the two machines recorded ----------------------------------------------------------------------
if (LOCAL_ONLY || !process.env.FACTORY_RUNNER_PG_URL) {
  row('1-4', 'two MACHINES on one shared plane (failover both ways, three-node scheduling, verifier independence)', false, 'FACTORY_RUNNER_PG_URL to the shared plane is not set on this node - the founder\'s database (TWO_MACHINE_CONTROL_PLANE.md §0)', true);
} else {
  try {
    const db = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/db.mjs')).href);
    // THE COMMIT UNDER ACCEPTANCE (--sha, or this checkout's HEAD): the two-machine evidence counts only when both nodes that recorded it
    // ran exactly this commit - evidence from a Work node on another checkout certified these rows (final verification 2026-09-24)
    const { execFileSync } = await import('node:child_process');
    const shaArg = process.argv.indexOf('--sha');
    const SHA = shaArg > -1 && process.argv[shaArg + 1] ? process.argv[shaArg + 1] : execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    // every row counts only evidence at the commit under acceptance: machines whose node runs it; runs stamped with it ('<sha>+dirty' is
    // not it); verifications whose verifying run COMPLETED (a verifier that died after writing the columns was counted - final
    // verification 2, 2026-09-25)
    const hosts = (await db.read("select distinct split_part(platform, ' ', 2) h from factory.nodes where platform like '% %' and last_heartbeat_at > now() - interval '7 days' and capabilities ? ('head:' || $1) and not capabilities ? 'dirty'", [SHA])).rows.map((x) => x.h).filter(Boolean);
    row('1', 'machines registered on the shared plane in 7 days running ' + SHA.slice(0, 12) + ': ' + hosts.join(', '), hosts.length >= 2, hosts.length < 2 ? 'only ' + hosts.join(', ') + ' - bootstrap the other PC (§C/§D)' : '', hosts.length < 2);
    const fo = (await db.read("select c1.payload->>'hostname' h1, c2.payload->>'hostname' h2 from factory.checkpoints c1 join factory.checkpoints c2 on c1.work_order_id = c2.work_order_id where c1.scenario = 'phase-1-hold' and c2.scenario = 'phase-2-takeover' and c1.payload->>'head' = $1 and c2.payload->>'head' = $1", [SHA])).rows;
    const pairs = fo.filter((p) => p.h1 && p.h2 && p.h1 !== p.h2);
    const both = new Set(pairs.map((p) => p.h1 + '>' + p.h2));
    row('2', 'real two-machine failover recorded on the plane by nodes running ' + SHA.slice(0, 12) + ': ' + [...both].join(', '), pairs.length >= 1, pairs.length ? '' : 'with both PCs on exactly this commit, run qa/factory/two_machine_real.mjs run on the Home PC (§I)', pairs.length < 1);
    row('2', 'failover in BOTH directions', both.size >= 2, both.size >= 2 ? '' : 'run §E the other way round too', both.size < 2);
    const three = (await db.read("select count(distinct split_part(n.platform, ' ', 2))::int m from factory.agent_runs r join factory.nodes n on n.node_id = r.node_id where r.status = 'done' and r.base_commit = $1 and r.finished_at > now() - interval '7 days'", [SHA])).rows[0].m;
    row('3', 'completed runs at ' + SHA.slice(0, 12) + ' from ' + three + ' distinct machine(s) in 7 days (three-node scheduling needs 3)', three >= 3, three < 3 ? 'run two_machine_scheduling.mjs: seed, then wave on each machine, then verify (§G)' : '', three < 3);
    const ver = (await db.read("select count(*)::int n from factory.agent_runs a join factory.agent_runs v on v.run_id = a.verification_run_id join factory.nodes na on na.node_id = a.authoring_node_id join factory.nodes nv on nv.node_id = a.verification_node_id where a.status = 'done' and v.status = 'done' and a.base_commit = $1 and v.base_commit = $1 and split_part(na.platform, ' ', 2) <> split_part(nv.platform, ' ', 2)", [SHA])).rows[0].n;
    row('4', 'verifications of done runs recorded by a DIFFERENT machine than the author, both running ' + SHA.slice(0, 12) + ': ' + ver, ver >= 1, ver < 1 ? 'two_machine_real.mjs run records it (S4, §I), with both PCs on exactly this commit' : '', ver < 1);
  } catch (e) { row('1-4', 'reading the shared plane', false, String(e.message).slice(0, 200)); }
}

// ---- the remainder that is the founder's, stated ----------------------------------------------------------------------
row('6', 'DeepSeek credential on the serving node', Boolean(process.env.DEEPSEEK_API_KEY), 'DEEPSEEK_API_KEY not set in this process (never stored on the plane)', true);
row('7', 'BUG-036 provider-side cause (read-only Auth inspection)', false, 'founder runs qa/verification/bug036_auth_inspection.mjs with SUPABASE_ACCESS_TOKEN on wo/invitation-delivery', true);
row('7', 'migration 202609110001 authorized (moved into supabase/migrations)', false, 'gate_202609110001.mjs is satisfied; the move is the authorization', true);
row('7', 'invitation web deploy', false, 'gate_invitation_deploy.mjs names the commit; the deploy is the founder\'s', true);
row('7', 'Work-PC independent E2E retest', false, 'qa/verification/WORK_PC_E2E_RETEST.md, after the deploy', true);

const gated = record.rows.filter((x) => !x.ok && x.founder_gated).length;
const failed = record.rows.filter((x) => !x.ok && !x.founder_gated).length;
record.verdict = failed ? 'FAIL' : (gated ? 'HOLD — founder-gated items remain' : 'PASS');
mkdirSync(join(ROOT, '.factory'), { recursive: true });
writeFileSync(join(ROOT, '.factory', 'factory_v1_acceptance.json'), JSON.stringify(record, null, 2));
console.log('');
console.log('FACTORY V1: ' + record.verdict + '  (' + record.rows.filter((x) => x.ok).length + ' ok, ' + failed + ' failed, ' + gated + ' founder-gated)');
console.log('record: .factory/factory_v1_acceptance.json (git-ignored)');
process.exit(failed ? 1 : (gated ? 3 : 0));

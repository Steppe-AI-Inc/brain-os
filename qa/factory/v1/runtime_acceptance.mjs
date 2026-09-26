#!/usr/bin/env node
// WO-4 / WO-6 DEVELOPER REHEARSAL OF THE BUILT RUNTIME on THIS machine (not a clean machine - R-1's clean Windows VM is the verifier's,
// and none is available here: BLOCKED - EXTERNAL for a true clean-machine transcript). What it drives is the real artifact:
// dist/brain-factory/<version>/dev/BrainFactorySetup.exe (build it first: build-sea.mjs --channel dev), signed with the dev key,
// published on a disposable plane by a founder persona, then run as the installing user with ISOLATED homes (--home) and uniquely
// named test tasks ("BrainFactory Test-<id>", removed afterwards; the live "BrainOS Factory Node" task is never touched).
//   U1 setup: verify this release -> enroll with a pairing code -> install -> logon task + watchdog -> ALIVE (server rows walk it)
//   U2 the installed footprint: no git / npm / checkout / runner.env / CA / PostgreSQL URL; the key DPAPI-protected; the task read back
//   U3 real work through the product path: probe work claimed, checkpointed and completed by the runtime; verified by ANOTHER enrolled
//      runtime (it reproduces the content) and certified PASS -> COMPLETE
//   U4 a killed worker is restarted by the supervisor; a killed supervisor is restarted by the task's watchdog trigger
//   U5 an injected install failure is INSTALL_FAILED in server rows; setup again retries with the SAME credential (no new code)
//   U6 revoke: the runtime stops REFUSED, is not restarted (no loop), and its logs carry no code, token or key
//   U7 uninstall removes the task and the home
// usage: node qa/factory/v1/runtime_acceptance.mjs [--exe <BrainFactorySetup.exe>] [--evidence <file>]
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT } from './plane.mjs';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { world, recorder } from './flows.mjs';
import { makeManifest, signDev } from '../../../scripts/factory-build/release-manifest.mjs';
import { readTask, unregisterTasks } from '../../../scripts/factory-runner/enrolled/tasks.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const runtimeVersion = JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/sea/runtime-version.json'), 'utf8')).runtime_version;
const EXE = arg('--exe', join(ROOT, 'dist', 'brain-factory', runtimeVersion, 'dev', 'BrainFactorySetup.exe'));
const { results, row } = recorder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = await world();
const work = mkdtempSync(join(tmpdir(), 'bf-runtime-'));
const tasks = [];
const homes = [];
// ASYNC on purpose: the Node / Admin API harness runs in THIS process, and a synchronous spawn would block the event loop that serves it
const run = (exe, args, opts = {}) => new Promise((resolve) => {
  const c = spawn(exe, args, { windowsHide: true, env: { ...process.env, ...(opts.env || {}) } });
  let stdout = '', stderr = '';
  c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
  const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } }, opts.timeout || 300000);
  c.on('exit', (status) => { clearTimeout(t); resolve({ status, stdout, stderr }); });
});
const statusOf = (home) => { try { return JSON.parse(readFileSync(join(home, 'state', 'status.json'), 'utf8')); } catch { return {}; } };
const pids = (home) => { try { return JSON.parse(readFileSync(join(home, 'state', 'supervisor.lock.json'), 'utf8')); } catch { return {}; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitFor = async (fn, ms, step = 1000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(step); } };
try {
  const { founder, sup, admin } = W;
  if (!existsSync(EXE)) throw new Error('no built runtime at ' + EXE + ' - run: node scripts/factory-build/build-sea.mjs --channel dev');
  // the download: the exe and its signed manifest side by side (as public storage serves them, CR-004)
  const dl = join(work, 'download'); mkdirSync(dl);
  const exe = join(dl, 'BrainFactorySetup.exe'); copyFileSync(EXE, exe);
  const src = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const manifest = signDev(makeManifest({ artifact: exe, channel: 'dev', version: runtimeVersion, source_sha: src, receipt_sha256: sha256('rehearsal receipt ' + src) }));
  writeFileSync(join(dl, 'BrainFactorySetup.manifest.json'), JSON.stringify(manifest, null, 2));
  const pub = await admin.call('publish-release', { channel: 'dev', version: runtimeVersion, source_sha: src, digest: manifest.digest, key_id: manifest.key_id,
    signature: manifest.signature, receipt_sha256: manifest.receipt_sha256, manifest }, founder.token);
  if (!pub.ok) throw new Error('publish refused: ' + JSON.stringify(pub));

  const install = async (name, { envelope = { roles: ['generic', 'verifier'], max_concurrent_runs: 1, max_heavy: 1 } } = {}) => {
    const add = await admin.call('add-computer', { display_name: name, envelope }, founder.token);
    const home = join(work, 'home-' + name); homes.push(home);
    const task = 'BrainFactory Test-' + randomUUID().slice(0, 8); tasks.push(task);
    const r = await run(exe, ['setup', '--code', add.pairing_code, '--api', W.node.baseUrl, '--yes', '--home', home, '--task-name', task]);
    return { add, home, task, r, code: add.pairing_code };
  };

  // ---- U1
  const A = await install('RT-A');
  const trans = (await sup.query(`select array_agg(t.to_state order by t.transition_id) s from factory.enrollment_transitions t join factory.enrollments e using (enrollment_id)
     where e.computer_id = $1`, [A.add.computer_id])).rows[0].s || [];
  const nodeRow = (await sup.query(`select n.runtime_version, n.runtime_digest, r.release_id, n.machine_fingerprint, n.runtime_phase from factory.nodes n
     left join factory.releases r on r.release_id = n.release_id where n.computer_id = $1`, [A.add.computer_id])).rows[0] || {};
  row('U1 setup verified the release, enrolled with the pairing code, installed, registered the logon task and started: exit 0, ALIVE; server rows walk the founder\'s states; the node is stamped with the published release',
    A.r.status === 0 && trans.join('>') === 'PAIRING_STARTED>PAIRING_VERIFIED>NODE_ID_ISSUED>NODE_CREDENTIAL_ISSUED>RUNTIME_INSTALLING>REGISTERING>ALIVE'
      && nodeRow.runtime_digest === manifest.digest && nodeRow.release_id === pub.release_id,
    'exit ' + A.r.status + ' | ' + (A.r.stdout || '').trim().split(/\r?\n/).slice(-2).join(' / ') + ' | ' + trans.join('>'));
  // ---- U2
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else files.push(p.slice(A.home.length + 1)); } };
  walk(A.home);
  const blob = files.map((f) => { try { return readFileSync(join(A.home, f)); } catch { return Buffer.alloc(0); } });
  const text = Buffer.concat(blob.filter((b) => b.length < 5e6)).toString('latin1');
  const cfg = JSON.parse(readFileSync(join(A.home, 'config.json'), 'utf8'));
  const keyFile = readFileSync(join(A.home, 'key', 'node.key')).toString('latin1');
  const task = readTask(A.task);
  row('U2 the installed footprint holds the runtime, its manifest, config (no secret), a DPAPI-protected key, state and logs - no git, npm, checkout, runner.env, CA file or PostgreSQL URL; the task: logon + a repeating watchdog, Interactive, Limited',
    !files.some((f) => /\.git|node_modules|package\.json|runner\.env|\.pem$|\.crt$/i.test(f)) && !/postgres(ql)?:\/\/|FACTORY_RUNNER_PG_URL/.test(text)
      && cfg.key_protection === 'dpapi' && /^BOS-SECURE-STORE\/1 dpapi /.test(keyFile) && task.logon === 'Interactive' && task.runLevel === 'Limited'
      && (task.triggers || []).some((t) => /LogonTrigger/.test(t.kind)) && (task.triggers || []).some((t) => t.repeat === 'PT5M'),
    files.length + ' files; ' + JSON.stringify({ protection: cfg.key_protection, task: { logon: task.logon, runLevel: task.runLevel, triggers: task.triggers } }));
  // ---- U3: real work through the product path, verified by another runtime
  const B = await install('RT-B');
  const wo = await W.submit({ title: 'probe through the product path', work_type: 'probe', requires_verification: true, priority: 50,
    handoff: JSON.stringify({ steps: 3, step_ms: 300, salt: 'u3' }) });
  const done = await waitFor(async () => { const r = (await sup.query(`select status, verification_state from factory.work_orders where work_order_id = $1`, [wo])).rows[0]; return r.verification_state === 'COMPLETE' ? r : null; }, 120000);
  const runs = (await sup.query(`select r.run_kind, r.status, r.computer_id, (select count(*)::int from factory.checkpoints k where k.run_id = r.run_id) cps
     from factory.agent_runs r join factory.work_orders w using (work_order_id) where r.work_order_id = $1 or w.verifies_work_order_id = $1 order by r.started_at`, [wo])).rows;
  const cert = (await sup.query(`select verdict, certifying_computer_id from factory.certifications where work_order_id = $1`, [wo])).rows[0];
  const author = runs.find((r) => r.run_kind === 'authoring');
  row('U3 probe work dispatched through the product path: one runtime claimed, checkpointed each step and completed it; the OTHER runtime reproduced the content and certified PASS; the work order is COMPLETE',
    done && author && author.status === 'done' && author.cps === 3 && cert && cert.verdict === 'PASS' && cert.certifying_computer_id !== author.computer_id,
    JSON.stringify({ runs: runs.map((r) => r.run_kind + ':' + r.status + ':' + r.cps), cert: cert && cert.verdict }));
  // ---- U4: kill the worker; kill the supervisor
  const lockA = pids(A.home);
  if (lockA.worker_pid) try { process.kill(lockA.worker_pid); } catch { /* gone */ }
  const newWorker = await waitFor(() => { const l = pids(A.home); return l.worker_pid && l.worker_pid !== lockA.worker_pid && alive(l.worker_pid) ? l.worker_pid : null; }, 40000);
  row('U4a a killed worker is restarted by its supervisor (backoff 5 s)', !!newWorker, 'worker ' + lockA.worker_pid + ' -> ' + newWorker);
  const supPid = pids(A.home).pid;
  if (supPid) spawnSync('taskkill', ['/PID', String(supPid), '/T', '/F'], { windowsHide: true });
  const back = await waitFor(() => { const l = pids(A.home); return l.pid && l.pid !== supPid && alive(l.pid) ? l.pid : null; }, 400000, 5000);
  row('U4b a killed supervisor (and its worker) is started again by the task\'s watchdog trigger, with no human step', !!back, 'supervisor ' + supPid + ' -> ' + back);
  // ---- U5: an injected install failure, retried with the same credential
  const C = await (async () => {
    const add = await admin.call('add-computer', { display_name: 'RT-C', envelope: { roles: ['generic'], max_concurrent_runs: 1, max_heavy: 1 } }, founder.token);
    const home = join(work, 'home-RT-C'); homes.push(home);
    const task = 'BrainFactory Test-' + randomUUID().slice(0, 8); tasks.push(task);
    mkdirSync(join(home, 'runtime'), { recursive: true });
    writeFileSync(join(home, 'runtime', runtimeVersion + '-' + manifest.digest.slice(0, 12)), 'a FILE where the runtime directory must go: the injected install failure');
    const r1 = await run(exe, ['setup', '--code', add.pairing_code, '--api', W.node.baseUrl, '--yes', '--home', home, '--task-name', task]);
    const st1 = (await sup.query(`select state, state_reason from factory.enrollments where computer_id = $1`, [add.computer_id])).rows[0];
    rmSync(join(home, 'runtime', runtimeVersion + '-' + manifest.digest.slice(0, 12)), { force: true });
    const r2 = await run(exe, ['setup', '--api', W.node.baseUrl, '--yes', '--home', home, '--task-name', task]);
    const st2 = (await sup.query(`select state from factory.enrollments where computer_id = $1`, [add.computer_id])).rows[0];
    const codes = (await sup.query(`select count(*)::int n from factory.pairing_codes where computer_id = $1`, [add.computer_id])).rows[0].n;
    const creds = (await sup.query(`select count(*)::int n from factory.node_credentials where computer_id = $1`, [add.computer_id])).rows[0].n;
    return { add, home, task, r1, r2, st1, st2, codes, creds };
  })();
  row('U5 an injected install failure shows INSTALL_FAILED in server rows (reason named); setup again retries with the SAME credential - one code, one credential - and reaches ALIVE',
    C.r1.status === 6 && C.st1.state === 'INSTALL_FAILED' && C.r2.status === 0 && C.st2.state === 'ALIVE' && C.codes === 1 && C.creds === 1,
    JSON.stringify({ first: C.r1.status, st1: C.st1, second: C.r2.status, st2: C.st2.state }));
  // ---- U6: revoke -> REFUSED, no restart loop, scrubbed logs
  await admin.call('revoke-credential', { computer_id: B.add.computer_id }, founder.token);
  const refused = await waitFor(() => (statusOf(B.home).state === 'REFUSED' ? statusOf(B.home) : null), 60000);
  await sleep(12000);
  const supLog = readFileSync(join(B.home, 'logs', 'supervisor.log'), 'utf8');
  const starts = (supLog.match(/release verified/g) || []).length;
  const logs = readdirSync(join(B.home, 'logs')).map((f) => readFileSync(join(B.home, 'logs', f), 'utf8')).join('\n')
    + readdirSync(join(A.home, 'logs')).map((f) => readFileSync(join(A.home, 'logs', f), 'utf8')).join('\n');
  const tokens = (await sup.query(`select count(*)::int n from factory.node_sessions`)).rows[0].n;
  row('U6 after a revoke the runtime stops REFUSED (credential_revoked) and is not restarted (no loop); no pairing code, token or key appears in any log',
    refused && refused.refused === 'credential_revoked' && starts <= 2 && !logs.includes(A.code) && !logs.includes(B.code) && !/Bearer [A-Za-z0-9_-]{20,}/.test(logs) && tokens > 0,
    'supervisor starts after the revoke: ' + starts);
  // ---- U7: uninstall
  const un = await run(exe, ['uninstall', '--home', A.home, '--task-name', A.task]);
  const gone = readTask(A.task);
  row('U7 uninstall stops the runtime and removes the task and the home', un.status === 0 && !existsSync(A.home) && !gone.name, (un.stdout || '').trim());
} catch (e) {
  row('X0 rehearsal', false, e && e.stack || e);
} finally {
  for (const h of homes) { try { writeFileSync(join(h, 'state', 'stop.request'), '{}'); } catch { /* gone */ } }
  await sleep(3000);
  for (const t of tasks) { try { unregisterTasks(t); } catch { /* gone */ } }
  for (const h of homes) { const l = pids(h); for (const pid of [l.worker_pid, l.pid]) if (pid) try { process.kill(pid); } catch { /* gone */ } }
  await W.stop();
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\nruntime_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = arg('--evidence', null);
if (ev) writeFileSync(ev, ['qa/factory/v1/runtime_acceptance.mjs --exe ' + EXE, 'migration sha256 ' + sha256(compose()), 'NOT a clean machine (R-1 is the verifier\'s disposable VM; none is available on this machine)', '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);

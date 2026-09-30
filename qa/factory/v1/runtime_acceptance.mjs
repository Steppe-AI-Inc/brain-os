#!/usr/bin/env node
// WO-4 / WO-6 DEVELOPER REHEARSAL OF THE BUILT RUNTIME on THIS machine (not a clean machine - R-1's clean Windows VM is the verifier's,
// and none is available here: BLOCKED - EXTERNAL for a true clean-machine transcript). What it drives is the real artifact:
// dist/brain-factory/<version>/dev/BrainFactorySetup.exe (build it first: build-sea.mjs --channel dev), signed with the dev key,
// published on a disposable plane by a founder persona, then run as the installing user with ISOLATED homes (--home) and uniquely
// named test tasks ("BrainFactory Test-<id>", removed afterwards; the live "BrainOS Factory Node" task is never touched).
//   U1 setup: verify this release -> enroll with a pairing code -> install -> logon task + watchdog -> ALIVE (server rows walk it). The
//      code reaches setup on STANDARD INPUT only (S-12): no process's command line holds it at any poll while setup runs, setup's
//      output never shows it, and setup asks exactly one question
//   U2 the installed footprint: no git / npm / checkout / runner.env / CA / PostgreSQL URL; the key DPAPI-protected; the task read back
//   U3 real work through the product path: probe work claimed, checkpointed and completed by the runtime; verified by ANOTHER enrolled
//      runtime (it reproduces the content) and certified PASS -> COMPLETE
//   U4 a killed worker is restarted by the supervisor; a killed supervisor is restarted by the task's watchdog trigger
//   U4c a supervisor record naming a SYSTEM process's pid (4), then a live unrelated process's pid, never blocks a start: the task
//      starts the runtime and one supervisor and one worker answer on the home's pipes
//   U4d one worker per credential: a supervisor killed alone takes its worker with it (the next start runs exactly one); an
//      orphaned worker is asked to stop by the next supervisor before it starts another, and afterwards exactly one worker answers
//   U5 an injected install failure is INSTALL_FAILED in server rows; setup again retries with the SAME credential (no new code)
//   U6 revoke: the runtime stops REFUSED, is not restarted (no loop), and its logs carry no code, token or key
//   U7 uninstall removes the task and the home
//   U3p the two installs report the same fingerprint (the registry's); under the campaign neither certifies the other's work (AC-14(p))
//   U8 after a record carrying the S-16(a) binding reported this machine's fingerprint, setup with an unbound code is refused at
//      registration by name, and again on a second setup (S-14)
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
import { assertNoCodeInArgv, codeIn } from './canary.mjs';
import { registryFingerprint } from './realnode.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const runtimeVersion = JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/sea/runtime-version.json'), 'utf8')).runtime_version;
const EXE = arg('--exe', join(ROOT, 'dist', 'brain-factory', runtimeVersion, 'dev', 'BrainFactorySetup.exe'));
const { results, row } = recorder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = await world();
const work = mkdtempSync(join(tmpdir(), 'bf-runtime-'));
const tasks = [];
const homes = [];
// THE CLEAN-MACHINE CONDITION, as far as this PC allows (R-1 itself needs a clean VM: BLOCKED - EXTERNAL here): every command this
// rehearsal runs sees a PATH holding only System32, Windows and Windows PowerShell - no node, git or npm (U0 proves it). The runtime
// starts every child by absolute path from SystemRoot. (The logon task's own environment is the user's; U2 proves the footprint.)
const SYS = process.env.SystemRoot || 'C:\\Windows';
const CLEAN_PATH = [SYS + '\\System32', SYS, SYS + '\\System32\\WindowsPowerShell\\v1.0'].join(';');
const cleanEnv = (extra = {}) => { const e = {}; for (const [k, v] of Object.entries(process.env)) if (k.toUpperCase() !== 'PATH') e[k] = v; return { ...e, Path: CLEAN_PATH, ...extra }; };
// ASYNC on purpose: the Node / Admin API harness runs in THIS process, and a synchronous spawn would block the event loop that serves it
// opts.stdin: what setup reads at its one prompt (a pairing code); every child's standard input is ended, so a prompt never waits
const run = (exe, args, opts = {}) => new Promise((resolve) => {
  assertNoCodeInArgv(args);
  const c = spawn(exe, args, { windowsHide: true, env: cleanEnv(opts.env || {}) });
  c.stdin.on('error', () => { /* the child may exit before reading */ });
  c.stdin.end(opts.stdin || '');
  let stdout = '', stderr = '';
  c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
  const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } }, opts.timeout || 300000);
  c.on('exit', (status) => { clearTimeout(t); resolve({ status, stdout, stderr }); });
});
const statusOf = (home) => { try { return JSON.parse(readFileSync(join(home, 'state', 'status.json'), 'utf8')); } catch { return {}; } };
const pids = (home) => { try { return JSON.parse(readFileSync(join(home, 'state', 'supervisor.lock.json'), 'utf8')); } catch { return {}; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const waitFor = async (fn, ms, step = 1000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(step); } };
// every process's command line on this machine, polled about once a second while `watch` runs (asynchronously: the API harness
// serves setup from this process). A hit is any command line holding the code, as issued or normalized.
const allCommandLines = () => new Promise((resolve) => {
  const ps = spawn(join(SYS, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'], { windowsHide: true });
  let out = ''; ps.stdout.on('data', (d) => { out += d; }); ps.on('exit', () => { try { const j = JSON.parse(out); resolve(Array.isArray(j) ? j : [j]); } catch { resolve(null); } });
});
const watchCommandLines = (code) => {
  const seen = { polls: 0, failed: 0, hits: 0, processes: 0 };
  let stop = false;
  const loop = (async () => { while (!stop) { const l = await allCommandLines(); if (!l) seen.failed++; else { seen.polls++; seen.processes = Math.max(seen.processes, l.length); seen.hits += l.filter((p) => p && p.CommandLine && codeIn(p.CommandLine, code)).length; } await sleep(700); } })();
  return async () => { stop = true; await loop; return seen; };
};
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

  const install = async (name, { envelope = { roles: ['generic', 'verifier'], max_concurrent_runs: 1, max_heavy: 1 }, bind = false } = {}) => {
    const add = await admin.call('add-computer', { display_name: name, envelope, ...(bind ? { bind_s16a: true } : {}) }, founder.token);
    const home = join(work, 'home-' + name); homes.push(home);
    const task = 'BrainFactory Test-' + randomUUID().slice(0, 8); tasks.push(task);
    const done = watchCommandLines(add.pairing_code);
    const r = await run(exe, ['setup', '--api', W.node.baseUrl, '--home', home, '--task-name', task], { stdin: add.pairing_code + '\n' });
    const cmdlines = await done();
    return { add, home, task, r, code: add.pairing_code, cmdlines };
  };

  // ---- U0: the PATH every command below sees holds no node, git or npm
  const where = await Promise.all(['node', 'git', 'npm'].map(async (t) => ({ t, r: await run(join(SYS, 'System32', 'where.exe'), [t]) })));
  row('U0 every command of this rehearsal runs with PATH = System32, Windows and PowerShell only: where.exe finds no node, git or npm (R-1 on a clean VM is BLOCKED - EXTERNAL on this PC)',
    where.every((w) => w.r.status === 1), where.map((w) => w.t + ' exit ' + w.r.status).join(', '));

  // ---- U1
  const A = await install('RT-A');
  const trans = (await sup.query(`select array_agg(t.to_state order by t.transition_id) s from factory.enrollment_transitions t join factory.enrollments e using (enrollment_id)
     where e.computer_id = $1`, [A.add.computer_id])).rows[0].s || [];
  const nodeRow = (await sup.query(`select n.runtime_version, n.runtime_digest, r.release_id, n.machine_fingerprint, n.runtime_phase from factory.nodes n
     left join factory.releases r on r.release_id = n.release_id where n.computer_id = $1`, [A.add.computer_id])).rows[0] || {};
  const questions = ((A.r.stdout || '').match(/Pairing code \(/g) || []).length;
  row('U1 setup verified the release, enrolled with the pairing code read on standard input (its one question), installed, registered the logon task and started: exit 0, ALIVE; server rows walk the founder\'s states; the node is stamped with the published release; no process command line polled during setup, and none of setup\'s output, holds the code',
    A.r.status === 0 && trans.join('>') === 'PAIRING_STARTED>PAIRING_VERIFIED>NODE_ID_ISSUED>NODE_CREDENTIAL_ISSUED>RUNTIME_INSTALLING>REGISTERING>ALIVE'
      && nodeRow.runtime_digest === manifest.digest && nodeRow.release_id === pub.release_id
      && questions === 1 && !codeIn(A.r.stdout + A.r.stderr, A.code) && A.cmdlines.hits === 0 && A.cmdlines.polls >= 3 && A.cmdlines.processes > 10,
    'exit ' + A.r.status + ' | ' + (A.r.stdout || '').trim().split(/\r?\n/).slice(-2).join(' / ') + ' | ' + trans.join('>') + ' | questions ' + questions + ' | command lines ' + JSON.stringify(A.cmdlines));
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
  // (AC-5(g)) every run and every checkpoint of that work is stamped with the published release the runtimes run
  const stampRows = (await sup.query(`select 'run' k, r.release_id, r.runtime_version, r.runtime_digest from factory.agent_runs r join factory.work_orders w using (work_order_id)
      where r.work_order_id = $1 or w.verifies_work_order_id = $1
     union all select 'checkpoint', k.release_id, k.runtime_version, k.runtime_digest from factory.checkpoints k where k.work_order_id = $1`, [wo])).rows;
  const stampedAll = stampRows.length === runs.length + 3 && stampRows.every((x) => x.release_id === pub.release_id && x.runtime_version === runtimeVersion && x.runtime_digest === manifest.digest);
  row('U3 probe work dispatched through the product path: one runtime claimed, checkpointed each step and completed it; the OTHER runtime reproduced the content and certified PASS; the work order is COMPLETE; the author run, its 3 checkpoints and the verification run carry the published release (id, version, digest)',
    done && author && author.status === 'done' && author.cps === 3 && cert && cert.verdict === 'PASS' && cert.certifying_computer_id !== author.computer_id && stampedAll,
    JSON.stringify({ runs: runs.map((r) => r.run_kind + ':' + r.status + ':' + r.cps), cert: cert && cert.verdict, stamps: stampRows.map((x) => x.k + ':' + (x.release_id === pub.release_id)) }));
  // ---- U3p (AC-14(p), R-3): the two real installs on this one machine report the SAME non-null fingerprint - the registry's
  // value read independently - so under the campaign neither can certify the other's work: for 20 s nothing is certified, and the
  // waiting view names gate 7 "fingerprint equal" for the non-author (and gate 7 for the author, S-13)
  const regFp = registryFingerprint();
  const abFp = (await sup.query(`select registered_fingerprint f from factory.computers where computer_id = any ($1)`, [[A.add.computer_id, B.add.computer_id]])).rows.map((x) => x.f);
  const wp = await W.submit({ title: 'U3p campaign probe', work_type: 'probe', requires_verification: true, priority: 60, campaign_key: 'auto-enrollment-v1',
    owned_surface: ['product/u3p'], handoff: JSON.stringify({ steps: 1, step_ms: 200, salt: 'u3p' }) });
  const authored = await waitFor(async () => ((await sup.query(`select verification_state s from factory.work_orders where work_order_id = $1`, [wp])).rows[0].s === 'WAITING_FOR_INDEPENDENT_VERIFICATION'), 90000);
  await sleep(20000);
  const pCerts = (await sup.query(`select count(*)::int n from factory.certifications where work_order_id = $1`, [wp])).rows[0].n;
  const pWait = (await admin.call('list-waiting-verifications', {}, founder.token)).waiting.items.find((i) => i.work_order.work_order_id === wp);
  const pAuthor = (await sup.query(`select computer_id from factory.agent_runs where work_order_id = $1 and run_kind = 'authoring' and status = 'done'`, [wp])).rows[0];
  const other = pAuthor && (pAuthor.computer_id === A.add.computer_id ? B : A);
  const otherNode = other && (await sup.query(`select node_id from factory.nodes where computer_id = $1`, [other.add.computer_id])).rows[0];
  const otherGate = pWait && otherNode && pWait.nodes.find((x) => x.node_id === otherNode.node_id && x.first_failing_gate && x.first_failing_gate.gate === 7
    && /fingerprint equal/.test(x.first_failing_gate.detail));
  row('U3p the two real installs on this machine report the SAME non-null machine fingerprint, the registry\'s value; a campaign probe authored by one is never certified by the other (20 s, no certification): gate 7 "fingerprint equal"',
    regFp.fingerprint && abFp.length === 2 && abFp.every((f) => f === regFp.fingerprint) && authored && pCerts === 0 && !!otherGate,
    JSON.stringify({ registry: regFp.fingerprint && regFp.fingerprint.slice(0, 12), recs: abFp.map((f) => f && f.slice(0, 12)), authored: !!authored, certs: pCerts, gate: otherGate && otherGate.first_failing_gate }));
  // ---- U4: kill the worker; kill the supervisor
  const lockA = pids(A.home);
  if (lockA.worker_pid) try { process.kill(lockA.worker_pid); } catch { /* gone */ }
  const newWorker = await waitFor(() => { const l = pids(A.home); return l.worker_pid && l.worker_pid !== lockA.worker_pid && alive(l.worker_pid) ? l.worker_pid : null; }, 40000);
  row('U4a a killed worker is restarted by its supervisor (backoff 5 s)', !!newWorker, 'worker ' + lockA.worker_pid + ' -> ' + newWorker);
  const supPid = pids(A.home).pid;
  if (supPid) spawnSync('taskkill', ['/PID', String(supPid), '/T', '/F'], { windowsHide: true });
  const back = await waitFor(() => { const l = pids(A.home); return l.pid && l.pid !== supPid && alive(l.pid) ? l.pid : null; }, 400000, 5000);
  row('U4b a killed supervisor (and its worker) is started again by the task\'s watchdog trigger, with no human step', !!back, 'supervisor ' + supPid + ' -> ' + back);
  // ---- U4c / U4d: the instance is the home's pipe, never a pid in a file (the runtime's own `status` reports who answers on the pipes)
  const aExe = () => join(JSON.parse(readFileSync(join(A.home, 'current.json'), 'utf8')).dir, 'BrainFactory.exe');
  const whois = async () => { const r = await run(aExe(), ['status', '--home', A.home]); try { const j = JSON.parse(r.stdout); return { sup: j.supervisor, wk: j.worker }; } catch { return {}; } };
  const sleeper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 900000)'], { stdio: 'ignore', windowsHide: true });
  const seeded = [];
  for (const [name, pid] of [['system', 4], ['unrelated', sleeper.pid]]) {
    await run(aExe(), ['stop', '--home', A.home]);
    writeFileSync(join(A.home, 'state', 'supervisor.lock.json'), JSON.stringify({ pid, token: 'stale', started: '2026-01-01T00:00:00.000Z' }));
    const t0 = Date.now();
    await run(aExe(), ['start', '--home', A.home, '--task-name', A.task]);
    const up = await waitFor(async () => { const w = await whois(); return w.sup && w.wk && ['AVAILABLE', 'BUSY'].includes(statusOf(A.home).state) ? w : null; }, 180000, 3000);
    seeded.push({ name, pid, up: !!up, secs: Math.round((Date.now() - t0) / 1000), sup: up && up.sup.pid, wk: up && up.wk.pid, state: statusOf(A.home).state });
  }
  try { sleeper.kill(); } catch { /* gone */ }
  row('U4c a supervisor record naming pid 4 (a SYSTEM process), then the pid of a live unrelated process, never blocks a start: the task starts the runtime, one supervisor and one worker answer on the home\'s pipes and the node is AVAILABLE within 180 s',
    seeded.every((x) => x.up && x.sup !== x.pid && x.secs <= 180), JSON.stringify(seeded));
  // (a) the supervisor killed alone: on Windows the worker a supervisor spawned ends with it (the child belongs to the parent's
  // process job), so no second worker can arise from it; the next start runs exactly one worker
  const before = await whois();
  if (before.sup && before.sup.pid) spawnSync('taskkill', ['/PID', String(before.sup.pid), '/F'], { windowsHide: true });
  const workerEnded = await waitFor(async () => { const w = await whois(); return !w.wk && !(before.wk && alive(before.wk.pid)); }, 20000, 1000);
  await run(aExe(), ['start', '--home', A.home, '--task-name', A.task]);
  const restarted = await waitFor(async () => { const w = await whois(); return w.sup && w.wk && before.wk && w.wk.pid !== before.wk.pid ? w : null; }, 180000, 3000);
  // (b) an orphan - a worker that outlived the supervisor that started it (here: a worker started on its own, outside any supervisor) -
  // is asked to stop by the next supervisor before it starts another
  await run(aExe(), ['stop', '--home', A.home]);
  rmSync(join(A.home, 'state', 'stop.request'), { force: true });
  spawn(aExe(), ['worker', '--home', A.home], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  const orphan = await waitFor(async () => { const w = await whois(); return w.wk && !w.sup ? w.wk : null; }, 60000, 2000);
  await run(aExe(), ['start', '--home', A.home, '--task-name', A.task]);
  const after = await waitFor(async () => { const w = await whois(); return w.sup && w.wk && orphan && w.wk.pid !== orphan.pid ? w : null; }, 180000, 3000);
  const orphanGone = !!(orphan && !alive(orphan.pid));
  const supLogA = (() => { try { return readFileSync(join(A.home, 'logs', 'supervisor.log'), 'utf8'); } catch { return ''; } })();
  row('U4d one worker per credential: a supervisor killed alone takes its worker with it and the next start runs exactly one (a new pid); an orphaned worker still answering on the home\'s pipe is asked to stop by the next supervisor before it starts another - afterwards exactly one worker (a new pid) answers and the orphan has exited',
    !!workerEnded && !!restarted && !!orphan && !!after && orphanGone && /a worker still runs for this home \(pid \d+, answering on its pipe\): asking it to stop/.test(supLogA),
    JSON.stringify({ killed: { sup: before.sup && before.sup.pid, wk: before.wk && before.wk.pid }, workerEnded: !!workerEnded, restarted: restarted && restarted.wk.pid, orphan: orphan && orphan.pid, after: after && { sup: after.sup.pid, wk: after.wk.pid }, orphanGone }));
  // ---- U5: an injected install failure, retried with the same credential
  const C = await (async () => {
    const add = await admin.call('add-computer', { display_name: 'RT-C', envelope: { roles: ['generic'], max_concurrent_runs: 1, max_heavy: 1 } }, founder.token);
    const home = join(work, 'home-RT-C'); homes.push(home);
    const task = 'BrainFactory Test-' + randomUUID().slice(0, 8); tasks.push(task);
    mkdirSync(join(home, 'runtime'), { recursive: true });
    writeFileSync(join(home, 'runtime', runtimeVersion + '-' + manifest.digest.slice(0, 12)), 'a FILE where the runtime directory must go: the injected install failure');
    const r1 = await run(exe, ['setup', '--api', W.node.baseUrl, '--home', home, '--task-name', task], { stdin: add.pairing_code + '\n' });
    const st1 = (await sup.query(`select state, state_reason from factory.enrollments where computer_id = $1`, [add.computer_id])).rows[0];
    rmSync(join(home, 'runtime', runtimeVersion + '-' + manifest.digest.slice(0, 12)), { force: true });
    // the retry: no code, nothing on standard input - the same credential, through the same gate
    const r2 = await run(exe, ['setup', '--api', W.node.baseUrl, '--home', home, '--task-name', task]);
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
  // ---- U8 (S-14, AC-12(e); after U3p on purpose - once a bound record reports this machine's fingerprint, every record of this machine is a
  // Home-computer record): the real runtime installed with the S-16(a) binding reaches ALIVE; its record is archived; setup on this same
  // machine with an UNBOUND Add Computer code is refused at registration by name (s16a_bound_fingerprint), the runtime stops REFUSED and
  // is not retried, a second setup is refused the same way, and the record runs nothing
  const H = await install('RT-H', { bind: true });
  const hState = (await sup.query(`select state from factory.enrollments where computer_id = $1`, [H.add.computer_id])).rows[0];
  await admin.call('archive', { computer_id: H.add.computer_id }, founder.token);
  const U = await install('RT-U');
  const uEnr = (await sup.query(`select state, state_reason from factory.enrollments where computer_id = $1`, [U.add.computer_id])).rows[0];
  const uAgain = await run(exe, ['setup', '--api', W.node.baseUrl, '--home', U.home, '--task-name', U.task]);
  const uRuns = (await sup.query(`select count(*)::int n from factory.agent_runs where computer_id = $1`, [U.add.computer_id])).rows[0].n;
  const named = (r) => /s16a_bound_fingerprint/.test(r.stdout || '') && /Add Computer WITH the binding/.test(r.stdout || '');
  row('U8 the runtime installed with the S-16(a) binding reaches ALIVE; after its record is archived, setup on this machine with an unbound Add Computer code is refused at registration by name (s16a_bound_fingerprint), REGISTRATION_FAILED in server rows, the runtime REFUSED; a second setup is refused the same way; no run is recorded',
    H.r.status === 0 && hState && hState.state === 'ALIVE' && U.r.status === 7 && named(U.r) && uEnr && uEnr.state === 'REGISTRATION_FAILED' && uEnr.state_reason === 's16a_bound_fingerprint'
      && statusOf(U.home).state === 'REFUSED' && uAgain.status === 7 && named(uAgain) && uRuns === 0,
    JSON.stringify({ h: [H.r.status, hState && hState.state], u: [U.r.status, uEnr, statusOf(U.home).state], again: uAgain.status, runs: uRuns, out: (U.r.stdout || '').trim().split(/\r?\n/).slice(-2) }).slice(0, 900));
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

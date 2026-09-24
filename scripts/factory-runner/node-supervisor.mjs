#!/usr/bin/env node
// THE NODE SUPERVISOR - what keeps a Factory node running across crashes and reboots without a founder at the keyboard.
//
//   node scripts/factory-runner/node-supervisor.mjs [--env-file <p>] [--role generic|verifier|release_broker] [--log-dir <d>]
//   node scripts/factory-runner/node-supervisor.mjs --stop        ask a running supervisor (same checkout) to stop cleanly
//   node scripts/factory-runner/node-supervisor.mjs --status      print .factory/node-status.json and exit
//
// It reads FACTORY_RUNNER_PG_URL from the env file (default %USERPROFILE%/.brain-factory/runner.env, the file
// provision-control-plane.mjs --write-env produced), never prints it, and runs `node.mjs start` as a child process. When
// the child exits for any reason it is restarted with bounded backoff (5 s doubling to 5 min; a child that lived ten
// minutes resets the backoff). It stops only when asked: a `.factory/node.stop` file, --stop, SIGINT or SIGTERM.
// One instance per checkout (pid file). Everything it knows is in .factory/node-status.json for `status` and for the
// reboot-recovery acceptance; the child's output goes to a daily log under the log dir (14 days kept).
//
// Exit codes: 0 stopped when asked; 2 bad arguments or no usable env file; 3 another supervisor already runs for this
// checkout; 5 the runtime dependencies are not installed at their locked versions (deps.mjs) - `npm ci` fixes it, and the
// supervisor never starts or restarts a worker that could not load its driver.
//
// The scheduled task install-autostart.ps1 registers is what launches this at logon and at boot; the supervisor is what
// makes "PROCESS LIFETIME != NODE LIFETIME" true between reboots as well as within one session.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const STATE_DIR = process.env.FACTORY_STATE_DIR ? resolve(process.env.FACTORY_STATE_DIR) : join(ROOT, '.factory');
const PID_FILE = join(STATE_DIR, 'node-supervisor.pid');
const STATUS_FILE = join(STATE_DIR, 'node-status.json');
const STOP_FILE = join(STATE_DIR, 'node.stop');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);
const ENV_FILE = resolve(opt('--env-file', process.env.FACTORY_RUNNER_ENV_FILE || join(homedir(), '.brain-factory', 'runner.env')));
const ROLE = opt('--role', process.env.FACTORY_NODE_ROLE || 'generic');
const LOG_DIR = resolve(opt('--log-dir', join(homedir(), '.brain-factory', 'logs')));
const MIN_BACKOFF_MS = 5000, MAX_BACKOFF_MS = 300000, HEALTHY_RUN_MS = 10 * 60000;

const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const readStatus = () => { try { return JSON.parse(readFileSync(STATUS_FILE, 'utf8')); } catch { return null; } };
const writeStatus = (s) => { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(STATUS_FILE, JSON.stringify(s, null, 2)); };

if (has('--status')) { const s = readStatus(); console.log(s ? JSON.stringify(s, null, 2) : 'no status file (' + STATUS_FILE + ')'); process.exit(s ? 0 : 1); }
if (has('--stop')) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STOP_FILE, String(Date.now()));
  const pid = existsSync(PID_FILE) ? Number(readFileSync(PID_FILE, 'utf8')) : 0;
  console.log(pid && isAlive(pid) ? 'stop requested; supervisor ' + pid + ' will end its child and exit' : 'stop requested; no supervisor appears to be running (pid file ' + (pid || 'absent') + ')');
  process.exit(0);
}

if (!['generic', 'verifier', 'release_broker'].includes(ROLE)) { console.log('role must be generic | verifier | release_broker'); process.exit(2); }
// The env file is read through the shared loader, which resolves the CA path for THIS machine (the recorded path is the
// provisioning machine's; a copied file on the Work PC points at a CA that lives somewhere else there).
const { loadRunnerUrl } = await import('./runner-env.mjs');
const loaded = loadRunnerUrl(ENV_FILE);
if (!loaded.url) { console.log(loaded.note); process.exit(2); }
const RUNNER_URL = loaded.url;
const ENV_NOTE = loaded.note;

// one instance per checkout
mkdirSync(STATE_DIR, { recursive: true });
if (existsSync(PID_FILE)) {
  const old = Number(readFileSync(PID_FILE, 'utf8'));
  if (old && old !== process.pid && isAlive(old)) { console.log('a supervisor is already running for this checkout (pid ' + old + '); nothing to do'); process.exit(3); }
}
writeFileSync(PID_FILE, String(process.pid));
if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE); // a stale stop request from before does not stop a fresh start
mkdirSync(LOG_DIR, { recursive: true });

// NOTHING SECRET REACHES A LOG. The child prints host, database and role, never the URL - but a driver error could quote a
// connection string, so every line written here has the credential's password and the whole URL scrubbed first.
const secrets = (() => { try { const u = new URL(RUNNER_URL); return [RUNNER_URL, decodeURIComponent(u.password), u.password].filter((x) => x && x.length >= 6); } catch { return [RUNNER_URL]; } })();
const scrub = (s) => secrets.reduce((acc, sec) => acc.split(sec).join('<redacted>'), String(s));
const logName = () => join(LOG_DIR, 'node-' + new Date().toISOString().slice(0, 10) + '.log');
const log = (m) => { const l = new Date().toISOString() + ' [supervisor ' + process.pid + '] ' + scrub(m) + '\n'; try { writeFileSync(logName(), l, { flag: 'a' }); } catch { /* disk */ } process.stdout.write(l); };

// EXACTLY ONE WORKER PER NODE IDENTITY. A supervisor that crashed leaves its child running; a new supervisor that simply
// spawned another would put the same node id on the plane twice, and two workers with one identity is how a lease looks
// held by a process that has stopped heartbeating it. The orphan is ended first (the lease and checkpoint model absorbs a
// killed worker; it does not absorb two of them).
{
  const prev = readStatus();
  if (prev && prev.childPid && prev.childPid !== process.pid && isAlive(prev.childPid)) {
    try { process.kill(prev.childPid); } catch { /* raced */ }
    const t0 = Date.now(); while (isAlive(prev.childPid) && Date.now() - t0 < 5000) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200); }
    log('orphaned node (pid ' + prev.childPid + ') from a previous supervisor ended before starting a new one');
  }
}
const rotate = () => { try { const keep = 14; const files = readdirSync(LOG_DIR).filter((f) => /^node-\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort(); for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(LOG_DIR, f), { force: true }); } catch { /* best effort */ } };

const status = { supervisorPid: process.pid, role: ROLE, envFile: ENV_FILE, logDir: LOG_DIR, stateDir: STATE_DIR, startedAt: new Date().toISOString(), childPid: null, childStartedAt: null, restarts: 0, consecutiveFailures: 0, lastExit: null, state: 'starting' };
writeStatus(status);
log('supervisor started; role ' + ROLE + '; env file ' + ENV_FILE + ' (URL not printed; ' + ENV_NOTE + '); state dir ' + STATE_DIR);

// A WORKER THAT CANNOT LOAD ITS DRIVER IS NOT RESTARTED, IT IS REFUSED BY NAME. Before 2026-09-24 a checkout without `pg`
// (a fresh clone of a branch with no package-lock.json) started a worker that died on ERR_MODULE_NOT_FOUND within a second,
// and the supervisor backed off and tried again forever - a crash loop whose only trace was a stack in the log. The check is
// repeated before every restart, because node_modules can be removed under a running supervisor (npm ci does exactly that).
const { checkDependencies, describe: describeDeps } = await import('./deps.mjs');
const EXIT_DEPENDENCIES_MISSING = 5;
const refuseIfDependenciesMissing = () => {
  const deps = checkDependencies(ROOT);
  status.dependencies = describeDeps(deps);
  if (deps.ok) return;
  status.state = 'dependencies_missing'; status.childPid = null; status.stoppedAt = new Date().toISOString(); writeStatus(status);
  log(status.dependencies + ' - the supervisor exits (' + EXIT_DEPENDENCIES_MISSING + ') instead of restarting a worker that cannot load');
  try { unlinkSync(PID_FILE); } catch { /* gone */ }
  process.exit(EXIT_DEPENDENCIES_MISSING);
};
refuseIfDependenciesMissing();
log(status.dependencies);

let child = null, stopping = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stopRequested = () => stopping || existsSync(STOP_FILE);
const shutdown = (why) => { if (stopping) return; stopping = true; log('stopping: ' + why); if (child && child.exitCode === null) { try { child.kill(); } catch { /* gone */ } } };
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

while (!stopRequested()) {
  rotate();
  refuseIfDependenciesMissing();
  const started = Date.now();
  child = spawn(process.execPath, [join(HERE, 'node.mjs'), 'start'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, FACTORY_RUNNER_PG_URL: RUNNER_URL, FACTORY_NODE_ROLE: ROLE, FACTORY_STATE_DIR: STATE_DIR },
  });
  status.childPid = child.pid; status.childStartedAt = new Date().toISOString(); status.state = 'running'; writeStatus(status);
  log('node started (pid ' + child.pid + ')');
  const pipe = (stream) => stream.on('data', (d) => { try { writeFileSync(logName(), scrub(d), { flag: 'a' }); } catch { /* disk */ } });
  pipe(child.stdout); pipe(child.stderr);
  // while the worker runs, the stop file is watched here - the loop is otherwise waiting on the child
  const watcher = setInterval(() => { if (stopRequested() && child && child.exitCode === null) { stopping = true; try { child.kill(); } catch { /* gone */ } } }, 2000);
  const exit = await new Promise((r) => { child.on('exit', (code, signal) => r({ code, signal })); child.on('error', (e) => r({ code: null, signal: null, error: e.message })); });
  clearInterval(watcher);
  const lived = Date.now() - started;
  status.lastExit = { ...exit, at: new Date().toISOString(), livedMs: lived };
  if (lived >= HEALTHY_RUN_MS) status.consecutiveFailures = 0;
  status.consecutiveFailures += 1;
  if (stopRequested()) break;
  status.restarts += 1;
  const backoff = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** (status.consecutiveFailures - 1));
  status.state = 'backoff'; status.nextStartAt = new Date(Date.now() + backoff).toISOString(); writeStatus(status);
  log('node exited (' + JSON.stringify(exit) + ') after ' + Math.round(lived / 1000) + ' s; restart ' + status.restarts + ' in ' + Math.round(backoff / 1000) + ' s');
  const until = Date.now() + backoff;
  while (Date.now() < until && !stopRequested()) await sleep(Math.min(2000, until - Date.now()));
}
status.state = 'stopped'; status.childPid = null; status.stoppedAt = new Date().toISOString(); writeStatus(status);
try { unlinkSync(PID_FILE); } catch { /* gone */ }
try { unlinkSync(STOP_FILE); } catch { /* gone */ }
log('supervisor stopped');
process.exit(0);

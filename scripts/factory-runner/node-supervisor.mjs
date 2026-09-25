#!/usr/bin/env node
// THE NODE SUPERVISOR - what keeps a Factory node running across crashes and reboots without a founder at the keyboard.
//
//   node scripts/factory-runner/node-supervisor.mjs [--runner-env <p>] [--role generic|verifier|release_broker] [--log-dir <d>]
//   node scripts/factory-runner/node-supervisor.mjs --whois       is a supervisor running for this state dir? (JSON; exit 0/1)
//   node scripts/factory-runner/node-supervisor.mjs --stop        ask it to stop cleanly (its worker with it)
//   node scripts/factory-runner/node-supervisor.mjs --status      print .factory/node-status.json - and STALE when it lies
//
// --runner-env, not --env-file: Node itself scans the whole command line for --env-file (arguments after the script included)
// and exits 9 when the file is missing, before this script runs - no named refusal, no log line (verification 2026-09-24).
// --env-file is still read when Node lets it through (the file exists), so tasks installed before the rename keep working.
//
// It reads FACTORY_RUNNER_PG_URL from the env file (default %USERPROFILE%/.brain-factory/runner.env, the file
// provision-control-plane.mjs --write-env produced), never prints it, and runs `node.mjs start` as a child process. When
// the child exits for any reason it is restarted with bounded backoff (5 s doubling to 5 min; a child that completed a CLAIM
// CYCLE - it logs "ready:" - or lived ten minutes resets the backoff). It stops only when asked: --stop (over its control pipe), a `.factory/node.stop` file,
// SIGINT/SIGTERM/SIGHUP, or - when the scheduled task launched it through a headless console host - that host exiting.
//
// ONE SUPERVISOR PER STATE DIR, BY LOCK. It holds an exclusive control pipe named from its state dir (proc.mjs) for its whole
// life; a second supervisor cannot, and exits 3. The pid file is kept for people to read, never trusted: after a reboot its
// number belongs to someone else, and a path spelling (relative, junction, non-ASCII) cannot prove who a process is
// (verification 2026-09-24, rounds 2 and 3). The worker carries this supervisor's instance token on its command line, which is
// how an orphaned worker is recognised after a supervisor crash.
//
// Every refusal leaves a trace a person can find: a log line and the status file (state + reason) - the task's console is
// headless and its exit code is not passed through.
//
// Exit codes: 0 stopped when asked; 2 bad arguments, an env file the shared judge (runner-env.mjs) does not pass - missing,
// not a URL, a URL the accessor refuses, a CA file missing here, not PEM or not a certificate - or a worker that REFUSED its
// configuration (exit 2 with "REFUSED", which no restart can fix); 3 another supervisor already runs for this state dir;
// 5 the runtime dependencies are not installed at their locked versions or do not load (deps.mjs) - `npm ci` fixes it.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
const ENV_FILE = resolve(opt('--runner-env', opt('--env-file', process.env.FACTORY_RUNNER_ENV_FILE || join(homedir(), '.brain-factory', 'runner.env'))));
const ROLE = opt('--role', process.env.FACTORY_NODE_ROLE || 'generic');
const LOG_DIR = resolve(opt('--log-dir', join(homedir(), '.brain-factory', 'logs')));
const MIN_BACKOFF_MS = 5000, MAX_BACKOFF_MS = 300000, HEALTHY_RUN_MS = 10 * 60000;

const { isAlive, isScriptProcess, commandLineOf, askSupervisor, holdControlPipe } = await import('./proc.mjs');
const readStatus = () => { try { return JSON.parse(readFileSync(STATUS_FILE, 'utf8')); } catch { return null; } };
const writeStatus = (s) => { try { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(STATUS_FILE, JSON.stringify(s, null, 2)); } catch { /* disk */ } };
// the console may be gone (a headless host that exited, a closed terminal): writing to it must never be what kills the node
process.stdout.on('error', () => { /* no console */ });
process.stderr.on('error', () => { /* no console */ });
const out = (s) => { try { process.stdout.write(s); } catch { /* no console */ } };

// ---- the read-only / control commands ---------------------------------------------------------------------------------------
if (has('--whois')) {
  const info = await askSupervisor(STATE_DIR, 'whois');
  out(JSON.stringify(info ? { running: true, ...info } : { running: false, stateDir: STATE_DIR }) + '\n');
  process.exit(info ? 0 : 1);
}
if (has('--status')) {
  const s = readStatus();
  const info = await askSupervisor(STATE_DIR, 'whois');
  out((s ? JSON.stringify(s, null, 2) : 'no status file (' + STATUS_FILE + ')') + '\n');
  // a status file is a record, not a fact: 'running' with no supervisor answering is said to be STALE
  if (s && ['starting', 'running', 'backoff'].includes(s.state) && !info) out('STALE: the recorded supervisor (pid ' + s.supervisorPid + ') is not running - the node is down\n');
  if (info) out('running: supervisor pid ' + info.pid + ', state ' + info.state + ', worker ' + info.childPid + ', role ' + info.role + '\n');
  process.exit(s ? 0 : 1);
}
if (has('--stop')) {
  const info = await askSupervisor(STATE_DIR, 'stop');
  // the stop file too: a supervisor from before the control pipe watches only that
  try { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(STOP_FILE, String(Date.now())); } catch { /* read-only */ }
  out((info ? 'stop requested; supervisor ' + info.pid + ' will end its worker and exit' : 'stop requested; no supervisor is running for ' + STATE_DIR) + '\n');
  process.exit(0);
}

// ---- a trace for every refusal: the log and the status file, before anything can exit ---------------------------------------
mkdirSync(STATE_DIR, { recursive: true });
try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* logged to stdout only */ }
let secrets = [];
const scrub = (s) => secrets.reduce((acc, sec) => acc.split(sec).join('<redacted>'), String(s));
const logName = () => join(LOG_DIR, 'node-' + new Date().toISOString().slice(0, 10) + '.log');
const log = (m) => { const l = new Date().toISOString() + ' [supervisor ' + process.pid + '] ' + scrub(m) + '\n'; try { writeFileSync(logName(), l, { flag: 'a' }); } catch { /* disk */ } out(l); };
const refuse = (code, state, why) => {
  log('REFUSED - ' + why + ' - the supervisor exits (' + code + ')');
  if (state) writeStatus({ supervisorPid: process.pid, role: ROLE, envFile: ENV_FILE, logDir: LOG_DIR, stateDir: STATE_DIR, startedAt: new Date().toISOString(), stoppedAt: new Date().toISOString(), childPid: null, state, refusal: scrub(why).slice(0, 400) });
  process.exit(code);
};

// (no status record: before the lock is held, the status file may belong to a supervisor that IS running - verification round 4)
if (!['generic', 'verifier', 'release_broker'].includes(ROLE)) refuse(2, null, 'role must be generic | verifier | release_broker, not ' + ROLE);

// THE COMMIT THIS SUPERVISOR RUNS (and whether its tracked files were changed), for the installer to compare with the checkout: after
// the checkout moved, a worker restarted by the old supervisor ran the new commit under the old supervisor's code, and -Verify passed
// (final verification 3, Work-PC probe). Read once, at start - it is the code this process loaded.
const gitOut = (args) => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 15000 }).trim(); } catch { return null; } };
const SUP_HEAD = gitOut(['rev-parse', 'HEAD']) || null;
const SUP_DIRTY = SUP_HEAD ? !!gitOut(['status', '--porcelain', '--untracked-files=no']) : null;

// ---- one supervisor per state dir, by lock ----------------------------------------------------------------------------------
const INSTANCE = randomUUID();
let status = null, child = null, stopping = false;
const shutdown = (why) => { if (stopping) return; stopping = true; log('stopping: ' + why); if (child && child.exitCode === null) { try { child.kill(); } catch { /* gone */ } } };
const held = await holdControlPipe(STATE_DIR,
  () => ({ pid: process.pid, instance: INSTANCE, root: ROOT, stateDir: STATE_DIR, role: ROLE, envFile: ENV_FILE, logDir: LOG_DIR, head: SUP_HEAD, dirty: SUP_DIRTY,
    state: status ? status.state : 'starting', childPid: status ? status.childPid : null, restarts: status ? status.restarts : 0, startedAt: status ? status.startedAt : null,
    nextStartAt: status && status.state === 'backoff' ? status.nextStartAt : null, readyAt: status ? status.readyAt || null : null,
    childStartedAt: status && status.childPid ? status.childStartedAt : null }),
  () => shutdown('stop requested over the control pipe'));
if (!held.held) {
  const other = await askSupervisor(STATE_DIR, 'whois');
  // not refuse(): the status file belongs to the supervisor that IS running
  log('a supervisor is already running for ' + STATE_DIR + (other ? ' (pid ' + other.pid + ', role ' + other.role + ')' : ' (' + held.error + ')') + '; nothing to do - exits (3)');
  process.exit(3);
}

// ---- the env file, judged by the one judge every gate uses ------------------------------------------------------------------
// It resolves the CA path for THIS machine (the recorded path is the provisioning machine's). Anything the worker would refuse
// or fail on at connect time is refused HERE, by name, before a worker is started.
const { loadRunnerUrl } = await import('./runner-env.mjs');
const loaded = loadRunnerUrl(ENV_FILE);
if (!loaded.usable) refuse(2, 'refused', loaded.note);
let RUNNER_URL = loaded.url;
let envSeen = (() => { try { return readFileSync(ENV_FILE, 'utf8'); } catch { return null; } })();
// NOTHING SECRET REACHES A LOG. The child prints host, database and role, never the URL - but a driver error could quote a
// connection string, so every line written here has the credential's password and the whole URL scrubbed first.
secrets = (() => { try { const u = new URL(RUNNER_URL); return [RUNNER_URL, decodeURIComponent(u.password), u.password].filter((x) => x && x.length >= 6); } catch { return [RUNNER_URL]; } })();

// ---- exactly one worker per node identity -----------------------------------------------------------------------------------
// A supervisor that crashed leaves its worker running. That worker is recognised by the instance token its supervisor put on its
// command line - never by a bare pid, which after a reboot belongs to whatever process Windows handed it to.
{
  const prev = readStatus();
  if (prev && prev.childPid && prev.childPid !== process.pid && isAlive(prev.childPid)) {
    const ours = prev.instance ? isScriptProcess(prev.childPid, null, ['node.mjs', prev.instance]) : isScriptProcess(prev.childPid, join(HERE, 'node.mjs'), ['start']);
    if (ours) {
      try { process.kill(prev.childPid); } catch { /* raced */ }
      const t0 = Date.now(); while (isAlive(prev.childPid) && Date.now() - t0 < 5000) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200); }
      log('orphaned node (pid ' + prev.childPid + ') from a previous supervisor ended before starting a new one');
    } else log('stale worker pid ' + prev.childPid + ' in the status file belongs to another process (a reused pid); not touched');
  }
  if (prev && prev.supervisorPid && prev.supervisorPid !== process.pid && isAlive(prev.supervisorPid) && ['starting', 'running', 'backoff'].includes(prev.state)) log('stale pid ' + prev.supervisorPid + ' in the status file is not a supervisor of this state dir (the control pipe was free); ignored');
}
writeFileSync(PID_FILE, String(process.pid)); // for people to read; never trusted
if (existsSync(STOP_FILE)) unlinkSync(STOP_FILE); // a stale stop request from before does not stop a fresh start
const rotate = () => { try { const keep = 14; const files = readdirSync(LOG_DIR).filter((f) => /^node-\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort(); for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(LOG_DIR, f), { force: true }); } catch { /* best effort */ } };

status = { supervisorPid: process.pid, instance: INSTANCE, role: ROLE, envFile: ENV_FILE, logDir: LOG_DIR, stateDir: STATE_DIR, head: SUP_HEAD, dirty: SUP_DIRTY, startedAt: new Date().toISOString(), childPid: null, childStartedAt: null, restarts: 0, consecutiveFailures: 0, lastExit: null, state: 'starting' };
writeStatus(status);
log('supervisor started; role ' + ROLE + '; env file ' + ENV_FILE + ' (URL not printed; ' + loaded.note + '); state dir ' + STATE_DIR);

// A WORKER THAT CANNOT LOAD ITS DRIVER IS NOT RESTARTED, IT IS REFUSED BY NAME. The check is repeated before every restart,
// because node_modules can be removed or damaged under a running supervisor (npm ci does exactly that).
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stopRequested = () => stopping || existsSync(STOP_FILE);
// The worker's environment: this supervisor's, minus every libpq variable (PGUSER, PGPASSWORD, PGHOST, ... - pg reads them for
// anything the URL leaves out; the judge already requires the URL to name everything), plus the URL, role and state dir.
const workerEnv = () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG[A-Z]/.test(k)));
  return { ...env, FACTORY_RUNNER_PG_URL: RUNNER_URL, FACTORY_NODE_ROLE: ROLE, FACTORY_STATE_DIR: STATE_DIR };
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// a closed console (CTRL_CLOSE_EVENT arrives as SIGHUP on Windows) ends the supervisor with a truthful 'stopped' state
process.on('SIGHUP', () => shutdown('the console was closed (SIGHUP)'));
// STOPPING THE TASK STOPS THE NODE. Under the scheduled task the supervisor's parent is a headless console host; Stop-ScheduledTask
// kills that host and nothing else, and the supervisor used to run on unmanaged until a write to the vanished console crashed it
// (verification round 3). When the parent is that host, its exit is a stop request.
if (process.platform === 'win32' && /conhost(\.exe)?"?\s+--headless/i.test(commandLineOf(process.ppid) || '')) {
  const host = process.ppid;
  log('launched by the scheduled task through a headless console host (pid ' + host + '); its exit stops this supervisor');
  setInterval(() => { if (!isAlive(host)) shutdown('the scheduled task was stopped (its console host ' + host + ' exited)'); }, 2000).unref();
}

while (!stopRequested()) {
  rotate();
  refuseIfDependenciesMissing();
  // THE ENV FILE IS READ AGAIN BEFORE EVERY START. A supervisor kept the URL it read at its own start for its whole life: after the
  // file was fixed or the credential rotated, its worker kept failing on the old one until someone re-installed
  // (verification round 4). A file that turned unusable is a refusal, by name.
  {
    const now = (() => { try { return readFileSync(ENV_FILE, 'utf8'); } catch { return null; } })();
    if (now !== envSeen) {
      const again = loadRunnerUrl(ENV_FILE);
      if (!again.usable) { status.state = 'refused'; status.refusal = again.note.slice(0, 400); status.childPid = null; status.stoppedAt = new Date().toISOString(); writeStatus(status); log('REFUSED - the env file changed and can no longer be used: ' + again.note + ' - the supervisor exits (2)'); try { unlinkSync(PID_FILE); } catch { /* gone */ } process.exit(2); }
      RUNNER_URL = again.url; envSeen = now;
      // additive: the previous credential stays scrubbed too
      secrets = [...new Set([...secrets, ...(() => { try { const u = new URL(RUNNER_URL); return [RUNNER_URL, decodeURIComponent(u.password), u.password].filter((x) => x && x.length >= 6); } catch { return [RUNNER_URL]; } })()])];
      log('the env file changed: the next worker uses it (' + again.note + ')');
    }
  }
  // (durations on the monotonic clock: a wall-clock step back during a backoff kept the node down for the length of the step - final
  // verification 5, the class the lease guard was fixed for)
  const started = performance.now();
  child = spawn(process.execPath, [join(HERE, 'node.mjs'), 'start', '--supervisor-instance', INSTANCE], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: workerEnv(),
  });
  status.childPid = child.pid; status.childStartedAt = new Date().toISOString(); status.state = 'running'; status.nextStartAt = null; status.readyAt = null; writeStatus(status);
  log('node started (pid ' + child.pid + ')');
  let tail = '';
  // A WORKER THAT COMPLETED A CLAIM CYCLE RESETS THE BACKOFF. Only ten minutes of uptime did: a run of short losses walked the
  // backoff up to 5 minutes while the plane was reachable (verification round 4). Not the registration: a worker that registers
  // and then fails every claim (a revoked grant, a missing column) reset it every time and crash-looped every 6 s forever (final
  // verification 2026-09-24). The worker prints "ready:" once its first claim cycle is done.
  const pipe = (stream) => stream.on('data', (d) => {
    tail = (tail + d).slice(-4096);
    try { writeFileSync(logName(), scrub(d), { flag: 'a' }); } catch { /* disk */ }
    if (!status.readyAt && /\] ready: first claim cycle completed/.test(tail)) { status.readyAt = new Date().toISOString(); status.consecutiveFailures = 0; writeStatus(status); }
  });
  pipe(child.stdout); pipe(child.stderr);
  // while the worker runs, the stop file is watched here - the loop is otherwise waiting on the child
  const watcher = setInterval(() => { if (stopRequested() && child && child.exitCode === null) { stopping = true; try { child.kill(); } catch { /* gone */ } } }, 2000);
  const exit = await new Promise((r) => { child.on('exit', (code, signal) => r({ code, signal })); child.on('error', (e) => r({ code: null, signal: null, error: e.message })); });
  clearInterval(watcher);
  const lived = performance.now() - started;
  status.lastExit = { ...exit, at: new Date().toISOString(), livedMs: lived };
  status.lastChildPid = status.childPid; status.childPid = null; // an exited worker's pid is not left behind for a reused number
  if (lived >= HEALTHY_RUN_MS) status.consecutiveFailures = 0;
  status.consecutiveFailures += 1;
  if (stopRequested()) break;
  // A worker that REFUSED its configuration (db.mjs: not set, not a URL, superuser, production, plaintext) exits 2 and would
  // refuse identically on every restart: that is terminal, reported by name, not retried with backoff forever.
  if (exit.code === 2 && /REFUSED/.test(tail)) {
    const why = (tail.split(/\r?\n/).filter((l) => /REFUSED/.test(l)).pop() || 'REFUSED').trim();
    status.state = 'refused'; status.refusal = scrub(why).slice(0, 400); status.stoppedAt = new Date().toISOString(); writeStatus(status);
    log('the worker refused its configuration: ' + why + ' - the supervisor exits (2) instead of restarting it');
    try { unlinkSync(PID_FILE); } catch { /* gone */ }
    process.exit(2);
  }
  status.restarts += 1;
  const backoff = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** (status.consecutiveFailures - 1));
  status.state = 'backoff'; status.nextStartAt = new Date(Date.now() + backoff).toISOString(); writeStatus(status);
  log('node exited (' + JSON.stringify(exit) + ') after ' + Math.round(lived / 1000) + ' s; restart ' + status.restarts + ' in ' + Math.round(backoff / 1000) + ' s');
  const until = performance.now() + backoff;
  while (performance.now() < until && !stopRequested()) await sleep(Math.min(2000, until - performance.now()));
}
status.state = 'stopped'; status.childPid = null; status.stoppedAt = new Date().toISOString(); writeStatus(status);
try { unlinkSync(PID_FILE); } catch { /* gone */ }
try { unlinkSync(STOP_FILE); } catch { /* gone */ }
log('supervisor stopped');
process.exit(0);

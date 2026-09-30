// THE REAL RUNTIME CODE ON THIS MACHINE, WITHOUT A LOGON TASK (developer verification). Each "install" is its own node process that
// runs the runtime's own modules - setup.mjs enrollNew (a new key stored with DPAPI, the plane's clock, the pairing code read from
// standard input, enroll/start reporting identity.mjs's machine fingerprint, enroll/complete), then the installer's
// RUNTIME_INSTALLING report, then worker.mjs runWorker for one cycle (register with the machine fingerprint, heartbeat, reconcile,
// claim what its handlers do) - in its own home. Nothing is injected: the fingerprint each process reports is the one the runtime
// computes. The pairing code reaches the child on standard input only, never on a command line (S-12). No scheduled task is
// registered and no supervisor is started, so the rows that use this run where an interactive logon is not available.
//   registryFingerprint()   the machine fingerprint computed independently of the runtime: PowerShell reads the MachineGuid value
//                           exactly as stored (base64 of its UTF-8 bytes on the way out), then sha256 here
//   realEnroll(...)         one new "install": enroll with the code, report RUNTIME_INSTALLING, one worker cycle
//   realWork(...)           one more worker cycle in an existing home
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertNoCodeInArgv } from './canary.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const ENROLLED = join(ROOT, 'scripts', 'factory-runner', 'enrolled');
const SELF = fileURLToPath(import.meta.url);

export function registryFingerprint() {
  const ps = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const out = execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command',
    '$v = (Get-ItemProperty -LiteralPath "HKLM:\\SOFTWARE\\Microsoft\\Cryptography" -Name MachineGuid).MachineGuid; '
    + '[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$v)))'], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  const bytes = Buffer.from(out.trim(), 'base64');
  return { length: bytes.length, fingerprint: bytes.length ? createHash('sha256').update(bytes).digest('hex') : null };
}

const child = (args, stdin) => new Promise((resolve) => {
  assertNoCodeInArgv(args);
  const c = spawn(process.execPath, [SELF, ...args], { windowsHide: true, env: { ...process.env, BRAIN_FACTORY_ECHO: '' } });
  let stdout = '', stderr = '';
  c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; });
  c.stdin.on('error', () => { /* the child may exit before reading */ });
  c.stdin.end(stdin || '');
  const t = setTimeout(() => { try { c.kill(); } catch { /* gone */ } }, 180000);
  c.on('exit', (status) => {
    clearTimeout(t);
    const worker = /^WORKER_EXIT (\d+)$/m.exec(stdout);
    resolve({ status, stdout, stderr, workerExit: worker ? Number(worker[1]) : null });
  });
});

/** a new install in `home`: the code on standard input, then RUNTIME_INSTALLING, then one worker cycle */
export const realEnroll = ({ api, home, code, version, digest }) => child(['enroll', api, home, version, digest], code + '\n');
/** one more worker cycle in `home` */
export const realWork = ({ home, version, digest }) => child(['work', '-', home, version, digest], '');

// ---- the child
if (process.argv[1] && join(process.argv[1]) === join(SELF)) {
  const [mode, api, home, version, digest] = process.argv.slice(2);
  const imp = (f) => import(pathToFileURL(join(ENROLLED, f)).href);
  const say = (s) => process.stdout.write(s + '\n');
  try {
    const { runWorker } = await imp('worker.mjs');
    if (mode === 'enroll') {
      const { enrollNew } = await imp('setup.mjs');
      const { NodeApi } = await imp('api.mjs');
      const e = await enrollNew({ api, home, channel: 'dev', say });
      if (!e.ok) { say('ENROLL_EXIT ' + e.exit); throw new Error('enrollment refused (exit ' + e.exit + ')'); }
      const node = new NodeApi({ api, key: e.key });
      await node.time();
      const inst = await node.op('report-state', { enrollment_step: 'RUNTIME_INSTALLING' });
      say('INSTALLING ' + (inst.ok ? 'ok' : inst.refused));
    }
    const code = await runWorker({ home, runtime: { version, digest }, once: true, pollMs: 200 });
    say('WORKER_EXIT ' + code);
    process.exitCode = 0; // the process ends by itself once its connections close (an explicit exit while they close can crash on Windows)
  } catch (err) {
    say('CHILD_ERROR ' + ((err && err.stack) || err));
    process.exitCode = 1;
  }
}

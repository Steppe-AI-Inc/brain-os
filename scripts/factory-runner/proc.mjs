// WHAT IS THIS PID, REALLY? AND IS A SUPERVISOR RUNNING FOR THIS STATE DIR?
//
// The supervisor keeps process ids in files (its pid file, the worker's pid in node-status.json). After a hard stop or a
// reboot those numbers are stale, and Windows hands them to other processes. A supervisor that trusted a bare pid refused to
// start because some unrelated process now held the old supervisor's number, and - worse - "ended the orphaned worker" by
// killing whatever process now held the old worker's number (independent verification, 2026-09-24; the defect predates the
// packaging fix).
//
// THE SUPERVISOR'S IDENTITY IS A LOCK, NOT A SPELLING OF ITS PATH. Matching a command line against one path spelling failed for
// a supervisor launched through a relative path, a junction, or a non-ASCII user folder (the query even returned '???' for
// Cyrillic): not recognised, so a second supervisor started and two workers ran under one node id (verification round 3). And a
// relative path cannot be resolved at all, because Windows does not expose another process's working directory. So each
// supervisor holds an exclusive CONTROL PIPE named from its state directory (a named pipe on Windows, a unix socket elsewhere):
// only one process can listen on it, it vanishes with the process, and it answers "who are you" and "stop". The worker's
// identity is the instance token the supervisor put on its command line - an ASCII uuid, whatever the path looks like.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const isAlive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e && e.code === 'EPERM'; } };

export function commandLineOf(pid) {
  pid = Number(pid);
  if (!Number.isInteger(pid) || pid <= 0) return '';
  if (process.platform === 'win32') {
    // UTF-8 out, or a non-ASCII path comes back as '???' (PowerShell writes the OEM code page by default)
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8; $p = Get-CimInstance Win32_Process -Filter "ProcessId=' + pid + '"; if ($p) { [Console]::Out.Write([string]$p.CommandLine) }'],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    return r.status === 0 ? (r.stdout || '') : null;
  }
  try { return readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0').join(' ').trim(); } catch { /* not Linux, or gone */ }
  const r = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : (r.status === 1 ? '' : null);
}

const norm = (s) => { const t = String(s).replace(/\\/g, '/'); return process.platform === 'win32' ? t.toLowerCase() : t; };

/** Is `pid` a live process whose command line contains every word in `words` (a script path, an instance token)? */
export function isScriptProcess(pid, scriptPath, mustInclude = []) {
  if (!isAlive(pid)) return false;
  const cl = commandLineOf(pid);
  if (!cl) return false; // gone, or unreadable (another user's process is never ours)
  const c = norm(cl);
  return (!scriptPath || c.includes(norm(scriptPath))) && mustInclude.every((w) => c.includes(norm(w)));
}

// ---- the control pipe --------------------------------------------------------------------------------------------------------
/** The control pipe's address for a state directory - the same from any spelling of the path (realpath, case on Windows). */
export function controlPath(stateDir) {
  let p = resolve(stateDir);
  try { p = realpathSync.native(p); } catch { /* not created yet: nothing can be listening on it */ }
  if (process.platform === 'win32') p = p.toLowerCase();
  const key = createHash('sha256').update(p).digest('hex').slice(0, 24);
  return process.platform === 'win32' ? '\\\\.\\pipe\\brainos-factory-supervisor-' + key : join(tmpdir(), 'brainos-factory-supervisor-' + key + '.sock');
}

/** Ask the supervisor of `stateDir` (command 'whois' or 'stop'). Resolves its info, or null when none is listening. */
export function askSupervisor(stateDir, command = 'whois', timeoutMs = 4000) {
  return new Promise((done) => {
    const sock = net.connect(controlPath(stateDir));
    let buf = '', settled = false;
    const finish = (v) => { if (settled) return; settled = true; clearTimeout(t); try { sock.destroy(); } catch { /* gone */ } done(v); };
    const t = setTimeout(() => finish(null), timeoutMs);
    sock.on('connect', () => sock.write(command + '\n'));
    sock.on('data', (d) => { buf += d; const i = buf.indexOf('\n'); if (i > -1) { try { finish(JSON.parse(buf.slice(0, i))); } catch { finish(null); } } });
    sock.on('error', () => finish(null));
    sock.on('close', () => finish(null));
  });
}

/**
 * Hold the control pipe for this process's lifetime. Resolves {held:true, server} when this process now owns it, or
 * {held:false} when another live process does. A unix socket left behind by a crash is detected (nothing answers) and replaced.
 * `answer(command)` returns the info object sent back; 'stop' is also passed to onStop.
 */
export function holdControlPipe(stateDir, answer, onStop) {
  const path = controlPath(stateDir);
  const server = net.createServer((sock) => {
    let buf = '';
    sock.on('error', () => { /* a client that went away */ });
    sock.on('data', (d) => {
      buf += d; const i = buf.indexOf('\n'); if (i < 0) return;
      const cmd = buf.slice(0, i).trim();
      try { sock.end(JSON.stringify(answer(cmd)) + '\n'); } catch { /* gone */ }
      if (cmd === 'stop') onStop();
    });
  });
  const listen = () => new Promise((ok) => {
    server.once('error', (e) => ok(e));
    server.listen(path, () => ok(null));
  });
  return (async () => {
    let err = await listen();
    if (err && err.code === 'EADDRINUSE' && process.platform !== 'win32') {
      // a socket file from a crashed supervisor: nothing answers on it
      if (!(await askSupervisor(stateDir, 'whois', 1500))) { try { if (existsSync(path)) unlinkSync(path); } catch { /* raced */ } err = await listen(); }
    }
    if (err) return { held: false, error: err.code || String(err) };
    server.unref();
    return { held: true, server, path };
  })();
}

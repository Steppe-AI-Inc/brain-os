// WHAT IS THIS PID, REALLY?
//
// The supervisor keeps process ids in files (its pid file, the worker's pid in node-status.json). After a hard stop or a
// reboot those numbers are stale, and Windows hands them to other processes. A supervisor that trusted a bare pid refused to
// start because some unrelated process now held the old supervisor's number, and - worse - "ended the orphaned worker" by
// killing whatever process now held the old worker's number (independent verification, 2026-09-24; the defect predates the
// packaging fix). So a recorded pid is trusted only when the process's own command line says it is THIS checkout's script.
//
// commandLineOf(pid): the command line, '' when there is no such process, null when it cannot be read.
// isScriptProcess(pid, scriptPath, mustInclude): true only when the process runs scriptPath (and every extra word given).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const isAlive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e && e.code === 'EPERM'; } };

export function commandLineOf(pid) {
  pid = Number(pid);
  if (!Number.isInteger(pid) || pid <= 0) return '';
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      '$p = Get-CimInstance Win32_Process -Filter "ProcessId=' + pid + '"; if ($p) { [Console]::Out.Write([string]$p.CommandLine) }'],
    { encoding: 'utf8', windowsHide: true, timeout: 30000 });
    return r.status === 0 ? (r.stdout || '') : null;
  }
  try { return readFileSync('/proc/' + pid + '/cmdline', 'utf8').split('\0').join(' ').trim(); } catch { /* not Linux, or gone */ }
  const r = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : (r.status === 1 ? '' : null);
}

const norm = (s) => { const t = String(s).replace(/\\/g, '/'); return process.platform === 'win32' ? t.toLowerCase() : t; };

/** Is `pid` a live process running `scriptPath` (an absolute path) with every word in `mustInclude` on its command line? */
export function isScriptProcess(pid, scriptPath, mustInclude = []) {
  if (!isAlive(pid)) return false;
  const cl = commandLineOf(pid);
  if (!cl) return false; // gone, or unreadable (another user's process is never ours)
  const c = norm(cl);
  return c.includes(norm(scriptPath)) && mustInclude.every((w) => c.includes(norm(w)));
}

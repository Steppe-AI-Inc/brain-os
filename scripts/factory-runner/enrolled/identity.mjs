// WHAT THIS COMPUTER REPORTS ABOUT ITSELF - descriptive only (S-1): it never grants anything, and the fingerprint only ever refuses
// (S-16b). Authority comes from the credential and the envelope the plane holds.
//   fingerprint  sha256 of the Windows MachineGuid (HKLM\SOFTWARE\Microsoft\Cryptography), readable by a standard user; the same for
//                every enrollment and run on one PC (contract §1)
//   resources    the resource profile the gates' minimum-resource check and the ranking read: cores, CPU busy %, free RAM, free disk
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { statfsSync } from 'node:fs';
import os from 'node:os';

let cachedFingerprint;
export function machineFingerprint() {
  if (cachedFingerprint !== undefined) return cachedFingerprint;
  cachedFingerprint = null;
  if (process.platform === 'win32') {
    const r = spawnSync(process.env.SystemRoot ? process.env.SystemRoot + '\\System32\\reg.exe' : 'reg.exe',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
    const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/.exec(r.stdout || '');
    if (m) cachedFingerprint = createHash('sha256').update(m[1].toLowerCase()).digest('hex');
  }
  return cachedFingerprint;
}

let lastCpu = null;
function cpuBusyPct() {
  const t = os.cpus().reduce((a, c) => { const x = c.times; a.idle += x.idle; a.total += x.user + x.nice + x.sys + x.idle + x.irq; return a; }, { idle: 0, total: 0 });
  const prev = lastCpu; lastCpu = t;
  if (!prev || t.total <= prev.total) return null;
  return Math.round(100 * (1 - (t.idle - prev.idle) / (t.total - prev.total)));
}

export function resources(home) {
  let disk = null;
  try { const s = statfsSync(home || os.homedir()); disk = Math.floor((Number(s.bavail) * Number(s.bsize)) / 1048576); } catch { /* unknown */ }
  const r = { cpu_cores: os.cpus().length, ram_total_mb: Math.floor(os.totalmem() / 1048576), ram_free_mb: Math.floor(os.freemem() / 1048576) };
  const c = cpuBusyPct(); if (c !== null) r.cpu_pct = c;
  if (disk !== null) r.disk_free_mb = disk;
  return r;
}

export const hostname = () => os.hostname();
export const osName = () => os.type() + ' ' + os.release() + ' ' + os.arch();

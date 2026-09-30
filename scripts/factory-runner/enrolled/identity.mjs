// WHAT THIS COMPUTER REPORTS ABOUT ITSELF - descriptive only (S-1): it never grants anything, and the fingerprint only ever refuses
// (S-16b). Authority comes from the credential and the envelope the plane holds.
//   fingerprint  the lowercase hex sha256 of the UTF-8 bytes of the Windows MachineGuid registry string (HKLM\SOFTWARE\Microsoft\
//                Cryptography), EXACTLY AS STORED - no case change, no shape filter, no trimming (contract §1 r3); readable by a
//                standard user and the same for every enrollment and run on one PC
//   resources    the resource profile the gates' minimum-resource check and the ranking read: cores, CPU busy %, free RAM, free disk
// HOW THE VALUE IS READ, EXACTLY: Windows PowerShell (by its fixed System32 path; Sysnative from a 32-bit process) opens the registry's
// 64-bit view explicitly, reads MachineGuid without expanding anything, and writes the UTF-8 bytes of that string as base64 - so no
// console code page, no WOW64 redirection and no text parsing can change a byte on the way. The bytes are hashed as received.
// A read that fails is named (fingerprintProblem(), and the worker's status) and tried again later; a value, once read, is kept for
// the life of the process. The WORKER reads it asynchronously (machineFingerprintAsync): while PowerShell runs - however long it
// takes, up to its 30 s timeout - the worker's event loop keeps serving its pipe ("whois", "stop") and its timers; it still waits
// for the read before a request that carries the fingerprint, so the value it reports is the same. Setup, a one-shot process with
// nothing else to serve, reads it synchronously (machineFingerprint).
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, statfsSync } from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

/** the fingerprint of a MachineGuid value: sha256 over its UTF-8 bytes (a string is encoded as UTF-8; bytes are hashed as they are) */
export function fingerprintOf(value) {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.isBuffer(value) ? value : null;
  return bytes ? createHash('sha256').update(bytes).digest('hex') : null;
}

// the one fixed script: no value is interpolated into it
export const MACHINE_GUID_SCRIPT = "$ErrorActionPreference = 'Stop'; "
  + '$k = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64); '
  + "$s = $k.OpenSubKey('SOFTWARE\\Microsoft\\Cryptography'); "
  + "if ($null -eq $s) { [Console]::Out.Write('NO_KEY') } else { "
  + "$v = $s.GetValue('MachineGuid', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); "
  + "if ($v -is [string]) { [Console]::Out.Write('B64:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($v))) } "
  + "elseif ($null -eq $v) { [Console]::Out.Write('NO_VALUE') } else { [Console]::Out.Write('NOT_A_STRING') } }";

/** the helper's output -> { ok: true, bytes } | { ok: false, reason } (strict base64: anything else is no value) */
export function machineGuidFromHelperOutput(stdout) {
  const t = String(stdout || '').trim();
  if (t === 'NO_KEY' || t === 'NO_VALUE' || t === 'NOT_A_STRING') return { ok: false, reason: t.toLowerCase() };
  const m = /^B64:([A-Za-z0-9+/]*={0,2})$/.exec(t);
  if (!m || m[1].length % 4 !== 0) return { ok: false, reason: 'unreadable_output' };
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.toString('base64') !== m[1]) return { ok: false, reason: 'unreadable_output' };
  return { ok: true, bytes };
}

function powershellPath() {
  const root = process.env.SystemRoot || 'C:\\Windows';
  // a 32-bit process on 64-bit Windows sees SysWOW64 under System32; Sysnative (visible only to such a process) is the 64-bit one
  const sysnative = root + '\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe';
  if (process.arch === 'ia32' && existsSync(sysnative)) return sysnative;
  return root + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
}

const HELPER_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', MACHINE_GUID_SCRIPT];
const HELPER_OPTS = { encoding: 'utf8', windowsHide: true, timeout: 30000 };

/** read MachineGuid's bytes -> { ok: true, bytes } | { ok: false, reason }. `spawn` is a test seam (the unit rows stub the helper). */
export function readMachineGuid({ spawn = spawnSync } = {}) {
  if (process.platform !== 'win32') return { ok: false, reason: 'not_windows' };
  let r;
  try {
    r = spawn(powershellPath(), HELPER_ARGS, HELPER_OPTS);
  } catch (e) { return { ok: false, reason: 'helper_failed:' + ((e && e.code) || 'error') }; }
  if (!r || r.error) return { ok: false, reason: 'helper_failed:' + ((r && r.error && r.error.code) || 'error') };
  if (r.status !== 0) return { ok: false, reason: 'helper_exit_' + r.status };
  return machineGuidFromHelperOutput(r.stdout);
}

/** the same read without blocking the event loop -> a promise of { ok: true, bytes } | { ok: false, reason } (the same script, the
 *  same 30 s timeout, the same parse) */
export function readMachineGuidAsync() {
  if (process.platform !== 'win32') return Promise.resolve({ ok: false, reason: 'not_windows' });
  return new Promise((done) => {
    try {
      execFile(powershellPath(), HELPER_ARGS, HELPER_OPTS, (err, stdout) => {
        if (err && err.killed) return done({ ok: false, reason: 'helper_failed:ETIMEDOUT' });
        if (err && typeof err.code === 'number') return done({ ok: false, reason: 'helper_exit_' + err.code });
        if (err) return done({ ok: false, reason: 'helper_failed:' + (err.code || 'error') });
        done(machineGuidFromHelperOutput(stdout));
      });
    } catch (e) { done({ ok: false, reason: 'helper_failed:' + ((e && e.code) || 'error') }); }
  });
}

/**
 * A fingerprint source: the first read happens at the first call; a value is kept; a failed read is named (problem()) and tried again
 * no sooner than `retryMs` later (so a runtime polling every few seconds never starts PowerShell on every cycle). get() reads
 * synchronously; get.async() reads without blocking, and callers that ask while a read is running share that read.
 */
export function makeFingerprintSource({ read = readMachineGuid, readAsync = readMachineGuidAsync, retryMs = 60000, now = () => performance.now() } = {}) {
  let value = null;
  let problem = null;
  let lastFailure = null;
  let running = null;
  const due = () => !(lastFailure !== null && now() - lastFailure < retryMs);
  const settle = (r) => {
    if (r && r.ok) { value = fingerprintOf(r.bytes); problem = null; return value; }
    lastFailure = now();
    problem = 'fingerprint_unavailable (' + ((r && r.reason) || 'unknown') + ')';
    return null;
  };
  const get = () => {
    if (value) return value;
    if (!due()) return null;
    return settle(read());
  };
  get.async = () => {
    if (value) return Promise.resolve(value);
    if (running) return running;
    if (!due()) return Promise.resolve(null);
    running = Promise.resolve().then(() => readAsync())
      .catch((e) => ({ ok: false, reason: 'helper_failed:' + ((e && e.code) || 'error') }))
      .then(settle)
      .finally(() => { running = null; });
    return running;
  };
  get.problem = () => problem;
  return get;
}

const source = makeFingerprintSource();
/** this computer's machine fingerprint, or null while it cannot be read (fingerprintProblem() names why) - read synchronously */
export function machineFingerprint() { return source(); }
/** the same, read without blocking the event loop (the worker) */
export function machineFingerprintAsync() { return source.async(); }
export function fingerprintProblem() { return source.problem(); }

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

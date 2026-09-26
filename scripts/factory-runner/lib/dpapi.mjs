// dpapi.mjs — Windows DPAPI (CurrentUser scope) through Windows PowerShell 5.1, for holding a device key at rest.
//
// MECHANISM ONLY: bytes in, bytes out. No knowledge of what the bytes are.
//
// HOW THE SECRET TRAVELS, AND WHY
//   powershell.exe is started with a FIXED argv (…-Command -). Everything else goes over STDIN, in two steps:
//     1. node writes ONE line: the script. It is a constant — byte-identical for every call of an operation.
//        The script checks the language mode, loads System.Security, then prints READY and blocks reading.
//     2. only after node has SEEN that READY does it write the data lines (payload base64, entropy base64 or
//        empty), which the script reads with [Console]::In.ReadLine() — as DATA, never as script.
//   The payload is never in argv (visible to every process on the machine), never in an environment variable
//   (inherited, dumpable), never in a temp file (lands on disk before it is protected).
//
//   WHY THE HANDSHAKE. With `-Command -` PowerShell executes stdin line by line. If the script line fails to
//   parse or dies before it reads, PowerShell moves on and runs the NEXT line as a command — which, if the
//   payload were already queued there, means the secret is parsed as script, echoed into an error record
//   ("The term '<secret>' is not recognized…"), and handed to script-block logging and AMSI. That happened in
//   this module's own first smoke run (a `}; catch` parse error). With the handshake, every failure before
//   READY (parse error, Constrained Language Mode, Add-Type blocked, not PowerShell at all) ends with the
//   payload never having left node: the result says `payloadSent: false`.
//   The handshake is also what makes the read DETERMINISTIC. Measured 2026-09-26: when the data lines are
//   queued together with the script on a streamed stdin, PowerShell's own line reader buffers them ahead and
//   [Console]::In.ReadLine() returns null; with spawnSync the same bytes happened to work. Data that arrives
//   only after READY is read by the script, every time.
//
//   READY AND OK NEVER APPEAR IN THE SCRIPT TEXT. The script assembles them at run time ('BOSDPAPI:' + 'READY;').
//   Measured 2026-09-26 (review): with the literal in the script, a program that ECHOES its stdin (cmd.exe given
//   as powershellPath) printed the script text, the echo matched READY, and the payload was sent to that
//   program (payloadSent: true). Only a script that is actually executing can print them now. The ERR literal
//   stays in the text on purpose: an echo of the script shows ERR before anything else, which trips the abandon
//   path at once (payload never sent), and parseOutcome accepts only the exact ERR line shapes the script
//   prints, so an echoed fragment is reported as "did not answer like Windows PowerShell".
//
//   WHY NOT IN THE SCRIPT TEXT. On a stock Windows 10, PowerShell 5.1 "auto-logs" any script block containing
//   a "suspicious" word to Microsoft-Windows-PowerShell/Operational (Event 4104, Warning) with NO policy
//   enabled. Measured on this PC on 2026-09-26: Add-Type and "Cryptography" trigger it (FromBase64String
//   alone does not), and this module's own script text — which has both — appears there. Interpolating the
//   payload into the script would put the plaintext secret in the event log.
//
//   The result is written with [Console]::Out.Write (a .NET call), not Write-Output (a cmdlet): with module
//   logging enabled PowerShell records cmdlet parameter bindings (Event 4103), which would include the value;
//   host transcription likewise records host output, which a direct [Console]::Out write bypasses.
//
// FAILURE IS A RESULT, NOT AN EXCEPTION
//   PowerShell missing, blocked (AppLocker/WDAC), in Constrained Language Mode, timing out, or DPAPI itself
//   refusing (wrong user, wrong entropy, modified blob) all return { ok:false, reason } so a caller can fall
//   back. `unavailable: true` marks "DPAPI could not be reached here" as opposed to "DPAPI refused this blob".
//   `reason` never carries payload bytes: it is a fixed vocabulary plus the .NET exception type/message, and
//   every excerpt is redacted of the payload and of any base64-looking run. This module never logs.
//
// WHAT A "TAMPERED BLOB IS REFUSED" MEANS HERE (measured 2026-09-26, every byte of a 278-byte blob flipped in
//   turn): 262 flips are refused (CryptographicException). The 16 bytes at offsets 4..19 (the DPAPI provider
//   GUID) are NOT authenticated by DPAPI: a flip there is accepted and returns the IDENTICAL plaintext. No flip
//   anywhere returned a different plaintext. So the property is "a modified blob never yields other plaintext",
//   not "every modified byte is refused".
//
// SIZE: protect() takes at most MAX_PAYLOAD_BYTES of plaintext; unprotect() takes at most MAX_BLOB_BYTES, which
//   is larger by DPAPI's overhead (measured +230 bytes for 1 MiB) plus a wide margin, so every blob protect()
//   returns can be unprotected. (Reviewed 2026-09-26: with one shared cap, a 1 MiB secret protected into a blob
//   unprotect() refused — and secure-store replaced a good secret with that unreadable file.)
//
// Plaintext results carry their bytes on a NON-ENUMERABLE `buf` property: console.log(result) and
// JSON.stringify(result) show { ok, … } without the secret. Destructure it: const { ok, buf } = await unprotect(…).
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

const MARK_READY = 'BOSDPAPI:READY;';
const MARK_OK = 'BOSDPAPI:OK:';
const MARK_ERR = 'BOSDPAPI:ERR:';
const MAX_PAYLOAD_BYTES = 1024 * 1024; // a device key is tens of bytes; this is a sanity cap, not a format
const MAX_BLOB_BYTES = MAX_PAYLOAD_BYTES + 64 * 1024; // every blob protect() can return (see SIZE above)
const DEFAULT_TIMEOUT_MS = 30000;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/** Absolute path of Windows PowerShell 5.1. Never resolved through PATH or the current directory. */
export function defaultPowerShellPath() {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

export const POWERSHELL_ARGS = Object.freeze(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-']);

// A marker as a PowerShell expression that EVALUATES to it without containing it: 'BOSDPAPI:' + 'READY;'.
const psAssembled = (m) => "'" + m.slice(0, m.indexOf(':') + 1) + "' + '" + m.slice(m.indexOf(':') + 1) + "'";

// One line; every path ends in `exit`. Contains no data, and neither the READY nor the OK marker verbatim.
function buildScript(op) {
  const call = op === 'protect'
    ? '[System.Security.Cryptography.ProtectedData]::Protect($b, $n, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)'
    : '[System.Security.Cryptography.ProtectedData]::Unprotect($b, $n, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)';
  const body = [
    'if ("$($ExecutionContext.SessionState.LanguageMode)" -ne \'FullLanguage\') { Write-Output (\'' + MARK_ERR
      + 'language_mode:\' + $ExecutionContext.SessionState.LanguageMode); exit 3 }',
    'Add-Type -AssemblyName System.Security',
    '[Console]::Out.Write(' + psAssembled(MARK_READY) + '); [Console]::Out.Flush()',
    '$d = [Console]::In.ReadLine(); $e = [Console]::In.ReadLine()',
    'if ($null -eq $d) { Write-Output \'' + MARK_ERR + 'no_payload\'; exit 4 }',
    '$b = [System.Convert]::FromBase64String($d); $d = $null',
    'if ($e) { $n = [System.Convert]::FromBase64String($e) } else { $n = $null }; $e = $null',
    '$r = ' + call,
    '[Array]::Clear($b, 0, $b.Length)',
    '[Console]::Out.Write(' + psAssembled(MARK_OK) + ' + [System.Convert]::ToBase64String($r)); [Console]::Out.Flush()',
    '[Array]::Clear($r, 0, $r.Length); exit 0',
  ].join('; ');
  // The catch reports the INNERMOST exception: PowerShell wraps a .NET method's CryptographicException in a
  // MethodInvocationException, and only the inner type says "DPAPI refused this blob".
  return "$ErrorActionPreference = 'Stop'; try { " + body + ' } catch { $x = $_.Exception; '
    + 'while ($null -ne $x.InnerException) { $x = $x.InnerException }; Write-Output (\'' + MARK_ERR
    + "exception:' + $x.GetType().FullName + ':' + $x.Message); exit 2 }";
}

/** The exact, constant script text per operation (a regression proves it is payload-free and parses). */
export const SCRIPTS = Object.freeze({ protect: buildScript('protect'), unprotect: buildScript('unprotect') });

// A fixed line — not caller-supplied code — that a regression uses to put the REAL spawn/handshake/parse path
// under a REAL Constrained Language Mode (the per-process __PSLockdownPolicy switch is not honoured on this
// build of Windows, measured). Selected by opts._simulateConstrainedLanguage === true; never on by default.
const CLM_PRELUDE = "$ExecutionContext.SessionState.LanguageMode = 'ConstrainedLanguage'";

// Redact anything that could be payload before a string goes into a `reason`.
function redact(s, secrets) {
  let t = String(s || '');
  for (const x of secrets) if (x && x.length >= 4) t = t.split(x).join('[redacted]');
  t = t.replace(/[A-Za-z0-9+/_-]{24,}={0,2}/g, '[redacted]');
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > 300 ? t.slice(0, 300) + '...' : t;
}

function asBuffer(v, name) {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  throw new TypeError(name + ' must be a Buffer or Uint8Array');
}

function fail(reason, extra) {
  return Object.assign({ ok: false, reason }, extra || {});
}

// Run one operation. Resolves; never rejects.
function run(op, input, opts) {
  const o = opts || {};
  if (process.platform !== 'win32') {
    return Promise.resolve(fail('DPAPI is Windows-only (platform ' + process.platform + ')', { unavailable: true, payloadSent: false }));
  }
  let data;
  let entropy = null;
  try {
    data = asBuffer(input, op === 'protect' ? 'plaintext' : 'blob');
    if (o.entropy !== undefined && o.entropy !== null) entropy = asBuffer(o.entropy, 'entropy');
  } catch (e) {
    return Promise.resolve(fail('invalid argument: ' + e.message, { payloadSent: false }));
  }
  const what = op === 'protect' ? 'plaintext' : 'blob';
  if (data.length === 0) return Promise.resolve(fail('invalid argument: empty ' + what, { payloadSent: false }));
  const maxIn = op === 'protect' ? MAX_PAYLOAD_BYTES : MAX_BLOB_BYTES;
  if (data.length > maxIn) return Promise.resolve(fail('invalid argument: ' + what + ' larger than ' + maxIn + ' bytes', { payloadSent: false }));

  const exe = o.powershellPath || defaultPowerShellPath();
  const timeoutMs = Number.isFinite(o.timeoutMs) ? o.timeoutMs : DEFAULT_TIMEOUT_MS;
  const dataB64 = data.toString('base64');
  const entB64 = entropy && entropy.length ? entropy.toString('base64') : '';
  const secrets = [dataB64, entB64];
  const scriptIn = (o._simulateConstrainedLanguage === true ? CLM_PRELUDE + '\r\n' : '') + SCRIPTS[op] + '\r\n';

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    let payloadSent = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      r.payloadSent = payloadSent;
      resolve(r);
    };
    let child;
    try {
      child = spawn(exe, POWERSHELL_ARGS, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: o.env || process.env, shell: false });
    } catch (e) {
      done(fail('PowerShell could not be started (' + (e && e.code ? e.code : 'spawn error') + ')', { unavailable: true }));
      return;
    }
    const out = [];
    const err = [];
    let outLen = 0;
    let errLen = 0;
    let seen = '';
    let stdinClosed = false;
    // Before READY, any error signal means the script is not going to read: close stdin WITHOUT the payload so
    // PowerShell reaches EOF and exits now (a parse error otherwise leaves it waiting for more commands).
    const abandon = () => { if (!payloadSent && !stdinClosed) { stdinClosed = true; try { child.stdin.end(); } catch { /* gone */ } } };
    child.stdout.on('data', (c) => {
      if (outLen < 8 * MAX_PAYLOAD_BYTES) { out.push(c); outLen += c.length; }
      if (!payloadSent && !stdinClosed && !settled) {
        seen = (seen + c.toString('latin1')).slice(-4096);
        if (seen.includes(MARK_READY)) {
          payloadSent = true;
          stdinClosed = true;
          child.stdin.end(dataB64 + '\r\n' + entB64 + '\r\n');
        } else if (seen.includes(MARK_ERR)) {
          abandon();
        }
      }
    });
    child.stderr.on('data', (c) => {
      if (errLen < 65536) { err.push(c); errLen += c.length; }
      abandon();
    });
    child.stdin.on('error', () => { /* EPIPE when the child died first — reported through exit/error */ });
    timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      done(fail('PowerShell did not answer within ' + timeoutMs + ' ms', { unavailable: true }));
    }, timeoutMs);
    child.on('error', (e) => {
      const code = e && e.code ? e.code : 'error';
      const why = code === 'ENOENT' ? 'PowerShell is not installed at ' + exe
        : code === 'EACCES' || code === 'EPERM' ? 'PowerShell is blocked from starting (' + code + ')'
          : 'PowerShell could not be started (' + code + ')';
      done(fail(why, { unavailable: true }));
    });
    child.on('close', (code, signal) => {
      const stdout = Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      done(parseOutcome(op, { code, signal, stdout, stderr, payloadSent, exe }, secrets));
    });
    // Script only. The data waits for READY (see header). If the script never gets there, closing stdin after
    // it lets PowerShell reach EOF and exit instead of waiting for the timeout.
    child.stdin.write(scriptIn);
  });
}

// Pure: map a finished PowerShell run to a result.
function parseOutcome(op, { code, signal, stdout, stderr, payloadSent, exe }, secrets) {
  const okAt = stdout.indexOf(MARK_OK);
  if (code === 0 && okAt !== -1 && payloadSent) {
    const b64 = stdout.slice(okAt + MARK_OK.length).trim();
    if (!B64_RE.test(b64) || b64.length === 0) return fail('PowerShell returned an unreadable result');
    const buf = Buffer.from(b64, 'base64');
    // The invariant the SIZE note states: whatever protect() hands out, unprotect() accepts.
    if (op === 'protect' && buf.length > MAX_BLOB_BYTES) return fail('DPAPI returned a ' + buf.length + '-byte blob, larger than unprotect() accepts (' + MAX_BLOB_BYTES + ')');
    const r = { ok: true };
    if (op === 'unprotect') Object.defineProperty(r, 'buf', { value: buf, enumerable: false });
    else r.buf = buf; // a DPAPI blob is ciphertext
    return r;
  }
  const errAt = stdout.indexOf(MARK_ERR);
  if (errAt !== -1) {
    // Only the exact shapes the script prints are believed (an ECHO of the script text also contains MARK_ERR).
    const line = stdout.slice(errAt + MARK_ERR.length).split(/\r?\n/)[0];
    const lm = /^language_mode:([A-Za-z]+)\s*$/.exec(line);
    if (lm) {
      return fail('PowerShell runs in ' + lm[1] + ' (not FullLanguage), so DPAPI cannot be reached from it', { unavailable: true });
    }
    const ex = /^exception:([^\s:']+):(.*)$/.exec(line);
    if (ex) {
      const type = ex[1];
      const text = redact(ex[2], secrets);
      const cryptographic = /Cryptographic/.test(type);
      if (!payloadSent || !cryptographic && /FileNotFound|FileLoad|TypeLoad|Add-Type|Assembly/i.test(type + ' ' + text)) {
        return fail('DPAPI is not reachable from PowerShell here (' + type + ': ' + text + ')', { unavailable: true });
      }
      return fail('DPAPI ' + op + ' failed (' + type + ': ' + text + ')', { dpapiRefused: cryptographic });
    }
    if (/^no_payload\s*$/.test(line)) return fail('PowerShell reported no_payload (it read no data)', { unavailable: !payloadSent });
    return fail('the program at ' + exe + ' did not answer like Windows PowerShell (unrecognized output), so DPAPI cannot be reached through it',
      { unavailable: !payloadSent });
  }
  const why = signal ? 'killed by ' + signal : 'exit code ' + code;
  const tail = redact(stderr, secrets);
  return fail('PowerShell ended without a result (' + why + ')' + (tail ? ': ' + tail : ''), { unavailable: true });
}

/** DPAPI-protect `plaintext` for the current Windows user. → { ok:true, buf: blob } | { ok:false, reason, unavailable? } */
export function protect(plaintext, opts) {
  return run('protect', plaintext, opts);
}

/** Reverse of protect(). → { ok:true, buf (non-enumerable) } | { ok:false, reason, unavailable?, dpapiRefused? } */
export function unprotect(blob, opts) {
  return run('unprotect', blob, opts);
}

/**
 * Prove DPAPI works here, now, for this user: a random secret round-trips under random entropy, and the same
 * blob is REFUSED under different entropy (a DPAPI that ignored entropy is not the DPAPI a caller relies on).
 * → { ok:true, ms } | { ok:false, reason, unavailable? }
 */
export async function selfTest(opts) {
  const o = opts || {};
  const t0 = Date.now();
  const secret = randomBytes(32);
  const entropy = randomBytes(16);
  const p = await protect(secret, { ...o, entropy });
  if (!p.ok) return fail('protect: ' + p.reason, { unavailable: !!p.unavailable });
  if (p.buf.includes(secret)) return fail('protect returned a blob that contains the plaintext');
  const u = await unprotect(p.buf, { ...o, entropy });
  if (!u.ok) return fail('unprotect: ' + u.reason, { unavailable: !!u.unavailable });
  if (u.buf.length !== secret.length || !timingSafeEqual(u.buf, secret)) return fail('round-trip returned different bytes');
  const wrong = await unprotect(p.buf, { ...o, entropy: randomBytes(16) });
  if (wrong.ok) return fail('unprotect succeeded with the wrong entropy');
  if (wrong.unavailable) return fail('wrong-entropy probe could not run: ' + wrong.reason, { unavailable: true });
  return { ok: true, ms: Date.now() - t0 };
}

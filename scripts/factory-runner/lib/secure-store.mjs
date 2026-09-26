// secure-store.mjs — keep one secret in one file, as safely as this Windows user can without admin rights.
//
// MECHANISM ONLY. The store holds opaque bytes. It does not know that they are a device key, what a credential
// looks like, or what schema a credential file has — that is the Director contract's. The only format here is
// the store's own one-line envelope header (below), which exists so a reader knows how the body was protected.
//
// WHAT writeSecret GUARANTEES, IN ORDER (each step verified by reading the result back, never assumed):
//   1. The containing directory is locked to the current user: inheritance removed, one ACE granting the
//      current user's SID full control (inherited by files and subfolders), nothing else — no SYSTEM, no
//      Administrators, no Users. Set with icacls and then READ BACK (icacls /save → SDDL, compared by SID, so
//      the check is locale-independent). A pre-existing directory is only re-locked if it already is locked
//      or holds nothing but secure-store files: locking a shared directory would silently cut other programs'
//      access to their files.
//   2. The body is DPAPI-protected (CurrentUser) when DPAPI is reachable; otherwise the RAW bytes are stored
//      and the result says protection: 'acl_only' — plainly, so a caller can refuse (requireDpapi: true).
//   3. The temp file is created (empty) in the locked directory and ITS ACL is verified before one secret
//      byte is written into it; then written, fsync'd, renamed over the target (same directory, so atomic on
//      NTFS), and the final file's ACL and bytes are read back.
//   4. The stored secret is read back through readSecret() and compared with what was asked to be stored.
//   Failure throws a SecureStoreError whose .fix names the fix. The error never contains secret bytes.
//
// readSecret NEVER THROWS: → { ok:true, protection, buf } | { ok:false, fix }. `buf` is NON-ENUMERABLE so that
// console.log(result) / JSON.stringify(result) cannot print the secret; destructure it. It refuses (with the
// fix named) a missing file, a link, a non-store file, a truncated file, a directory or file readable by
// anyone other than the current user, and a DPAPI blob it cannot decrypt.
//
// ENVELOPE: ASCII line `BOS-SECURE-STORE/1 <dpapi|acl_only> <body length>\n`, then the body (DPAPI blob, or raw
// bytes for acl_only). No hash of the plaintext is stored (it would be an offline-guessing oracle for a
// low-entropy secret outside DPAPI's protection).
//
// LIMITS (stated, not hidden): Windows only (other platforms refuse with a fix). acl_only ignores `entropy` —
// there is nothing cryptographic to bind it to. The owner of the directory is not checked (icacls /save does
// not report it); keep the store under the user's own profile, whose parent directories other users cannot
// write. Administrators and SYSTEM can always take ownership of a file; an ACL does not stop them, and only
// DPAPI keeps the bytes unreadable to them (without the user's logon secret). DPAPI does not authenticate the
// 16-byte provider GUID at blob offsets 4..19 (measured): a file modified only there still reads back the
// IDENTICAL secret. A modified blob never yields a different secret.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as dpapi from './dpapi.mjs';

const MAGIC = 'BOS-SECURE-STORE/1';
const HEADER_RE = /^BOS-SECURE-STORE\/1 (dpapi|acl_only) (\d{1,8})\n/;
const MAX_SECRET_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 4 * MAX_SECRET_BYTES; // a DPAPI blob is larger than its plaintext
const TMP_RE = /^\..+\.\d+\.[0-9a-f]{16}\.tmp$/;

export class SecureStoreError extends Error {
  constructor(code, fix) {
    super(fix);
    this.name = 'SecureStoreError';
    this.code = code;
    this.fix = fix;
  }
}

// ---- Windows tools (absolute paths: never resolved through PATH or the current directory) -------------------

function sys32(exe) {
  const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.join(root, 'System32', exe);
}

function runTool(exe, args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: String(e && e.code || e) });
      return;
    }
    const out = [];
    const err = [];
    const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, timeoutMs);
    child.stdout.on('data', (c) => out.push(c));
    child.stderr.on('data', (c) => err.push(c));
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stdout: '', stderr: String(e && e.code || e) }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') });
    });
  });
}

const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 240);

let sidCache = null;
/** The current Windows user's SID (whoami /user). Cached per process. */
export async function currentUserSid() {
  if (sidCache) return sidCache;
  const r = await runTool(sys32('whoami.exe'), ['/user', '/fo', 'csv', '/nh']);
  const m = /"(S-1-\d+(?:-\d+)+)"\s*$/.exec(r.stdout.trim());
  if (r.code !== 0 || !m) throw new SecureStoreError('sid_unknown', 'The current Windows user\'s SID could not be read (whoami /user exit ' + r.code + '). Make sure ' + sys32('whoami.exe') + ' is present and runnable.');
  sidCache = m[1];
  return sidCache;
}

// SDDL SID aliases that are fixed SIDs (MS-DTYP 2.4.2.4). Domain-relative aliases (DA, DU, …) are not listed:
// an ACE naming one cannot be removed by SID here, and is reported instead.
const SDDL_ALIAS = {
  AA: 'S-1-5-32-579', AC: 'S-1-15-2-1', AN: 'S-1-5-7', AO: 'S-1-5-32-548', AU: 'S-1-5-11', BA: 'S-1-5-32-544',
  BG: 'S-1-5-32-546', BO: 'S-1-5-32-551', BU: 'S-1-5-32-545', CD: 'S-1-5-32-574', CG: 'S-1-3-1', CO: 'S-1-3-0',
  CY: 'S-1-5-32-569', ED: 'S-1-5-9', ER: 'S-1-5-32-573', ES: 'S-1-5-32-576', HA: 'S-1-5-32-578', IS: 'S-1-5-32-568',
  IU: 'S-1-5-4', LS: 'S-1-5-19', LU: 'S-1-5-32-559', MU: 'S-1-5-32-558', NO: 'S-1-5-32-556', NS: 'S-1-5-20',
  NU: 'S-1-5-2', OW: 'S-1-3-4', PO: 'S-1-5-32-550', PS: 'S-1-5-10', PU: 'S-1-5-32-547', RA: 'S-1-5-32-575',
  RC: 'S-1-5-12', RD: 'S-1-5-32-555', RE: 'S-1-5-32-552', RM: 'S-1-5-32-580', RU: 'S-1-5-32-554',
  SO: 'S-1-5-32-549', SS: 'S-1-18-2', SU: 'S-1-5-6', SY: 'S-1-5-18', UD: 'S-1-5-84-0-0-0-0-0', WD: 'S-1-1-0',
  WR: 'S-1-5-33',
};

function normalizeSid(s, me) {
  if (/^S-1-/i.test(s)) return s.toUpperCase();
  if (SDDL_ALIAS[s]) return SDDL_ALIAS[s];
  if (s === 'LA' && /-500$/.test(me)) return me; // the built-in Administrator account, when that is who we are
  if (s === 'LG' && /-501$/.test(me)) return me;
  return s; // unresolvable alias: kept as-is, never equal to `me`
}

// Top-level "( … )" groups of an SDDL DACL, depth-aware (conditional ACEs nest parentheses).
function aceGroups(s) {
  const groups = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') { if (depth === 0) start = i + 1; depth++; }
    else if (s[i] === ')') { depth--; if (depth === 0) groups.push(s.slice(start, i)); if (depth < 0) return null; }
  }
  return depth === 0 ? groups : null;
}

/** Parse the DACL part of an SDDL string. Pure; exported for the regression. */
export function parseDacl(sddl, me) {
  const at = sddl.indexOf('D:');
  if (at === -1) return { ok: false, why: 'no DACL in the security descriptor' };
  let d = sddl.slice(at + 2);
  const sacl = d.search(/(^|\))S:/);
  if (sacl !== -1) d = d.slice(0, sacl + (d[sacl] === ')' ? 1 : 0));
  const firstParen = d.indexOf('(');
  const flags = firstParen === -1 ? d : d.slice(0, firstParen);
  if (/NO_ACCESS_CONTROL/.test(flags)) return { ok: true, nullDacl: true, protected: false, aces: [], sddl };
  const groups = aceGroups(firstParen === -1 ? '' : d.slice(firstParen));
  if (!groups) return { ok: false, why: 'unbalanced SDDL' };
  const aces = groups.map((g) => {
    const f = g.split(';');
    const aceFlags = new Set((f[1] || '').match(/.{2}/g) || []);
    return { type: f[0], flags: aceFlags, rights: (f[2] || '').toUpperCase(), sid: normalizeSid(f[5] || '', me) };
  });
  return { ok: true, nullDacl: false, protected: /P/.test(flags), aces, sddl };
}

/** Read an object's DACL with icacls /save (SDDL with SIDs: locale-independent). */
export async function readDacl(p) {
  const me = await currentUserSid();
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'bos-acl-'));
  try {
    const saveTo = path.join(tmp, 'acl.txt');
    const r = await runTool(sys32('icacls.exe'), [p, '/save', saveTo]);
    if (r.code !== 0) return { ok: false, why: 'icacls /save exit ' + r.code + ': ' + oneLine(r.stderr || r.stdout) };
    const text = (await fsp.readFile(saveTo)).toString('utf16le').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.length);
    const sddl = lines.find((l, i) => i > 0 && l.startsWith('D:'));
    if (!sddl) return { ok: false, why: 'icacls /save produced no DACL line' };
    return parseDacl(sddl, me);
  } catch (e) {
    return { ok: false, why: 'ACL read failed (' + (e && e.code || e && e.name || 'error') + ')' };
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

const FULL_RIGHTS = new Set(['FA', '0X1F01FF']);

/** Exactly the lock writeSecret applies to a directory: protected, one ACE, current user, full, inherited down. */
export function isLockedDirDacl(dacl, me) {
  if (!dacl || !dacl.ok || dacl.nullDacl || !dacl.protected || dacl.aces.length !== 1) return false;
  const a = dacl.aces[0];
  return a.type === 'A' && a.sid === me && FULL_RIGHTS.has(a.rights)
    && a.flags.has('OI') && a.flags.has('CI') && !a.flags.has('IO') && !a.flags.has('NP') && !a.flags.has('ID');
}

/** Every ACE names the current user, and at least one grants access. (A file's ACEs are inherited: fine.) */
export function isOwnerOnlyDacl(dacl, me) {
  if (!dacl || !dacl.ok || dacl.nullDacl || dacl.aces.length === 0) return false;
  return dacl.aces.every((a) => a.sid === me) && dacl.aces.some((a) => a.type === 'A');
}

const others = (dacl, me) => [...new Set((dacl && dacl.aces || []).filter((a) => a.sid !== me).map((a) => a.sid))];

// The re-lock a `fix` sentence tells a person to run: ONE icacls command with every argument quoted, so it runs
// unchanged when pasted into cmd.exe OR PowerShell. Measured 2026-09-26 (review): the earlier form — several
// commands joined by ` ; `, grant unquoted — failed in cmd.exe (`;` is no separator there: "Invalid parameter
// ";"", exit 87, nothing changed) and half-failed in PowerShell (`(OI)` is evaluated as a sub-expression: "The
// term 'OI' is not recognized"). icacls applies /inheritance:r, /grant:r and /remove in one call (measured,
// both shells, for a protected directory with an explicit foreign ACE and for an inheriting one).
function relockCommand(target, me, dacl, isDir) {
  const grant = isDir ? '*' + me + ':(OI)(CI)F' : '*' + me + ':F';
  let cmd = 'icacls "' + target + '" /inheritance:r /grant:r "' + grant + '"';
  if ((dacl && dacl.aces || []).some((a) => a.sid === me && /^(D|OD|XD)$/.test(a.type))) cmd += ' /remove:d "*' + me + '"';
  const foreign = others(dacl, me).filter((s) => /^S-1-/.test(s));
  if (foreign.length) cmd += ' /remove ' + foreign.map((s) => '"*' + s + '"').join(' ');
  return cmd;
}

async function lockDirectory(dir, me) {
  const ic = sys32('icacls.exe');
  const g = await runTool(ic, [dir, '/inheritance:r', '/grant:r', '*' + me + ':(OI)(CI)F']);
  if (g.code !== 0) return { ok: false, why: 'icacls /inheritance:r /grant:r exit ' + g.code + ': ' + oneLine(g.stderr || g.stdout) };
  let d = await readDacl(dir);
  if (!d.ok) return { ok: false, why: d.why };
  // /inheritance:r drops inherited ACEs and /grant:r replaces our own grants, but EXPLICIT ACEs for other
  // accounts (and deny ACEs for us) survive both — measured. Remove them by SID.
  const removals = new Map();
  for (const a of d.aces) {
    if (a.sid === me && a.type === 'A') continue;
    if (!/^S-1-/.test(a.sid)) return { ok: false, why: 'an ACE names "' + a.sid + '", which cannot be resolved to a SID to remove it' };
    removals.set(a.sid, a.sid === me ? '/remove:d' : '/remove');
  }
  for (const [sid, how] of removals) {
    const r = await runTool(ic, [dir, how, '*' + sid]);
    if (r.code !== 0) return { ok: false, why: 'icacls ' + how + ' *' + sid + ' exit ' + r.code + ': ' + oneLine(r.stderr || r.stdout) };
  }
  d = await readDacl(dir);
  if (!d.ok) return { ok: false, why: d.why };
  if (!isLockedDirDacl(d, me)) return { ok: false, why: 'the ACL read back is not current-user-only: ' + d.sddl };
  return { ok: true, sddl: d.sddl };
}

// ---- paths ---------------------------------------------------------------------------------------------------

// Reserved DOS device names, with or without an extension (Windows 10 treats "NUL.txt" as NUL too).
const DOS_DEVICE_RE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

function checkPath(p) {
  if (typeof p !== 'string' || !p) return 'the path must be a non-empty string: pass the absolute path of a file in a dedicated directory';
  if (!path.isAbsolute(p)) return 'the path must be absolute: pass the absolute path of a file in a dedicated directory';
  if (/^[\\/]{2}/.test(p)) return 'UNC and device paths (\\\\server\\…, \\\\?\\…) are not supported: use a local NTFS path';
  const abs = path.resolve(p);
  const dir = path.dirname(abs);
  if (!path.basename(abs) || dir === abs || path.parse(dir).root === dir) return 'the secret must live in a dedicated directory, not a drive root';
  // Names Win32 does not store as written (reviewed 2026-09-26: an ADS name failed only at rename, left a stray
  // file and blamed "free space"; NUL and a trailing dot got as far as rename and then failed the ACL read-back).
  for (const c of abs.slice(path.parse(abs).root.length).split(/[\\/]/).filter(Boolean)) {
    if (c.includes(':')) return 'the path component "' + c + '" contains ":" (an NTFS alternate data stream): pass a plain file path';
    if (/[. ]$/.test(c)) return 'the path component "' + c + '" ends in "." or " ", which Windows silently strips: pass the name without it';
    if (DOS_DEVICE_RE.test(c)) return '"' + c + '" is a reserved Windows device name: choose another name for the file and its dedicated directory';
  }
  const norm = (x) => (x ? path.resolve(x).toLowerCase() : null);
  const shared = [os.homedir(), os.tmpdir(), process.env.SystemRoot, process.env.ProgramData, process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'], process.env.APPDATA, process.env.LOCALAPPDATA, process.env.PUBLIC,
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData')].map(norm).filter(Boolean);
  if (shared.includes(dir.toLowerCase())) return 'the directory "' + dir + '" is a shared system/profile directory; give the secret a dedicated subdirectory';
  return null;
}

async function isStoreFile(p) {
  let fh;
  try {
    fh = await fsp.open(p, 'r');
    const b = Buffer.alloc(64);
    const { bytesRead } = await fh.read(b, 0, 64, 0);
    return HEADER_RE.test(b.subarray(0, bytesRead).toString('latin1'));
  } catch { return false; } finally { if (fh) await fh.close().catch(() => {}); }
}

async function dirHoldsOnlyStoreFiles(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const foreign = [];
  for (const e of entries) {
    if (e.isFile() && (TMP_RE.test(e.name) || await isStoreFile(path.join(dir, e.name)))) continue;
    foreign.push(e.name);
  }
  return foreign;
}

async function renameWithRetry(from, to) {
  let last;
  for (let i = 0; i < 8; i++) {
    try { await fsp.rename(from, to); return; } catch (e) {
      last = e;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      await new Promise((r) => setTimeout(r, 25 * (i + 1)));
    }
  }
  throw last;
}

function asBuffer(v) {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  return null;
}

// ---- API -----------------------------------------------------------------------------------------------------

/**
 * Store `secret` at `filePath`. → { ok:true, protection: 'dpapi'|'acl_only', path, dirAcl, dpapiReason? }
 * opts: { entropy?: Buffer, requireDpapi?: boolean, dpapi?: options passed to dpapi.mjs, verifyReadBack?: true }
 * Throws SecureStoreError (.code, .fix) on any failure; never with secret bytes in it.
 */
export async function writeSecret(filePath, secret, opts) {
  try {
    return await writeSecretChecked(filePath, secret, opts);
  } catch (e) {
    if (e instanceof SecureStoreError) throw e;
    // Reviewed 2026-09-26: a parent that is a FILE (ENOTDIR from mkdir) and a directory this user cannot list
    // (EPERM from readdir) escaped as raw Node errors, breaking the "always a SecureStoreError" contract.
    throw new SecureStoreError('unexpected', 'Storing a secret at "' + String(filePath) + '" failed unexpectedly (' + (e && (e.code || e.name) || 'error')
      + '). Use a path on a local NTFS volume whose every parent is a directory this Windows user can create and list.');
  }
}

async function writeSecretChecked(filePath, secret, opts) {
  const o = opts || {};
  if (process.platform !== 'win32') throw new SecureStoreError('platform', 'secure-store supports Windows only in this version; this is ' + process.platform + '.');
  const bad = checkPath(filePath);
  if (bad) throw new SecureStoreError('path', 'Cannot store a secret at "' + filePath + '": ' + bad + '.');
  const buf = asBuffer(secret);
  if (!buf || buf.length === 0 || buf.length > MAX_SECRET_BYTES) throw new SecureStoreError('input', 'The secret must be a non-empty Buffer of at most ' + MAX_SECRET_BYTES + ' bytes.');
  const target = path.resolve(filePath);
  const dir = path.dirname(target);
  const me = await currentUserSid();

  // Protection is decided FIRST — it touches no disk — so a refusal (requireDpapi) leaves nothing behind.
  let protection = 'acl_only';
  let body = buf;
  let dpapiReason;
  const p = await dpapi.protect(buf, { ...(o.dpapi || {}), entropy: o.entropy });
  if (p.ok) { protection = 'dpapi'; body = p.buf; } else {
    dpapiReason = p.reason;
    if (o.requireDpapi) throw new SecureStoreError('dpapi_required', 'DPAPI was required but is unavailable here (' + p.reason + '). Run as the Windows user who will read the secret, with Windows PowerShell 5.1 in FullLanguage mode.');
  }

  // 1. the directory
  let existed = true;
  try {
    const st = await fsp.lstat(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) throw new SecureStoreError('dir', '"' + dir + '" exists and is not a plain directory; choose a dedicated directory for the secret.');
  } catch (e) {
    if (e instanceof SecureStoreError) throw e;
    if (e.code !== 'ENOENT') throw new SecureStoreError('dir', 'Cannot inspect "' + dir + '" (' + e.code + '); check that the path is on a local NTFS volume you can write.');
    existed = false;
    try { await fsp.mkdir(dir, { recursive: true }); } catch (m) {
      throw new SecureStoreError('dir', 'Cannot create "' + dir + '" (' + m.code + ')' + (m.code === 'ENOTDIR' || m.code === 'EEXIST' ? ': a component of that path is a file, not a directory' : '')
        + '. Choose a dedicated directory on a local NTFS volume that this Windows user can create.');
    }
  }
  let dirDacl = await readDacl(dir);
  if (!isLockedDirDacl(dirDacl, me)) {
    if (existed) {
      let foreign;
      try { foreign = await dirHoldsOnlyStoreFiles(dir); } catch (l) {
        throw new SecureStoreError('dir', 'Cannot list "' + dir + '" (' + l.code + '), so it cannot be shown to hold only secure-store files. Give the secret a dedicated directory this Windows user owns.');
      }
      if (foreign.length) {
        throw new SecureStoreError('dir_shared', 'The directory "' + dir + '" is not locked to the current user and also holds other entries ('
          + foreign.slice(0, 5).join(', ') + (foreign.length > 5 ? ', …' : '') + '); locking it would cut other programs off from them. Give the secret a dedicated, empty directory.');
      }
    }
    const lk = await lockDirectory(dir, me);
    if (!lk.ok) {
      throw new SecureStoreError('acl', 'The directory "' + dir + '" could not be locked to the current user (' + lk.why + '). Keep the secret on a local NTFS volume in a directory you own, or lock it by hand: '
        + relockCommand(dir, me, dirDacl, true));
    }
    dirDacl = await readDacl(dir);
  }

  // 2. the envelope
  const header = Buffer.from(MAGIC + ' ' + protection + ' ' + body.length + '\n', 'latin1');
  const file = Buffer.concat([header, body]);

  // 3. temp → verify its ACL while EMPTY → write → fsync → rename → verify
  const tmp = path.join(dir, '.' + path.basename(target) + '.' + process.pid + '.' + randomBytes(8).toString('hex') + '.tmp');
  let fh;
  try {
    fh = await fsp.open(tmp, 'wx');
    const tdacl = await readDacl(tmp);
    if (!isOwnerOnlyDacl(tdacl, me)) throw new SecureStoreError('acl', 'A file created in "' + dir + '" is not current-user-only (' + (tdacl.ok ? tdacl.sddl : tdacl.why) + '), so nothing was written. Re-lock the directory: ' + relockCommand(dir, me, dirDacl, true));
    await fh.writeFile(file);
    await fh.sync();
    await fh.close();
    fh = null;
    await renameWithRetry(tmp, target);
  } catch (e) {
    if (fh) await fh.close().catch(() => {});
    await fsp.rm(tmp, { force: true }).catch(() => {});
    if (e instanceof SecureStoreError) throw e;
    throw new SecureStoreError('write', 'Writing "' + target + '" failed (' + (e.code || e.name) + '); check free space and that no other program holds the file open.');
  } finally {
    if (protection === 'acl_only') file.fill(0); // our copy of the raw bytes; the caller's buffer is theirs
  }
  const fdacl = await readDacl(target);
  if (!isOwnerOnlyDacl(fdacl, me)) {
    // An exposed secret is worse than a missing one (the caller still holds the bytes and can retry): remove it.
    const removed = await fsp.rm(target, { force: true }).then(() => true, () => false);
    throw new SecureStoreError('acl', 'The stored file "' + target + '" was not current-user-only (' + (fdacl.ok ? fdacl.sddl : fdacl.why) + ')'
      + (removed ? ' and has been deleted' : ' and could NOT be deleted — delete it by hand') + '. Re-lock the directory and write again: ' + relockCommand(dir, me, dirDacl, true));
  }

  // 4. read it back the way a reader will
  if (o.verifyReadBack !== false) {
    const back = await readSecret(target, { entropy: o.entropy, dpapi: o.dpapi });
    const same = back.ok && back.protection === protection && back.buf.length === buf.length && timingSafeEqual(back.buf, buf);
    if (back.ok) back.buf.fill(0);
    if (!same) {
      throw new SecureStoreError('readback', 'The secret was written to "' + target + '" but did not read back identically ('
        + (back.ok ? 'bytes differ — another writer may have replaced it concurrently; this store is single-writer per file' : back.fix)
        + '). Do not rely on it; write it again from a single writer.');
    }
  }
  const res = { ok: true, protection, path: target, dirAcl: dirDacl.ok ? dirDacl.sddl : null };
  if (dpapiReason) res.dpapiReason = dpapiReason;
  return res;
}

/**
 * Read the secret at `filePath`. NEVER throws. → { ok:true, protection, buf (non-enumerable) } | { ok:false, fix }
 * opts: { entropy?: Buffer, requireDpapi?: boolean, dpapi?: options passed to dpapi.mjs }
 */
export async function readSecret(filePath, opts) {
  const o = opts || {};
  const refuse = (fix, code) => ({ ok: false, code, fix });
  try {
    if (process.platform !== 'win32') return refuse('secure-store supports Windows only in this version; this is ' + process.platform + '.', 'platform');
    const bad = checkPath(filePath);
    if (bad) return refuse('Cannot read a secret at "' + filePath + '": ' + bad + '.', 'path');
    const target = path.resolve(filePath);
    const dir = path.dirname(target);
    let st;
    try { st = await fsp.lstat(target); } catch (e) {
      if (e.code === 'ENOENT') return refuse('No secret is stored at "' + target + '". Write it first with writeSecret().', 'missing');
      return refuse('The secret file "' + target + '" cannot be inspected (' + e.code + '). Check that this Windows user can read it.', 'io');
    }
    if (st.isSymbolicLink()) return refuse('"' + target + '" is a link, and secure-store reads only a regular file it wrote. Delete the link and write the secret again with writeSecret().', 'link');
    if (!st.isFile()) return refuse('"' + target + '" is not a regular file. Remove it and write the secret again with writeSecret().', 'not_file');
    if (st.size > MAX_FILE_BYTES) return refuse('"' + target + '" is ' + st.size + ' bytes, too large to be a secure-store file. Write the secret again with writeSecret().', 'too_large');

    const me = await currentUserSid();
    const ddacl = await readDacl(dir);
    if (!ddacl.ok) return refuse('The access list of "' + dir + '" could not be read (' + ddacl.why + '). Keep the secret on a local NTFS volume and make sure ' + sys32('icacls.exe') + ' is runnable.', 'acl_unreadable');
    if (!ddacl.protected || !isOwnerOnlyDacl(ddacl, me)) {
      return refuse('The directory "' + dir + '" is accessible to accounts other than the current user' + (ddacl.protected ? '' : ' (it inherits its parent\'s entries)')
        + (others(ddacl, me).length ? ' (' + others(ddacl, me).join(', ') + ')' : '') + ', so the secret is refused. Re-lock it: '
        + relockCommand(dir, me, ddacl, true) + ' — or call writeSecret() again, which re-locks a directory that holds only secure-store files.', 'acl_dir');
    }
    const fdacl = await readDacl(target);
    if (!fdacl.ok) return refuse('The access list of "' + target + '" could not be read (' + fdacl.why + '). Keep the secret on a local NTFS volume.', 'acl_unreadable');
    if (!isOwnerOnlyDacl(fdacl, me)) {
      return refuse('The file "' + target + '" is accessible to accounts other than the current user (' + others(fdacl, me).join(', ')
        + '), so the secret is refused. Re-lock it: ' + relockCommand(target, me, fdacl, false) + ' — or write it again with writeSecret().', 'acl_file');
    }

    const raw = await fsp.readFile(target);
    const nl = raw.indexOf(0x0a);
    const m = nl === -1 ? null : HEADER_RE.exec(raw.subarray(0, nl + 1).toString('latin1'));
    if (!m) return refuse('"' + target + '" is not a secure-store file (unrecognized header). Write the secret again with writeSecret().', 'format');
    const protection = m[1];
    const body = raw.subarray(nl + 1);
    if (body.length !== Number(m[2])) return refuse('"' + target + '" is truncated or was modified (its body is ' + body.length + ' bytes, its header says ' + m[2] + '). Write the secret again with writeSecret().', 'length');

    let out;
    if (protection === 'acl_only') {
      if (o.requireDpapi) { raw.fill(0); return refuse('"' + target + '" is stored without DPAPI (acl_only) and DPAPI was required. Write it again with writeSecret() where DPAPI is available.', 'dpapi_required'); }
      out = Buffer.from(body);
      raw.fill(0);
    } else {
      const u = await dpapi.unprotect(body, { ...(o.dpapi || {}), entropy: o.entropy });
      if (!u.ok) {
        if (u.unavailable) return refuse('"' + target + '" is DPAPI-protected but DPAPI is unavailable here (' + u.reason + '). Read it as the same Windows user from a session where Windows PowerShell 5.1 runs in FullLanguage mode.', 'dpapi_unavailable');
        // Only a CryptographicException is DPAPI refusing the blob. Anything else (an oversize body, output that is
        // not a result) is not evidence of "another user / other entropy / modified", so it is not reported as one.
        if (!u.dpapiRefused) return refuse('The DPAPI blob in "' + target + '" could not be processed (' + u.reason + '). Write the secret again with writeSecret().', 'dpapi_failed');
        return refuse('The DPAPI blob in "' + target + '" could not be decrypted (' + u.reason + '): it was written by a different Windows user or machine, with different entropy, or it was modified. Read it as the user who wrote it with the same entropy, or write the secret again with writeSecret().', 'dpapi_refused');
      }
      out = u.buf;
    }
    const res = { ok: true, protection };
    Object.defineProperty(res, 'buf', { value: out, enumerable: false });
    return res;
  } catch (e) {
    const code = e && (e.code || e.name) || 'error';
    return refuse(e instanceof SecureStoreError ? e.fix : 'Reading the secret failed unexpectedly (' + code + '). Check that the path is a local NTFS file this Windows user can read.', 'unexpected');
  }
}

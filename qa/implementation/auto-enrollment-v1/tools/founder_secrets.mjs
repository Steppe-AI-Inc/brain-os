#!/usr/bin/env node
// FOUNDER STEP 4: THE PAIRING PEPPER GOES FROM THE RANDOM SOURCE INTO ONE LOCKED FILE, THEN INTO THE SECRET STORE, THEN AWAY (S-12: no
// secret is logged or printed; S-6: the pepper is kept in the Edge Function secret store). The founder runs it on the founder's own
// machine, as FOUNDER_PREPARED_STEPS.md step 4 says; the developer suites run it on throwaway directories only.
//
//   node founder_secrets.mjs pepper --dir <a directory that does not exist yet>
//       makes the directory, restricts it to the current Windows user (inheritance off, one full-control entry, read back), and
//       writes the new pepper there as pepper.env: the one line FACTORY_PAIRING_PEPPER=<32 CSPRNG bytes, base64-encoded>, in the
//       format `supabase secrets set --env-file` reads (the pepper's version is a constant of the Edge source, PEPPER_VERSION in
//       _shared/pairing.ts, not a secret). Its output is the file's path; the value is never printed.
//   node founder_secrets.mjs shred --dir <the same directory>
//       fills each file in it with zeros (fsync), deletes it, removes the directory and confirms nothing is left. On an SSD or NTFS
//       the old blocks may survive the overwrite; what the step ensures is that the file is gone once the secret store holds the value.
//
// WHERE IT MAY WRITE is decided from the --dir argument and from the file system under that path, nothing else. This tool reads no
// environment variable and no other setting of the machine (VERIFICATION_SPEC §3.4 scans founder steps for such reads): the Windows
// tools run from the fixed path C:\Windows\System32 (a machine with Windows elsewhere is refused by name), and the ACL read-back saves
// its SDDL inside the directory being locked, never under a temp folder taken from the environment. Refused, each by name:
//   - a relative path, and a directory that exists already (its ACL could not be set before the secret is written);
//   - a path with any component whose name starts with "OneDrive" (such a folder is synchronized off this machine);
//   - a path inside a git working tree: an ancestor directory that holds a .git entry (a file or a directory), so a secret there
//     could be committed. This is a file-system check; no git program is needed or run.
// A folder synchronized by another tool, or under another name, is not recognized: FOUNDER_PREPARED_STEPS.md tells the founder to use
// a fresh directory under %LOCALAPPDATA%\Temp (the founder's shell expands that name; this tool only sees the resulting path).
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const PEPPER_FILE = 'pepper.env';
export const SYSTEM32 = 'C:\\Windows\\System32';
const ICACLS = SYSTEM32 + '\\icacls.exe';
const WHOAMI = SYSTEM32 + '\\whoami.exe';
const ACL_SAVE = '.acl-readback.txt'; // icacls /save output: an SDDL line, no secret; removed at once

/** why `dir` may not hold a generated secret, or null. Decided by the argument and the file system under it, never the environment. */
export function placeRefusal(dir) {
  if (typeof dir !== 'string' || !dir || !isAbsolute(dir)) return 'the directory must be an absolute path';
  const abs = resolve(dir);
  if (existsSync(abs)) return 'the directory exists already: name a new one, so its ACL is set before anything is written into it';
  const parts = abs.slice(parse(abs).root.length).split(sep).filter(Boolean);
  if (parts.some((s) => /^onedrive/i.test(s))) return 'a component of the path is a OneDrive folder: a synchronized file leaves this machine';
  for (let d = dirname(abs); ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return 'the directory is inside a git working tree (' + d + ' holds .git): a secret there can be committed';
    if (dirname(d) === d) break;
  }
  return null;
}

function tool(exe, args) {
  if (!existsSync(exe)) throw new Error('REFUSED - ' + exe + ' is missing: this tool runs the Windows tools from ' + SYSTEM32 + ' only');
  return spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, shell: false });
}

/** the current user's SID (whoami /user, from the fixed path) */
export function currentUserSid() {
  const r = tool(WHOAMI, ['/user', '/fo', 'csv', '/nh']);
  const m = /"(S-1-\d+(?:-\d+)+)"\s*$/.exec(String(r.stdout || '').trim());
  if (r.status !== 0 || !m) throw new Error('the current Windows user\'s SID could not be read (whoami exit ' + r.status + ')');
  return m[1];
}

/** the DACL of `target`, read with icacls /save into `saveDir` (the locked directory itself) and parsed by secure-store's parser */
async function readDaclInto(target, saveDir, me) {
  const ss = await import(pathToFileURL(join(ROOT, 'scripts', 'factory-runner', 'lib', 'secure-store.mjs')).href);
  const saveTo = join(saveDir, ACL_SAVE);
  try {
    const r = tool(ICACLS, [target, '/save', saveTo]);
    if (r.status !== 0) return { ok: false, why: 'icacls /save exit ' + r.status };
    const lines = readFileSync(saveTo).toString('utf16le').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.length);
    const sddl = lines.find((l, i) => i > 0 && l.startsWith('D:'));
    return sddl ? { ...ss.parseDacl(sddl, me), ss } : { ok: false, why: 'icacls /save produced no DACL line' };
  } finally { try { unlinkSync(saveTo); } catch { /* not written */ } }
}

async function lockToCurrentUser(dir) {
  const me = currentUserSid();
  const r = tool(ICACLS, [dir, '/inheritance:r', '/grant:r', '*' + me + ':(OI)(CI)F']);
  if (r.status !== 0) throw new Error('icacls could not lock ' + dir + ' (exit ' + r.status + ')');
  const d = await readDaclInto(dir, dir, me);
  if (!d.ok || !d.ss.isLockedDirDacl(d, me)) throw new Error('the directory ACL read back is not current-user-only');
  return me;
}

export async function pepper(dir) {
  const bad = placeRefusal(dir);
  if (bad) throw new Error('REFUSED - ' + bad);
  const abs = resolve(dir);
  mkdirSync(abs);
  const me = await lockToCurrentUser(abs);
  const file = join(abs, PEPPER_FILE);
  const fd = openSync(file, 'wx', 0o600);
  try {
    writeSync(fd, 'FACTORY_PAIRING_PEPPER=' + randomBytes(32).toString('base64') + '\n');
    fsyncSync(fd);
  } finally { closeSync(fd); }
  const fa = await readDaclInto(file, abs, me);
  if (!fa.ok || !fa.ss.isOwnerOnlyDacl(fa, me)) { shred(abs); throw new Error('the file ACL read back is not current-user-only: the file was shredded'); }
  return file;
}

export function shred(dir) {
  const abs = resolve(dir);
  if (!existsSync(abs)) return { absent: true, files: 0 };
  if (!lstatSync(abs).isDirectory()) throw new Error('not a directory');
  let n = 0;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const f = join(abs, e.name);
    if (!e.isFile()) throw new Error('the directory holds something other than files: remove it by hand');
    const size = statSync(f).size;
    const fd = openSync(f, 'r+');
    try { if (size) writeSync(fd, Buffer.alloc(size), 0, size, 0); fsyncSync(fd); } finally { closeSync(fd); }
    unlinkSync(f); n++;
  }
  rmdirSync(abs);
  return { absent: !existsSync(abs), files: n };
}

const isMain = (() => { try { return resolve(process.argv[1] || '').toLowerCase() === fileURLToPath(import.meta.url).toLowerCase(); } catch { return false; } })();
if (isMain) {
  const [cmd, flag, dir] = process.argv.slice(2);
  try {
    if (flag !== '--dir' || !dir || !['pepper', 'shred'].includes(cmd)) throw new Error('usage: founder_secrets.mjs pepper|shred --dir <directory>');
    if (process.platform !== 'win32') throw new Error('Windows only');
    if (cmd === 'pepper') {
      const f = await pepper(dir);
      console.log('written: ' + f + ' (owner-only; nothing secret was printed). Next: npx supabase secrets set --project-ref <ref> --env-file "' + f + '", then: founder_secrets.mjs shred --dir "' + resolve(dir) + '"');
    } else {
      const r = shred(dir);
      console.log((r.absent ? 'absent' : 'NOT ABSENT') + ': ' + resolve(dir) + ' (' + r.files + ' file(s) overwritten and deleted)');
      if (!r.absent) process.exitCode = 1;
    }
  } catch (e) { console.log(String(e && e.message || e)); process.exitCode = 1; }
}

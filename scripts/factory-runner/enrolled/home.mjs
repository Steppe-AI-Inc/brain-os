// THE ENROLLED NODE'S HOME: everything the runtime keeps, under the installing user's profile (a per-user install, no admin; WO-4).
//
//   %LOCALAPPDATA%\BrainFactory\           (BRAIN_FACTORY_HOME overrides it - the developer suites' isolated homes)
//     config.json        what enrollment gave this computer: api, channel, node id, principal id, computer id, credential id - no secret
//     key\node.key       the node's Ed25519 private key, DPAPI-protected (CurrentUser) in an owner-only directory (lib/secure-store.mjs);
//                        key\node.pending.key: a rotation's new key, stored (DPAPI) before the plane is asked to swap
//                        (config.json then carries pending_rotation; an enrollment in flight carries pending_enrollment - credential.mjs)
//     runtime\<version>-<digest12>\BrainFactory.exe + manifest.json      the verified releases, the previous one kept (adopt / roll back)
//     current.json       which runtime directory runs; previous.json the one before it
//     state\             the supervisor's record for people to read (never trusted for exclusion: instance.mjs holds the named pipes),
//                        the worker's last status, and the revocations the API delivered (a union that only grows: revocations.mjs)
//     logs\              supervisor.log, worker.log - scrubbed of codes, tokens and keys, rotated at 2 MB
// Nothing here is a database URL or a shared credential: the enrolled computer holds none (S-2, P-4).
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function homeDir() {
  if (process.env.BRAIN_FACTORY_HOME) return process.env.BRAIN_FACTORY_HOME;
  const base = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return join(base, 'BrainFactory');
}
export const paths = (home = homeDir()) => ({
  home, config: join(home, 'config.json'), keyDir: join(home, 'key'), key: join(home, 'key', 'node.key'), pendingKey: join(home, 'key', 'node.pending.key'),
  runtime: join(home, 'runtime'), current: join(home, 'current.json'), previous: join(home, 'previous.json'),
  state: join(home, 'state'), logs: join(home, 'logs'),
  lock: join(home, 'state', 'supervisor.lock.json'), status: join(home, 'state', 'status.json'),
  revocations: join(home, 'state', 'revocations.json'), stop: join(home, 'state', 'stop.request'),
});

export function readJson(file, fallback = null) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

/** config.json read in order to REWRITE it: the object on disk, or an error (code config_unreadable) when it is absent or cannot be
 *  read or parsed at this instant. A rewrite never starts from {} in place of a record it could not read: that would write back a
 *  config.json without the api address and the node, principal, computer and credential ids, and the next start would find the
 *  node not enrolled. The caller refuses, or keeps what it has and tries again later. */
export function readConfigForRewrite(p) {
  const cfg = readJson(p.config);
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw Object.assign(new Error('config.json cannot be read now'), { code: 'config_unreadable' });
  return cfg;
}
/** atomic: written beside, then renamed over */
export function writeJson(file, value) {
  const dir = join(file, '..');
  mkdirSync(dir, { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  renameSync(tmp, file);
}

/** atomic AND durable: the bytes are flushed to the disk before the rename, so a record the node relies on after a crash or a power
 *  loss (a pending rotation or enrollment: config.json) is either the old one or the new one, never lost after it was relied on */
export function writeJsonDurable(file, value) {
  const dir = join(file, '..');
  mkdirSync(dir, { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  const fd = openSync(tmp, 'w');
  try { writeSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(tmp, file);
}

// ---- logs: never a pairing code, a token, a key or a signature ------------------------------------------------------------------
const SCRUB = [
  [/\b[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}\b/g, '<pairing-code>'],
  [/\b[0-9A-HJKMNP-TV-Z]{18}\b/g, '<pairing-code>'],
  [/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <token>'],
  [/"(session_token|token|assertion|proof|signature|private_key|code|pairing_code)"\s*:\s*"[^"]*"/g, '"$1":"<redacted>"'],
  [/\b[A-Za-z0-9_-]{43}\b(?=[^A-Za-z0-9_-]|$)/g, '<b64-32>'],
  [/\b[A-Za-z0-9_-]{86}\b/g, '<b64-64>'],
  [/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, '<pem>'],
];
export function scrub(s) { let t = String(s); for (const [re, r] of SCRUB) t = t.replace(re, r); return t; }

export function logger(name, home = homeDir(), { echo = false } = {}) {
  const p = paths(home);
  mkdirSync(p.logs, { recursive: true });
  const file = join(p.logs, name + '.log');
  return (msg) => {
    const line = new Date().toISOString() + ' ' + scrub(msg);
    try {
      if (existsSync(file) && statSync(file).size > 2 * 1024 * 1024) { try { renameSync(file, file + '.1'); } catch { /* another writer rotated it */ } }
      appendFileSync(file, line + '\n');
    } catch { /* a log that cannot be written never stops the runtime */ }
    if (echo) process.stdout.write(line + '\n');
  };
}

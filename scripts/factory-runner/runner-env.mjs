// THE RUNNER ENV FILE, READ THE SAME WAY EVERYWHERE - AND JUDGED ONCE, BEFORE ANY WORKER IS STARTED ON IT.
//
// provision-control-plane.mjs --write-env writes one line, FACTORY_RUNNER_PG_URL=<url>, whose `sslrootcert` parameter is
// the absolute path of the CA file ON THE MACHINE THAT PROVISIONED. Copied to another machine (the Work PC) that path may
// not exist - a different username is enough - and the connection would fail closed on a missing CA file. So the loader
// resolves it: when the path in the URL does not exist here but a file of the same name sits beside the env file (or under
// ~/.brain-factory), that local copy is used. Nothing else in the URL is touched, and the URL is never printed.
//
// ONE JUDGE FOR EVERY GATE. The preflight, -Verify, the supervisor and the bootstrap all call loadRunnerUrl() and act on
// `usable`. Each thing a worker would refuse or fail on at connect time is decided HERE, by name, so no gate can pass a file
// the worker then refuses on every start while the supervisor backs off forever (the crash-loop class found twice by
// independent verification, 2026-09-24): a missing CA file, a value that is not a URL (quoted, key=value), a URL db.mjs
// refuses by design (superuser, the production project, plaintext across a network), and a CA file that is not a certificate.
// The file's encoding is decoded rather than guessed: a UTF-8 BOM, or UTF-16 (what Windows PowerShell 5.1's `>` / Out-File
// write when the copied file is re-saved) - anything else with NUL bytes is refused naming the encoding.
import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { assessUrl } from './db.mjs';

export const DEFAULT_ENV_FILE = join(homedir(), '.brain-factory', 'runner.env');

/** Where the env file is: an explicit path (--runner-env), FACTORY_RUNNER_ENV_FILE, or the default. */
export function envFilePath(explicit = null) {
  return resolve(explicit || process.env.FACTORY_RUNNER_ENV_FILE || DEFAULT_ENV_FILE);
}

/**
 * Resolve the CA path inside a runner URL for THIS machine. Pure given the existence checks: returns the URL unchanged when
 * its sslrootcert exists (or is absent), the URL with a local CA path when the recorded one is missing here, and a note
 * saying what happened. `exists` is injectable for the regression test.
 */
export function resolveCaPath(url, { envFile = DEFAULT_ENV_FILE, exists = existsSync } = {}) {
  let u;
  try { u = new URL(url); } catch { return { url, notAUrl: true, note: 'not a URL' }; }
  const ca = u.searchParams.get('sslrootcert');
  if (!ca) return { url, note: 'no sslrootcert parameter' };
  if (exists(ca)) return { url, ca, note: 'sslrootcert exists as recorded' };
  const candidates = [join(dirname(envFile), basename(ca)), join(homedir(), '.brain-factory', basename(ca))];
  const local = candidates.find((p) => exists(p));
  if (!local) return { url, caMissing: true, note: 'sslrootcert ' + ca + ' does not exist here and no copy named ' + basename(ca) + ' was found beside the env file or under ~/.brain-factory - copy the CA file there' };
  u.searchParams.set('sslrootcert', local);
  return { url: u.toString(), ca: local, note: 'sslrootcert resolved to the local copy ' + local };
}

/** The env file's text, decoded by its byte-order mark. Returns {text} or {refusal}. */
export function decodeEnvFile(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.subarray(2).toString('utf16le'), encoding: 'UTF-16LE' };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) { const b = Buffer.from(buf.subarray(2)); b.swap16(); return { text: b.toString('utf16le'), encoding: 'UTF-16BE' }; }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: buf.subarray(3).toString('utf8'), encoding: 'UTF-8 with BOM' };
  if (buf.includes(0)) return { refusal: 'contains NUL bytes without a byte-order mark (UTF-16 without a BOM?) - save it as UTF-8, or copy the original file instead of re-saving it' };
  return { text: buf.toString('utf8'), encoding: 'UTF-8' };
}

/**
 * Read FACTORY_RUNNER_PG_URL from the env file with the CA path resolved for this machine, and judge it.
 * `usable` is the only thing a gate needs: false means the note says why, in words that name the fix.
 * @returns {{url:string|null, usable:boolean, envFile:string, note:string, caMissing:boolean}}
 */
export function loadRunnerUrl(explicit = null) {
  const envFile = envFilePath(explicit);
  const no = (note, extra = {}) => ({ url: null, usable: false, envFile, note, caMissing: false, ...extra });
  if (!existsSync(envFile)) return no('env file not found: ' + envFile + ' (provision-control-plane.mjs --write-env writes it)');
  const decoded = decodeEnvFile(readFileSync(envFile));
  if (decoded.refusal) return no(envFile + ' ' + decoded.refusal);
  const line = decoded.text.split(/\r?\n/).find((l) => l.startsWith('FACTORY_RUNNER_PG_URL='));
  if (!line) return no(envFile + ' has no FACTORY_RUNNER_PG_URL= line (read as ' + decoded.encoding + ')');
  let raw = line.slice('FACTORY_RUNNER_PG_URL='.length).trim();
  // one pair of matching surrounding quotes is the .env convention, not part of the URL
  if (raw.length >= 2 && (raw[0] === '"' || raw[0] === "'") && raw[raw.length - 1] === raw[0]) raw = raw.slice(1, -1);
  const r = resolveCaPath(raw, { envFile });
  if (r.notAUrl) return no('the value of FACTORY_RUNNER_PG_URL in ' + envFile + ' is not a URL (a key=value connection string, or stray characters) - it must be the postgresql://... URL provision-control-plane.mjs wrote');
  // caMissing: the URL names a CA file that exists nowhere on this machine - verify-full would fail closed on every connect
  if (r.caMissing) return { url: r.url, usable: false, envFile, note: r.note, caMissing: true };
  const why = assessUrl(r.url);
  if (why) return { url: r.url, usable: false, envFile, note: 'REFUSED by the accessor: ' + why, caMissing: false };
  if (r.ca) {
    try { new X509Certificate(readFileSync(r.ca)); } catch (e) {
      return { url: r.url, usable: false, envFile, note: 'the CA file ' + r.ca + ' is not a certificate (' + String(e && e.message || e).slice(0, 80) + ') - copy the real CA file', caMissing: false };
    }
  }
  return { url: r.url, usable: true, envFile, note: r.note, caMissing: false };
}

/** Put the URL into process.env for this process when it is not already there and the file is usable. Returns the note. */
export function ensureRunnerEnv(explicit = null) {
  if (process.env.FACTORY_RUNNER_PG_URL) return 'FACTORY_RUNNER_PG_URL already set in the environment';
  const r = loadRunnerUrl(explicit);
  if (!r.usable) return r.note;
  process.env.FACTORY_RUNNER_PG_URL = r.url;
  return r.note;
}

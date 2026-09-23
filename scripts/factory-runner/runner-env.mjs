// THE RUNNER ENV FILE, READ THE SAME WAY EVERYWHERE.
//
// provision-control-plane.mjs --write-env writes one line, FACTORY_RUNNER_PG_URL=<url>, whose `sslrootcert` parameter is
// the absolute path of the CA file ON THE MACHINE THAT PROVISIONED. Copied to another machine (the Work PC) that path may
// not exist - a different username is enough - and the connection would fail closed on a missing CA file. So the loader
// resolves it: when the path in the URL does not exist here but a file of the same name sits beside the env file (or under
// ~/.brain-factory), that local copy is used. Nothing else in the URL is touched, and the URL is never printed.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export const DEFAULT_ENV_FILE = join(homedir(), '.brain-factory', 'runner.env');

/** Where the env file is: --env-file, FACTORY_RUNNER_ENV_FILE, or the default. */
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
  try { u = new URL(url); } catch { return { url, note: 'not a URL' }; }
  const ca = u.searchParams.get('sslrootcert');
  if (!ca) return { url, note: 'no sslrootcert parameter' };
  if (exists(ca)) return { url, note: 'sslrootcert exists as recorded' };
  const candidates = [join(dirname(envFile), basename(ca)), join(homedir(), '.brain-factory', basename(ca))];
  const local = candidates.find((p) => exists(p));
  if (!local) return { url, note: 'sslrootcert ' + ca + ' does not exist here and no copy named ' + basename(ca) + ' was found beside the env file or under ~/.brain-factory - copy the CA file there' };
  u.searchParams.set('sslrootcert', local);
  return { url: u.toString(), note: 'sslrootcert resolved to the local copy ' + local };
}

/**
 * Read FACTORY_RUNNER_PG_URL from the env file with the CA path resolved for this machine.
 * @returns {{url:string|null, envFile:string, note:string}}
 */
export function loadRunnerUrl(explicit = null) {
  const envFile = envFilePath(explicit);
  if (!existsSync(envFile)) return { url: null, envFile, note: 'env file not found: ' + envFile + ' (provision-control-plane.mjs --write-env writes it)' };
  const line = readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('FACTORY_RUNNER_PG_URL='));
  if (!line) return { url: null, envFile, note: envFile + ' has no FACTORY_RUNNER_PG_URL= line' };
  const raw = line.slice('FACTORY_RUNNER_PG_URL='.length).trim();
  const r = resolveCaPath(raw, { envFile });
  return { url: r.url, envFile, note: r.note };
}

/** Put the URL into process.env for this process when it is not already there. Returns the note. */
export function ensureRunnerEnv(explicit = null) {
  if (process.env.FACTORY_RUNNER_PG_URL) return 'FACTORY_RUNNER_PG_URL already set in the environment';
  const r = loadRunnerUrl(explicit);
  if (!r.url) return r.note;
  process.env.FACTORY_RUNNER_PG_URL = r.url;
  return r.note;
}

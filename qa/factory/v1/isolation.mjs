// SUITE ISOLATION (S-15: candidate tests never touch ~/.brain-factory/runner.env; WO-10). The tools set FACTORY_RUNNER_ENV_FILE to an
// absolute path that does not exist, in a fresh scratch directory outside ~/.brain-factory, and empty FACTORY_RUNNER_PG_URL.
// isolationProof() spawns a child under exactly that environment and has it resolve both frozen 69df2f52 resolvers (runner-env.mjs's
// envFilePath() itself, and node-supervisor.mjs's expression, its file pinned to the 69df2f52 blob), so the evidence header records
// the path each resolved to, not a belief.
// A Director instrument child that refuses any FACTORY_RUNNER_ENV_FILE (qa/verification/auto-enrollment-v1/tools/plane_access.mjs)
// gets the variable deleted by its own harness (manifest_rehearsal.mjs toolEnv), never an empty value.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BASELINE = '69df2f52f71fd2bc9415c34fb2be4dab4ee08dd6';
export const DEFAULT_RUNNER_ENV = join(homedir(), '.brain-factory', 'runner.env');
export const SUPERVISOR_ENV_EXPR = "process.env.FACTORY_RUNNER_ENV_FILE || join(homedir(), '.brain-factory', 'runner.env')";
const same = (a, b) => (process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));

/** the spawn environment of an isolated suite -> { env, envFile, label } */
export function isolatedSuiteEnv(base = process.env) {
  const dir = mkdtempSync(join(tmpdir(), 'bf-isolation-'));
  const envFile = join(dir, 'runner.env.absent'); // never created
  if (!isAbsolute(envFile) || existsSync(envFile) || same(envFile, DEFAULT_RUNNER_ENV) || resolve(envFile).toLowerCase().includes('.brain-factory')) {
    throw new Error('isolation: the env-file path ' + envFile + ' is not an absent absolute path outside ~/.brain-factory');
  }
  const env = { ...base, FACTORY_RUNNER_PG_URL: '', FACTORY_RUNNER_ENV_FILE: envFile };
  const label = 'environment disposable (local): FACTORY_RUNNER_PG_URL emptied; FACTORY_RUNNER_ENV_FILE=' + envFile
    + ' (absent; the default ' + DEFAULT_RUNNER_ENV + ' is never resolved)';
  return { env, envFile, label };
}

/**
 * Prove, in a child under `iso.env`, what both frozen resolvers resolve to. -> { ok, runnerEnv, supervisor, pinned, line }
 * `root` is the checkout whose frozen files are read (a mutation-proof copy passes its own).
 */
export function isolationProof(iso, { root = ROOT } = {}) {
  const sup = join(root, 'scripts', 'factory-runner', 'node-supervisor.mjs');
  const text = readFileSync(sup, 'utf8').replace(/\r\n/g, '\n');
  const line = text.split('\n')[47] || '';
  const want = spawnSync('git', ['-C', root, 'rev-parse', BASELINE + ':scripts/factory-runner/node-supervisor.mjs'], { encoding: 'utf8' }).stdout.trim();
  const have = spawnSync('git', ['-C', root, 'hash-object', 'scripts/factory-runner/node-supervisor.mjs'], { encoding: 'utf8' }).stdout.trim();
  const pinned = !!want && want === have && line.includes(SUPERVISOR_ENV_EXPR);
  const script = 'const m = await import(' + JSON.stringify(pathToFileURL(join(root, 'scripts', 'factory-runner', 'runner-env.mjs')).href) + ');'
    + "const { homedir } = await import('node:os'); const { join, resolve } = await import('node:path');"
    + 'process.stdout.write(JSON.stringify({ runnerEnv: m.envFilePath(), supervisor: resolve(' + SUPERVISOR_ENV_EXPR + ') }));';
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: iso.env, encoding: 'utf8', cwd: root, timeout: 60000 });
  let got = {};
  try { got = JSON.parse(r.stdout); } catch { /* reported below */ }
  const ok = pinned && !!got.runnerEnv && same(got.runnerEnv, iso.envFile) && !!got.supervisor && same(got.supervisor, iso.envFile) && !existsSync(iso.envFile);
  return { ok, runnerEnv: got.runnerEnv || null, supervisor: got.supervisor || null, pinned, line: line.trim(), error: ok ? null : (r.stderr || '').slice(0, 400) };
}

/** the evidence header lines for a tool's run */
export function isolationHeader(iso, proof) {
  return [iso.label, 'isolation proof: runner-env.mjs envFilePath() -> ' + proof.runnerEnv + '; node-supervisor.mjs:48 -> ' + proof.supervisor
    + ' (pinned to ' + BASELINE.slice(0, 8) + ': ' + (proof.pinned ? 'yes' : 'NO') + '); ' + (proof.ok ? 'both resolve to the absent path' : 'FAILED')];
}

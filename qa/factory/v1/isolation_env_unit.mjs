#!/usr/bin/env node
// S-15 / WO-10 (L6-4): the isolation the evidence tools use really excludes the default runner.env. No plane, no database.
// A scratch "home" (USERPROFILE and HOME) holds a planted .brain-factory\runner.env whose URL is a sentinel; children resolve the env
// file the way the frozen 69df2f52 code does (runner-env.mjs envFilePath() / loadRunnerUrl(), node-supervisor.mjs:48's expression):
//   IS1  under isolatedSuiteEnv(): both resolve the helper's absent path; loadRunnerUrl() is not usable and the sentinel never appears
//   IS2  the sensitivity witness: the same child with the variable EMPTIED (what the tools used to do) resolves the planted file and
//        reads the sentinel - the row IS1 would fail if the helper emptied the variable
//   IS3  isolationProof() - what the tools record in their evidence headers - says ok for the helper's environment and not ok for an
//        emptied one, with node-supervisor.mjs pinned to its 69df2f52 blob
// usage: node qa/factory/v1/isolation_env_unit.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolatedSuiteEnv, isolationProof, SUPERVISOR_ENV_EXPR } from './isolation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const results = [];
const row = (id, ok, detail) => { results.push({ id, ok: !!ok }); console.log((ok ? 'OK   ' : 'FAIL ') + id + (detail ? ' - ' + String(detail).slice(0, 1200) : '')); };
const work = mkdtempSync(join(tmpdir(), 'bf-iso-unit-'));
// the planted value is a URL with a user and a password field on the loopback discard port, so loadRunnerUrl() treats it like a real
// runner URL; it is assembled at run time so the repository text carries no credential-shaped URL (the secret scan stays clean)
const SENTINEL = ['postgresql:', '', ['sentinel_user', 'sentinel_pw'].join(':') + '@127.0.0.1:9', 'sentinel_db'].join('/');
const same = (a, b) => !!a && !!b && resolve(a).toLowerCase() === resolve(b).toLowerCase();
try {
  const home = join(work, 'profile');
  mkdirSync(join(home, '.brain-factory'), { recursive: true });
  const planted = join(home, '.brain-factory', 'runner.env');
  writeFileSync(planted, 'FACTORY_RUNNER_PG_URL=' + SENTINEL + '\n');
  const redirected = { ...process.env, USERPROFILE: home, HOME: home };
  const probe = (env) => {
    const script = 'const m = await import(' + JSON.stringify(pathToFileURL(join(ROOT, 'scripts', 'factory-runner', 'runner-env.mjs')).href) + ');'
      + "const { homedir } = await import('node:os'); const { join, resolve } = await import('node:path');"
      + 'const l = m.loadRunnerUrl(); process.stdout.write(JSON.stringify({ path: m.envFilePath(), supervisor: resolve(' + SUPERVISOR_ENV_EXPR + '), usable: l.usable, url: l.url, note: l.note }));';
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8', cwd: ROOT, timeout: 60000 });
    try { return { ...JSON.parse(r.stdout), raw: r.stdout + r.stderr }; } catch { return { raw: r.stdout + r.stderr }; }
  };
  const iso = isolatedSuiteEnv(redirected);
  const a = probe(iso.env);
  row('IS1 under isolatedSuiteEnv() (the profile redirected to a scratch home holding a planted runner.env), runner-env.mjs and node-supervisor.mjs:48 both resolve the helper\'s absent path; loadRunnerUrl() is not usable and the planted sentinel URL never appears',
    same(a.path, iso.envFile) && same(a.supervisor, iso.envFile) && a.usable === false && !a.url && !String(a.raw).includes('sentinel'),
    JSON.stringify({ path: a.path, supervisor: a.supervisor, usable: a.usable, url: a.url }));
  // the sensitivity witness: the value the tools used to set
  const b = probe({ ...iso.env, FACTORY_RUNNER_ENV_FILE: '' }); // the witness: emptied, as the tools used to
  row('IS2 the witness: with FACTORY_RUNNER_ENV_FILE emptied instead, the same child resolves the planted default file and reads its sentinel URL (so IS1 fails if the helper empties the variable)',
    same(b.path, planted) && same(b.supervisor, planted) && String(b.url || '').includes('sentinel'), JSON.stringify({ path: b.path, supervisor: b.supervisor, url: b.url ? 'sentinel read' : null }));
  const good = isolationProof(isolatedSuiteEnv(redirected));
  const bad = isolationProof({ ...iso, env: { ...iso.env, FACTORY_RUNNER_ENV_FILE: '' } }); // the witness, through the proof
  row('IS3 isolationProof() (what the tools record) is ok for the helper\'s environment - both resolvers name the absent path and node-supervisor.mjs is the 69df2f52 blob - and not ok for an emptied variable',
    good.ok === true && good.pinned === true && bad.ok === false, JSON.stringify({ good: { ok: good.ok, pinned: good.pinned, line: good.line }, bad: { ok: bad.ok, runnerEnv: bad.runnerEnv } }));
} catch (e) {
  row('X0 isolation unit', false, (e && e.stack) || e);
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\nisolation_env_unit: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length ? 1 : 0);

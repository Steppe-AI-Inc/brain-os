#!/usr/bin/env node
// AC-11 REHEARSAL WITH THE DIRECTOR'S OWN INSTRUMENT (VERIFICATION_SPEC §3 (3)), as the implementer's developer evidence:
//   1. a disposable plane provisioned as 69df2f52, BASELINE_69df2f52_EVIDENCE_ROWS.json loaded unchanged;
//   2. qa/verification/auto-enrollment-v1/tools/baseline_manifest.mjs run with FACTORY_TARGET=disposable, the plane's non-superuser
//      factory_runner URL, and FACTORY_BASELINE_CHECKOUT = a 69df2f52 checkout (never the candidate tree, never the live checkout):
//      here a sparse clone in the temp directory, sharing this repository's objects read-only, with the 69df2f52 package-lock and
//      the same installed pg versions (the tool verifies both);
//   3. the candidate migration; 4. the instrument again. Both runs' set hashes must equal the manifest's.
// usage: node qa/factory/v1/manifest_rehearsal.mjs [--evidence <file>]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, BASELINE, startV1Plane } from './plane.mjs';
import { apply, compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';

const TOOL = join(ROOT, 'qa/verification/auto-enrollment-v1/tools/baseline_manifest.mjs');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'qa/verification/auto-enrollment-v1/BASELINE_69df2f52_EVIDENCE_MANIFEST.json'), 'utf8'));
const B69 = join(tmpdir(), 'factory-v1-baseline-69df2f52');
const g = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function baselineCheckout() {
  if (!existsSync(join(B69, '.git'))) {
    mkdirSync(B69, { recursive: true });
    g('clone', '--quiet', '--shared', '--no-checkout', ROOT, B69);
    g('-C', B69, 'sparse-checkout', 'set', '--no-cone', '/scripts/factory-runner/', '/package.json', '/package-lock.json');
  }
  g('-C', B69, '-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach', BASELINE);
  if (g('-C', B69, 'rev-parse', 'HEAD') !== BASELINE) throw new Error('the baseline checkout is not at ' + BASELINE);
  if (!existsSync(join(B69, 'node_modules'))) {
    // the 69df2f52 package-lock pins pg; this tree's installed pg is the same version (the instrument refuses otherwise)
    const r = spawnSync('cmd', ['/c', 'mklink', '/J', join(B69, 'node_modules'), join(ROOT, 'node_modules')], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('could not link node_modules: ' + r.stdout + r.stderr);
  }
  return B69;
}

const runTool = (runnerUrl, out) => {
  const env = { ...process.env, FACTORY_TARGET: 'disposable', FACTORY_RUNNER_PG_URL: runnerUrl, FACTORY_BASELINE_CHECKOUT: B69 };
  for (const k of ['FACTORY_OBSERVER_ENV', 'FACTORY_DIRECTOR_INTERIM_RUNNER_ENV', 'FACTORY_BASELINE_ROWS_OUT']) delete env[k];
  const r = spawnSync(process.execPath, [TOOL, out], { encoding: 'utf8', env, cwd: ROOT, timeout: 120000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const m = (name) => (new RegExp('set_sha256 ' + name + ' ([0-9a-f]{64})').exec(text) || [])[1];
  return { status: r.status, text, set: { agent_runs: m('agent_runs'), work_orders: m('work_orders'), checkpoints: m('checkpoints') },
    observed: (/observed: .*/.exec(text) || [''])[0] };
};

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
baselineCheckout();
say('baseline checkout: ' + B69 + ' at ' + g('-C', B69, 'rev-parse', 'HEAD') + ' (sparse: scripts/factory-runner, package.json, package-lock.json)');
const plane = await startV1Plane({ migrate: false, baselineRows: true });
try {
  say('plane: disposable, provisioned as 69df2f52; rows loaded ' + JSON.stringify(plane.loaded));
  const tmpOut = (n) => join(plane.dir, n);
  const pre = runTool(plane.runnerUrl, tmpOut('manifest-before.json'));
  say('instrument BEFORE the migration: exit ' + pre.status + ' ' + JSON.stringify(pre.set));
  say('  ' + pre.observed.replace(/root [0-9a-f]+/, (x) => x));
  const r = await apply(plane.superUrl);
  say('candidate migration applied: sha256 ' + r.sha256);
  const post = runTool(plane.runnerUrl, tmpOut('manifest-after.json'));
  say('instrument AFTER the migration:  exit ' + post.status + ' ' + JSON.stringify(post.set));
  say('  ' + post.observed);
  const eq = (s) => s.agent_runs === MANIFEST.set_sha256.agent_runs && s.work_orders === MANIFEST.set_sha256.work_orders && s.checkpoints === MANIFEST.set_sha256.checkpoints;
  const ok = pre.status === 0 && post.status === 0 && eq(pre.set) && eq(post.set) && /disposable/.test(post.observed);
  say('manifest set_sha256: ' + JSON.stringify(MANIFEST.set_sha256));
  say((ok ? 'OK   ' : 'FAIL ') + 'AC-11 rehearsal: the Director instrument\'s set hashes equal the manifest before AND after the candidate migration on the copy');
  if (!ok) { console.log(pre.text); console.log(post.text); }
  const ev = process.argv.indexOf('--evidence');
  if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/manifest_rehearsal.mjs', 'migration sha256 ' + sha256(compose()), ...lines, ok ? '1/1 OK' : '0/1 OK'].join('\n') + '\n');
  process.exitCode = ok ? 0 : 1;
} finally {
  await plane.stop();
}

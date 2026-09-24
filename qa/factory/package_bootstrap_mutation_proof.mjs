#!/usr/bin/env node
// MUTATION PROOF FOR package_bootstrap_regression.mjs - each row goes red on the defect it names, and only a control stays green.
//
//   node qa/factory/package_bootstrap_mutation_proof.mjs            static mutants (seconds, no network)
//   node qa/factory/package_bootstrap_mutation_proof.mjs --fresh    also the fresh-clone mutants, including the ORIGINAL defect:
//                                                                   the published commit ee2fce2b (no lock, pg undeclared)
//
// Every mutant is its own clone of HEAD with one defect committed in it; the regression is run against it with --root. A
// mutant "is killed" when the row named for its defect fails. The fresh mutants skip F6 (the installer row): code from
// before the other-checkout guard would replace this PC's live scheduled task, and the guard is proved by F6 on the real code.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const REGRESSION = join(HERE, 'package_bootstrap_regression.mjs');
const FRESH = process.argv.includes('--fresh');
const ORIGINAL_DEFECT = 'ee2fce2b75015fe9e1037a3a35b21f34cd6246c2';
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const work = mkdtempSync(join(tmpdir(), 'factory-pkg-mut-'));
const head = git(['rev-parse', 'HEAD'], ROOT);
let n = 0;
const clone = (name, at = head) => { const d = join(work, name); git(['clone', '--quiet', '--no-hardlinks', ROOT, d], work); git(['checkout', '--quiet', at], d); return d; };
const commitAll = (d, msg) => { git(['add', '-A'], d); git(['-c', 'user.name=mutant', '-c', 'user.email=mutant@example.invalid', 'commit', '--quiet', '--no-verify', '-m', msg], d); };
const edit = (d, file, fn) => { const p = join(d, file); writeFileSync(p, fn(readFileSync(p, 'utf8'))); };
const editJson = (d, file, fn) => edit(d, file, (s) => JSON.stringify(fn(JSON.parse(s)), null, 2) + '\n');
const runRegression = (d, extra = []) => {
  const r = spawnSync(process.execPath, [REGRESSION, '--root', d, ...extra], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 1800000, env: { ...process.env, FACTORY_RUNNER_PG_URL: '', FACTORY_STATE_DIR: '' } });
  const out = (r.stdout || '') + (r.stderr || '');
  return { rc: r.status, failed: [...out.matchAll(/^FAIL (\w+)/gm)].map((m) => m[1]), out };
};
const results = [];
const expectRed = (id, label, d, rows, extra = []) => {
  n++;
  const r = runRegression(d, extra);
  const killed = r.rc === 1 && rows.every((row) => r.failed.includes(row));
  results.push({ id, killed });
  console.log((killed ? 'KILLED  ' : 'SURVIVED') + ' ' + id + ' ' + label + ' -> expected red ' + rows.join('+') + '; failed rows: ' + (r.failed.join(', ') || 'none') + ' (rc ' + r.rc + ')');
  if (!killed) console.log(r.out.split(/\r?\n/).filter((l) => /^(OK|FAIL|SKIP)/.test(l)).map((l) => '         ' + l.slice(0, 200)).join('\n'));
};

try {
  // control: HEAD unmutated must be green on the static rows
  { const d = clone('control'); const r = runRegression(d, ['--static']); const green = r.rc === 0 && r.failed.length === 0; results.push({ id: 'C0', killed: green }); console.log((green ? 'GREEN   ' : 'RED     ') + ' C0 control (HEAD, no mutation) must pass every static row; failed: ' + (r.failed.join(', ') || 'none')); }

  { const d = clone('m1'); git(['rm', '--cached', '--quiet', 'package-lock.json'], d); appendFileSync(join(d, '.gitignore'), '\npackage-lock.json\n'); commitAll(d, 'mutant: lock untracked and ignored');
    expectRed('M1', 'package-lock.json untracked and ignored', d, ['K1'], ['--static']); }
  { const d = clone('m2'); editJson(d, 'package.json', (p) => { p.devDependencies.pg = p.dependencies.pg; delete p.dependencies.pg; return p; });
    editJson(d, 'package-lock.json', (l) => { const r = l.packages['']; r.devDependencies = { ...r.devDependencies, pg: r.dependencies.pg }; delete r.dependencies.pg; return l; }); commitAll(d, 'mutant: pg dev-only');
    expectRed('M2', 'pg declared only as a dev dependency (a --omit=dev node cannot load it)', d, ['K3'], ['--static']); }
  { const d = clone('m3'); edit(d, 'scripts/factory-runner/deps.mjs', (s) => "import leftPad from 'left-pad';\n" + s); commitAll(d, 'mutant: undeclared import');
    expectRed('M3', 'a runtime file imports an undeclared package', d, ['K3'], ['--static']); }
  { const d = clone('m4'); editJson(d, 'package.json', (p) => { p.dependencies.pg = '^8.23.0'; return p; }); editJson(d, 'package-lock.json', (l) => { l.packages[''].dependencies.pg = '^8.23.0'; return l; }); commitAll(d, 'mutant: pg range');
    expectRed('M4', 'pg declared as a range instead of the measured exact version', d, ['K4'], ['--static']); }
  { const d = clone('m5'); editJson(d, 'package.json', (p) => { delete p.allowScripts['fsevents@2.3.3']; return p; }); commitAll(d, 'mutant: undecided install script');
    expectRed('M5', 'a locked package with an install script has no allowScripts decision', d, ['K5'], ['--static']); }
  { const d = clone('m6'); editJson(d, 'package-lock.json', (l) => { l.packages['node_modules/pg-connection-string'].version = '2.15.0'; return l; }); commitAll(d, 'mutant: driver bumped');
    expectRed('M6', 'pg-connection-string moved off the version the TLS modes were measured on', d, ['K4'], ['--static']); }
  { const d = clone('m7'); editJson(d, 'package-lock.json', (l) => { l.packages['node_modules/pg'].hasInstallScript = true; return l; }); commitAll(d, 'mutant: runtime install script');
    expectRed('M7', 'a runtime package gains an install script', d, ['K6'], ['--static']); }
  { const d = clone('m8'); editJson(d, 'package.json', (p) => { p.dependencies['pg-pool'] = '3.14.0'; return p; }); commitAll(d, 'mutant: manifest ahead of lock');
    expectRed('M8', 'the manifest changed without regenerating the lock (npm ci would refuse)', d, ['K2'], ['--static']); }

  if (FRESH) {
    { const d = clone('original', ORIGINAL_DEFECT);
      expectRed('F-ORIG', 'the ORIGINAL defect: published commit ' + ORIGINAL_DEFECT.slice(0, 8) + ' (no package-lock.json, pg undeclared)', d, ['K1', 'K2', 'K3', 'F1', 'F2', 'F3', 'F4', 'F5', 'F7'], ['--skip', 'F6']); }
    { const d = clone('f5'); edit(d, 'scripts/factory-runner/node-supervisor.mjs', (s) => s.replace('  if (deps.ok) return;', '  return;')); commitAll(d, 'mutant: supervisor never refuses');
      expectRed('F-SUP', 'the supervisor starts a worker whatever the dependency check says (the crash loop)', d, ['F5'], ['--skip', 'F6,F7,F8,F9']); }
    { const d = clone('f7'); edit(d, 'scripts/factory-runner/bootstrap-node.sh', (s) => s.replace('NOTE_FILE="$(mktemp 2>/dev/null || echo "${TMPDIR:-/tmp}/factory-env-note.$$")"', 'NOTE_FILE="$ROOT/.factory/.env-note"')); commitAll(d, 'mutant: bootstrap redirects into .factory');
      expectRed('F-BOOT', 'the bootstrap writes into a .factory/ a fresh clone does not have', d, ['F7'], ['--skip', 'F6,F8,F9']); }
    { const d = clone('f8'); editJson(d, 'package.json', (p) => { delete p.allowScripts['@embedded-postgres/windows-x64@18.4.0-beta.17']; delete p.allowScripts['@embedded-postgres/linux-x64@18.4.0-beta.17']; delete p.allowScripts['@embedded-postgres/darwin-arm64@18.4.0-beta.17']; return p; }); commitAll(d, 'mutant: postgres binary script unreviewed');
      expectRed('F-STRICT', 'the embedded-postgres binaries lose their install-script approval (strict npm ci must refuse)', d, ['K5', 'F8'], ['--skip', 'F6,F7,F9']); }
  }
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const killed = results.filter((r) => r.killed).length;
console.log('');
console.log('package_bootstrap_mutation_proof: ' + killed + ' of ' + results.length + ' (control green + mutants killed)' + (FRESH ? '' : '  (static mutants only; --fresh adds the original defect and three fresh-clone mutants)'));
process.exit(killed === results.length ? 0 : 1);

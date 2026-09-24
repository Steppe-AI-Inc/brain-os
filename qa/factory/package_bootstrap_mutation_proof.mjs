#!/usr/bin/env node
// MUTATION PROOF FOR package_bootstrap_regression.mjs - each row goes red on the defect it names, and only a control stays green.
//
//   node qa/factory/package_bootstrap_mutation_proof.mjs            static mutants (seconds, no network)
//   node qa/factory/package_bootstrap_mutation_proof.mjs --fresh    also the fresh-clone mutants, including the ORIGINAL defect:
//                                                                   the published commit ee2fce2b (no lock, pg undeclared)
//
// Before any mutant runs, every source string a mutant rewrites must exist exactly once, or the mutant would silently be the
// unmutated code and "survive" for the wrong reason (or, worse, be counted as killed by an unrelated row).
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
// SPARSE CLONES, DELETED AS SOON AS JUDGED. The first --fresh run kept a dozen full clones until the end and filled the disk
// ("No space left on device" mid-clone, 2026-09-24). A mutant needs only the Factory's own paths; the regression is told --sparse too.
const clone = (name, at = head) => {
  const d = join(work, name);
  git(['clone', '--quiet', '--no-hardlinks', '--no-checkout', ROOT, d], work);
  git(['sparse-checkout', 'set', '--cone', 'scripts', 'qa/factory', 'supabase/control-plane'], d);
  git(['checkout', '--quiet', at], d);
  return d;
};
const drop = (d) => { try { rmSync(d, { recursive: true, force: true }); } catch { /* windows lock: removed with the work dir at the end */ } };
const commitAll = (d, msg) => { git(['add', '-A'], d); git(['-c', 'user.name=mutant', '-c', 'user.email=mutant@example.invalid', 'commit', '--quiet', '--no-verify', '-m', msg], d); };
const edit = (d, file, fn) => { const p = join(d, file); writeFileSync(p, fn(readFileSync(p, 'utf8'))); };
const editJson = (d, file, fn) => edit(d, file, (s) => JSON.stringify(fn(JSON.parse(s)), null, 2) + '\n');
const runRegression = (d, extra = []) => {
  const r = spawnSync(process.execPath, [REGRESSION, '--root', d, ...extra], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 1800000, env: { ...process.env, FACTORY_RUNNER_PG_URL: '', FACTORY_STATE_DIR: '' } });
  const out = (r.stdout || '') + (r.stderr || '');
  return { rc: r.status, failed: [...out.matchAll(/^FAIL (\w+)/gm)].map((m) => m[1]), out };
};
const results = [];
{
  const need = [['scripts/factory-runner/deps.mjs', 'const entries = Object.entries(lock.packages).filter('], ['scripts/factory-runner/node.mjs', "  const cmd = process.argv[2] || 'start';"],
    ['scripts/factory-runner/verify-deployed-bytes.sh', 'npx --yes supabase@2.117.0 functions download'], ['scripts/factory-runner/node-supervisor.mjs', '  if (deps.ok) return;'],
    ['scripts/factory-runner/node-supervisor.mjs', "if (!loaded.usable) refuse(2, 'refused', loaded.note);"], ['scripts/factory-runner/node-supervisor.mjs', '    if (ours) {'],
    ['scripts/factory-runner/deps.mjs', 'if (load && lockPresent && rows.every'],
    ['scripts/factory-runner/node.mjs', '      workTypes: HANDLED_WORK_TYPES,'], ['scripts/factory-runner/node.mjs', '    noteAdmission();'],
    ['scripts/factory-runner/install-autostart.ps1', '$headless = (Test-Path -LiteralPath $conhost)'],
    ['scripts/factory-runner/node-supervisor.mjs', 'if (!held.held) {'], ['scripts/factory-runner/runner-env.mjs', "if (!/-----BEGIN CERTIFICATE-----/.test(text)) {"],
    ['scripts/factory-runner/runner-env.mjs', 'try { new X509Certificate(text); } catch (e) {'], ['scripts/factory-runner/install-autostart.ps1', '$EnvFile = Get-FullPath $EnvFile'],
    ['scripts/factory-runner/install-autostart.ps1', "if ($sv -and $task.State -eq 'Running' -and $sv.role -eq $want) {"],
    ['scripts/factory-runner/node-supervisor.mjs', "if (process.platform === 'win32' && /conhost(\\.exe)?\"?\\s+--headless/i.test(commandLineOf(process.ppid) || '')) {"],
    ['scripts/factory-runner/install-autostart.ps1', "if (-not $LogGiven -and (Get-TaskArg $task 'logdir')) { $LogDir = Get-TaskArg $task 'logdir' }"],
    ['scripts/factory-runner/install-autostart.ps1', "-Trigger @((New-ScheduledTaskTrigger -AtLogOn -User $me), $watchdogTrigger)"],
    ['scripts/factory-runner/url-judge.mjs', '  if (foreign.length) {'],
    ['scripts/factory-runner/url-judge.mjs', "  const lower = lenient.toLowerCase() + '\\n' + String(url).toLowerCase();"],
    ['scripts/factory-runner/node-supervisor.mjs', '    if (now !== envSeen) {'],
    ['scripts/factory-runner/install-autostart.ps1', "  $o = Ask-Supervisor $dir 'whois'"],
    ['scripts/factory-runner/url-judge.mjs', "  if (!u.username) return"], ['scripts/factory-runner/install-autostart.ps1', "if (-not $PSBoundParameters.ContainsKey('WatchdogMinutes') -and $task) {"],
    ['scripts/factory-runner/install-autostart.ps1', "if ($Start -and -not $RoleGiven -and -not $EnvGiven -and -not $ChangeGiven -and $task -and -not (Test-OtherCheckout $owner)) {"],
    ['scripts/factory-runner/install-autostart.ps1', "if (-not $RoleGiven -and (Get-TaskArg $task 'role')) {"],
    ['scripts/factory-runner/node.mjs', '    const role = held ? held.security_role : (stated || "generic");'],
    ['scripts/factory-runner/install-autostart.ps1', "    elseif ($live.state -ne 'running' -or -not $live.childPid) {"],
    ['scripts/factory-runner/url-judge.mjs', '  if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(String(url))) {'],
    ['scripts/factory-runner/install-autostart.ps1', "    $nodeLine = & $NodeExe (Join-Path $Root 'scripts\\factory-runner\\node.mjs') status --runner-env $envPath"],
    ['scripts/factory-runner/bootstrap-node.sh', 'ROLE=""\nENV_FILE=""'],
    ['scripts/factory-runner/install-autostart.ps1', 'return ($plane.head -eq $CheckoutHead) }'],
    ['scripts/factory-runner/install-autostart.ps1', "foreach ($d in @($Root) + @(if ($owner -and (Test-OtherCheckout $owner)) { $owner })) {"],
    ['scripts/factory-runner/bootstrap-node.sh', 'NOTE_FILE="$(mktemp 2>/dev/null || echo "$' + '{TMPDIR:-/tmp}/factory-env-note.$$")"']];
  const missing = need.filter(([f, s]) => readFileSync(join(ROOT, f), 'utf8').split('\r\n').join('\n').split(s).length !== 2);
  if (missing.length) { console.log('MUTATION ANCHORS MISSING - the proof would test nothing: ' + missing.map(([f, s]) => f + ': ' + s).join(' | ')); process.exit(2); }
}
const expectRed = (id, label, d, rows, extra = []) => {
  n++;
  const r = runRegression(d, extra.includes('--static') ? extra : [...extra, '--sparse']);
  drop(d);
  const killed = r.rc === 1 && rows.every((row) => r.failed.includes(row));
  results.push({ id, killed });
  console.log((killed ? 'KILLED  ' : 'SURVIVED') + ' ' + id + ' ' + label + ' -> expected red ' + rows.join('+') + '; failed rows: ' + (r.failed.join(', ') || 'none') + ' (rc ' + r.rc + ')');
  if (!killed) console.log(r.out.split(/\r?\n/).filter((l) => /^(OK|FAIL|SKIP)/.test(l)).map((l) => '         ' + l.slice(0, 200)).join('\n'));
};

try {
  // control: HEAD unmutated must be green on the static rows
  { const d = clone('control'); const r = runRegression(d, ['--static']); drop(d); const green = r.rc === 0 && r.failed.length === 0; results.push({ id: 'C0', killed: green }); console.log((green ? 'GREEN   ' : 'RED     ') + ' C0 control (HEAD, no mutation) must pass every static row; failed: ' + (r.failed.join(', ') || 'none')); }

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
  { const d = clone('m9'); edit(d, 'scripts/factory-runner/deps.mjs', (s) => "import { createRequire } from 'node:module';\nconst load = createRequire(import.meta.url);\nexport const leftPad = () => load('left-pad');\n" + s); commitAll(d, 'mutant: undeclared load through a createRequire alias');
    expectRed('M9', 'a runtime file loads an undeclared package through a createRequire alias', d, ['K3'], ['--static']); }
  { const d = clone('m10'); edit(d, 'scripts/factory-runner/deps.mjs', (s) => s + "\nexport const later = (n) => import(n);\n"); commitAll(d, 'mutant: non-constant load');
    expectRed('M10', 'a runtime file loads a package whose name is only known at run time (cannot be checked)', d, ['K3'], ['--static']); }
  { const d = clone('m11'); edit(d, 'scripts/factory-runner/verify-deployed-bytes.sh', (s) => s.replace('npx --yes supabase@2.117.0 functions download', 'npx --yes supabase@latest functions download')); commitAll(d, 'mutant: npx @latest');
    expectRed('M11', 'a script fetches supabase@latest at run time (unpinned, outside the lock)', d, ['K7'], ['--static']); }
  { const d = clone('m12'); edit(d, 'scripts/factory-runner/deps.mjs', (s) => "import { createRequire as mk } from 'node:module';\nconst q = mk(import.meta.url);\nconst q2 = q;\nexport const lp = () => q2.call(null, 'left-pad');\n" + s); commitAll(d, 'mutant: renamed createRequire, an alias of the alias, .call');
    expectRed('M12', 'an undeclared load through a RENAMED createRequire import, an alias of the alias and .call', d, ['K3'], ['--static']); }
  { const d = clone('m13'); edit(d, 'scripts/factory-runner/verify-deployed-bytes.sh', (s) => s.replace('npx --yes supabase@2.117.0 functions download', 'npx "supabase@latest" functions download')); commitAll(d, 'mutant: quoted unpinned npx without --yes');
    expectRed('M13', 'a quoted, unpinned npx fetch without --yes (non-TTY npx fetches anyway)', d, ['K7'], ['--static']); }
  { const d = clone('m14'); edit(d, 'scripts/factory-runner/deps.mjs', (s) => "import { spawnSync as sx } from 'node:child_process';\nexport const fetchIt = () => sx('npx', ['--yes', 'cowsay']);\n" + s); commitAll(d, 'mutant: spawn npx from JS');
    expectRed('M14', 'a JS file spawns npx with an unpinned package', d, ['K7'], ['--static']); }

  if (FRESH) {
    { const d = clone('original', ORIGINAL_DEFECT);
      expectRed('F-ORIG', 'the ORIGINAL defect: published commit ' + ORIGINAL_DEFECT.slice(0, 8) + ' (no package-lock.json, pg undeclared)', d, ['K1', 'K2', 'K3', 'F1', 'F2', 'F3', 'F4', 'F5', 'F7'], ['--skip', 'F6']); }
    { const d = clone('f5'); edit(d, 'scripts/factory-runner/node-supervisor.mjs', (s) => s.replace('  if (deps.ok) return;', '  return;')); commitAll(d, 'mutant: supervisor never refuses');
      expectRed('F-SUP', 'the supervisor starts a worker whatever the dependency check says (the crash loop)', d, ['F5'], ['--skip', 'F6,F7,F8,F9,F10,F11']); }
    { const d = clone('fclosure'); edit(d, 'scripts/factory-runner/deps.mjs', (s) => s.replace('const entries = Object.entries(lock.packages).filter(', 'const entries = [].filter(').replace('if (load && lockPresent && rows.every', 'if (false && load && lockPresent && rows.every')); commitAll(d, 'mutant: dependency check reads only the manifest');
      expectRed('F-CLOSURE', 'the dependency check covers only the packages package.json names (pg-protocol missing reads as ready)', d, ['F5'], ['--skip', 'F6,F7,F8,F9,F10,F11']); }
    { const d = clone('fdamaged'); edit(d, 'scripts/factory-runner/deps.mjs', (s) => s.replace('if (load && lockPresent && rows.every', 'if (false && load && lockPresent && rows.every')); commitAll(d, 'mutant: dependency check reads metadata only');
      expectRed('F-DAMAGED', 'the dependency check trusts package.json versions and never loads the packages (a damaged install reads as ready)', d, ['F5'], ['--skip', 'F6,F7,F8,F9,F10,F11']); }
    { const d = clone('fca'); edit(d, 'scripts/factory-runner/node-supervisor.mjs', (s) => s.replace("if (!loaded.usable) refuse(2, 'refused', loaded.note);", "if (!loaded.url) refuse(2, 'refused', loaded.note);")); commitAll(d, 'mutant: supervisor refuses only a missing URL');
      expectRed('F-CA', 'the supervisor starts a worker on anything that is a URL (missing CA, superuser, bad CA - the Work-PC crash loops)', d, ['F10'], ['--skip', 'F6,F7,F8,F9,F11']); }
    { const d = clone('fdie'); edit(d, 'scripts/factory-runner/node.mjs', (s) => s.replace("  const cmd = process.argv[2] || 'start';", "  const cmd = process.argv[2] || 'start';\n  if (cmd === 'start') process.exit(1);")); commitAll(d, 'mutant: the worker dies on every start');
      expectRed('F-DIE', 'the supervised worker exits on every start (the row must not read ALIVE from another registration)', d, ['F4'], ['--skip', 'F6,F7,F8,F9,F10,F11']); }
    { const d = clone('flate'); edit(d, 'scripts/factory-runner/node.mjs', (s) => s.replace("  const cmd = process.argv[2] || 'start';", "  const cmd = process.argv[2] || 'start';\n  if (cmd === 'start') setTimeout(() => process.exit(1), 6000);")); commitAll(d, 'mutant: the worker dies a few seconds after every start');
      expectRed('F-LATE', 'the supervised worker dies six seconds after every start (one instant of ALIVE must not pass)', d, ['F4'], ['--skip', 'F6,F7,F8,F9,F10,F11']); }
    { const d = clone('fstale'); edit(d, 'scripts/factory-runner/node-supervisor.mjs', (s) => s.replace('    if (ours) {', '    if (true) {')); commitAll(d, 'mutant: the supervisor kills whatever holds the recorded worker pid');
      expectRed('F-STALE', 'the supervisor kills whatever process now holds the worker pid recorded before a reboot', d, ['F11'], ['--skip', 'F6,F7,F8,F9,F10']); }
    { const d = clone('fclaimall'); edit(d, 'scripts/factory-runner/node.mjs', (s) => s.replace('      workTypes: HANDLED_WORK_TYPES,', '      workTypes: null,')); commitAll(d, 'mutant: the CLI node claims every work type');
      expectRed('F-CLAIMALL', 'the CLI node claims work it has no worker for (verifier-gated development work)', d, ['F12'], ['--skip', 'F6,F7,F8,F9,F10,F11,F13']); }
    { const d = clone('fsilent'); edit(d, 'scripts/factory-runner/node.mjs', (s) => s.replace('    noteAdmission();', '')); commitAll(d, 'mutant: an admission refusal is silent');
      expectRed('F-SILENT', 'a node refused by the admission gate reads ALIVE and says nothing', d, ['F13'], ['--skip', 'F6,F7,F8,F9,F10,F11']); }
    { const d = clone('fspell'); edit(d, 'scripts/factory-runner/node-supervisor.mjs', (s) => s.replace('if (!held.held) {', 'if (false) {')); commitAll(d, 'mutant: a second supervisor runs beside the first');
      expectRed('F-SPELL', 'a second supervisor of the same state dir runs (identity by path spelling: two workers, one node id)', d, ['F14'], ['--skip', 'F6,F7,F8,F9,F10,F11,F12,F13']); }
    { const d = clone('fder'); edit(d, 'scripts/factory-runner/runner-env.mjs', (s) => s.replace("if (!/-----BEGIN CERTIFICATE-----/.test(text)) {", 'if (false) {').replace('try { new X509Certificate(text); } catch (e) {', 'try { new X509Certificate(readFileSync(r.ca)); } catch (e) {')); commitAll(d, 'mutant: a DER CA passes the judge');
      expectRed('F-DER', 'a DER CA passes the judge and the worker fails every TLS handshake', d, ['F10'], ['--skip', 'F6,F7,F8,F9,F11,F12,F13,F14']); }
    { const d = clone('fparent'); edit(d, 'scripts/factory-runner/node-supervisor.mjs', (s) => s.replace("if (process.platform === 'win32' && /conhost(\\.exe)?\"?\\s+--headless/i.test(commandLineOf(process.ppid) || '')) {", 'if (false) {')); commitAll(d, 'mutant: stopping the task leaves the supervisor running');
      expectRed('F-PARENT', 'Stop-ScheduledTask kills only the console host and the supervisor runs on unmanaged', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13,F14']); }
    { const d = clone('fstartany'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace("if ($sv -and $task.State -eq 'Running' -and $sv.role -eq $want) {", 'if ($sv) {')); commitAll(d, 'mutant: -Start calls any supervisor running');
      expectRed('F-STARTANY', '-Start alone reports a hand-started generic supervisor as the task running', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13,F14']); }
    { const d = clone('frelenv'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace('$EnvFile = Get-FullPath $EnvFile', '$EnvFile = $EnvFile')); commitAll(d, 'mutant: a relative -EnvFile is registered verbatim');
      expectRed('F-RELENV', 'a relative -EnvFile is registered verbatim and the task looks for it in the checkout', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13,F14']); }
    { const d = clone('flogdir'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace("if (-not $LogGiven -and (Get-TaskArg $task 'logdir')) { $LogDir = Get-TaskArg $task 'logdir' }", '')); commitAll(d, 'mutant: a re-install drops the log dir');
      expectRed('F-LOGDIR', 'a re-install without -LogDir drops the task\'s log dir', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13,F14']); }
    { const d = clone('fwatchdog'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace("-Trigger @((New-ScheduledTaskTrigger -AtLogOn -User $me), $watchdogTrigger)", '-Trigger @(New-ScheduledTaskTrigger -AtLogOn -User $me)').replace("$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $me), (New-ScheduledTaskTrigger -AtStartup), $watchdogTrigger)", '$triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $me), (New-ScheduledTaskTrigger -AtStartup))')); commitAll(d, 'mutant: no watchdog trigger');
      expectRed('F-WATCHDOG', 'a supervisor that dies stays dead until the next logon (no watchdog; restart-on-failure never fires)', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13,F14']); }
    { const d = clone('fquery'); edit(d, 'scripts/factory-runner/url-judge.mjs', (s) => s.replace('  if (foreign.length) {', '  if (false) {')); commitAll(d, 'mutant: the query string may override the user');
      expectRed('F-QUERY', 'a least-privilege URL with ?user=postgres connects as the superuser', d, ['F10'], ['--skip', 'F6,F7,F8,F11,F12,F13,F14']); }
    { const d = clone('fprodenc'); edit(d, 'scripts/factory-runner/url-judge.mjs', (s) => s.replace("  const lower = lenient.toLowerCase() + '\\n' + String(url).toLowerCase();", "  let lower = ''; try { lower = decodeURIComponent(url).toLowerCase(); } catch { lower = String(url).toLowerCase(); }")); commitAll(d, 'mutant: all-or-nothing decode of the URL');
      expectRed('F-PRODENC', 'the production ref percent-encoded beside an undecodable escape passes the judge', d, ['F10'], ['--skip', 'F6,F7,F8,F11,F12,F13,F14,F15']); }
    { const d = clone('fenvread'); edit(d, 'scripts/factory-runner/node-supervisor.mjs', (s) => s.replace('    if (now !== envSeen) {', '    if (false) {')); commitAll(d, 'mutant: the supervisor keeps the URL it started with');
      expectRed('F-ENVREAD', 'a fixed or rotated runner.env is never read by a running supervisor', d, ['F15'], ['--skip', 'F6,F7,F8,F9,F10,F11,F12,F13,F14']); }
    { const d = clone('fownerscript'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace("  $o = Ask-Supervisor $dir 'whois'", "  $o = \$null; \$ow = & \$NodeExe (Join-Path \$dir 'scripts\\factory-runner\\node-supervisor.mjs') --whois 2>\$null; if (\$ow) { try { \$o = (\$ow | Select-Object -Last 1) | ConvertFrom-Json } catch { } }")); commitAll(d, 'mutant: the installer runs the owner checkout\'s script');
      expectRed('F-OWNERSCRIPT', 'the installer runs another checkout\'s node-supervisor.mjs to ask who is running', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13,F14,F15']); }
    { const d = clone('fuserless'); edit(d, 'scripts/factory-runner/url-judge.mjs', (s) => s.replace("  if (!u.username) return", "  if (false) return")); commitAll(d, 'mutant: a URL with no user passes');
      expectRed('F-USERLESS', 'a URL naming no user passes the judge (pg takes PGUSER from the environment)', d, ['F10'], ['--skip', 'F6,F7,F8,F11,F12,F13,F14,F15']); }
    { const d = clone('fwatchkeep'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace("if (-not $PSBoundParameters.ContainsKey('WatchdogMinutes') -and $task) {", 'if ($false) {')); commitAll(d, 'mutant: a re-install resets the watchdog');
      expectRed('F-WATCHKEEP', 'a re-install without -WatchdogMinutes resets the watchdog interval', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13,F14,F15']); }
    { const d = clone('frole'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace("if ($Start -and -not $RoleGiven -and -not $EnvGiven -and -not $ChangeGiven -and $task -and -not (Test-OtherCheckout $owner)) {", 'if ($false) {').replace("if (-not $RoleGiven -and (Get-TaskArg $task 'role')) {", 'if ($false) {')); commitAll(d, 'mutant: -Start re-installs with the default role');
      expectRed('F-ROLE', 'the documented -Stop / -Start re-registers the verifier as generic', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11']); }
    { const d = clone('fhealthrole'); edit(d, 'scripts/factory-runner/node.mjs', (s) => s.replace('    const role = held ? held.security_role : (stated || "generic");', '    const role = nodeRole();')); commitAll(d, 'mutant: health re-registers with the defaulted role');
      expectRed('F-HEALTHROLE', 'the documented health check from a plain shell demotes the running verifier to generic', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13,F14,F15']); }
    { const d = clone('fstatusbackoff'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace("    elseif ($live.state -ne 'running' -or -not $live.childPid) {", '    elseif ($false) {')); commitAll(d, 'mutant: -Status prints the plane\'s word during a backoff');
      expectRed('F-STATUSBACKOFF', '-Status prints the plane\'s lagging ALIVE while the supervisor runs no worker (backoff)', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13,F14,F15']); }
    { const d = clone('freencode'); edit(d, 'scripts/factory-runner/url-judge.mjs', (s) => s.replace('  if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(String(url))) {', '  if (false) {')); commitAll(d, 'mutant: a URL pg would re-encode passes');
      expectRed('F-REENCODE', 'a URL with a bare % passes the judge (pg re-encodes it and corrupts the CA path)', d, ['F10'], ['--skip', 'F6,F7,F8,F11,F12,F13,F14,F15']); }
    { const d = clone('fownerstatus'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace("    $nodeLine = & $NodeExe (Join-Path $Root 'scripts\\factory-runner\\node.mjs') status --runner-env $envPath", "    $nodeLine = & $NodeExe (Join-Path $dir 'scripts\\factory-runner\\node.mjs') status --runner-env $envPath")); commitAll(d, 'mutant: -Status -EnvFile runs the owner checkout\'s node.mjs');
      expectRed('F-OWNERSTATUS', '-Status -EnvFile on another checkout\'s task runs that checkout\'s node.mjs', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13,F14,F15']); }
    { const d = clone('fheadcheck'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace('return ($plane.head -eq $CheckoutHead) }', 'return $true }')); commitAll(d, 'mutant: the installer never compares the node\'s commit with the checkout');
      expectRed('F-HEADCHECK', 'a node on another commit than its checkout passes -Verify and -Start leaves it running', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13,F14,F15']); }
    { const d = clone('fbootrole'); edit(d, 'scripts/factory-runner/bootstrap-node.sh', (s) => s.split('\r\n').join('\n').replace('ROLE=""\nENV_FILE=""', 'ROLE=generic\nENV_FILE=""')); commitAll(d, 'mutant: the bootstrap without --role registers generic');
      expectRed('F-BOOTROLE', 'bootstrap-node.sh without --role demotes a verifier to generic', d, ['F7'], ['--skip', 'F6,F8,F9,F10,F11,F12,F13,F14,F15']); }
    { const d = clone('fhand'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace("foreach ($d in @($Root) + @(if ($owner -and (Test-OtherCheckout $owner)) { $owner })) {", 'foreach ($d in @(if ($task) { if ($owner) { $owner } else { $Root } })) {')); commitAll(d, 'mutant: install leaves a hand-started supervisor running');
      expectRed('F-HAND', 'installing while a hand-started supervisor runs leaves the task supervisor refused (exit 3) and the node down', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11']); }
    { const d = clone('fheadless'); edit(d, 'scripts/factory-runner/install-autostart.ps1', (s) => s.replace('$headless = (Test-Path -LiteralPath $conhost)', '$headless = $false -and (Test-Path -LiteralPath $conhost)')); commitAll(d, 'mutant: the task shows a console window');
      expectRed('F-HEADLESS', 'the task runs the node in a visible console window (closing it kills the node)', d, ['F6'], ['--skip', 'F7,F8,F9,F10,F11,F12,F13']); }
    { const d = clone('f7'); edit(d, 'scripts/factory-runner/bootstrap-node.sh', (s) => s.replace('NOTE_FILE="$(mktemp 2>/dev/null || echo "${TMPDIR:-/tmp}/factory-env-note.$$")"', 'NOTE_FILE="$ROOT/.factory/.env-note"')); commitAll(d, 'mutant: bootstrap redirects into .factory');
      expectRed('F-BOOT', 'the bootstrap writes into a .factory/ a fresh clone does not have', d, ['F7'], ['--skip', 'F6,F8,F9,F10,F11']); }
    { const d = clone('f8'); editJson(d, 'package.json', (p) => { delete p.allowScripts['@embedded-postgres/windows-x64@18.4.0-beta.17']; delete p.allowScripts['@embedded-postgres/linux-x64@18.4.0-beta.17']; delete p.allowScripts['@embedded-postgres/darwin-arm64@18.4.0-beta.17']; return p; }); commitAll(d, 'mutant: postgres binary script unreviewed');
      expectRed('F-STRICT', 'the embedded-postgres binaries lose their install-script approval (strict npm ci must refuse)', d, ['K5', 'F8'], ['--skip', 'F6,F7,F9,F10,F11']); }
  }
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const killed = results.filter((r) => r.killed).length;
console.log('');
console.log('package_bootstrap_mutation_proof: ' + killed + ' of ' + results.length + ' (control green + mutants killed)' + (FRESH ? '' : '  (static mutants only; --fresh adds the original defect and thirty-three fresh-clone mutants)'));
process.exit(killed === results.length ? 0 : 1);

#!/usr/bin/env node
// SEA_PACKAGE_MUTATION_PROOF - each row of sea_package_regression.mjs named below goes red on the defect it names.
//
//   node qa/factory/sea_package_mutation_proof.mjs [ID ...]           all mutants, or only the named ones (~3-4 minutes each)
//   node qa/factory/sea_package_mutation_proof.mjs --plan [ID ...]    plant only: anchors, bytes, parse, expected rows; runs nothing
//
// For each mutant, every file the regression reads from its checkout (FILES below) is copied from this checkout into a FRESH
// mkdtemp directory under os.tmpdir(), in the same relative layout, and ONE defect is planted in the copy by exact text replacement.
// The copy is made a disposable git repository with ONE commit holding the planted text (the regression's build rows need a git
// HEAD: source_commit, built_at = HEAD's commit time, dirty judged against HEAD - the same construction as its own row B14), its
// node_modules is a directory junction to this checkout's node_modules (read only: the regression bundles db.mjs + pg with esbuild
// in B3 and loads esbuild / postject / acorn), the regression copy is run, the junction is unlinked and the directory is removed.
// A mutant is KILLED only when the regression exits 1 with its counted final line AND one of the rows named for that defect is in
// the regression's own FAILURES list. Other rows failing too is collateral: listed, never required.
//
// NOTHING IS SKIPPED.
//   - Every anchor must occur EXACTLY ONCE in the current text of its file. Absent or repeated is VACUOUS: that mutant is not
//     killed and the proof fails. Every expected row must be a row the regression has.
//   - The planted text must differ from the original bytes, must still parse (a planted syntax error would be "caught" by a
//     crash, which proves nothing), and is read back from disk and from the copy's commit before the run.
//   - A CONTROL runs first: the unmutated copy must pass (exit 0, 0 failed). If it does not, nothing is judged and the proof exits 1.
//
// ISOLATION. Each run's TEMP/TMP point inside its own mkdtemp directory (beside the copy, not inside its repository), so every
// build, rebuild and work directory the regression creates goes with it, even when a mutant crashes the regression before its own
// cleanup; its dist/ is the copy's. The git variables that could point git at another repository (GIT_DIR, GIT_WORK_TREE, ...) are
// removed from the run's environment, and the copy's `git rev-parse --show-toplevel` must be the copy itself. Nothing is written to
// this checkout; git here is only read (rev-parse, diff --quiet). After every run this checkout's node_modules must still hold what
// the junction exposed, or the proof stops. The sources are read with CRLF normalised to LF (the anchors are LF).
// INTERRUPTED RUNS. A proof killed before its cleanup (it happened 2026-09-26: the host reaped the run under memory pressure)
// leaves a bos-seamut-* copy whose node_modules is a junction INTO this checkout - a recursive delete that followed it would
// empty this checkout's node_modules. So each run first removes the bos-seamut-* directories older than any run can be (2 x the
// run timeout, so no live proof owns them): the junction is unlinked by itself first, and a copy whose node_modules is not a link
// is left alone and named.
// Windows x64 only, like the regression (it builds a Windows SEA from the pinned official node.exe).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const BS = 'scripts/factory-build/build-sea.mjs';
const VB = 'scripts/factory-build/verify-build.mjs';
const PE = 'scripts/factory-build/pe-strip-signature.mjs';
const TPL = 'scripts/factory-build/sea-config.template.json';
const MAIN = 'scripts/factory-runner/sea/main.mjs';
const REG = 'qa/factory/sea_package_regression.mjs';
// everything the regression reads from its checkout: the pipeline, its unit test, the entry, the database accessor B3 bundles
// (db.mjs and the two modules it imports), package.json / package-lock.json (resolution, and the build's dirty set), and
// .gitignore (S1 asks git whether /dist/ is ignored)
const FILES = [
  '.gitignore', 'package.json', 'package-lock.json',
  BS, VB, PE, 'scripts/factory-build/pe-strip-signature.test.mjs', 'scripts/factory-build/node-exe-pins.json', TPL,
  MAIN, 'scripts/factory-runner/sea/runtime-version.json',
  'scripts/factory-runner/db.mjs', 'scripts/factory-runner/runner-env.mjs', 'scripts/factory-runner/url-judge.mjs',
  REG,
];
const NODE_MODULES = path.join(ROOT, 'node_modules');
const MODULES_USED = ['esbuild', 'postject', 'acorn', 'pg', 'postgres']; // must still be there after every run
const RUN_TIMEOUT_MS = 40 * 60 * 1000; // one clean run takes ~3-4 minutes; a mutant that hangs is not a kill
const L = (...lines) => lines.join('\n');

// { id, expect: rows (any one FAILing kills it), what, edits: [[file, exact anchor, replacement], ...] }
const MUTANTS = [
  // 1. no PostgreSQL client and no database accessor in the runtime bundle
  { id: 'P1', expect: ['B3', 'B19'], what: 'bundlePolicyViolations no longer judges the inputs: neither scripts/factory-runner/db.mjs nor a pg / postgres package is refused', edits: [[BS,
    '  for (const input of Object.keys(metafile.inputs || {})) {',
    '  for (const input of []) {']] },
  { id: 'P2', expect: ['B19'], what: 'the build ignores the policy verdict: bundleEntry no longer throws (exit 4) on a bundle with violations', edits: [[BS,
    String.raw`  if (violations.length) throw new BuildError(EXIT.POLICY, 'the runtime bundle is refused:\n'`,
    String.raw`  if (false) throw new BuildError(EXIT.POLICY, 'the runtime bundle is refused:\n'`]] },
  { id: 'P3', expect: ['B19'], what: 'bundlePolicyViolations no longer refuses a non-builtin run-time require (a SEA can only require builtins)', edits: [[BS,
    `      violations.push(out + ' requires "' + imp.path + '" at run time; a SEA can only require node builtins');`,
    '      // (planted) a non-builtin run-time require is no longer a violation']] },

  // 2. no database URL in the bundle or the exe
  { id: 'U1', expect: ['B19'], what: 'the build\'s database-URL refusal is removed: forbiddenStringHits finds nothing (bundle and exe gates both open)', edits: [[BS,
    L('  for (const s of FORBIDDEN_STRINGS) {', '    for (const [enc, needle] of'),
    L('  for (const s of []) {', '    for (const [enc, needle] of')]] },
  { id: 'U2', expect: ['B1', 'B4'], what: 'the runtime source carries a database URL ("postgresql://..." in main.mjs), the build gate intact', edits: [[MAIN,
    'export const EXIT_NOT_AVAILABLE = 64; // EX_USAGE',
    L('export const EXIT_NOT_AVAILABLE = 64; // EX_USAGE', "export const PLANTED_DATABASE_URL = 'postgresql://planted.invalid/factory';")]] },
  { id: 'U3', expect: ['B4'], what: 'a database URL in main.mjs AND the build\'s refusal removed: only the regression\'s own scan of the exe stands', edits: [
    [MAIN, 'export const EXIT_NOT_AVAILABLE = 64; // EX_USAGE',
      L('export const EXIT_NOT_AVAILABLE = 64; // EX_USAGE', "export const PLANTED_DATABASE_URL = 'postgresql://planted.invalid/factory';")],
    [BS, L('  for (const s of FORBIDDEN_STRINGS) {', '    for (const [enc, needle] of'), L('  for (const s of []) {', '    for (const [enc, needle] of')]] },

  // 3. reproducible: built_at is never the wall clock
  { id: 'T1', expect: ['B5', 'B7'], what: 'built_at is the wall clock instead of HEAD\'s commit time (no SOURCE_DATE_EPOCH): two builds of one tree differ', edits: [[BS,
    "  return { epoch: Number(ct), source: 'git HEAD commit time' };",
    "  return { epoch: Math.floor(Date.now() / 1000), source: 'git HEAD commit time' };"]] },

  // 4. never package a node.exe that is not byte-identical to the pinned official binary
  { id: 'N1', expect: ['B10'], what: 'the sha256 pin check is skipped for --node-exe (any file under a pinned version\'s entry is accepted)', edits: [[BS,
    '      if (entry && entry.sha256 === sha) return { version, ...entry };',
    '      if (entry) return { version, ...entry };']] },
  { id: 'N2', expect: ['B10'], what: 'the sha256 pin check is skipped for the building node (process.execPath)', edits: [[BS,
    '  return entry && entry.sha256 === sha ? { version: process.version, ...entry } : null;',
    '  return entry ? { version: process.version, ...entry } : null;']] },

  // 5. the Authenticode strip: directory 4 zeroed, CheckSum recomputed
  { id: 'E1', expect: ['S4', 'B1', 'B9'], what: 'stripSignature truncates the table but leaves certificate directory 4 pointing at it (non-zero)', edits: [[PE,
    L('  out.writeUInt32LE(0, pe.securityDirOffset);', '  out.writeUInt32LE(0, pe.securityDirOffset + 4);', ''),
    '']] },
  { id: 'E2', expect: ['S4'], what: 'stripSignature skips the PE CheckSum recomputation (the signed file\'s CheckSum is kept)', edits: [[PE,
    '  const checksumAfter = updatePeChecksum(out);',
    '  const checksumAfter = out.readUInt32LE(pe.checksumOffset);']] },
  { id: 'E3', expect: ['B9'], what: 'the build skips the CheckSum recomputation after injection (postject does not maintain it; computed on a copy)', edits: [[BS,
    '    const pe_checksum = updatePeChecksum(exeBuf);',
    '    const pe_checksum = updatePeChecksum(Buffer.from(exeBuf));']] },

  // 6. no code cache and no snapshot in the SEA blob (neither is reproducible)
  { id: 'C1', expect: ['S1', 'B1'], what: 'sea-config.template.json turns useCodeCache on', edits: [[TPL,
    '  "useCodeCache": false',
    '  "useCodeCache": true']] },
  { id: 'C2', expect: ['B5'], what: 'the build hands node useCodeCache:true while the template (and build-info) still say false', edits: [[BS,
    String.raw`    writeFileSync(join(work, 'sea-config.json'), JSON.stringify(config, null, 2) + '\n');`,
    String.raw`    writeFileSync(join(work, 'sea-config.json'), JSON.stringify({ ...config, useCodeCache: true }, null, 2) + '\n');`]] },
  { id: 'C3', expect: ['B1'], what: 'the build hands node useSnapshot:true while the template (and build-info) still say false', edits: [[BS,
    String.raw`    writeFileSync(join(work, 'sea-config.json'), JSON.stringify(config, null, 2) + '\n');`,
    String.raw`    writeFileSync(join(work, 'sea-config.json'), JSON.stringify({ ...config, useSnapshot: true }, null, 2) + '\n');`]] },

  // The adversarial review's fixes (2026-09-26), each reverted alone.
  { id: 'R1', expect: ['B14'], what: 'review: dirty is judged by git status alone again (an assume-unchanged / skip-worktree edit is "clean")', edits: [[BS,
    '  if (present.length) {',
    '  if (false) {']] },
  { id: 'R2', expect: ['B15'], what: 'review: inputs reach esbuild with their checkout line endings again (a CRLF checkout gives another metafile)', edits: [[BS,
    "    define, logLevel: 'silent', plugins: [LF_SOURCES_PLUGIN],",
    "    define, logLevel: 'silent', plugins: [],"]] },
  { id: 'R3', expect: ['B17'], what: 'review: authenticodeStatus puts the path in the -Command text again, quoted with \'\' (PowerShell also ends a \'...\' string at U+2018-U+201B)', edits: [[BS,
    "['-NoProfile', '-NonInteractive', '-Command', '(Get-AuthenticodeSignature -LiteralPath $env:BRAIN_FACTORY_AUTHENTICODE_FILE).Status.ToString()'],",
    `['-NoProfile', '-NonInteractive', '-Command', "(Get-AuthenticodeSignature -LiteralPath '" + file.replace(/'/g, "''") + "').Status.ToString()"],`]] },
  { id: 'R4', expect: ['B5'], what: 'review: verify-build removes SOURCE_DATE_EPOCH by its exact spelling again (a lower-case source_date_epoch reaches the rebuild)', edits: [[VB,
    'const K = k.toUpperCase();',
    'const K = k;']] },
  { id: 'R5', expect: ['B16'], what: 'review: --rebuild-dir = --against is judged by spelling, not sameFile (a junction to the reference is rebuilt into, destroying it)', edits: [[VB,
    '  if (o.rebuildDir && sameFile(resolve(o.rebuildDir), against)) cannot(',
    '  if (o.rebuildDir && resolve(o.rebuildDir).toLowerCase() === against.toLowerCase()) cannot(']] },
  { id: 'R6', expect: ['B16'], what: 'review: SHA256SUMS is checked only for the lines it has again (an empty one passes and the metafile goes unchecked by it)', edits: [[VB,
    L('  for (const name of OUTPUTS) {', "    if (!listed.has(name)) cannot('SHA256SUMS does not cover ' + name);", '    const f = join(against, name);'),
    L('  for (const name of listed.keys()) {', '    const f = join(against, name);')]] },
  { id: 'R7', expect: ['B18'], what: 'review: a failed rebuild exits from inside the try again, so the rebuild directory is never removed', edits: [[VB,
    "cannot('the rebuild failed (build-sea exit ' + r.status + (r.error ? ', ' + r.error.message : '') + ')'); }",
    "console.log('CANNOT VERIFY: the rebuild failed (build-sea exit ' + r.status + ')'); process.exit(EXIT.CANNOT); }"]] },
  { id: 'R8', expect: ['S4'], what: 'review: quadAlign is the int32 (n + 7) & ~7 again (wraps negative at 2^31)', edits: [[PE,
    'export const quadAlign = (n) => Math.ceil(n / 8) * 8;',
    'export const quadAlign = (n) => (n + 7) & ~7;']] },
  { id: 'R9', expect: ['S4'], what: 'review: the pe-strip CLI compares paths by spelling again (a junction or a hard link to the input is overwritten)', edits: [[PE,
    "      if (sameFile(src, dst)) throw new Error('refusing to overwrite the input; give a different output path');",
    "      if (src.toLowerCase() === dst.toLowerCase()) throw new Error('refusing to overwrite the input; give a different output path');"]] },
];

const say = (s) => console.log(s);
const lf = (s) => s.split('\r\n').join('\n');
const occurrences = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);
const FINAL = 'sea_package_mutation_proof: ';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  say('the regression under proof builds a Windows x64 SEA from the pinned official node.exe; this is ' + process.platform + '-' + process.arch);
  say(FINAL + '0 of ' + MUTANTS.length + ' mutants killed');
  process.exit(1);
}

// the mutant table itself
{
  const ids = MUTANTS.map((m) => m.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  const bad = MUTANTS.filter((m) => !m.expect.length || !m.edits.length || m.edits.some(([f, from, to]) => !FILES.includes(f) || f === REG || !from || from === to));
  if (dup.length || bad.length) {
    say('the mutant table is malformed: ' + (dup.length ? 'duplicate ids ' + dup.join(' ') + ' ' : '') + (bad.length ? 'bad entries ' + bad.map((m) => m.id).join(' ') : ''));
    say(FINAL + '0 of ' + MUTANTS.length + ' mutants killed');
    process.exit(1);
  }
}
const args = process.argv.slice(2);
const planOnly = args.includes('--plan');
const pick = args.filter((a) => a !== '--plan');
const unknown = pick.filter((id) => !MUTANTS.some((m) => m.id === id));
if (unknown.length) {
  say('unknown mutant id(s): ' + unknown.join(' ') + ' - known: ' + MUTANTS.map((m) => m.id).join(' '));
  process.exit(1);
}
const chosen = MUTANTS.filter((m) => !pick.length || pick.includes(m.id));

// the current text of every file the copy holds
const source = {};
try {
  for (const f of FILES) source[f] = lf(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  for (const mod of MODULES_USED) if (!fs.existsSync(path.join(NODE_MODULES, mod, 'package.json'))) throw Object.assign(new Error(), { code: 'node_modules/' + mod + ' missing (npm ci first)' });
} catch (e) {
  say('cannot read what the copy needs from ' + ROOT + ' (' + (e && e.code || e) + ')');
  say(FINAL + '0 of ' + chosen.length + ' mutants killed');
  process.exit(1);
}
const ROWS = new Set([...source[REG].matchAll(/check\('([A-Z][0-9]+[a-z]*) /g)].map((x) => x[1]));

// provenance: which commit, and whether the working tree's copied files are that commit's (git here is only read)
const git = (args2, cwd, env) => spawnSync('git', ['--no-optional-locks', ...args2], { cwd, env, encoding: 'utf8', windowsHide: true });
const headRun = git(['rev-parse', 'HEAD'], ROOT);
const head = headRun.status === 0 ? headRun.stdout.trim() : 'unknown';
const diffStatus = git(['diff', '--quiet', 'HEAD', '--', ...FILES], ROOT).status;
say(FINAL + chosen.length + ' mutant' + (chosen.length === 1 ? '' : 's') + (planOnly ? ' (plan only)' : '') + ' on ' + ROOT + ' @ ' + head + ' - the ' + FILES.length + ' copied files '
  + (diffStatus === 0 ? 'are identical to HEAD' : diffStatus === 1 ? 'DIFFER from HEAD (the working-tree text is what is mutated)' : 'could not be compared with HEAD'));

// does this text still parse? (.mjs through node --check on a file, .json through JSON.parse)
function parseError(file, text, dirForCheck) {
  if (file.endsWith('.json')) { try { JSON.parse(text); return null; } catch (e) { return e.message; } }
  if (!file.endsWith('.mjs')) return null;
  const p = path.join(dirForCheck, 'parse-check-' + path.basename(file));
  fs.writeFileSync(p, text);
  try {
    const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8', windowsHide: true });
    return r.status === 0 ? null : ((r.stderr || '') + (r.stdout || '')).trim().split(/\r?\n/).slice(0, 6).join(' | ');
  } finally { fs.rmSync(p, { force: true }); }
}

// Plant a mutant in memory: every anchor exactly once, the result differs and parses, every expected row exists.
function plant(m, scratch) {
  const text = { ...source };
  for (const [file, from, to] of m.edits) {
    const n = occurrences(text[file], from);
    if (n !== 1) return { vacuous: (n === 0 ? 'anchor not found' : 'anchor occurs ' + n + ' times') + ' in ' + file + ': ' + JSON.stringify(from.slice(0, 90)) };
    text[file] = text[file].replace(from, () => to);
  }
  const changed = [...new Set(m.edits.map(([f]) => f))];
  for (const f of changed) if (Buffer.from(text[f], 'utf8').equals(Buffer.from(source[f], 'utf8'))) return { vacuous: 'the edits leave ' + f + ' byte-identical' };
  for (const f of changed) { const pe = parseError(f, text[f], scratch); if (pe) return { vacuous: 'the planted ' + f + ' does not parse: ' + pe }; }
  const missingRows = m.expect.filter((id) => !ROWS.has(id));
  if (missingRows.length) return { vacuous: 'expected row(s) ' + missingRows.join(' ') + ' are not rows of ' + REG };
  return { text, changed };
}

function removeDir(dir) {
  const rm = () => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch { /* checked below */ } return !fs.existsSync(dir); };
  if (rm()) return true;
  // a directory a mutant left locked or denied: give the tree back its inherited ACL, then remove it
  spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe'), [dir, '/reset', '/T', '/C', '/Q'], { windowsHide: true });
  return rm();
}
const sameDir = (a, b) => { try { return fs.realpathSync.native(a).toLowerCase() === fs.realpathSync.native(b).toLowerCase(); } catch { return false; } };
// the git variables that could point git at another repository
const GIT_LOCATORS = /^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM)$/i;

const leftovers = [];
let modulesLost = false;
// Write the copy, commit it, prove the planted bytes are on disk and in HEAD, run the regression copy with TEMP beside it.
function runCopy(label, text, changed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-seamut-'));
  const repo = path.join(dir, 'repo');
  const tmp = path.join(dir, 'tmp');
  const junction = path.join(repo, 'node_modules');
  const t0 = Date.now();
  try {
    for (const f of FILES) {
      const p = path.join(repo, f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, text[f]);
    }
    for (const f of changed) {
      const onDisk = fs.readFileSync(path.join(repo, f));
      if (onDisk.equals(Buffer.from(source[f], 'utf8')) || !onDisk.equals(Buffer.from(text[f], 'utf8'))) return { vacuous: 'the copy of ' + f + ' on disk is not the planted text' };
    }
    fs.mkdirSync(tmp);
    const env = {};
    for (const [k, v] of Object.entries(process.env)) if (!/^(TEMP|TMP)$/i.test(k) && !GIT_LOCATORS.test(k)) env[k] = v;
    env.TEMP = tmp;
    env.TMP = tmp;
    // a disposable repository with one commit (as B14 builds its own): the planted text is what HEAD holds
    const G = (...a) => git(['-c', 'user.name=qa', '-c', 'user.email=qa@example.invalid', '-c', 'commit.gpgsign=false', ...a], repo, env);
    const steps = [['init', '-q'], ['config', 'core.autocrlf', 'false'], ['add', '--', ...FILES], ['commit', '-q', '-m', 'sea package mutation proof: ' + label]];
    for (const s of steps) { const r = G(...s); if (r.status !== 0) return { vacuous: 'the disposable repository could not be made (git ' + s[0] + ' exit ' + r.status + ': ' + String(r.stderr).trim().slice(0, 200) + ')' }; }
    const top = G('rev-parse', '--show-toplevel');
    if (top.status !== 0 || !sameDir(top.stdout.trim(), repo)) return { vacuous: 'git in the copy resolves to ' + JSON.stringify(top.stdout.trim()) + ', not the copy ' + repo };
    const status = G('status', '--porcelain=v1', '--untracked-files=all');
    if (status.status !== 0 || status.stdout.trim() !== '') return { vacuous: 'the copy is not exactly its one commit: ' + JSON.stringify(status.stdout.trim().slice(0, 200)) };
    for (const f of changed) {
      const blob = spawnSync('git', ['--no-optional-locks', 'show', 'HEAD:' + f], { cwd: repo, env, windowsHide: true, maxBuffer: 1 << 26 });
      if (blob.status !== 0 || !blob.stdout.equals(Buffer.from(text[f], 'utf8'))) return { vacuous: 'the copy\'s commit does not hold the planted ' + f };
    }
    fs.symlinkSync(NODE_MODULES, junction, 'junction');

    const r = spawnSync(process.execPath, [path.join(repo, REG)], { cwd: repo, env, encoding: 'utf8', timeout: RUN_TIMEOUT_MS, maxBuffer: 1 << 28, windowsHide: true });
    const out = lf((r.stdout || '') + (r.stderr || ''));
    // the failed rows: "FAIL <id> " at the start of a line, for ids that ARE rows of the regression (a row's detail can hold other
    // FAIL lines at column 0 - S4 prints the pe-strip unit test's "FAIL U3 ..." - and those are not rows); their number must be
    // the regression's own counted "failed"
    const failed = [...new Set([...out.matchAll(/^FAIL ([A-Z][0-9]+[a-z]*) /gm)].map((x) => x[1]).filter((id) => ROWS.has(id)))];
    const sums = [...out.matchAll(/^sea_package_regression: (\d+) passed, (\d+) failed\s*$/gm)];
    const sum = sums.length ? sums[sums.length - 1] : null;
    const consistent = !!sum && failed.length === Number(sum[2]);
    const summary = sum ? sum[1] + ' passed, ' + sum[2] + ' failed' + (consistent ? '' : ' (INCONSISTENT with the FAIL rows seen)')
      : 'no counted final line (' + (r.error ? r.error.code || r.error.message : r.signal ? 'killed by ' + r.signal : 'exit ' + r.status) + ')';
    return { status: r.status, out, failed, sum, consistent, summary, secs: Math.round((Date.now() - t0) / 1000) };
  } finally {
    // the junction first, by itself (never a recursive delete through it), then the directory
    try { if (fs.lstatSync(junction, { throwIfNoEntry: false })) fs.unlinkSync(junction); } catch { try { fs.rmdirSync(junction); } catch { /* checked below */ } }
    if (fs.lstatSync(junction, { throwIfNoEntry: false })) leftovers.push(junction + ' (the node_modules junction could not be unlinked; the copy was left in place)');
    else if (!removeDir(dir)) leftovers.push(dir);
    if (MODULES_USED.some((mod) => !fs.existsSync(path.join(NODE_MODULES, mod, 'package.json')))) modulesLost = true;
  }
}

// Plant everything first (pure text): a vacuous mutant is known before anything runs.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-seamut-plan-'));
let planned;
try { planned = chosen.map((m) => ({ m, p: plant(m, scratch) })); } finally { removeDir(scratch); }

if (planOnly) {
  for (const { m, p } of planned) say((p.vacuous ? 'VACUOUS  ' : 'PLANTED  ') + m.id.padEnd(4) + ' expected FAIL ' + m.expect.join('|') + (p.vacuous ? '; ' + p.vacuous : '; ' + p.changed.join(', ')) + ' - ' + m.what);
  const v = planned.filter(({ p }) => p.vacuous).length;
  say('');
  say(FINAL + 'plan only - ' + (chosen.length - v) + ' of ' + chosen.length + ' mutants plant; nothing was run, nothing is killed');
  process.exit(v ? 1 : 0);
}

// copies left by an interrupted earlier proof: older than any run can be, junction unlinked by itself, never deleted through
{
  const swept = []; const kept = [];
  for (const name of fs.readdirSync(os.tmpdir())) {
    if (!/^bos-seamut-/.test(name)) continue;
    const dir = path.join(os.tmpdir(), name);
    const st = fs.lstatSync(dir, { throwIfNoEntry: false });
    if (!st || !st.isDirectory() || Date.now() - Math.min(st.birthtimeMs, st.mtimeMs) < 2 * RUN_TIMEOUT_MS) continue;
    const j = path.join(dir, 'repo', 'node_modules');
    const js = fs.lstatSync(j, { throwIfNoEntry: false });
    if (js && !js.isSymbolicLink()) { kept.push(dir + ' (its node_modules is not a link)'); continue; }
    try { if (js) fs.unlinkSync(j); } catch { kept.push(dir + ' (its junction could not be unlinked)'); continue; }
    if (fs.lstatSync(j, { throwIfNoEntry: false })) { kept.push(dir + ' (its junction is still there)'); continue; }
    if (removeDir(dir)) swept.push(name); else kept.push(dir);
  }
  if (swept.length) say('removed ' + swept.length + ' copy(ies) left by an interrupted earlier proof: ' + swept.join(', '));
  if (kept.length) say('LEFT ALONE (remove by hand, unlinking repo\\node_modules first): ' + kept.join('; '));
  if (MODULES_USED.some((mod) => !fs.existsSync(path.join(NODE_MODULES, mod, 'package.json')))) modulesLost = true;
}

const stopIfModulesLost = () => {
  if (!modulesLost) return;
  say('STOPPED: this checkout\'s node_modules no longer holds ' + MODULES_USED.join(', ') + ' after a run - nothing further is run');
  if (leftovers.length) say('CLEANUP FAILED - could not remove: ' + leftovers.join(', '));
  say(FINAL + '0 of ' + chosen.length + ' mutants killed (ABORTED: node_modules changed under the proof)');
  process.exit(1);
};

stopIfModulesLost();

// CONTROL: the unmutated copy must pass.
const control = runCopy('control', source, []);
stopIfModulesLost();
const controlOk = !control.vacuous && control.status === 0 && control.sum && Number(control.sum[2]) === 0 && control.consistent;
say((controlOk ? 'CONTROL  passed' : 'CONTROL  FAILED') + ' - ' + (control.vacuous ? 'not run: ' + control.vacuous : control.summary + ' (' + control.secs + ' s)'
  + (control.failed.length ? '; FAIL [' + control.failed.join(' ') + ']' : '')));
if (!controlOk) {
  if (!control.vacuous) {
    say('  the unmutated copy does not pass, so no mutant can be judged. Its output ended:');
    say(String(control.out || '').slice(-3000).split('\n').map((l) => '    ' + l).join('\n'));
  }
  if (leftovers.length) say('CLEANUP FAILED - could not remove: ' + leftovers.join(', '));
  say(FINAL + '0 of ' + chosen.length + ' mutants killed (ABORTED: the unmutated control failed)');
  process.exit(1);
}

let killed = 0;
for (const { m, p } of planned) {
  const head8 = m.id.padEnd(4) + ' expected FAIL ' + m.expect.join('|');
  if (p.vacuous) { say('VACUOUS  ' + head8 + '; not run: ' + p.vacuous + ' - ' + m.what); continue; }
  const r = runCopy(m.id, p.text, p.changed);
  stopIfModulesLost();
  if (r.vacuous) { say('VACUOUS  ' + head8 + '; not run: ' + r.vacuous + ' - ' + m.what); continue; }
  const caught = r.status === 1 && !!r.sum && Number(r.sum[2]) > 0 && r.consistent && m.expect.some((id) => r.failed.includes(id));
  if (caught) killed++;
  say((caught ? 'CAUGHT   ' : 'MISSED   ') + head8 + '; seen FAIL [' + r.failed.join(' ') + ']; ' + r.summary + ' (' + r.secs + ' s) - ' + m.what);
}

say('');
if (leftovers.length) say('CLEANUP FAILED - could not remove: ' + leftovers.join(', '));
say(FINAL + killed + ' of ' + chosen.length + ' mutants killed');
process.exit(killed === chosen.length && !leftovers.length ? 0 : 1);

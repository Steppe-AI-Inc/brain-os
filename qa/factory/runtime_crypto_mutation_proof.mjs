#!/usr/bin/env node
// RUNTIME_CRYPTO_MUTATION_PROOF - each row of runtime_crypto_regression.mjs named below goes red on the defect it names.
//
//   node qa/factory/runtime_crypto_mutation_proof.mjs [ID ...]      all mutants, or only the named ones
//
// For each mutant the four files - lib/ed25519.mjs, lib/dpapi.mjs, lib/secure-store.mjs and the regression itself - are
// copied from this checkout into a FRESH mkdtemp directory under os.tmpdir(), in the same relative layout (so the regression's
// relative imports load the COPIES), ONE defect is planted in the copy by exact text replacement, the regression copy is run,
// and the directory is removed. A mutant is KILLED only when the regression exits 1 with its counted final line AND one of the
// rows named for that defect printed FAIL. Other rows failing too is collateral: listed, never required.
//
// NOTHING IS SKIPPED.
//   - Every anchor must occur EXACTLY ONCE in the current text of its file. Absent or repeated is VACUOUS: that mutant is not
//     killed and the proof fails. Every expected row must be a row the regression has.
//   - The planted copy is read back from disk and must differ from the original bytes (and be the planted text).
//   - A CONTROL runs first: the unmutated copies must pass (exit 0). If they do not, nothing is judged and the proof exits 1.
//
// ISOLATION. Each run's TEMP/TMP point inside its own mkdtemp directory, so every disposable directory the regression and the
// modules create (bos-rcr-*, bos-acl-*) goes with it, even when a mutant crashes the regression before its own cleanup. The
// sources are read with CRLF normalised to LF (the anchors are LF); the control proves the copies as written still pass.
// Windows only: the rows under proof call DPAPI through Windows PowerShell, run icacls and read the PowerShell event log.
//
// THE CATCH-ALL. The catch-all in writeSecret() (unplanned errors become SecureStoreError 'unexpected') had no row: S22's two
// cases are converted to code 'dir' by the explicit catches in writeSecretChecked() before the wrapper sees them (measured
// 2026-09-26: wrapper reduced to a bare rethrow -> the regression stayed 57/57; S22 is proven by R5m / R5r). Row S24 was added
// for it (a raw fault injected through a throwing getter on the dpapi options object), and mutant R7 proves S24 catches it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ED = 'scripts/factory-runner/lib/ed25519.mjs';
const DP = 'scripts/factory-runner/lib/dpapi.mjs';
const SS = 'scripts/factory-runner/lib/secure-store.mjs';
const REG = 'qa/factory/runtime_crypto_regression.mjs';
const FILES = [ED, DP, SS, REG];
const RUN_TIMEOUT_MS = 15 * 60 * 1000; // one clean run takes ~15 s; a mutant that hangs is not a kill
const L = (...lines) => lines.join('\n');

// { id, expect: rows (any one FAILing kills it), what, edits: [[file, exact anchor, replacement], ...] }
const MUTANTS = [
  { id: 'M1', expect: ['D14'], what: 'the payload is interpolated into the script text, so the secret reaches the PowerShell event log', edits: [[DP,
    String.raw`const scriptIn = (o._simulateConstrainedLanguage === true ? CLM_PRELUDE + '\r\n' : '') + SCRIPTS[op] + '\r\n';`,
    String.raw`const scriptIn = "$leak = '" + dataB64 + "'; Add-Type -AssemblyName System.Security\r\n" + (o._simulateConstrainedLanguage === true ? CLM_PRELUDE + '\r\n' : '') + SCRIPTS[op] + '\r\n';`]] },
  { id: 'M2', expect: ['D10'], what: 'no READY handshake: the data is queued with the script, so a script that never runs still receives the payload', edits: [[DP,
    'child.stdin.write(scriptIn);',
    String.raw`payloadSent = true; stdinClosed = true; child.stdin.end(scriptIn + dataB64 + '\r\n' + entB64 + '\r\n');`]] },
  { id: 'M3', expect: ['S11'], what: 'lockDirectory does not remove foreign explicit ACEs (a broadened directory stays broadened)', edits: [[SS,
    'for (const [sid, how] of removals) {',
    'for (const [sid, how] of []) {']] },
  { id: 'M4', expect: ['E12'], what: 'base64urlDecode drops the canonical-encoding check (two strings decode to the same bytes)', edits: [[ED,
    "if (out.toString('base64url') !== str) throw new TypeError('base64url input is not canonical (non-zero trailing bits)');",
    '']] },
  { id: 'M5', expect: ['S10'], what: 'readSecret skips the directory ACL check', edits: [[SS,
    'if (!ddacl.protected || !isOwnerOnlyDacl(ddacl, me)) {',
    'if (false) {']] },
  { id: 'M6', expect: ['S3'], what: 'readSecret returns buf enumerable (console.log / JSON.stringify print the secret)', edits: [[SS,
    "Object.defineProperty(res, 'buf', { value: out, enumerable: false });",
    'res.buf = out;']] },
  { id: 'M7', expect: ['E4'], what: 'verify throws on malformed attacker input (length guard and try/catch removed)', edits: [
    [ED, L('if (pub.length !== PUBLIC_KEY_BYTES || s.length !== SIGNATURE_BYTES) return false;', '  try {'), '{'],
    [ED, L('  } catch {', '    return false;', '  }', '}', '', '/**', ' * base64url('), L('  }', '}', '', '/**', ' * base64url(')]] },
  { id: 'M8', expect: ['D1', 'D3', 'D4'], what: 'DPAPI ignores entropy (protect and unprotect both pass $null)', edits: [[DP,
    "'$r = ' + call,",
    "'$n = $null; $r = ' + call,"]] },
  { id: 'M9', expect: ['S15'], what: 'writeSecret throws instead of falling back to acl_only when DPAPI is unavailable', edits: [[SS,
    L('dpapiReason = p.reason;', '    if (o.requireDpapi)'),
    L('dpapiReason = p.reason;', '    if (true)')]] },

  // The adversarial review's fixes (2026-09-26), each reverted alone.
  { id: 'R1', expect: ['D13', 'D15'], what: 'review: READY and OK are literals in the script text again (an interpreter that echoes its stdin fires the handshake)', edits: [
    [DP, "'[Console]::Out.Write(' + psAssembled(MARK_READY) + ');", String.raw`'[Console]::Out.Write(\'' + MARK_READY + '\');`],
    [DP, "'[Console]::Out.Write(' + psAssembled(MARK_OK) + ' + [System.Convert]", String.raw`'[Console]::Out.Write(\'' + MARK_OK + '\' + [System.Convert]`]] },
  { id: 'R2', expect: ['D16', 'S21', 'S23'], what: 'review: unprotect is capped at MAX_PAYLOAD_BYTES again (a maximal secret protects into a blob unprotect refuses)', edits: [[DP,
    "const maxIn = op === 'protect' ? MAX_PAYLOAD_BYTES : MAX_BLOB_BYTES;",
    'const maxIn = MAX_PAYLOAD_BYTES;']] },
  { id: 'R3', expect: ['S10', 'S10b', 'S12'], what: 'review: the re-lock fix is several icacls commands joined by " ; " with the grant unquoted (the form the fix note describes)', edits: [[SS,
    L(`  let cmd = 'icacls "' + target + '" /inheritance:r /grant:r "' + grant + '"';`,
      `  if ((dacl && dacl.aces || []).some((a) => a.sid === me && /^(D|OD|XD)$/.test(a.type))) cmd += ' /remove:d "*' + me + '"';`,
      '  const foreign = others(dacl, me).filter((s) => /^S-1-/.test(s));',
      `  if (foreign.length) cmd += ' /remove ' + foreign.map((s) => '"*' + s + '"').join(' ');`,
      '  return cmd;'),
    L(`  const cmds = ['icacls "' + target + '" /inheritance:r /grant:r ' + grant];`,
      `  if ((dacl && dacl.aces || []).some((a) => a.sid === me && /^(D|OD|XD)$/.test(a.type))) cmds.push('icacls "' + target + '" /remove:d *' + me);`,
      `  for (const s of others(dacl, me).filter((x) => /^S-1-/.test(x))) cmds.push('icacls "' + target + '" /remove *' + s);`,
      "  return cmds.join(' ; ');")]] },
  { id: 'R3q', expect: ['S10b', 'S12'], what: 'the re-lock commands joined by " ; " but every argument quoted: S10\'s substring check passes, only pasting into cmd.exe sees it', edits: [[SS,
    L(`  let cmd = 'icacls "' + target + '" /inheritance:r /grant:r "' + grant + '"';`,
      `  if ((dacl && dacl.aces || []).some((a) => a.sid === me && /^(D|OD|XD)$/.test(a.type))) cmd += ' /remove:d "*' + me + '"';`,
      '  const foreign = others(dacl, me).filter((s) => /^S-1-/.test(s));',
      `  if (foreign.length) cmd += ' /remove ' + foreign.map((s) => '"*' + s + '"').join(' ');`,
      '  return cmd;'),
    L(`  const cmds = ['icacls "' + target + '" /inheritance:r /grant:r "' + grant + '"'];`,
      `  if ((dacl && dacl.aces || []).some((a) => a.sid === me && /^(D|OD|XD)$/.test(a.type))) cmds.push('icacls "' + target + '" /remove:d "*' + me + '"');`,
      `  for (const s of others(dacl, me).filter((x) => /^S-1-/.test(x))) cmds.push('icacls "' + target + '" /remove "*' + s + '"');`,
      "  return cmds.join(' ; ');")]] },
  { id: 'R4', expect: ['S14'], what: 'review: checkPath no longer refuses ":" (an ADS), a trailing "." or " ", or a DOS device name in a path component', edits: [[SS,
    String.raw`for (const c of abs.slice(path.parse(abs).root.length).split(/[\\/]/).filter(Boolean)) {`,
    'for (const c of []) {']] },
  { id: 'R5m', expect: ['S22'], what: 'review: a mkdir failure (a parent that is a file) escapes the explicit catch (arrives as code "unexpected", not "dir")', edits: [[SS,
    'try { await fsp.mkdir(dir, { recursive: true }); } catch (m) {',
    'try { await fsp.mkdir(dir, { recursive: true }); } catch (m) { throw m;']] },
  { id: 'R5r', expect: ['S22'], what: 'review: a readdir failure (a directory this user cannot list) escapes the explicit catch', edits: [[SS,
    'try { foreign = await dirHoldsOnlyStoreFiles(dir); } catch (l) {',
    'try { foreign = await dirHoldsOnlyStoreFiles(dir); } catch (l) { throw l;']] },
  { id: 'R6', expect: ['S23'], what: 'review: every DPAPI failure that is not "unavailable" is reported as dpapi_refused (another user / entropy / modified)', edits: [[SS,
    'if (!u.dpapiRefused) return refuse(',
    'if (false) return refuse(']] },
  { id: 'R7', expect: ['S24'], what: 'the writeSecret() catch-all reduced to a bare rethrow: an unplanned raw error escapes as a raw Error', edits: [[SS,
    '    if (e instanceof SecureStoreError) throw e;\n    // Reviewed 2026-09-26: a parent that is a FILE',
    '    throw e;\n    // Reviewed 2026-09-26: a parent that is a FILE']] },
];

const say = (s) => console.log(s);
const lf = (s) => s.split('\r\n').join('\n');
const occurrences = (hay, needle) => (needle ? hay.split(needle).length - 1 : 0);
const FINAL = 'runtime_crypto_mutation_proof: ';

if (process.platform !== 'win32') {
  say('the rows under proof are Windows mechanisms (DPAPI through Windows PowerShell, icacls, the PowerShell event log); this is ' + process.platform);
  say(FINAL + '0 of ' + MUTANTS.length + ' mutants killed');
  process.exit(1);
}

// the mutant table itself
{
  const ids = MUTANTS.map((m) => m.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  const bad = MUTANTS.filter((m) => !m.expect.length || !m.edits.length || m.edits.some(([f, from, to]) => !FILES.includes(f) || !from || from === to));
  if (dup.length || bad.length) {
    say('the mutant table is malformed: ' + (dup.length ? 'duplicate ids ' + dup.join(' ') + ' ' : '') + (bad.length ? 'bad entries ' + bad.map((m) => m.id).join(' ') : ''));
    say(FINAL + '0 of ' + MUTANTS.length + ' mutants killed');
    process.exit(1);
  }
}
const pick = process.argv.slice(2);
const unknown = pick.filter((id) => !MUTANTS.some((m) => m.id === id));
if (unknown.length) {
  say('unknown mutant id(s): ' + unknown.join(' ') + ' - known: ' + MUTANTS.map((m) => m.id).join(' '));
  process.exit(1);
}
const chosen = MUTANTS.filter((m) => !pick.length || pick.includes(m.id));

// the current text of the four files
const source = {};
try {
  for (const f of FILES) source[f] = lf(fs.readFileSync(path.join(ROOT, f), 'utf8'));
} catch (e) {
  say('cannot read the files under proof from ' + ROOT + ' (' + (e && e.code || e) + ')');
  say(FINAL + '0 of ' + chosen.length + ' mutants killed');
  process.exit(1);
}

// provenance: which commit, and whether the working tree's four files are that commit's
const git = (args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
const headRun = git(['rev-parse', 'HEAD']);
const head = headRun.status === 0 ? headRun.stdout.trim() : 'unknown';
const diffStatus = git(['diff', '--quiet', 'HEAD', '--', ...FILES]).status;
say('runtime_crypto_mutation_proof: ' + chosen.length + ' mutant' + (chosen.length === 1 ? '' : 's') + ' on ' + ROOT + ' @ ' + head + ' - the four files '
  + (diffStatus === 0 ? 'are identical to HEAD' : diffStatus === 1 ? 'DIFFER from HEAD (the working-tree text is what is mutated)' : 'could not be compared with HEAD'));

// Plant a mutant in memory: every anchor exactly once, the result differs, every expected row exists.
function plant(m) {
  const text = { ...source };
  for (const [file, from, to] of m.edits) {
    const n = occurrences(text[file], from);
    if (n !== 1) return { vacuous: (n === 0 ? 'anchor not found' : 'anchor occurs ' + n + ' times') + ' in ' + file + ': ' + JSON.stringify(from.slice(0, 90)) };
    text[file] = text[file].replace(from, () => to);
  }
  const changed = [...new Set(m.edits.map(([f]) => f))];
  for (const f of changed) if (Buffer.from(text[f], 'utf8').equals(Buffer.from(source[f], 'utf8'))) return { vacuous: 'the edits leave ' + f + ' byte-identical' };
  const missingRows = m.expect.filter((id) => !new RegExp("(check|skip)\\('" + id + ' ').test(source[REG]));
  if (missingRows.length) return { vacuous: 'expected row(s) ' + missingRows.join(' ') + ' are not rows of ' + REG };
  return { text, changed };
}

function removeDir(dir) {
  const rm = () => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* checked below */ } return !fs.existsSync(dir); };
  if (rm()) return true;
  // a directory a mutant left locked or denied: give the tree back its inherited ACL, then remove it
  spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe'), [dir, '/reset', '/T', '/C', '/Q'], { windowsHide: true });
  return rm();
}

const leftovers = [];
// Write the copies, prove the planted bytes are on disk, run the regression copy with TEMP inside the copy's directory.
function runCopy(text, changed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bos-rcmut-'));
  try {
    for (const f of FILES) {
      const p = path.join(dir, f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, text[f]);
    }
    for (const f of changed) {
      const onDisk = fs.readFileSync(path.join(dir, f));
      if (onDisk.equals(Buffer.from(source[f], 'utf8')) || !onDisk.equals(Buffer.from(text[f], 'utf8'))) return { vacuous: 'the copy of ' + f + ' on disk is not the planted text' };
    }
    const tmp = path.join(dir, 'tmp');
    fs.mkdirSync(tmp);
    const env = {};
    for (const [k, v] of Object.entries(process.env)) if (!/^(TEMP|TMP)$/i.test(k)) env[k] = v;
    env.TEMP = tmp;
    env.TMP = tmp;
    const r = spawnSync(process.execPath, [path.join(dir, REG)], { cwd: dir, env, encoding: 'utf8', timeout: RUN_TIMEOUT_MS, maxBuffer: 1 << 26, windowsHide: true });
    const out = (r.stdout || '') + (r.stderr || '');
    const failed = [...new Set([...out.matchAll(/^FAIL ([A-Z][0-9]+[a-z]*) /gm)].map((x) => x[1]))];
    if (/^FAIL the regression crashed/m.test(out)) failed.push('CRASH');
    const skipped = [...new Set([...out.matchAll(/^SKIP ([A-Z][0-9]+[a-z]*) /gm)].map((x) => x[1]))];
    const sums = [...out.matchAll(/^runtime_crypto_regression: (\d+) passed, (\d+) failed\s*$/gm)];
    const sum = sums.length ? sums[sums.length - 1] : null;
    const summary = sum ? sum[1] + ' passed, ' + sum[2] + ' failed'
      : 'no counted final line (' + (r.error ? r.error.code || r.error.message : r.signal ? 'killed by ' + r.signal : 'exit ' + r.status) + ')';
    return { status: r.status, out, failed, skipped, sum, summary };
  } finally {
    if (!removeDir(dir)) leftovers.push(dir);
  }
}

// Plant everything first (pure text): a vacuous mutant is known before anything runs.
const planned = chosen.map((m) => ({ m, p: plant(m) }));

// CONTROL: the unmutated copies must pass.
const control = runCopy(source, []);
const controlOk = control.status === 0 && control.sum && Number(control.sum[2]) === 0;
say((controlOk ? 'CONTROL  passed' : 'CONTROL  FAILED') + ' - ' + control.summary + (control.skipped.length ? '; skipped ' + control.skipped.join(' ') : '; nothing skipped')
  + (control.failed.length ? '; FAIL [' + control.failed.join(' ') + ']' : ''));
if (!controlOk) {
  say('  the unmutated copy does not pass, so no mutant can be judged. Its output ended:');
  say(String(control.out || '').slice(-2000).split(/\r?\n/).map((l) => '    ' + l).join('\n'));
  if (leftovers.length) say('CLEANUP FAILED - could not remove: ' + leftovers.join(', '));
  say(FINAL + '0 of ' + chosen.length + ' mutants killed (ABORTED: the unmutated control failed)');
  process.exit(1);
}

let killed = 0;
for (const { m, p } of planned) {
  const head8 = m.id.padEnd(4) + ' expected FAIL ' + m.expect.join('|');
  if (p.vacuous) { say('VACUOUS  ' + head8 + '; not run: ' + p.vacuous + ' - ' + m.what); continue; }
  const r = runCopy(p.text, p.changed);
  if (r.vacuous) { say('VACUOUS  ' + head8 + '; not run: ' + r.vacuous + ' - ' + m.what); continue; }
  const caught = r.status === 1 && !!r.sum && Number(r.sum[2]) > 0 && m.expect.some((id) => r.failed.includes(id));
  if (caught) killed++;
  say((caught ? 'CAUGHT   ' : 'MISSED   ') + head8 + '; seen FAIL [' + r.failed.join(' ') + ']' + (r.skipped.length ? ' skipped [' + r.skipped.join(' ') + ']' : '')
    + '; ' + r.summary + ' - ' + m.what);
}

say('');
if (leftovers.length) say('CLEANUP FAILED - could not remove: ' + leftovers.join(', '));
say(FINAL + killed + ' of ' + chosen.length + ' mutants killed');
process.exit(killed === chosen.length && !leftovers.length ? 0 : 1);

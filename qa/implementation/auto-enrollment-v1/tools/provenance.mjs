#!/usr/bin/env node
// RELEASE PROVENANCE INPUTS (WO-10; S-5; AC-5(h); VERIFICATION_SPEC §3.8): what the candidate's own builds say about themselves, read
// from each channel's build-info.json (written by build-sea.mjs at the checked-out commit) and the composed migration.
//
//   node qa/implementation/auto-enrollment-v1/tools/provenance.mjs                 the Markdown table for the candidate report
//   node qa/implementation/auto-enrollment-v1/tools/provenance.mjs --emit <dir>    the per-channel BUILD DECLARATIONS of this commit
//   node qa/implementation/auto-enrollment-v1/tools/provenance.mjs --check <dir>   rebuild both channels here and compare them with <dir>
//
// --emit writes <dir>/<channel>.build-declaration.json for production and dev, and <dir>/SHA256SUMS. It refuses (exit 2, nothing
//   written) unless both channels' dist/brain-factory/<version>/<channel>/build-info.json were built from exactly HEAD (source_commit
//   = git HEAD, dirty false) and each exe's PE Authenticode image hash is the digest its build-info records. A declaration holds the
//   channel, runtime version, source commit, built_at (and its source), the digest (the image hash), the unsigned exe sha256, the
//   embedded trust set read back as (key id, sha256 of the public key) with channel and mode, the default endpoint and release
//   storage, and the base node.exe (the DECLARED fields below); and, under `informational`, the sha256 of the build-info it was read
//   from, which --check does not compare: it hashes the whole build-info, signing fields included (authenticode, the final exe's
//   sha256), and a --check rebuild is never signed. verify-build.mjs compares build-info field by field, signing fields apart.
//   A declaration is NOT a WO-6 release manifest: that manifest carries the signing key id, the signature and the hash of the
//   certifying receipt, and none of those exists before the receipt. The declarations are the implementer's own release-provenance
//   evidence (WO-10), information only: the same facts CANDIDATE_REPORT.md tabulates, in a form a tool can compare. Which artifact
//   "the candidate's release manifest" of AC-5(h) / §3.8 names at candidate time is asked of the Director in CR-019; until the
//   Director decides, the declarations are not presented as that manifest, and the candidate relies on no answer.
//   WHERE THEY GO: the build of the frozen SHA embeds that SHA (source_commit and built_at are compiled into the exe), so a commit
//   cannot hold the digest of an exe built from itself. The declarations are emitted from a clean checkout of the frozen SHA and
//   committed afterwards, in the candidate-notice commit (a child of the frozen SHA that changes no build input), under
//   qa/implementation/auto-enrollment-v1/evidence/<frozen sha>/build-declarations/.
// --check <dir> reads the two declarations, requires each to name HEAD, rebuilds each channel with build-sea.mjs into a fresh temp
//   directory (SOURCE_DATE_EPOCH exactly as the declaration's build had it, under any spelling; no signing command), and compares
//   each DECLARED field with the rebuild's (`declaration`, `format` and `informational` are not compared). MATCH (exit 0) or
//   DIFFERENT naming each field (exit 1); a missing or malformed declaration, or one of another commit, is refused (exit 2).
//   WHERE IT RUNS: in a clean checkout of the DECLARED commit (the frozen SHA), never at the candidate-notice commit that carries the
//   declarations (a child of it: HEAD would not be the declared commit, and the check refuses). Copy the declarations out of the
//   notice commit to a directory outside the tree, check out the frozen SHA, and pass that directory.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const version = JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/sea/runtime-version.json'), 'utf8')).runtime_version;
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const CHANNELS = ['production', 'dev'];
const DECLARED = ['channel', 'runtime_version', 'source_sha', 'dirty', 'built_at', 'built_at_source', 'digest', 'exe_unsigned_sha256', 'trust', 'default_api', 'release_base', 'base_node'];
const args = process.argv.slice(2);
const mode = args[0];

/** the declaration of one build, from its build-info (the DECLARED fields --check compares, and what it does not) */
export function declarationOf(b, buildInfoBytes) {
  return {
    declaration: 'brain-factory per-channel build declaration: the implementer\'s WO-10 release-provenance evidence, information only; not a WO-6 release manifest, and not presented as the candidate\'s release manifest of AC-5(h) / VERIFICATION_SPEC §3.8 unless the Director so decides (CR-019)',
    format: 1, channel: b.channel, runtime_version: b.runtime_version, source_sha: b.source_commit, dirty: b.dirty, built_at: b.built_at, built_at_source: b.built_at_source,
    digest: { algorithm: b.digest.algorithm, value: b.digest.value }, exe_unsigned_sha256: b.exe.unsigned_sha256,
    trust: { channel: b.trust.channel, mode: b.trust.mode, keys: b.trust.keys.map((k) => ({ key_id: k.key_id, public_key_sha256: k.public_key_sha256 })) },
    default_api: b.default_api, release_base: b.release_base, base_node: { version: b.base_node.version, sha256: b.base_node.sha256 },
    informational: {
      build_info_sha256: sha256(buildInfoBytes),
      not_compared: 'provenance.mjs --check does not compare this: it hashes the whole build-info, signing fields included, and a --check rebuild is never signed',
    },
  };
}

if (mode === '--emit' || mode === '--check') {
  const dir = args[1] ? resolve(args[1]) : null;
  if (!dir || args.length !== 2) { console.log('usage: provenance.mjs --emit <dir> | --check <dir>'); process.exit(2); }
  const { authenticodeImageHash } = await import(pathToFileURL(join(ROOT, 'scripts/factory-runner/enrolled/pe-image.mjs')).href);
  if (mode === '--emit') {
    const out = [];
    for (const ch of CHANNELS) {
      const d = join(ROOT, 'dist', 'brain-factory', version, ch);
      const f = join(d, 'build-info.json');
      if (!existsSync(f)) { console.log('REFUSED: no ' + ch + ' build at ' + d + ' - build both channels from a clean checkout of HEAD first'); process.exit(2); }
      const bytes = readFileSync(f); const b = JSON.parse(bytes.toString('utf8'));
      if (b.source_commit !== head || b.dirty !== false) { console.log('REFUSED: the ' + ch + ' build is of ' + b.source_commit + (b.dirty ? ' (dirty)' : '') + ', not of a clean HEAD ' + head); process.exit(2); }
      const img = authenticodeImageHash(readFileSync(join(d, 'BrainFactorySetup.exe')));
      if (img !== b.digest.value) { console.log('REFUSED: the ' + ch + ' exe\'s image hash ' + img + ' is not its build-info digest ' + b.digest.value); process.exit(2); }
      out.push([ch + '.build-declaration.json', JSON.stringify(declarationOf(b, bytes), null, 2) + '\n']);
    }
    mkdirSync(dir, { recursive: true });
    for (const [n, t] of out) writeFileSync(join(dir, n), t);
    writeFileSync(join(dir, 'SHA256SUMS'), out.map(([n, t]) => sha256(Buffer.from(t)) + '  ' + n + '\n').sort().join(''));
    console.log('EMITTED ' + out.map(([n]) => n).join(', ') + ' for ' + head + ' in ' + dir);
    process.exit(0);
  }
  // --check
  const decl = {};
  for (const ch of CHANNELS) {
    const f = join(dir, ch + '.build-declaration.json');
    let x; try { x = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.log('REFUSED: ' + f + ' cannot be read as JSON (' + (e.code || e.message) + ')'); process.exit(2); }
    if (x.format !== 1 || x.channel !== ch || DECLARED.some((k) => !(k in x))) { console.log('REFUSED: ' + f + ' is not a format-1 ' + ch + ' declaration'); process.exit(2); }
    if (x.source_sha !== head) { console.log('REFUSED: ' + f + ' declares ' + x.source_sha + '; this checkout is ' + head + ' - run the check in a clean checkout of the declared commit (the frozen SHA, not the candidate-notice commit that carries the declarations), with the declarations copied to a directory outside the tree'); process.exit(2); }
    decl[ch] = x;
  }
  const diffs = [];
  for (const ch of CHANNELS) {
    const out = mkdtempSync(join(tmpdir(), 'bf-provenance-' + ch + '-'));
    try {
      const env = {};
      for (const [k, v] of Object.entries(process.env)) { const K = k.toUpperCase(); if (K !== 'BRAIN_FACTORY_SIGN_CMD' && K !== 'SOURCE_DATE_EPOCH') env[k] = v; }
      if (decl[ch].built_at_source === 'SOURCE_DATE_EPOCH') env.SOURCE_DATE_EPOCH = String(Math.floor(Date.parse(decl[ch].built_at) / 1000));
      const r = spawnSync(process.execPath, [join(ROOT, 'scripts/factory-build/build-sea.mjs'), '--channel', ch, '--out', out], { cwd: ROOT, env, encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0) { diffs.push(ch + ': the rebuild failed (build-sea exit ' + r.status + '): ' + String(r.stderr || r.stdout).trim().split(/\r?\n/).pop()); continue; }
      const bytes = readFileSync(join(out, 'build-info.json'));
      const rebuilt = declarationOf(JSON.parse(bytes.toString('utf8')), bytes);
      const img = authenticodeImageHash(readFileSync(join(out, 'BrainFactorySetup.exe')));
      if (img !== rebuilt.digest.value) diffs.push(ch + ': the rebuilt exe\'s image hash ' + img + ' is not its own build-info digest');
      for (const k of DECLARED) if (JSON.stringify(rebuilt[k]) !== JSON.stringify(decl[ch][k])) diffs.push(ch + ' ' + k + ': declared ' + JSON.stringify(decl[ch][k]) + ', rebuilt ' + JSON.stringify(rebuilt[k]));
      console.log(ch + ': rebuilt digest ' + rebuilt.digest.value + ' (declared ' + decl[ch].digest.value + ')');
    } finally { rmSync(out, { recursive: true, force: true }); }
  }
  console.log(diffs.length ? 'DIFFERENT\n' + diffs.map((d) => '  ' + d).join('\n') : 'MATCH: both channels\' rebuilds of ' + head + ' equal the declarations in ' + dir);
  process.exit(diffs.length ? 1 : 0);
}
if (mode) { console.log('usage: provenance.mjs [--emit <dir> | --check <dir>]'); process.exit(2); }

const { compose, sha256: sha } = await import(pathToFileURL(join(ROOT, 'scripts/factory-control-plane/migration.mjs')).href);
const out = [];
out.push('| channel | runtime version | source commit | dirty | built_at | digest (PE Authenticode image hash, SHA-256) | file sha256 (unsigned) | trust mode | trust set (key id, sha256 of the public key) | default API |');
out.push('|---|---|---|---|---|---|---|---|---|---|');
for (const ch of CHANNELS) {
  const f = join(ROOT, 'dist', 'brain-factory', version, ch, 'build-info.json');
  if (!existsSync(f)) { out.push('| ' + ch + ' | (no build at ' + f + ') |'); continue; }
  const b = JSON.parse(readFileSync(f, 'utf8'));
  const keys = b.trust.keys.length ? b.trust.keys.map((k) => '`' + k.key_id + '` / `' + k.public_key_sha256 + '`').join('<br>') : '**empty** (no key recorded by WO-6)';
  out.push('| ' + ch + ' | ' + b.runtime_version + ' | `' + b.source_commit + '` | ' + b.dirty + ' | ' + b.built_at + ' | `' + b.digest.value + '` | `' + b.sha256 + '` | ' + b.trust.mode + ' | ' + keys + ' | ' + (b.default_api || '(none: dev)') + ' |');
  if (b.source_commit !== head) out.push('| | **the build is not of HEAD ' + head.slice(0, 8) + '** |');
}
const b0 = JSON.parse(readFileSync(join(ROOT, 'dist', 'brain-factory', version, 'dev', 'build-info.json'), 'utf8'));
out.push('');
out.push('- Base executable: node ' + b0.base_node.version + ' `' + b0.base_node.official_name + '`, sha256 `' + b0.base_node.sha256 + '` (pinned; source ' + b0.base_node.pin_source + '), signature stripped before injection.');
out.push('- Reproducibility: `verify-build.mjs` rebuilds each channel from the same commit and reports IDENTICAL (final pass steps 3-4; `release_acceptance` R-h, which also compares every embedded trust entry with a recomputation from the committed trust source). The per-channel build declarations (`provenance.mjs --emit`, committed in the candidate-notice commit) are the implementer\'s information-only evidence of the same facts, not the candidate\'s release manifest unless the Director so decides (CR-019); `provenance.mjs --check`, run in a clean checkout of the frozen SHA, compares them with a fresh rebuild.');
out.push('- Control-plane migration: `scripts/factory-control-plane/migration.mjs compose` (a developer label: its sha256 is `' + sha(compose()) + '`, not the step\'s). The live-migration step is not built here: the verifier builds it from the candidate migration\'s committed bytes with the Director instrument `qa/verification/auto-enrollment-v1/tools/build_live_migration_step.mjs` (WO-1 r3), and the founder applies exactly that file.');
out.push('- No production key material: the production trust set is empty, and the only key anywhere is the dev key (public seed; disposable planes only). The build refuses a production trust set that holds a dev key, and a dev trust set that holds any other key. The release receipts, and the digest the founder signs, come from the verifier\'s rebuild at the CERTIFIED SHA, not from this table.');
console.log(out.join('\n'));

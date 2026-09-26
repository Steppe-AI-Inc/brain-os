#!/usr/bin/env node
// RELEASE PROVENANCE INPUTS (WO-10; S-5): what the candidate's own builds say about themselves, read from each channel's build-info.json
// (written by build-sea.mjs at the checked-out commit) and the composed migration - printed as Markdown for the candidate report.
//   node qa/implementation/auto-enrollment-v1/tools/provenance.mjs
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const version = JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/sea/runtime-version.json'), 'utf8')).runtime_version;
const { compose, sha256 } = await import(pathToFileURL(join(ROOT, 'scripts/factory-control-plane/migration.mjs')).href);
const out = [];
out.push('| channel | runtime version | source commit | dirty | built_at | digest (PE Authenticode image hash, SHA-256) | file sha256 (unsigned) | trust mode | trust set (key id, sha256 of the public key) | default API |');
out.push('|---|---|---|---|---|---|---|---|---|---|');
for (const ch of ['production', 'dev']) {
  const f = join(ROOT, 'dist', 'brain-factory', version, ch, 'build-info.json');
  if (!existsSync(f)) { out.push('| ' + ch + ' | (no build at ' + f + ') |'); continue; }
  const b = JSON.parse(readFileSync(f, 'utf8'));
  const keys = b.trust.keys.length ? b.trust.keys.map((k) => '`' + k.key_id + '` / `' + k.public_key_sha256 + '`').join('<br>') : '**empty** (no key before C-3)';
  out.push('| ' + ch + ' | ' + b.runtime_version + ' | `' + b.source_commit + '` | ' + b.dirty + ' | ' + b.built_at + ' | `' + b.digest.value + '` | `' + b.sha256 + '` | ' + b.trust.mode + ' | ' + keys + ' | ' + (b.default_api || '(none: dev)') + ' |');
  if (b.source_commit !== head) out.push('| | **the build is not of HEAD ' + head.slice(0, 8) + '** |');
}
const b0 = JSON.parse(readFileSync(join(ROOT, 'dist', 'brain-factory', version, 'dev', 'build-info.json'), 'utf8'));
out.push('');
out.push('- Base executable: node ' + b0.base_node.version + ' `' + b0.base_node.official_name + '`, sha256 `' + b0.base_node.sha256 + '` (pinned; source ' + b0.base_node.pin_source + '), signature stripped before injection.');
out.push('- Reproducibility: `verify-build.mjs` rebuilds each channel from the same commit and reports IDENTICAL (final pass steps 3-4; `release_acceptance` R-h).');
out.push('- Control-plane migration (`scripts/factory-control-plane/migration.mjs compose`), sha256 `' + sha256(compose()) + '`. The founder applies exactly this body inside the Director\'s wrapper.');
out.push('- No production key material: the production trust set is empty, and the only key anywhere is the dev key (public seed; disposable planes only). The release receipts, and the digest the founder signs, come from the verifier\'s rebuild at the CERTIFIED SHA, not from this table.');
console.log(out.join('\n'));

// ENTRY SKELETON of the future Windows Factory runtime, packaged as BrainFactorySetup.exe by scripts/factory-build/build-sea.mjs.
//
// NON-SEMANTIC PREPARATION BUILD. This file carries no product behaviour: no enrollment, no pairing, no plane connection, no state
// names, no routes, no authorization or scheduling rules. Those wait for the Director's canonical contract. It exists so the
// packaging pipeline has a real entry point to build, sign-hook, reproduce and test.
//
//   BrainFactorySetup.exe version     the embedded build info as one JSON line: {runtime_version, source_commit, dirty, built_at}
//   BrainFactorySetup.exe selftest    PASS/FAIL lines (Ed25519 through node:crypto; which runtime this is); exit 0 all pass, 1 otherwise
//   BrainFactorySetup.exe <anything else, or nothing - a double-click>
//                                     "<cmd>: not available in this preparation build", exit 64
//
// The same file runs unbundled under plain node (`node scripts/factory-runner/sea/main.mjs selftest`) and can be imported without
// running anything (the CLI runs only when this module is the entry point).
//
// RULES for this file and everything it imports - build-sea.mjs enforces the first three and fails the build otherwise:
//   1. no top-level await: a SEA main script is CommonJS, and the bundle is emitted as CommonJS
//   2. at run time only node: builtins - a SEA's require() loads builtins only (anything else must be bundled)
//   3. no PostgreSQL client (pg, pg-*, postgres, ...), no scripts/factory-runner/db.mjs, no database URL: the runtime holds none
//   4. SEA-only APIs (node:sea getAsset & co.) only behind isSea() - they throw under plain node
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as sea from 'node:sea';

export const EXIT_OK = 0;
export const EXIT_SELFTEST_FAILED = 1;
export const EXIT_NOT_AVAILABLE = 64; // EX_USAGE

// Replaced at bundle time by an esbuild define ({runtime_version, source_commit, dirty, built_at}); absent when run unbundled.
const EMBEDDED_BUILD_INFO = typeof __BUILD_INFO__ !== 'undefined' ? __BUILD_INFO__ : null;

export function isSea() {
  try { return typeof sea.isSea === 'function' && sea.isSea() === true; } catch { return false; }
}

export function buildInfo() {
  if (EMBEDDED_BUILD_INFO) {
    const { runtime_version, source_commit, dirty, built_at } = EMBEDDED_BUILD_INFO;
    return { runtime_version, source_commit, dirty, built_at };
  }
  return { runtime_version: null, source_commit: null, dirty: null, built_at: null }; // unbundled source: not a build
}

// RFC 8032 section 7.1, TEST 1 (empty message): a known answer, so the check is against the standard and not only against itself.
const RFC8032_TEST1 = {
  seed: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  publicKey: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  signature: 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
};
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex'); // PKCS#8 PrivateKeyInfo header for a raw 32-byte seed

function flipBit(buf, index = 0) { const b = Buffer.from(buf); b[index % b.length] ^= 0x01; return b; }

export function selftest(out = (line) => process.stdout.write(line + '\n')) {
  let passed = 0; let failed = 0;
  const row = (label, fn) => {
    let ok = false; let detail = '';
    try { const r = fn(); ok = r === true || (r && r.ok === true); detail = r && r.detail ? ' (' + r.detail + ')' : ''; } catch (e) { detail = ' (threw: ' + (e && e.message || e) + ')'; }
    if (ok) passed++; else failed++;
    out((ok ? 'PASS ' : 'FAIL ') + label + detail);
  };

  const inSea = isSea();
  row('runtime: ' + (inSea ? 'running as a single executable application (node:sea isSea() = true)' : 'running as plain node (node:sea isSea() = false)')
    + ', node ' + process.version + ' ' + process.platform + '-' + process.arch, () => {
    // a SEA must carry its build info (it was bundled with it); plain node of the unbundled source carries none
    if (inSea && !EMBEDDED_BUILD_INFO) return { ok: false, detail: 'a SEA without embedded build info' };
    return { ok: true, detail: EMBEDDED_BUILD_INFO ? 'build ' + EMBEDDED_BUILD_INFO.runtime_version + ' @ ' + String(EMBEDDED_BUILD_INFO.source_commit).slice(0, 12) + (EMBEDDED_BUILD_INFO.dirty ? ' dirty' : '') : 'unbundled source, no build info' };
  });

  row('ed25519 known answer (RFC 8032 7.1 TEST 1): public key and signature from the seed match the standard, and verify', () => {
    const privateKey = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(RFC8032_TEST1.seed, 'hex')]), format: 'der', type: 'pkcs8' });
    const publicKey = createPublicKey(privateKey);
    const rawPublic = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
    const signature = sign(null, Buffer.alloc(0), privateKey);
    return rawPublic === RFC8032_TEST1.publicKey && signature.toString('hex') === RFC8032_TEST1.signature
      && verify(null, Buffer.alloc(0), publicKey, signature) === true;
  });

  row('ed25519 fresh key pair: a signature verifies, and a changed message, a changed signature and another key are each rejected', () => {
    const a = generateKeyPairSync('ed25519');
    const b = generateKeyPairSync('ed25519');
    const message = randomBytes(64);
    const signature = sign(null, message, a.privateKey);
    const good = verify(null, message, a.publicKey, signature);
    const badMessage = verify(null, flipBit(message, 17), a.publicKey, signature);
    const badSignature = verify(null, message, a.publicKey, flipBit(signature, 5));
    const otherKey = verify(null, message, b.publicKey, signature);
    return { ok: signature.length === 64 && good === true && badMessage === false && badSignature === false && otherKey === false,
      detail: 'verify=' + good + ', changed message=' + badMessage + ', changed signature=' + badSignature + ', other key=' + otherKey };
  });

  out('selftest: ' + (failed === 0 ? 'PASS' : 'FAIL') + ' (' + passed + ' passed, ' + failed + ' failed; ' + (inSea ? 'SEA' : 'plain node') + ')');
  return failed === 0 ? EXIT_OK : EXIT_SELFTEST_FAILED;
}

function printable(cmd) {
  const s = String(cmd);
  return (s.length > 120 ? s.slice(0, 120) + '...' : s).replace(/[\u0000-\u001f\u007f]/g, '?');
}

export function main(argv = process.argv.slice(2), out = (line) => process.stdout.write(line + '\n'), err = (line) => process.stderr.write(line + '\n')) {
  const cmd = argv[0];
  if (cmd === 'version') { out(JSON.stringify(buildInfo())); return EXIT_OK; }
  if (cmd === 'selftest') return selftest(out);
  err((cmd === undefined ? '(none)' : printable(cmd)) + ': not available in this preparation build');
  return EXIT_NOT_AVAILABLE;
}

// The CLI runs when this is the program: the packaged exe, the bundle run with `node main.cjs`, or this file run with `node`.
// Importing it runs nothing. (`import.meta.url` is defined away in the bundle, which is decided by the first two cases.)
function invokedAsEntry() {
  if (isSea()) return true;
  if (EMBEDDED_BUILD_INFO) return true;
  const self = import.meta.url;
  if (typeof self !== 'string' || !process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(self)); } catch { return false; }
}

// process.exitCode, not process.exit(): stdout on a pipe is flushed before the process ends
if (invokedAsEntry()) process.exitCode = main();

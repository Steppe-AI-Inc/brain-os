#!/usr/bin/env node
// P-4 / WO-4 DEVELOPER VERIFICATION: the one human download is BrainFactorySetup.exe. setup finds the signed manifest it verifies
// itself against - beside the exe, else (on a channel with public release storage, CR-004) at <release base>/<version>/ - and however
// it arrives, the manifest is checked against the trust set pinned in the artifact and the exe's own image hash (no trust added).
//   M1 a manifest beside the exe is used and nothing is fetched
//   M2 none beside, a release base: exactly <base>/<version>/BrainFactorySetup.manifest.json is fetched, once, and used
//   M3 an explicit --manifest that does not exist is never replaced by a download
//   M4 no release base (the dev channel): nothing is fetched; refused as before
//   M5 the storage answers 404, or a body larger than a manifest: refused by name, with where it looked
//   M6 a fetched manifest is verified exactly like a local one: a manifest for other bytes is refused (digest_mismatch), one signed
//      by a key outside the pinned set is refused (key_outside_trust_set), and the correct one verifies
// Plain node; no plane; a local HTTP server stands in for the public storage. usage: node qa/factory/v1/setup_manifest_locate.mjs
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync, sign } from 'node:crypto';
import { locateManifest } from '../../../scripts/factory-runner/enrolled/setup.mjs';
import { canonicalManifestBytes, keyIdOf, verifyRelease } from '../../../scripts/factory-runner/enrolled/release.mjs';
import { channelTrustFile, makeManifest, signDev } from '../../../scripts/factory-build/release-manifest.mjs';
import { recorder } from './flows.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { results, row } = recorder();
const work = mkdtempSync(join(tmpdir(), 'bf-manifest-'));
const hits = [];
const served = new Map();
const server = createServer((req, res) => {
  hits.push(req.url);
  const body = served.get(req.url);
  if (body === undefined) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port + '/factory-releases/production';
try {
  const version = JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/sea/runtime-version.json'), 'utf8')).runtime_version;
  const exePath = join(ROOT, 'dist', 'brain-factory', version, 'dev', 'BrainFactorySetup.exe');
  if (!existsSync(exePath)) throw new Error('build the dev channel first: node scripts/factory-build/build-sea.mjs --channel dev');
  const exe = join(work, 'dl', 'BrainFactorySetup.exe');
  const good = signDev(makeManifest({ artifact: exePath, channel: 'dev', version, source_sha: 'a'.repeat(40), receipt_sha256: 'b'.repeat(64) }));

  // M1
  const beside = join(work, 'beside'); const bexe = join(beside, 'BrainFactorySetup.exe');
  await import('node:fs').then((fs) => { fs.mkdirSync(beside, { recursive: true }); fs.writeFileSync(join(beside, 'BrainFactorySetup.manifest.json'), JSON.stringify(good)); });
  hits.length = 0;
  const m1 = await locateManifest({ exe: bexe, releaseBase: base, version });
  row('M1 a manifest beside the exe is used; nothing is fetched', m1.manifest && m1.manifest.digest === good.digest && hits.length === 0, JSON.stringify({ from: m1.from.slice(-40), hits }));

  // M2
  served.set('/factory-releases/production/' + version + '/BrainFactorySetup.manifest.json', JSON.stringify(good));
  hits.length = 0;
  const m2 = await locateManifest({ exe, releaseBase: base, version });
  row('M2 none beside: exactly <base>/<version>/BrainFactorySetup.manifest.json is fetched, once, and used',
    m2.manifest && m2.manifest.digest === good.digest && hits.length === 1 && hits[0] === '/factory-releases/production/' + version + '/BrainFactorySetup.manifest.json' && m2.from === base + '/' + version + '/BrainFactorySetup.manifest.json', JSON.stringify({ hits, from: m2.from }));

  // M3
  hits.length = 0;
  const m3 = await locateManifest({ exe, manifestArg: join(work, 'nope.json'), releaseBase: base, version });
  row('M3 an explicit --manifest that does not exist is never replaced by a download', m3.manifest === null && hits.length === 0 && m3.tried.length === 1, JSON.stringify({ hits, tried: m3.tried }));

  // M4
  hits.length = 0;
  const m4 = await locateManifest({ exe, releaseBase: null, version });
  row('M4 no release base (the dev channel): nothing is fetched and there is no manifest', m4.manifest === null && hits.length === 0, JSON.stringify({ hits }));

  // M5
  const m5a = await locateManifest({ exe, releaseBase: base, version: '9.9.9' });
  served.set('/factory-releases/production/8.8.8/BrainFactorySetup.manifest.json', 'x'.repeat(70000));
  const m5b = await locateManifest({ exe, releaseBase: base, version: '8.8.8' });
  row('M5 the storage answers 404, or a body larger than a manifest: no manifest, and it says where it looked and why',
    m5a.manifest === null && m5a.detail === 'HTTP 404' && m5a.tried.length === 2 && m5b.manifest === null && /larger/.test(m5b.detail || ''), JSON.stringify({ a: m5a.detail, b: m5b.detail }));

  // M6: the fetched manifest goes through the same verification as a local one
  const artifact = readFileSync(exePath);
  const trust = channelTrustFile('dev');   // exactly what the dev-channel build pins
  const other = signDev({ ...makeManifest({ artifact: exePath, channel: 'dev', version, source_sha: 'a'.repeat(40), receipt_sha256: 'b'.repeat(64) }), digest: 'c'.repeat(64) });
  const stranger = generateKeyPairSync('ed25519');
  const raw = stranger.publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  const foreign = { ...makeManifest({ artifact: exePath, channel: 'dev', version, source_sha: 'a'.repeat(40), receipt_sha256: 'b'.repeat(64) }), key_id: keyIdOf(raw) };
  foreign.signature = sign(null, canonicalManifestBytes(foreign), stranger.privateKey).toString('base64url');
  const vOk = verifyRelease({ manifest: m2.manifest, artifact, trust });
  const vOther = verifyRelease({ manifest: other, artifact, trust });
  const vForeign = verifyRelease({ manifest: foreign, artifact, trust });
  row('M6 a fetched manifest is verified exactly like a local one: for other bytes -> digest_mismatch; signed outside the pinned set -> key_outside_trust_set; the correct one verifies',
    vOk.ok && vOther.refused === 'digest_mismatch' && vForeign.refused === 'key_outside_trust_set', JSON.stringify({ ok: vOk.ok || vOk.refused, other: vOther.refused, foreign: vForeign.refused }));
} catch (e) {
  row('X0 setup manifest locate', false, e && e.stack || String(e));
} finally {
  await new Promise((r) => server.close(r));
  rmSync(work, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok);
console.log('\nsetup_manifest_locate: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length ? 1 : 0);

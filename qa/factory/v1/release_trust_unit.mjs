#!/usr/bin/env node
// RELEASE TRUST UNITS (WO-6; S-5; AC-5; VERIFICATION_SPEC §3.10 "release-signature check; pinned trust set; dev-key refusal in a
// production-channel build; trust mode or key taken from runtime input"). Plain node, no plane, no build, seconds. Each named refusal
// of verifyRelease is reached by an input that reaches ONLY it, and each channel-separation rule of the build is reached by a planted
// trust file. release_acceptance.mjs proves the same refusals on the BUILT artifacts with a sentinel payload; this suite pins the
// function-level decisions and the source structure that keeps runtime input out of the trust decision.
//   U1 bad_signature: a pinned key id with a signature that does not verify (a signed field changed after signing, one signature bit
//      flipped, another key's signature naming the pinned key id while carrying that other key) is refused bad_signature; the
//      untouched manifest verifies (the control)
//   U2 a trust set in production mode refuses a dev-key signature by name (dev_key_on_production_channel) even when the set HOLDS the
//      dev entry, and with the empty set; a fresh key pinned in a production set verifies its own signature (the refusal is specific
//      to dev keys), and the same key unpinned is key_outside_trust_set
//   U3 the dev key id is stated once in effect: release.mjs KNOWN_DEV_KEY_IDS, trust/dev.json's key ids and release-manifest.mjs
//      devKey() agree; trust/production.json holds none of them, and exactly the key ids the Director's WO-6 records (the release
//      signer's key, from revision 5); every committed entry is bound to its key id, and none repeats
//   U4 the trust decision takes nothing from runtime input, by source structure: release.mjs reads no environment variable, file or
//      network answer and loads no module dynamically; its imports are node:crypto and pe-image.mjs (which imports node:crypto only);
//      EMBEDDED_TRUST is assigned once, from __TRUST__; revocations supply key_ids and releases only; every verifyRelease call of the
//      runtime (setup, upgrade, supervisor, main) passes exactly manifest / artifact / revocations - no trust, no spread; the `trust`
//      read-back takes no argument; the `channel` facts come from __CHANNEL__ and the embedded trust only
//   U5 build-sea channelTrust enforces channel separation on a planted trust directory: a production set holding a KNOWN dev key id,
//      or a key trust/dev.json lists, is refused (EXIT.POLICY, "is a dev key"); a dev set holding a key that is not a dev key is
//      refused (EXIT.POLICY, "only dev keys"); the committed sets and a production set holding a fresh non-dev key pass
//   U5b a malformed production entry stops the build before anything is written: a public key that is not 32 bytes, a key id that
//      is another key's, a value that is not a key, no public key, a repeated key id, keys that are not a list, a mode that is not
//      production; the same key well formed is accepted
//   U6 the other named refusals, each reached alone: channel_mismatch (a dev-signed production-channel manifest on a dev runtime),
//      malformed (no receipt hash; v 2; a digest that is not 64 hex), unsigned, the pinned entry not bound to its key id
//      (key_outside_trust_set for a correctly signed manifest), no_trust_set, key_revoked, release_revoked
//   U7 a manifest that carries an outside key (as public_key, publicKey, key, pubkey, public_keys, keys, trust.keys) and is signed by
//      it is refused key_outside_trust_set; naming the pinned dev key id instead, it is refused bad_signature - a key named by the
//      manifest is never used
// usage: node qa/factory/v1/release_trust_unit.mjs
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalManifestBytes, keyIdOf, KNOWN_DEV_KEY_IDS, NO_REVOCATIONS, verifyRelease } from '../../../scripts/factory-runner/enrolled/release.mjs';
import { devKey, signDev } from '../../../scripts/factory-build/release-manifest.mjs';
import { BuildError, channelTrust, EXIT, TRUST_DIR } from '../../../scripts/factory-build/build-sea.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const results = [];
const row = (id, ok, detail) => { results.push({ id, ok: !!ok }); console.log((ok ? 'OK   ' : 'FAIL ') + id + (detail ? ' - ' + String(detail).slice(0, 1500) : '')); };
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const readJ = (rel) => JSON.parse(read(rel));
const safe = (fn) => { try { return fn(); } catch (e) { return { ok: false, refused: 'THREW', message: String(e && e.message || e) }; } };
const rawOf = (kp) => Buffer.from(kp.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32));
const entryOf = (kp) => ({ key_id: keyIdOf(rawOf(kp)), public_key: rawOf(kp).toString('base64url') });
const signWith = (m, kp) => ({ ...m, signature: sign(null, canonicalManifestBytes(m), kp.privateKey).toString('base64url') });
const base = (channel, version = '0.9.3') => ({ v: 1, channel, version, source_sha: 'a'.repeat(40), digest: 'd'.repeat(64), key_id: null, receipt_sha256: 'b'.repeat(64), signature: null });
const DEV = devKey();
const DEV_ENTRY = { key_id: DEV.keyId, public_key: DEV.publicKey.toString('base64url') };
const devSigned = (m) => signWith({ ...m, key_id: DEV.keyId }, { privateKey: DEV.privateKey });
const flipSig = (m) => { const b = Buffer.from(m.signature, 'base64url'); b[7] ^= 0x01; return { ...m, signature: b.toString('base64url') }; };
const V = (manifest, trust, revocations = NO_REVOCATIONS) => safe(() => verifyRelease({ manifest, artifact: null, trust, revocations }));
// the key ids the Director's WO-6 names as the live trust set (the release signer's key, recorded by revision 5)
const WO6_KEY_IDS = [...new Set(read('qa/work-orders/auto-enrollment-v1/WO-6.md').match(/\bed25519:[0-9a-f]{64}\b/g) || [])].filter((id) => !KNOWN_DEV_KEY_IDS.includes(id)).sort();

let T_DEV, T_PROD;
try {
  T_DEV = channelTrust('dev');
  T_PROD = channelTrust('production');
} catch (e) {
  row('X0 the committed trust sets validate', false, e && e.message);
}

// ---- U1
if (T_DEV) {
  const good = signDev(base('dev'));
  const changed = { ...good, version: '0.9.4' };
  const flipped = flipSig(good);
  const other = generateKeyPairSync('ed25519');
  const impostor = signWith({ ...base('dev'), key_id: DEV.keyId, public_key: rawOf(other).toString('base64url') }, other);
  const r = { control: V(good, T_DEV), changed: V(changed, T_DEV), flipped: V(flipped, T_DEV), impostor: V(impostor, T_DEV) };
  row('U1 a pinned key id with a signature that does not verify is refused bad_signature (a signed field changed after signing; one signature bit flipped; another key\'s signature naming the pinned key id, carrying that key); the untouched manifest verifies',
    r.control.ok === true && r.changed.refused === 'bad_signature' && r.flipped.refused === 'bad_signature' && r.impostor.refused === 'bad_signature',
    JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.ok ? 'ok' : v.refused]))));
}

// ---- U2
{
  const prodDev = devSigned(base('production'));
  const holding = { channel: 'production', mode: 'production', keys: [DEV_ENTRY] };
  const empty = { channel: 'production', mode: 'production', keys: [] };
  const K = generateKeyPairSync('ed25519');
  const kSigned = signWith({ ...base('production'), key_id: entryOf(K).key_id }, K);
  const pinned = { channel: 'production', mode: 'production', keys: [entryOf(K)] };
  const r = { holding: V(prodDev, holding), empty: V(prodDev, empty), pinnedK: V(kSigned, pinned), unpinnedK: V(kSigned, empty) };
  row('U2 a production-mode trust set refuses a dev-key signature by name (dev_key_on_production_channel) even when it HOLDS the dev entry, and with the empty set; a fresh pinned production key verifies its own signature, and unpinned it is key_outside_trust_set',
    r.holding.refused === 'dev_key_on_production_channel' && r.empty.refused === 'dev_key_on_production_channel' && r.pinnedK.ok === true && r.unpinnedK.refused === 'key_outside_trust_set',
    JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.ok ? 'ok' : v.refused]))));
}

// ---- U3
{
  const dev = readJ('scripts/factory-runner/enrolled/trust/dev.json');
  const prod = readJ('scripts/factory-runner/enrolled/trust/production.json');
  const devIds = (dev.keys || []).map((k) => k.key_id);
  const bound = (k) => { const raw = Buffer.from(String(k.public_key), 'base64url'); return raw.length === 32 && k.key_id === 'ed25519:' + createHash('sha256').update(raw).digest('hex'); };
  const all = [...(dev.keys || []), ...(prod.keys || [])];
  const facts = {
    sameIds: JSON.stringify([...KNOWN_DEV_KEY_IDS].sort()) === JSON.stringify([...devIds].sort()) && JSON.stringify([...devIds]) === JSON.stringify([DEV.keyId]),
    devPublicKey: (dev.keys || []).length === 1 && dev.keys[0].public_key === DEV_ENTRY.public_key,
    productionHoldsNoDevKey: !(prod.keys || []).some((k) => KNOWN_DEV_KEY_IDS.includes(k.key_id) || devIds.includes(k.key_id) || k.public_key === DEV_ENTRY.public_key),
    // WO-6: the live trust set is exactly the release signer's key the Director's WO-6 records, and nothing else. The
    // key ids are read from the Director's document in this tree, which the static contract holds byte-identical to the designated
    // Director commit; a dev key id that document may mention is never one of them
    productionIsTheDirectorsRecord: Array.isArray(prod.keys) && JSON.stringify(prod.keys.map((k) => k.key_id).sort()) === JSON.stringify(WO6_KEY_IDS),
    allBound: all.every(bound), noRepeat: new Set(all.map((k) => k.key_id)).size === all.length,
    modes: dev.channel === 'dev' && dev.mode === 'dev' && prod.channel === 'production' && prod.mode === 'production',
  };
  row('U3 release.mjs KNOWN_DEV_KEY_IDS, trust/dev.json\'s key ids and devKey() agree; trust/production.json holds no dev key, and exactly the key ids the Director\'s WO-6 records (the release signer\'s key); every entry is bound to its key id and none repeats',
    Object.values(facts).every(Boolean), JSON.stringify({ ...facts, wo6_key_ids: WO6_KEY_IDS }));
}

// ---- U4
{
  const rel = read('scripts/factory-runner/enrolled/release.mjs');
  const pe = read('scripts/factory-runner/enrolled/pe-image.mjs');
  const code = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/ .*$/, '')).join('\n');
  const relCode = code(rel);
  const FORBIDDEN = ['process.env', 'process.argv', 'process.execPath', 'getBuiltinModule', 'readFileSync', 'readFile(', 'openSync', 'fetch(', 'import(', 'require(', 'node:fs', 'node:child_process', 'node:http', '__CHANNEL__', 'globalThis'];
  const hits = FORBIDDEN.filter((f) => relCode.includes(f));
  const imports = (t) => [...t.matchAll(/^import [^\n]* from '([^']+)';$/gm)].map((m) => m[1]).sort();
  const importsOk = JSON.stringify(imports(rel)) === JSON.stringify(['./pe-image.mjs', 'node:crypto']) && JSON.stringify(imports(pe)) === JSON.stringify(['node:crypto'])
    && !code(pe).includes('process.') && !code(pe).includes('import(');
  const embeddedAssign = [...relCode.matchAll(/\bEMBEDDED_TRUST\s*=(?!=)/g)].length;
  const embeddedOk = embeddedAssign === 1 && /^const EMBEDDED_TRUST = typeof __TRUST__ !== 'undefined' \? __TRUST__ : null;$/m.test(rel);
  const revReads = [...new Set([...relCode.matchAll(/\brevocations\.([A-Za-z_]+)/g)].map((m) => m[1]))].sort();
  const signatureOk = /export function verifyRelease\(\{ manifest, artifact = null, trust = EMBEDDED_TRUST, revocations \}\)/.test(rel) && /export function trustReadback\(trust = EMBEDDED_TRUST\)/.test(rel);
  // every verifyRelease call of the runtime: its argument is an object literal of manifest / artifact / revocations only
  const RUNTIME = ['scripts/factory-runner/enrolled/setup.mjs', 'scripts/factory-runner/enrolled/upgrade.mjs', 'scripts/factory-runner/enrolled/supervisor.mjs',
    'scripts/factory-runner/enrolled/worker.mjs', 'scripts/factory-runner/enrolled/credential.mjs', 'scripts/factory-runner/enrolled/revocations.mjs', 'scripts/factory-runner/sea/main.mjs'];
  const calls = []; const badCalls = [];
  const topSplit = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if ('([{'.includes(ch)) d++; if (')]}'.includes(ch)) d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur); return out.map((x) => x.trim()); };
  for (const f of RUNTIME) {
    const t = code(read(f));
    for (let i = t.indexOf('verifyRelease('); i >= 0; i = t.indexOf('verifyRelease(', i + 1)) {
      if (/function\s+$/.test(t.slice(Math.max(0, i - 20), i))) continue;
      let j = i + 'verifyRelease('.length, d = 1; for (; j < t.length && d > 0; j++) d += t[j] === '(' ? 1 : t[j] === ')' ? -1 : 0;
      const arg = t.slice(i + 'verifyRelease('.length, j - 1).trim();
      calls.push(f.split('/').pop());
      const inner = /^\{([\s\S]*)\}$/.exec(arg);
      const props = inner ? topSplit(inner[1]) : null;
      const ok = !!props && props.length > 0 && props.every((p) => /^(manifest|artifact|revocations)(\s*:[\s\S]+)?$/.test(p)) && !props.some((p) => /^\.\.\./.test(p))
        && props.some((p) => /^manifest\b/.test(p)) && props.some((p) => /^revocations\b/.test(p));
      if (!ok) badCalls.push(f.split('/').pop() + ': ' + arg.slice(0, 160));
    }
  }
  const main = code(read('scripts/factory-runner/sea/main.mjs'));
  const readbacks = [...main.matchAll(/trustReadback\(([^)]*)\)/g)].map((m) => m[1]);
  const setup = code(read('scripts/factory-runner/enrolled/setup.mjs'));
  const channelOk = /^const CHANNEL = typeof __CHANNEL__ !== 'undefined' \? __CHANNEL__ : \{ channel: null, default_api: null, release_base: null \};$/m.test(read('scripts/factory-runner/enrolled/setup.mjs'))
    && [...setup.matchAll(/\bCHANNEL\s*=(?!=)/g)].length === 1 && /export function channelInfo\(\) \{ const t = embeddedTrust\(\); return \{ \.\.\.CHANNEL, trust_mode: t && t\.mode \}; \}/.test(setup)
    && /const \{ channelInfo \} = await import\('\.\.\/enrolled\/setup\.mjs'\);\s*process\.stdout\.write\(JSON\.stringify\(channelInfo\(\)\) \+ '\\n'\);/.test(main);
  const facts = { forbidden: hits, importsOk, embeddedOk, revocationReads: revReads, signatureOk, calls: calls.length, badCalls, readbacks, channelOk };
  row('U4 the trust decision takes nothing from runtime input: release.mjs reads no environment, file or network answer and loads no module dynamically (imports node:crypto and pe-image.mjs only); EMBEDDED_TRUST is assigned once, from __TRUST__; revocations supply key_ids and releases only; every runtime verifyRelease call passes manifest / artifact / revocations and nothing else; the trust read-back takes no argument; the channel facts come from __CHANNEL__ and the embedded trust',
    hits.length === 0 && importsOk && embeddedOk && JSON.stringify(revReads) === JSON.stringify(['key_ids', 'releases']) && signatureOk
      && calls.length >= 4 && badCalls.length === 0 && readbacks.length === 1 && readbacks[0].trim() === '' && channelOk,
    JSON.stringify(facts));
}

// ---- U5
{
  const dir = mkdtempSync(join(tmpdir(), 'bf-trust-unit-'));
  const plant = (name, obj) => { const d = mkdtempSync(join(dir, name + '-')); writeFileSync(join(d, 'dev.json'), JSON.stringify(obj.dev)); writeFileSync(join(d, 'production.json'), JSON.stringify(obj.production)); return d; };
  const devFile = readJ('scripts/factory-runner/enrolled/trust/dev.json');
  const prodFile = readJ('scripts/factory-runner/enrolled/trust/production.json');
  const fresh = entryOf(generateKeyPairSync('ed25519'));
  const extraDev = entryOf(generateKeyPairSync('ed25519'));
  const attempt = (channel, d) => { try { const t = channelTrust(channel, { trustDir: d }); return { ok: true, keys: t.keys.length }; } catch (e) { return { ok: false, policy: e instanceof BuildError && e.code === EXIT.POLICY, message: String(e.message) }; } };
  try {
    const r = {
      prodHoldsKnownDev: attempt('production', plant('p1', { dev: { ...devFile, keys: [] }, production: { ...prodFile, keys: [DEV_ENTRY] } })),
      prodHoldsListedDev: attempt('production', plant('p2', { dev: { ...devFile, keys: [...devFile.keys, extraDev] }, production: { ...prodFile, keys: [extraDev] } })),
      devHoldsForeign: attempt('dev', plant('d1', { dev: { ...devFile, keys: [...devFile.keys, fresh] }, production: prodFile })),
      committedProd: attempt('production', TRUST_DIR), committedDev: attempt('dev', TRUST_DIR),
      prodHoldsFresh: attempt('production', plant('p3', { dev: devFile, production: { ...prodFile, keys: [fresh] } })),
    };
    row('U5 build-sea channelTrust keeps the channels apart: a production set holding a known dev key id, or a key trust/dev.json lists, is refused (EXIT.POLICY, "is a dev key"); a dev set holding a key that is not a dev key is refused (EXIT.POLICY, "only dev keys"); the committed sets and a production set holding a fresh non-dev key pass',
      !r.prodHoldsKnownDev.ok && r.prodHoldsKnownDev.policy && /is a dev key/.test(r.prodHoldsKnownDev.message)
        && !r.prodHoldsListedDev.ok && r.prodHoldsListedDev.policy && /is a dev key/.test(r.prodHoldsListedDev.message)
        && !r.devHoldsForeign.ok && r.devHoldsForeign.policy && /only dev keys/.test(r.devHoldsForeign.message)
        && r.committedProd.ok && r.committedProd.keys === prodFile.keys.length && r.committedDev.ok && r.committedDev.keys === 1 && r.prodHoldsFresh.ok && r.prodHoldsFresh.keys === 1,
      JSON.stringify(r));
    // U5b: the entries the build takes into a production artifact are parsed strictly, each refused before anything is written
    const P = generateKeyPairSync('ed25519'), P2 = generateKeyPairSync('ed25519');
    const e = entryOf(P);
    const prodWith = (name, production) => attempt('production', plant(name, { dev: devFile, production: { ...prodFile, ...production } }));
    const m = {
      shortKey: prodWith('m1', { keys: [{ key_id: e.key_id, public_key: rawOf(P).subarray(0, 31).toString('base64url') }] }),
      anotherKeysId: prodWith('m2', { keys: [{ key_id: entryOf(P2).key_id, public_key: e.public_key }] }),
      notAKey: prodWith('m3', { keys: [{ key_id: e.key_id, public_key: '!!not a key!!' }] }),
      noPublicKey: prodWith('m4', { keys: [{ key_id: e.key_id }] }),
      repeated: prodWith('m5', { keys: [e, e] }),
      keysNotAList: prodWith('m6', { keys: { [e.key_id]: e.public_key } }),
      modeNotProduction: prodWith('m7', { mode: 'dev', keys: [e] }),
      control: prodWith('m8', { keys: [e] }),
    };
    const notBound = (x) => !x.ok && !x.policy && /is not bound to its public key/.test(x.message);
    row('U5b a malformed production trust entry stops the build: a public key that is not 32 bytes, an entry whose key id is another key\'s, a value that is not a key, an entry with no public key (each "is not bound to its public key"); the same key id twice ("repeats"); keys that are not a list, or a mode that is not production ("keys an array"); the same key, well formed, is accepted',
      notBound(m.shortKey) && notBound(m.anotherKeysId) && notBound(m.notAKey) && notBound(m.noPublicKey) && !m.repeated.ok && /repeats/.test(m.repeated.message)
        && !m.keysNotAList.ok && /keys an array/.test(m.keysNotAList.message) && !m.modeNotProduction.ok && /keys an array/.test(m.modeNotProduction.message)
        && m.control.ok && m.control.keys === 1,
      JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.ok ? 'accepted' : v.message.slice(0, 70)]))));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ---- U6
if (T_DEV) {
  const good = signDev(base('dev'));
  const prodDev = devSigned(base('production'));
  const noReceipt = { ...good }; delete noReceipt.receipt_sha256;
  const K = generateKeyPairSync('ed25519'), K2 = generateKeyPairSync('ed25519');
  // a pinned entry whose key id is not the id of the public key it carries; the manifest names that id and is signed by that key
  const unbound = { channel: 'dev', mode: 'dev', keys: [{ key_id: entryOf(K).key_id, public_key: entryOf(K2).public_key }] };
  const byK2 = signWith({ ...base('dev'), key_id: entryOf(K).key_id }, K2);
  const r = {
    channel: V(prodDev, T_DEV), noReceipt: V(noReceipt, T_DEV), v2: V({ ...good, v: 2 }, T_DEV), badDigest: V({ ...good, digest: 'x'.repeat(64) }, T_DEV),
    unsigned: V({ ...good, signature: null }, T_DEV), unbound: V(byK2, unbound), noTrust: V(good, null),
    keyRevoked: V(good, T_DEV, { key_ids: [DEV.keyId], releases: [] }), releaseRevoked: V(good, T_DEV, { key_ids: [], releases: [{ digest: good.digest }] }),
    control: V(good, T_DEV),
  };
  const want = { channel: 'channel_mismatch', noReceipt: 'malformed', v2: 'malformed', badDigest: 'malformed', unsigned: 'unsigned', unbound: 'key_outside_trust_set', noTrust: 'no_trust_set', keyRevoked: 'key_revoked', releaseRevoked: 'release_revoked' };
  row('U6 each other named refusal, reached alone: channel_mismatch (a dev-signed production-channel manifest on a dev runtime); malformed (no receipt hash, v 2, a digest that is not 64 hex); unsigned; a pinned entry not bound to its key id (key_outside_trust_set for a correctly signed manifest); no_trust_set; key_revoked; release_revoked - and the control verifies',
    Object.entries(want).every(([k, w]) => r[k].refused === w) && r.control.ok === true,
    JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.ok ? 'ok' : v.refused]))));
}

// ---- U7
if (T_DEV) {
  const K = generateKeyPairSync('ed25519');
  const KE = entryOf(K);
  const carry = { public_key: KE.public_key, publicKey: KE.public_key, key: KE.public_key, pubkey: KE.public_key, public_keys: [KE], keys: [KE], trust: { channel: 'dev', mode: 'dev', keys: [KE] } };
  const outside = signWith({ ...base('dev'), key_id: KE.key_id, ...carry }, K);
  const namingDev = signWith({ ...base('dev'), key_id: DEV.keyId, ...carry }, K);
  const r = { outside: V(outside, T_DEV), namingDev: V(namingDev, T_DEV) };
  row('U7 a manifest carrying an outside key (public_key, publicKey, key, pubkey, public_keys, keys, trust.keys) and signed by it is refused key_outside_trust_set; naming the pinned dev key id instead it is refused bad_signature - a key named by the manifest is never used',
    r.outside.refused === 'key_outside_trust_set' && r.namingDev.refused === 'bad_signature', JSON.stringify({ outside: r.outside.ok ? 'ok' : r.outside.refused, namingDev: r.namingDev.ok ? 'ok' : r.namingDev.refused }));
}

const failed = results.filter((r) => !r.ok);
console.log('\nrelease_trust_unit: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length || results.length < 7 ? 1 : 0);

#!/usr/bin/env node
// THE PREPARED UPDATE, STAGED BY THE FACTORY (founder correction 2026-10-03; CR-028; WO-6 r4) - DEVELOPER VERIFICATION, never independent.
// Plain node, no database: the Edge modules supabase/control-plane/edge/supabase/functions/_shared/release_stage.ts and pe_image.ts as
// the Edge runtime serves them, an in-memory release bucket, and keys made here with ssh-keygen (Git for Windows) - a stand-in Director
// key, never the Director's own; SG5 holds the module's pinned key to the Director's ledger record instead. The Director stages with
// its own tooling (WO-6 r4: no implementer-authored program receives or invokes its key); here the suite itself signs.
//   SG1 the signature check accepts only an armored SSH signature by exactly the given ssh-ed25519 key, in exactly the staging
//       namespace, with sha512, over exactly the statement: another key, another namespace, one character of the statement changed, a
//       tampered or truncated signature and sha256 are all refused
//   SG2 a statement is exactly the canonical production statement: other white space, key order, an extra field, upper-case hex, the
//       dev channel or a malformed version is not one
//   SG3 factory-release-stage: a statement the Director's key signed stages the prepared update (the release tool's unsigned manifest
//       form) and its signature, and answers a one-object upload address for that version's installer; refused with nothing written:
//       not POST (405), another body (400), a malformed statement (400), another key or namespace (403), a request too large (413),
//       storage that takes nothing (503), and an older version over a newer staged one (409 not_newer); storage that does not answer
//       at all is the request boundary's 503 unavailable; the same statement sent again is answered "already", with NO upload
//       address and nothing written (S-7: only the request that first stages a statement receives it)
//   SG4 the Admin API's staged check: true only for exactly the staged four values with the installer at the staged path having the
//       staged digest; false for any other value, for a prepared update changed after it was signed, without its signature, for a
//       signature by another key, with no installer at the path, and with another installer there (WO-6 r4; contract §2 Release)
//   SG5 the key the module pins is the Director's signing key as the Director's ledger records it at the designated Director commit
//   SG6 the staging flow against the function on node:http and a bucket whose uploads never overwrite: the first staging request
//       receives the upload address and the installer is uploaded through it; the same statement re-sent by another party - before the
//       upload and after it - receives none; a second upload to the address is refused; the staged check is then true (AC-5(q))
//   SG7 the Admin API's digest (pe_image.ts) is the runtime's (scripts/factory-runner/enrolled/pe-image.mjs) on three Windows
//       executables; one byte changed inside a section changes it, the CheckSum field does not, and bytes that are no PE file give null
// usage: node qa/factory/v1/release_stage_acceptance.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const R = (p) => join(ROOT, ...p.split('/'));
const imp = (p) => import(pathToFileURL(R(p)).href);
const results = [];
const row = (id, ok, detail) => { results.push({ id, ok: !!ok }); console.log((ok ? 'OK   ' : 'FAIL ') + id + (detail && !ok ? ' - ' + String(detail).slice(0, 1500) : '')); };
const work = mkdtempSync(join(tmpdir(), 'bf-stage-suite-'));
const S = await imp('supabase/control-plane/edge/supabase/functions/_shared/release_stage.ts');
const { peImageDigest } = await imp('supabase/control-plane/edge/supabase/functions/_shared/pe_image.ts');
const { authenticodeImageHash } = await imp('scripts/factory-runner/enrolled/pe-image.mjs');
const te = new TextEncoder();
const SYS = (name) => join(process.env.SystemRoot || 'C:\\Windows', 'System32', name);
const WHOAMI = readFileSync(SYS('whoami.exe')), HOSTNAME = readFileSync(SYS('hostname.exe'));

const keygen = (name) => {
  const f = join(work, name);
  const r = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'stand-in ' + name, '-f', f], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ssh-keygen -t ed25519 failed: ' + (r.stderr || r.error));
  return { file: f, pub: readFileSync(f + '.pub', 'utf8').trim() };
};
const sign = (text, key, ns = S.STAGE_NAMESPACE, extra = []) => {
  const f = join(work, 'msg-' + Math.random().toString(36).slice(2) + '.txt');
  writeFileSync(f, text);
  const r = spawnSync('ssh-keygen', ['-Y', 'sign', '-f', key.file, '-n', ns, ...extra, f], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ssh-keygen -Y sign failed: ' + r.stderr);
  return readFileSync(f + '.sig', 'utf8');
};

// an in-memory release bucket
function bucket() {
  const objects = new Map(); const writes = []; let takes = true;
  return {
    objects, writes, setTakes: (v) => { takes = v; },
    read: async (path) => (objects.has(path) ? objects.get(path).toString('utf8') : null),
    readBytes: async (path, max) => { const b = objects.get(path); return b && b.length <= max ? new Uint8Array(b) : null; },
    put: async (path, body) => { if (!takes) return false; objects.set(path, Buffer.from(body)); writes.push(path); return true; },
  };
}
async function serve(handler) {
  const server = createServer(async (q, res) => {
    const chunks = []; for await (const c of q) chunks.push(c);
    const r = await handler(new Request('http://127.0.0.1' + q.url, { method: q.method, headers: q.headers, body: ['GET', 'HEAD'].includes(q.method) ? undefined : Buffer.concat(chunks) }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { origin: 'http://127.0.0.1:' + server.address().port, close: () => new Promise((ok) => { server.closeAllConnections(); server.close(ok); }) };
}
const preparedOf = (st) => JSON.stringify({ v: 1, channel: 'production', version: st.version, source_sha: st.source_sha, digest: st.digest, key_id: null, receipt_sha256: st.receipt_sha256, signature: null });

const director = keygen('director'), other = keygen('other');
const ST = { channel: 'production', version: '2.0.0', source_sha: 'a'.repeat(40), digest: 'b'.repeat(64), receipt_sha256: 'c'.repeat(64) };
const TEXT = S.statementText(ST);
const KEY = S.ed25519KeyOf(director.pub);

try {
  // ---- SG1 the signature check
  {
    const good = sign(TEXT, director);
    const flip = (s) => { const lines = s.split('\n'); const i = 2; lines[i] = lines[i].slice(0, 10) + (lines[i][10] === 'A' ? 'B' : 'A') + lines[i].slice(11); return lines.join('\n'); };
    const got = {
      good: await S.verifySshSignature(good, te.encode(TEXT), S.STAGE_NAMESPACE, KEY),
      otherKey: await S.verifySshSignature(sign(TEXT, other), te.encode(TEXT), S.STAGE_NAMESPACE, KEY),
      otherNs: await S.verifySshSignature(sign(TEXT, director, 'git'), te.encode(TEXT), S.STAGE_NAMESPACE, KEY),
      changed: await S.verifySshSignature(good, te.encode(TEXT.replace('2.0.0', '2.0.1')), S.STAGE_NAMESPACE, KEY),
      tampered: await S.verifySshSignature(flip(good), te.encode(TEXT), S.STAGE_NAMESPACE, KEY),
      truncated: await S.verifySshSignature(good.split('\n').slice(0, 3).join('\n'), te.encode(TEXT), S.STAGE_NAMESPACE, KEY),
      sha256: await S.verifySshSignature(sign(TEXT, director, S.STAGE_NAMESPACE, ['-O', 'hashalg=sha256']), te.encode(TEXT), S.STAGE_NAMESPACE, KEY),
    };
    row('SG1 the signature check accepts exactly the stand-in Director key\'s sha512 signature over the statement in the staging namespace, and refuses another key, another namespace, a changed statement, a tampered or truncated signature, and sha256',
      got.good === true && Object.entries(got).every(([k, v]) => k === 'good' || v === false), JSON.stringify(got));
  }
  // ---- SG2 the statement
  {
    const not = {
      spaced: S.parseStatement(JSON.stringify(JSON.parse(TEXT), null, 1)),
      order: S.parseStatement(JSON.stringify({ v: 1, version: ST.version, channel: ST.channel, digest: ST.digest, receipt_sha256: ST.receipt_sha256, source_sha: ST.source_sha })),
      extra: S.parseStatement(TEXT.replace('"v":1', '"key_id":null,"v":1')),
      upper: S.parseStatement(TEXT.replace('b'.repeat(64), 'B'.repeat(64))),
      dev: S.parseStatement(TEXT.replace('"production"', '"dev"')),
      version: S.parseStatement(TEXT.replace('2.0.0', '2.0')),
    };
    row('SG2 the canonical production statement parses back to its values; other white space, another key order, an extra field, upper-case hex, the dev channel and a malformed version are no statement',
      JSON.stringify(S.parseStatement(TEXT)) === JSON.stringify(ST) && Object.values(not).every((v) => v === null), JSON.stringify(not));
  }
  // ---- SG3 the stage function
  {
    const b = bucket();
    const uploads = [];
    const api = S.createStageApi({ directorKey: director.pub, read: b.read, put: b.put, signUpload: async (path) => { uploads.push(path); return 'https://storage.invalid/upload/' + path; } });
    const post = async (body, raw) => { const r = await api(new Request('http://x/', { method: 'POST', body: raw ?? JSON.stringify(body) })); return { http: r.status, ...(await r.json()) }; };
    const good = sign(TEXT, director);
    const refusals = {
      get: (await api(new Request('http://x/', { method: 'GET' }))).status,
      extraField: (await post({ statement: TEXT, signature: good, note: 'x' })).http,
      malformed: (await post({ statement: TEXT.replace('"v":1', '"v":2'), signature: good })).http,
      otherKey: (await post({ statement: TEXT, signature: sign(TEXT, other) })).http,
      otherNamespace: (await post({ statement: TEXT, signature: sign(TEXT, director, 'file') })).http,
      tooLarge: (await post(null, JSON.stringify({ statement: TEXT, signature: good, pad: 'x'.repeat(20000) }))).http,
    };
    const writtenByRefusals = b.writes.length + uploads.length;
    b.setTakes(false);
    const storageDown = await post({ statement: TEXT, signature: good });
    b.setTakes(true);
    // storage that does not answer at all is an error at the request boundary (503 unavailable), never an answer about the statement
    const throwing = S.createStageApi({ directorKey: director.pub, read: async () => { throw new TypeError('fetch failed'); }, put: b.put, signUpload: async () => null });
    const boundary = await throwing(new Request('http://x/', { method: 'POST', body: JSON.stringify({ statement: TEXT, signature: good }) }));
    refusals.boundary = boundary.status + ' ' + (await boundary.json()).refused;
    const ok = await post({ statement: TEXT, signature: good });
    const prepared = JSON.parse(b.objects.get('production/prepared.json').toString('utf8'));
    const sigStored = b.objects.get('production/prepared.sig').toString('utf8') === good;
    const w0 = b.writes.length, u0 = uploads.length;
    const again = await post({ statement: TEXT, signature: good });
    const againChangedNothing = b.writes.length === w0 && uploads.length === u0;
    const older = S.statementText({ ...ST, version: '1.9.9', digest: 'd'.repeat(64) });
    const olderAnswer = await post({ statement: older, signature: sign(older, director) });
    const stillNewest = JSON.parse(b.objects.get('production/prepared.json').toString('utf8')).version === '2.0.0';
    row('SG3 a statement the Director\'s key signed stages the prepared update (the unsigned manifest form) and its signature and answers the installer\'s one-object upload address; refused with nothing written: GET 405, another body 400, a malformed statement 400, another key or namespace 403, too large 413, storage that takes nothing 503; storage not answering is the boundary\'s 503 unavailable; an older version over the newer one 409 not_newer; the same statement again is "already" with no upload address and nothing written',
      writtenByRefusals === 0 && refusals.get === 405 && refusals.extraField === 400 && refusals.malformed === 400 && refusals.otherKey === 403 && refusals.otherNamespace === 403 && refusals.tooLarge === 413
        && storageDown.http === 503 && refusals.boundary === '503 unavailable' && ok.http === 200 && ok.ok === true && uploads.includes('production/2.0.0/BrainFactorySetup.exe') && /BrainFactorySetup\.exe$/.test(ok.installer_upload_url)
        && JSON.stringify(prepared) === preparedOf(ST)
        && sigStored && again.http === 200 && again.already === true && !('installer_upload_url' in again) && againChangedNothing
        && olderAnswer.http === 409 && olderAnswer.refused === 'not_newer' && stillNewest,
      JSON.stringify({ refusals, writtenByRefusals, storageDown: storageDown.http, ok: ok.http, again: { http: again.http, already: again.already, url: 'installer_upload_url' in again }, againChangedNothing, older: olderAnswer.http + ' ' + olderAnswer.refused, stillNewest }));
  }
  // ---- SG4 the Admin API's staged check (values, signature AND the installer at the staged path)
  {
    const st = { ...ST, digest: authenticodeImageHash(WHOAMI) };
    const text = S.statementText(st), good = sign(text, director);
    const staged = async (objects, ask, key = director.pub) => {
      const b = bucket(); for (const [k, v] of Object.entries(objects)) b.objects.set(k, Buffer.from(v));
      return S.stagedUpdate({ read: b.read, readBytes: b.readBytes, directorKey: key })(ask);
    };
    const exePath = 'production/' + st.version + '/BrainFactorySetup.exe';
    const full = { 'production/prepared.json': preparedOf(st), 'production/prepared.sig': good, [exePath]: WHOAMI };
    const ask = { channel: 'production', version: st.version, source_sha: st.source_sha, digest: st.digest, receipt_sha256: st.receipt_sha256 };
    const got = {
      staged: await staged(full, ask),
      otherDigest: await staged(full, { ...ask, digest: 'e'.repeat(64) }),
      otherVersion: await staged(full, { ...ask, version: '2.0.1' }),
      editedAfterSigning: await staged({ ...full, 'production/prepared.json': preparedOf({ ...st, receipt_sha256: 'f'.repeat(64) }) }, { ...ask, receipt_sha256: 'f'.repeat(64) }),
      noSignature: await staged({ 'production/prepared.json': full['production/prepared.json'], [exePath]: WHOAMI }, ask),
      otherKeysCheck: await staged(full, ask, other.pub),
      noInstaller: await staged({ 'production/prepared.json': full['production/prepared.json'], 'production/prepared.sig': good }, ask),
      otherInstaller: await staged({ ...full, [exePath]: HOSTNAME }, ask),
    };
    row('SG4 the staged check is true only for the staged four values with the installer at the staged path having the staged digest, and false for another digest or version, for a prepared update changed after it was signed, without its signature, against another key, with no installer at the path, and with another installer there',
      got.staged === true && Object.entries(got).every(([k, v]) => k === 'staged' || v === false), JSON.stringify(got));
  }
  // ---- SG5 the pinned key is the Director's ledger record
  {
    const director_commit = process.env.FACTORY_DESIGNATED_DIRECTOR || '3745a281acf8475058c2420b2c7a402efd675ddd';
    const r = spawnSync('git', ['-C', ROOT, 'show', director_commit + ':qa/work-orders/AUTO_ENROLLMENT_V1_LEDGER.json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    let recorded = null;
    try { recorded = JSON.parse(r.stdout).director_signing_key.public_key.split(' ').slice(0, 2).join(' '); } catch { recorded = null; }
    row('SG5 the key factory-release-stage and the Admin API check (release_stage.ts DIRECTOR_KEY) is the Director\'s signing key as the Director\'s ledger records it at the designated Director commit ' + director_commit.slice(0, 8),
      recorded && S.DIRECTOR_KEY === recorded && S.ed25519KeyOf(S.DIRECTOR_KEY)?.length === 32, JSON.stringify({ pinned: S.DIRECTOR_KEY, recorded }));
  }
  // ---- SG6 the staging flow, end to end, with uploads that never overwrite (AC-5(q))
  {
    const b = bucket();
    const once = new Map();   // upload token -> path
    let storageServer = null;
    const stageApi = S.createStageApi({ directorKey: director.pub, read: b.read, put: b.put,
      signUpload: async (path) => { const t = 't' + once.size; once.set(t, path); return storageServer.origin + '/upload/' + t; } });
    storageServer = await serve(async (req) => {
      const u = new URL(req.url);
      if (req.method === 'PUT' && u.pathname.startsWith('/upload/')) {
        const path = once.get(u.pathname.slice('/upload/'.length));
        if (!path) return new Response('{"error":"no such upload"}', { status: 400 });
        if (b.objects.has(path)) return new Response('{"error":"Duplicate"}', { status: 409 });   // no upsert: never over one that is there
        b.objects.set(path, Buffer.from(await req.arrayBuffer())); b.writes.push(path);
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    const fn = await serve(stageApi);
    try {
      const st = { channel: 'production', version: '3.1.0', source_sha: '1'.repeat(40), digest: authenticodeImageHash(WHOAMI), receipt_sha256: '2'.repeat(64) };
      const text = S.statementText(st), signature = sign(text, director);
      const send = async () => { const r = await fetch(fn.origin + '/any/path', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ statement: text, signature }) }); return { http: r.status, ...(await r.json()) }; };
      const first = await send();
      const resentBefore = await send();
      const up1 = await fetch(first.installer_upload_url, { method: 'PUT', body: WHOAMI });
      const up2 = await fetch(first.installer_upload_url, { method: 'PUT', body: HOSTNAME });
      const resentAfter = await send();
      const servedRight = Buffer.compare(b.objects.get('production/3.1.0/BrainFactorySetup.exe') || Buffer.alloc(0), WHOAMI) === 0;
      const stagedNow = await S.stagedUpdate({ read: b.read, readBytes: b.readBytes, directorKey: director.pub })({ channel: 'production', version: st.version, source_sha: st.source_sha, digest: st.digest, receipt_sha256: st.receipt_sha256 });
      row('SG6 the first staging request receives the installer\'s upload address and the installer is uploaded through it; the same statement re-sent by another party, before the upload and after it, receives none ("already"); a second upload to the address is refused; the staged check is then true',
        first.http === 200 && typeof first.installer_upload_url === 'string' && resentBefore.http === 200 && resentBefore.already === true && !('installer_upload_url' in resentBefore)
          && up1.status === 200 && up2.status === 409 && resentAfter.already === true && !('installer_upload_url' in resentAfter) && servedRight && stagedNow === true,
        JSON.stringify({ first: first.http, resentBefore: [resentBefore.http, resentBefore.already, 'installer_upload_url' in resentBefore], up1: up1.status, up2: up2.status, resentAfter: resentAfter.already, servedRight, stagedNow }));
    } finally { await fn.close(); await storageServer.close(); }
  }
  // ---- SG7 the Admin API's digest is the runtime's
  {
    const samples = ['whoami.exe', 'hostname.exe', 'notepad.exe'].map((n) => ({ n, b: readFileSync(SYS(n)) }));
    const equal = samples.map(({ n, b }) => ({ n, ts: peImageDigest(new Uint8Array(b)), rt: authenticodeImageHash(b) }));
    const b = Buffer.from(WHOAMI);
    const pe = b.readUInt32LE(0x3c), opt = pe + 24, checksum = opt + 64;
    const nSections = b.readUInt16LE(pe + 6), secTable = opt + b.readUInt16LE(pe + 20);
    const firstRaw = [...Array(nSections).keys()].map((i) => ({ size: b.readUInt32LE(secTable + i * 40 + 16), ptr: b.readUInt32LE(secTable + i * 40 + 20) })).find((s) => s.size > 0);
    const inSection = Buffer.from(b); inSection[firstRaw.ptr + 1] ^= 1;
    const inChecksum = Buffer.from(b); inChecksum[checksum] ^= 0xff;
    const facts = {
      equal: equal.every((x) => x.ts && x.ts === x.rt),
      sectionChangesIt: peImageDigest(new Uint8Array(inSection)) !== peImageDigest(new Uint8Array(b)),
      checksumDoesNot: peImageDigest(new Uint8Array(inChecksum)) === peImageDigest(new Uint8Array(b)),
      notPe: peImageDigest(te.encode('not a PE file, only text that is long enough to be read as a header if it were one...'.repeat(2))) === null,
      empty: peImageDigest(new Uint8Array(0)) === null,
    };
    row('SG7 the Admin API\'s digest (pe_image.ts) equals the runtime\'s (pe-image.mjs) on three Windows executables; one byte changed inside a section changes it, the CheckSum field does not, and bytes that are no PE file give null',
      Object.values(facts).every(Boolean), JSON.stringify({ facts, equal: equal.map((x) => x.n + ':' + (x.ts === x.rt)) }));
  }
} catch (e) {
  row('X0 the suite ran to the end', false, (e && e.stack) || e);
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\nrelease_stage_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length || results.length < 7 ? 1 : 0);

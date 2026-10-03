#!/usr/bin/env node
// THE PREPARED UPDATE, STAGED BY THE FACTORY (founder correction 2026-10-03; CR-028) - DEVELOPER VERIFICATION, never independent.
// Plain node, no database: the Edge module supabase/control-plane/edge/supabase/functions/_shared/release_stage.ts as the Edge runtime
// serves it, an in-memory release bucket, and keys made here with ssh-keygen (Git for Windows) - a stand-in Director key, never the
// Director's own; SG5 holds the module's pinned key to the Director's ledger record instead.
//   SG1 the signature check accepts only an armored SSH signature by exactly the given ssh-ed25519 key, in exactly the staging
//       namespace, with sha512, over exactly the statement: another key, another namespace, one character of the statement changed, a
//       tampered or truncated signature and sha256 are all refused
//   SG2 a statement is exactly the canonical production statement: other white space, key order, an extra field, upper-case hex, the
//       dev channel or a malformed version is not one
//   SG3 factory-release-stage: a statement the Director's key signed stages the prepared update (the release tool's unsigned manifest
//       form) and its signature, and answers a one-object upload address for that version's installer; refused with nothing written:
//       not POST (405), another body (400), a malformed statement (400), another key or namespace (403), a request too large (413),
//       storage that takes nothing (503), and an older version over a newer staged one (409 not_newer); storage that does not answer
//       at all is the request boundary's 503 unavailable; the same statement again is answered again (it changes nothing)
//   SG4 the Admin API's staged check: true for exactly the staged four values; false for any other value, for a prepared update
//       changed after it was signed, without its signature, and for a signature by another key
//   SG5 the key the module pins is the Director's signing key as the Director's ledger records it at the designated Director commit
//   SG6 the Director's command (scripts/factory-build/stage-release.mjs) against the function and the bucket: it signs with ssh-keygen,
//       stages, uploads the installer once, and reads its digest back; run again it uploads nothing (ALREADY STAGED); another installer
//       at the path stops it (the upload address never overwrites); another key stages nothing
// usage: node qa/factory/v1/release_stage_acceptance.mjs
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const { stageRelease, statementText: toolStatement, STAGE_NAMESPACE: TOOL_NS } = await imp('scripts/factory-build/stage-release.mjs');
const { authenticodeImageHash } = await imp('scripts/factory-runner/enrolled/pe-image.mjs');
const te = new TextEncoder();

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

// an in-memory release bucket, the one-object upload addresses it hands out, and the stage function on node:http
function bucket() {
  const objects = new Map(); const writes = []; let takes = true;
  const b = {
    objects, writes, setTakes: (v) => { takes = v; },
    read: async (path) => (objects.has(path) ? objects.get(path).toString('utf8') : null),
    put: async (path, body, type) => { if (!takes) return false; objects.set(path, Buffer.from(body)); writes.push(path); return true; },
  };
  return b;
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
      tool: toolStatement(ST) === TEXT && TOOL_NS === S.STAGE_NAMESPACE ? null : 'the command writes another statement or namespace',
    };
    row('SG2 the canonical production statement parses back to its values (and the Director\'s command writes exactly that text in the same namespace); other white space, another key order, an extra field, upper-case hex, the dev channel and a malformed version are no statement',
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
    const ok = await post({ statement: TEXT, signature: good });
    const prepared = JSON.parse(b.objects.get('production/prepared.json').toString('utf8'));
    const sigStored = b.objects.get('production/prepared.sig').toString('utf8') === good;
    const again = await post({ statement: TEXT, signature: good });
    // storage that does not answer at all is an error at the request boundary (503 unavailable), never an answer about the statement
    const throwing = S.createStageApi({ directorKey: director.pub, read: async () => { throw new TypeError('fetch failed'); }, put: b.put, signUpload: async () => null });
    const boundary = await throwing(new Request('http://x/', { method: 'POST', body: JSON.stringify({ statement: TEXT, signature: good }) }));
    refusals.boundary = boundary.status + ' ' + (await boundary.json()).refused;
    const older = S.statementText({ ...ST, version: '1.9.9', digest: 'd'.repeat(64) });
    const olderAnswer = await post({ statement: older, signature: sign(older, director) });
    const stillNewest = JSON.parse(b.objects.get('production/prepared.json').toString('utf8')).version === '2.0.0';
    row('SG3 a statement the Director\'s key signed stages the prepared update (the unsigned manifest form) and its signature and answers the installer\'s one-object upload address; refused with nothing written: GET 405, another body 400, a malformed statement 400, another key or namespace 403, too large 413, storage that takes nothing 503; an older version over the newer one 409 not_newer; the same statement again is answered again',
      writtenByRefusals === 0 && refusals.get === 405 && refusals.extraField === 400 && refusals.malformed === 400 && refusals.otherKey === 403 && refusals.otherNamespace === 403 && refusals.tooLarge === 413
        && storageDown.http === 503 && refusals.boundary === '503 unavailable' && ok.http === 200 && ok.ok === true && uploads.includes('production/2.0.0/BrainFactorySetup.exe') && /BrainFactorySetup\.exe$/.test(ok.installer_upload_url)
        && JSON.stringify(prepared) === JSON.stringify({ v: 1, channel: 'production', version: '2.0.0', source_sha: ST.source_sha, digest: ST.digest, key_id: null, receipt_sha256: ST.receipt_sha256, signature: null })
        && sigStored && again.http === 200 && olderAnswer.http === 409 && olderAnswer.refused === 'not_newer' && stillNewest,
      JSON.stringify({ refusals, writtenByRefusals, storageDown: storageDown.http, ok: ok.http, again: again.http, older: olderAnswer.http + ' ' + olderAnswer.refused, stillNewest }));
  }
  // ---- SG4 the Admin API's staged check
  {
    const b = bucket();
    const good = sign(TEXT, director);
    await b.put('production/prepared.json', JSON.stringify({ v: 1, channel: 'production', version: ST.version, source_sha: ST.source_sha, digest: ST.digest, key_id: null, receipt_sha256: ST.receipt_sha256, signature: null }), 'application/json');
    await b.put('production/prepared.sig', good, 'text/plain');
    const check = S.stagedUpdate({ read: b.read, directorKey: director.pub });
    const ask = { channel: 'production', version: ST.version, source_sha: ST.source_sha, digest: ST.digest, receipt_sha256: ST.receipt_sha256 };
    const got = { staged: await check(ask), otherDigest: await check({ ...ask, digest: 'e'.repeat(64) }), otherVersion: await check({ ...ask, version: '2.0.1' }) };
    const edited = bucket();
    await edited.put('production/prepared.json', JSON.stringify({ v: 1, channel: 'production', version: ST.version, source_sha: ST.source_sha, digest: 'f'.repeat(64), key_id: null, receipt_sha256: ST.receipt_sha256, signature: null }), 'application/json');
    await edited.put('production/prepared.sig', good, 'text/plain');
    got.editedAfterSigning = await S.stagedUpdate({ read: edited.read, directorKey: director.pub })({ ...ask, digest: 'f'.repeat(64) });
    const unsigned = bucket(); await unsigned.put('production/prepared.json', b.objects.get('production/prepared.json').toString('utf8'), 'application/json');
    got.noSignature = await S.stagedUpdate({ read: unsigned.read, directorKey: director.pub })(ask);
    got.otherKeysCheck = await S.stagedUpdate({ read: b.read, directorKey: other.pub })(ask);
    row('SG4 the staged check is true for exactly the staged four values, and false for another digest or version, for a prepared update changed after it was signed, without its signature, and against another key',
      got.staged === true && Object.entries(got).every(([k, v]) => k === 'staged' || v === false), JSON.stringify(got));
  }
  // ---- SG5 the pinned key is the Director's ledger record
  {
    const director_commit = process.env.FACTORY_DESIGNATED_DIRECTOR || '7f8edf2c703f89799b62b3106c3d6d7397b25b3c';
    const r = spawnSync('git', ['-C', ROOT, 'show', director_commit + ':qa/work-orders/AUTO_ENROLLMENT_V1_LEDGER.json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
    let recorded = null;
    try { recorded = JSON.parse(r.stdout).director_signing_key.public_key.split(' ').slice(0, 2).join(' '); } catch { recorded = null; }
    row('SG5 the key factory-release-stage and the Admin API check (release_stage.ts DIRECTOR_KEY) is the Director\'s signing key as the Director\'s ledger records it at the designated Director commit ' + director_commit.slice(0, 8),
      recorded && S.DIRECTOR_KEY === recorded && S.ed25519KeyOf(S.DIRECTOR_KEY)?.length === 32, JSON.stringify({ pinned: S.DIRECTOR_KEY, recorded }));
  }
  // ---- SG6 the Director's command, against the function and a bucket with public reads and write-once uploads
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
      if (req.method === 'GET' && u.pathname.startsWith('/public/')) {
        const path = decodeURIComponent(u.pathname.slice('/public/'.length));
        return b.objects.has(path) ? new Response(b.objects.get(path), { status: 200 }) : new Response('{"error":"not_found"}', { status: 404 });
      }
      return new Response('{}', { status: 404 });
    });
    const fn = await serve(stageApi);
    try {
      const exe = join(work, 'BrainFactorySetup.exe'); copyFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe'), exe);
      const args = { artifact: exe, version: '3.1.0', sourceSha: '1'.repeat(40), receiptSha256: '2'.repeat(64), signingKey: director.file,
        stageUrl: fn.origin + '/', releaseBase: storageServer.origin + '/public/production', say: () => {} };
      const first = await stageRelease(args);
      const uploadsAfterFirst = b.writes.filter((w) => w.endsWith('.exe')).length;
      const second = await stageRelease(args);
      const uploadsAfterSecond = b.writes.filter((w) => w.endsWith('.exe')).length;
      // another installer for the same version is another statement: the function refuses it (not newer)
      const anotherExe = join(work, 'another.exe'); copyFileSync(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'hostname.exe'), anotherExe);
      const sameVersionOtherBytes = await stageRelease({ ...args, artifact: anotherExe });
      // a newer version whose path already holds another installer (an upload made through an address handed out before): stopped
      b.objects.set('production/3.3.0/BrainFactorySetup.exe', readFileSync(anotherExe));
      const blocked = await stageRelease({ ...args, version: '3.3.0' });
      const preparedBefore = b.objects.get('production/prepared.json').toString('utf8');
      const wrongKey = await stageRelease({ ...args, version: '3.4.0', signingKey: other.file });
      const preparedAfter = b.objects.get('production/prepared.json').toString('utf8');
      const digest = authenticodeImageHash(readFileSync(exe));
      row('SG6 the Director\'s command signs with ssh-keygen, stages, uploads the installer once and reads its digest back (STAGED); again, it uploads nothing (ALREADY STAGED); another installer for the same version is refused by the function (not_newer); another installer already at a newer version\'s path stops the command by name; another key stages nothing',
        first.ok === true && first.already === false && first.digest === digest && uploadsAfterFirst === 1 && second.ok === true && second.already === true && uploadsAfterSecond === 1
          && sameVersionOtherBytes.ok === false && sameVersionOtherBytes.refused === 'not_newer'
          && blocked.ok === false && blocked.refused === 'another_installer' && wrongKey.ok === false && wrongKey.refused === 'bad_signature' && preparedAfter === preparedBefore,
        JSON.stringify({ first: first.ok && !first.already, second: second.ok && second.already, uploadsAfterFirst, uploadsAfterSecond, sameVersionOtherBytes: sameVersionOtherBytes.refused, blocked: blocked.refused, wrongKey: wrongKey.refused }));
    } finally { await fn.close(); await storageServer.close(); }
  }
} catch (e) {
  row('X0 the suite ran to the end', false, (e && e.stack) || e);
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* windows */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\nrelease_stage_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length || results.length < 6 ? 1 : 0);

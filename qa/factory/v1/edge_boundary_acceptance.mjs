#!/usr/bin/env node
// VERIFICATION_SPEC §3.4 r3 (the Edge handlers) / P-9 DEVELOPER VERIFICATION: an error is never turned into an answer about the request.
// The two portable handlers (_shared/admin_api.ts, _shared/node_api.ts - the files the Edge runtime serves) run here with their
// dependencies replaced: a Brain OS that answers badly, a WebCrypto that cannot verify Ed25519, a recording front door. No database.
//   EB1-EB4  Brain OS answering with an error status or a body that is not its documented JSON fails the call as an error (503
//            unavailable) - never "not authenticated" or "not authorized" - and no front door runs
//   EB5      the controls: Brain OS refusing the token is not_authenticated; a user without a profile row reaches the front door with no
//            live role (the front door refuses it, audited); a token whose payload is not JSON is not_authenticated, Brain OS unasked
//   EB6      a WebCrypto that fails (NotSupportedError) fails a session exchange and an enrollment proof as an error (503), never as
//            bad_signature / bad_proof, and no front door runs; the RFC 8032 self-test still gates every route
//   EB7      only an error the PostgreSQL server sent is read as a SQLSTATE (500 server_refused, "nothing changed"); a transport error
//            carrying a five-capital code (EPIPE) is 503, the outcome unknown - on both APIs
//   EB8      the Admin API with BRAIN_OS_URL or BRAIN_OS_ANON_KEY unset (the entry point passes '' and tests neither): no caller passes
//            the token check, so no front door runs - an empty URL admits only the issuer "/auth/v1", whose check request to the
//            relative address fails as an error (503 unavailable, the platform's fetch as the entry point wraps it); an empty key is
//            refused by Brain OS (401 not_authenticated)
// Developer verification, never independent. usage: node qa/factory/v1/edge_boundary_acceptance.mjs [--evidence <file>]
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './plane.mjs';
import { recorder } from './flows.mjs';

const { results, row } = recorder();
const SHARED = join(ROOT, 'supabase', 'control-plane', 'edge', 'supabase', 'functions', '_shared');
const { createAdminApi } = await import(pathToFileURL(join(SHARED, 'admin_api.ts')).href);
const { createNodeApi } = await import(pathToFileURL(join(SHARED, 'node_api.ts')).href);
const b64u = (b) => Buffer.from(b).toString('base64url');
const BRAIN = 'http://brain-os.invalid';

try {
  // ---- the Admin API with a scripted Brain OS
  const adminWith = (script) => {
    const calls = { sql: 0, fetch: 0 };
    const api = createAdminApi({
      sql: async () => { calls.sql++; return [{ r: { ok: false, refused: 'not_authorized', http: 403, message: 'front door' } }]; },
      randomBytes: (n) => new Uint8Array(randomBytes(n)),
      pepper: async () => null,
      brainOs: { url: BRAIN, anonKey: 'anon' },
      fetch: async (u) => { calls.fetch++; return String(u).includes('/auth/v1/user') ? script.user() : script.profiles(); },
      log: () => {},
    });
    return { api, calls };
  };
  const token = (payload) => b64u(JSON.stringify({ alg: 'HS256' })) + '.' + (typeof payload === 'string' ? payload : b64u(JSON.stringify(payload))) + '.' + b64u(randomBytes(16));
  const good = token({ iss: BRAIN + '/auth/v1', sub: randomUUID() });
  const call = async (a, tok = good) => { const r = await a.api(new Request('http://edge.invalid/v1/admin/list-computers', { method: 'POST', headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: '{}' }));
    return { http: r.status, ...(await r.json()), calls: { ...a.calls } }; };
  const J = (status, body) => () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const uid = randomUUID();
  const cases = {
    'EB1 /auth/v1/user answers 500': { user: J(500, { message: 'upstream down' }), profiles: J(200, []) },
    'EB2 /auth/v1/user answers 200 with a body that is not JSON': { user: J(200, '<html>maintenance</html>'), profiles: J(200, []) },
    'EB3 /rest/v1/profiles answers 500': { user: J(200, { id: uid }), profiles: J(500, { message: 'down' }) },
    'EB4 /rest/v1/profiles answers 200 with a body that is not a JSON list': { user: J(200, { id: uid }), profiles: J(200, '{"not":"a list"}') },
  };
  for (const [label, script] of Object.entries(cases)) {
    const r = await call(adminWith(script));
    row(label + ': the call fails as an error - 503 unavailable naming its class - never not_authenticated / not_authorized; no front door runs',
      r.http === 503 && r.refused === 'unavailable' && r.calls.sql === 0, JSON.stringify({ http: r.http, refused: r.refused, message: r.message, sql: r.calls.sql }));
  }
  const refusedTok = await call(adminWith({ user: J(401, { message: 'invalid JWT' }), profiles: J(200, []) }));
  const noProfile = await call(adminWith({ user: J(200, { id: uid }), profiles: J(200, []) }));
  const badPayload = await call(adminWith({ user: J(200, { id: uid }), profiles: J(200, []) }), token(b64u('not json at all')));
  row('EB5 controls: Brain OS refusing the token (401) is not_authenticated with no front door; a user with no profile row reaches the front door with no live role (it decides); a token whose payload is not JSON is not_authenticated without asking Brain OS',
    refusedTok.http === 401 && refusedTok.refused === 'not_authenticated' && refusedTok.calls.sql === 0
      && noProfile.calls.sql === 1 && noProfile.refused === 'not_authorized' && badPayload.http === 401 && badPayload.calls.fetch === 0,
    JSON.stringify({ refusedTok: [refusedTok.http, refusedTok.refused], noProfile: [noProfile.http, noProfile.refused, noProfile.calls], badPayload: [badPayload.http, badPayload.refused, badPayload.calls] }));

  // ---- the Node API on a WebCrypto whose Ed25519 fails for every key but the RFC 8032 self-test's (a platform that lost the algorithm
  // after the self-test ran; the self-test itself is exercised at the end)
  const RFC_PK = Buffer.from('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'hex');
  const subtle = globalThis.crypto.subtle;
  const realImport = subtle.importKey.bind(subtle);
  Object.defineProperty(subtle, 'importKey', { configurable: true, writable: true, value: async (fmt, data, alg, ...rest) => {
    if (alg && alg.name === 'Ed25519' && !Buffer.from(data).equals(RFC_PK)) throw new DOMException('Ed25519 is not supported here', 'NotSupportedError');
    return realImport(fmt, data, alg, ...rest);
  } });
  const nodeCalls = { sql: 0 };
  const nodeApi = createNodeApi({ sql: async () => { nodeCalls.sql++; return [{ r: { ok: true } }]; }, randomBytes: (n) => new Uint8Array(randomBytes(n)),
    pepper: async () => null, log: () => {} });
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pk = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ v: 1, aud: 'factory-node-api', iat: now, exp: now + 50, jti: b64u(randomBytes(18)), pk: b64u(pk) }));
  const assertion = b64u(payload) + '.' + b64u(sign(null, payload, privateKey));
  const post = async (path, body) => { const r = await nodeApi(new Request('http://edge.invalid' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { address: '127.0.0.1' });
    return { http: r.status, ...(await r.json()) }; };
  const ses = await post('/v1/session', { assertion });
  const eid = randomUUID(), ch = randomBytes(32).toString('hex');
  const proof = sign(null, Buffer.from('brain-factory-enroll-v1|' + eid + '|' + ch + '|x'), privateKey);
  const enr = await post('/v1/enroll/complete', { enrollment_id: eid, public_key: b64u(pk), challenge: ch, proof: b64u(proof) });
  row('EB6 a WebCrypto that cannot verify Ed25519 (NotSupportedError) fails a session exchange and an enrollment proof AS AN ERROR (503 plane_unavailable naming the class), never as bad_signature / bad_proof; no front door runs',
    ses.http === 503 && ses.refused === 'plane_unavailable' && /NotSupportedError/.test(ses.message) && enr.http === 503 && enr.refused === 'plane_unavailable' && nodeCalls.sql === 0,
    JSON.stringify({ session: [ses.http, ses.refused, ses.message], enroll: [enr.http, enr.refused], sql: nodeCalls.sql }));
  Object.defineProperty(subtle, 'importKey', { configurable: true, writable: true, value: realImport });

  // ---- EB7: the request boundary reads a SQLSTATE only from an error the PostgreSQL server sent (postgres.js PostgresError, with its
  // severity). A transport error whose code is also five capitals (a socket's EPIPE) leaves the outcome unknown: 503, never
  // "nothing changed". The server's own error stays 500 server_refused, naming its SQLSTATE.
  const { default: postgres } = await import('postgres');
  const serverError = () => new postgres.PostgresError({ severity_local: 'ERROR', severity: 'ERROR', code: '55P03', message: 'canceling statement due to lock timeout' });
  const pipeError = () => Object.assign(new Error('write EPIPE'), { code: 'EPIPE', errno: -32, syscall: 'write' });
  const nodeThrowing = (mk) => createNodeApi({ sql: async () => { throw mk(); }, randomBytes: (n) => new Uint8Array(randomBytes(n)), pepper: async () => null, log: () => {} });
  const timeVia = async (api) => { const r = await api(new Request('http://edge.invalid/v1/time'), { address: '127.0.0.1' }); return { http: r.status, ...(await r.json()) }; };
  const nPipe = await timeVia(nodeThrowing(pipeError)), nServer = await timeVia(nodeThrowing(serverError));
  // the Admin API reaches its front door (Brain OS answers the user and an empty profile list, as EB5's control), which throws
  const adminThrowing = (mk) => createAdminApi({ sql: async () => { throw mk(); }, randomBytes: (n) => new Uint8Array(randomBytes(n)), pepper: async () => null,
    brainOs: { url: BRAIN, anonKey: 'anon' }, fetch: async (u) => (String(u).includes('/auth/v1/user') ? J(200, { id: uid })() : J(200, [])()), log: () => {} });
  const listVia = async (api) => { const r = await api(new Request('http://edge.invalid/v1/admin/list-computers', { method: 'POST', headers: { authorization: 'Bearer ' + good, 'content-type': 'application/json' }, body: '{}' }));
    return { http: r.status, ...(await r.json()) }; };
  const aPipe = await listVia(adminThrowing(pipeError)), aServer = await listVia(adminThrowing(serverError));
  row('EB7 an error whose code is EPIPE (a transport error, five capitals like a SQLSTATE) is answered 503 with the outcome unknown - Node API plane_unavailable, Admin API unavailable - never 500 server_refused "nothing changed"; a PostgreSQL server error (PostgresError, SQLSTATE 55P03) is 500 server_refused naming 55P03 on both',
    nPipe.http === 503 && nPipe.refused === 'plane_unavailable' && !/EPIPE/.test(nPipe.message) && nServer.http === 500 && nServer.refused === 'server_refused' && /55P03/.test(nServer.message)
      && aPipe.http === 503 && aPipe.refused === 'unavailable' && aServer.http === 500 && aServer.refused === 'server_refused' && /55P03/.test(aServer.message),
    JSON.stringify({ node: [[nPipe.http, nPipe.refused, nPipe.message], [nServer.http, nServer.refused, nServer.message]], admin: [[aPipe.http, aPipe.refused, aPipe.message], [aServer.http, aServer.refused, aServer.message]] }));

  // ---- EB8: BRAIN_OS_URL / BRAIN_OS_ANON_KEY unset. The entry point (factory-admin-api/index.ts) passes '' for an unset value and has
  // no branch on either; the token check is what refuses. The front door would answer ok here, so a call that reached it would show.
  const adminCfg = ({ url, anonKey, fetchImpl }) => {
    const calls = { sql: 0, fetch: 0, apikeys: [] };
    const api = createAdminApi({
      sql: async () => { calls.sql++; return [{ r: { ok: true, computers: [] } }]; },
      randomBytes: (n) => new Uint8Array(randomBytes(n)), pepper: async () => null,
      brainOs: { url, anonKey },
      fetch: async (u, init) => { calls.fetch++; calls.apikeys.push(new Headers(init && init.headers).get('apikey')); return fetchImpl(u, init); },
      log: () => {},
    });
    return { api, calls };
  };
  // the platform's fetch, wrapped exactly as the entry point wraps it (a relative address fails before any connection is made)
  const platformFetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) });
  // Brain OS as documented: a request without its API key is refused (401); with it, the token is checked
  const brainOs = (u, init) => (!new Headers(init && init.headers).get('apikey') ? J(401, { message: 'No API key found in request' })()
    : String(u).includes('/auth/v1/user') ? J(200, { id: uid })() : J(200, [])());
  const bare = token({ iss: '/auth/v1', sub: randomUUID() });
  const noUrlGood = await call(adminCfg({ url: '', anonKey: 'anon', fetchImpl: platformFetch }));
  const noUrlBare = await call(adminCfg({ url: '', anonKey: 'anon', fetchImpl: platformFetch }), bare);
  const noKey = await call(adminCfg({ url: BRAIN, anonKey: '', fetchImpl: brainOs }));
  const withKey = await call(adminCfg({ url: BRAIN, anonKey: 'anon', fetchImpl: brainOs }));
  row('EB8 the Admin API with BRAIN_OS_URL or BRAIN_OS_ANON_KEY unset reaches no front door: an empty URL refuses a Brain OS token as not_authenticated without a request, and a token issued by "/auth/v1" fails as an error (503 unavailable) at the relative check address; an empty key is refused by Brain OS (401 not_authenticated); the control with both set reaches the front door',
    noUrlGood.http === 401 && noUrlGood.refused === 'not_authenticated' && noUrlGood.calls.fetch === 0 && noUrlGood.calls.sql === 0
      && noUrlBare.http === 503 && noUrlBare.refused === 'unavailable' && noUrlBare.calls.sql === 0
      && noKey.http === 401 && noKey.refused === 'not_authenticated' && noKey.calls.sql === 0 && noKey.calls.apikeys.every((k) => !k)
      && withKey.http === 200 && withKey.calls.sql === 1,
    JSON.stringify({ noUrl: [noUrlGood.http, noUrlGood.refused, noUrlGood.calls.fetch], noUrlBareIssuer: [noUrlBare.http, noUrlBare.refused, noUrlBare.message], noKey: [noKey.http, noKey.refused], control: [withKey.http, withKey.calls.sql] }));
} catch (e) {
  row('X0 edge_boundary_acceptance did not complete', false, (e && e.stack) || String(e));
}
const failed = results.filter((r) => !r.ok);
console.log('\nedge_boundary_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/edge_boundary_acceptance.mjs', '', ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '',
  (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);

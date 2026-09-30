#!/usr/bin/env node
// L2-F4 / L3-F4 (S-6, AC-8, P-4; CLAUDE.md §6: a gate refusing whole requests is observed on real requests) - THE PEER ADDRESS UNDER THE EDGE'S
// ENGINE, MEASURED ON THE CLOSEST RUNTIME AVAILABLE HERE: Deno 2.5.6's Deno.serve on a direct TCP connection, serving the committed
// factory-node-api/index.ts as it is (its withPeer wiring, its TLS verify-full database connection) against a disposable v1 plane.
//   EP1  GET /factory-node-api/v1/time answers 200 JSON through the whole chain (Deno.serve -> withPeer -> the handler -> TLS verify-full
//        to the plane as factory_node_api -> node_time)
//   EP2  a start from each of two local client addresses is recorded under that address (two peer_ip values)
//   EP3  once one address has 20 attempts in the hour, its next start is rate_limited_ip; the second address still gets an answer
//   EP4  a start carrying five client-address request headers (203.0.113.x values) is recorded under its TCP peer; no header value is
//        recorded
//   EP5  what Deno.serve hands the handler (info.remoteAddr) and what peerOf makes of it, for an IPv4 client, an IPv6 client, and a unix
//        socket listener (recorded as NOT MEASURABLE HERE when this platform's Deno cannot serve one)
//   EP6  factory-admin-api/index.ts as committed, BRAIN_OS_URL unset: a Brain OS token is refused 401 not_authenticated and a token
//        issued by the bare path "/auth/v1" fails as an error at the relative check address (503 unavailable); no front door runs
//   EP7  the same entry point, BRAIN_OS_ANON_KEY unset: Brain OS refuses the check (401 not_authenticated); no front door runs
//   EP8  the control: with both set, the same request reaches the front door (a factory_admin_api session appears on the plane)
//   (EP6-EP8 measure under Deno what edge_boundary EB8 shows under Node's fetch, G11; a developer Brain OS stub stands in for Brain OS)
// WHAT THIS IS NOT: the hosted Supabase Edge runtime behind its gateway. What that runtime reports is measured only on a deployed
// function (a founder action, CLAUDE.md §8), and the S-6 question it may raise is change request CR-015.
// Needs openssl (Git for Windows ships it) and Deno (npx --yes deno@2.5.6). usage: node qa/factory/v1/edge_peer_acceptance.mjs [--evidence <file>]
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, startV1Plane, connect } from './plane.mjs';
import { recorder } from './flows.mjs';
import { ed25519 } from './fixtures.mjs';
import { startBrainOsStub } from './brainos_stub.mjs';

const { results, row } = recorder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FN = join(ROOT, 'supabase', 'control-plane', 'edge', 'supabase', 'functions');
const pairing = await import(pathToFileURL(join(FN, '_shared', 'pairing.ts')).href);
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const b64u = (b) => Buffer.from(b).toString('base64url');
const measured = { runtime: 'Deno CLI 2.5.6 Deno.serve, direct TCP peer (DENO_SERVE_ADDRESS on loopback); NOT the hosted Supabase Edge runtime behind its gateway' };
const dir = mkdtempSync(join(tmpdir(), 'bf-edge-peer-'));
const f = (n) => join(dir, n).replace(/\\/g, '/');
const procs = [];
let plane = null;
let brain = null;
const post = (port, path, body, { localAddress, family, host = '127.0.0.1', headers = {} } = {}) => new Promise((resolve, reject) => {
  const data = Buffer.from(JSON.stringify(body));
  const req = request({ host, port, path, method: 'POST', localAddress, family, headers: { 'content-type': 'application/json', 'content-length': data.length, ...headers } }, (res) => {
    const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => { let j; try { j = JSON.parse(Buffer.concat(chunks).toString()); } catch { j = { raw: Buffer.concat(chunks).toString().slice(0, 200) }; } resolve({ ...j, http: res.statusCode }); });
  });
  req.on('error', reject); req.end(data);
});
const get = (port, path, { host = '127.0.0.1', localAddress, family } = {}) => new Promise((resolve, reject) => {
  const req = request({ host, port, path, method: 'GET', localAddress, family }, (res) => { const chunks = []; res.on('data', (c) => chunks.push(c));
    res.on('end', () => { let j; try { j = JSON.parse(Buffer.concat(chunks).toString()); } catch { j = { raw: Buffer.concat(chunks).toString().slice(0, 200) }; } resolve({ ...j, http: res.statusCode }); }); });
  req.on('error', reject); req.end();
});
try {
  // ---- Deno: the binary npx resolves for deno@2.5.6 (run directly, so the process it starts is the one stopped)
  const which = spawnSync('npx', ['--yes', 'deno@2.5.6', 'eval', 'console.log(Deno.execPath())'], { encoding: 'utf8', shell: true, timeout: 240000, windowsHide: true });
  const denoExe = (which.stdout || '').trim().split(/\r?\n/).pop();
  const ver = spawnSync(denoExe, ['--version'], { encoding: 'utf8', windowsHide: true });
  measured.deno = (ver.stdout || '').split(/\r?\n/)[0];
  if (!/^deno 2\.5\.6\b/.test(measured.deno || '')) throw new Error('Deno 2.5.6 is not available: ' + (which.stderr || '').slice(-400));

  // ---- the plane, with TLS for the Edge's verify-full connection: a throwaway CA and a certificate for "localhost"
  plane = await startV1Plane();
  const ssl = (args) => execFileSync('openssl', args, { stdio: 'ignore', cwd: dir });
  ssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('ca.key'), '-out', f('ca.crt'), '-days', '1', '-subj', '/CN=qa-edge-peer-ca']);
  ssl(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('server.key'), '-out', f('server.csr'), '-subj', '/CN=localhost']);
  writeFileSync(join(dir, 'ext.cnf'), 'subjectAltName=DNS:localhost\n');
  ssl(['x509', '-req', '-in', f('server.csr'), '-CA', f('ca.crt'), '-CAkey', f('ca.key'), '-CAcreateserial', '-out', f('server.crt'), '-days', '1', '-extfile', f('ext.cnf')]);
  const sup = await connect(plane.superUrl);
  try {
    await sup.query(`alter system set ssl_cert_file = '${f('server.crt')}'`);
    await sup.query(`alter system set ssl_key_file = '${f('server.key')}'`);
    await sup.query(`alter system set ssl = on`);
    await sup.query('select pg_reload_conf()');
  } finally { await sup.end(); }
  await sleep(800);
  const nodeUrl = new URL(plane.nodeApiUrl); nodeUrl.hostname = 'localhost';
  const pepper = randomBytes(32).toString('base64');

  // ---- the UNMODIFIED entry point under Deno, listening on loopback
  const port = await freePort();
  const deno = spawn(denoExe, ['run', '--allow-net', '--allow-env', '--allow-read', '--allow-sys', join(FN, 'factory-node-api', 'index.ts')], {
    cwd: dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DENO_SERVE_ADDRESS: 'tcp:127.0.0.1:' + port, FACTORY_NODE_DB_URL: nodeUrl.toString(), FACTORY_DB_CA_PEM: readFileSync(join(dir, 'ca.crt'), 'utf8'),
      FACTORY_PAIRING_PEPPER: pepper } });
  procs.push(deno);
  let denoLog = ''; deno.stdout.on('data', (c) => { denoLog += c; }); deno.stderr.on('data', (c) => { denoLog += c; });
  let t = null;
  for (let i = 0; i < 240 && !(t && t.http); i++) { await sleep(500); t = await get(port, '/factory-node-api/v1/time').catch(() => null); }
  measured.listen = (/Listening on [^\s]+/.exec(denoLog) || [''])[0];
  row('EP1 factory-node-api/index.ts as committed, served by Deno 2.5.6: GET /factory-node-api/v1/time is 200 JSON (Deno.serve -> withPeer -> the handler -> TLS verify-full to the plane as factory_node_api -> node_time)',
    t && t.http === 200 && t.ok === true && typeof t.server_time === 'string' && /127\.0\.0\.1/.test(measured.listen), JSON.stringify({ time: t, listen: measured.listen, log: t && t.http === 200 ? undefined : denoLog.slice(-800) }));

  // ---- EP2-EP4 through the real entry point
  const sup2 = await connect(plane.superUrl);
  try {
    const start = (localAddress, headers = {}) => post(port, '/factory-node-api/v1/enroll/start',
      { code: pairing.generateCode((n) => new Uint8Array(randomBytes(n))).display, public_key: b64u(ed25519().publicKey) }, { localAddress, headers });
    const peers = async () => (await sup2.query(`select host(peer_ip) ip, count(*)::int n, array_agg(distinct outcome) o from factory.pairing_attempts group by 1 order by 1`)).rows;
    const e2a = await start('127.0.0.2'), e2b = await start('127.0.0.3');
    const p2 = await peers();
    row('EP2 a start from 127.0.0.2 and one from 127.0.0.3 are recorded under those two addresses - the address Deno.serve reports for a direct TCP peer',
      e2a.refused === 'invalid_code' && e2b.refused === 'invalid_code' && p2.some((r) => r.ip === '127.0.0.2') && p2.some((r) => r.ip === '127.0.0.3'), JSON.stringify(p2));
    let lastA = null;
    for (let i = 1; i < 20; i++) lastA = await start('127.0.0.2');
    const over = await start('127.0.0.2'), otherB = await start('127.0.0.3');
    row('EP3 with 20 attempts of 127.0.0.2 in the hour, its next start is rate_limited_ip; a start from 127.0.0.3 is still judged (invalid_code)',
      lastA && lastA.refused === 'invalid_code' && over.http === 429 && over.refused === 'rate_limited_ip' && otherB.refused === 'invalid_code', JSON.stringify([lastA && lastA.refused, over.refused, otherB.refused]));
    const forged = await start('127.0.0.4', { 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.8', forwarded: 'for=203.0.113.9', 'cf-connecting-ip': '203.0.113.10', 'true-client-ip': '203.0.113.11' });
    const p4 = await peers();
    row('EP4 a start sent from 127.0.0.4 with five client-address request headers set to 203.0.113.x values is recorded under 127.0.0.4, and no 203.0.113.x value appears in pairing_attempts',
      forged.refused === 'invalid_code' && p4.some((r) => r.ip === '127.0.0.4' && r.n === 1) && !p4.some((r) => /^203\.0\.113\./.test(r.ip || '')), JSON.stringify(p4));
  } finally { await sup2.end(); }

  // ---- EP5: the raw remoteAddr Deno.serve hands a handler, and peerOf's reading of it
  writeFileSync(join(dir, 'probe.ts'), `
import { peerOf } from ${JSON.stringify(pathToFileURL(join(FN, '_shared', 'peer.ts')).href)};
const handler = (req: Request, info: Deno.ServeHandlerInfo) => {
  if (new URL(req.url).pathname === '/quit') { setTimeout(() => Deno.exit(0), 50); return new Response('bye'); }
  return new Response(JSON.stringify({ remoteAddr: info.remoteAddr, peer: peerOf(info) }), { headers: { 'content-type': 'application/json' } });
};
const s4 = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen: () => {} }, handler);
let s6: { addr: Deno.Addr } | null = null, v6error = null;
try { s6 = Deno.serve({ hostname: '::1', port: 0, onListen: () => {} }, handler); } catch (e) { v6error = String(e); }
let unix: Record<string, unknown>;
try {
  const path = ${JSON.stringify(f('peer.sock'))};
  Deno.serve({ path, onListen: () => {} }, handler);
  const conn = await Deno.connect({ transport: 'unix', path });
  await conn.write(new TextEncoder().encode('GET /x HTTP/1.1\\r\\nHost: x\\r\\nConnection: close\\r\\n\\r\\n'));
  let text = ''; const buf = new Uint8Array(4096);
  for (;;) { const n = await conn.read(buf); if (n === null) break; text += new TextDecoder().decode(buf.subarray(0, n)); }
  unix = { measurable: true, echoed: JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) };
} catch (e) { unix = { measurable: false, error: (e instanceof Error ? e.name + ': ' + e.message : String(e)).slice(0, 200) }; }
console.log(JSON.stringify({ v4: (s4.addr as Deno.NetAddr).port, v6: s6 ? (s6.addr as Deno.NetAddr).port : null, v6error, unix }));
`);
  const probe = spawn(denoExe, ['run', '--allow-net', '--allow-read', '--allow-write', '--unstable-net', join(dir, 'probe.ts')], { cwd: dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(probe);
  let probeOut = '';
  probe.stdout.on('data', (c) => { probeOut += c; }); probe.stderr.on('data', (c) => { probeOut += c; });
  let info = null;
  for (let i = 0; i < 240 && !info; i++) { await sleep(250); const line = probeOut.split(/\r?\n/).find((l) => l.startsWith('{"v4"')); if (line) info = JSON.parse(line); }
  if (!info) throw new Error('the Deno probe printed nothing: ' + probeOut.slice(-600));
  const v4 = await get(info.v4, '/x', { localAddress: '127.0.0.7' });
  const v6 = info.v6 ? await get(info.v6, '/x', { host: '::1', family: 6, localAddress: '::1' }).catch((e) => ({ error: String(e) })) : { error: info.v6error };
  measured.ipv4 = v4; measured.ipv6 = v6; measured.unix = info.unix;
  await get(info.v4, '/quit').catch(() => {});
  const unixOk = info.unix.measurable ? info.unix.echoed && info.unix.echoed.peer && info.unix.echoed.peer.address === '' : /not supported|unsupported|NotSupported|os error|Unix|path/i.test(info.unix.error || '');
  row('EP5 Deno.serve hands a direct TCP handler { transport: "tcp", hostname: <the client address>, port }: IPv4 127.0.0.7 -> peer 127.0.0.7; IPv6 ::1 -> peer ::1; a unix-socket listener gives no hostname -> no usable peer (or, where this platform\'s Deno cannot serve one, NOT MEASURABLE HERE - the harness rows PE2 stand in)',
    v4.remoteAddr && v4.remoteAddr.transport === 'tcp' && v4.remoteAddr.hostname === '127.0.0.7' && v4.peer.address === '127.0.0.7'
      && v6.remoteAddr && v6.remoteAddr.hostname === '::1' && v6.peer.address === '::1' && unixOk,
    JSON.stringify({ ipv4: v4, ipv6: v6, unix: info.unix }));

  // ---- EP6-EP8: the Admin API entry point as committed, BRAIN_OS_URL or BRAIN_OS_ANON_KEY unset (G11). The entry point hands both
  // values to the token check and tests neither; no caller passes the check, so no front door runs - observed on the plane as no
  // factory_admin_api session at all (the pool connects on its first query). EP8 is the control: the same request with both set
  // opens one.
  brain = await startBrainOsStub();
  const adminUrl = new URL(plane.adminApiUrl); adminUrl.hostname = 'localhost';
  const startAdmin = async (extra) => {
    const aport = await freePort();
    const env = { ...process.env, DENO_SERVE_ADDRESS: 'tcp:127.0.0.1:' + aport, FACTORY_ADMIN_DB_URL: adminUrl.toString(),
      FACTORY_DB_CA_PEM: readFileSync(join(dir, 'ca.crt'), 'utf8'), FACTORY_PAIRING_PEPPER: pepper, ...extra };
    for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
    const proc = spawn(denoExe, ['run', '--allow-net', '--allow-env', '--allow-read', '--allow-sys', join(FN, 'factory-admin-api', 'index.ts')],
      { cwd: dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    procs.push(proc);
    let log = ''; proc.stdout.on('data', (c) => { log += c; }); proc.stderr.on('data', (c) => { log += c; });
    // ready once it answers a route it does not have (404 no_such_route: decided before any token check)
    let r = null;
    for (let i = 0; i < 240 && !(r && r.http); i++) { await sleep(500); r = await get(aport, '/factory-admin-api/v1/nothing').catch(() => null); }
    return { port: aport, proc, ready: !!(r && r.http === 404 && r.refused === 'no_such_route'), log: () => log.slice(-600) };
  };
  const listAs = (aport, tok) => post(aport, '/factory-admin-api/v1/admin/list-computers', {}, { headers: { authorization: 'Bearer ' + tok } });
  const adminSessions = async () => { const c = await connect(plane.superUrl); try { return (await c.query(`select count(*)::int n from pg_stat_activity where usename = 'factory_admin_api'`)).rows[0].n; } finally { await c.end(); } };
  const founderP = brain.persona('founder');
  const bareTok = [b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), b64u(JSON.stringify({ iss: '/auth/v1', sub: randomUUID(), role: 'authenticated' })), b64u(randomBytes(16))].join('.');
  const noUrl = await startAdmin({ BRAIN_OS_URL: undefined, BRAIN_OS_ANON_KEY: brain.anonKey });
  const nuTok = noUrl.ready ? await listAs(noUrl.port, founderP.token) : null;
  const nuBare = noUrl.ready ? await listAs(noUrl.port, bareTok) : null;
  noUrl.proc.kill();
  const noKey = await startAdmin({ BRAIN_OS_URL: brain.url, BRAIN_OS_ANON_KEY: undefined });
  const nkTok = noKey.ready ? await listAs(noKey.port, founderP.token) : null;
  noKey.proc.kill();
  const sessionsUnset = await adminSessions();
  row('EP6 factory-admin-api/index.ts as committed, served by Deno 2.5.6 with BRAIN_OS_URL unset: a Brain OS token is refused 401 not_authenticated, a token issued by the bare path "/auth/v1" fails as an error at the relative check address (503 unavailable), and no front door runs (no factory_admin_api session on the plane)',
    noUrl.ready && nuTok && nuTok.http === 401 && nuTok.refused === 'not_authenticated' && nuBare && nuBare.http === 503 && nuBare.refused === 'unavailable' && sessionsUnset === 0,
    JSON.stringify({ ready: noUrl.ready, token: nuTok && [nuTok.http, nuTok.refused], bare: nuBare && [nuBare.http, nuBare.refused, nuBare.message], adminSessions: sessionsUnset, log: noUrl.ready ? undefined : noUrl.log() }));
  row('EP7 the same entry point with BRAIN_OS_ANON_KEY unset: Brain OS refuses the token check sent without its key, the answer is 401 not_authenticated, and no front door runs',
    noKey.ready && nkTok && nkTok.http === 401 && nkTok.refused === 'not_authenticated' && sessionsUnset === 0,
    JSON.stringify({ ready: noKey.ready, token: nkTok && [nkTok.http, nkTok.refused], adminSessions: sessionsUnset, log: noKey.ready ? undefined : noKey.log() }));
  const both = await startAdmin({ BRAIN_OS_URL: brain.url, BRAIN_OS_ANON_KEY: brain.anonKey });
  const bTok = both.ready ? await listAs(both.port, founderP.token) : null;
  const sessionsSet = await adminSessions();
  both.proc.kill();
  row('EP8 the control for EP6 and EP7: with both set, the same request passes the token check and reaches the front door (an answer from the plane, not a token refusal; a factory_admin_api session is open on the plane afterwards)',
    both.ready && bTok && bTok.refused !== 'not_authenticated' && bTok.refused !== 'unavailable' && typeof bTok.http === 'number' && sessionsSet >= 1,
    JSON.stringify({ ready: both.ready, answer: bTok && [bTok.http, bTok.ok, bTok.refused], adminSessions: sessionsSet, log: both.ready ? undefined : both.log() }));
} catch (e) {
  row('X0 edge_peer_acceptance did not complete', false, (e && e.stack) || String(e));
} finally {
  for (const p of procs) { try { p.kill(); } catch { /* gone */ } }
  await sleep(300);
  if (brain) await brain.stop().catch(() => {});
  if (plane) await plane.stop();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\nMEASURED ' + JSON.stringify(measured));
console.log('\nedge_peer_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/edge_peer_acceptance.mjs', 'MEASURED ' + JSON.stringify(measured), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);

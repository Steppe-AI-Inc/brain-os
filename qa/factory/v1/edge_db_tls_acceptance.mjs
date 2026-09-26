#!/usr/bin/env node
// S-10 "TLS is verify-full" for the Edge Functions' database connection (_shared/db.ts), measured under DENO - the Edge runtime's
// engine - with the postgres.js version the functions import (npm:postgres@3.4.9), against a disposable PostgreSQL 18 that accepts
// TLS only (hostssl; hostnossl rejected) with a certificate for "localhost" issued by a throwaway CA.
//   T1 the pinned CA and the host the certificate names: connects, and pg_stat_ssl says the session is TLS
//   T2 another CA pinned: refused - the server's certificate does not chain to it
//   T3a an IP-literal host is refused by dbRefusal before any socket - postgres.js sends no servername for an IP, so the certificate's
//       name would go unchecked (the control shows a "localhost" certificate accepted at 127.0.0.1 when the refusal is bypassed)
//   T3b the server presents a certificate from the right CA for ANOTHER name (reloaded in place): the connection to "localhost" is refused
//   T4 the control: 'require' (what a plain URL gives) connects to the same server whatever CA - so T2 and T3 are refused BY the check
//   T5 dbRefusal refuses before any socket: no CA, a non-PEM CA, the production ref, a non-postgresql URL; a good pair passes
//   T6 both entry points connect only through dbRefusal / dbOptions (the static wiring), and name FACTORY_DB_CA_PEM
// Disposable: fresh initdb in a temp dir, certificates valid one day, everything removed on exit. Needs openssl (Git for Windows ships
// it) and Deno (run as `npx --yes deno@2.5.6`, the version the static gate uses). usage: node qa/factory/v1/edge_db_tls_acceptance.mjs
import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { recorder } from './flows.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SHARED = join(ROOT, 'supabase', 'control-plane', 'edge', 'supabase', 'functions', '_shared');
const DENO = ['--yes', 'deno@2.5.6'];
const { results, row } = recorder();
const dir = mkdtempSync(join(tmpdir(), 'bf-edge-tls-'));
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const f = (n) => join(dir, n).replace(/\\/g, '/');
const ssl = (args) => execFileSync('openssl', args, { stdio: 'ignore', cwd: dir });
let pg = null;
try {
  // ---- a throwaway CA, a "localhost" server certificate it issued, and an unrelated CA
  ssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('ca.key'), '-out', f('ca.crt'), '-days', '1', '-subj', '/CN=qa-factory-db-ca']);
  ssl(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('server.key'), '-out', f('server.csr'), '-subj', '/CN=localhost']);
  writeFileSync(join(dir, 'ext.cnf'), 'subjectAltName=DNS:localhost\n');
  ssl(['x509', '-req', '-in', f('server.csr'), '-CA', f('ca.crt'), '-CAkey', f('ca.key'), '-CAcreateserial', '-out', f('server.crt'), '-days', '1', '-extfile', f('ext.cnf')]);
  ssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('other.key'), '-out', f('other.crt'), '-days', '1', '-subj', '/CN=another-ca']);

  // ---- PostgreSQL that speaks TLS only
  const port = await freePort();
  const password = randomBytes(12).toString('hex');
  pg = new EmbeddedPostgres({ databaseDir: join(dir, 'data'), user: 'postgres', password, port, persistent: false, onLog: () => {}, onError: () => {},
    postgresFlags: ['-c', 'ssl=on', '-c', 'ssl_cert_file=' + f('server.crt'), '-c', 'ssl_key_file=' + f('server.key'), '-c', 'listen_addresses=127.0.0.1,::1'] });
  await pg.initialise();
  writeFileSync(join(dir, 'data', 'pg_hba.conf'), ['hostssl all all 127.0.0.1/32 scram-sha-256', 'hostssl all all ::1/128 scram-sha-256',
    'hostnossl all all 0.0.0.0/0 reject', 'hostnossl all all ::/0 reject', ''].join('\n'));
  await pg.start();

  // ---- the checks, run by Deno on the real _shared/db.ts
  const probe = join(dir, 'probe.mjs');
  writeFileSync(probe, `
import postgres from 'npm:postgres@3.4.9';
import { dbOptions, dbRefusal } from ${JSON.stringify(pathToFileURL(join(SHARED, 'db.ts')).href)};
const ca = Deno.readTextFileSync(Deno.env.get('QA_CA'));
const other = Deno.readTextFileSync(Deno.env.get('QA_OTHER'));
const url = (host) => 'postgresql://postgres:' + Deno.env.get('QA_PW') + '@' + host + ':' + Deno.env.get('QA_PORT') + '/postgres';
async function attempt(host, opts) {
  const sql = postgres(url(host), { ...opts, max: 1, connect_timeout: 8, onnotice: () => {} });
  try { const r = await sql\`select ssl, version from pg_stat_ssl where pid = pg_backend_pid()\`; return { ok: true, ssl: r[0].ssl, version: r[0].version }; }
  catch (e) { return { ok: false, error: String(e && (e.code || e.message)).slice(0, 160) }; }
  finally { await sql.end({ timeout: 1 }).catch(() => {}); }
}
const mode = Deno.env.get('QA_MODE');
if (mode === 'reload') { const sql = postgres(url('localhost'), { prepare: false, ssl: 'require', max: 1 }); await sql\`select pg_reload_conf()\`; await sql.end(); console.log('{"reloaded":true}'); Deno.exit(0); }
if (mode === 'mismatch') { console.log(JSON.stringify({ t3b: await attempt('localhost', dbOptions(ca, 1)), control: await attempt('localhost', { prepare: false, ssl: 'require' }) })); Deno.exit(0); }
const out = {
  t1: await attempt('localhost', dbOptions(ca, 1)),
  t2: await attempt('localhost', dbOptions(other, 1)),
  t3a: { refusal: dbRefusal(url('127.0.0.1'), ca), refusal6: dbRefusal(url('[::1]'), ca), bypassed: await attempt('127.0.0.1', dbOptions(ca, 1)) },
  t4: await attempt('localhost', { prepare: false, ssl: 'require' }),
  t5: {
    noCa: dbRefusal(url('localhost'), ''), notPem: dbRefusal(url('localhost'), 'not a certificate'),
    prod: dbRefusal('postgresql://x:y@db.pvphxgrtdfrudejjhzjk.supabase.co:5432/postgres', ca), notPg: dbRefusal('https://example.invalid', ca),
    good: dbRefusal(url('localhost'), ca),
  },
};
console.log(JSON.stringify(out));
`);
  const deno = (mode) => {
    const r = spawnSync('npx', [...DENO, 'run', '--allow-net', '--allow-read', '--allow-env', '--allow-sys', probe], { cwd: dir, encoding: 'utf8', shell: true, timeout: 240000, windowsHide: true,
      env: { ...process.env, QA_CA: f('ca.crt'), QA_OTHER: f('other.crt'), QA_PW: password, QA_PORT: String(port), QA_MODE: mode } });
    const line = (r.stdout || '').trim().split(/\r?\n/).filter((l) => l.startsWith('{')).pop();
    if (!line) throw new Error('the Deno probe (' + mode + ') printed no result (exit ' + r.status + '):\n' + (r.stdout || '').slice(-800) + '\n' + (r.stderr || '').slice(-1500));
    return JSON.parse(line);
  };
  const o = deno('main');
  // T3b: the same CA issues a certificate for another name; the server takes it on a reload
  ssl(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('wrong.key'), '-out', f('wrong.csr'), '-subj', '/CN=not-the-factory-db']);
  writeFileSync(join(dir, 'ext2.cnf'), 'subjectAltName=DNS:not-the-factory-db\n');
  ssl(['x509', '-req', '-in', f('wrong.csr'), '-CA', f('ca.crt'), '-CAkey', f('ca.key'), '-CAcreateserial', '-out', f('wrong.crt'), '-days', '1', '-extfile', f('ext2.cnf')]);
  writeFileSync(join(dir, 'server.crt'), readFileSync(join(dir, 'wrong.crt'))); writeFileSync(join(dir, 'server.key'), readFileSync(join(dir, 'wrong.key')));
  const reloaded = deno('reload');
  const m = deno('mismatch');
  row('T1 the pinned CA and the host the certificate names: connects over TLS (pg_stat_ssl ' + (o.t1.ssl ? o.t1.version : '-') + ')', o.t1.ok && o.t1.ssl === true, JSON.stringify(o.t1));
  row('T2 another CA pinned: refused (the server certificate does not chain to it)', !o.t2.ok, JSON.stringify(o.t2));
  row('T3a an IP-literal host (IPv4 and IPv6) is refused before any socket; bypassed, a "localhost" certificate WOULD be accepted at 127.0.0.1 (why the refusal exists)',
    /IP address/.test(o.t3a.refusal || '') && /IP address/.test(o.t3a.refusal6 || '') && o.t3a.bypassed.ok === true, JSON.stringify(o.t3a));
  row('T3b a certificate from the right CA for ANOTHER name: the connection to "localhost" is refused (the name is checked); \'require\' still connects (control)',
    reloaded.reloaded === true && !m.t3b.ok && m.control.ok === true, JSON.stringify(m));
  row('T4 the control: \'require\' - what a plain URL gives - connects to the same server with no CA at all, so T2 / T3b are refused by the verification', o.t4.ok && o.t4.ssl === true, JSON.stringify(o.t4));
  row('T5 dbRefusal refuses before any socket: no CA, a non-PEM CA, the production ref, a non-postgresql URL; a good URL and CA pass',
    !!o.t5.noCa && !!o.t5.notPem && /production/.test(o.t5.prod || '') && !!o.t5.notPg && o.t5.good === null, JSON.stringify(o.t5));

  // ---- T6: the entry points' wiring
  const entry = (n) => readFileSync(join(ROOT, 'supabase', 'control-plane', 'edge', 'supabase', 'functions', n, 'index.ts'), 'utf8');
  const wired = ['factory-node-api', 'factory-admin-api'].map((n) => { const s = entry(n); return /import \{ dbOptions, dbRefusal \} from '\.\.\/_shared\/db\.ts'/.test(s) && /Deno\.env\.get\('FACTORY_DB_CA_PEM'\)/.test(s)
    && /dbRefusal\(dbUrl, caPem\)/.test(s) && /postgres\(dbUrl, dbOptions\(caPem\)\)/.test(s) && !/ssl:\s*'require'/.test(s); });
  row('T6 both entry points connect only through dbRefusal / dbOptions with FACTORY_DB_CA_PEM (no ssl: \'require\' anywhere)', wired.every(Boolean), JSON.stringify(wired));
} catch (e) {
  row('X0 edge db tls', false, e && e.stack || String(e));
} finally {
  if (pg) await pg.stop().catch(() => {});
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\nedge_db_tls_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length ? 1 : 0);

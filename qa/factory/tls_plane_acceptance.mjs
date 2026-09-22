#!/usr/bin/env node
// THE NETWORK PATH TO A SHARED PLANE, PROVED ON ONE MACHINE: TLS, hostssl-only, the accessor's fail-closed URL rule.
//
// A two-machine plane is reached over a network address, not loopback. Everything the two-machine pack promises about
// that path can be proved here without a second computer, by serving a DISPOSABLE PostgreSQL 18 on this machine's own
// LAN address (not 127.0.0.1) with ssl=on, a pg_hba that accepts hostssl only and REJECTS hostnossl, and driving it
// through the real node path over that address. The only thing a second machine adds is a second hostname, and that is
// what two_machine_failover.mjs measures.
//
//   T1  the accessor refuses a plaintext URL to the LAN address BEFORE a socket opens
//   T2  the SERVER refuses a plaintext session on the LAN address (pg_hba hostnossl ... reject)
//   T3  node.mjs health passes over sslmode=require on the LAN address, in its own process
//   T4  plane-health.mjs passes there too and reports TLS IN USE on the backend, the role's attributes, DDL refused
//   T5  sslmode=verify-full with the server certificate as sslrootcert connects; with the wrong root it does not
//   T6  a worker process dies mid-claim over TLS and a second worker process resumes it (the claim path over the network)
//   T7  the accessor refuses the superuser over TLS on the LAN address (least privilege is judged before TLS helps)
//
// Disposable by construction: fresh initdb in a temp dir, a random superuser password, certificate valid for one day,
// data directory removed on exit. Nothing here can reach a production host.
import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SCHEMA_DIR = join(ROOT, 'supabase', 'control-plane');
const NODE_MJS = join(ROOT, 'scripts', 'factory-runner', 'node.mjs');
const PLANE_HEALTH = join(ROOT, 'scripts', 'factory-runner', 'plane-health.mjs');
const WORKER = join(HERE, 'shared_pg_worker.mjs');

let pass = 0; const failures = [];
const check = (label, ok, detail) => { if (ok) { pass++; console.log('OK   ' + label); } else { failures.push(label); console.log('FAIL ' + label + (detail ? '\n       ' + String(detail).slice(0, 300) : '')); } };
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });
const child = (file, args, env) => spawnSync(process.execPath, [file, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 26 });

const lan = Object.values(networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal);
if (!lan) { console.log('no non-loopback IPv4 interface on this machine; the TLS path cannot be measured here'); process.exit(2); }
const LAN = lan.address;
console.log('this machine: ' + hostname() + ', LAN address ' + LAN + ' (the plane will listen there, not on loopback only)');

const dir = mkdtempSync(join(tmpdir(), 'factory-tls-pg-'));
const dataDir = join(dir, 'data');
const port = await freePort();
const superPassword = 'super_' + randomUUID().replace(/-/g, '').slice(0, 16);

// a certificate for the LAN address, valid one day, self-signed - the CLIENT decides whether to trust it (T5)
const crt = join(dir, 'server.crt').replace(/\\/g, '/'), key = join(dir, 'server.key').replace(/\\/g, '/');
const otherCrt = join(dir, 'other.crt').replace(/\\/g, '/'), otherKey = join(dir, 'other.key').replace(/\\/g, '/');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=' + LAN, '-addext', 'subjectAltName=IP:' + LAN], { stdio: 'ignore' });
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', otherKey, '-out', otherCrt, '-days', '1', '-subj', '/CN=not-the-plane'], { stdio: 'ignore' });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: superPassword, port, persistent: false,
  postgresFlags: ['-c', 'ssl=on', '-c', 'ssl_cert_file=' + crt, '-c', 'ssl_key_file=' + key, '-c', 'listen_addresses=127.0.0.1,' + LAN],
  onLog: () => {}, onError: () => {},
});
await pg.initialise();
// hostssl only on the network address; a plaintext session there is REJECTED by the server itself
appendFileSync(join(dataDir, 'pg_hba.conf'), '\n# tls_plane_acceptance\nhostssl all all ' + LAN + '/32 scram-sha-256\nhostnossl all all ' + LAN + '/32 reject\n');
await pg.start();
await pg.createDatabase('factory_control_plane');

const { default: pgLib } = await import('pg');
const superUrl = 'postgresql://postgres:' + encodeURIComponent(superPassword) + '@127.0.0.1:' + port + '/factory_control_plane';
const admin = new pgLib.Client({ connectionString: superUrl });
await admin.connect();
for (const f of readdirSync(SCHEMA_DIR).filter((x) => /^\d{3}_.*\.sql$/.test(x)).sort()) await admin.query(readFileSync(join(SCHEMA_DIR, f), 'utf8'));
const runnerPw = 'runner_' + randomUUID().replace(/-/g, '').slice(0, 16);
await admin.query("create role factory_runner with login nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit password '" + runnerPw + "'");
await admin.query('grant connect on database factory_control_plane to factory_runner');
await admin.query('grant usage on schema factory to factory_runner');
await admin.query('grant select, insert, update, delete on all tables in schema factory to factory_runner');
const woId = randomUUID();
await admin.query("insert into factory.work_orders (work_order_id, title, owned_surface, priority, status) values ($1, 'TLS-1 over the network', $2::text[], 'high', 'queued')", [woId, ['qa/factory/tls/' + woId.slice(0, 8)]]);
await admin.end();

// THE DRIVER'S RULES (pg 8.23 / pg-connection-string 2.14, measured): `require`, `prefer` and `verify-ca` are aliases of
// verify-full unless `uselibpqcompat=true`; verify-full checks the certificate chain against Node's CA bundle (or
// sslrootcert) AND the hostname - and pg does not hand an IP host to the identity check, so verify-full against an IP
// address fails as "Host: localhost". Hence, exactly:
//   DNS host, publicly trusted certificate   ?sslmode=verify-full
//   DNS host, provider's private CA          ?sslmode=verify-full&sslrootcert=<CA file on the node>
//   IP host on a private network, own cert   ?sslmode=verify-ca&sslrootcert=<cert file on the node>&uselibpqcompat=true
// This plane is an IP host with its own certificate, so the third form is what every row below drives.
const base = 'postgresql://factory_runner:' + encodeURIComponent(runnerPw) + '@' + LAN + ':' + port + '/factory_control_plane';
const plain = base;
const tls = base + '?sslmode=verify-ca&sslrootcert=' + encodeURIComponent(crt) + '&uselibpqcompat=true';
const tlsWrong = base + '?sslmode=verify-ca&sslrootcert=' + encodeURIComponent(otherCrt) + '&uselibpqcompat=true';
const verifyFullIp = base + '?sslmode=verify-full&sslrootcert=' + encodeURIComponent(crt);

try {
  // T1 the accessor, before any socket
  const t1 = child(NODE_MJS, ['health'], { FACTORY_RUNNER_PG_URL: plain });
  check('T1 the accessor refuses a plaintext URL to ' + LAN + ' before a socket opens (health exits 1, names the rule)',
    t1.status === 1 && /over a network with sslmode=\(none\)/.test(t1.stdout + t1.stderr), t1.stdout + t1.stderr);

  // T2 the server, when asked in the clear by a raw client (the accessor is bypassed on purpose here)
  let t2err = '';
  try { const c = new pgLib.Client({ connectionString: plain, ssl: false }); await c.connect(); await c.end(); } catch (e) { t2err = String(e.message); }
  check('T2 the SERVER rejects a plaintext session on ' + LAN + ' (pg_hba hostnossl reject)', /pg_hba|no encryption|reject/i.test(t2err), t2err || 'the plaintext session was ACCEPTED');

  // T3 node health over TLS on the network address, in its own process
  const t3 = child(NODE_MJS, ['health'], { FACTORY_RUNNER_PG_URL: tls, FACTORY_NODE_ROLE: 'verifier' });
  check('T3 node.mjs health passes over TLS (verify-ca + sslrootcert) on ' + LAN + ' and registers as verifier',
    t3.status === 0 && /TLS is requested for a REMOTE host/.test(t3.stdout) && /registered itself as verifier/.test(t3.stdout), t3.stdout + t3.stderr);

  // T4 plane health: TLS in use on the backend, role attributes, DDL refused, schema complete, clocks
  const t4 = child(PLANE_HEALTH, ['--role', 'verifier'], { FACTORY_RUNNER_PG_URL: tls, FACTORY_NODE_ROLE: 'verifier' });
  const t4out = t4.stdout + t4.stderr;
  check('T4 plane-health passes over TLS: TLS IN USE, no privileged attribute, DDL refused (42501), 001-003 applied, clocks',
    t4.status === 0 && /TLS is IN USE on this connection \(TLSv1\.[23]/.test(t4out) && /refuses DDL from the runner role \(42501\)/.test(t4out) && /PLANE HEALTHY/.test(t4out), t4out);

  // T5 the certificate chain is CHECKED: the plane's certificate as root connects (and the backend reports TLS), a different
  //    root is refused, and verify-full against an IP host is refused by the driver (which is why a DNS name is required for it)
  let okRight = false, errRight = '', okWrong = false, errWrong = '', okFullIp = false, errFullIp = '';
  try { const c = new pgLib.Client({ connectionString: tls }); await c.connect(); const r = await c.query('select ssl from pg_stat_ssl where pid = pg_backend_pid()'); okRight = r.rows[0].ssl === true; await c.end(); } catch (e) { errRight = String(e.message); }
  try { const c = new pgLib.Client({ connectionString: tlsWrong }); await c.connect(); okWrong = true; await c.end(); } catch (e) { errWrong = String(e.message); }
  try { const c = new pgLib.Client({ connectionString: verifyFullIp }); await c.connect(); okFullIp = true; await c.end(); } catch (e) { errFullIp = String(e.message); }
  check('T5 the chain is checked: the plane\'s certificate as sslrootcert connects over TLS; a different root is refused; verify-full on an IP host is refused by the driver (DNS name needed)',
    okRight && !okWrong && /self.signed|certificate|unable to verify|CERT/i.test(errWrong) && !okFullIp && /altnames|does not match|localhost/i.test(errFullIp),
    'right root: ' + (okRight ? 'ok' : errRight) + ' | wrong root: ' + (okWrong ? 'ACCEPTED' : errWrong) + ' | verify-full on IP: ' + (okFullIp ? 'ACCEPTED' : errFullIp));

  // T6 the claim path over the network: one process dies, another resumes
  const w1 = child(WORKER, ['node-tls-a', 'die', '5'], { FACTORY_RUNNER_PG_URL: tls });
  const died = /CLAIMED (\S+) (\S+)/.exec(w1.stdout);
  await new Promise((r) => setTimeout(r, 6500));
  const w2 = child(WORKER, ['node-tls-b', 'resume', '30'], { FACTORY_RUNNER_PG_URL: tls });
  const resumed = /CLAIMED (\S+) (\S+)/.exec(w2.stdout);
  check('T6 a worker dies mid-claim over TLS on ' + LAN + ' and a second process resumes it with the dead one\'s checkpoint',
    w1.status === 3 && died && died[2] === woId && w2.status === 0 && resumed && resumed[2] === woId && /PRIOR_CHECKPOINTS 1/.test(w2.stdout),
    'die: ' + (w1.stdout + w1.stderr).trim().slice(0, 200) + ' | resume: ' + (w2.stdout + w2.stderr).trim().slice(0, 200));

  // T7 the superuser over TLS is still refused by the accessor
  const t7 = child(NODE_MJS, ['health'], { FACTORY_RUNNER_PG_URL: 'postgresql://postgres:' + encodeURIComponent(superPassword) + '@' + LAN + ':' + port + '/factory_control_plane?sslmode=verify-ca&sslrootcert=' + encodeURIComponent(crt) + '&uselibpqcompat=true' });
  check('T7 the accessor refuses the superuser over TLS on the LAN address', t7.status === 1 && /superuser/.test(t7.stdout + t7.stderr), t7.stdout + t7.stderr);
} finally {
  try { await pg.stop(); } catch { /* down */ }
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows lock */ }
}

console.log('');
console.log('tls_plane_acceptance: ' + pass + ' passed, ' + failures.length + ' failed  (plane served on ' + LAN + ':' + port + ' with ssl=on, hostssl-only; disposable, removed)');
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }
// EXIT EXPLICITLY: the embedded server library can leave a handle open after stop(), and a suite that has printed its
// verdict but never exits hangs whatever runs it (the composer waited on this one for twenty minutes on 2026-09-23).
process.exit(0);

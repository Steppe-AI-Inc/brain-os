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
//   T6 both entry points connect only through dbRefusal / dbOptions (the static wiring), name FACTORY_DB_CA_PEM, and hand the driver
//      dbOptions(url, ca) as its ONLY argument - never the URL
//   T7-T9 (C2-S1) THE TARGET: the refusal is judged on what the driver is given, and the driver is given only what was read.
//      T7 the one form (postgresql://user:password@host:port/database) is read exactly - the host in lower case, the user and the
//         password decoded once - and postgres.js constructed as the entry points construct it holds that same target, no startup
//         parameter of the URL's, TLS verify-full with the pinned CA, and nothing from the environment (PGHOST / PGUSER / PGDATABASE /
//         PGPORT / PGPASSWORD name the production project during these rows)
//      T8 URLs that reach, or try to reach, the production project without spelling it in clear text - percent encoding, case, a tab
//         or a line break, wrappers, escaped characters, equivalent host forms, parser differences (a list of hosts, ?user=,
//         ?options=), other connection-string forms - are ALL refused, and dbOptions throws for each. The control hands the same URLs
//         to the driver AS the URL (the wiring this replaced): it reads many of them as the production project
//      T9 over the whole corpus no URL is both accepted and read by the driver as anything but what dbTarget read; every URL outside
//         the one form is refused with a reason that names what is wrong; what a URL leaves out is never taken from the environment
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

  // ---- the checks, run by Deno on the real _shared/db.ts. The driver is constructed as the entry points construct it: with
  // dbOptions(url, ca) as its ONLY argument. A control that goes around dbTarget writes the same five parts by hand (`by`)
  const REF = /PRODUCTION_REF = '([a-z]{20})'/.exec(readFileSync(join(SHARED, 'db.ts'), 'utf8'))[1];
  const probe = join(dir, 'probe.mjs');
  writeFileSync(probe, `
import postgres from 'npm:postgres@3.4.9';
import { dbOptions, dbRefusal, dbTarget, PRODUCTION_REF as REF } from ${JSON.stringify(pathToFileURL(join(SHARED, 'db.ts')).href)};
import { GOOD, ODD, adversarial, names, targetOf } from ${JSON.stringify(pathToFileURL(join(ROOT, 'qa', 'factory', 'v1', 'db_target_cases.mjs')).href)};
const ca = Deno.readTextFileSync(Deno.env.get('QA_CA'));
const other = Deno.readTextFileSync(Deno.env.get('QA_OTHER'));
const url = (host) => 'postgresql://postgres:' + Deno.env.get('QA_PW') + '@' + host + ':' + Deno.env.get('QA_PORT') + '/postgres';
const by = (host, ssl) => ({ host, port: Number(Deno.env.get('QA_PORT')), user: 'postgres', password: Deno.env.get('QA_PW'), database: 'postgres', prepare: false, ssl });
const verify = (pem) => ({ ca: pem, rejectUnauthorized: true });
async function attempt(options) {
  const sql = postgres({ ...options, max: 1, connect_timeout: 8, onnotice: () => {} });
  try { const r = await sql\`select ssl, version from pg_stat_ssl where pid = pg_backend_pid()\`; return { ok: true, ssl: r[0].ssl, version: r[0].version }; }
  catch (e) { return { ok: false, error: String(e && (e.code || e.message)).slice(0, 160) }; }
  finally { await sql.end({ timeout: 1 }).catch(() => {}); }
}
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const same = (a, b) => !!a && !!b && a.host === b.host && a.port === b.port && a.user === b.user && a.password === b.password && a.database === b.database;
const mode = Deno.env.get('QA_MODE');
if (mode === 'reload') { const sql = postgres({ ...by('localhost', 'require'), max: 1 }); await sql\`select pg_reload_conf()\`; await sql.end(); console.log('{"reloaded":true}'); Deno.exit(0); }
if (mode === 'mismatch') { console.log(JSON.stringify({ t3b: await attempt(dbOptions(url('localhost'), ca, 1)), control: await attempt(by('localhost', 'require')) })); Deno.exit(0); }
if (mode === 'target') {
  // (nothing connects in this mode: postgres.js opens no connection until a query, and none is sent)
  // the driver's own reading of what it is constructed with: as the entry points construct it, and - the control - handed the URL
  const given = (u) => postgres(dbOptions(u, ca)).options;
  const handedUrl = (u) => { try { return postgres(u, { prepare: false, ssl: verify(ca) }).options; } catch { return null; } };
  const t7 = GOOD.map(([what, u, want]) => {
    const refusal = dbRefusal(u, ca), read = dbTarget(u).target, o = refusal === null ? given(u) : null;
    const startup = o ? Object.keys(o.connection).filter((k) => k !== 'application_name') : null;
    return { what, ok: refusal === null && same(read, want) && !!o && same(targetOf(o), want) && startup.length === 0 && !!o.ssl && o.ssl.rejectUnauthorized === true && o.ssl.ca === ca && o.prepare === false,
      refusal, read: read && { ...read, password: read.password === want.password }, driver: o && { ...targetOf(o), password: o.pass === want.password }, startup };
  });
  const t8 = adversarial(REF).map(({ kind, what, url: u }) => {
    const refusal = dbRefusal(u, ca);
    return { kind, what, refused: refusal !== null, production: /production/.test(refusal || ''), threw: throws(() => dbOptions(u, ca)) };
  });
  const all = [...GOOD.map(([what, u]) => ({ what, u })), ...ODD.map(([what, u]) => ({ what, u })), ...adversarial(REF).map((x) => ({ what: x.what, u: x.url }))];
  const t9 = {
    urls: all.length,
    // accepted, yet the driver holds something else than what was read, or a target that names production
    wrong: all.filter(({ u }) => dbRefusal(u, ca) === null && !(same(targetOf(given(u)), dbTarget(u).target) && !names(given(u), REF, { password: true }) && Object.keys(given(u).connection).filter((k) => k !== 'application_name').length === 0)).map((x) => x.what),
    // refused, yet options are given
    given: all.filter(({ u }) => dbRefusal(u, ca) !== null && !throws(() => dbOptions(u, ca))).map((x) => x.what),
    accepted: all.filter(({ u }) => dbRefusal(u, ca) === null).length,
    odd: ODD.map(([what, u, why]) => ({ what, ok: why.test(dbRefusal(u, ca) || ''), refusal: dbRefusal(u, ca) })),
    // the controls: handed a URL that leaves a part out, the driver takes it from the environment (which names production here)
    env: { noUser: names(handedUrl('postgresql://db.example.net:5432/postgres'), REF), noHost: names(handedUrl('postgresql:///postgres'), REF), noDatabase: names(handedUrl('postgresql://api:pw@db.example.net:5432'), REF) },
  };
  console.log(JSON.stringify({ t7, t8, t9 }));
  Deno.exit(0);
}
if (mode === 'handed') {
  // THE CONTROL of T8, in an environment with no PG* variable: the same URLs handed to the driver AS the URL (the wiring this
  // replaced). reads: the driver's own reading names the production project; spelled: the URL's text contains the project ref
  const handedUrl = (u) => { try { return postgres(u, { prepare: false, ssl: verify(ca) }).options; } catch { return null; } };
  console.log(JSON.stringify({ handed: adversarial(REF).map(({ kind, what, url: u }) => { const o = handedUrl(u); return { kind, what, reads: o !== null && names(o, REF), spelled: u.toLowerCase().includes(REF) }; }) }));
  Deno.exit(0);
}
const out = {
  t1: await attempt(dbOptions(url('localhost'), ca, 1)),
  t2: await attempt(dbOptions(url('localhost'), other, 1)),
  t3a: { refusal: dbRefusal(url('127.0.0.1'), ca), refusal6: dbRefusal(url('[::1]'), ca), threw: throws(() => dbOptions(url('127.0.0.1'), ca, 1)), bypassed: await attempt(by('127.0.0.1', verify(ca))) },
  t4: await attempt(by('localhost', 'require')),
  t5: {
    noCa: dbRefusal(url('localhost'), ''), notPem: dbRefusal(url('localhost'), 'not a certificate'),
    prod: dbRefusal('postgresql://x:y@db.' + REF + '.supabase.co:5432/postgres', ca), notPg: dbRefusal('https://example.invalid', ca),
    prodQuery: dbRefusal('postgresql://x:y@pooler.example.net:6543/postgres?options=reference%3D' + REF, ca),
    good: dbRefusal(url('localhost'), ca),
  },
};
console.log(JSON.stringify(out));
`);
  // (no PG* variable of this machine reaches the probe: the driver reads them for whatever it is not given)
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG/i.test(k)));
  const deno = (mode, extraEnv = {}) => {
    const r = spawnSync('npx', [...DENO, 'run', '--allow-net', '--allow-read', '--allow-env', '--allow-sys', probe], { cwd: dir, encoding: 'utf8', shell: true, timeout: 240000, windowsHide: true, maxBuffer: 1 << 26,
      env: { ...cleanEnv, QA_CA: f('ca.crt'), QA_OTHER: f('other.crt'), QA_PW: password, QA_PORT: String(port), QA_MODE: mode, ...extraEnv } });
    const line = (r.stdout || '').trim().split(/\r?\n/).filter((l) => l.startsWith('{')).pop();
    if (!line) throw new Error('the Deno probe (' + mode + ') printed no result (exit ' + r.status + '):\n' + (r.stdout || '').slice(-800) + '\n' + (r.stderr || '').slice(-1500));
    return JSON.parse(line);
  };
  const o = deno('main');
  // T7-T9 run with an environment that names the production project wherever the driver would look for a missing part
  const t = deno('target', { PGHOST: 'db.' + REF + '.supabase.co', PGPORT: '6543', PGUSER: 'postgres.' + REF, PGUSERNAME: 'postgres.' + REF, PGDATABASE: REF, PGPASSWORD: 'from-the-environment' });
  const h = deno('handed').handed;
  // T3b: the same CA issues a certificate for another name; the server takes it on a reload
  ssl(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('wrong.key'), '-out', f('wrong.csr'), '-subj', '/CN=not-the-factory-db']);
  writeFileSync(join(dir, 'ext2.cnf'), 'subjectAltName=DNS:not-the-factory-db\n');
  ssl(['x509', '-req', '-in', f('wrong.csr'), '-CA', f('ca.crt'), '-CAkey', f('ca.key'), '-CAcreateserial', '-out', f('wrong.crt'), '-days', '1', '-extfile', f('ext2.cnf')]);
  writeFileSync(join(dir, 'server.crt'), readFileSync(join(dir, 'wrong.crt'))); writeFileSync(join(dir, 'server.key'), readFileSync(join(dir, 'wrong.key')));
  const reloaded = deno('reload');
  const m = deno('mismatch');
  row('T1 the pinned CA and the host the certificate names: connects over TLS (pg_stat_ssl ' + (o.t1.ssl ? o.t1.version : '-') + ')', o.t1.ok && o.t1.ssl === true, JSON.stringify(o.t1));
  row('T2 another CA pinned: refused (the server certificate does not chain to it)', !o.t2.ok, JSON.stringify(o.t2));
  row('T3a an IP-literal host (IPv4 and IPv6) is refused before any socket, and dbOptions gives the driver nothing for it; bypassed, a "localhost" certificate WOULD be accepted at 127.0.0.1 (why the refusal exists)',
    /IP address/.test(o.t3a.refusal || '') && /IP address/.test(o.t3a.refusal6 || '') && o.t3a.threw === true && o.t3a.bypassed.ok === true, JSON.stringify(o.t3a));
  row('T3b a certificate from the right CA for ANOTHER name: the connection to "localhost" is refused (the name is checked); \'require\' still connects (control)',
    reloaded.reloaded === true && !m.t3b.ok && m.control.ok === true, JSON.stringify(m));
  row('T4 the control: \'require\' - what a plain URL gives - connects to the same server with no CA at all, so T2 / T3b are refused by the verification', o.t4.ok && o.t4.ssl === true, JSON.stringify(o.t4));
  row('T5 dbRefusal refuses before any socket: no CA, a non-PEM CA, the production ref - named as the production project wherever the text spells it, also in a query the form does not read - and a non-postgresql URL; a good URL and CA pass',
    !!o.t5.noCa && !!o.t5.notPem && /production/.test(o.t5.prod || '') && /production/.test(o.t5.prodQuery || '') && !!o.t5.notPg && o.t5.good === null, JSON.stringify(o.t5));

  // ---- T6: the entry points' wiring
  const entry = (n) => readFileSync(join(ROOT, 'supabase', 'control-plane', 'edge', 'supabase', 'functions', n, 'index.ts'), 'utf8');
  const wired = ['factory-node-api', 'factory-admin-api'].map((n) => { const s = entry(n); return /import \{ dbOptions, dbRefusal \} from '\.\.\/_shared\/db\.ts'/.test(s) && /Deno\.env\.get\('FACTORY_DB_CA_PEM'\)/.test(s)
    && /dbRefusal\(dbUrl, caPem\)/.test(s) && /postgres\(dbOptions\(dbUrl, caPem\)\)/.test(s) && !/postgres\(\s*dbUrl/.test(s) && !/ssl:\s*'require'/.test(s); });
  row('T6 both entry points connect only through dbRefusal / dbOptions with FACTORY_DB_CA_PEM (no ssl: \'require\' anywhere), and the driver\'s only argument is dbOptions(dbUrl, caPem): the URL itself is never handed to it', wired.every(Boolean), JSON.stringify(wired));

  // ---- T7-T9: the target (C2-S1)
  const bad7 = t.t7.filter((x) => !x.ok);
  row('T7 the one form is read exactly and the driver is given exactly what was read: for ' + t.t7.length + ' URLs in the form postgresql://user:password@host:port/database (the pooler form of the founder\'s steps, postgres://, a host in upper case, escapes in the user and the password, a single-label host) dbRefusal is null, dbTarget reads the host in lower case, the port, the user and the password each decoded once, and the database; postgres.js constructed with dbOptions(url, ca) as its only argument holds that same target, no startup parameter but its application name, prepare off and TLS verify-full with the pinned CA - with PGHOST, PGUSER, PGDATABASE, PGPORT and PGPASSWORD naming the production project in its environment',
    t.t7.length >= 7 && bad7.length === 0, JSON.stringify(bad7.length ? bad7 : t.t7.map((x) => x.what)));
  const kinds = [...new Set(t.t8.map((x) => x.kind))];
  const open8 = t.t8.filter((x) => !x.refused || !x.threw);
  const handed = h.filter((x) => x.reads === true);
  const unspelled = handed.filter((x) => !x.spelled);
  const handedKinds = [...new Set(unspelled.map((x) => x.kind))];
  row('T8 ' + t.t8.length + ' URLs that reach, or try to reach, the production project in a disguised or alternate form are ALL refused, and dbOptions throws for each, so the driver is constructed with nothing (' + kinds.length + ' kinds: ' + kinds.join(', ') + '). The control hands the same URLs to the driver as the URL - the wiring this replaced - in an environment with no PG* variable: the driver reads ' + handed.length + ' of them as the production project (its host, user, database or a startup parameter), and ' + unspelled.length + ' of those do not contain the project ref in their text, which is all the check this replaced read (' + handedKinds.length + ' kinds)',
    t.t8.length >= 80 && h.length === t.t8.length && open8.length === 0 && kinds.length === 8 && handed.length >= 40 && unspelled.length >= 30 && handedKinds.length >= 5,
    JSON.stringify(open8.length ? { notRefused: open8 } : { byKind: Object.fromEntries(kinds.map((k) => [k, t.t8.filter((x) => x.kind === k).length + ' refused; handed over, ' + handed.filter((x) => x.kind === k).length + ' read as production, ' + unspelled.filter((x) => x.kind === k).length + ' of them not spelled in the text'])) }));
  const badOdd = t.t9.odd.filter((x) => !x.ok);
  row('T9 over the whole corpus (' + t.t9.urls + ' URLs, ' + t.t9.accepted + ' accepted) no URL is accepted while the driver holds anything but the target dbTarget read from it, a startup parameter of the URL\'s, or a target that names production; no refused URL gets options; each of ' + t.t9.odd.length + ' URLs that name no production project but are outside the one form (no port, user, password or database; a query; a fragment; an IP address in five spellings; a list of hosts; a trailing dot; an escape in the host or the database; a malformed escape; whitespace; a wrapper; another connection-string form) is refused with a reason that names what is wrong; and what a URL leaves out is never taken from the environment - the controls, handed such a URL, take the user, the host and the database from PGUSER / PGHOST / PGDATABASE',
    t.t9.urls >= 130 && t.t9.accepted === t.t7.length && t.t9.wrong.length === 0 && t.t9.given.length === 0 && t.t9.odd.length >= 40 && badOdd.length === 0
      && t.t9.env.noUser === true && t.t9.env.noHost === true && t.t9.env.noDatabase === true,
    JSON.stringify({ wrong: t.t9.wrong, given: t.t9.given, oddNotNamed: badOdd, env: t.t9.env }));
} catch (e) {
  row('X0 edge db tls', false, e && e.stack || String(e));
} finally {
  if (pg) await pg.stop().catch(() => {});
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows lock */ }
}
const failed = results.filter((r) => !r.ok);
console.log('\nedge_db_tls_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
process.exit(failed.length ? 1 : 0);

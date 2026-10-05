#!/usr/bin/env node
// WO-8 DEVELOPER VERIFICATION through the real web app. `next dev` (web/) runs with its Supabase URL pointed at the Brain OS stub
// and FACTORY_ADMIN_API_URL at the Factory Admin API handler on a disposable plane; each request carries a Brain OS session cookie.
// The chain exercised: request -> the web app's proxy (session) -> the (app) layout (profile) -> the Computers page (server
// component) -> lib/data/factory-computers -> lib/factory/admin-client (getUser, then the user's OWN token) -> the Admin API handler
// (under its platform path) -> the SQL front door -> the plane -> the HTML the user receives.
//   W0  the web's PE image-hash port equals the runtime's on a built exe, signed and unsigned (the "check the served file" digest)
//   W1  row for row: every computer the Factory lists (active and archived) is on the page, with the Factory's state, and nothing else;
//       the "Showing x of y" counts are the Factory's; the published release's download addresses are the release's
//   W2  the detail page shows the Factory's record: principal, credential status, envelope version, adopted release, audit
//   W3  persona x path: founder and holding_admin (in tenant_admins) see the page; employee, hr_finance, a self-promoted employee
//       (S1), and a founder / holding_admin NOT in tenant_admins get the Factory's refusal by name and no computer at all; a foreign
//       tenant's founder sees none of this tenant's computers and a direct link to one is "not_found"; no session -> /login;
//       an inactive profile -> /pending-activation
//   W4  /software-factory/workers is retired: it redirects to /software-factory/computers
//   W5  the sidebar marks only "Factory Computers" active on its page (longest-prefix; not "Agent Control Center" or "Software Specs")
//   W6  contract §1 Derived: a computer with two principals shows the derived state, the liveness or runtime label beside ALIVE, and
//       each principal's own state, as the Factory reports them
//   W7  Brain OS -> Factory -> Update (WO-6): the founder's page shows the prepared release exactly as release storage serves it now
//       (version, certified source, installer digest, certifying receipt), the Factory's signer, and the password field
//   W8  persona x path on the Update page: who is not a Factory admin gets the Factory's refusal by name, no prepared value and no
//       password field; no session -> /login. A listed admin who is not the founder sees the page: the authority is the Factory's,
//       on the call (update_authorization_acceptance UA4), never the page's
//   W9  the page says what is so on each load: nothing prepared, storage that cannot be read, a prepared file that is not an
//       unsigned production manifest - each without a value or a password field; the next load shows storage's next answer
// Developer verification, never independent; a stubbed Brain OS never counts for acceptance (VERIFICATION_SPEC §3 (2)). Server
// actions are thin one-call wrappers; their authority is the Admin API's (admin_acceptance P1-P5), not exercised here by HTTP.
// usage: node qa/factory/v1/web_computers_acceptance.mjs [--evidence <file>]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compose, sha256 } from '../../../scripts/factory-control-plane/migration.mjs';
import { asEngine } from './fixtures.mjs';
import { world, recorder } from './flows.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WEB = join(ROOT, 'web');
const { results, row } = recorder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const { stateInfo } = await import(pathToFileURL(join(WEB, 'lib', 'factory', 'computer-states.ts')).href);

// ---- W0: the web's image-hash port against the runtime's (no server needed)
{
  const web = await import(pathToFileURL(join(WEB, 'lib', 'factory', 'pe-image.ts')).href);
  const rt = await import(pathToFileURL(join(ROOT, 'scripts', 'factory-runner', 'enrolled', 'pe-image.mjs')).href);
  const exe = ['dev', 'production'].map((c) => join(ROOT, 'dist', 'brain-factory', JSON.parse(readFileSync(join(ROOT, 'scripts/factory-runner/sea/runtime-version.json'), 'utf8')).runtime_version, c, 'BrainFactorySetup.exe')).find((f) => existsSync(f));
  if (!exe) row('W0 the web image-hash port equals the runtime\'s', false, 'no built exe under dist/ - build one with scripts/factory-build/build-sea.mjs first');
  else {
    const buf = readFileSync(exe);
    // a stand-in signature: an 8-aligned WIN_CERTIFICATE appended and the certificate directory pointed at it
    const pad = (8 - (buf.length % 8)) % 8; const cert = Buffer.alloc(32, 0xab); cert.writeUInt32LE(32, 0); cert.writeUInt16LE(0x0200, 4); cert.writeUInt16LE(0x0002, 6);
    const signed = Buffer.concat([buf, Buffer.alloc(pad), cert]);
    const pe = signed.readUInt32LE(0x3c); const opt = pe + 24; const dd = opt + (signed.readUInt16LE(opt) === 0x20b ? 112 : 96);
    signed.writeUInt32LE(buf.length + pad, dd + 32); signed.writeUInt32LE(cert.length, dd + 36);
    const tampered = Buffer.from(buf); tampered[tampered.indexOf(Buffer.from('This program cannot be run in DOS mode'))] ^= 0x20;
    const same = [buf, signed, tampered].map((b) => web.authenticodeImageHash(b) === rt.authenticodeImageHash(b));
    row('W0 the web image-hash port equals the runtime\'s on the built exe, a signed copy and a one-byte-tampered copy; the signed copy keeps the digest and shows a certificate table; the tampered one does not keep it',
      same.every(Boolean) && web.authenticodeImageHash(signed) === web.authenticodeImageHash(buf) && web.certificateTable(signed).size === 32 && web.certificateTable(buf).size === 0
        && web.authenticodeImageHash(tampered) !== web.authenticodeImageHash(buf), JSON.stringify({ exe: exe.slice(ROOT.length + 1), same }));
  }
}

const W = await world();
let dev = null; let store = null; const devLog = [];
try {
  const { founder, admin, sup, brain } = W;
  // ---- fixtures: enrolled (available), draining, a pairing code only, archived; a second tenant with its own computer
  const A = await W.enroll('WEB-alpha', { roles: ['generic', 'verifier'] });
  const B = await W.enroll('WEB-beta', { roles: ['generic'] });
  await admin.call('drain', { computer_id: B.computer_id }, founder.token);
  const C = await admin.call('add-computer', { display_name: 'WEB-gamma', envelope: { roles: ['generic'] } }, founder.token);
  const D = await W.enroll('WEB-delta', { roles: ['generic'] });
  await admin.call('archive', { computer_id: D.computer_id }, founder.token);
  const holding = brain.persona('holding_admin'); await W.grantAdmin(holding, 'admin');
  const T2 = 'b2e0f000-0000-4000-8000-000000000002';
  await asEngine(sup, () => sup.query(`insert into factory.tenants (tenant_id, name) values ($1, 'second')`, [T2]));
  const t2founder = brain.persona('founder'); await W.grantAdmin(t2founder, 'founder', T2);
  const foreign = await admin.call('add-computer', { display_name: 'WEB-foreign-tenant', envelope: { roles: ['generic'] } }, t2founder.token);

  // ---- the web app
  const port = await freePort();
  const base = 'http://127.0.0.1:' + port;
  // release storage: a stand-in on a loopback port. It serves production/prepared.json as `storage.prepared` says at that moment
  // and answers 404 for every other address, like an object that is not there
  const storage = { prepared: { status: 404, body: '' }, asked: [] };
  store = createHttpServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname; storage.asked.push(path);
    const hit = path === '/qa-releases/production/prepared.json' ? storage.prepared : { status: 404, body: '' };
    res.writeHead(hit.status, { 'content-type': 'application/json' }); res.end(hit.body);
  });
  await new Promise((ok) => store.listen(0, '127.0.0.1', ok));
  const releasesUrl = 'http://127.0.0.1:' + store.address().port + '/qa-releases';
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: brain.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: brain.anonKey, FACTORY_ADMIN_API_URL: admin.baseUrl,
    FACTORY_RELEASES_URL: releasesUrl, NEXT_TELEMETRY_DISABLED: '1', SUPABASE_SERVICE_ROLE_KEY: '' };
  dev = spawn(process.execPath, [join(WEB, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--port', String(port), '--hostname', '127.0.0.1'], { cwd: WEB, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  dev.stdout.on('data', (d) => devLog.push(String(d))); dev.stderr.on('data', (d) => devLog.push(String(d)));
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { await sleep(1000); try { const r = await fetch(base + '/login', { redirect: 'manual' }); up = r.status > 0; } catch { /* starting */ } }
  if (!up) throw new Error('next dev did not start:\n' + devLog.join('').slice(-2000));

  const cookieFor = (p) => {
    const session = { access_token: p.token, refresh_token: 'stub-refresh', token_type: 'bearer', expires_in: 3600 * 24, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
      user: { id: p.userId, aud: 'authenticated', role: 'authenticated', email: 'stub@stub.invalid', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
    return 'sb-127-auth-token=base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  };
  const page = async (path, p) => {
    const r = await fetch(base + path, { redirect: 'manual', headers: p ? { cookie: cookieFor(p) } : {}, signal: AbortSignal.timeout(300000) });
    return { status: r.status, location: r.headers.get('location'), html: r.status === 200 ? await r.text() : '' };
  };

  // ---- W1: row for row
  const before = await admin.call('list-computers', { include_archived: true, limit: 200 }, founder.token);
  const pf = await page('/software-factory/computers', founder);
  const after = await admin.call('list-computers', { include_archived: true, limit: 200 }, founder.token);
  const rows = {};
  for (const m of pf.html.matchAll(/href="\/software-factory\/computers\/([0-9a-f-]{36})"/g)) {
    const seg = pf.html.slice(m.index, pf.html.indexOf('</tr>', m.index));
    rows[m[1]] = text(seg);
  }
  const mismatches = [];
  for (const c of after.computers.items) {
    const was = before.computers.items.find((x) => x.computer_id === c.computer_id);
    const t = rows[c.computer_id];
    if (!t) { mismatches.push(c.display_name + ': not on the page'); continue; }
    if (!t.includes(c.display_name)) mismatches.push(c.display_name + ': name');
    const labels = [stateInfo(c.state).label, was && stateInfo(was.state).label];
    if (!labels.some((l) => l && t.includes(l))) mismatches.push(c.display_name + ': state ' + c.state + ' not shown (' + t.slice(0, 160) + ')');
  }
  const extra = Object.keys(rows).filter((id) => !after.computers.items.some((c) => c.computer_id === id));
  const bodyText = text(pf.html);
  const counts = new RegExp('Showing ' + after.computers.shown + ' of ' + after.computers.total).test(bodyText);
  const dl = pf.html.includes(releasesUrl + '/dev/0.0.1-fixture/BrainFactorySetup.exe') && pf.html.includes(releasesUrl + '/dev/0.0.1-fixture/BrainFactorySetup.manifest.json');
  row('W1 row for row: each of the ' + after.computers.total + ' computers the Factory lists (active and archived) is on the page with its name and the Factory\'s state, no other computer is; the counts are the Factory\'s; the download addresses are the published release\'s',
    pf.status === 200 && after.ok && after.computers.total === 4 && mismatches.length === 0 && extra.length === 0 && counts && dl && !bodyText.includes('WEB-foreign-tenant'),
    JSON.stringify({ status: pf.status, mismatches, extra, counts, dl, states: after.computers.items.map((c) => c.display_name + '=' + c.state) }) + (pf.status !== 200 ? ' ' + devLog.join('').slice(-1500) : ''));

  // ---- W2: the detail page
  const det = await admin.call('get-computer', { computer_id: A.computer_id }, founder.token);
  const pd = await page('/software-factory/computers/' + A.computer_id, founder);
  const dt = text(pd.html);
  const p0 = det.computer.principals[0];
  const w2 = { status: pd.status, node: dt.includes(p0.node_id), cred: dt.includes(p0.credential.status + ' ' + p0.credential.key_thumbprint.slice(0, 16)), env: dt.includes('Authorization envelope v' + det.computer.envelope.version),
    roles: dt.includes(det.computer.envelope.roles.join(', ')), audit: det.audit.length > 0 && det.audit.every((a) => dt.includes(a.action)), state: dt.includes(stateInfo(det.computer.state).label) };
  row('W2 the detail page is the Factory\'s record: the principal\'s node id, the credential status and thumbprint, the envelope version and roles, every audit action, the state',
    Object.values(w2).every((v) => v === true || v === 200), JSON.stringify(w2));

  // ---- W3: persona x path
  const names = ['WEB-alpha', 'WEB-beta', 'WEB-gamma', 'WEB-delta'];
  const employee = brain.persona('employee');
  const hr = brain.persona('hr_finance');
  const selfPromoted = brain.persona('employee'); await brain.selfUpdateRole(selfPromoted, 'founder');
  const founderNotListed = brain.persona('founder');
  const holdingNotListed = brain.persona('holding_admin');
  const inactive = brain.persona('founder', { active: false });
  const refusedFor = {};
  for (const [label, p] of [['employee', employee], ['hr_finance', hr], ['self-promoted employee (S1)', selfPromoted], ['founder not in tenant_admins', founderNotListed], ['holding_admin not in tenant_admins', holdingNotListed]]) {
    const r = await page('/software-factory/computers', p);
    const t = text(r.html);
    refusedFor[label] = r.status === 200 && /Refused not_authorized/.test(t) && names.every((n) => !t.includes(n));
  }
  const hp = await page('/software-factory/computers', holding);
  const holdingSees = hp.status === 200 && names.every((n) => text(hp.html).includes(n));
  const fp = await page('/software-factory/computers', t2founder);
  const foreignView = fp.status === 200 && names.every((n) => !text(fp.html).includes(n)) && text(fp.html).includes('WEB-foreign-tenant');
  const cross = await page('/software-factory/computers/' + A.computer_id, t2founder);
  const crossNotFound = cross.status === 200 && /Refused not_found/.test(text(cross.html)) && !text(cross.html).includes('WEB-alpha');
  const anon = await page('/software-factory/computers', null);
  const inact = await page('/software-factory/computers', inactive);
  const w3 = { refusedFor, holdingSees, foreignView, crossNotFound, anon: anon.status + ' ' + anon.location, inactive: inact.status + ' ' + inact.location };
  row('W3 persona x path: founder and holding_admin in tenant_admins see the page; employee, hr_finance, a self-promoted employee (S1) and a founder / holding_admin not in tenant_admins get "Refused not_authorized" and no computer; a foreign tenant\'s founder sees only its own, and a link to ours is not_found; no session -> /login; an inactive profile -> /pending-activation',
    Object.values(refusedFor).every(Boolean) && holdingSees && foreignView && crossNotFound && [302, 303, 307, 308].includes(anon.status) && /\/login$/.test(anon.location || '')
      && [302, 303, 307, 308].includes(inact.status) && /\/pending-activation$/.test(inact.location || ''), JSON.stringify(w3));

  // ---- W4: the legacy workers page is retired
  const wk = await page('/software-factory/workers', founder);
  row('W4 /software-factory/workers is retired: it redirects to /software-factory/computers', [302, 303, 307, 308].includes(wk.status) && /\/software-factory\/computers$/.test(wk.location || ''), wk.status + ' ' + wk.location);

  // ---- W5: the sidebar marks only the Computers item active
  const navClass = (href) => { const m = new RegExp('<a[^>]*href="' + href.replace(/\//g, '\\/') + '"[^>]*>').exec(pf.html); return m ? m[0] : ''; };
  const act = (href) => /bg-sidebar-accent font-medium/.test(navClass(href));
  row('W5 on /software-factory/computers the sidebar marks "Factory Computers" active, and neither "Agent Control Center" (/software-factory) nor "Software Specs" (/software)',
    act('/software-factory/computers') && !act('/software-factory') && !act('/software'), JSON.stringify({ computers: act('/software-factory/computers'), acc: act('/software-factory'), specs: act('/software') }));

  // ---- W6 (contract §1 "Derived"; AC-2 in R-2): WEB-alpha gets a second principal (the explicit admin action). Its row shows the derived
  // state, beside ALIVE the liveness or runtime label, and EACH principal's own state - the labels of get-computer's answer - while the
  // second principal holds only a code, and again after it enrolled and its credential was revoked (the computer stays ALIVE)
  const rowOf = async () => {
    const pg = await page('/software-factory/computers', founder);
    const m = new RegExp('href="/software-factory/computers/' + A.computer_id + '"').exec(pg.html);
    return m ? text(pg.html.slice(m.index, pg.html.indexOf('</tr>', m.index))) : '';
  };
  const labelsOf = (c) => [stateInfo(c.state).label, ...(c.state === 'ALIVE' ? [stateInfo(c.draining ? 'DRAINING' : c.liveness === 'FRESH' ? c.runtime_phase : c.liveness).label] : []),
    ...c.principals.map((x) => stateInfo(x.state).label)];
  const w6cp = await admin.call('create-principal', { computer_id: A.computer_id }, founder.token);
  const w6a = (await admin.call('get-computer', { computer_id: A.computer_id }, founder.token)).computer;
  const w6t1 = await rowOf();
  const w6p2 = await W.pair({ ...w6cp, computer_id: A.computer_id }, { name: 'WEB-alpha P2' });
  await admin.call('revoke-credential', { computer_id: A.computer_id, principal_id: w6p2.principal_id }, founder.token);
  const w6b = (await admin.call('get-computer', { computer_id: A.computer_id }, founder.token)).computer;
  const w6t2 = await rowOf();
  const w6 = { first: w6a.principals.map((x) => x.state), then: w6b.principals.map((x) => x.state), shown1: labelsOf(w6a).map((l) => [l, w6t1.includes(l)]), shown2: labelsOf(w6b).map((l) => [l, w6t2.includes(l)]) };
  row('W6 a computer with a second principal: its row shows ALIVE, the liveness or runtime label beside it, and each principal\'s own state (Alive, Pairing code issued), as get-computer reports them; after that principal enrolled and was revoked a fresh load shows ALIVE with Alive and Credential revoked',
    w6cp.ok && w6a.state === 'ALIVE' && JSON.stringify(w6.first) === JSON.stringify(['ALIVE', 'PAIRING_CODE_ISSUED']) && w6.shown1.every(([, v]) => v)
      && w6b.state === 'ALIVE' && JSON.stringify(w6.then) === JSON.stringify(['ALIVE', 'CREDENTIAL_REVOKED']) && w6.shown2.every(([, v]) => v), JSON.stringify(w6));

  // ---- W7-W9: Brain OS -> Factory -> Update (WO-6; AC-5(o)-(r)). The page shows server truth on every load: the prepared release as
  // release storage serves it at that moment, and the Factory's published release and signer read with the viewer's own session
  const prep = { v: 1, channel: 'production', version: '9.4.1-qa.update', source_sha: '5'.repeat(40), digest: 'c'.repeat(64), receipt_sha256: 'd'.repeat(64), key_id: null, signature: null };
  const updatePage = async (p) => { const r = await page('/software-factory/update', p); return { ...r, t: text(r.html), field: /id="fu-password"/.test(r.html) }; };
  const shows = (r) => [prep.version, prep.source_sha, prep.digest, prep.receipt_sha256].map((v) => r.t.includes(v));
  const rel = await admin.call('list-releases', {}, founder.token);
  storage.prepared = { status: 200, body: JSON.stringify(prep) };
  const up1 = await updatePage(founder);
  const w7 = { status: up1.status, values: shows(up1), field: up1.field, confirm: up1.t.includes('Authorize this exact release') && up1.t.includes('Confirm update'),
    signer: !!rel.signer && /^ed25519:[0-9a-f]{64}$/.test(rel.signer.key_id) && up1.t.includes(rel.signer.key_id),
    nonePublished: up1.t.includes('No production release is published on this Factory yet.') };
  row('W7 the Update page, the founder, a prepared release in release storage: the page shows its version, certified source, installer digest and certifying receipt as storage serves them, this Factory\'s signing key as the Factory lists it, that no production release is published, and the password field with Confirm',
    w7.status === 200 && w7.values.every(Boolean) && w7.field && w7.confirm && w7.signer && w7.nonePublished && rel.ok && !rel.releases.items.some((r) => r.channel === 'production'),
    JSON.stringify(w7) + (up1.status !== 200 ? ' ' + devLog.join('').slice(-1500) : ''));

  const upRefused = {};
  for (const [label, p] of [['employee', employee], ['hr_finance', hr], ['self-promoted employee (S1)', selfPromoted], ['founder not in tenant_admins', founderNotListed], ['holding_admin not in tenant_admins', holdingNotListed]]) {
    const r = await updatePage(p);
    upRefused[label] = r.status === 200 && /Refused not_authorized/.test(r.t) && !shows(r).some(Boolean) && !r.field;
  }
  const upHolding = await updatePage(holding);
  const upAnon = await updatePage(null);
  const upInactive = await updatePage(inactive);
  const w8 = { upRefused, listedAdminSees: upHolding.status === 200 && shows(upHolding).every(Boolean), anon: upAnon.status + ' ' + upAnon.location, inactive: upInactive.status + ' ' + upInactive.location };
  row('W8 persona x path on the Update page: employee, hr_finance, a self-promoted employee (S1) and a founder / holding_admin not in tenant_admins get "Refused not_authorized", none of the prepared values and no password field; no session -> /login; an inactive profile -> /pending-activation; a listed admin who is not the founder sees the page (its confirmation is the Factory\'s to refuse, on the call: update_authorization_acceptance UA4)',
    Object.values(upRefused).every(Boolean) && w8.listedAdminSees && [302, 303, 307, 308].includes(upAnon.status) && /\/login$/.test(upAnon.location || '')
      && [302, 303, 307, 308].includes(upInactive.status) && /\/pending-activation$/.test(upInactive.location || ''), JSON.stringify(w8));

  const stateOf = async (answer) => {
    storage.prepared = answer; const r = await updatePage(founder);
    return { status: r.status, field: r.field, values: shows(r).some(Boolean), none: r.t.includes('No update is prepared.'), unreadable: r.t.includes('The Factory\'s release storage could not be read.') };
  };
  const w9 = {
    absent: await stateOf({ status: 404, body: '' }),
    down: await stateOf({ status: 500, body: '' }),
    otherChannel: await stateOf({ status: 200, body: JSON.stringify({ ...prep, channel: 'dev' }) }),
    signed: await stateOf({ status: 200, body: JSON.stringify({ ...prep, key_id: 'ed25519:' + 'a'.repeat(64), signature: 'A'.repeat(86) }) }),
    again: await stateOf({ status: 200, body: JSON.stringify(prep) }),
  };
  const says = (s, which) => s.status === 200 && !s.field && !s.values && s[which] && !s[which === 'none' ? 'unreadable' : 'none'];
  const asked = storage.asked.filter((p) => p === '/qa-releases/production/prepared.json').length;
  row('W9 the Update page says what is so, on each load: no prepared file -> "No update is prepared"; storage answering 500 -> "could not be read"; a prepared file of another channel, or one that carries a signature -> "No update is prepared" - none of the four shows a prepared value or a password field; with the prepared release back, the next load shows it again with the field; storage was asked on every one of those loads',
    says(w9.absent, 'none') && says(w9.down, 'unreadable') && says(w9.otherChannel, 'none') && says(w9.signed, 'none')
      && w9.again.status === 200 && w9.again.field && w9.again.values && !w9.again.none && !w9.again.unreadable && asked >= 7, JSON.stringify({ ...w9, asked }));
  void C; void foreign;
} catch (e) {
  row('X0 web acceptance', false, (e && e.stack || String(e)) + '\n' + devLog.join('').slice(-1500));
} finally {
  if (dev) { dev.kill(); await sleep(1500); if (process.platform === 'win32' && dev.pid) spawn('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { windowsHide: true }); }
  if (store) { store.closeAllConnections?.(); store.close(); }
  await W.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\nweb_computers_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/web_computers_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);

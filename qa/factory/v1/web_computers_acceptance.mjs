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
// Developer verification, never independent; a stubbed Brain OS never counts for acceptance (VERIFICATION_SPEC §3 (2)). Server
// actions are thin one-call wrappers; their authority is the Admin API's (admin_acceptance P1-P5), not exercised here by HTTP.
// usage: node qa/factory/v1/web_computers_acceptance.mjs [--evidence <file>]
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
let dev = null; const devLog = [];
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
  const releasesUrl = 'http://127.0.0.1:9/qa-releases';
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
  void C; void foreign;
} catch (e) {
  row('X0 web acceptance', false, (e && e.stack || String(e)) + '\n' + devLog.join('').slice(-1500));
} finally {
  if (dev) { dev.kill(); await sleep(1500); if (process.platform === 'win32' && dev.pid) spawn('taskkill', ['/pid', String(dev.pid), '/T', '/F'], { windowsHide: true }); }
  await W.stop();
}
const failed = results.filter((r) => !r.ok);
console.log('\nweb_computers_acceptance: ' + (results.length - failed.length) + '/' + results.length + ' OK' + (failed.length ? '; FAILED: ' + failed.map((r) => r.id.split(' ')[0]).join(', ') : ''));
const ev = process.argv.indexOf('--evidence');
if (ev > 0) writeFileSync(process.argv[ev + 1], ['qa/factory/v1/web_computers_acceptance.mjs', 'migration sha256 ' + sha256(compose()), '',
  ...results.map((r) => (r.ok ? 'OK   ' : 'FAIL ') + r.id + (r.detail ? ' - ' + r.detail : '')), '', (results.length - failed.length) + '/' + results.length + ' OK'].join('\n') + '\n');
process.exit(failed.length ? 1 : 0);

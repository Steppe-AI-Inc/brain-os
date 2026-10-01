// THE INSTALLER, end to end, against stand-ins: a copy of this tree committed and signed in a throwaway repository, a throwaway
// "Director" that publishes the verifier's registration and its record, a stand-in for the Supabase management API (SQL runs on the
// disposable plane as its owner login), a stand-in for the Supabase CLI, and a stand-in gateway that serves whatever was "deployed".
// The real management API and CLI are never touched by a test: the installer accepts a stand-in only on loopback, for a project
// whose name starts with test-.
//   RELAY_TEST_MODULES=<node_modules> node test/install_acceptance.mjs
// RELAY_INSTALLER_FILE points it at another copy of relay/install.mjs (the mutation proof).
import { createServer } from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startPlane, ROOT, BUCKET, FINGERPRINT, reporter } from './plane.mjs';
import { startStandIn } from './standin.mjs';
import { sha256Hex } from './helpers.mjs';

const t = reporter('artifact relay install acceptance');
const run = promisify(execFile);
const base = mkdtempSync(join(tmpdir(), 'relay-inst-'));
const TOKEN = 'sbp_' + randomBytes(24).toString('hex');
const PROJECT = 'test-' + randomBytes(4).toString('hex');
const readBody = async (req) => { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); };
const listen = (server) => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port)));
const sh = (cwd, file, args, env = {}) => execFileSync(file, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// ------------------------------------------------------------------------------------------------- two throwaway signing keys
const keyDir = join(base, 'keys'); mkdirSync(keyDir);
const newKey = (name) => { sh(keyDir, 'ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', name, '-f', join(keyDir, name)]); return { file: join(keyDir, name), fingerprint: sh(keyDir, 'ssh-keygen', ['-l', '-f', join(keyDir, name + '.pub')]).split(' ')[1] }; };
const IMPLEMENTER = newKey('implementer'), DIRECTOR = newKey('director'), OTHER = newKey('other');
const gitAs = (cwd, key, ...args) => sh(cwd, 'git', ['-c', 'user.name=Relay Test', '-c', 'user.email=test@relay.invalid', '-c', 'gpg.format=ssh', '-c', 'user.signingkey=' + key.file, '-c', 'commit.gpgsign=true', '-c', 'core.autocrlf=false', ...args]);

// ------------------------------------------------------------------------------- the sender's checkout: this tree, committed
const work = join(base, 'work');
mkdirSync(work);
for (const f of sh(ROOT, 'git', ['ls-files', '--cached', '--others', '--exclude-standard']).split('\n').filter(Boolean)) {
  if (!existsSync(join(ROOT, f))) continue;
  mkdirSync(dirname(join(work, f)), { recursive: true });
  cpSync(join(ROOT, f), join(work, f));
}
if (process.env.RELAY_INSTALLER_FILE) cpSync(process.env.RELAY_INSTALLER_FILE, join(work, 'relay', 'install.mjs'));
sh(work, process.execPath, [join(work, 'tools', 'manifest.mjs'), '--write']);
sh(work, 'git', ['init', '-q', '-b', 'factory/artifact-relay-v0']);
gitAs(work, IMPLEMENTER, 'add', '-A'); gitAs(work, IMPLEMENTER, 'commit', '-q', '-m', 'the relay');
const HEAD = sh(work, 'git', ['rev-parse', 'HEAD']);
const remote = join(base, 'remote.git');
sh(base, 'git', ['init', '-q', '--bare', remote]);
sh(work, 'git', ['remote', 'add', 'origin', remote]);
sh(work, 'git', ['push', '-q', 'origin', 'HEAD:refs/heads/factory/artifact-relay-v0']);
const INSTALLER = join(work, 'relay', 'install.mjs');

const plane = await startPlane({ bucket: 'none' });
const servers = [];
let code = 1;
try {
  const standin = await startStandIn(plane);
  servers.push({ close: standin.close });
  const fp0 = (await plane.su.query(FINGERPRINT)).rows[0].f;

  // ------------------------------------------------------------------------------------- the stand-in "Supabase CLI" and gateway
  const cliState = join(base, 'cli-state'); mkdirSync(cliState);
  const fakeCli = join(base, 'fake-supabase-cli.cjs');
  writeFileSync(fakeCli, `
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), state = process.env.FAKE_CLI_STATE;
fs.appendFileSync(path.join(state, 'calls.log'), JSON.stringify({ args: args.map((a) => (a.includes('relay-deploy-') ? '<staging>' : a)), token: process.env.SUPABASE_ACCESS_TOKEN === process.env.FAKE_CLI_TOKEN }) + '\\n');
if (process.env.SUPABASE_ACCESS_TOKEN !== process.env.FAKE_CLI_TOKEN) { console.error('Unauthorized: invalid access token'); process.exit(1); }
if (fs.existsSync(path.join(state, 'fail-next'))) { fs.rmSync(path.join(state, 'fail-next')); console.error('Error: failed to bundle the function'); process.exit(1); }
const record = path.join(state, 'deployed.json');
if (args[0] === 'functions' && args[1] === 'deploy') {
  const wd = args[args.indexOf('--workdir') + 1], slug = args[2], src = path.join(wd, 'supabase', 'functions', slug), dst = path.join(state, 'deployed');
  const version = fs.existsSync(record) ? JSON.parse(fs.readFileSync(record, 'utf8')).version + 1 : 1;
  fs.rmSync(dst, { recursive: true, force: true }); fs.cpSync(src, dst, { recursive: true });
  fs.writeFileSync(record, JSON.stringify({ slug, version, verify_jwt: !args.includes('--no-verify-jwt'), project: args[args.indexOf('--project-ref') + 1], use_api: args.includes('--use-api'),
    files: fs.readdirSync(dst).sort(), config: fs.readFileSync(path.join(wd, 'supabase', 'config.toml'), 'utf8') }));
  console.log('Deployed Functions on project'); process.exit(0);
}
if (args[0] === 'functions' && args[1] === 'delete') {
  if (!fs.existsSync(record)) { console.error('Function not found'); process.exit(1); }
  fs.rmSync(record); fs.rmSync(path.join(state, 'deployed'), { recursive: true, force: true }); console.log('Deleted Function'); process.exit(0);
}
console.error('unknown command'); process.exit(2);
`);
  const deployed = () => (existsSync(join(cliState, 'deployed.json')) ? JSON.parse(readFileSync(join(cliState, 'deployed.json'), 'utf8')) : null);
  const handlers = new Map();
  const gateway = createServer(async (req, res) => {
    const body = await readBody(req);
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    const d = deployed();
    if (!d || req.url !== '/functions/v1/' + d.slug) return send(404, { code: 'NOT_FOUND', message: 'Requested function was not found' });
    // the hosted gateway: with JWT verification on, a request without a project key never reaches the function
    if (d.verify_jwt && !req.headers.authorization) return send(401, { code: 401, message: 'Missing authorization header' });
    if (!handlers.has(d.version)) {
      const { makeHandler } = await import(pathToFileURL(join(cliState, 'deployed', 'relay.ts')).href + '?v=' + d.version);
      const { REGISTRY } = await import(pathToFileURL(join(cliState, 'deployed', 'registry.ts')).href + '?v=' + d.version);
      handlers.set(d.version, makeHandler({ supabaseUrl: standin.url, serviceKeys: [standin.keys.legacy], registry: REGISTRY }, fetch));
    }
    const response = await handlers.get(d.version)(new Request('http://127.0.0.1' + req.url, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : body }));
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  });
  servers.push(gateway);
  const relayUrl = 'http://127.0.0.1:' + (await listen(gateway)) + '/functions/v1/factory-artifact-relay';

  // ------------------------------------------------------------------------------------ the stand-in management API
  const apiCalls = [];
  const api = createServer(async (req, res) => {
    const body = await readBody(req);
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    apiCalls.push(req.method + ' ' + req.url);
    if (req.headers.authorization !== 'Bearer ' + TOKEN) return send(401, { message: 'Unauthorized' });
    if (req.method === 'POST' && req.url === `/v1/projects/${PROJECT}/database/query`) {
      try {
        const out = await plane.owner.query(JSON.parse(body.toString('utf8')).query);
        const last = Array.isArray(out) ? out.at(-1) : out;
        return send(201, last.rows ?? []);
      } catch (e) {
        try { await plane.owner.query('rollback'); } catch { /* no transaction */ }
        return send(400, { message: 'Failed to run sql query: ERROR:  ' + e.message });
      }
    }
    if (req.method === 'GET' && req.url === `/v1/projects/${PROJECT}/functions/factory-artifact-relay`) {
      const d = deployed();
      return d ? send(200, { slug: d.slug, name: d.slug, status: 'ACTIVE', version: d.version, verify_jwt: d.verify_jwt, updated_at: Date.now(), ezbr_sha256: sha256Hex(JSON.stringify(d)) }) : send(404, { message: 'Function not found' });
    }
    send(404, { message: 'not found' });
  });
  servers.push(api);
  const apiUrl = 'http://127.0.0.1:' + (await listen(api));

  // ------------------------------------------------------------------------------------------------- the two nodes, and Home
  const W = 'node-' + randomBytes(4).toString('hex') + '-work', H = 'node-' + randomBytes(4).toString('hex') + '-home';
  await plane.su.query('insert into factory.nodes (node_id, security_role, platform) values ($1, $2, $3), ($4, $5, $6)', [W, 'implementer', 'win32', H, 'verifier', 'win32']);
  const homes = { W: join(base, 'relay-home-work'), H: join(base, 'relay-home-verifier') };
  const relayCli = async (checkout, who, args) => {
    try { const r = await run(process.execPath, [join(checkout, 'relay', 'relay.mjs'), ...args], { env: { ...process.env, RELAY_HOME: homes[who], RELAY_ALLOW_LOOPBACK: '1' } }); return { code: 0, out: r.stdout }; }
    catch (e) { return { code: typeof e.code === 'number' ? e.code : -1, out: (e.stdout ?? '') + (e.stderr ?? '') }; }
  };
  const pub = (out) => /public_key\s+(\S+)/.exec(out)?.[1];
  const kW = await relayCli(work, 'W', ['keygen', '--node', W, '--role', 'sender', '--url', relayUrl]);

  const settings = (over = {}) => {
    const file = join(base, 'settings-' + randomBytes(3).toString('hex') + '.json');
    writeFileSync(file, JSON.stringify({ project: PROJECT, api: apiUrl, relayUrl, remote: 'origin', implementerFingerprint: IMPLEMENTER.fingerprint, directorFingerprint: DIRECTOR.fingerprint, cli: fakeCli, ...over }));
    return file;
  };
  const SETTINGS = settings();
  const install = async (args = [], { token = TOKEN, settingsFile = SETTINGS, checkout = work, env = {} } = {}) => {
    const e = { ...process.env, RELAY_HOME: homes.W, RELAY_ALLOW_LOOPBACK: '1', RELAY_INSTALL_TEST_SETTINGS: settingsFile, FAKE_CLI_STATE: cliState, FAKE_CLI_TOKEN: TOKEN, ...env };
    if (token === null) delete e.SUPABASE_ACCESS_TOKEN; else e.SUPABASE_ACCESS_TOKEN = token;
    if (settingsFile === null) delete e.RELAY_INSTALL_TEST_SETTINGS;
    apiCalls.length = 0;
    try { const r = await run(process.execPath, [join(checkout, 'relay', 'install.mjs'), ...args], { env: e, timeout: 240000 }); return { code: 0, out: r.stdout + r.stderr, calls: [...apiCalls] }; }
    catch (x) { return { code: typeof x.code === 'number' ? x.code : -1, out: (x.stdout ?? '') + (x.stderr ?? ''), calls: [...apiCalls] }; }
  };
  const state = async () => (await plane.su.query(`select pg_catalog.to_regnamespace('factory_relay') is not null as installed, (select count(*) from storage.buckets where id = $1) as buckets`, [BUCKET])).rows[0];
  const untouched = async () => { const s = await state(); return s.installed === false && s.buckets === '0' && deployed() === null; };
  const cliLog = () => (existsSync(join(cliState, 'calls.log')) ? readFileSync(join(cliState, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

  // --------------------------------------------------------------------------------------- before Home has done its part
  {
    const noHome = await install();
    t.row('I01 before the verifier has published its registration the install is BLOCKED and nothing is changed',
      noHome.code === 3 && /BLOCKED - the verifier has not published its registration/.test(noHome.out) && /nothing was changed/.test(noHome.out) && noHome.calls.length === 0 && (await untouched()), noHome.out.trim().split('\n').at(-1));
  }
  // Home: a clone of the relay branch, its own key, its registration committed on top of the relay commit and signed by the Director key
  const home = join(base, 'home');
  sh(base, 'git', ['clone', '-q', '--branch', 'factory/artifact-relay-v0', remote, home]);
  const kH = await relayCli(home, 'H', ['keygen', '--node', H, '--role', 'verifier', '--url', relayUrl]);
  const publish = (signer, { branch = 'factory/artifact-relay-v0-verifier', edit = null, parent = HEAD, extra = null } = {}) => {
    sh(home, 'git', ['checkout', '-q', '-B', branch, parent]);
    execFileSync(process.execPath, [join(home, 'relay', 'relay.mjs'), 'registration'], { env: { ...process.env, RELAY_HOME: homes.H }, stdio: 'ignore' });
    if (edit) writeFileSync(join(home, 'registrations', 'verifier.json'), edit(readFileSync(join(home, 'registrations', 'verifier.json'), 'utf8')));
    if (extra) writeFileSync(join(home, extra), 'something else\n');
    gitAs(home, signer, 'add', '-A'); gitAs(home, signer, 'commit', '-q', '--allow-empty', '-m', 'Artifact Relay V0: verifier registration');
    sh(home, 'git', ['push', '-q', '--force', 'origin', 'HEAD:refs/heads/' + branch]);
    return sh(home, 'git', ['rev-parse', 'HEAD']);
  };
  const record = (signer, events) => {
    sh(home, 'git', ['checkout', '-q', '--orphan', 'director-' + randomBytes(3).toString('hex')]);
    sh(home, 'git', ['rm', '-rfq', '--cached', '.']);
    mkdirSync(join(home, 'qa', 'work-orders'), { recursive: true });
    writeFileSync(join(home, 'qa', 'work-orders', 'AUTO_ENROLLMENT_V1_LEDGER.json'), JSON.stringify({ ledger: 'test', events }, null, 1) + '\n');
    gitAs(home, signer, 'add', 'qa/work-orders/AUTO_ENROLLMENT_V1_LEDGER.json'); gitAs(home, signer, 'commit', '-q', '-m', 'ledger');
    sh(home, 'git', ['push', '-q', '--force', 'origin', 'HEAD:refs/heads/factory/auto-enrollment-v1-director']);
    sh(home, 'git', ['checkout', '-q', '-f', 'factory/artifact-relay-v0']);
  };

  {
    const refusals = [];
    const attempt = async (what, expect) => { const r = await install(); refusals.push([what, r.code === 3 && expect.test(r.out) && r.calls.length === 0 && (await untouched()), r.out.trim().split('\n').slice(-3)[0]]); };
    publish(OTHER); await attempt('signed by another key', /is not signed by the Director key/);
    publish(DIRECTOR, { extra: 'relay/extra.mjs' }); await attempt('changes another file too', /changes more than registrations\/verifier\.json/);
    publish(DIRECTOR, { edit: (s) => s.replace('"verifier"', '"sender"') }); await attempt('names another role', /is not exactly/);
    publish(DIRECTOR, { edit: (s) => s.replace(/"public_key":"[^"]+"/, '"public_key":"short"') }); await attempt('a key that is not one', /is not exactly/);
    publish(DIRECTOR, { edit: (s) => s.replace('{', '{"admin":true,') }); await attempt('one field more', /is not exactly/);
    publish(DIRECTOR, { edit: () => 'not json\n' }); await attempt('not JSON', /is not JSON/);
    const first = publish(DIRECTOR); publish(DIRECTOR, { parent: first }); await attempt('not on top of the relay commit', /is not made on top of this relay commit/);
    const wrong = refusals.filter(([, ok]) => !ok);
    t.row('I02 a verifier registration is accepted only as one Director-signed commit on top of the exact relay commit, adding exactly the one well-formed file (7 ways refused, nothing changed)',
      wrong.length === 0, wrong.map(([w, , out]) => w + ': ' + out).join(' | '));
  }
  const registrationCommit = publish(DIRECTOR);

  {
    const noRecord = await install();
    record(OTHER, [{ utc: '2026-10-01', event: 'Founder-approved change: Artifact Relay V0 at relay commit ' + HEAD, by: 'SOMEONE' }]);
    const forged = await install();
    record(DIRECTOR, [{ utc: '2026-10-01', event: 'Founder-approved change: Artifact Relay V0 at relay commit ' + '0'.repeat(40), by: 'DIRECTOR' }]);
    const otherCommit = await install();
    t.row('I03 without the Director\'s record of this exact relay commit the install is BLOCKED and nothing is changed: no record, a record not signed by the Director, a record of another commit',
      [noRecord, forged, otherCommit].every((r) => r.code === 3 && r.calls.length === 0) && /does not record the founder-approved change/.test(noRecord.out) && /is not signed by the Director key/.test(forged.out)
      && /does not record the founder-approved change/.test(otherCommit.out) && (await untouched()), [noRecord, forged, otherCommit].map((r) => r.code).join(' '));
  }
  record(DIRECTOR, [{ utc: '2026-09-30', event: 'something earlier', by: 'DIRECTOR' }, { utc: '2026-10-01', event: `Founder-approved change to the live Factory plane, outside every candidate: Artifact Relay V0 at relay commit \`${HEAD}\`.`, by: 'DIRECTOR' }]);

  // ------------------------------------------------------------------------------------------------------------------ the plan
  {
    const plan = await install(['--plan'], { token: null });
    t.row('I04 the plan needs no token, calls nothing, changes nothing, and names every change with its hash, both nodes and their keys',
      plan.code === 0 && /PLAN: nothing was changed/.test(plan.out) && plan.calls.length === 0 && (await untouched()) && plan.out.includes(pub(kW.out)) && plan.out.includes(pub(kH.out)) && plan.out.includes(W) && plan.out.includes(H)
      && /schema\s+factory_relay/.test(plan.out) && /public\.factory_relay_rpc/.test(plan.out) && plan.out.includes(BUCKET) && /JWT verification OFF/.test(plan.out) && /never reads the project's API keys/.test(plan.out)
      && plan.out.includes(sha256Hex(readFileSync(join(work, 'sql/001_artifact_relay_v0.sql')))), plan.out.trim().split('\n').at(-1));
  }

  // -------------------------------------------------------------------------------------------- what stops it before any change
  {
    const noToken = await install([], { token: null });
    const badToken = await install([], { token: 'sbp_' + 'x'.repeat(40) });
    await plane.su.query(`create policy relay_test_open on storage.objects for select to authenticated using (true)`);
    const notReady = await install();
    await plane.su.query('drop policy relay_test_open on storage.objects');
    t.row('I05 with no token, with a token the project refuses, or on a plane that fails the pre-check, the install stops and nothing is changed',
      noToken.code === 2 && noToken.calls.length === 0 && badToken.code === 1 && /access token was refused/.test(badToken.out) && notReady.code === 1 && /pre-check is not all ok/.test(notReady.out)
      && /no policy opens storage\.objects/.test(notReady.out) && (await untouched()), [noToken.code, badToken.code, notReady.code].join(' '));
    writeFileSync(join(work, 'relay', 'stray.txt'), 'x');
    const dirty = await install();
    rmSync(join(work, 'relay', 'stray.txt'));
    const original = readFileSync(join(work, 'sql', '001_artifact_relay_v0.sql'));
    writeFileSync(join(work, 'sql', '001_artifact_relay_v0.sql'), Buffer.concat([original, Buffer.from('-- one more line\n')]));
    gitAs(work, IMPLEMENTER, 'commit', '-q', '-am', 'a change the manifest does not know');
    const stale = await install();
    sh(work, 'git', ['reset', '-q', '--hard', HEAD]);
    gitAs(work, OTHER, 'commit', '-q', '--allow-empty', '-m', 'not the implementer');
    const unsigned = await install();
    sh(work, 'git', ['reset', '-q', '--hard', HEAD]);
    const real = await install(['--plan'], { settingsFile: null, token: null });
    const elsewhere = await install(['--plan'], { settingsFile: settings({ api: 'https://api.supabase.com' }), token: null });
    const production = await install(['--plan'], { settingsFile: settings({ project: 'pvphxgrtdfrudejjhzjk' }), token: null });
    t.row('I06 it applies committed, signed, manifest-true bytes only, and it cannot be pointed at another project: outside the tests the project is the Factory plane, and a test can name only a loopback stand-in',
      dirty.code === 2 && /not committed/.test(dirty.out) && stale.code === 2 && /is not the committed file MANIFEST\.sha256 lists/.test(stale.out) && unsigned.code === 2 && /not signed by the implementer key/.test(unsigned.out)
      && real.code === 2 && /project npvhuoozkbexddnvkqsj \(the dedicated NON-PRODUCTION Factory control plane\)/.test(real.out) && elsewhere.code === 2 && production.code === 2
      && [dirty, stale, unsigned, real, elsewhere, production].every((r) => r.calls.length === 0) && (await untouched()), [dirty.code, stale.code, unsigned.code, real.code, elsewhere.code, production.code].join(' '));
  }

  // ----------------------------------------------------------------------------------------------------------- the install
  {
    writeFileSync(join(cliState, 'fail-next'), '');
    const cut = await install();
    const mid = await state();
    t.row('I07 where the deploy fails the install says FAIL, says what stays applied, and leaves no function deployed',
      cut.code === 1 && /INSTALL: FAIL/.test(cut.out) && /the function was not deployed/.test(cut.out) && /stays applied/.test(cut.out) && mid.installed === true && mid.buckets === '1' && deployed() === null, cut.out.trim().split('\n').filter((l) => /FAIL/.test(l))[0]);
    await plane.su.query('grant select on factory_relay.receipts to authenticated');
    const notOk = await install();
    await plane.su.query('revoke select on factory_relay.receipts from authenticated');
    t.row('I07b where the post-check is not all ok the install stops before the function is deployed',
      notOk.code === 1 && /post-check is not all ok/.test(notOk.out) && /a relay table is granted to another role/.test(notOk.out) && deployed() === null, notOk.out.trim().split('\n').filter((l) => /FAIL/.test(l))[0]);
    const done = await install();
    if (done.code !== 0) console.log('--- the run that should pass said:\n' + done.out);
    const d = deployed();
    const reg = (await plane.su.query('select node_id, relay_role, public_key from factory_relay.nodes where active order by relay_role')).rows;
    const registry = d ? readFileSync(join(cliState, 'deployed', 'registry.ts'), 'utf8') : '';
    const receipt = JSON.parse(readFileSync(join(homes.W, 'install-receipt.json'), 'utf8'));
    t.row('I08 run again, it continues where it stopped and ends in PASS: the schema, the private bucket, the two registrations, the function with JWT verification off, and a selfcheck through the deployed function',
      done.code === 0 && /INSTALL: PASS/.test(done.out) && /the schema, in one transaction\.* ALREADY THERE/.test(done.out) && /register the two nodes\.* ALREADY THERE/.test(done.out) && /selfcheck from this node\.* OK/.test(done.out)
      && d?.verify_jwt === false && d.project === PROJECT && d.use_api === true && d.files.join() === 'index.ts,registry.ts,relay.ts' && /verify_jwt = false/.test(d.config)
      && reg.length === 2 && reg[0].node_id === W && reg[0].public_key === pub(kW.out) && reg[1].node_id === H && reg[1].public_key === pub(kH.out), done.out.trim().split('\n').slice(-3)[0]);
    t.row('I09 the deployed function is the committed code, byte for byte, plus a registry of exactly the two registered nodes',
      readFileSync(join(cliState, 'deployed', 'relay.ts')).equals(readFileSync(join(work, 'supabase/functions/factory-artifact-relay/relay.ts')))
      && readFileSync(join(cliState, 'deployed', 'index.ts')).equals(readFileSync(join(work, 'supabase/functions/factory-artifact-relay/index.ts')))
      && registry.includes(`{ node_id: "${W}", relay_role: "sender", public_key: "${pub(kW.out)}" }`) && registry.includes(`{ node_id: "${H}", relay_role: "verifier", public_key: "${pub(kH.out)}" }`)
      && (registry.match(/node_id:/g) ?? []).length === 3 && receipt.registry_sha256 === sha256Hex(registry), receipt.registry_sha256);
    const all = [cut, done].flatMap((r) => r.calls);
    const said = cut.out + done.out + JSON.stringify(receipt) + readFileSync(join(cliState, 'calls.log'), 'utf8');
    t.row('I10 the installer asks the management API for two things only (run this SQL; show the function it deployed), never for the project\'s keys; the token is in nothing it prints or keeps, nor is a project key',
      all.every((c) => c === `POST /v1/projects/${PROJECT}/database/query` || c === `GET /v1/projects/${PROJECT}/functions/factory-artifact-relay`) && !said.includes(TOKEN)
      && ![standin.keys.legacy, standin.keys.secret, standin.keys.anon].some((k) => said.includes(k)) && receipt.result === 'PASS' && receipt.commit === HEAD && receipt.function?.verify_jwt === false
      && receipt.verifier_registration.includes(registrationCommit) && receipt.steps.at(-1).outcome === 'OK' && cliLog().every((c) => c.token === true), String(all.length));
    const again = await install();
    t.row('I11 a third run changes nothing and passes', again.code === 0 && /INSTALL: PASS/.test(again.out) && !/APPLIED/.test(again.out) && deployed().version === d.version + 1, again.out.trim().split('\n').slice(-3)[0]);
    const hSelf = await relayCli(home, 'H', ['selfcheck']);
    t.row('I12 the verifier, with the key it never sent anywhere, is recognised by the installed relay', hSelf.code === 0 && /REGISTERED/.test(hSelf.out) && /as verifier/.test(hSelf.out), hSelf.out.trim());
  }

  // ----------------------------------------------------------------------------------------------- what it refuses afterwards
  {
    await plane.owner.query('select factory_relay.deactivate_node($1)', [H]);
    const H2 = 'node-' + randomBytes(4).toString('hex') + '-other';
    await plane.su.query('insert into factory.nodes (node_id, security_role, platform) values ($1, $2, $3)', [H2, 'verifier', 'win32']);
    await plane.owner.query('select factory_relay.register_node($1, $2, $3, $4)', [H2, 'verifier', pub((await relayCli(work, 'W', ['pubkey'])).out).split('').reverse().join('').replace(/^[-_]/, 'A'), 'another']);
    const other = await install();
    t.row('I13 where other nodes are registered than the two of this install, it stops and changes nothing', other.code === 1 && /other nodes or keys are registered/.test(other.out), other.out.trim().split('\n').filter((l) => /FAIL/.test(l))[0]);
  }

  // ----------------------------------------------------------------------------------------------------------------- removal
  {
    standin.objects.set('candidate/x/y/z.zip', Buffer.from('x'));
    await plane.su.query(`insert into storage.objects (bucket_id, name) values ($1, 'candidate/x/y/z.zip')`, [BUCKET]);
    const held = await install(['--uninstall']);
    const stillThere = (await state()).installed === true && deployed() !== null;
    await plane.su.query('delete from storage.objects where bucket_id = $1', [BUCKET]);
    const removed = await install(['--uninstall']);
    const fp1 = (await plane.su.query(FINGERPRINT)).rows[0].f;
    const again = await install(['--uninstall']);
    t.row('I14 the removal refuses while the bucket holds an object; with the bucket empty it removes the function, the bucket, the schema and the wrapper, and the plane is as it was before the install',
      held.code === 1 && /still holds 1 object/.test(held.out) && stillThere && removed.code === 0 && /REMOVAL: PASS/.test(removed.out) && (await untouched())
      && JSON.stringify(fp1) === JSON.stringify(fp0) && again.code === 0, [held.code, removed.code, again.code].join(' '));
  }

  // ------------------------------------------------------------------------------------------------- the founder's one command
  if (process.platform === 'win32') {
    const ps = async (args, env) => {
      try { const r = await run('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', join(work, 'relay', 'install.ps1'), ...args], { env: { ...process.env, RELAY_HOME: homes.W, RELAY_ALLOW_LOOPBACK: '1', RELAY_INSTALL_TEST_SETTINGS: SETTINGS, FAKE_CLI_STATE: cliState, FAKE_CLI_TOKEN: TOKEN, ...env }, timeout: 240000 }); return { code: 0, out: r.stdout + r.stderr }; }
      catch (x) { return { code: typeof x.code === 'number' ? x.code : -1, out: (x.stdout ?? '') + (x.stderr ?? '') }; }
    };
    const e0 = { ...process.env }; delete e0.SUPABASE_ACCESS_TOKEN;
    const plan = await ps(['-Plan'], { SUPABASE_ACCESS_TOKEN: '' });
    const noToken = await ps([], { SUPABASE_ACCESS_TOKEN: '' });
    const whole = await ps([], { SUPABASE_ACCESS_TOKEN: TOKEN });
    const undo = await ps(['-Uninstall'], { SUPABASE_ACCESS_TOKEN: TOKEN });
    t.row('I15 relay/install.ps1 is the one command: -Plan needs no token, a run with no token and no way to ask for one stops, a run with the token installs and passes, -Uninstall removes it',
      plan.code === 0 && /PLAN: nothing was changed/.test(plan.out) && noToken.code === 2 && /no access token/.test(noToken.out) && whole.code === 0 && /INSTALL: PASS/.test(whole.out)
      && undo.code === 0 && /REMOVAL: PASS/.test(undo.out) && (await untouched()) && !(plan.out + noToken.out + whole.out + undo.out).includes(TOKEN), [plan.code, noToken.code, whole.code, undo.code].join(' '));
  } else {
    console.log('NOT RUN: I15 (relay/install.ps1 is checked on Windows)');
  }
  code = t.done();
} catch (e) {
  console.log('FAIL the run crashed - ' + (e.stack ?? e));
} finally {
  for (const s of servers) { s.closeAllConnections?.(); s.close(); }
  await plane.stop();
  for (let i = 0; i < 20; i++) { try { rmSync(base, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
}
process.exit(code);

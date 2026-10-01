// END TO END, locally: the node command, the Edge Function's own code, the database half on a disposable plane, and a stand-in for
// the project's REST endpoints (PostgREST's rpc route and the Storage object routes). The function is run twice: inside Node, and
// under Deno. The stand-in is a MODEL of the hosted API; the hosted runtime, storage and gateway are measured only on a live request.
//   RELAY_TEST_MODULES=<node_modules> node test/e2e.mjs [--no-deno]
// RELAY_FUNCTION_FILE and RELAY_CLI_DIR point it at a copy of the function or of relay/ (the mutation proof, test/e2e_mutation.mjs).
import { createServer } from 'node:http';
import { execFile, spawn, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createPrivateKey, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startPlane, ROOT, BUCKET, reporter } from './plane.mjs';
import { CANDIDATE, makeBundle, newSigningKey, sha256Hex } from './helpers.mjs';
import { call, signedMessage } from '../relay/lib/client.mjs';
import { startStandIn } from './standin.mjs';

const NO_DENO = process.argv.includes('--no-deno');
const FUNCTION_FILE = process.env.RELAY_FUNCTION_FILE ?? join(ROOT, 'supabase/functions/factory-artifact-relay/relay.ts');
const CLI = join(process.env.RELAY_CLI_DIR ?? join(ROOT, 'relay'), 'relay.mjs');
const t = reporter('artifact relay end to end' + (NO_DENO ? ' (WITHOUT the Deno rows)' : ''));
const run = promisify(execFile);
const work = mkdtempSync(join(tmpdir(), 'relay-e2e-'));
const listen = (server) => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port)));
const readBody = async (req) => { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); };

const plane = await startPlane({ bucket: 'none' });
const servers = [];
let denoChild = null;
let code = 1;
try {
  await plane.applyFile('sql/001_artifact_relay_v0.sql');
  await plane.applyFile('sql/002_private_bucket.sql');
  // ------------------------------------------------------------------------------- the stand-in for the project's REST endpoints
  const standin = await startStandIn(plane);
  servers.push({ close: standin.close });
  const { objects, faults, keysSeen } = standin;
  const { legacy: LEGACY_KEY, deadLegacy: DEAD_LEGACY_KEY, secret: SECRET_KEY, anon: ANON_KEY } = standin.keys;
  const PLATFORM_SECRETS = [LEGACY_KEY, DEAD_LEGACY_KEY, SECRET_KEY];
  const supabaseUrl = standin.url;

  // ------------------------------------------------------------------------------------- the Edge Function's code, inside Node
  const { makeHandler, platformKeys } = await import(pathToFileURL(FUNCTION_FILE).href);
  const answers = [], inbound = [];
  let registry = [];
  let handler = makeHandler({ supabaseUrl, serviceKeys: [LEGACY_KEY], registry }, fetch);
  const ROUTE = 'http://127.0.0.1/functions/v1/factory-artifact-relay';
  /** a request signed as a node would sign it, for calling a handler directly */
  const signedRequest = (keyObject, node, op, payload = {}) => {
    const ts = String(Date.now()), nonce = randomBytes(16).toString('hex'), body = JSON.stringify({ op, payload });
    return new Request(ROUTE, { method: 'POST', headers: { 'x-relay-node': node, 'x-relay-action': op, 'x-relay-ts': ts, 'x-relay-nonce': nonce,
      'x-relay-sig': sign(null, signedMessage(op, node, ts, nonce, sha256Hex(Buffer.from(body))), keyObject).toString('base64url') }, body });
  };
  const fnServer = createServer(async (req, res) => {
    const body = await readBody(req);
    inbound.push(JSON.stringify(req.headers) + body.toString('latin1'));
    const response = await handler(new Request('http://127.0.0.1' + req.url, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : body }));
    const out = Buffer.from(await response.arrayBuffer());
    answers.push(out.toString('utf8'));
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(out);
  });
  servers.push(fnServer);
  const nodeUrl = 'http://127.0.0.1:' + (await listen(fnServer)) + '/functions/v1/factory-artifact-relay';

  // --------------------------------------------------------------------------------------------------------------- the two nodes
  const W = 'node-' + randomBytes(4).toString('hex') + '-work', H = 'node-' + randomBytes(4).toString('hex') + '-home';
  await plane.su.query('insert into factory.nodes (node_id, security_role, platform) values ($1, $2, $3), ($4, $5, $6)', [W, 'implementer', 'win32', H, 'verifier', 'win32']);
  const home = { W: join(work, 'home-work'), H: join(work, 'home-verifier'), X: join(work, 'home-stranger') };
  const cli = async (who, args) => {
    try { const r = await run(process.execPath, [CLI, ...args], { env: { ...process.env, RELAY_HOME: home[who], RELAY_ALLOW_LOOPBACK: '1' }, timeout: 180000 }); return { code: 0, out: r.stdout }; }
    catch (e) { return { code: typeof e.code === 'number' ? e.code : -1, out: (e.stdout ?? '') + (e.stderr ?? '') }; }
  };
  const config = (who) => JSON.parse(readFileSync(join(home[who], 'config.json'), 'utf8'));
  const pointAt = (url) => { for (const who of ['W', 'H', 'X']) if (existsSync(join(home[who], 'config.json'))) writeFileSync(join(home[who], 'config.json'), JSON.stringify({ ...config(who), url }, null, 2)); };
  /** a signed request made by the test itself with a node's own key: what a node could send without the command's own checks */
  const as = async (who, op, payload = {}) => { process.env.RELAY_HOME = home[who]; process.env.RELAY_ALLOW_LOOPBACK = '1'; return call(config(who), op, payload); };
  const pub = (out) => /public_key\s+(\S+)/.exec(out)?.[1];
  const state = async (id) => (await plane.su.query('select delivery_state from factory_relay.artifacts where artifact_id = $1', [id])).rows[0]?.delivery_state;
  const receipts = async (id) => (await plane.su.query('select state, actor_node_id, detail from factory_relay.receipts where artifact_id = $1 order by seq', [id])).rows;
  const artifactOf = (out) => /artifact ([0-9a-f-]{36})/.exec(out)?.[1];

  const insecure = await cli('X', ['keygen', '--node', W, '--role', 'sender', '--url', 'http://relay.example.com/functions/v1/factory-artifact-relay']);
  t.row('E01 a node refuses a relay address that is not https', insecure.code === 2 && /must be https/.test(insecure.out) && !existsSync(join(home.X, 'relay.ed25519.pem')), insecure.out.trim());
  const kW = await cli('W', ['keygen', '--node', W, '--role', 'sender', '--url', nodeUrl]);
  const kH = await cli('H', ['keygen', '--node', H, '--role', 'verifier', '--url', nodeUrl]);
  const again = await cli('W', ['keygen', '--node', W, '--role', 'sender', '--url', nodeUrl]);
  const before = await cli('W', ['selfcheck']);
  t.row('E02 each node makes its own key, never overwrites it, and is nobody to the relay until the founder registers it',
    kW.code === 0 && kH.code === 0 && /^[A-Za-z0-9_-]{43}$/.test(pub(kW.out) ?? '') && pub(kW.out) !== pub(kH.out) && again.code === 2 && /not overwritten/.test(again.out)
    && before.code === 5 && /not_authenticated/.test(before.out), before.out.trim());
  // the founder's registration statement, with its four placeholders filled from what each node printed
  const registered = await plane.owner.query(readFileSync(join(ROOT, 'sql/010_register_nodes.template.sql'), 'utf8')
    .replace('<WORK NODE ID>', W).replace('<WORK RELAY PUBLIC KEY>', pub(kW.out)).replace('<HOME NODE ID>', H).replace('<HOME RELAY PUBLIC KEY>', pub(kH.out)));
  if (registered.rows.length !== 2) throw new Error('the registration statement did not register two nodes');
  // and the function is deployed with the same two registrations (the installer writes them into registry.ts)
  registry = [{ node_id: W, relay_role: 'sender', public_key: pub(kW.out) }, { node_id: H, relay_role: 'verifier', public_key: pub(kH.out) }];
  handler = makeHandler({ supabaseUrl, serviceKeys: [LEGACY_KEY], registry }, fetch);
  const after = await cli('W', ['selfcheck']);
  t.row('E03 a registered node is recognised, and told that the bucket is private and both ends are registered',
    after.code === 0 && /REGISTERED/.test(after.out) && /bucket private/.test(after.out) && /verifier registered: true/.test(after.out), after.out.trim());

  const lost = await cli('X', ['keygen', '--node', W, '--role', 'sender', '--url', supabaseUrl + '/functions/v1/not-the-relay']);
  const lostCheck = await cli('X', ['selfcheck']);
  t.row('E04 an address that answers but is not the relay is named as such, with what it said',
    lost.code === 0 && lostCheck.code === 5 && /NOT READY\s+not_a_relay_answer \(not found\) \[404\]/.test(lostCheck.out), lostCheck.out.trim());

  // ------------------------------------------------------------------------------------------------------------ the bundles
  const trusted = newSigningKey();
  const writeBundle = (name, b) => {
    const dir = join(work, name); mkdirSync(dir, { recursive: true });
    const archive = join(dir, b.archiveName);
    writeFileSync(archive, b.archive); writeFileSync(archive + '.sha256', b.sha256File); writeFileSync(archive + '.sha256.sig', b.signatureFile);
    return archive;
  };
  const unique = (tag) => ({ files: (m) => { const k = [...m.keys()][1]; m.set(k, Buffer.from('readme ' + tag + ' ' + randomBytes(8).toString('hex') + '\n')); return m; } });
  const intake = join(work, 'intake');
  const trustFp = makeBundle({ key: trusted }).fingerprint;

  /** the whole delivery, through whichever function `label` runs on */
  async function delivery(label, ids) {
    const b = makeBundle({ key: trusted, change: unique(label) });
    const archive = writeBundle('bundle-' + label, b);
    const sent = await cli('W', ['send', '--archive', archive, '--candidate', CANDIDATE]);
    const id = artifactOf(sent.out);
    const stored = [...objects.keys()].filter((p) => p.startsWith(`candidate/${CANDIDATE}/${id}/`)).sort();
    const bytesOk = stored.length === 3 && objects.get(`candidate/${CANDIDATE}/${id}/${b.archiveName}`).equals(b.archive)
      && objects.get(`candidate/${CANDIDATE}/${id}/${b.archiveName}.sha256`).equals(b.sha256File) && objects.get(`candidate/${CANDIDATE}/${id}/${b.archiveName}.sha256.sig`).equals(b.signatureFile);
    t.row(`${ids[0]} [${label}] the sender uploads the archive, its hash and its signature in one command; the bucket holds exactly those bytes; the artifact is UPLOADED`,
      sent.code === 0 && /ARTIFACT UPLOADED/.test(sent.out) && /receipts: chained and signed/.test(sent.out) && bytesOk && (await state(id)) === 'UPLOADED', sent.out.split('\n').slice(-3).join(' '));
    const resent = await cli('W', ['send', '--archive', archive, '--candidate', CANDIDATE]);
    t.row(`${ids[1]} [${label}] sending the same bundle again changes nothing`, resent.code === 0 && /EXISTING/.test(resent.out) && artifactOf(resent.out) === id
      && (await receipts(id)).length === 2 && [...objects.keys()].filter((p) => p.includes(id)).length === 3,
      [resent.code, artifactOf(resent.out) === id, (await receipts(id)).length, resent.out.split('\n').find((l) => /EXISTING|CREATED|STOPPED/.test(l))].join(' | '));
    const got = await cli('H', ['receive', '--trust-fingerprint', trustFp, '--intake-dir', intake]);
    const dir = join(intake, b.archiveName.replace(/\.zip$/, '') + '_' + id);
    let files = false, info = null, kept = null;
    try {
      files = [...b.files].every(([name, data]) => readFileSync(join(dir, 'bundle', ...name.split('/'))).equals(data))
        && readFileSync(join(dir, 'delivered', b.archiveName)).equals(b.archive) && readFileSync(join(dir, 'delivered', b.archiveName + '.sha256.sig')).equals(b.signatureFile);
      info = JSON.parse(readFileSync(join(dir, 'INTAKE.json'), 'utf8')); kept = JSON.parse(readFileSync(join(dir, 'RECEIPTS.json'), 'utf8'));
    } catch (e) { info = { error: e.message }; }
    const order = got.out.indexOf('VERIFIED   before extraction') < got.out.indexOf('CONSUMED') && got.out.indexOf('DELIVERED') < got.out.indexOf('VERIFIED   before extraction');
    t.row(`${ids[2]} [${label}] the verifier receives, authenticates and verifies before it extracts, then begins intake: the five files are in its intake directory, byte for byte`,
      got.code === 0 && order && /CANDIDATE #2 INTAKE READY/.test(got.out) && files && info?.archive_sha256 === sha256Hex(b.archive) && info?.signer === trustFp
      && info?.checks?.length === 5 && info.checks.every((c) => c.ok) && info?.files?.length === 5 && kept?.receipts?.length === 5 && (await state(id)) === 'CONSUMED'
      && kept.receipts.slice(2).every((r) => typeof r.request_body === 'string' && JSON.parse(r.request_body).payload.state === r.state && JSON.parse(r.request_body).payload.artifact_id === id),
      got.out.split('\n').filter((l) => /REFUSED|STOPPED|READY/.test(l)).join(' ') + (info?.error ?? ''));
    const rc = await receipts(id);
    const seen = await cli('W', ['status', '--artifact', id]);
    t.row(`${ids[3]} [${label}] the receipts are CREATED, UPLOADED, DELIVERED, VERIFIED, CONSUMED, and the sender can check that the verifier's own key signed the last three`,
      rc.map((r) => r.state).join(' ') === 'CREATED UPLOADED DELIVERED VERIFIED CONSUMED' && rc.slice(0, 2).every((r) => r.actor_node_id === W) && rc.slice(2).every((r) => r.actor_node_id === H)
      && seen.code === 0 && /delivery state\s+CONSUMED/.test(seen.out) && /receipts: chained and signed/.test(seen.out)
      && (seen.out.match(new RegExp('signed by ' + H + ' \\(key ' + pub(kH.out) + '\\)', 'g')) ?? []).length === 3, rc.map((r) => r.state).join(' '));
    const empty = await cli('H', ['receive']);
    t.row(`${ids[4]} [${label}] there is nothing left to receive`, empty.code === 3 && /nothing to receive/.test(empty.out), empty.out.trim().split('\n').at(-1));
    return { id, b, dir };
  }

  const first = await delivery('node', ['E10', 'E11', 'E12', 'E13', 'E14']);

  {
    const env = (o) => (name) => o[name];
    const k = [platformKeys(env({ SUPABASE_SERVICE_ROLE_KEY: LEGACY_KEY })), platformKeys(env({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET_KEY }) })),
      platformKeys(env({ SUPABASE_SERVICE_ROLE_KEY: LEGACY_KEY, SUPABASE_SECRET_KEYS: JSON.stringify({ other: 'sb_secret_' + 'b'.repeat(30), default: SECRET_KEY }) })),
      platformKeys(env({ SUPABASE_SECRET_KEYS: 'not json', SUPABASE_SERVICE_ROLE_KEY: 'short' })), platformKeys(env({ SUPABASE_SECRET_KEYS: '["x"]' })), platformKeys(env({}))];
    const keyless = makeHandler({ supabaseUrl, serviceKeys: [], registry }, fetch);
    const none = await keyless(signedRequest(createPrivateKey(readFileSync(join(home.W, 'relay.ed25519.pem'))), W, 'selfcheck'));
    const noneToStranger = await keyless(signedRequest(generateKeyPairSync('ed25519').privateKey, W, 'selfcheck'));
    if (noneToStranger.status !== 401) throw new Error('a function with no project key told a caller that is not a registered node about itself');
    t.row('E16 the function takes the project key only from what the platform injects (the legacy key, then the secret-key dictionary), and with none it tells a registered node that it is misconfigured',
      JSON.stringify(k[0]) === JSON.stringify([LEGACY_KEY]) && JSON.stringify(k[1]) === JSON.stringify([SECRET_KEY]) && k[2].length === 3 && k[2][0] === LEGACY_KEY && k[2][1] === SECRET_KEY
      && k[3].length === 0 && k[4].length === 0 && k[5].length === 0 && none.status === 503 && (await none.json()).refused === 'relay_misconfigured', k.map((x) => x.length).join(' ') + ' ' + none.status);
  }

  {
    const secretOnly = makeHandler({ supabaseUrl, serviceKeys: [DEAD_LEGACY_KEY, SECRET_KEY], registry }, fetch);
    const key = createPrivateKey(readFileSync(join(home.W, 'relay.ed25519.pem')));
    const ask = () => secretOnly(signedRequest(key, W, 'selfcheck'));
    keysSeen.clear();
    const r1 = await ask(), r2 = await ask();
    t.row('E17 where the legacy key is dead the function finds the secret key among what the platform injects, sends it on the apikey header alone, and keeps to it',
      r1.status === 200 && r2.status === 200 && keysSeen.size === 1 && keysSeen.has('secret'), r1.status + ' ' + r2.status + ' ' + [...keysSeen].join());
  }
  {
    const tamper = async (sql, params) => { await plane.su.query('begin'); await plane.su.query('set local session_replication_role = replica'); await plane.su.query(sql, params); await plane.su.query('commit'); };
    const orig = (await plane.su.query('select hash, actor_public_key from factory_relay.receipts where artifact_id = $1 and seq = 3', [first.id])).rows[0];
    await tamper('update factory_relay.receipts set hash = $2 where artifact_id = $1 and seq = 3', [first.id, sha256Hex('altered')]);
    const brokenChain = await cli('W', ['status', '--artifact', first.id]);
    await tamper('update factory_relay.receipts set hash = $2, actor_public_key = $3 where artifact_id = $1 and seq = 3', [first.id, orig.hash, pub(kW.out)]);
    const wrongKey = await cli('W', ['status', '--artifact', first.id]);
    await tamper('update factory_relay.receipts set actor_public_key = $2 where artifact_id = $1 and seq = 3', [first.id, orig.actor_public_key]);
    const restored = await cli('W', ['status', '--artifact', first.id]);
    t.row('E35 a receipt altered in the database is seen by the reader: a chain that no longer links, or a request the recorded key did not sign',
      brokenChain.code === 5 && /CHAIN BROKEN/.test(brokenChain.out) && /receipts: NOT VERIFIED/.test(brokenChain.out) && wrongKey.code === 5 && /SIGNATURE NOT VERIFIED/.test(wrongKey.out)
      && !/CHAIN BROKEN/.test(wrongKey.out) && restored.code === 0 && /receipts: chained and signed/.test(restored.out), [brokenChain.code, wrongKey.code, restored.code].join(' '));
  }

  // ------------------------------------------------------------------------------------------------- what a node holds and sees
  {
    const held = [];
    for (const who of ['W', 'H']) for (const f of readdirSync(home[who])) { held.push(who + '/' + f); if (PLATFORM_SECRETS.some((k) => readFileSync(join(home[who], f), 'utf8').includes(k))) held.push('PLATFORM KEY IN ' + f); }
    const leaked = answers.some((a) => PLATFORM_SECRETS.some((k) => a.includes(k)) || a.includes(supabaseUrl) || /token=|signedURL|signed_url/i.test(a));
    // a node's private key never leaves the node: neither its PEM body nor its raw scalar is in anything a node sent
    const privates = ['W', 'H'].flatMap((who) => { const k = createPrivateKey(readFileSync(join(home[who], 'relay.ed25519.pem'))); return [k.export({ format: 'jwk' }).d, k.export({ format: 'pem', type: 'pkcs8' }).split('\n')[1]]; });
    const sentKey = inbound.some((r) => privates.some((d) => r.includes(d)));
    const direct = await fetch(supabaseUrl + '/storage/v1/object/' + BUCKET + '/' + `candidate/${CANDIDATE}/${first.id}/${first.b.archiveName}`, { headers: { authorization: 'Bearer ' + ANON_KEY, apikey: ANON_KEY } });
    // a secret key sent as a bearer token is not accepted by the hosted API, and the stand-in holds the function to that
    const asBearer = await fetch(supabaseUrl + '/rest/v1/rpc/factory_relay_rpc', { method: 'POST', headers: { authorization: 'Bearer ' + SECRET_KEY, apikey: SECRET_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ request: { fn: 'node_key', node_id: W } }) });
    if (asBearer.status !== 401) held.push('THE STAND-IN ACCEPTS A SECRET KEY AS A BEARER TOKEN');
    const directRpc = await fetch(supabaseUrl + '/rest/v1/rpc/factory_relay_rpc', { method: 'POST', headers: { authorization: 'Bearer ' + ANON_KEY, apikey: ANON_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ request: { fn: 'node_key', node_id: W } }) });
    t.row('E15 a node holds its own key and settings and nothing of the platform, and its private key is in nothing it sends; no answer of the relay carries a platform credential, address or signed URL; without the service key neither the bucket nor the database entry answers',
      held.sort().join() === 'H/config.json,H/relay.ed25519.pem,W/config.json,W/relay.ed25519.pem' && !leaked && !sentKey && inbound.length >= 10 && direct.status !== 200 && directRpc.status === 403,
      held.join() + ' ' + direct.status + ' ' + directRpc.status + ' requests=' + inbound.length);
  }

  // ------------------------------------------------------------------------------------------------------------- who may do what
  {
    const wrongSend = await cli('H', ['send', '--archive', join(work, 'bundle-node', first.b.archiveName), '--candidate', CANDIDATE]);
    const wrongReceive = await cli('W', ['receive', '--trust-fingerprint', trustFp, '--intake-dir', intake]);
    const otherSigner = await cli('W', ['send', '--archive', join(work, 'bundle-node', first.b.archiveName), '--candidate', CANDIDATE, '--fingerprint', 'SHA256:' + 'A'.repeat(43)]);
    const f = [{ kind: 'archive', name: 'X.zip', size: 10, sha256: sha256Hex('a') }, { kind: 'sha256', name: 'X.zip.sha256', size: 10, sha256: sha256Hex('b') }, { kind: 'signature', name: 'X.zip.sha256.sig', size: 10, sha256: sha256Hex('c') }];
    const tries = [await as('H', 'create', { candidate_sha: CANDIDATE, signing_fingerprint: trustFp, archive_name: 'X.zip', files: f }), await as('W', 'inbox'),
      await as('W', 'download', { artifact_id: first.id, kind: 'archive' }), await as('W', 'receipt', { artifact_id: first.id, state: 'REFUSED' }),
      await as('H', 'upload', { artifact_id: first.id, kind: 'archive', content_b64: Buffer.from('x').toString('base64') })];
    t.row('E20 the verifier cannot send and the sender cannot receive: the command stops, and the relay refuses the same request made without the command',
      wrongSend.code === 2 && wrongReceive.code === 2 && tries.every((r) => r.status === 403), tries.map((r) => r.status + ' ' + r.body.refused).join(', '));
    t.row('E23 the sender\'s command sends nothing that is not signed by the identity it was told to expect', otherSigner.code === 2 && /is signed by SHA256:\S+, not by SHA256:A+/.test(otherSigner.out), otherSigner.out.trim().split('\n').at(-1));
  }

  // ------------------------------------------------------------------------------------------------------------- authentication
  {
    const key = createPrivateKey(readFileSync(join(home.W, 'relay.ed25519.pem')));
    const stranger = generateKeyPairSync('ed25519').privateKey;
    const post = async ({ node = W, by = key, body = JSON.stringify({ op: 'selfcheck', payload: {} }), ts = String(Date.now()), nonce = randomBytes(16).toString('hex'), signedBody = body, signedAction, headers = {}, method = 'POST' }) => {
      let action = 'selfcheck';
      try { const op = JSON.parse(body).op; if (typeof op === 'string' && /^[a-z]{1,20}$/.test(op)) action = op; } catch { /* a body that is not JSON goes out under the default action */ }
      const sig = sign(null, signedMessage(signedAction ?? action, node, ts, nonce, sha256Hex(Buffer.from(signedBody))), by).toString('base64url');
      const r = await fetch(nodeUrl, { method, headers: { 'content-type': 'application/json', 'x-relay-node': node, 'x-relay-action': action, 'x-relay-ts': ts, 'x-relay-nonce': nonce, 'x-relay-sig': sig, ...headers }, body: method === 'GET' ? undefined : body });
      return { status: r.status, body: await r.json().catch(() => ({})), sent: { node, action, ts, nonce, sig, body } };
    };
    const good = await post({});
    const replay = await fetch(nodeUrl, { method: 'POST', headers: { 'x-relay-node': good.sent.node, 'x-relay-action': good.sent.action, 'x-relay-ts': good.sent.ts, 'x-relay-nonce': good.sent.nonce, 'x-relay-sig': good.sent.sig }, body: good.sent.body });
    const denied = [await post({ by: stranger }), await post({ node: 'node-unknown-0000' }), await post({ signedBody: '{"op":"inbox","payload":{}}' }), await post({ node: H }), await post({ signedAction: 'status' }),
      await post({ ts: String(Date.now() - 600000) }), await post({ ts: String(Date.now() + 600000) }), await post({ headers: { 'x-relay-sig': 'A'.repeat(86) } }),
      await post({ headers: { 'x-relay-sig': '' } }), await post({ headers: { 'x-relay-nonce': 'zz' } }), await post({ headers: { 'x-relay-node': '' } })];
    t.row('E21 a request is accepted only when the registered key of that node signed exactly that action and body, now, and once',
      good.status === 200 && replay.status === 409 && (await replay.json()).refused === 'replayed_request' && denied.every((r) => r.status === 401 && r.body.refused === 'not_authenticated'),
      good.status + ' ' + replay.status + ' ' + denied.map((r) => r.status).join(' '));
    const odd = [await post({ method: 'GET' }), await post({ body: 'not json' }), await post({ body: '[]' }), await post({ body: JSON.stringify({ op: 'selfcheck', payload: 'x' }) }),
      await post({ body: JSON.stringify({ op: 'explode', payload: {} }) }), await post({ body: JSON.stringify({ op: 'upload', payload: { artifact_id: first.id, kind: 'archive', content_b64: '!!!' } }) }),
      await post({ body: JSON.stringify({ op: 'x', payload: { pad: 'a'.repeat(1500000) } }) })];
    t.row('E22 a request of the wrong shape or size is refused by name',
      odd.map((r) => r.status).join(' ') === '405 400 400 400 400 400 413', odd.map((r) => r.status + ':' + r.body.refused).join(' '));
  }

  // --------------------------------------------------------------------------------------------- a bundle the verifier must refuse
  const intakeDirs = () => (existsSync(intake) ? readdirSync(intake).sort().join() : '');
  {
    const forged = makeBundle({ key: newSigningKey(), change: unique('forged') });
    const sent = await cli('W', ['send', '--archive', writeBundle('bundle-forged', forged), '--candidate', CANDIDATE]);
    const id = artifactOf(sent.out), was = intakeDirs();
    const got = await cli('H', ['receive']);
    const rc = await receipts(id);
    t.row('E30 a bundle signed by a key the verifier does not trust is delivered, refused at the signature and never extracted, with a receipt that says why',
      sent.code === 0 && got.code === 4 && /REFUSED\s+signature/.test(got.out) && /nothing was extracted/.test(got.out) && intakeDirs() === was && (await state(id)) === 'REFUSED'
      && rc.map((r) => r.state).join(' ') === 'CREATED UPLOADED DELIVERED REFUSED' && rc.at(-1).detail.check === 'signature' && rc.at(-1).detail.signer === forged.fingerprint, got.out.split('\n').filter((l) => /REFUSED/.test(l)).join(' '));

    // an archive that climbs out of the intake directory: the sender's command will not send it, so it is uploaded without the command
    const climbing = makeBundle({ key: trusted, change: { ...unique('climb'), entries: (l) => [...l, { name: '../../climbed.md', data: 'outside' }] } });
    const stopped = await cli('W', ['send', '--archive', writeBundle('bundle-climb', climbing), '--candidate', CANDIDATE]);
    const files = [['archive', climbing.archiveName, climbing.archive], ['sha256', climbing.archiveName + '.sha256', climbing.sha256File], ['signature', climbing.archiveName + '.sha256.sig', climbing.signatureFile]];
    const created = await as('W', 'create', { candidate_sha: CANDIDATE, signing_fingerprint: climbing.fingerprint, archive_name: climbing.archiveName, files: files.map(([kind, name, bytes]) => ({ kind, name, size: bytes.length, sha256: sha256Hex(bytes) })) });
    const cid = created.body.artifact?.artifact_id;
    for (const [kind, , bytes] of files) await as('W', 'upload', { artifact_id: cid, kind, content_b64: bytes.toString('base64') });
    const was2 = intakeDirs();
    const got2 = await cli('H', ['receive']);
    const rc2 = await receipts(cid);
    t.row('E31 an archive with a path that climbs out is not sent by the sender\'s command, and when it is uploaded anyway the verifier refuses it and writes nothing anywhere',
      stopped.code === 2 && /would be refused by the recipient \(archive_paths\)/.test(stopped.out) && got2.code === 4 && /REFUSED\s+archive_paths/.test(got2.out) && intakeDirs() === was2
      && !existsSync(join(work, 'climbed.md')) && !existsSync(join(intake, '..', 'climbed.md')) && rc2.at(-1).state === 'REFUSED' && rc2.at(-1).detail.check === 'archive_paths', got2.out.split('\n').filter((l) => /REFUSED/.test(l)).join(' '));

    // the sender's claim in the record is false: the bundle is signed by the trusted key, but the record names another signer
    const honest = makeBundle({ key: trusted, change: unique('claim') });
    const hf = [['archive', honest.archiveName, honest.archive], ['sha256', honest.archiveName + '.sha256', honest.sha256File], ['signature', honest.archiveName + '.sha256.sig', honest.signatureFile]];
    const claimed = await as('W', 'create', { candidate_sha: CANDIDATE, signing_fingerprint: forged.fingerprint, archive_name: honest.archiveName, files: hf.map(([kind, name, bytes]) => ({ kind, name, size: bytes.length, sha256: sha256Hex(bytes) })) });
    const hid = claimed.body.artifact?.artifact_id;
    for (const [kind, , bytes] of hf) await as('W', 'upload', { artifact_id: hid, kind, content_b64: bytes.toString('base64') });
    const was3 = intakeDirs();
    const got3 = await cli('H', ['receive']);
    const rc3 = await receipts(hid);
    t.row('E34 a delivery whose record names another signer than the key that signed is refused, although that key is the trusted one',
      got3.code === 4 && /relay record names another signing identity/.test(got3.out) && rc3.at(-1)?.state === 'REFUSED' && rc3.at(-1).detail.check === 'signature' && intakeDirs() === was3, got3.out.split('\n').filter((l) => /REFUSED|STOPPED/.test(l)).join(' '));

    // the verifier's own settings are wrong (an intake directory inside a git work tree): that is not the bundle's fault, so no receipt is written
    const pending = makeBundle({ key: trusted, change: unique('pending') });
    const sent3 = await cli('W', ['send', '--archive', writeBundle('bundle-pending', pending), '--candidate', CANDIDATE]);
    const pid = artifactOf(sent3.out);
    const repo = join(work, 'a-repo'); mkdirSync(join(repo, '.git'), { recursive: true });
    const inRepo = await cli('H', ['receive', '--intake-dir', join(repo, 'intake')]);
    const cloud = await cli('H', ['receive', '--intake-dir', join(work, 'OneDrive - Test', 'intake')]);
    const noTrust = await cli('H', ['receive', '--trust-fingerprint', 'not-a-fingerprint']);
    t.row('E32 the verifier will not put private material inside a git work tree or a cloud-synced folder, nor verify without a trusted fingerprint; it stops before any receipt',
      inRepo.code === 2 && /git work tree/.test(inRepo.out) && cloud.code === 2 && /cloud-synced/.test(cloud.out) && noTrust.code === 2 && (await state(pid)) === 'UPLOADED' && (await receipts(pid)).length === 2,
      [inRepo.code, cloud.code, noTrust.code, await state(pid)].join(' '));

    // --------------------------------------------------------------------------------------------- a receive that was cut off
    {
      const sendNew = async (tag) => artifactOf((await cli('W', ['send', '--archive', writeBundle('bundle-' + tag, makeBundle({ key: trusted, change: unique(tag) })), '--candidate', CANDIDATE])).out);
      const a1 = await sendNew('resume-delivered');
      await as('H', 'receipt', { artifact_id: a1, state: 'DELIVERED', detail: {} });
      const r1 = await cli('H', ['receive']);
      const a2 = await sendNew('resume-verified');
      await as('H', 'receipt', { artifact_id: a2, state: 'DELIVERED', detail: {} });
      await as('H', 'receipt', { artifact_id: a2, state: 'VERIFIED', detail: {} });
      const r2 = await cli('H', ['receive']);
      const a3 = await sendNew('resume-extracted');
      faults.consumeFails = 1;
      const cut = await cli('H', ['receive']);
      const mid = await state(a3), dirs = intakeDirs();
      const r3 = await cli('H', ['receive']);
      const order = 'CREATED UPLOADED DELIVERED VERIFIED CONSUMED';
      t.row('E33 a receive that was cut off after DELIVERED, after VERIFIED, or after the files were extracted is finished by the same command, with one receipt per state and one intake directory',
        r1.code === 0 && (await receipts(a1)).map((r) => r.state).join(' ') === order && r2.code === 0 && (await receipts(a2)).map((r) => r.state).join(' ') === order
        && cut.code === 5 && mid === 'VERIFIED' && r3.code === 0 && /already in place/.test(r3.out) && intakeDirs() === dirs && (await receipts(a3)).map((r) => r.state).join(' ') === order
        && !intakeDirs().includes('.partial-'), [r1.code, r2.code, cut.code, mid, r3.code].join(' '));
    }

    // ---------------------------------------------------------------------------------------------- storage that misbehaves
    const qid = artifactOf((await cli('W', ['send', '--archive', writeBundle('bundle-corrupt', makeBundle({ key: trusted, change: unique('corrupt') })), '--candidate', CANDIDATE])).out);
    faults.corrupt = true;
    const bad = await cli('H', ['receive']);
    faults.corrupt = false;
    const stillThere = (await state(qid)) === 'UPLOADED' && (await receipts(qid)).length === 2;
    const good = await cli('H', ['receive']);
    t.row('E40 bytes in the bucket that are no longer the recorded ones are never handed to a node; the artifact stays as it was and is received once the bytes are right',
      bad.code === 5 && /stored_object_mismatch/.test(bad.out) && stillThere && good.code === 0 && (await state(qid)) === 'CONSUMED', bad.out.trim().split('\n').at(-1));
  }
  {
    const b = makeBundle({ key: trusted, change: unique('faults') });
    const archive = writeBundle('bundle-faults', b);
    faults.putFails = 1;
    const cut = await cli('W', ['send', '--archive', archive, '--candidate', CANDIDATE]);
    const id = artifactOf(cut.out);
    const mid = await state(id);
    faults.finishFails = 1;
    const cut2 = await cli('W', ['send', '--archive', archive, '--candidate', CANDIDATE]);
    const mid2 = await state(id);
    const done = await cli('W', ['send', '--archive', archive, '--candidate', CANDIDATE]);
    t.row('E41 an upload that storage refuses, or that is cut off after the object was written, leaves the artifact unfinished, and the same command finishes it without writing an object twice',
      cut.code === 5 && /storage_error/.test(cut.out) && mid === 'CREATED' && cut2.code === 5 && mid2 === 'CREATED' && done.code === 0 && /ARTIFACT UPLOADED/.test(done.out)
      && [...objects.keys()].filter((p) => p.includes(id)).length === 3 && (await receipts(id)).map((r) => r.state).join(' ') === 'CREATED UPLOADED', [cut.code, mid, cut2.code, mid2, done.code].join(' '));
    const wrong = await as('W', 'create', { candidate_sha: CANDIDATE, signing_fingerprint: trustFp, archive_name: 'Y.zip', files: [{ kind: 'archive', name: 'Y.zip', size: 4, sha256: sha256Hex('good') },
      { kind: 'sha256', name: 'Y.zip.sha256', size: 4, sha256: sha256Hex('hash') }, { kind: 'signature', name: 'Y.zip.sha256.sig', size: 4, sha256: sha256Hex('sign') }] });
    const yid = wrong.body.artifact.artifact_id;
    const mismatch = [await as('W', 'upload', { artifact_id: yid, kind: 'archive', content_b64: Buffer.from('evil').toString('base64') }),
      await as('W', 'upload', { artifact_id: yid, kind: 'archive', content_b64: Buffer.from('longer than declared').toString('base64') })];
    const right = await as('W', 'upload', { artifact_id: yid, kind: 'archive', content_b64: Buffer.from('good').toString('base64') });
    t.row('E42 only the bytes declared when the artifact was created are stored', mismatch.every((r) => r.status === 422 && r.body.refused === 'content_mismatch') && right.status === 200
      && objects.get(`candidate/${CANDIDATE}/${yid}/Y.zip`)?.toString() === 'good', mismatch.map((r) => r.status).join(' ') + ' ' + right.status);

    const zf = [{ kind: 'archive', name: 'Z.zip', size: 4, sha256: sha256Hex('zzzz') }, { kind: 'sha256', name: 'Z.zip.sha256', size: 4, sha256: sha256Hex('hash') }, { kind: 'signature', name: 'Z.zip.sha256.sig', size: 4, sha256: sha256Hex('sign') }];
    const zmade = await as('W', 'create', { candidate_sha: CANDIDATE, signing_fingerprint: trustFp, archive_name: 'Z.zip', files: zf });
    if (!zmade.body.artifact) throw new Error('E45 could not create its artifact: ' + JSON.stringify(zmade.body));
    const zid = zmade.body.artifact.artifact_id;
    const zpath = `candidate/${CANDIDATE}/${zid}/Z.zip`;
    objects.set(zpath, Buffer.from('squatter'));
    const conflict = await as('W', 'upload', { artifact_id: zid, kind: 'archive', content_b64: Buffer.from('zzzz').toString('base64') });
    const zrow = (await plane.su.query('select stored_at from factory_relay.artifact_files where artifact_id = $1 and kind = $2', [zid, 'archive'])).rows[0];
    t.row('E45 an object that already sits on an artifact\'s path and is not the declared bytes is never adopted and never overwritten',
      conflict.status === 409 && conflict.body.refused === 'object_conflict' && zrow.stored_at === null && objects.get(zpath).toString() === 'squatter', conflict.status + ' ' + conflict.body.refused);

    // ------------------------------------------------------------------------------------------------------------- retention
    await plane.su.query('begin'); await plane.su.query('set local session_replication_role = replica');
    await plane.su.query(`update factory_relay.artifacts set created_at = created_at - interval '15 days', expires_at = pg_catalog.now() - interval '1 second' where artifact_id = any($1)`, [[first.id, id]]);
    await plane.su.query('commit');
    const sweep = await as('H', 'sweep');
    const gone = [...objects.keys()].filter((p) => p.includes(first.id) || p.includes(id)).length === 0;
    const late = await as('H', 'download', { artifact_id: id, kind: 'archive' });
    t.row('E43 past its retention a bundle\'s bytes are deleted from the bucket and the deletion is recorded; an unconsumed one is EXPIRED and can no longer be downloaded',
      sweep.status === 200 && gone && (await state(id)) === 'EXPIRED' && (await state(first.id)) === 'CONSUMED' && (await receipts(id)).map((r) => r.state).join(' ') === 'CREATED UPLOADED EXPIRED PURGED'
      && (await receipts(first.id)).at(-1).state === 'PURGED' && late.status === 409 && [...objects.keys()].some((p) => p.includes(yid)), [sweep.status, gone, await state(id), late.status].join(' '));
    await plane.su.query('update storage.buckets set public = true where id = $1', [BUCKET]);
    const open = await cli('W', ['selfcheck']);
    await plane.su.query('update storage.buckets set public = false where id = $1', [BUCKET]);
    t.row('E44 the relay stops the moment its bucket is public', open.code === 5 && /bucket_not_private/.test(open.out), open.out.trim());
  }

  t.row('E46 nothing the function threw reached a caller: no answer carries an error text, a stack or a platform address',
    answers.filter((a) => /relay_error/.test(a)).length >= 1 && !answers.some((a) => /Error:|\bat \S+\.(ts|mjs|js):\d+|the database answered|unexpected failure|stack/.test(a) || a.includes(supabaseUrl)), String(answers.filter((a) => /relay_error/.test(a)).length));

  // ---------------------------------------------------------------------------------------------- the same function, under Deno
  if (NO_DENO) {
    console.log('NOT RUN: the Deno rows E50-E57 (--no-deno)');
  } else {
    const fn = 'supabase/functions/factory-artifact-relay/';
    let checked = '';
    try { execFileSync('npx', ['--yes', 'deno@2.5.6', 'check', fn + 'index.ts', fn + 'relay.ts', 'test/deno_serve.ts'], { cwd: ROOT, shell: true, stdio: 'pipe', timeout: 300000 }); } catch (e) { checked = String(e.stderr ?? e.message).split('\n').filter(Boolean).slice(0, 3).join(' '); }
    t.row('E50 the deployed entry and the function type-check under Deno', checked === '', checked);
    const port = 20000 + Math.floor(Math.random() * 20000);
    denoChild = spawn('npx', ['--yes', 'deno@2.5.6', 'run', '--no-prompt', '--allow-net=127.0.0.1', '--allow-env=RELAY_TEST_PORT,SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,SUPABASE_SECRET_KEYS,RELAY_TEST_REGISTRY', 'test/deno_serve.ts'],
      { cwd: ROOT, shell: true, env: { ...process.env, RELAY_TEST_PORT: String(port), SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: DEAD_LEGACY_KEY, SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET_KEY }), RELAY_TEST_REGISTRY: JSON.stringify(registry) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let denoLog = '';
    denoChild.stdout.on('data', (d) => { denoLog += d; }); denoChild.stderr.on('data', (d) => { denoLog += d; });
    for (let i = 0; i < 240 && !/relay listening/.test(denoLog); i++) await new Promise((r) => setTimeout(r, 500));
    if (!/relay listening/.test(denoLog)) {
      t.row('E51 the function starts under Deno', false, denoLog.split('\n').slice(0, 3).join(' '));
    } else {
      pointAt('http://127.0.0.1:' + port + '/functions/v1/factory-artifact-relay');
      keysSeen.clear();
      await delivery('deno', ['E51', 'E52', 'E53', 'E54', 'E55']);
      t.row('E57 [deno] where the legacy key is dead the function finds the secret key among what the platform injects, and sends it on the apikey header alone',
        keysSeen.size === 1 && keysSeen.has('secret') && !PLATFORM_SECRETS.some((k) => denoLog.includes(k)), [...keysSeen].join() + ' ' + denoLog.split('\n').filter((l) => /relay:/.test(l)).slice(0, 2).join(' '));
      const stranger = generateKeyPairSync('ed25519').privateKey;
      const ts = String(Date.now()), nonce = randomBytes(16).toString('hex'), body = JSON.stringify({ op: 'selfcheck', payload: {} });
      const r = await fetch('http://127.0.0.1:' + port + '/functions/v1/factory-artifact-relay', { method: 'POST', headers: { 'x-relay-node': W, 'x-relay-action': 'selfcheck', 'x-relay-ts': ts, 'x-relay-nonce': nonce,
        'x-relay-sig': sign(null, signedMessage('selfcheck', W, ts, nonce, sha256Hex(Buffer.from(body))), stranger).toString('base64url') }, body });
      t.row('E56 [deno] a request signed by another key is refused under Deno\'s own Ed25519 as well', r.status === 401, String(r.status));
    }
  }
  code = t.done();
} catch (e) {
  console.log('FAIL the run crashed - ' + (e.stack ?? e));
} finally {
  if (denoChild) { try { execFileSync('taskkill', ['/pid', String(denoChild.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { try { denoChild.kill(); } catch { /* gone */ } } }
  for (const s of servers) { s.closeAllConnections?.(); s.close(); }
  await plane.stop();
  for (let i = 0; i < 20; i++) { try { rmSync(work, { recursive: true, force: true }); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
}
process.exit(code);

// THE BOUNDARY PROOF. The gateway's JWT check is off for the relay function, so this proves what stands in its place:
//
//   PART 1  a request is refused BEFORE ANY PRIVILEGED WORK unless a registered node's registered key signed exactly that method,
//           action, node, time, nonce and body. "Before any privileged work" is measured: the function's only way out to the
//           project is the fetch it is handed, and here that fetch is a spy. For every refused request the spy must have seen
//           NOTHING. There is no other credential it would accept: no bearer token, no API key, no other header.
//   PART 2  what only the database can know (a nonce seen before, a node or key the founder revoked, an artifact bound to another
//           node) is refused by the one database entry, in one call that changes nothing, and storage is never reached.
//
//   node test/boundary_proof.mjs --pure                              part 1 only (no database needed)
//   RELAY_TEST_MODULES=<node_modules> node test/boundary_proof.mjs   both parts
// RELAY_FUNCTION_FILE points it at another copy of the function (the mutation proof, test/boundary_mutation.mjs).
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { reporter } from './helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTION_FILE = process.env.RELAY_FUNCTION_FILE ?? join(ROOT, 'supabase/functions/factory-artifact-relay/relay.ts');
const { makeHandler, SIGNING_CONTEXT, ROUTES, ACTIONS } = await import(pathToFileURL(FUNCTION_FILE).href);
const PURE = process.argv.includes('--pure');
const t = reporter('artifact relay boundary proof' + (PURE ? ' (part 1 only)' : ''));
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const newNode = (role, tag) => { const k = generateKeyPairSync('ed25519'); return { id: 'node-' + randomBytes(4).toString('hex') + '-' + tag, role, key: k.privateKey, pub: k.publicKey.export({ format: 'jwk' }).x }; };
const entry = (n) => ({ node_id: n.id, relay_role: n.role, public_key: n.pub });
const UUID = '0b9f7f7e-3c1a-4c1e-9d55-2f1e6f0a9a11';
const URL0 = 'http://relay.invalid' + ROUTES[1];

/**
 * One request. By default it is exactly what an honest sender would send for `action`; every field can be bent:
 *   signed: { method, action, node, ts, nonce, body }   what the signature is computed over, where it differs from what is sent
 *   drop: [header names]   headers: { extra or replaced headers }   rawBody: bytes sent instead of the JSON envelope
 */
function build({ by, node, action = 'selfcheck', payload = {}, body, rawBody, ts = String(Date.now()), nonce = randomBytes(16).toString('hex'), method = 'POST', url = URL0, signed = {}, drop = [], headers = {} }) {
  const text = body ?? JSON.stringify({ op: action, payload });
  const bytes = rawBody ?? Buffer.from(text, 'utf8');
  const message = [SIGNING_CONTEXT, signed.method ?? 'POST', signed.action ?? action, signed.node ?? node, signed.ts ?? ts, signed.nonce ?? nonce, sha256(signed.body !== undefined ? Buffer.from(signed.body) : bytes)].join('\n');
  const h = { 'x-relay-node': node, 'x-relay-action': action, 'x-relay-ts': ts, 'x-relay-nonce': nonce, 'x-relay-sig': sign(null, Buffer.from(message, 'utf8'), by).toString('base64url'), ...headers };
  for (const d of drop) delete h[d];
  return new Request(url, { method, headers: h, body: method === 'GET' || method === 'HEAD' ? undefined : bytes });
}

// ============================================================================================================================ PART 1
const S = newNode('sender', 'work'), V = newNode('verifier', 'home'), X = newNode('sender', 'stranger');
const REGISTRY = [entry(S), entry(V)];
const FAKE_SERVICE_KEY = ['eyJ' + randomBytes(12).toString('base64url'), randomBytes(40).toString('base64url'), randomBytes(32).toString('base64url')].join('.');
const spy = [];
/** the function's only way out. In part 1 nothing may reach it for a refused request; for an accepted one it plays the database. */
const spyFetch = async (url, init) => {
  spy.push({ url: String(url), body: typeof init?.body === 'string' ? init.body : null, headers: init?.headers ?? {} });
  return new Response(JSON.stringify({ ok: true, relay: 'artifact-relay/v0', artifacts: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const handler = makeHandler({ supabaseUrl: 'http://project.invalid', serviceKeys: [FAKE_SERVICE_KEY], registry: REGISTRY }, spyFetch);
const emptyHandler = makeHandler({ supabaseUrl: 'http://project.invalid', serviceKeys: [FAKE_SERVICE_KEY], registry: [] }, spyFetch);
const send = async (request, h = handler) => { spy.length = 0; const r = await h(request); let body = {}; try { body = await r.json(); } catch { /* no body */ } return { status: r.status, refused: body.refused, body, calls: spy.length }; };

const as = (n, over = {}) => build({ by: n.key, node: n.id, ...over });
const now = Date.now();
const big = 'a'.repeat(1500001);
const flip = (sig) => (sig[10] === 'A' ? sig.slice(0, 10) + 'B' + sig.slice(11) : sig.slice(0, 10) + 'A' + sig.slice(11));
const withSig = (request, f) => { const h = new Headers(request.headers); h.set('x-relay-sig', f(h.get('x-relay-sig'))); return new Request(request.url, { method: 'POST', headers: h, body: JSON.stringify({ op: 'selfcheck', payload: {} }) }); };

// [what, the request, the status it must get]   every one must reach NOTHING
const NEGATIVE = {
  'no signature': [
    ['no relay header at all', () => new Request(URL0, { method: 'POST', body: '{"op":"selfcheck","payload":{}}' }), 401],
    ['the signature header is missing', () => as(S, { drop: ['x-relay-sig'] }), 401],
    ['the signature header is empty', () => as(S, { headers: { 'x-relay-sig': '' } }), 401],
    ['a signature that is not 64 bytes', () => as(S, { headers: { 'x-relay-sig': 'AAAA' } }), 401],
    ['a signature of the right shape and no meaning', () => as(S, { headers: { 'x-relay-sig': 'A'.repeat(86) } }), 401],
    ['the node header is missing', () => as(S, { drop: ['x-relay-node'] }), 401],
    ['the time header is missing', () => as(S, { drop: ['x-relay-ts'] }), 401],
    ['the nonce header is missing', () => as(S, { drop: ['x-relay-nonce'] }), 401],
    ['the action header is missing', () => as(S, { drop: ['x-relay-action'] }), 401],
  ],
  'wrong key': [
    ['a key nobody registered, in the sender\'s name', () => build({ by: X.key, node: S.id }), 401],
    ['the verifier\'s key, in the sender\'s name', () => build({ by: V.key, node: S.id }), 401],
    ['the sender\'s key, in the verifier\'s name', () => build({ by: S.key, node: V.id, action: 'inbox' }), 401],
    ['a good signature with one character changed', () => withSig(build({ by: S.key, node: S.id, body: JSON.stringify({ op: 'selfcheck', payload: {} }) }), flip), 401],
  ],
  'stale timestamp': [
    ['five minutes and a second old', () => as(S, { ts: String(now - 301000) }), 401],
    ['five minutes and a second ahead', () => as(S, { ts: String(now + 301000) }), 401],
    ['a day old', () => as(S, { ts: String(now - 86400000) }), 401],
    ['a time in seconds, not milliseconds', () => as(S, { ts: String(Math.floor(now / 1000)) }), 401],
    ['a time that is not a number', () => as(S, { ts: 'yesterday-at-noon' }), 401],
    ['a fresh time on the wire, an old one under the signature', () => as(S, { signed: { ts: String(now - 86400000) } }), 401],
  ],
  'reused or bent nonce': [
    ['a nonce on the wire that is not the signed one', () => as(S, { signed: { nonce: randomBytes(16).toString('hex') } }), 401],
    ['a nonce of the wrong length', () => as(S, { nonce: 'abc123' }), 401],
    ['a nonce that is not lower-case hex', () => as(S, { nonce: 'G'.repeat(32) }), 401],
  ],
  'modified body': [
    ['a body changed after it was signed', () => as(S, { action: 'create', payload: { candidate_sha: 'b'.repeat(40), files: [] }, signed: { body: JSON.stringify({ op: 'create', payload: { candidate_sha: 'a'.repeat(40), files: [] } }) } }), 401],
    ['one space added to the body', () => as(S, { body: '{"op":"selfcheck","payload":{}} ', signed: { body: '{"op":"selfcheck","payload":{}}' } }), 401],
    ['the body removed', () => as(S, { body: '', signed: { body: '{"op":"selfcheck","payload":{}}' } }), 401],
    ['another body under the same signature', () => as(S, { body: '{"op":"sweep","payload":{}}', action: 'sweep', signed: { body: '{"op":"selfcheck","payload":{}}' } }), 401],
  ],
  'modified action or path': [
    ['the action header changed after signing', () => as(S, { action: 'status', payload: { artifact_id: UUID }, signed: { action: 'selfcheck' } }), 401],
    ['a body for one action under a header for another', () => as(S, { action: 'status', body: JSON.stringify({ op: 'selfcheck', payload: {} }) }), 400],
    ['an action that does not exist', () => as(S, { action: 'admin' }), 400],
    ['the database entry\'s own call names', () => as(S, { action: 'begin' }), 400],
    ['the follow-up call of an upload', () => as(S, { action: 'finish', payload: { request_id: UUID, outcome: 'stored' } }), 400],
    ['the record of a purge', () => as(S, { action: 'purged', payload: { artifact_ids: [UUID] } }), 400],
    ['a registration', () => as(S, { action: 'register', payload: { node_id: X.id, public_key: X.pub } }), 400],
    ['an action that is a property of every object', () => as(S, { action: 'constructor' }), 400],
    ['an action in another case', () => as(S, { action: 'SelfCheck' }), 401],
    ['a path under the route', () => as(S, { url: URL0 + '/admin' }), 404],
    ['the route with a trailing slash', () => as(S, { url: URL0 + '/' }), 404],
    ['the route with a query string', () => as(S, { url: URL0 + '?action=inbox' }), 404],
    ['another function\'s route', () => as(S, { url: 'http://relay.invalid/functions/v1/factory-node-api' }), 404],
    ['the root', () => as(S, { url: 'http://relay.invalid/' }), 404],
    ['a doubled slash', () => as(S, { url: 'http://relay.invalid//factory-artifact-relay' }), 404],
    ['GET', () => as(S, { method: 'GET' }), 405],
    ['PUT', () => as(S, { method: 'PUT' }), 405],
    ['DELETE', () => as(S, { method: 'DELETE' }), 405],
    ['PATCH', () => as(S, { method: 'PATCH' }), 405],
    ['OPTIONS', () => as(S, { method: 'OPTIONS' }), 405],
    ['HEAD', () => as(S, { method: 'HEAD' }), 405],
    ['a signature made for another method', () => as(S, { signed: { method: 'GET' } }), 401],
  ],
  'unregistered node': [
    ['a node nobody registered, with a key of its own', () => as(X), 401],
    ['the sender\'s id in another case', () => build({ by: S.key, node: S.id.toUpperCase() }), 401],
    ['the sender\'s id with one more character', () => build({ by: S.key, node: S.id + '0' }), 401],
    ['the sender\'s id with a space', () => build({ by: S.key, node: S.id + ' ' }), 401],
    ['a node id that is not one', () => build({ by: S.key, node: '../' + S.id }), 401],
  ],
  'revoked at the function': [
    ['the sender, where the function was deployed with no registration (as committed)', () => [as(S), emptyHandler], 401],
    ['the verifier, where the function was deployed with no registration (as committed)', () => [as(V, { action: 'inbox' }), emptyHandler], 401],
    ['a node taken out of the registry', () => [as(V, { action: 'inbox' }), makeHandler({ supabaseUrl: 'http://project.invalid', serviceKeys: [FAKE_SERVICE_KEY], registry: [entry(S)] }, spyFetch)], 401],
    ['a node whose key was replaced in the registry', () => [as(V, { action: 'inbox' }), makeHandler({ supabaseUrl: 'http://project.invalid', serviceKeys: [FAKE_SERVICE_KEY], registry: [entry(S), { ...entry(V), public_key: X.pub }] }, spyFetch)], 401],
  ],
  'wrong sender or recipient': [
    ['the sender lists the inbox', () => as(S, { action: 'inbox' }), 403],
    ['the sender downloads', () => as(S, { action: 'download', payload: { artifact_id: UUID, kind: 'archive' } }), 403],
    ['the sender writes a receipt', () => as(S, { action: 'receipt', payload: { artifact_id: UUID, state: 'VERIFIED' } }), 403],
    ['the verifier creates an artifact', () => as(V, { action: 'create', payload: { candidate_sha: 'a'.repeat(40), files: [] } }), 403],
    ['the verifier uploads', () => as(V, { action: 'upload', payload: { artifact_id: UUID, kind: 'archive', content_b64: 'AAAA' } }), 403],
  ],
  'another credential': [
    ['the project\'s service key as a bearer token, and nothing else', () => new Request(URL0, { method: 'POST', headers: { authorization: 'Bearer ' + FAKE_SERVICE_KEY }, body: '{"op":"inbox","payload":{}}' }), 401],
    ['the project\'s service key as an API key, and nothing else', () => new Request(URL0, { method: 'POST', headers: { apikey: FAKE_SERVICE_KEY, authorization: 'Bearer ' + FAKE_SERVICE_KEY }, body: '{"op":"inbox","payload":{}}' }), 401],
    ['the service key next to a stranger\'s signature', () => build({ by: X.key, node: V.id, action: 'inbox', headers: { authorization: 'Bearer ' + FAKE_SERVICE_KEY, apikey: FAKE_SERVICE_KEY } }), 401],
    ['the service key next to well-formed relay headers with no real signature', () => as(V, { action: 'inbox', headers: { 'x-relay-sig': 'A'.repeat(86), authorization: 'Bearer ' + FAKE_SERVICE_KEY, apikey: FAKE_SERVICE_KEY } }), 401],
    ['a public key offered in a header', () => build({ by: X.key, node: S.id, headers: { 'x-relay-key': X.pub, 'x-relay-public-key': X.pub } }), 401],
    ['a role offered in a header', () => as(S, { action: 'inbox', headers: { 'x-relay-role': 'verifier' } }), 403],
    ['a node nobody registered that offers its own public key in a header', () => build({ by: X.key, node: X.id, action: 'inbox', headers: { 'x-relay-key': X.pub, 'x-relay-public-key': X.pub } }), 401],
    ['a cookie', () => new Request(URL0, { method: 'POST', headers: { cookie: 'sb-access-token=' + FAKE_SERVICE_KEY }, body: '{"op":"inbox","payload":{}}' }), 401],
  ],
  'malformed request': [
    ['a body that is not JSON', () => as(S, { body: 'not json at all' }), 400],
    ['a body that is a list', () => as(S, { body: '[]' }), 400],
    ['a body that is null', () => as(S, { body: 'null' }), 400],
    ['a body with no action', () => as(S, { body: '{"payload":{}}' }), 400],
    ['a payload that is text', () => as(S, { body: '{"op":"selfcheck","payload":"x"}' }), 400],
    ['a payload that is a list', () => as(S, { body: '{"op":"selfcheck","payload":[]}' }), 400],
    ['a body that is not UTF-8', () => as(S, { rawBody: Buffer.from([0x7b, 0xff, 0xfe, 0x7d]) }), 400],
    ['a body larger than the limit', () => as(S, { body: JSON.stringify({ op: 'selfcheck', payload: { pad: big } }) }), 413],
    ['an upload with no content', () => as(S, { action: 'upload', payload: { artifact_id: UUID, kind: 'archive' } }), 400],
    ['an upload whose content is not base64', () => as(S, { action: 'upload', payload: { artifact_id: UUID, kind: 'archive', content_b64: '!!!!' } }), 400],
    ['an upload of nothing', () => as(S, { action: 'upload', payload: { artifact_id: UUID, kind: 'archive', content_b64: '' } }), 400],
    ['an upload of a kind that does not exist', () => as(S, { action: 'upload', payload: { artifact_id: UUID, kind: 'tarball', content_b64: 'AAAA' } }), 400],
    ['an upload into something that is not an artifact id', () => as(S, { action: 'upload', payload: { artifact_id: '../' + UUID, kind: 'archive', content_b64: 'AAAA' } }), 400],
    ['a status of something that is not an artifact id', () => as(S, { action: 'status', payload: { artifact_id: "1' or '1'='1" } }), 400],
    ['a status of no artifact', () => as(S, { action: 'status' }), 400],
    ['a download of a kind that does not exist', () => as(V, { action: 'download', payload: { artifact_id: UUID, kind: '*' } }), 400],
    ['a receipt for a state that is not one', () => as(V, { action: 'receipt', payload: { artifact_id: UUID, state: 'CERTIFIED' } }), 400],
    ['a receipt for a state only the relay writes', () => as(V, { action: 'receipt', payload: { artifact_id: UUID, state: 'UPLOADED' } }), 400],
    ['a create with no candidate', () => as(S, { action: 'create', payload: { files: [] } }), 400],
    ['a create whose files are not a list', () => as(S, { action: 'create', payload: { candidate_sha: 'a'.repeat(40), files: 'three' } }), 400],
  ],
};

let negatives = 0;
for (const [category, cases] of Object.entries(NEGATIVE)) {
  const wrong = [];
  for (const [what, make, status] of cases) {
    const made = make();
    const [request, h] = Array.isArray(made) ? made : [made, handler];
    let got;
    try { got = await send(request, h); } catch (e) { got = { status: 'THREW ' + e.message, calls: -1 }; }
    negatives++;
    if (got.status !== status || got.calls !== 0 || got.body?.ok !== false) wrong.push(`${what} -> ${got.status}${got.calls ? ', REACHED THE PROJECT ' + got.calls + 'x' : ''}`);
  }
  t.row(`N-${category.replace(/[^a-z]+/g, '-')} ${category}: refused, and nothing privileged was reached (${cases.length} requests, 0 calls)`, wrong.length === 0, wrong.join(' | '));
}

// the control: the spy does see an accepted request, exactly once, carrying the identity that was authenticated and no more
{
  const a = await send(as(S));
  const first = spy[0] ?? {};
  let sent = {};
  try { sent = JSON.parse(first.body).request; } catch { /* nothing was sent */ }
  const b = await send(as(V, { action: 'inbox' }));
  t.row('P-control an accepted request reaches the project exactly once, at the one database entry, as the node and key that were authenticated',
    a.status === 200 && a.calls === 1 && first.url === 'http://project.invalid/rest/v1/rpc/factory_relay_rpc' && sent.fn === 'begin' && sent.node_id === S.id && sent.public_key === S.pub
    && sent.op === 'selfcheck' && /^[0-9a-f]{32}$/.test(sent.nonce) && /^[0-9a-f]{64}$/.test(sent.body_sha256) && b.status === 200 && b.calls === 1, `${a.status} calls=${a.calls} ${sent.fn}`);
  const actions = [...ACTIONS.keys()].sort().join(' ');
  t.row('P-actions the actions are exactly the eight of the contract', actions === 'create download inbox receipt selfcheck status sweep upload', actions);
}

// what the source itself says: authenticate() is handed no way out, and no other credential is ever read
{
  const src = readFileSync(FUNCTION_FILE, 'utf8').replace(/\r\n/g, '\n');
  const a = src.indexOf('export async function authenticate('), b = src.indexOf('\n}\n', a);
  const auth = src.slice(a, b);
  const banned = ['ctx', 'fetch', 'rpc(', 'serviceKeys', 'keys[', 'supabaseUrl', 'Deno', 'console.'].filter((w) => auth.includes(w));
  const head = auth.slice(0, auth.indexOf('{'));
  t.row('P-pure authenticate() is given the request, the registry and the time and nothing else: its text names no fetch, no key and no address',
    a > 0 && b > a && banned.length === 0 && /authenticate\(req: Request, registry: RegisteredNode\[\], now: number\)/.test(head), banned.join(' '));
  const read = [...src.matchAll(/headers\.get\("([^"]+)"\)/g)].map((m) => m[1]).sort().join(' ');
  t.row('P-headers the function reads six request headers and no other: no authorization, no apikey, no cookie',
    read === 'content-length x-relay-action x-relay-node x-relay-nonce x-relay-sig x-relay-ts' && !/headers\.(entries|forEach|keys|values)\(|\.headers\[/.test(src), read);
  const marker = src.indexOf('// THE RELAY. Everything below runs only for a request authenticate() accepted.');
  const outs = [...src.matchAll(/ctx\.fetch\(|fetchImpl\(/g)].map((m) => m.index);
  const h = src.slice(src.indexOf('export function makeHandler('));
  t.row('P-order every call out of the function is written below the authentication, and the handler runs the relay only for a request authenticate() accepted',
    marker > b && outs.length >= 4 && outs.every((i) => i > marker) && /const auth = await authenticate\(req, registry, Date\.now\(\)\);\s+if \(!auth\.ok\) return refuse\(auth\.status, auth\.refused, auth\.detail\);\s+return await relay\(ctx, auth\);/.test(h)
    && (src.match(/\brelay\(ctx, /g) ?? []).length === 1 && (src.match(/async function relay\(ctx: Ctx, auth: Authenticated\)/g) ?? []).length === 1, `calls out: ${outs.length}`);
}

// ============================================================================================================================ PART 2
if (PURE) {
  console.log('NOT RUN: part 2 (--pure)');
} else {
  const { startPlane } = await import('./plane.mjs');
  const { startStandIn } = await import('./standin.mjs');
  const plane = await startPlane({ bucket: 'none' });
  let standin = null;
  try {
    await plane.applyFile('sql/001_artifact_relay_v0.sql');
    await plane.applyFile('sql/002_private_bucket.sql');
    standin = await startStandIn(plane);
    const V2 = newNode('verifier', 'home2');
    await plane.su.query('insert into factory.nodes (node_id, security_role, platform) values ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)', [S.id, 'implementer', 'win32', V.id, 'verifier', 'win32', V2.id, 'verifier', 'win32']);
    await plane.owner.query('select factory_relay.register_node($1, $2, $3, $4)', [S.id, 'sender', S.pub, 'sender']);
    await plane.owner.query('select factory_relay.register_node($1, $2, $3, $4)', [V.id, 'verifier', V.pub, 'verifier']);
    const live = (registry) => makeHandler({ supabaseUrl: standin.url, serviceKeys: [standin.keys.legacy], registry }, fetch);
    let h = live(REGISTRY);
    const go = async (request, hh = h) => { standin.calls.length = 0; const r = await hh(request); let body = {}; try { body = await r.json(); } catch { /* none */ } return { status: r.status, refused: body.refused, body, calls: [...standin.calls] }; };
    const onlyTheEntry = (r) => r.calls.length === 1 && r.calls[0] === 'rpc:begin';
    const snapshot = async () => JSON.stringify((await plane.su.query(`select (select count(*) from factory_relay.requests) as requests, (select count(*) from factory_relay.receipts) as receipts,
      (select jsonb_agg(delivery_state || ':' || state_at order by artifact_id) from factory_relay.artifacts) as artifacts, (select count(*) from factory_relay.artifact_files where stored_at is not null) as stored`)).rows[0]) + ' objects=' + standin.objects.size;

    // something worth protecting: one artifact, fully uploaded, bound to V
    const file = (kind, name, text) => ({ kind, name, size: Buffer.byteLength(text), sha256: sha256(text), text });
    const files = [file('archive', 'P.zip', 'the archive bytes'), file('sha256', 'P.zip.sha256', 'the hash line'), file('signature', 'P.zip.sha256.sig', 'the signature')];
    const created = await go(as(S, { action: 'create', payload: { candidate_sha: 'c'.repeat(40), signing_fingerprint: 'SHA256:' + 'A'.repeat(43), archive_name: 'P.zip', files: files.map(({ text, ...f }) => f) } }));
    const id = created.body.artifact?.artifact_id;
    for (const f of files) await go(as(S, { action: 'upload', payload: { artifact_id: id, kind: f.kind, content_b64: Buffer.from(f.text).toString('base64') } }));
    const ready = (await plane.su.query('select delivery_state from factory_relay.artifacts where artifact_id = $1', [id])).rows[0]?.delivery_state;
    t.row('D-setup an artifact is uploaded and bound to the verifier', created.status === 200 && ready === 'UPLOADED' && standin.objects.size === 3, String(ready));

    let before = await snapshot();
    const once = as(V, { action: 'inbox' });
    const copy = new Request(once.url, { method: 'POST', headers: once.headers, body: await once.clone().text() });
    const firstUse = await go(once);
    before = await snapshot();
    const replayed = await go(copy);
    t.row('D-reused-nonce a request sent a second time is refused: one call to the database entry, which changes nothing; storage is not reached',
      firstUse.status === 200 && replayed.status === 409 && replayed.refused === 'replayed_request' && onlyTheEntry(replayed) && (await snapshot()) === before, `${replayed.status} ${replayed.calls.join()}`);

    // a registered verifier that is NOT the artifact's recipient: the founder replaced the verifier
    await plane.owner.query('select factory_relay.deactivate_node($1)', [V.id]);
    before = await snapshot();
    const revoked = [await go(as(V, { action: 'download', payload: { artifact_id: id, kind: 'archive' } })), await go(as(V, { action: 'inbox' })),
      await go(as(V, { action: 'receipt', payload: { artifact_id: id, state: 'DELIVERED' } })), await go(as(V, { action: 'status', payload: { artifact_id: id } })), await go(as(V, { action: 'selfcheck' }))];
    t.row('D-revoked-node a node the founder revoked is refused although the function still holds its key: one call to the database entry, which changes nothing and records nothing; storage is not reached',
      revoked.every((r) => r.status === 401 && r.refused === 'not_authenticated' && onlyTheEntry(r)) && (await snapshot()) === before, revoked.map((r) => r.status + ':' + r.calls.join()).join(' '));

    await plane.owner.query('select factory_relay.register_node($1, $2, $3, $4)', [V2.id, 'verifier', V2.pub, 'the new verifier']);
    // the same node id cannot come back with its old key; a node the function does not know reaches nothing at all
    const unknownToFunction = await go(as(V2, { action: 'inbox' }));
    t.row('D-unregistered-at-function a node the database knows and the function was not deployed with reaches nothing at all',
      unknownToFunction.status === 401 && unknownToFunction.calls.length === 0, `${unknownToFunction.status} calls=${unknownToFunction.calls.length}`);
    const staleKey = await go(as(V, { action: 'inbox' }), live([entry(S), entry(V), entry(V2)]));
    t.row('D-revoked-key a key the founder revoked is refused by the database entry even where the function was redeployed with it',
      staleKey.status === 401 && onlyTheEntry(staleKey), `${staleKey.status} ${staleKey.calls.join()}`);

    h = live([entry(S), entry(V2)]);
    before = await snapshot();
    const none = '11111111-2222-4333-8444-555555555555';
    const foreign = [await go(as(V2, { action: 'download', payload: { artifact_id: id, kind: 'archive' } })), await go(as(V2, { action: 'status', payload: { artifact_id: id } })),
      await go(as(V2, { action: 'receipt', payload: { artifact_id: id, state: 'DELIVERED' } })), await go(as(V2, { action: 'receipt', payload: { artifact_id: id, state: 'REFUSED' } }))];
    const absent = [await go(as(V2, { action: 'download', payload: { artifact_id: none, kind: 'archive' } })), await go(as(V2, { action: 'status', payload: { artifact_id: none } })),
      await go(as(V2, { action: 'receipt', payload: { artifact_id: none, state: 'DELIVERED' } })), await go(as(V2, { action: 'receipt', payload: { artifact_id: none, state: 'REFUSED' } }))];
    const inbox2 = await go(as(V2, { action: 'inbox' }));
    const mine = (await plane.su.query('select count(*) as n from factory_relay.requests where node_id = $1', [V2.id])).rows[0].n;
    t.row('D-wrong-recipient a registered verifier that is not the artifact\'s recipient cannot download it, read it or receipt it: one call to the database entry each; storage is not reached; the artifact does not change',
      foreign.every((r) => r.status === 404 && r.refused === 'no_such_artifact' && onlyTheEntry(r))
      && (await plane.su.query('select delivery_state from factory_relay.artifacts where artifact_id = $1', [id])).rows[0].delivery_state === 'UPLOADED' && standin.objects.size === 3 && Number(mine) === 9,
      foreign.map((r) => r.status + ':' + r.refused).join(' '));
    t.row('D-enumeration an artifact that belongs to another node answers exactly like one that does not exist, and the inbox lists only a node\'s own',
      foreign.every((r, i) => JSON.stringify(r.body) === JSON.stringify(absent[i].body) && r.status === absent[i].status) && inbox2.status === 200 && inbox2.body.artifacts.length === 0, JSON.stringify(foreign[0].body));

    const bad = await go(as(V2, { action: 'receipt', payload: { artifact_id: none, state: 'CONSUMED' } }));
    standin.faults.beginFails = 1;
    const down = await go(as(S, { action: 'status', payload: { artifact_id: id } }));
    t.row('D-entry-down where the database entry cannot be reached the request fails closed, and storage is not reached',
      down.status === 500 && down.refused === 'relay_error' && onlyTheEntry(down) && bad.status === 404, `${down.status} ${down.calls.join()}`);

    const storageCalls = standin.calls.filter((c) => c.startsWith('storage:')).length;
    const total = (await plane.su.query(`select count(*) as n from factory_relay.receipts where artifact_id = $1`, [id])).rows[0].n;
    t.row('D-untouched after every refusal above the artifact still has its two receipts and its three objects, and no refused request reached storage', total === '2' && standin.objects.size === 3 && storageCalls === 0, `receipts=${total} objects=${standin.objects.size}`);
  } catch (e) {
    t.row('D-crash part 2 ran to its end', false, e.stack ?? String(e));
  } finally {
    standin?.close();
    await plane.stop();
  }
}

console.log(`\nnegative requests in part 1: ${negatives}, each refused with 0 calls out of the function`);
process.exit(t.done());

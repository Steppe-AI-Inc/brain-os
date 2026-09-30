// The Node API handler (supabase/control-plane/edge/supabase/functions/_shared/node_api.ts - the SAME file the Edge runtime serves) on a
// local node:http server, for the developer suites. The database client is postgres.js (the version pinned for the Edge runtime),
// connected as the plane's factory_node_api login. The peer is derived by the SAME function the Edge entry point wires
// (_shared/peer.ts withPeer): the harness hands it what Deno.serve hands the handler - { remoteAddr: { transport, hostname, port } }
// of the TCP connection - so every suite runs the deployed derivation. serve(request, info) calls the wired handler directly with an
// info object a suite makes (the platform outcomes no local socket can produce: no info, a unix transport, a name).
// Each handler is mounted the way the Edge platform delivers it: under its function name (/factory-node-api/v1/..., route.ts), and
// baseUrl includes that prefix, so every suite calls the production path shape.
// The pairing pepper is random per harness (a disposable plane's; never a production secret).
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EDGE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'control-plane', 'edge', 'supabase', 'functions', '_shared');
// ONE SQL STATEMENT PER REQUEST, measured: every request the harness serves runs inside its own store, and the database client each
// handler is given counts the statements it runs for that request (perRequest: { route, status, n } per request; never a body)
const perRequestStore = new AsyncLocalStorage();
const counted = (db) => async (text, params) => { const s = perRequestStore.getStore(); if (s) s.n++; return db.unsafe(text, params); };

export async function startApi(plane, { pepperB64 = randomBytes(32).toString('base64'), pepperVersion = null, basePath = '/factory-node-api', pool = 4, noPepper = false } = {}) {
  const { createNodeApi } = await import(pathToFileURL(join(EDGE, 'node_api.ts')).href);
  const { importPepper, PEPPER_VERSION } = await import(pathToFileURL(join(EDGE, 'pairing.ts')).href);
  const version = pepperVersion ?? PEPPER_VERSION;   // the entry points' constant, unless a suite asks for another
  const { withPeer } = await import(pathToFileURL(join(EDGE, 'peer.ts')).href);
  const { default: postgres } = await import('postgres');
  const db = postgres(plane.nodeApiUrl, { prepare: false, max: pool, idle_timeout: 5, onnotice: () => {} });
  const key = await importPepper(pepperB64);
  const events = [];
  const requests = []; // every request that reached this harness (method and path; never a body): "nothing was sent" is observable
  const perRequest = [];
  const handler = createNodeApi({
    sql: counted(db),
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    pepper: async () => (noPepper ? null : { key, version }),
    log: (e) => events.push(e),
    basePath,
  });
  const serve = withPeer(handler);
  const bodies = []; // every response body this harness returned (S-12: a code or token is returned exactly once)
  const server = createServer(async (req, res) => {
    requests.push({ method: req.method, path: String(req.url).split('?')[0], at: Date.now() });
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const url = 'http://' + (req.headers.host || '127.0.0.1') + req.url;
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const store = { n: 0 };
      const response = await perRequestStore.run(store, () => serve(request, { remoteAddr: { transport: 'tcp', hostname: req.socket.remoteAddress, port: req.socket.remotePort } }));
      perRequest.push({ route: req.method + ' ' + String(req.url).split('?')[0], status: response.status, n: store.n });
      const out = Buffer.from(await response.arrayBuffer());
      bodies.push(out.toString('utf8'));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(out);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, refused: 'harness_error', message: String(e.message) }));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const baseUrl = origin + basePath;
  return {
    baseUrl, origin, basePath, events, requests, bodies, perRequest, pepperB64, pepperVersion: version, db, serve,
    async stop() { await new Promise((r) => server.close(r)); await db.end({ timeout: 2 }); },
  };
}

/** The Admin API handler (supabase/control-plane/edge/supabase/functions/_shared/admin_api.ts) on node:http, against a Brain OS endpoint. */
export async function startAdminApi(plane, brainOs, { pepperB64, pepperVersion = null, basePath = '/factory-admin-api' } = {}) {
  const { createAdminApi } = await import(pathToFileURL(join(EDGE, 'admin_api.ts')).href);
  const { importPepper, PEPPER_VERSION } = await import(pathToFileURL(join(EDGE, 'pairing.ts')).href);
  const version = pepperVersion ?? PEPPER_VERSION;   // the entry points' constant, unless a suite asks for another
  const { default: postgres } = await import('postgres');
  const db = postgres(plane.adminApiUrl, { prepare: false, max: 4, idle_timeout: 5, onnotice: () => {} });
  const key = await importPepper(pepperB64);
  const events = [];
  const perRequest = [];
  const handler = createAdminApi({
    sql: counted(db),
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    pepper: async () => (key ? { key, version } : null),
    brainOs: { url: brainOs.url, anonKey: brainOs.anonKey },
    fetch: (u, i) => fetch(u, i),
    log: (e) => events.push(e),
    basePath,
  });
  const bodies = []; // every response body this harness returned (S-12: a pairing code is returned exactly once)
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request('http://127.0.0.1' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const store = { n: 0 };
    const response = await perRequestStore.run(store, () => handler(request));
    perRequest.push({ route: req.method + ' ' + String(req.url).split('?')[0], status: response.status, n: store.n });
    const out = Buffer.from(await response.arrayBuffer());
    bodies.push(out.toString('utf8'));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(out);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const baseUrl = origin + basePath;
  const call = async (op, body, token) => {
    const r = await fetch(baseUrl + '/v1/admin/' + op, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
    return { ...(await r.json()), http: r.status };
  };
  return { baseUrl, origin, basePath, events, bodies, perRequest, db, call, async stop() { await new Promise((r) => server.close(r)); await db.end({ timeout: 2 }); } };
}

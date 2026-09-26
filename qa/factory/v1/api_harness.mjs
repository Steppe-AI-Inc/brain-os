// The Node API handler (supabase/control-plane/edge/supabase/functions/_shared/node_api.ts - the SAME file the Edge runtime serves) on a
// local node:http server, for the developer suites. The database client is postgres.js (the version pinned for the Edge runtime),
// connected as the plane's factory_node_api login. The peer address is the TCP connection's remote address, as on the platform.
// Each handler is mounted the way the Edge platform delivers it: under its function name (/factory-node-api/v1/..., route.ts), and
// baseUrl includes that prefix, so every suite calls the production path shape.
// The pairing pepper is random per harness (a disposable plane's; never a production secret).
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EDGE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'control-plane', 'edge', 'supabase', 'functions', '_shared');

export async function startApi(plane, { pepperB64 = randomBytes(32).toString('base64'), pepperVersion = 1, basePath = '/factory-node-api' } = {}) {
  const { createNodeApi } = await import(pathToFileURL(join(EDGE, 'node_api.ts')).href);
  const { importPepper } = await import(pathToFileURL(join(EDGE, 'pairing.ts')).href);
  const { default: postgres } = await import('postgres');
  const db = postgres(plane.nodeApiUrl, { prepare: false, max: 4, idle_timeout: 5, onnotice: () => {} });
  const key = await importPepper(pepperB64);
  const events = [];
  const handler = createNodeApi({
    sql: async (text, params) => db.unsafe(text, params),
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    pepper: async () => ({ key, version: pepperVersion }),
    log: (e) => events.push(e),
    basePath,
  });
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const url = 'http://' + (req.headers.host || '127.0.0.1') + req.url;
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const response = await handler(request, { address: req.socket.remoteAddress });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, refused: 'harness_error', message: String(e.message) }));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const baseUrl = origin + basePath;
  return {
    baseUrl, origin, basePath, events, pepperB64, pepperVersion, db,
    async stop() { await new Promise((r) => server.close(r)); await db.end({ timeout: 2 }); },
  };
}

/** The Admin API handler (supabase/control-plane/edge/supabase/functions/_shared/admin_api.ts) on node:http, against a Brain OS endpoint. */
export async function startAdminApi(plane, brainOs, { pepperB64, pepperVersion = 1, basePath = '/factory-admin-api' } = {}) {
  const { createAdminApi } = await import(pathToFileURL(join(EDGE, 'admin_api.ts')).href);
  const { importPepper } = await import(pathToFileURL(join(EDGE, 'pairing.ts')).href);
  const { default: postgres } = await import('postgres');
  const db = postgres(plane.adminApiUrl, { prepare: false, max: 4, idle_timeout: 5, onnotice: () => {} });
  const key = await importPepper(pepperB64);
  const events = [];
  const handler = createAdminApi({
    sql: async (text, params) => db.unsafe(text, params),
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    pepper: async () => (key ? { key, version: pepperVersion } : null),
    brainOs: { url: brainOs.url, anonKey: brainOs.anonKey },
    fetch: (u, i) => fetch(u, i),
    log: (e) => events.push(e),
    basePath,
  });
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const request = new Request('http://127.0.0.1' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const baseUrl = origin + basePath;
  const call = async (op, body, token) => {
    const r = await fetch(baseUrl + '/v1/admin/' + op, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
    return { ...(await r.json()), http: r.status };
  };
  return { baseUrl, origin, basePath, events, db, call, async stop() { await new Promise((r) => server.close(r)); await db.end({ timeout: 2 }); } };
}

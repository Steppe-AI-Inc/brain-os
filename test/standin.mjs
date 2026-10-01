// A stand-in for the project's REST endpoints, for the tests: PostgREST's rpc route (run on the disposable plane, as the role the
// presented key maps to) and the Storage object routes of the private bucket (kept in memory). It is a MODEL of the hosted API.
// It records every call it receives, so a test can show what the function did and did not reach.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { BUCKET } from './plane.mjs';

const jwtLike = () => ['eyJ' + randomBytes(12).toString('base64url'), randomBytes(40).toString('base64url'), randomBytes(32).toString('base64url')].join('.');
const readBody = async (req) => { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks); };

export async function startStandIn(plane) {
  // the two kinds of service key the hosted API knows: a legacy service_role key (a JWT, sent on both headers) and a secret key
  // (not a JWT, sent on apikey alone and refused as a bearer token)
  const keys = { legacy: jwtLike(), deadLegacy: jwtLike(), secret: 'sb_secret_' + randomBytes(24).toString('hex'), anon: 'anon_' + randomBytes(24).toString('hex') };
  const db = { service: await plane.api('service_role'), anon: await plane.api('anon') };
  plane.track(db.service); plane.track(db.anon);
  const objects = new Map();
  const faults = { putFails: 0, finishFails: 0, consumeFails: 0, beginFails: 0, corrupt: false };
  const keysSeen = new Set();
  /** every call received: 'rpc:<fn>' or 'storage:<METHOD>' */
  const calls = [];
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const send = (status, value) => { const out = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value)); res.writeHead(status, { 'content-type': Buffer.isBuffer(value) ? 'application/octet-stream' : 'application/json' }); res.end(out); };
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, ''), apikey = req.headers.apikey ?? '';
    const role = (apikey === keys.legacy && bearer === keys.legacy) || (apikey === keys.secret && !req.headers.authorization) ? 'service' : bearer === keys.anon ? 'anon' : null;
    if (role === 'service') keysSeen.add(apikey === keys.legacy ? 'legacy' : 'secret');
    try {
      if (req.method === 'POST' && req.url === '/rest/v1/rpc/factory_relay_rpc') {
        let request = null;
        try { request = JSON.parse(body.toString('utf8')).request; } catch { /* recorded as it is */ }
        calls.push('rpc:' + (request?.fn ?? '?'));
        if (!role) return send(401, { message: 'Invalid API key' });
        if (request?.fn === 'begin' && faults.beginFails > 0) { faults.beginFails--; return send(503, { message: 'the database is unavailable' }); }
        if (request?.fn === 'finish' && faults.finishFails > 0) { faults.finishFails--; return send(503, { message: 'the database is unavailable' }); }
        if (request?.fn === 'begin' && request.op === 'receipt' && request.payload?.state === 'CONSUMED' && faults.consumeFails > 0) { faults.consumeFails--; return send(503, { message: 'the database is unavailable' }); }
        try { return send(200, (await db[role].query('select public.factory_relay_rpc($1::jsonb) as r', [JSON.stringify(request)])).rows[0].r); }
        catch (e) { return send(e.code === '42501' ? 403 : 500, { code: e.code, message: e.message }); }
      }
      const prefix = '/storage/v1/object/' + BUCKET;
      if (req.url.startsWith(prefix)) {
        calls.push('storage:' + req.method);
        // a private bucket with no policy: only the service key reads or writes it
        if (role !== 'service') return send(400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
        const path = decodeURIComponent(req.url.slice(prefix.length + 1));
        if (req.method === 'POST') {
          if (faults.putFails > 0) { faults.putFails--; return send(500, { statusCode: '500', error: 'Internal', message: 'storage is unavailable' }); }
          if (objects.has(path) && req.headers['x-upsert'] !== 'true') return send(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
          objects.set(path, body);
          return send(200, { Key: BUCKET + '/' + path, Id: randomBytes(8).toString('hex') });
        }
        if (req.method === 'GET') {
          if (!objects.has(path)) return send(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
          const bytes = Buffer.from(objects.get(path));
          if (faults.corrupt) bytes[0] ^= 0xff;
          return send(200, bytes);
        }
        if (req.method === 'DELETE' && req.url === prefix) {
          const gone = [];
          for (const p of JSON.parse(body.toString('utf8')).prefixes ?? []) if (objects.delete(p)) gone.push({ name: p });
          return send(200, gone);
        }
      }
      send(404, { message: 'not found' });
    } catch (e) { send(500, { message: e.message }); }
  });
  const port = await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server.address().port)));
  return { url: 'http://127.0.0.1:' + port, keys, objects, faults, keysSeen, calls, close: () => { server.closeAllConnections?.(); server.close(); } };
}

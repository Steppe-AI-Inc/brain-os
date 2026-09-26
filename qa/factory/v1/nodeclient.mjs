// A node's view of the Factory Node API, over two transports, so every suite can run the SAME scenario through the Node API
// (HTTP to the Edge handler) and by calling the SQL front doors directly (AC-9: "through the Node API and by calling the SQL front
// doors directly").
//
//   const n = await directNode(nodeApiUrl, identity)   // identity: { publicKey, privateKey, thumbprint } of an enrolled credential
//   const n = apiNode(baseUrl, identity)
//   await n.session(); const r = await n.op('claim', { ... })     // r: the front door's jsonb (ok / refused / http)
//
// The session exchange: the node signs a <= 60 s assertion {aud, iat, exp, jti, pk}; the direct transport skips the signature (the
// API role is the party that verifies it), the API transport sends it signed.
import { createHash, randomBytes, sign } from 'node:crypto';
import { connect } from './plane.mjs';

export const OPS = {
  register: 'node_register', heartbeat: 'node_heartbeat', claim: 'node_claim', renew: 'node_renew', checkpoint: 'node_checkpoint',
  complete: 'node_complete', release: 'node_release', 'verification-claim': 'node_verification_claim', certify: 'node_certify',
  'report-state': 'node_report_state',
};

const b64u = (b) => Buffer.from(b).toString('base64url');
export const newToken = () => b64u(randomBytes(32));
export const tokenHash = (t) => createHash('sha256').update(t, 'utf8').digest();

/** A signed session assertion (compact: base64url(payload JSON) + '.' + base64url(Ed25519 signature over the payload bytes)). */
export function assertion(identity, { now = Date.now(), lifetimeS = 50, jti = b64u(randomBytes(18)), aud = 'factory-node-api' } = {}) {
  const payload = { v: 1, aud, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + lifetimeS, jti, pk: b64u(identity.publicKey) };
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  return b64u(bytes) + '.' + b64u(sign(null, bytes, identity.privateKey));
}

export async function directNode(nodeApiUrl, identity) {
  const c = await connect(nodeApiUrl);
  let token = null;
  const node = {
    identity,
    get token() { return token; },
    set token(t) { token = t; },
    async session({ jti, iat, exp, aud = 'factory-node-api' } = {}) {
      const t = newToken();
      const nowS = Math.floor(Date.now() / 1000);
      const r = (await c.query('select factory.node_session_open($1, $2, to_timestamp($3), to_timestamp($4), $5, $6) r',
        [identity.thumbprint, jti || b64u(randomBytes(18)), iat ?? nowS, exp ?? nowS + 50, aud, tokenHash(t)])).rows[0].r;
      if (r.ok) token = t;
      return r;
    },
    async op(name, body = {}) {
      const fn = OPS[name];
      if (!fn) throw new Error('no such node operation: ' + name);
      // a database error is what the handler turns into 500 server_refused (the call rolled back): the direct transport says the same
      try { return (await c.query(`select factory.${fn}($1::bytea, $2::jsonb) r`, [token ? tokenHash(token) : null, JSON.stringify(body)])).rows[0].r; }
      catch (e) { if (e && typeof e.code === 'string') return { ok: false, refused: 'server_refused', http: 500, code: e.code, message: String(e.message) }; throw e; }
    },
    async rotate(newIdentity) {
      const r = (await c.query('select factory.node_credential_rotate($1, $2, $3) r', [token ? tokenHash(token) : null, newIdentity.thumbprint, newIdentity.publicKey])).rows[0].r;
      return r;
    },
    async time() { return (await c.query('select factory.node_time() r')).rows[0].r; },
    client: c,
    async close() { await c.end(); },
  };
  return node;
}

export function apiNode(baseUrl, identity, { fetchImpl = fetch } = {}) {
  let token = null;
  const post = async (path, body, auth = true) => {
    const res = await fetchImpl(baseUrl + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth && token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({ ok: false, refused: 'bad_response', http: res.status }));
    return { ...j, http: res.status };
  };
  return {
    identity,
    get token() { return token; },
    set token(t) { token = t; },
    async session(opts = {}) {
      const r = await post('/v1/session', { assertion: assertion(identity, opts) }, false);
      if (r.ok) token = r.session_token;
      return r;
    },
    async op(name, body = {}) { return post('/v1/node/' + name, body); },
    async rotate(newIdentity) {
      // the new key signs a message bound to THIS session (sha256 of the bearer token) and to itself
      const msg = Buffer.from('brain-factory-rotate-v1|' + createHash('sha256').update(token, 'utf8').digest('hex') + '|' + newIdentity.thumbprint, 'utf8');
      return post('/v1/node/credential-rotate', { new_public_key: b64u(newIdentity.publicKey), proof: b64u(sign(null, msg, newIdentity.privateKey)) });
    },
    async time() { const res = await fetchImpl(baseUrl + '/v1/time'); return { ...(await res.json()), http: res.status }; },
    async close() {},
  };
}

// ---- the installer's two session-less calls (POST /v1/enroll/start, /v1/enroll/complete) --------------------------------------------
// localAddress lets a suite speak from another loopback address (the per-IP limit keys on the connecting peer); extraHeaders lets it
// forge a forwarding header (which must change nothing).
import { request as httpRequest } from 'node:http';
export function postFrom(baseUrl, path, body, { localAddress, extraHeaders = {} } = {}) {
  const u = new URL(baseUrl + path);
  const data = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', localAddress,
      headers: { 'content-type': 'application/json', 'content-length': data.length, ...extraHeaders } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => {
        let j; try { j = JSON.parse(Buffer.concat(chunks).toString()); } catch { j = { ok: false }; }
        resolve({ ...j, http: res.statusCode });
      });
    });
    req.on('error', reject); req.end(data);
  });
}
export async function enrollStart(baseUrl, code, identity, meta = {}, opts = {}) {
  return postFrom(baseUrl, '/v1/enroll/start', { code, public_key: b64u(identity.publicKey), ...meta }, opts);
}
export async function enrollComplete(baseUrl, started, identity, opts = {}) {
  const msg = Buffer.from('brain-factory-enroll-v1|' + started.enrollment_id + '|' + started.challenge + '|' + identity.thumbprint, 'utf8');
  return postFrom(baseUrl, '/v1/enroll/complete', { enrollment_id: started.enrollment_id, public_key: b64u(identity.publicKey),
    challenge: started.challenge, proof: b64u(sign(null, msg, identity.privateKey)) }, opts);
}

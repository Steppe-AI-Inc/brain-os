// THE NODE'S CLIENT OF THE FACTORY NODE API (S-7). The only way an enrolled computer reaches the plane: HTTPS to the API, never a
// database. Identity is the node's Ed25519 key: a <= 60 s key-signed assertion is exchanged for an opaque session token (POST
// /v1/session), and every operation carries that token; the plane re-checks the credential inside every call (S-3).
//
// A named refusal is data, returned to the caller. Three kinds are TERMINAL for this credential and never retried:
// credential_revoked, credential_superseded, computer_archived (the runtime stops and says REFUSED - no restart loop).
// A session that expired is renewed once, transparently. A plane that does not answer is retried with backoff.
import { createHash, createPrivateKey, randomBytes, sign as edSign } from 'node:crypto';

export const TERMINAL = new Set(['credential_revoked', 'credential_superseded', 'computer_archived']);
const b64u = (b) => Buffer.from(b).toString('base64url');

export function privateKeyFromDer(der) { return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }); }

export class NodeApi {
  /** api: base URL of the Node API; key: { privateKey: KeyObject, publicKey: 32-byte Buffer } */
  constructor({ api, key, fetchImpl = fetch, timeoutMs = 30000, log = () => {} }) {
    this.api = String(api).replace(/\/+$/, '');
    this.key = key;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.log = log;
    this.token = null;
    this.skewS = 0;
  }

  async request(method, path, body, { auth = false } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth && this.token) headers.authorization = 'Bearer ' + this.token;
    let res;
    try {
      res = await this.fetch(this.api + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (e) {
      return { ok: false, refused: 'unreachable', http: 0, message: 'the Factory Node API did not answer (' + (e && (e.name || e.code) || 'error') + ')' };
    }
    let j;
    try { j = await res.json(); } catch { j = { ok: false, refused: 'bad_response', message: 'the answer was not JSON' }; }
    return { ...j, http: res.status };
  }

  async time() {
    const r = await this.request('GET', '/v1/time');
    if (r.ok && r.server_time) this.skewS = Math.round((Date.parse(r.server_time) - Date.now()) / 1000);
    return r;
  }

  assertion() {
    const now = Math.floor(Date.now() / 1000) + this.skewS;
    const payload = Buffer.from(JSON.stringify({ v: 1, aud: 'factory-node-api', iat: now, exp: now + 50, jti: b64u(randomBytes(18)), pk: b64u(this.key.publicKey) }), 'utf8');
    return b64u(payload) + '.' + b64u(edSign(null, payload, this.key.privateKey));
  }

  async session() {
    let r = await this.request('POST', '/v1/session', { assertion: this.assertion() });
    if (r.refused === 'assertion_expired') { await this.time(); r = await this.request('POST', '/v1/session', { assertion: this.assertion() }); }
    if (r.ok && r.session_token) { this.token = r.session_token; delete r.session_token; }
    return r;
  }

  /** a node operation; renews an expired session once; retries an unreachable plane (bounded) */
  async op(name, body = {}, { retries = 3 } = {}) {
    if (!this.token) { const s = await this.session(); if (!s.ok) return s; }
    for (let attempt = 0; ; attempt++) {
      let r = await this.request('POST', '/v1/node/' + name, body, { auth: true });
      if (r.refused === 'session_expired' || r.refused === 'session_invalid') {
        const s = await this.session();
        if (!s.ok) return s;
        r = await this.request('POST', '/v1/node/' + name, body, { auth: true });
      }
      if ((r.refused === 'unreachable' || r.refused === 'plane_unavailable' || r.http === 502 || r.http === 504) && attempt < retries) {
        await new Promise((ok) => setTimeout(ok, 1000 * 2 ** attempt));
        continue;
      }
      return r;
    }
  }

  /** node-initiated rotation: the NEW key signs a message bound to this session and to itself */
  async rotate(newKey) {
    if (!this.token) { const s = await this.session(); if (!s.ok) return s; }
    const newThumb = createHash('sha256').update(newKey.publicKey).digest('hex');
    const tokenHash = createHash('sha256').update(this.token, 'utf8').digest('hex');
    const proof = edSign(null, Buffer.from('brain-factory-rotate-v1|' + tokenHash + '|' + newThumb, 'utf8'), newKey.privateKey);
    return this.request('POST', '/v1/node/credential-rotate', { new_public_key: b64u(newKey.publicKey), proof: b64u(proof) }, { auth: true });
  }

  // ---- the installer's two session-less calls ----
  async enrollStart(code, meta) {
    return this.request('POST', '/v1/enroll/start', { code, public_key: b64u(this.key.publicKey), ...meta });
  }
  async enrollComplete(started) {
    const thumb = createHash('sha256').update(this.key.publicKey).digest('hex');
    const proof = edSign(null, Buffer.from('brain-factory-enroll-v1|' + started.enrollment_id + '|' + started.challenge + '|' + thumb, 'utf8'), this.key.privateKey);
    return this.request('POST', '/v1/enroll/complete', { enrollment_id: started.enrollment_id, public_key: b64u(this.key.publicKey), challenge: started.challenge, proof: b64u(proof) });
  }
}

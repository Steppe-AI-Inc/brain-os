// A node's side of the relay: its own key, its own settings, and one signed request at a time.
// The node holds nothing of the platform: no project key, no database login, no storage credential.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const SIGNING_CONTEXT = 'factory-artifact-relay/v0';
const ED25519_SPKI = Buffer.from('302a300506032b6570032100', 'hex');

export const relayHome = () => process.env.RELAY_HOME || join(homedir(), '.brain-factory-relay');
const configPath = () => join(relayHome(), 'config.json');
const keyPath = () => join(relayHome(), 'relay.ed25519.pem');

export class RelayError extends Error {}

export function loadConfig() {
  if (!existsSync(configPath())) throw new RelayError('this node has no relay identity yet: run "keygen" first (' + relayHome() + ')');
  return JSON.parse(readFileSync(configPath(), 'utf8'));
}
export function saveConfig(cfg) {
  mkdirSync(relayHome(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}

/** makes this node's relay key. It never overwrites one: a registered key is the node's identity. */
export function createIdentity({ nodeId, relayRole }) {
  if (existsSync(keyPath()) || existsSync(configPath())) throw new RelayError('this node already has a relay identity in ' + relayHome() + ' (it is not overwritten)');
  mkdirSync(relayHome(), { recursive: true });
  const { privateKey } = generateKeyPairSync('ed25519');
  writeFileSync(keyPath(), privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600, flag: 'wx' });
  saveConfig({ node_id: nodeId, relay_role: relayRole });
  return publicKey();
}

const privateKey = () => {
  if (!existsSync(keyPath())) throw new RelayError('this node has no relay key: run "keygen" first');
  return createPrivateKey(readFileSync(keyPath()));
};
/** this node's public key: the 43-character base64url form of its 32 bytes (what the founder registers) */
export const publicKey = () => createPublicKey(privateKey()).export({ format: 'jwk' }).x;

export const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');
/** the exact bytes a node signs: the context, the method, the action, the node, the time, the nonce and the sha256 of the body */
export const signedMessage = (action, nodeId, ts, nonce, bodySha256) => Buffer.from([SIGNING_CONTEXT, 'POST', action, nodeId, ts, nonce, bodySha256].join('\n'), 'utf8');

/** true when `signature` is `publicKeyB64u`'s signature over that request */
export function verifyRequestSignature({ publicKeyB64u, action, nodeId, ts, nonce, bodySha256, signature }) {
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI, Buffer.from(publicKeyB64u, 'base64url')]), format: 'der', type: 'spki' });
    return verify(null, signedMessage(action, nodeId, String(ts), nonce, bodySha256), key, Buffer.from(signature, 'base64url'));
  } catch { return false; }
}

/** the relay is reached over TLS only; plain http is accepted for a loopback address when a test asks for it */
export function checkedUrl(url) {
  let u;
  try { u = new URL(url); } catch { throw new RelayError('the relay URL is not a URL'); }
  const loopback = u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && process.env.RELAY_ALLOW_LOOPBACK === '1';
  if (u.protocol !== 'https:' && !loopback) throw new RelayError('the relay URL must be https');
  return u.toString();
}

/** one signed request; returns { status, body } and never throws on a refusal */
export async function call(cfg, op, payload = {}) {
  const url = checkedUrl(cfg.url ?? '');
  const body = Buffer.from(JSON.stringify({ op, payload }), 'utf8');
  const ts = String(Date.now()), nonce = randomBytes(16).toString('hex');
  const signature = sign(null, signedMessage(op, cfg.node_id, ts, nonce, sha256Hex(body)), privateKey()).toString('base64url');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-relay-node': cfg.node_id, 'x-relay-action': op, 'x-relay-ts': ts, 'x-relay-nonce': nonce, 'x-relay-sig': signature },
      body, signal: AbortSignal.timeout(120000),
    });
  } catch (e) { throw new RelayError('the relay could not be reached: ' + (e.cause?.code ?? e.name)); }
  let parsed = null;
  try { parsed = JSON.parse(await res.text()); } catch { /* not JSON: not the relay */ }
  // an answer that is not the relay's own (a gateway's, a proxy's) is named as such, with what it said
  if (parsed === null || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') {
    const said = parsed !== null && typeof parsed === 'object' ? parsed.message ?? parsed.msg ?? parsed.error : null;
    parsed = { ok: false, refused: 'not_a_relay_answer', ...(typeof said === 'string' ? { detail: said.slice(0, 120) } : {}) };
  }
  return { status: res.status, body: parsed };
}

/** like call, but a refusal is an error that names it */
export async function must(cfg, op, payload = {}) {
  const r = await call(cfg, op, payload);
  if (r.status !== 200 || r.body.ok !== true) {
    throw new RelayError(`the relay refused "${op}": ${r.body.refused ?? 'no reason'}${r.body.detail ? ' (' + r.body.detail + ')' : ''} [${r.status}]`);
  }
  return r.body;
}

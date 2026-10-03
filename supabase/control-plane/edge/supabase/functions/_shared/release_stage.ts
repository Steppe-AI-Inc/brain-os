// THE PREPARED UPDATE, STAGED BY THE FACTORY (founder correction 2026-10-03; CR-028). Per-release staging is not a founder action:
// before Brain OS -> Factory -> Update can be confirmed, the Factory's release storage already holds the certified release and the
// Factory knows its candidate SHA, version, digest and certifying receipt. Until now the founder placed those files and compared the
// four values on the page with the ones the Director gave (S-5). Both become the Factory's:
//   * the DIRECTOR - the party that certifies - signs the prepared update's STATEMENT with its existing signing key (the one the
//     ledger records as director_signing_key; ssh-keygen -Y sign, namespace STAGE_NAMESPACE) and sends it to factory-release-stage;
//   * factory-release-stage verifies that signature against DIRECTOR_KEY, writes the prepared update (the release tool's unsigned
//     manifest form, as before) and the signature beside it, and answers a one-object upload URL for the installer, which the
//     Director's command then uploads - once: the URL never overwrites an installer that is there;
//   * at Confirm, the Admin API checks the same signature again and that the four values asked for are the staged ones (stagedUpdate),
//     and tells the front door; the front door refuses anything else (not_staged), audited. So the founder's one confirmation can
//     only ever publish what the Director certified - whoever holds the founder's session and password.
// Nothing here can sign a release: the release signer signs only inside the founder-authorized publication (WO-6 r3).
import { ed25519Verify } from './node_api.ts';
import { RELEASE_BUCKET, manifestText } from './release_storage.ts';

// the Director's signing key as the Director's ledger records it (director_signing_key.public_key at the designated Director commit;
// release_stage_acceptance SG5 holds this constant to that record byte for byte)
export const DIRECTOR_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMqq8Gs6th84KblGohVODwpzVgXOvcNTXWvCfpqbG2P/';
export const STAGE_NAMESPACE = 'brain-factory-prepared-update-v1';
export const INSTALLER_FILE = 'BrainFactorySetup.exe';
export const PREPARED_FILE = 'prepared.json';
export const PREPARED_SIG_FILE = 'prepared.sig';
const MAX_REQUEST = 16384;
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]{1,40})?$/;
const te = new TextEncoder(), td = new TextDecoder();

export type Statement = { channel: 'production'; version: string; source_sha: string; digest: string; receipt_sha256: string };

/** the four values (and the channel) in the one form the Director signs: JSON, keys in sorted order, no white space */
export function statementText(s: Statement): string {
  return JSON.stringify({ channel: s.channel, digest: s.digest, receipt_sha256: s.receipt_sha256, source_sha: s.source_sha, v: 1, version: s.version });
}
/** a statement is exactly that form of a production update whose values have their fixed formats; anything else is null */
export function parseStatement(text: unknown): Statement | null {
  if (typeof text !== 'string' || text.length > 1024) return null;
  let o: Record<string, unknown>;
  try { o = JSON.parse(text); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const s = { channel: o.channel, version: o.version, source_sha: o.source_sha, digest: o.digest, receipt_sha256: o.receipt_sha256 } as Statement;
  if (s.channel !== 'production' || typeof s.version !== 'string' || !VERSION.test(s.version) || typeof s.source_sha !== 'string' || !/^[0-9a-f]{40}$/.test(s.source_sha)
    || typeof s.digest !== 'string' || !/^[0-9a-f]{64}$/.test(s.digest) || typeof s.receipt_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(s.receipt_sha256)) return null;
  return statementText(s) === text ? s : null;
}

// ---- OpenSSH's signature format (PROTOCOL.sshsig): an ssh-ed25519 key, the namespace, sha512 of the message. The parsers below
// never throw: a value that is not well formed is null / false (the caller's input is never an error, G6)
const u32 = (b: Uint8Array, o: number): number => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
/** the SSH wire string at offset o and the offset after it; null when it does not fit */
function str(b: Uint8Array | null, o: number): [Uint8Array, number] | null {
  if (!b || o < 0 || o + 4 > b.length) return null;
  const n = u32(b, o);
  return o + 4 + n > b.length ? null : [b.subarray(o + 4, o + 4 + n), o + 4 + n];
}
/** standard base64 that atob takes without an error, decoded; null for anything else */
const b64 = (s: string): Uint8Array | null =>
  /^[A-Za-z0-9+/]*={0,2}$/.test(s) && s.length % 4 === 0 ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : null;
function sshString(x: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + x.length);
  out[0] = x.length >>> 24; out[1] = (x.length >>> 16) & 255; out[2] = (x.length >>> 8) & 255; out[3] = x.length & 255;
  out.set(x, 4);
  return out;
}
const concat = (...parts: Uint8Array[]): Uint8Array => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
/** an SSH ed25519 wire blob - string "ssh-ed25519", string <n bytes> - and nothing after it: those n bytes, else null */
function ed25519Blob(b: Uint8Array | null, n: number): Uint8Array | null {
  const type = str(b, 0); const value = type && str(b, type[1]);
  return type && value && td.decode(type[0]) === 'ssh-ed25519' && value[1] === b!.length && value[0].length === n ? value[0] : null;
}

/** the 32-byte key of an OpenSSH "ssh-ed25519 <base64> [comment]" line; null for anything else */
export function ed25519KeyOf(line: string): Uint8Array | null {
  const m = /^ssh-ed25519 ([A-Za-z0-9+/]+={0,2})(?: [^\r\n]*)?$/.exec(String(line).trim());
  return m ? ed25519Blob(b64(m[1]), 32) : null;
}

/** true only for an armored SSH signature, by exactly `publicKey`, in exactly `namespace`, with sha512, over exactly `message` */
export async function verifySshSignature(armored: unknown, message: Uint8Array, namespace: string, publicKey: Uint8Array): Promise<boolean> {
  if (typeof armored !== 'string' || armored.length > 4096) return false;
  const m = /^-----BEGIN SSH SIGNATURE-----\r?\n([A-Za-z0-9+/=\r\n]+?)\r?\n-----END SSH SIGNATURE-----\r?\n?$/.exec(armored);
  const b = m ? b64(m[1].replace(/[\r\n]/g, '')) : null;
  if (!b || b.length < 10 || td.decode(b.subarray(0, 6)) !== 'SSHSIG' || u32(b, 6) !== 1) return false;
  const pk = str(b, 10), ns = pk && str(b, pk[1]), reserved = ns && str(b, ns[1]), alg = reserved && str(b, reserved[1]), sig = alg && str(b, alg[1]);
  if (!pk || !ns || !reserved || !alg || !sig || sig[1] !== b.length) return false;
  const key = ed25519Blob(pk[0], 32), raw = ed25519Blob(sig[0], 64);
  if (!key || !raw || !same(key, publicKey) || td.decode(ns[0]) !== namespace || td.decode(alg[0]) !== 'sha512') return false;
  const h = new Uint8Array(await crypto.subtle.digest('SHA-512', new Uint8Array(message)));
  const signed = concat(te.encode('SSHSIG'), sshString(te.encode(namespace)), sshString(reserved[0]), sshString(te.encode('sha512')), sshString(h));
  return await ed25519Verify(publicKey, raw, signed);
}

const semverCore = (v: string): number[] => v.split(/[-+]/)[0].split('.').map(Number);
const notNewer = (a: string, b: string): boolean => { const x = semverCore(a), y = semverCore(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return true; };

// ---- factory-release-stage: the Director's signed statement in, the prepared update out
export type StageDeps = {
  directorKey: string;                                                          // DIRECTOR_KEY (a test key in a harness)
  read: (path: string) => Promise<string | null>;                               // an object of the release bucket, or null when there is none
  put: (path: string, body: string, contentType: string) => Promise<boolean>;   // write (replace) one object
  signUpload: (path: string) => Promise<string | null>;                         // a URL that uploads that one object, never over one that is there
  selfTest?: () => Promise<boolean>;                                            // the runtime's Ed25519 (node_api.ts ed25519SelfTest)
};
const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const refuse = (status: number, refused: string, message: string): Response => json(status, { ok: false, refused, message });

export function createStageApi(deps: StageDeps): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      return await stage(deps, req);
    } catch (e) {
      // THE REQUEST BOUNDARY: storage or the runtime failing is an error, never an answer about the statement
      return refuse(503, 'unavailable', 'the staging request did not complete (' + ((e as Error)?.name || 'error') + '): read the prepared update back before relying on it');
    }
  };
}

async function stage(deps: StageDeps, req: Request): Promise<Response> {
  {
    if (req.method !== 'POST') return refuse(405, 'method_not_allowed', 'POST { statement, signature }');
    if (deps.selfTest && !(await deps.selfTest())) return refuse(503, 'unavailable', 'this runtime cannot verify Ed25519 signatures: nothing is staged');
    const text = await req.text();
    if (text.length > MAX_REQUEST) return refuse(413, 'too_large', 'a staging request is a statement and its signature');
    let body: Record<string, unknown> | null = null;
    try { body = JSON.parse(text); } catch { body = null; }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => k !== 'statement' && k !== 'signature')) {
      return refuse(400, 'bad_request', 'a staging request is { statement, signature } and nothing else');
    }
    const st = parseStatement(body.statement);
    if (!st) return refuse(400, 'bad_request', 'the statement is ' + statementText({ channel: 'production', version: '<version>', source_sha: '<40 hex>', digest: '<64 hex>', receipt_sha256: '<64 hex>' }) + ', exactly');
    const key = ed25519KeyOf(deps.directorKey);
    if (!key) return refuse(503, 'misconfigured', 'the Director key this function checks is not an ssh-ed25519 key');
    if (!(await verifySshSignature(body.signature, te.encode(statementText(st)), STAGE_NAMESPACE, key))) {
      return refuse(403, 'bad_signature', 'the statement is not signed by the Director\'s signing key for staging (' + STAGE_NAMESPACE + '): nothing is staged');
    }
    // an older prepared update never replaces a newer one (a signature is public once staged, so it can be sent again)
    const current = await stagedStatementOf(deps.read, key);
    if (current && statementText(current) !== statementText(st) && notNewer(st.version, current.version)) {
      return refuse(409, 'not_newer', 'the prepared update is ' + current.version + ': only a newer version replaces it');
    }
    const prepared = manifestText({ v: 1, channel: st.channel, version: st.version, source_sha: st.source_sha, digest: st.digest, key_id: null, receipt_sha256: st.receipt_sha256, signature: null });
    if (!(await deps.put('production/' + PREPARED_FILE, prepared, 'application/json')) || !(await deps.put('production/' + PREPARED_SIG_FILE, String(body.signature), 'text/plain'))) {
      return refuse(503, 'storage_unavailable', 'release storage did not take the prepared update');
    }
    const upload = await deps.signUpload('production/' + encodeURIComponent(st.version) + '/' + INSTALLER_FILE);
    if (!upload) return refuse(503, 'storage_unavailable', 'release storage gave no upload address for the installer');
    return json(200, { ok: true, staged: st, installer_upload_url: upload, installer_path: 'production/' + st.version + '/' + INSTALLER_FILE });
  }
}

/** the staged statement, when the prepared update and its signature in release storage are the Director's; else null */
async function stagedStatementOf(read: (path: string) => Promise<string | null>, key: Uint8Array): Promise<Statement | null> {
  const [pj, sig] = [await read('production/' + PREPARED_FILE), await read('production/' + PREPARED_SIG_FILE)];
  if (!pj || !sig) return null;
  let p: Record<string, unknown>;
  try { p = JSON.parse(pj); } catch { return null; }
  if (!p || p.v !== 1 || p.key_id !== null || p.signature !== null) return null;
  const st = parseStatement(statementText({ channel: p.channel, version: p.version, source_sha: p.source_sha, digest: p.digest, receipt_sha256: p.receipt_sha256 } as Statement));
  if (!st) return null;
  return (await verifySshSignature(sig, te.encode(statementText(st)), STAGE_NAMESPACE, key)) ? st : null;
}

/** the Admin API's staged check (createAdminApi's `staged`): are the four values asked for the ones the Director's signature stages? */
export function stagedUpdate(cfg: { read: (path: string) => Promise<string | null>; directorKey?: string }): (body: Record<string, unknown>) => Promise<boolean> {
  return async (body) => {
    const key = ed25519KeyOf(cfg.directorKey || DIRECTOR_KEY);
    if (!key) return false;
    const st = await stagedStatementOf(cfg.read, key);
    return !!st && body.channel === st.channel && body.version === st.version && body.source_sha === st.source_sha && body.digest === st.digest
      && body.receipt_sha256 === st.receipt_sha256;
  };
}

// ---- release storage, through the platform's address and storage key (the entry points read them from the environment)
const base = (url: string): string => url.replace(/\/+$/, '') + '/storage/v1';
export function storageReader(cfg: { url: string; key: string; fetch: typeof fetch }): (path: string) => Promise<string | null> {
  return async (path) => {
    if (!cfg.url || !cfg.key) return null;
    // the authenticated read: never a cached public copy, so a new prepared update and its signature are read together
    const r = await cfg.fetch(base(cfg.url) + '/object/authenticated/' + RELEASE_BUCKET + '/' + path, { headers: { authorization: 'Bearer ' + cfg.key, apikey: cfg.key } });
    if (r.status === 200) return await r.text();
    await r.body?.cancel();
    return null;
  };
}
export function storageWriter(cfg: { url: string; key: string; fetch: typeof fetch }): StageDeps['put'] {
  return async (path, body, contentType) => {
    if (!cfg.url || !cfg.key) return false;
    const r = await cfg.fetch(base(cfg.url) + '/object/' + RELEASE_BUCKET + '/' + path, {
      method: 'POST', body,
      headers: { authorization: 'Bearer ' + cfg.key, apikey: cfg.key, 'content-type': contentType, 'x-upsert': 'true', 'cache-control': 'no-cache' },
    });
    await r.body?.cancel();
    return r.ok;
  };
}
export function storageUploadSigner(cfg: { url: string; key: string; fetch: typeof fetch }): StageDeps['signUpload'] {
  return async (path) => {
    if (!cfg.url || !cfg.key) return null;
    // no x-upsert: the URL uploads the installer once, and never over one that is already there
    const r = await cfg.fetch(base(cfg.url) + '/object/upload/sign/' + RELEASE_BUCKET + '/' + path, { method: 'POST', headers: { authorization: 'Bearer ' + cfg.key, apikey: cfg.key } });
    if (!r.ok) { await r.body?.cancel(); return null; }
    const j = await r.json() as { url?: unknown };
    return typeof j.url === 'string' && j.url.startsWith('/object/upload/sign/') ? base(cfg.url) + j.url : null;
  };
}

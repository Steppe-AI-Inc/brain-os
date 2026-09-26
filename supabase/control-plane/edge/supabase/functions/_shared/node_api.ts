// THE FACTORY NODE API (WO-2; S-3, S-4, S-7, S-10, S-12). Portable: erasable-only TypeScript, (Request) -> Response, dependencies
// injected, so Deno serves it on the Factory project's Edge runtime (factory-node-api/index.ts) and Node 24 runs the SAME file in
// the developer suites (qa/factory/v1/api_harness.mjs).
//
// ONE ENGINE (P-2). This handler authenticates the transport and calls EXACTLY ONE SQL front door per route; it makes no
// lifecycle decision. Authentication here means: hashing the bearer session token (the front door resolves it and re-checks the
// credential inside its own transaction), or verifying an Ed25519 signature against the public key THE REQUEST PRESENTS (the front
// door then accepts only a key whose sha256 thumbprint is an active credential's). Tenant, identity and authority are never taken
// from the body: a body naming one is refused (S-4), and every other unknown field is refused too.
//
// THE ROUTE SURFACE IS EXACTLY S-7: GET /v1/time, POST /v1/enroll/start, POST /v1/enroll/complete, POST /v1/session, and the node
// operations under POST /v1/node/<op>. Anything else is 404. There is no test-only operation.
//
// SECRETS (S-12): the session token is returned once, to the node that proved its key, and stored only as a hash; nothing here logs
// a token, a code, a key or a body.
import { enroll } from './enroll.ts';
import { routePath } from './route.ts';

export type Sql = (text: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;
export type Deps = {
  sql: Sql;                                   // runs ONE statement on the Node API's database login, returns rows
  randomBytes: (n: number) => Uint8Array;     // a CSPRNG
  pepper?: () => Promise<{ key: CryptoKey; version: number } | null>;  // enrollment (part 150): FACTORY_PAIRING_PEPPER, from the secret store
  log?: (event: Record<string, unknown>) => void;  // structured, secret-free
  basePath?: string;                          // the function's own path prefix on the Edge platform ('/factory-node-api'; route.ts)
};
export type Peer = { address: string };

// ---- the front doors, one per route (the static one-engine check reads this table) -------------------------------------------
export const FRONT_DOORS: Record<string, string> = {
  'GET /v1/time': 'select factory.node_time() as r',
  'POST /v1/session': 'select factory.node_session_open($1, $2, to_timestamp($3), to_timestamp($4), $5, decode($6, \'hex\')) as r',
  'POST /v1/enroll/start': 'select factory.node_enroll_start($1, decode($2, \'hex\'), $3::integer, decode($4, \'hex\'), $5::inet, $6::text::jsonb) as r',
  'POST /v1/enroll/complete': 'select factory.node_enroll_complete($1::uuid, $2, decode($3, \'hex\'), $4::inet) as r',
  'POST /v1/node/register': 'select factory.node_register(decode($1, \'hex\'), $2::text::jsonb) as r',
  'POST /v1/node/heartbeat': 'select factory.node_heartbeat(decode($1, \'hex\'), $2::text::jsonb) as r',
  'POST /v1/node/claim': 'select factory.node_claim(decode($1, \'hex\'), $2::text::jsonb) as r',
  'POST /v1/node/renew': 'select factory.node_renew(decode($1, \'hex\'), $2::text::jsonb) as r',
  'POST /v1/node/checkpoint': 'select factory.node_checkpoint(decode($1, \'hex\'), $2::text::jsonb) as r',
  'POST /v1/node/complete': 'select factory.node_complete(decode($1, \'hex\'), $2::text::jsonb) as r',
  'POST /v1/node/release': 'select factory.node_release(decode($1, \'hex\'), $2::text::jsonb) as r',
  'POST /v1/node/verification-claim': 'select factory.node_verification_claim(decode($1, \'hex\'), $2::text::jsonb) as r',
  'POST /v1/node/certify': 'select factory.node_certify(decode($1, \'hex\'), $2::text::jsonb) as r',
  'POST /v1/node/report-state': 'select factory.node_report_state(decode($1, \'hex\'), $2::text::jsonb) as r',
  'POST /v1/node/credential-rotate': 'select factory.node_credential_rotate(decode($1, \'hex\'), $2, decode($3, \'hex\')) as r',
};

// ---- request bodies: exactly these fields, these types -------------------------------------------------------------------------
type Field = 'str64' | 'str200' | 'str255' | 'str1000' | 'str4000' | 'hex64' | 'uuid' | 'num' | 'obj' | 'strs' | 'uuids' | 'b64u32' | 'b64u64'
  | 'assertion' | 'commit' | 'tree' | 'code';
const COMMON_CLAIM: Record<string, Field> = { lease_seconds: 'num', work_types: 'strs', only_work_order_id: 'uuid', requested_provider: 'str64',
  requested_model: 'str200', reasoning_effort: 'str64', base_commit: 'str64', resources: 'obj', fingerprint: 'hex64' };
export const BODIES: Record<string, Record<string, Field>> = {
  'POST /v1/session': { assertion: 'assertion' },
  'POST /v1/enroll/start': { code: 'code', public_key: 'b64u32', fingerprint: 'hex64', hostname: 'str255' },
  'POST /v1/enroll/complete': { enrollment_id: 'uuid', public_key: 'b64u32', challenge: 'hex64', proof: 'b64u64' },
  'POST /v1/node/register': { runtime_version: 'str64', runtime_digest: 'hex64', fingerprint: 'hex64', hostname: 'str255', os: 'str255', resources: 'obj' },
  'POST /v1/node/heartbeat': { phase: 'str64', resources: 'obj', fingerprint: 'hex64' },
  'POST /v1/node/claim': COMMON_CLAIM,
  'POST /v1/node/verification-claim': COMMON_CLAIM,
  'POST /v1/node/renew': { run_id: 'uuid', lease_seconds: 'num' },
  'POST /v1/node/checkpoint': { run_id: 'uuid', checkpoint_id: 'uuid', location: 'str1000', scenario: 'str200', payload: 'obj', branch: 'str200', worktree: 'str1000' },
  'POST /v1/node/complete': { run_id: 'uuid', status: 'str64', termination_reason: 'str200', summary: 'str4000', head_commit: 'commit', candidate_tree: 'tree',
    actual_provider: 'str64', actual_model: 'str200', fallback_reason: 'str1000', usage: 'obj' },
  'POST /v1/node/release': { run_id: 'uuid', keep_run_ids: 'uuids' },
  'POST /v1/node/certify': { run_id: 'uuid', verdict: 'str64', work_order_id: 'uuid', candidate_run_id: 'uuid', candidate_tree: 'tree', candidate_commit: 'commit', reason: 'str4000' },
  'POST /v1/node/report-state': { enrollment_step: 'str64', reason: 'str200', phase: 'str64' },
  'POST /v1/node/credential-rotate': { new_public_key: 'b64u32', proof: 'b64u64' },
};
// never accepted from a body: identity, tenant and authority come from the credential (S-4)
const IDENTITY_FIELDS = new Set(['node_id', 'tenant_id', 'principal_id', 'computer_id', 'credential_id', 'security_role', 'role', 'roles',
  'capabilities', 'envelope', 'envelope_version', 'authorized_roles', 'authorized_capabilities', 'company_ids', 'max_concurrent_runs',
  'max_heavy', 'agent', 'agent_id', 'identity', 'tenant', 'may_verify']);

const MAX_BODY = 65536;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = {
  enc(b: Uint8Array): string { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(s: string): Uint8Array | null {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
    try { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); } catch { return null; }
  },
};
// WebCrypto takes an ArrayBuffer-backed view (TS 5.7+ types Uint8Array by its buffer): a copy when the view may sit on another buffer
const own = (b: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(b);
export const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export async function sha256(b: Uint8Array): Promise<Uint8Array> { return new Uint8Array(await crypto.subtle.digest('SHA-256', own(b))); }

export async function ed25519Verify(publicKey: Uint8Array, signature: Uint8Array, message: Uint8Array): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', own(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, own(signature), own(message));
  } catch { return false; }
}

// RFC 8032 §7.1 TEST 1: the runtime's Ed25519 must verify a known-good signature and refuse a one-bit change, or this API serves
// nothing (fail closed, 503) - a platform whose WebCrypto lacks Ed25519 must never accept every signature or none silently.
const RFC8032_PK = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const RFC8032_SIG = 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';
const fromHex = (h: string): Uint8Array => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
let selfTest: Promise<boolean> | null = null;
export function ed25519SelfTest(): Promise<boolean> {
  if (!selfTest) {
    selfTest = (async () => {
      const good = await ed25519Verify(fromHex(RFC8032_PK), fromHex(RFC8032_SIG), new Uint8Array(0));
      const flipped = fromHex(RFC8032_SIG); flipped[0] ^= 1;
      const bad = await ed25519Verify(fromHex(RFC8032_PK), flipped, new Uint8Array(0));
      return good && !bad;
    })();
  }
  return selfTest;
}

const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const refuse = (status: number, refused: string, message: string): Response => json(status, { ok: false, refused, message });

function check(route: string, body: unknown): { ok: true; body: Record<string, unknown> } | { ok: false; res: Response } {
  const schema = BODIES[route];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, res: refuse(400, 'bad_request', 'the body is a JSON object') };
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) {
    if (IDENTITY_FIELDS.has(k)) return { ok: false, res: refuse(400, 'identity_from_body_refused', 'the body may not name ' + k + ': identity, tenant and authority come from the credential (S-4)') };
    const t = schema[k];
    if (!t) return { ok: false, res: refuse(400, 'bad_request', 'unknown field ' + JSON.stringify(k).slice(0, 80)) };
    const v = b[k];
    const str = (n: number) => typeof v === 'string' && v.length <= n;
    const ok = t === 'str64' ? str(64) : t === 'str200' ? str(200) : t === 'str255' ? str(255) : t === 'str1000' ? str(1000) : t === 'str4000' ? str(4000)
      : t === 'hex64' ? typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
      : t === 'commit' ? typeof v === 'string' && /^[0-9a-f]{40}$/.test(v)
      : t === 'tree' ? typeof v === 'string' && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(v)
      : t === 'uuid' ? typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)
      : t === 'num' ? typeof v === 'number' && Number.isFinite(v)
      : t === 'obj' ? !!v && typeof v === 'object' && !Array.isArray(v) && JSON.stringify(v).length <= 8192
      : t === 'strs' ? Array.isArray(v) && v.length <= 32 && v.every((x) => typeof x === 'string' && x.length <= 64)
      : t === 'uuids' ? Array.isArray(v) && v.length <= 64 && v.every((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x))
      : t === 'b64u32' ? typeof v === 'string' && (b64u.dec(v)?.length === 32)
      : t === 'b64u64' ? typeof v === 'string' && (b64u.dec(v)?.length === 64)
      : t === 'assertion' ? typeof v === 'string' && v.length <= 2048 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v)
      : t === 'code' ? typeof v === 'string' && v.length <= 40
      : false;
    if (!ok) return { ok: false, res: refuse(400, 'bad_request', 'field ' + k + ' is not a valid ' + t) };
  }
  return { ok: true, body: b };
}

async function frontDoor(deps: Deps, route: string, params: unknown[]): Promise<Response> {
  const rows = await deps.sql(FRONT_DOORS[route], params);
  const r = (rows[0] && rows[0].r) as Record<string, unknown> | undefined;
  if (!r || typeof r !== 'object') return refuse(500, 'server_error', 'the front door returned nothing');
  const status = r.ok === true ? 200 : (typeof r.http === 'number' ? r.http : 409);
  return json(status, r);
}

async function bearerHash(req: Request): Promise<string | null> {
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(h);
  return m ? hex(await sha256(enc.encode(m[1]))) : null;
}

export function createNodeApi(deps: Deps): (req: Request, peer: Peer) => Promise<Response> {
  return async (req: Request, peer: Peer): Promise<Response> => {
    const url = new URL(req.url);
    const route = req.method + ' ' + routePath(url.pathname, deps.basePath);
    if (!(route in FRONT_DOORS)) return refuse(404, 'no_such_route', 'the Factory Node API has no ' + req.method + ' ' + url.pathname.slice(0, 80));
    if (!(await ed25519SelfTest())) return refuse(503, 'crypto_unavailable', 'Ed25519 self-test failed: this API serves nothing (fail closed)');
    try {
      if (route === 'GET /v1/time') return await frontDoor(deps, route, []);
      const len = Number(req.headers.get('content-length') || '0');
      if (len > MAX_BODY) return refuse(413, 'body_too_large', 'the body is larger than ' + MAX_BODY + ' bytes');
      const raw = new Uint8Array(await req.arrayBuffer());
      if (raw.length > MAX_BODY) return refuse(413, 'body_too_large', 'the body is larger than ' + MAX_BODY + ' bytes');
      if (!/^application\/json\b/.test(req.headers.get('content-type') || '')) return refuse(415, 'bad_request', 'the body is application/json');
      let parsed: unknown;
      try { parsed = JSON.parse(dec.decode(raw)); } catch { return refuse(400, 'bad_request', 'the body is not JSON'); }
      const c = check(route, parsed);
      if (!c.ok) return c.res;
      const body = c.body;

      if (route === 'POST /v1/session') {
        const [p64, s64] = String(body.assertion).split('.');
        const payloadBytes = b64u.dec(p64), sig = b64u.dec(s64);
        let p: Record<string, unknown> | null = null;
        try { p = payloadBytes ? JSON.parse(dec.decode(payloadBytes)) : null; } catch { p = null; }
        const pk = p && typeof p.pk === 'string' ? b64u.dec(p.pk) : null;
        if (!p || !payloadBytes || !sig || sig.length !== 64 || !pk || pk.length !== 32 || p.v !== 1
            || typeof p.iat !== 'number' || typeof p.exp !== 'number' || typeof p.jti !== 'string' || typeof p.aud !== 'string') {
          return refuse(400, 'bad_assertion', 'the assertion is {v:1, aud, iat, exp, jti, pk} signed with the node key');
        }
        if (!(await ed25519Verify(pk, sig, payloadBytes))) return refuse(401, 'bad_signature', 'the assertion signature does not verify');
        const token = b64u.enc(deps.randomBytes(32));
        const tokenHash = hex(await sha256(enc.encode(token)));
        const res = await frontDoor(deps, route, [hex(await sha256(pk)), p.jti, p.iat, p.exp, p.aud, tokenHash]);
        if (res.status !== 200) return res;
        const out = await res.json();
        return json(200, { ...out, session_token: token });
      }
      if (route === 'POST /v1/node/credential-rotate') {
        const th = await bearerHash(req);
        if (!th) return refuse(401, 'session_invalid', 'a node session token (Authorization: Bearer) is required');
        const pk = b64u.dec(String(body.new_public_key))!, proof = b64u.dec(String(body.proof))!;
        const newThumb = hex(await sha256(pk));
        const msg = enc.encode('brain-factory-rotate-v1|' + th + '|' + newThumb);
        if (!(await ed25519Verify(pk, proof, msg))) return refuse(401, 'bad_proof', 'the new key did not sign the rotate message');
        return await frontDoor(deps, route, [th, newThumb, hex(pk)]);
      }
      if (route === 'POST /v1/enroll/start' || route === 'POST /v1/enroll/complete') {
        return await enroll(deps, route, body, peer, frontDoor, refuse);
      }
      const th = await bearerHash(req);
      if (!th) return refuse(401, 'session_invalid', 'a node session token (Authorization: Bearer) is required');
      return await frontDoor(deps, route, [th, JSON.stringify(body)]);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      deps.log?.({ event: 'node_api_error', route, class: code || 'error' });
      // a SQLSTATE means the server answered and rolled the call back: nothing changed. Anything else: the outcome is unknown.
      if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return refuse(500, 'server_refused', 'the control plane refused the call (' + code + '); nothing changed');
      return refuse(503, 'plane_unavailable', 'the control plane did not answer; the outcome is unknown - retry (every operation is safe to retry)');
    }
  };
}

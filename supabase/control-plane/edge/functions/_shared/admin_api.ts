// THE FACTORY ADMIN API (WO-8; S-7, S-8, S-9, S-12, S-14). Portable like node_api.ts: Deno serves it (factory-admin-api/index.ts),
// Node 24 runs the same file in the developer suites.
//
// WHO IS ASKING, RE-DERIVED ON EVERY CALL (S-8 (a)) from the caller's OWN Brain OS token - the same two calls in production and in
// every test plane:
//   GET <Brain OS>/auth/v1/user                                    -> the auth user id (a token of another project is refused)
//   GET <Brain OS>/rest/v1/profiles?auth_user_id=eq.<id>&select=role,active   (the caller's own row, read with the caller's token)
// The live role and the user id go to exactly ONE SQL front door (factory.admin_<op>), which checks (b) factory.tenant_admins and the
// tier. Nothing here trusts a role in a body, a cookie or the plane. The body never names the actor or the tenant's admins.
//
// CODE-ISSUING ACTIONS (Add Computer, issue code, re-pair, restore, create an agent principal) draw the pairing code HERE from the
// CSPRNG, send the plane only its locator and HMAC-SHA256(FACTORY_PAIRING_PEPPER, code), and return the code to the admin ONCE.
import { codeMac, generateCode } from './pairing.ts';

export type Sql = (text: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;
export type AdminDeps = {
  sql: Sql;
  randomBytes: (n: number) => Uint8Array;
  pepper: () => Promise<{ key: CryptoKey; version: number } | null>;
  brainOs: { url: string; anonKey: string };
  fetch: typeof fetch;
  log?: (event: Record<string, unknown>) => void;
};

// op -> [front door, issues a code?, the body fields it accepts]
export const ADMIN_OPS: Record<string, { fn: string; code: boolean; fields: string[] }> = {
  'list-computers': { fn: 'admin_list_computers', code: false, fields: ['limit', 'offset', 'include_archived', 'tenant_id'] },
  'get-computer': { fn: 'admin_get_computer', code: false, fields: ['computer_id', 'tenant_id'] },
  'add-computer': { fn: 'admin_add_computer', code: true, fields: ['display_name', 'envelope', 'bind_s16a', 'ttl_seconds', 'tenant_id'] },
  'issue-code': { fn: 'admin_issue_code', code: true, fields: ['computer_id', 'principal_id', 'ttl_seconds', 'tenant_id'] },
  'revoke-code': { fn: 'admin_revoke_code', code: false, fields: ['computer_id', 'principal_id', 'tenant_id'] },
  'amend-envelope': { fn: 'admin_amend_envelope', code: false, fields: ['computer_id', 'expected_version', 'envelope', 'reason', 'tenant_id'] },
  'drain': { fn: 'admin_drain', code: false, fields: ['computer_id', 'drain', 'tenant_id'] },
  'revoke-credential': { fn: 'admin_revoke_credential', code: false, fields: ['computer_id', 'principal_id', 'tenant_id'] },
  'request-rotation': { fn: 'admin_request_rotation', code: false, fields: ['computer_id', 'principal_id', 'tenant_id'] },
  'repair': { fn: 'admin_repair', code: true, fields: ['computer_id', 'principal_id', 'ttl_seconds', 'tenant_id'] },
  'archive': { fn: 'admin_archive', code: false, fields: ['computer_id', 'tenant_id'] },
  'restore': { fn: 'admin_restore', code: true, fields: ['computer_id', 'ttl_seconds', 'tenant_id'] },
  'create-principal': { fn: 'admin_create_principal', code: true, fields: ['computer_id', 'ttl_seconds', 'tenant_id'] },
  'adopt-release': { fn: 'admin_adopt_release', code: false, fields: ['computer_id', 'release_id', 'tenant_id'] },
  'publish-release': { fn: 'admin_publish_release', code: false, fields: ['channel', 'version', 'source_sha', 'digest', 'key_id', 'signature', 'receipt_sha256', 'manifest', 'tenant_id'] },
  'revoke-release': { fn: 'admin_revoke_release', code: false, fields: ['release_id', 'reason', 'tenant_id'] },
  'revoke-key': { fn: 'admin_revoke_key', code: false, fields: ['key_id', 'reason', 'tenant_id'] },
  'list-releases': { fn: 'admin_list_releases', code: false, fields: ['tenant_id'] },
  'list-policies': { fn: 'admin_list_policies', code: false, fields: ['tenant_id'] },
  'update-policy': { fn: 'admin_update_policy', code: false, fields: ['policy_id', 'expected_version', 'changes', 'tenant_id'] },
  'list-waiting-verifications': { fn: 'admin_list_waiting_verifications', code: false, fields: ['tenant_id'] },
  'submit-work-order': { fn: 'admin_submit_work_order', code: false, fields: ['title', 'work_type', 'owned_surface', 'requires_security_role',
    'requires_capabilities', 'priority', 'weight', 'company_id', 'campaign_key', 'requires_verification', 'min_resources', 'depends_on', 'handoff', 'tenant_id'] },
  'list-work': { fn: 'admin_list_work', code: false, fields: ['tenant_id'] },
};

const MAX_BODY = 65536;
const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const refuse = (status: number, refused: string, message: string): Response => json(status, { ok: false, refused, message });
const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

// the token's issuer must be this Brain OS project (a cheap early refusal of a foreign-project token; /auth/v1/user decides)
function issuerOk(token: string, brainOsUrl: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const p = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((parts[1].length + 3) % 4)));
    return typeof p.iss === 'string' && p.iss.replace(/\/+$/, '') === brainOsUrl.replace(/\/+$/, '') + '/auth/v1';
  } catch { return false; }
}

/** S-8 (a): the caller's auth user id and LIVE role, from the caller's own token, on this call. */
export async function liveIdentity(deps: AdminDeps, token: string): Promise<{ userId: string; role: string | null } | null> {
  if (!issuerOk(token, deps.brainOs.url)) return null;
  const headers = { apikey: deps.brainOs.anonKey, authorization: 'Bearer ' + token };
  const u = await deps.fetch(deps.brainOs.url.replace(/\/+$/, '') + '/auth/v1/user', { headers });
  if (u.status !== 200) return null;
  const user = await u.json().catch(() => null);
  const id = user && typeof user.id === 'string' && /^[0-9a-f-]{36}$/.test(user.id) ? user.id : null;
  if (!id) return null;
  const p = await deps.fetch(deps.brainOs.url.replace(/\/+$/, '') + '/rest/v1/profiles?select=role,active&auth_user_id=eq.' + id, { headers });
  if (p.status !== 200) return { userId: id, role: null };
  const rows = await p.json().catch(() => []);
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  return { userId: id, role: row && row.active !== false && typeof row.role === 'string' ? row.role : null };
}

export function createAdminApi(deps: AdminDeps): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const m = /^\/v1\/admin\/([a-z-]{3,40})$/.exec(url.pathname);
    const op = m && req.method === 'POST' ? ADMIN_OPS[m[1]] : undefined;
    if (!op) return refuse(404, 'no_such_route', 'the Factory Admin API has no ' + req.method + ' ' + url.pathname.slice(0, 80));
    const auth = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.get('authorization') || '');
    if (!auth) return refuse(401, 'not_authenticated', 'a Brain OS session (Authorization: Bearer) is required');
    try {
      const raw = new Uint8Array(await req.arrayBuffer());
      if (raw.length > MAX_BODY) return refuse(413, 'body_too_large', 'the body is larger than ' + MAX_BODY + ' bytes');
      let body: Record<string, unknown> = {};
      if (raw.length) {
        try { body = JSON.parse(new TextDecoder().decode(raw)); } catch { return refuse(400, 'bad_request', 'the body is not JSON'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return refuse(400, 'bad_request', 'the body is a JSON object');
      }
      for (const k of Object.keys(body)) if (!op.fields.includes(k)) return refuse(400, 'bad_request', 'unknown field ' + JSON.stringify(k).slice(0, 80));
      const who = await liveIdentity(deps, auth[1]);
      if (!who) return refuse(401, 'not_authenticated', 'the Brain OS session is not valid for this Factory');
      let code: { display: string } | null = null;
      if (op.code) {
        const pepper = await deps.pepper();
        if (!pepper) return refuse(503, 'pepper_unavailable', 'pairing is unavailable: the pairing pepper is not configured');
        const g = generateCode(deps.randomBytes);
        body = { ...body, locator: g.locator, code_mac: hex(await codeMac(pepper.key, g.normalized)), pepper_version: pepper.version };
        code = { display: g.display };
      }
      const rows = await deps.sql('select factory.' + op.fn + '($1::uuid, $2, $3::text::jsonb) as r', [who.userId, who.role, JSON.stringify(body)]);
      const r = (rows[0] && rows[0].r) as Record<string, unknown> | undefined;
      if (!r || typeof r !== 'object') return refuse(500, 'server_error', 'the front door returned nothing');
      if (r.ok !== true) return json(typeof r.http === 'number' ? r.http : 409, r);
      // the code is shown ONCE, to the admin who issued it; the plane never had it
      return json(200, code ? { ...r, pairing_code: code.display } : r);
    } catch (e) {
      const c = (e as { code?: string })?.code;
      deps.log?.({ event: 'admin_api_error', op: m && m[1], class: c || 'error' });
      if (typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c)) return refuse(500, 'server_refused', 'the control plane refused the call (' + c + '); nothing changed');
      return refuse(503, 'unavailable', 'the control plane or Brain OS did not answer; the outcome is unknown - reload before retrying');
    }
  };
}

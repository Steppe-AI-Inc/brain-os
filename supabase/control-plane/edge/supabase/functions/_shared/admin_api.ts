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
//
// PUBLISHING A PRODUCTION RELEASE (founder decision 2026-10-03) needs a FRESH PASSWORD ENTRY of the caller's own account, through
// either action that publishes one (authorize-update, publish-release). The password never comes here: Brain OS -> Factory ->
// Update signs the account in again and calls with that session's token. This file reads from that token - after Brain OS verified
// it on this call - when its session entered the password and which session it is (passwordEntry), and adds the two facts as
// `reauth` AFTER the whitelist of body fields, as the code-issuing actions add theirs: a caller cannot supply them. The front door
// decides (founder-only, at most two minutes old, one release per entry). authorize-update signs with the plane's signer and
// publishes in one transaction; the signed manifest it answers is then placed where the installer looks for it (storeManifest).
//
// ERRORS. An error is never turned into an answer about the caller: Brain OS refusing the token (401 / 403) is "not authenticated";
// any other answer from Brain OS - an error status, a body that is not the JSON it documents - is Brain OS not answering, and fails the
// call as an error (503 unavailable), never as "not authenticated" or "not authorized". The only catches are the parse of the caller's
// own bytes (its token's payload, its JSON body) and the one request boundary at the end of createAdminApi, which answers every other
// error as an error, naming only its class, and changes nothing.
import { serverSqlState } from './db.ts';
import { codeMac, generateCode } from './pairing.ts';
import { routePath } from './route.ts';

export type Sql = (text: string, params: unknown[]) => Promise<Array<Record<string, unknown>>>;
export type AdminDeps = {
  sql: Sql;
  randomBytes: (n: number) => Uint8Array;
  pepper: () => Promise<{ key: CryptoKey; version: number } | null>;
  brainOs: { url: string; anonKey: string };
  fetch: typeof fetch;
  log?: (event: Record<string, unknown>) => void;
  basePath?: string;   // the function's own path prefix on the Edge platform ('/factory-admin-api'; route.ts)
  // place a published release's signed manifest in release storage (<version>/BrainFactorySetup.manifest.json); answers whether it
  // is there now, and never throws. Absent (a harness without storage): nothing is placed, and the answer says so.
  storeManifest?: (version: string, manifest: Record<string, unknown>) => Promise<boolean>;
};

// op -> [front door, issues a code?, the body fields it accepts; reauth: the front door is handed the token's password entry;
// signs: it answers a signed manifest, which is then placed in release storage]
export const ADMIN_OPS: Record<string, { fn: string; code: boolean; fields: string[]; reauth?: boolean; signs?: boolean }> = {
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
  'publish-release': { fn: 'admin_publish_release', code: false, reauth: true, fields: ['channel', 'version', 'source_sha', 'digest', 'key_id', 'signature', 'receipt_sha256', 'manifest', 'tenant_id'] },
  'authorize-update': { fn: 'admin_authorize_update', code: false, reauth: true, signs: true, fields: ['channel', 'version', 'source_sha', 'digest', 'receipt_sha256', 'tenant_id'] },
  'revoke-release': { fn: 'admin_revoke_release', code: false, fields: ['release_id', 'reason', 'tenant_id'] },
  'revoke-key': { fn: 'admin_revoke_key', code: false, fields: ['key_id', 'reason', 'tenant_id'] },
  'list-releases': { fn: 'admin_list_releases', code: false, fields: ['tenant_id'] },
  // list-policies answers the policy rows and every RECORDED version. The migration writes no version row (contract §1): a version row
  // is recorded when a change replaces that version, so a policy never changed has none yet, and the recorded_at of a seeded policy's
  // version 1 is the time of its replacement, not the time it took effect (it took effect with the migration).
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
/** Brain OS did not give the answer it documents: the call fails as an error (the request boundary answers 503 unavailable) */
const brainOsUnavailable = (what: string): Error => Object.assign(new Error('Brain OS did not answer as documented: ' + what), { name: 'BrainOsUnavailable' });

// the token's issuer must be this Brain OS project (a cheap early refusal of a foreign-project token; /auth/v1/user decides)
function issuerOk(token: string, brainOsUrl: string): boolean {
  const parts = token.split('.');
  // the caller's token: three base64url parts (the Bearer pattern admits no other character); a payload length base64 cannot have is
  // not a token
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || parts[1].length % 4 === 1) return false;
  let p: { iss?: unknown } | null;
  try { p = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((parts[1].length + 3) % 4))); }
  catch (e) { if (e instanceof SyntaxError) return false; throw e; }   // a payload that is not JSON is not a token; nothing else is caught
  return !!p && typeof p.iss === 'string' && p.iss.replace(/\/+$/, '') === brainOsUrl.replace(/\/+$/, '') + '/auth/v1';
}

/** S-8 (a): the caller's auth user id and LIVE role, from the caller's own token, on this call. */
export async function liveIdentity(deps: AdminDeps, token: string): Promise<{ userId: string; role: string | null } | null> {
  if (!issuerOk(token, deps.brainOs.url)) return null;
  const headers = { apikey: deps.brainOs.anonKey, authorization: 'Bearer ' + token };
  const u = await deps.fetch(deps.brainOs.url.replace(/\/+$/, '') + '/auth/v1/user', { headers });
  if (u.status === 401 || u.status === 403) return null;   // Brain OS refused this token
  if (u.status !== 200) throw brainOsUnavailable('/auth/v1/user ' + u.status);
  const user = await u.json();   // not JSON: the error goes to the request boundary
  const id = user && typeof user.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(user.id) ? user.id : null;
  if (!id) throw brainOsUnavailable('/auth/v1/user without a user id');
  const p = await deps.fetch(deps.brainOs.url.replace(/\/+$/, '') + '/rest/v1/profiles?select=role,active&auth_user_id=eq.' + id, { headers });
  if (p.status !== 200) throw brainOsUnavailable('/rest/v1/profiles ' + p.status);
  const rows = await p.json();
  if (!Array.isArray(rows)) throw brainOsUnavailable('/rest/v1/profiles not a list');
  const row = rows.length === 1 ? rows[0] : null;   // no profile row: no live role (the front door refuses, audited)
  return { userId: id, role: row && row.active !== false && typeof row.role === 'string' ? row.role : null };
}

/** WHEN THE CALLER'S SESSION ENTERED ITS PASSWORD, and which session it is, from the token's own claims (Supabase Auth: `amr` is a
 * list of { method, timestamp }, a password sign-in is the method "password", and a refreshed token keeps the entry's time;
 * `session_id` names the session). Read only after liveIdentity answered for this same token: Brain OS verified it on this call, so
 * its claims are Brain OS's, and its payload parsed there (issuerOk). Null when the token states no password entry or no session. */
export function passwordEntry(token: string): { password_at: number; session_id: string } | null {
  const part = token.split('.')[1];
  const p = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4))) as { amr?: unknown; session_id?: unknown };
  if (!Array.isArray(p.amr) || typeof p.session_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.session_id)) return null;
  let at: number | null = null;
  for (const e of p.amr as Array<{ method?: unknown; timestamp?: unknown } | null>) {
    if (e && e.method === 'password' && typeof e.timestamp === 'number' && Number.isSafeInteger(e.timestamp) && (at === null || e.timestamp > at)) at = e.timestamp;
  }
  return at === null ? null : { password_at: at, session_id: p.session_id };
}

export function createAdminApi(deps: AdminDeps): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const m = /^\/v1\/admin\/([a-z-]{3,40})$/.exec(routePath(url.pathname, deps.basePath));
    // an OWN entry of the op table only: a name inherited from Object.prototype ('constructor') is no op (S-7, AC-7)
    const op = m && req.method === 'POST' && Object.hasOwn(ADMIN_OPS, m[1]) ? ADMIN_OPS[m[1]] : undefined;
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
      let code: { display: string; locator: string } | null = null;
      if (op.code) {
        const pepper = await deps.pepper();
        if (!pepper) return refuse(503, 'pepper_unavailable', 'pairing is unavailable: the pairing pepper is not configured');
        const g = generateCode(deps.randomBytes);
        body = { ...body, locator: g.locator, code_mac: hex(await codeMac(pepper.key, g.normalized)), pepper_version: pepper.version };
        code = { display: g.display, locator: g.locator };
      }
      // a fresh password entry is a fact about the caller's token, never a body field (the whitelist above refused a `reauth`)
      if (op.reauth) body = { ...body, reauth: passwordEntry(auth[1]) };
      const rows = await deps.sql('select factory.' + op.fn + '($1::uuid, $2, $3::text::jsonb) as r', [who.userId, who.role, JSON.stringify(body)]);
      const r = (rows[0] && rows[0].r) as Record<string, unknown> | undefined;
      if (!r || typeof r !== 'object') return refuse(500, 'server_error', 'the front door returned nothing');
      if (r.ok !== true) return json(typeof r.http === 'number' ? r.http : 409, r);
      if (op.signs) {
        // the release is published (r is the record). Its signed manifest goes where the installer looks for it; when that did not
        // happen the answer says so, and authorizing the same release again places it ("already": nothing is signed twice)
        const signed = r.manifest as Record<string, unknown> | undefined;
        const served = !!signed && typeof signed.version === 'string' && !!deps.storeManifest && await deps.storeManifest(signed.version, signed);
        return json(200, { ...r, manifest_served: served });
      }
      // the code is shown ONCE, to the admin who issued it (the plane never had it). The SQL answer must prove it recorded the code
      // drawn here - a new code id, an expiry, and the same locator - before the code is added. An "already" answer, or one lacking
      // any of those, recorded no code, and the receipt carries none (contract §9; S-12).
      const stored = code !== null && r.already !== true && typeof r.code_id === 'string' && /^[0-9a-f-]{36}$/.test(r.code_id) && typeof r.expires_at === 'string' && r.locator === code.locator;
      return json(200, code && stored ? { ...r, pairing_code: code.display } : r);
    } catch (e) {
      // THE REQUEST BOUNDARY: every error that reaches here is answered AS an error - its class named, nothing decided, nothing changed
      const state = serverSqlState(e);
      const cls = state ?? ((e as { name?: string })?.name || 'error').slice(0, 40);
      deps.log?.({ event: 'admin_api_error', op: m && m[1], class: cls });
      // only a SQLSTATE the SERVER sent says the call was answered and rolled back (db.ts serverSqlState); anything else: outcome unknown
      if (state) return refuse(500, 'server_refused', 'the control plane refused the call (' + state + '); nothing changed');
      return refuse(503, 'unavailable', 'the control plane or Brain OS did not answer (' + cls + '); the outcome is unknown - reload before retrying');
    }
  };
}

// A DEVELOPER STUB of the two Brain OS endpoints the Factory Admin API calls - GET /auth/v1/user and GET /rest/v1/profiles?auth_user_id=eq.
// - with the production semantics that matter to S-8: a token names one user; a user reads only its OWN profile row (RLS); and, as in
// production today (side finding S1: profiles_update_self_or_admin has no WITH CHECK), a user can PATCH its own profiles.role.
//
// It is the implementer's developer instrument only. VERIFICATION_SPEC §3 (2) requires the verifier's AC-7 / R-1 / R-2 to run against
// a disposable Brain OS auth stack started by the Supabase CLI with supabase/migrations applied at 55a15917; "a stubbed role check
// never counts" for acceptance. This stub never stands in for that.
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';

const b64u = (s) => Buffer.from(s).toString('base64url');

export async function startBrainOsStub() {
  const anonKey = 'anon-' + randomBytes(12).toString('hex');
  const users = new Map();     // token -> user id
  const profiles = new Map();  // user id -> { role, active }
  let url = '';
  const server = createServer(async (req, res) => {
    const send = (s, b) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    if (req.headers.apikey !== anonKey) return send(401, { message: 'no api key' });
    const tok = (/^Bearer (.+)$/.exec(req.headers.authorization || '') || [])[1];
    const uid = tok && users.get(tok);
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/auth/v1/user' && req.method === 'GET') return uid ? send(200, { id: uid, aud: 'authenticated' }) : send(401, { message: 'invalid JWT' });
    if (u.pathname === '/rest/v1/profiles') {
      const want = (/^eq\.(.+)$/.exec(u.searchParams.get('auth_user_id') || '') || [])[1];
      if (req.method === 'GET') {
        // RLS: a caller sees its own row (an admin would see more; the Admin API only ever asks for the caller's own)
        if (!uid || want !== uid) return send(200, []);
        const p = profiles.get(uid);
        return send(200, p ? [{ role: p.role, active: p.active }] : []);
      }
      if (req.method === 'PATCH') {
        // S1 as in production: an update of one's own row is allowed, with no check on the new role
        if (!uid || want !== uid) return send(200, []);
        const chunks = []; for await (const c of req) chunks.push(c);
        const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        const p = profiles.get(uid); if (p && typeof body.role === 'string') p.role = body.role;
        return send(200, [{ role: p && p.role }]);
      }
    }
    return send(404, { message: 'not found' });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = 'http://127.0.0.1:' + server.address().port;
  const issue = (userId, iss = url + '/auth/v1') => {
    const t = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + b64u(JSON.stringify({ iss, sub: userId, role: 'authenticated' })) + '.' + randomBytes(16).toString('base64url');
    users.set(t, userId);
    return t;
  };
  return {
    url, anonKey,
    /** a persona: a user with a profile role; returns { userId, token } */
    persona(role, { active = true } = {}) { const id = randomUUID(); profiles.set(id, { role, active }); return { userId: id, token: issue(id), role }; },
    /** a token of ANOTHER Brain OS project (a different issuer) for an existing user */
    foreignToken(userId) { return issue(userId, 'https://otherprojectxxxxxxxxxx.supabase.co/auth/v1'); },
    /** what S1 allows today: the user updates its own profiles.role */
    async selfUpdateRole(p, role) {
      const r = await fetch(url + '/rest/v1/profiles?auth_user_id=eq.' + p.userId, { method: 'PATCH', headers: { apikey: anonKey, authorization: 'Bearer ' + p.token, 'content-type': 'application/json' }, body: JSON.stringify({ role }) });
      return r.json();
    },
    setRole(userId, role) { const p = profiles.get(userId); if (p) p.role = role; },
    async stop() { await new Promise((r) => server.close(r)); },
  };
}

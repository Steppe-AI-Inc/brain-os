// factory-admin-api: the Factory Admin API on the dedicated Factory project's Edge runtime (npvhuoozkbexddnvkqsj). Called by Brain OS ->
// Factory -> Computers with the signed-in user's OWN Brain OS token. Deploying it is a founder action (ALLOW_FUNCTIONS_DEPLOY=1?).
// Lives in the control-plane Supabase CLI project (supabase/control-plane/edge/supabase/), never supabase/functions/ (that directory's workflow deploys to Brain OS production).
//
// Configuration (names only; the founder sets the values):
//   FACTORY_ADMIN_DB_URL            the factory_admin_api login (EXECUTE on the admin front doors only)
//   FACTORY_DB_CA_PEM               the Factory database server CA (PEM; public): TLS verify-full against it (S-10; _shared/db.ts)
//   FACTORY_PAIRING_PEPPER          base64, >= 32 random bytes (the same secret the Node API uses)
//   FACTORY_PAIRING_PEPPER_VERSION  an integer, default 1
//   BRAIN_OS_URL                    https://<brain os project>.supabase.co - where the caller's token is checked
//   BRAIN_OS_ANON_KEY               that project's public anon key (a public value; it grants nothing without the user's own token)
// The production-ref refusal applies to the Factory database URL; BRAIN_OS_URL legitimately names Brain OS.
import postgres from 'npm:postgres@3.4.9';
import { createAdminApi } from '../_shared/admin_api.ts';
import { dbOptions, dbRefusal } from '../_shared/db.ts';
import { importPepper } from '../_shared/pairing.ts';

const dbUrl = Deno.env.get('FACTORY_ADMIN_DB_URL') || '';
const caPem = Deno.env.get('FACTORY_DB_CA_PEM') || '';
const brainOsUrl = Deno.env.get('BRAIN_OS_URL') || '';
const anonKey = Deno.env.get('BRAIN_OS_ANON_KEY') || '';
const refusal = dbRefusal(dbUrl, caPem) || (!brainOsUrl || !anonKey ? 'BRAIN_OS_URL or BRAIN_OS_ANON_KEY is unset' : null);
const refused = refusal !== null;
const db = refused ? null : postgres(dbUrl, dbOptions(caPem));
const pepperKey = importPepper(Deno.env.get('FACTORY_PAIRING_PEPPER'));
const pepperVersion = Number(Deno.env.get('FACTORY_PAIRING_PEPPER_VERSION') || '1') || 1;

const handler = createAdminApi({
  sql: async (text, params) => {
    if (!db) throw new Error('no database');
    return await db.unsafe(text, params as never[]) as unknown as Array<Record<string, unknown>>;
  },
  randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
  pepper: async () => { const key = await pepperKey; return key ? { key, version: pepperVersion } : null; },
  brainOs: { url: brainOsUrl, anonKey },
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
  log: (e) => console.log(JSON.stringify(e)),
  basePath: '/factory-admin-api',  // the platform delivers /factory-admin-api/v1/admin/... (route.ts)
});

Deno.serve((req: Request) => {
  if (refused) {
    return new Response(JSON.stringify({ ok: false, refused: 'misconfigured', message: 'the Admin API is not configured: ' + refusal }),
      { status: 503, headers: { 'content-type': 'application/json' } });
  }
  return handler(req);
});

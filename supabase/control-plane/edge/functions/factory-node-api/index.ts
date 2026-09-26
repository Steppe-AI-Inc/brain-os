// factory-node-api: the Factory Node API on the dedicated Factory project's Edge runtime (npvhuoozkbexddnvkqsj; founder decision
// A.2). Deploying it is a founder action, after independent verification of the exact SHA (ALLOW_FUNCTIONS_DEPLOY=1?).
//
// It lives under supabase/control-plane/edge/, never supabase/functions/: the repository's master-push workflow deploys every
// function under supabase/functions/ to the Brain OS PRODUCTION project, and this one must never go there.
//
// Configuration (secret NAMES only; the values are set by the founder in the project's secret store):
//   FACTORY_NODE_DB_URL             the factory_node_api login (EXECUTE on the node front doors only; no table privilege), TLS
//   FACTORY_PAIRING_PEPPER          base64, >= 32 random bytes: the pairing-code HMAC key (S-6); never in a table or in source
//   FACTORY_PAIRING_PEPPER_VERSION  an integer, default 1
// The function refuses a database URL that names the Brain OS production project (S-10: the production-ref refusal).
import postgres from 'npm:postgres@3.4.9';
import { createNodeApi } from '../_shared/node_api.ts';
import { importPepper } from '../_shared/pairing.ts';

const PRODUCTION_REF = 'pvphxgrtdfrudejjhzjk';
const dbUrl = Deno.env.get('FACTORY_NODE_DB_URL') || '';
const refused = !dbUrl || dbUrl.toLowerCase().includes(PRODUCTION_REF);
const db = refused ? null : postgres(dbUrl, { prepare: false, max: 4, idle_timeout: 20, connect_timeout: 10, ssl: 'require' });
const pepperKey = importPepper(Deno.env.get('FACTORY_PAIRING_PEPPER'));
const pepperVersion = Number(Deno.env.get('FACTORY_PAIRING_PEPPER_VERSION') || '1') || 1;

const handler = createNodeApi({
  sql: async (text, params) => {
    if (!db) throw new Error('no database');
    return await db.unsafe(text, params as never[]) as unknown as Array<Record<string, unknown>>;
  },
  randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
  pepper: async () => { const key = await pepperKey; return key ? { key, version: pepperVersion } : null; },
  log: (e) => console.log(JSON.stringify(e)),
  basePath: '/factory-node-api',   // the platform delivers /factory-node-api/v1/... (route.ts)
});

Deno.serve((req: Request, info: Deno.ServeHandlerInfo) => {
  if (refused) {
    return new Response(JSON.stringify({ ok: false, refused: 'misconfigured', message: 'FACTORY_NODE_DB_URL is unset or names the production project' }),
      { status: 503, headers: { 'content-type': 'application/json' } });
  }
  // THE PEER as the platform sees it: the connection's remote address, never a client-supplied header (S-6). What Supabase's Edge
  // runtime reports here is recorded as UNMEASURED until the founder's deploy: if it is the platform gateway's address for every
  // client, the per-IP limit degrades to one plane-wide limit - stricter, never looser.
  const addr = info.remoteAddr as Deno.NetAddr;
  return handler(req, { address: addr && addr.hostname ? addr.hostname : '' });
});

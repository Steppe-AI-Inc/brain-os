// factory-node-api: the Factory Node API on the dedicated Factory project's Edge runtime (npvhuoozkbexddnvkqsj; founder decision
// A.2). Deploying it is a founder action, after independent verification of the exact SHA (ALLOW_FUNCTIONS_DEPLOY=1?).
//
// It lives in the control-plane Supabase CLI project (supabase/control-plane/edge/supabase/, config.toml), never supabase/functions/: the repository's master-push workflow deploys every
// function under supabase/functions/ to the Brain OS PRODUCTION project, and this one must never go there.
//
// Configuration (secret NAMES only; the values are set by the founder in the project's secret store):
//   FACTORY_NODE_DB_URL             the factory_node_api login (EXECUTE on the node front doors only; no table privilege)
//   FACTORY_DB_CA_PEM               the Factory database server CA (PEM; public): TLS verify-full against it (S-10; _shared/db.ts)
//   FACTORY_PAIRING_PEPPER          base64, >= 32 random bytes: the pairing-code HMAC key (S-6); never in a table or in source
//   FACTORY_PAIRING_PEPPER_VERSION  an integer, default 1
// The function refuses a database URL that names the Brain OS production project, and runs nothing without the CA (S-10).
import postgres from 'npm:postgres@3.4.9';
import { createNodeApi } from '../_shared/node_api.ts';
import { dbOptions, dbRefusal } from '../_shared/db.ts';
import { importPepper } from '../_shared/pairing.ts';

const dbUrl = Deno.env.get('FACTORY_NODE_DB_URL') || '';
const caPem = Deno.env.get('FACTORY_DB_CA_PEM') || '';
const refusal = dbRefusal(dbUrl, caPem);
const refused = refusal !== null;
const db = refused ? null : postgres(dbUrl, dbOptions(caPem));
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
    return new Response(JSON.stringify({ ok: false, refused: 'misconfigured', message: 'the Node API is not configured: ' + refusal }),
      { status: 503, headers: { 'content-type': 'application/json' } });
  }
  // THE PEER as the platform sees it: the connection's remote address, never a client-supplied header (S-6). What Supabase's Edge
  // runtime reports here is recorded as UNMEASURED until the founder's deploy: if it is the platform gateway's address for every
  // client, the per-IP limit degrades to one plane-wide limit - stricter, never looser.
  const addr = info.remoteAddr as Deno.NetAddr;
  return handler(req, { address: addr && addr.hostname ? addr.hostname : '' });
});

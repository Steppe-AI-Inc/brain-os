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
// The pepper's version is PEPPER_VERSION in _shared/pairing.ts, the constant the Admin API issues codes with; it is not configured.
// The function refuses a database URL that names the Brain OS production project, and runs nothing without the CA (S-10).
import postgres from 'npm:postgres@3.4.9';
import { createNodeApi } from '../_shared/node_api.ts';
import { dbOptions, dbRefusal } from '../_shared/db.ts';
import { importPepper, PEPPER_VERSION } from '../_shared/pairing.ts';
import { withPeer } from '../_shared/peer.ts';

const dbUrl = Deno.env.get('FACTORY_NODE_DB_URL') || '';
const caPem = Deno.env.get('FACTORY_DB_CA_PEM') || '';
const refusal = dbRefusal(dbUrl, caPem);
const refused = refusal !== null;
const db = refused ? null : postgres(dbOptions(dbUrl, caPem));
const pepperKey = importPepper(Deno.env.get('FACTORY_PAIRING_PEPPER'));

const handler = createNodeApi({
  sql: async (text, params) => {
    if (!db) throw new Error('no database');
    return await db.unsafe(text, params as never[]) as unknown as Array<Record<string, unknown>>;
  },
  randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
  pepper: async () => { const key = await pepperKey; return key ? { key, version: PEPPER_VERSION } : null; },
  log: (e) => console.log(JSON.stringify(e)),
  basePath: '/factory-node-api',   // the platform delivers /factory-node-api/v1/... (route.ts)
});

// THE PEER as the platform sees it: the connection's remote address the runtime hands the handler (info.remoteAddr), never a
// client-supplied header (S-6), derived in ONE place (_shared/peer.ts). An address the runtime does not give - no info, a transport
// without a hostname, a value that is not an IP address - is no usable peer: the enrollment routes then record the request and refuse it
// by name (peer_unavailable, 503) and every other route is served. What the HOSTED runtime reports behind the platform's gateway is
// measured only on a deployed function (founder action; change request CR-015 holds the S-6 question that measurement may raise).
const serveNode = withPeer(handler);

Deno.serve((req: Request, info: Deno.ServeHandlerInfo) => {
  if (refused) {
    return new Response(JSON.stringify({ ok: false, refused: 'misconfigured', message: 'the Node API is not configured: ' + refusal }),
      { status: 503, headers: { 'content-type': 'application/json' } });
  }
  return serveNode(req, info);
});

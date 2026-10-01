// ARTIFACT RELAY V0 - the deployed entry. The logic is relay.ts; this file hands it what the platform injects and the registry the
// installer wrote. Deployed with JWT verification OFF: a node authenticates with its own registered key (relay.ts), not with a
// project key.
import { makeHandler, platformKeys } from "./relay.ts";
import { REGISTRY } from "./registry.ts";

Deno.serve(makeHandler({ supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "", serviceKeys: platformKeys((name) => Deno.env.get(name)), registry: REGISTRY }, fetch));

// Test only: serves the relay under Deno on a chosen loopback port, against the test's stand-in for the project's REST endpoints.
// The deployed entry is supabase/functions/factory-artifact-relay/index.ts; both hand the same relay.ts the same injected values.
// The registry, which the installer writes into registry.ts for a deployment, is handed over as a variable here.
import { makeHandler, platformKeys } from "../supabase/functions/factory-artifact-relay/relay.ts";

Deno.serve(
  { port: Number(Deno.env.get("RELAY_TEST_PORT")), hostname: "127.0.0.1", onListen: () => console.log("relay listening") },
  makeHandler({
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serviceKeys: platformKeys((name) => Deno.env.get(name)),
    registry: JSON.parse(Deno.env.get("RELAY_TEST_REGISTRY") ?? "[]"),
  }, fetch),
);

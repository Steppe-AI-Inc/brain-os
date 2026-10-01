// ARTIFACT RELAY V0 - the boundary (see ARTIFACT_RELAY_V0.md).
//
// The gateway's JWT check is OFF for this function, because a node holds no project key. So this file is the whole of the
// authentication, and it is built in two parts that cannot be mixed up:
//
//   authenticate()   is given the request, the registry and the time, and NOTHING ELSE. It has no way to reach the project: it
//                    is not handed the address, a key or a fetch. Until it has accepted a request, nothing privileged can run.
//   relay()          runs only for a request authenticate() accepted. It is the only code that holds the project's key.
//
// There is no other way in: no bearer token, no API key and no other header is ever read.
//
// It imports nothing. It talks to the project's own REST endpoints with fetch, so the same file runs under Deno (deployed) and
// under Node (the tests).

export const BUCKET = "factory-private-artifacts";
export const MAX_FILE_BYTES = 1048576;
/** a request body: the base64 of the largest file plus its JSON envelope */
export const MAX_BODY_BYTES = 1500000;
export const SIGNING_CONTEXT = "factory-artifact-relay/v0";
/** the one route: as the hosted runtime shows it to a function, and as the gateway is addressed */
export const ROUTES = ["/factory-artifact-relay", "/functions/v1/factory-artifact-relay"];
const WINDOW_MS = 300000;

export type RegisteredNode = { node_id: string; relay_role: "sender" | "verifier"; public_key: string };
/** the project's address and key(s) as the platform injects them, and the registry the installer wrote; nothing a node sent */
export type RelayEnv = { supabaseUrl: string; serviceKeys: string[]; registry: RegisteredNode[] };
type Json = Record<string, unknown>;
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type Ctx = { url: string; keys: string[]; chosen: number; fetch: Fetch };
type Refused = { ok: false; status: number; refused: string; detail?: string };
type Authenticated = {
  ok: true;
  node: RegisteredNode;
  action: string;
  ts: string;
  nonce: string;
  signature: string;
  bodySha256: string;
  bodyText: string;
  payload: Json;
  content: Uint8Array | null;
};

/** every action there is, and which registered role may ask for it */
export const ACTIONS = new Map<string, "sender" | "verifier" | "either">([
  ["selfcheck", "either"],
  ["status", "either"],
  ["sweep", "either"],
  ["create", "sender"],
  ["upload", "sender"],
  ["inbox", "verifier"],
  ["download", "verifier"],
  ["receipt", "verifier"],
]);

const NODE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,99}$/;
const TS = /^[0-9]{13}$/;
const NONCE = /^[0-9a-f]{32}$/;
const SIG = /^[A-Za-z0-9_-]{86}$/;
const KEY = /^[A-Za-z0-9_-]{43}$/;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KINDS = ["archive", "sha256", "signature"];
const RECEIPT_STATES = ["DELIVERED", "VERIFIED", "CONSUMED", "REFUSED"];

const utf8 = new TextEncoder();

/** a failure of this function's own making: its message is safe to log (never a credential, never content) */
class RelayFault extends Error {}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

function fromBase64Url(text: string): Uint8Array {
  return fromBase64(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let raw = "";
  for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(raw);
}

function reply(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

const refuse = (status: number, refused: string, detail?: string) => reply(status, detail ? { ok: false, refused, detail } : { ok: false, refused });
const no = (status: number, refused: string, detail?: string): Refused => ({ ok: false, status, refused, detail });

/** the exact bytes a node signs: the context, the method, the action, the node, the time, the nonce and the sha256 of the body */
export function signedMessage(action: string, nodeId: string, ts: string, nonce: string, bodySha256: string): Uint8Array {
  return utf8.encode([SIGNING_CONTEXT, "POST", action, nodeId, ts, nonce, bodySha256].join("\n"));
}

async function verifyEd25519(publicKey: string, signature: string, message: Uint8Array): Promise<boolean> {
  if (!KEY.test(publicKey)) return false;
  const key = await crypto.subtle.importKey("raw", fromBase64Url(publicKey) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
  return await crypto.subtle.verify({ name: "Ed25519" }, key, fromBase64Url(signature) as BufferSource, message as BufferSource);
}

// ====================================================================================================================================
// AUTHENTICATION. Given the request, the registry and the time, and nothing else: it cannot reach the project.
// It accepts a request only when ALL of these hold, checked in this order:
//   1 the method is POST                      5 the node's registered key signed exactly: the method, the action, the node, the
//   2 the route is the relay's one route        time, the nonce and the sha256 of the body that was received
//   3 the five headers are well formed        6 the time is within five minutes of now
//   4 the node is in the registry             7 the body is one action envelope, and its action is the signed one
//                                             8 the action exists, and the node's registered role may ask for it
//                                             9 what the action needs is there and well formed
// The nonce is refused when seen before, and a node or key the founder revoked is refused, by the database entry: the first thing
// relay() does, in one call that does nothing else when it refuses.
// ====================================================================================================================================
export async function authenticate(req: Request, registry: RegisteredNode[], now: number): Promise<Authenticated | Refused> {
  if (req.method !== "POST") return no(405, "method_not_allowed");
  const url = new URL(req.url);
  if (!ROUTES.includes(url.pathname) || url.search !== "") return no(404, "not_found");

  const nodeId = req.headers.get("x-relay-node") ?? "";
  const action = req.headers.get("x-relay-action") ?? "";
  const ts = req.headers.get("x-relay-ts") ?? "";
  const nonce = req.headers.get("x-relay-nonce") ?? "";
  const signature = req.headers.get("x-relay-sig") ?? "";
  if (!NODE_ID.test(nodeId) || !TS.test(ts) || !NONCE.test(nonce) || !SIG.test(signature) || !/^[a-z]{1,20}$/.test(action)) return no(401, "not_authenticated");
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) return no(413, "too_large");
  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length > MAX_BODY_BYTES) return no(413, "too_large");

  const node = registry.find((n) => n.node_id === nodeId);
  if (!node) return no(401, "not_authenticated");
  const bodySha256 = await sha256Hex(body);
  let signed = false;
  try {
    signed = await verifyEd25519(node.public_key, signature, signedMessage(action, nodeId, ts, nonce, bodySha256));
  } catch (_e) {
    signed = false;
  }
  if (!signed) return no(401, "not_authenticated");
  if (Math.abs(now - Number(ts)) > WINDOW_MS) return no(401, "not_authenticated", "clock");

  // from here on the caller is a registered node that signed this exact request: a refusal may say what is wrong with it
  let bodyText: string;
  let parsed: unknown;
  try {
    bodyText = new TextDecoder("utf-8", { fatal: true }).decode(body);
    parsed = JSON.parse(bodyText);
  } catch (_e) {
    return no(400, "bad_request");
  }
  const envelope = parsed as Json;
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope) || envelope.op !== action) return no(400, "bad_request");
  const given = envelope.payload ?? {};
  if (given === null || typeof given !== "object" || Array.isArray(given)) return no(400, "bad_request");

  const allowed = ACTIONS.get(action);
  if (allowed === undefined) return no(400, "bad_request", "unknown action");
  if (allowed !== "either" && allowed !== node.relay_role) return no(403, allowed === "sender" ? "not_the_sender" : "not_the_recipient");

  const { content_b64: contentB64, ...payload } = given as Json;
  const artifact = ["upload", "download", "receipt", "status"].includes(action);
  if (artifact && (typeof payload.artifact_id !== "string" || !UUID.test(payload.artifact_id))) return no(400, "bad_request", "artifact_id");
  if ((action === "upload" || action === "download") && (typeof payload.kind !== "string" || !KINDS.includes(payload.kind))) return no(400, "bad_request", "kind");
  if (action === "receipt" && (typeof payload.state !== "string" || !RECEIPT_STATES.includes(payload.state))) return no(400, "bad_request", "state");
  if (action === "create" && (typeof payload.candidate_sha !== "string" || !/^[0-9a-f]{40}$/.test(payload.candidate_sha) || !Array.isArray(payload.files))) return no(400, "bad_request", "create");
  let content: Uint8Array | null = null;
  if (action === "upload") {
    if (typeof contentB64 !== "string" || contentB64.length === 0 || contentB64.length % 4 !== 0 || !B64.test(contentB64)) return no(400, "bad_request", "content");
    content = fromBase64(contentB64);
    if (content.length === 0 || content.length > MAX_FILE_BYTES) return no(413, "too_large");
  }
  return { ok: true, node, action, ts, nonce, signature, bodySha256, bodyText, payload, content };
}

// ====================================================================================================================================
// THE RELAY. Everything below runs only for a request authenticate() accepted.
// ====================================================================================================================================

/**
 * The project's secret key(s) from the variables the platform injects into every function: the legacy service_role key, and the
 * newer dictionary of secret keys. The relay adds no secret of its own. Whichever key the project's API accepts is used.
 */
export function platformKeys(get: (name: string) => string | undefined): string[] {
  const keys: string[] = [];
  const legacy = get("SUPABASE_SERVICE_ROLE_KEY");
  if (typeof legacy === "string" && legacy.length >= 20) keys.push(legacy);
  try {
    const dict = JSON.parse(get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (dict !== null && typeof dict === "object") {
      for (const name of ["default", ...Object.keys(dict)]) {
        const k = (dict as Json)[name];
        if (typeof k === "string" && k.length >= 20 && !keys.includes(k)) keys.push(k);
      }
    }
  } catch (_e) {
    // not a dictionary: the legacy key is all there is
  }
  return keys;
}

/** a legacy service_role key is a JWT and goes on both headers; a secret key is not a JWT and goes on apikey alone */
function keyHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return key.split(".").length === 3 ? { apikey: key, authorization: "Bearer " + key, ...extra } : { apikey: key, ...extra };
}

/** the one database entry: public.factory_relay_rpc, as service_role */
async function rpc(ctx: Ctx, request: Json): Promise<Json> {
  let status = 0;
  for (let tries = 0; tries < ctx.keys.length; tries++) {
    const r = await ctx.fetch(ctx.url + "/rest/v1/rpc/factory_relay_rpc", {
      method: "POST",
      headers: keyHeaders(ctx.keys[ctx.chosen], { "content-type": "application/json" }),
      body: JSON.stringify({ request }),
    });
    if (r.ok) {
      const out = await r.json();
      if (out === null || typeof out !== "object" || Array.isArray(out)) throw new RelayFault("the database answered with no object");
      return out as Json;
    }
    await r.body?.cancel();
    status = r.status;
    // this key is not the one the project accepts as service_role: the other injected key is tried, and kept if it works
    if ((status === 401 || status === 403) && ctx.keys.length > 1) ctx.chosen = (ctx.chosen + 1) % ctx.keys.length;
    else break;
  }
  throw new RelayFault("the database answered " + status);
}

function objectUrl(ctx: Ctx, path: string): string {
  return ctx.url + "/storage/v1/object/" + BUCKET + "/" + path.split("/").map(encodeURIComponent).join("/");
}

/** writes an object once: "stored", "exists" (something is already there) or "failed" */
async function putObject(ctx: Ctx, path: string, bytes: Uint8Array): Promise<"stored" | "exists" | "failed"> {
  const r = await ctx.fetch(objectUrl(ctx, path), {
    method: "POST",
    headers: keyHeaders(ctx.keys[ctx.chosen], { "content-type": "application/octet-stream", "x-upsert": "false" }),
    body: bytes as BodyInit,
  });
  const text = await r.text();
  if (r.ok) return "stored";
  if (r.status === 409 || /"statusCode"\s*:\s*"?409|Duplicate|already exists/i.test(text)) return "exists";
  console.error("relay: storage refused an upload with " + r.status);
  return "failed";
}

async function getObject(ctx: Ctx, path: string): Promise<Uint8Array | null> {
  const r = await ctx.fetch(objectUrl(ctx, path), { method: "GET", headers: keyHeaders(ctx.keys[ctx.chosen]) });
  if (!r.ok) {
    await r.body?.cancel();
    console.error("relay: storage refused a download with " + r.status);
    return null;
  }
  const bytes = new Uint8Array(await r.arrayBuffer());
  return bytes.length > MAX_FILE_BYTES ? null : bytes;
}

async function removeObjects(ctx: Ctx, paths: string[]): Promise<boolean> {
  const r = await ctx.fetch(ctx.url + "/storage/v1/object/" + BUCKET, {
    method: "DELETE",
    headers: keyHeaders(ctx.keys[ctx.chosen], { "content-type": "application/json" }),
    body: JSON.stringify({ prefixes: paths }),
  });
  await r.body?.cancel();
  return r.ok;
}

/** deletes the objects of expired artifacts and records it; a failure is retried on a later request and never fails this one */
async function purgeExpired(ctx: Ctx, due: unknown): Promise<void> {
  if (!Array.isArray(due) || due.length === 0) return;
  const done: string[] = [];
  for (const item of due) {
    const id = (item as Json)?.artifact_id;
    const paths = (item as Json)?.paths;
    if (typeof id !== "string" || !Array.isArray(paths) || !paths.every((p) => typeof p === "string")) continue;
    try {
      if (paths.length === 0 || (await removeObjects(ctx, paths as string[]))) done.push(id);
      else console.error("relay: storage did not delete the objects of an expired artifact");
    } catch (_e) {
      console.error("relay: could not delete the objects of an expired artifact");
    }
  }
  if (done.length === 0) return;
  try {
    await rpc(ctx, { fn: "purged", artifact_ids: done });
  } catch (_e) {
    console.error("relay: could not record a purge");
  }
}

async function relay(ctx: Ctx, auth: Authenticated): Promise<Response> {
  if (!/^https?:\/\//.test(ctx.url) || ctx.keys.length === 0) return refuse(503, "relay_misconfigured");

  // THE FIRST CALL, and the only one a refused request ever makes. The database entry checks, before it does anything else, that
  // this node and this key are registered and not revoked, that the nonce is new, that the node may do this to this artifact.
  const out = await rpc(ctx, {
    fn: "begin",
    node_id: auth.node.node_id,
    public_key: auth.node.public_key,
    op: auth.action,
    payload: auth.payload,
    ts: Number(auth.ts),
    nonce: auth.nonce,
    body_sha256: auth.bodySha256,
    signature: auth.signature,
    body: auth.action !== "upload" && auth.bodyText.length <= 8192 ? auth.bodyText : null,
  });
  const { purge, ...result } = out;
  await purgeExpired(ctx, purge);
  if (result.ok !== true) {
    const status = typeof result.status === "number" && result.status >= 400 && result.status <= 599 ? result.status : 500;
    return refuse(status, typeof result.refused === "string" ? result.refused : "relay_error", typeof result.detail === "string" ? result.detail : undefined);
  }

  // an upload: only the bytes that were declared when the artifact was created are stored, and only once
  if (result.phase === "store") {
    const path = String(result.object_path);
    const finish = (outcome: "stored" | "failed") => rpc(ctx, { fn: "finish", request_id: result.request_id, outcome });
    const bytes = auth.content as Uint8Array;
    if (bytes.length !== result.size || (await sha256Hex(bytes)) !== result.sha256) {
      await finish("failed");
      return refuse(422, "content_mismatch");
    }
    let stored = await putObject(ctx, path, bytes);
    if (stored === "exists") {
      // an earlier attempt stored the object and was cut off before it was recorded: accept it only if it is the declared bytes
      const there = await getObject(ctx, path);
      stored = there !== null && there.length === result.size && (await sha256Hex(there)) === result.sha256 ? "stored" : "failed";
      if (stored === "failed") {
        await finish("failed");
        return refuse(409, "object_conflict");
      }
    }
    if (stored !== "stored") {
      await finish("failed");
      return refuse(502, "storage_error");
    }
    const done = await finish("stored");
    if (done.ok !== true) return refuse(typeof done.status === "number" ? done.status : 500, typeof done.refused === "string" ? done.refused : "relay_error");
    return reply(200, { ok: true, artifact_id: auth.payload.artifact_id, kind: result.kind, stored: true, files_left: done.files_left, delivery_state: done.delivery_state });
  }

  // a download: the bound recipient gets the bytes, and only if they are still the declared bytes
  if (result.phase === "fetch") {
    const bytes = await getObject(ctx, String(result.object_path));
    if (bytes === null) return refuse(502, "storage_error");
    if (bytes.length !== result.size || (await sha256Hex(bytes)) !== result.sha256) return refuse(502, "stored_object_mismatch");
    return reply(200, { ok: true, artifact_id: auth.payload.artifact_id, kind: result.kind, name: result.name, size: result.size, sha256: result.sha256, content_b64: toBase64(bytes) });
  }

  return reply(200, result);
}

/** the request handler; nothing it throws reaches the caller, and nothing it logs is a credential or content */
export function makeHandler(env: RelayEnv, fetchImpl: Fetch): (req: Request) => Promise<Response> {
  const ctx: Ctx = { url: env.supabaseUrl.replace(/\/+$/, ""), keys: env.serviceKeys.filter((k) => typeof k === "string" && k.length >= 20), chosen: 0, fetch: fetchImpl };
  const registry = env.registry.filter((n) => NODE_ID.test(n.node_id) && KEY.test(n.public_key) && (n.relay_role === "sender" || n.relay_role === "verifier"));
  return async (req: Request) => {
    try {
      const auth = await authenticate(req, registry, Date.now());
      if (!auth.ok) return refuse(auth.status, auth.refused, auth.detail);
      return await relay(ctx, auth);
    } catch (e) {
      console.error("relay: " + (e instanceof RelayFault ? e.message : "unexpected failure (" + (e instanceof Error ? e.name : "unknown") + ")"));
      return refuse(500, "relay_error");
    }
  };
}

// MUTATION PROOF for the boundary: each mutant removes one check from a copy of the function's authentication; part 1 of the
// boundary proof must go red for it (a refused request then reaches the project, or is no longer refused as it must be).
//   node test/boundary_mutation.mjs [A01 A07 ...]
import { applySwaps, mutationProof, runNode } from './classify.mjs';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'supabase/functions/factory-artifact-relay/relay.ts'), 'utf8').replace(/\r\n/g, '\n');

// [id, what, find, replace, (find, replace)...]
const MUTANTS = [
  ['A01', 'the relay runs for a request that was not accepted', `      if (!auth.ok) return refuse(auth.status, auth.refused, auth.detail);\n`, ``],
  ['A02', 'any method is accepted', `  if (req.method !== "POST") return no(405, "method_not_allowed");\n`, ``],
  ['A03', 'any path is accepted', `if (!ROUTES.includes(url.pathname) || url.search !== "") return no(404, "not_found");`, `if (url.search !== "") return no(404, "not_found");`],
  ['A04', 'a query string is accepted', `if (!ROUTES.includes(url.pathname) || url.search !== "") return no(404, "not_found");`, `if (!ROUTES.includes(url.pathname)) return no(404, "not_found");`],
  ['A05', 'the node is not looked up by its own id (the first registered key is used)', `const node = registry.find((n) => n.node_id === nodeId);`, `const node = registry[0];`],
  ['A06', 'the signature is not checked', `  if (!signed) return no(401, "not_authenticated");\n`, ``],
  ['A07', 'the time is not checked', `  if (Math.abs(now - Number(ts)) > WINDOW_MS) return no(401, "not_authenticated", "clock");\n`, ``],
  ['A08', 'the signed action need not be the action of the body', `|| Array.isArray(envelope) || envelope.op !== action) return no(400, "bad_request");`, `|| Array.isArray(envelope)) return no(400, "bad_request");`],
  ['A09', 'an action that does not exist is passed on', `  if (allowed === undefined) return no(400, "bad_request", "unknown action");\n  if (allowed !== "either" && allowed !== node.relay_role)`, `  if (allowed !== undefined && allowed !== "either" && allowed !== node.relay_role)`],
  ['A10', 'any registered node may ask for any action', `  if (allowed !== "either" && allowed !== node.relay_role) return no(403, allowed === "sender" ? "not_the_sender" : "not_the_recipient");\n`, ``],
  ['A11', 'an artifact id of any shape is passed on', `  if (artifact && (typeof payload.artifact_id !== "string" || !UUID.test(payload.artifact_id))) return no(400, "bad_request", "artifact_id");\n`, ``],
  ['A12', 'a file kind of any name is passed on', `  if ((action === "upload" || action === "download") && (typeof payload.kind !== "string" || !KINDS.includes(payload.kind))) return no(400, "bad_request", "kind");\n`, ``],
  ['A13', 'a receipt for any state is passed on', `  if (action === "receipt" && (typeof payload.state !== "string" || !RECEIPT_STATES.includes(payload.state))) return no(400, "bad_request", "state");\n`, ``],
  ['A14', 'an upload with no content, or content that is not base64, is passed on',
    `    if (typeof contentB64 !== "string" || contentB64.length === 0 || contentB64.length % 4 !== 0 || !B64.test(contentB64)) return no(400, "bad_request", "content");\n    content = fromBase64(contentB64);\n    if (content.length === 0 || content.length > MAX_FILE_BYTES) return no(413, "too_large");\n`,
    `    content = new Uint8Array(1);\n`],
  ['A15', 'a body of any size is read', `  if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) return no(413, "too_large");\n`, ``, `  if (body.length > MAX_BODY_BYTES) return no(413, "too_large");\n`, ``],
  ['A16', 'the headers need not be well formed', `!NODE_ID.test(nodeId) || !TS.test(ts) || !NONCE.test(nonce) || !SIG.test(signature) || !/^[a-z]{1,20}$/.test(action)`, `!SIG.test(signature)`],
  ['A17', 'a body that is not one action envelope is passed on',
    `  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope) || envelope.op !== action) return no(400, "bad_request");\n  const given = envelope.payload ?? {};\n  if (given === null || typeof given !== "object" || Array.isArray(given)) return no(400, "bad_request");`,
    `  const given = (envelope ?? {}).payload ?? {};`],
  ['A18', 'a create with no candidate is passed on', `  if (action === "create" && (typeof payload.candidate_sha !== "string" || !/^[0-9a-f]{40}$/.test(payload.candidate_sha) || !Array.isArray(payload.files))) return no(400, "bad_request", "create");\n`, ``],
  ['A19', 'a signature for another method is accepted', `return utf8.encode([SIGNING_CONTEXT, "POST", action, nodeId, ts, nonce, bodySha256].join("\\n"));`,
    `return utf8.encode([SIGNING_CONTEXT, "GET", action, nodeId, ts, nonce, bodySha256].join("\\n"));`],
  ['A20', 'the nonce is not part of what is signed', `return utf8.encode([SIGNING_CONTEXT, "POST", action, nodeId, ts, nonce, bodySha256].join("\\n"));`,
    `return utf8.encode([SIGNING_CONTEXT, "POST", action, nodeId, ts, "", bodySha256].join("\\n"));`],
  ['A21', 'the function with no registration falls back to accepting a key the caller offers',
    `  const node = registry.find((n) => n.node_id === nodeId);\n  if (!node) return no(401, "not_authenticated");`,
    `  const node = registry.find((n) => n.node_id === nodeId) ?? { node_id: nodeId, relay_role: "verifier" as const, public_key: req.headers.get("x-relay-key") ?? "" };`],
  ['A22', 'the project\'s service key in a bearer header is a way in',
    `  const node = registry.find((n) => n.node_id === nodeId);\n  if (!node) return no(401, "not_authenticated");`,
    `  const node = registry.find((n) => n.node_id === nodeId);\n  if (!node) return no(401, "not_authenticated");\n  if ((req.headers.get("authorization") ?? "").length > 40) return { ok: true, node, action, ts, nonce, signature, bodySha256: "", bodyText: "", payload: {}, content: null };`],
];

const tmp = mkdtempSync(join(tmpdir(), 'relay-bnd-'));
let code = 1;
try {
  code = mutationProof({
    name: 'artifact relay boundary mutation proof',
    only: process.argv.slice(2).filter((a) => /^A\d+$/.test(a)),
    mutants: MUTANTS,
    mutate: ([id, , ...swaps]) => {
      const { text, missing } = applySwaps(SRC, swaps);
      if (text === null) return { verdict: 'NOT APPLIED', reason: 'expected exactly one "' + missing.slice(0, 60).replace(/\n/g, ' ') + '"' };
      const file = join(tmp, id + '-relay.ts');
      writeFileSync(file, text);
      return { file, env: { RELAY_FUNCTION_FILE: file } };
    },
    accept: (env) => runNode(join(ROOT, 'test', 'boundary_proof.mjs'), ['--pure'], env, 120000),
    shape: { rowId: 'N-[a-z-]+|P-[a-z]+|D-[a-z-]+', summary: /^artifact relay boundary proof \(part 1 only\): \d+\/\d+ OK/m },
  });
} finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(code);

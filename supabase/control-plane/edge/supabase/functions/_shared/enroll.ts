// The Node API's two session-less enrollment routes (WO-3). Each calls exactly one front door (node_api.ts FRONT_DOORS).
//   POST /v1/enroll/start     { code, public_key, fingerprint?, hostname? } -> { enrollment_id, challenge, computer, tenant }
//   POST /v1/enroll/complete  { enrollment_id, public_key, challenge, proof } -> { credential_id, node_id, ... }
// The peer address is the one the platform adapter hands over (peer.ts: never a request header). The code is normalized and MACed here
// and goes no further; the proof of possession is an Ed25519 signature, verified here against the key the installer presents, over
// "brain-factory-enroll-v1|<enrollment_id>|<challenge hex>|<sha256 of the key, hex>".
//
// EVERY REQUEST IS ONE ATTEMPT (S-6 "every attempt is audited"; the caps count it). A request refused here - its body, its proof, the
// pepper unset - still calls its front door, with the refusal's name (never a secret: no MAC and no key for a refused request; the
// code's public locator when the code reads as one, so the attempt is attributed to its code's tenant); a request for which the
// platform reported no usable peer address calls it with no peer. The front door records the attempt and answers: when it answers the
// same refusal, the answer is the refusal found here (its status and message); otherwise its own (a cap reached, peer_unavailable).
import { codeMac, normalizeCode } from './pairing.ts';
import type { Deps, Peer, Refusal } from './node_api.ts';
import { b64u, ed25519Verify, hex, sha256 } from './node_api.ts';

type FrontDoor = (deps: Deps, route: string, params: unknown[]) => Promise<Response>;
type Answer = (w: Refusal) => Response;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function recorded(res: Response, refusal: Refusal | null, answer: Answer): Promise<Response> {
  if (!refusal) return res;
  const r = await res.clone().json() as { refused?: unknown } | null;
  return r && r.refused === refusal.refused ? answer(refusal) : res;
}

export async function enroll(deps: Deps, route: string, body: Record<string, unknown>, problem: Refusal | null, peer: Peer,
                             frontDoor: FrontDoor, answer: Answer): Promise<Response> {
  const address = peer && typeof peer.address === 'string' && peer.address ? peer.address : null;
  if (!address) deps.log?.({ event: 'peer_unavailable', route });
  if (route === 'POST /v1/enroll/start') {
    const pepper = deps.pepper ? await deps.pepper() : null;
    const n = typeof body.code === 'string' ? normalizeCode(body.code) : null;
    const refusal: Refusal | null = problem
      || (!pepper ? { status: 503, refused: 'pepper_unavailable', message: 'pairing is unavailable: the pairing pepper is not configured' } : null);
    const mac = !refusal && n && pepper ? hex(await codeMac(pepper.key, n.normalized)) : null;
    const pk = !refusal ? b64u.dec(String(body.public_key || '')) : null;
    const meta = refusal ? '{}' : JSON.stringify({ fingerprint: body.fingerprint ?? null, hostname: body.hostname ?? null });
    const res = await frontDoor(deps, route, [n ? n.locator : null, mac, pepper ? pepper.version : null, pk ? hex(pk) : null, address, meta,
      refusal ? refusal.refused : null]);
    return recorded(res, refusal, answer);
  }
  // complete
  const pk = b64u.dec(String(body.public_key ?? ''));
  const proof = b64u.dec(String(body.proof ?? ''));
  const challenge = typeof body.challenge === 'string' && /^[0-9a-f]{64}$/.test(body.challenge) ? body.challenge : null;
  const eid = typeof body.enrollment_id === 'string' && UUID.test(body.enrollment_id) ? body.enrollment_id : null;
  let refusal: Refusal | null = problem;
  if (!refusal && (!eid || !pk || pk.length !== 32 || !proof || proof.length !== 64 || !challenge)) {
    refusal = { status: 400, refused: 'bad_request', message: 'enrollment_id, public_key, challenge and proof are required' };
  }
  let thumb: string | null = null;
  if (!refusal && pk && proof) {
    thumb = hex(await sha256(pk));
    const msg = new TextEncoder().encode('brain-factory-enroll-v1|' + String(eid) + '|' + challenge + '|' + thumb);
    if (!(await ed25519Verify(pk, proof, msg))) refusal = { status: 401, refused: 'bad_proof', message: 'the key did not sign this enrollment\'s challenge' };
  }
  const res = await frontDoor(deps, route, [eid, refusal ? null : thumb, refusal ? null : challenge, address, refusal ? refusal.refused : null]);
  return recorded(res, refusal, answer);
}

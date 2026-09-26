// The Node API's two session-less enrollment routes (WO-3). Each calls exactly one front door (node_api.ts FRONT_DOORS).
//   POST /v1/enroll/start     { code, public_key, fingerprint?, hostname? } -> { enrollment_id, challenge, computer, tenant }
//   POST /v1/enroll/complete  { enrollment_id, public_key, challenge, proof } -> { credential_id, node_id, ... }
// The peer address is the one the platform adapter hands over (never a request header). The code is normalized and MACed here and
// goes no further; the proof of possession is an Ed25519 signature, verified here against the key the installer presents, over
// "brain-factory-enroll-v1|<enrollment_id>|<challenge hex>|<sha256 of the key, hex>".
import { codeMac, normalizeCode } from './pairing.ts';
import type { Deps, Peer } from './node_api.ts';
import { b64u, ed25519Verify, hex, sha256 } from './node_api.ts';

type FrontDoor = (deps: Deps, route: string, params: unknown[]) => Promise<Response>;
type Refuse = (status: number, refused: string, message: string) => Response;

export async function enroll(deps: Deps, route: string, body: Record<string, unknown>, peer: Peer, frontDoor: FrontDoor, refuse: Refuse): Promise<Response> {
  if (!peer || !peer.address) return refuse(400, 'bad_request', 'the connecting peer address is unknown');
  if (route === 'POST /v1/enroll/start') {
    const pepper = deps.pepper ? await deps.pepper() : null;
    if (!pepper) return refuse(503, 'pepper_unavailable', 'pairing is unavailable: the pairing pepper is not configured');
    const n = normalizeCode(String(body.code || ''));
    const mac = n ? hex(await codeMac(pepper.key, n.normalized)) : null;
    const pk = b64u.dec(String(body.public_key || ''));
    const meta = JSON.stringify({ fingerprint: body.fingerprint ?? null, hostname: body.hostname ?? null });
    return frontDoor(deps, route, [n ? n.locator : null, mac, pepper.version, pk ? hex(pk) : null, peer.address, meta]);
  }
  // complete
  const pk = b64u.dec(String(body.public_key));
  const proof = b64u.dec(String(body.proof));
  const challenge = typeof body.challenge === 'string' && /^[0-9a-f]{64}$/.test(body.challenge) ? body.challenge : null;
  if (!pk || pk.length !== 32 || !proof || proof.length !== 64 || !challenge) return refuse(400, 'bad_request', 'enrollment_id, public_key, challenge and proof are required');
  const thumb = hex(await sha256(pk));
  const msg = new TextEncoder().encode('brain-factory-enroll-v1|' + String(body.enrollment_id) + '|' + challenge + '|' + thumb);
  if (!(await ed25519Verify(pk, proof, msg))) return refuse(401, 'bad_proof', 'the key did not sign this enrollment\'s challenge');
  return frontDoor(deps, route, [body.enrollment_id, thumb, challenge, peer.address]);
}

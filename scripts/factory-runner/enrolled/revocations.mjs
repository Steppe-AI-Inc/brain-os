// THE NODE'S REVOCATION LIST ONLY GROWS (S-5 "the API may deliver revocations only"; AC-5(c), (d), (j)). On the plane a revocation is
// final (release_revocations is append-only), so a list the API delivers is merged into state\revocations.json as a UNION: an answer
// that omits an entry - a misbehaving or restored endpoint - never removes it, and the start path (supervisor verifyInstalled), the
// upgrade gate and the worker's standby check read the merged list.
//   key_ids    revoked signing-key ids (strings of at most 200 characters)
//   releases   revoked releases { digest (64 lowercase hex), release_id? }, one entry per digest
// Each list is held to 10 000 entries (a revocation list that large is not a real plane's); entries beyond it are not added, and the
// merge says so. The file is written only when the union changed, and read back: an entry another writer's rename dropped is merged
// again (a few times at most).
import { paths, readJson, writeJson } from './home.mjs';

export const MAX_ENTRIES = 10000;
const keyOk = (k) => typeof k === 'string' && k.length > 0 && k.length <= 200;
const relOk = (r) => r && typeof r === 'object' && typeof r.digest === 'string' && /^[0-9a-f]{64}$/.test(r.digest);

/** the union of revocation lists (pure) -> { key_ids, releases, truncated } */
export function unionRevocations(...lists) {
  const keys = new Set();
  const rels = new Map();
  let truncated = false;
  for (const l of lists) {
    if (!l || typeof l !== 'object') continue;
    for (const k of Array.isArray(l.key_ids) ? l.key_ids : []) { if (!keyOk(k)) continue; if (keys.size >= MAX_ENTRIES && !keys.has(k)) { truncated = true; continue; } keys.add(k); }
    for (const r of Array.isArray(l.releases) ? l.releases : []) {
      if (!relOk(r)) continue;
      if (rels.has(r.digest)) { if (!rels.get(r.digest).release_id && typeof r.release_id === 'string') rels.set(r.digest, { release_id: r.release_id, digest: r.digest }); continue; }
      if (rels.size >= MAX_ENTRIES) { truncated = true; continue; }
      rels.set(r.digest, typeof r.release_id === 'string' ? { release_id: r.release_id, digest: r.digest } : { digest: r.digest });
    }
  }
  return { key_ids: [...keys].sort(), releases: [...rels.values()].sort((a, b) => (a.digest < b.digest ? -1 : a.digest > b.digest ? 1 : 0)), truncated };
}

const contains = (big, small) => small.key_ids.every((k) => big.key_ids.includes(k)) && small.releases.every((r) => big.releases.some((x) => x.digest === r.digest));

/** merge a delivered list into home's state\revocations.json; returns the merged list { key_ids, releases } (never smaller than before) */
export function mergeRevocations(home, delivered) {
  const p = paths(home);
  let want = unionRevocations(readJson(p.revocations, null), delivered);
  for (let i = 0; i < 3; i++) {
    const onDisk = unionRevocations(readJson(p.revocations, null));
    if (contains(onDisk, want) && contains(want, onDisk)) break;
    want = unionRevocations(onDisk, want);
    writeJson(p.revocations, { key_ids: want.key_ids, releases: want.releases });
  }
  return { key_ids: want.key_ids, releases: want.releases };
}

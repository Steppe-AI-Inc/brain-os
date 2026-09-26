// RUNTIME UPGRADE, ADOPT AND ROLL BACK (WO-6; contract §2 Release; AC-5 (i), (j), (m)).
//   upgrade   a release offered to this node (an exe + its manifest) is VERIFIED BEFORE ANY OF IT RUNS, against the trust set pinned
//             in THIS installed runtime and the revocations the API delivered: unsigned, tampered, a revoked key, a revoked release, a
//             key outside the pinned set, a dev key on a production-channel runtime - each refused by name, and the offered bytes are
//             never executed. A version not newer than the running one is refused (a node never downgrades silently) unless it is the
//             release a Factory admin ADOPTED for this computer (the plane says so on the node's heartbeat).
//   adopt     the worker switches to the adopted release when it is installed here (the previous release is kept for exactly this).
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths, readJson, writeJson } from './home.mjs';
import { authenticodeImageHash } from './pe-image.mjs';
import { verifyRelease } from './release.mjs';

export function semverCmp(a, b) {
  const pa = String(a).split(/[-+]/)[0].split('.').map(Number), pb = String(b).split(/[-+]/)[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

export async function upgrade({ home, artifact, manifest }) {
  const p = paths(home);
  if (!artifact || !manifest) return { ok: false, refused: 'bad_request', message: 'upgrade --artifact <exe> --manifest <manifest.json>' };
  const m = readJson(manifest);
  let bytes;
  try { bytes = readFileSync(artifact); } catch (e) { return { ok: false, refused: 'bad_request', message: 'the artifact cannot be read: ' + e.code }; }
  const v = verifyRelease({ manifest: m, artifact: bytes, revocations: readJson(p.revocations, { key_ids: [], releases: [] }) });
  if (!v.ok) return v;
  const cur = readJson(p.current);
  const adopted = (readJson(p.status, {}).adopted_release || {}).digest;
  if (cur && semverCmp(v.version, cur.version) <= 0 && v.digest !== adopted) {
    return { ok: false, refused: 'downgrade_refused', message: 'release ' + v.version + ' is not newer than the running ' + cur.version + ' and no Factory admin adopted it for this computer' };
  }
  const dir = join(p.runtime, v.version + '-' + v.digest.slice(0, 12));
  mkdirSync(dir, { recursive: true });
  copyFileSync(artifact, join(dir, 'BrainFactory.exe'));
  if (authenticodeImageHash(readFileSync(join(dir, 'BrainFactory.exe'))) !== v.digest) return { ok: false, refused: 'digest_mismatch', message: 'the installed copy changed' };
  writeJson(join(dir, 'manifest.json'), m);
  if (cur && cur.dir !== dir) writeJson(p.previous, cur);
  writeJson(p.current, { dir, version: v.version, digest: v.digest, installed_at: new Date().toISOString(), via: 'upgrade' });
  return { ok: true, version: v.version, digest: v.digest, installed: dir, note: 'the supervisor runs it from its next worker start (verified again then)' };
}

/** the adopted release, if a Factory admin adopted one that is installed here and it is not the running one: switch to it */
export function adoptIfInstalled(home, adopted, runningDigest) {
  const p = paths(home);
  if (!adopted || !adopted.digest || adopted.digest === runningDigest) return null;
  for (const f of [p.previous, p.current]) {
    const r = readJson(f);
    if (r && r.digest === adopted.digest) {
      const cur = readJson(p.current);
      if (cur && cur.digest !== r.digest) writeJson(p.previous, cur);
      writeJson(p.current, { ...r, adopted_at: new Date().toISOString(), via: 'admin adopt' });
      return r;
    }
  }
  return { missing: true };
}

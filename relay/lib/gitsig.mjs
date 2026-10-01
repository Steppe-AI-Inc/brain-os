// Who signed a git commit: the SSH signature in the commit object, verified without git's own signing configuration.
// Returns the fingerprint of the key that really signed; the caller compares it with the one it trusts.
import { verifySshSignature } from './sshsig.mjs';

/** `raw` is the commit object as `git cat-file commit <id>` prints it (a Buffer) */
export function commitSigner(raw) {
  const text = raw.toString('latin1');
  const headEnd = text.indexOf('\n\n');
  if (headEnd < 0) return { ok: false, reason: 'not a commit object' };
  const start = text.indexOf('\ngpgsig -----BEGIN SSH SIGNATURE-----\n');
  if (start < 0 || start > headEnd) return { ok: false, reason: 'the commit carries no SSH signature' };
  const END = '\n -----END SSH SIGNATURE-----\n';
  const stop = text.indexOf(END, start);
  if (stop < 0 || stop > headEnd + 1) return { ok: false, reason: 'the commit signature is not closed' };
  const armored = text.slice(start + '\ngpgsig '.length, stop + END.length).split('\n').map((l) => l.replace(/^ /, '')).join('\n');
  // what was signed: the commit object without its signature header
  const payload = Buffer.concat([raw.subarray(0, start + 1), raw.subarray(stop + END.length)]);
  const v = verifySshSignature({ signatureFile: Buffer.from(armored, 'latin1'), message: payload, namespace: 'git' });
  const parents = [...text.slice(0, headEnd).matchAll(/^parent ([0-9a-f]{40})$/gm)].map((m) => m[1]);
  return v.ok ? { ok: true, fingerprint: v.fingerprint, parents } : { ok: false, reason: v.reason };
}

// THE RECIPIENT'S VERIFICATION of a delivered bundle: the archive, its .sha256 and the detached signature over the .sha256.
// Everything is checked in memory, in this order, BEFORE anything is extracted:
//   1 signature        the detached signature is good, in the namespace "file", and its key is the one the RECIPIENT trusts
//   2 archive_sha256   the archive hashes to what the signed .sha256 says (and to what the relay recorded)
//   3 archive_paths    the archive has one reading and every path in it is safe
//   4 file_set         the files are exactly the expected ones for this candidate
//   5 sha256sums       the SHA256SUMS inside the archive holds for every file it must list
// The trust anchor (the fingerprint) and the expected file set come from the recipient's side, never from the sender or the bundle.
import { createHash } from 'node:crypto';
import { verifySshSignature } from './sshsig.mjs';
import { readZipStrict, ZipRefused } from './zipsafe.mjs';

export const sha256Hex = (buf) => createHash('sha256').update(buf).digest('hex');
export const CHECKS = ['signature', 'archive_sha256', 'archive_paths', 'file_set', 'sha256sums'];

/**
 * The one intake profile of V0: a candidate's private handoff, CANDIDATE<n>_HANDOFF_<short sha>.zip.
 * Returns the expected file set for that archive name and candidate, or { error }.
 */
export function handoffProfile(archiveName, candidateSha) {
  const m = /^CANDIDATE([1-9][0-9]?)_HANDOFF_([0-9a-f]{7})\.zip$/.exec(archiveName);
  if (!m) return { error: 'the archive is not named like a candidate private handoff' };
  const [, n, short] = m;
  if (typeof candidateSha !== 'string' || !/^[0-9a-f]{40}$/.test(candidateSha)) return { error: 'the candidate is not a full commit id' };
  if (!candidateSha.startsWith(short)) return { error: 'the archive is named for another candidate than ' + candidateSha };
  const dir = `c${n}-private-${short}`;
  const listed = ['README.md', `c${n}_matrix.private.md`, `c${n}_residuals.md`];
  return {
    name: `candidate ${n} private handoff`,
    notice: `CANDIDATE${n}_NOTICE_${short}.md`,
    sums: `${dir}/SHA256SUMS`,
    sumsDir: dir,
    listed,
    files: [`CANDIDATE${n}_NOTICE_${short}.md`, ...listed.map((f) => `${dir}/${f}`), `${dir}/SHA256SUMS`],
  };
}

/** a .sha256 file: exactly one line, "<64 hex> *<name>" or "<64 hex>  <name>" */
export function parseSha256File(buf) {
  const m = /^([0-9a-f]{64}) [ *]([^\r\n]+)\r?\n?$/.exec(buf.toString('latin1'));
  return m ? { sha256: m[1], name: m[2] } : null;
}

/** a SHA256SUMS file: one "<64 hex> *<name>" or "<64 hex>  <name>" per line */
export function parseSha256Sums(buf) {
  const text = buf.toString('latin1').replace(/\r\n/g, '\n');
  if (text.length === 0 || !text.endsWith('\n')) return null;
  const out = [];
  for (const line of text.slice(0, -1).split('\n')) {
    const m = /^([0-9a-f]{64}) [ *]([A-Za-z0-9._-]+)$/.exec(line);
    if (!m) return null;
    out.push({ sha256: m[1], name: m[2] });
  }
  return out;
}

/**
 * Verifies a bundle. Nothing is written anywhere.
 *   archiveName, archive, sha256File, signatureFile   the three delivered files
 *   trustFingerprint                                   the signing identity the RECIPIENT trusts (SHA256:...)
 *   candidateSha                                       the candidate this delivery is for
 *   record                                             optional: what the relay recorded ({ archive_sha256, sender_signing_fingerprint })
 * Returns { ok, failed, checks: [{ name, ok, detail }], signer, archiveSha256, profile, files: [{ path, bytes, size, sha256 }] }.
 */
export function verifyBundle({ archiveName, archive, sha256File, signatureFile, trustFingerprint, candidateSha, record = null }) {
  const checks = [];
  const result = { ok: false, failed: null, checks, signer: null, archiveSha256: null, profile: null, files: [] };
  const pass = (name, detail) => { checks.push({ name, ok: true, detail }); return true; };
  const fail = (name, detail) => { checks.push({ name, ok: false, detail }); result.failed = name; return result; };

  // 1 signature: over the .sha256 file, namespace "file", by the key the recipient trusts
  if (typeof trustFingerprint !== 'string' || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(trustFingerprint)) return fail('signature', 'the recipient has no trusted signing fingerprint');
  const sig = verifySshSignature({ signatureFile, message: sha256File, namespace: 'file' });
  if (!sig.ok) return fail('signature', sig.reason);
  result.signer = sig.fingerprint;
  if (sig.fingerprint !== trustFingerprint) return fail('signature', `signed by ${sig.fingerprint}, which is not the trusted identity`);
  if (record && record.sender_signing_fingerprint !== sig.fingerprint) return fail('signature', 'the relay record names another signing identity than the one that signed');
  pass('signature', 'good "file" signature by ' + sig.fingerprint);

  // 2 archive sha256: the signed .sha256 names this archive and its hash
  const declared = parseSha256File(sha256File);
  if (!declared) return fail('archive_sha256', 'the .sha256 file is not one "<sha256> *<name>" line');
  if (declared.name !== archiveName) return fail('archive_sha256', 'the signed .sha256 names another file');
  const actual = sha256Hex(archive);
  result.archiveSha256 = actual;
  if (actual !== declared.sha256) return fail('archive_sha256', 'the archive does not hash to the signed value');
  if (record && record.archive_sha256 !== actual) return fail('archive_sha256', 'the archive does not hash to the value the relay recorded');
  pass('archive_sha256', actual);

  // 3 archive paths and structure
  let entries;
  try { entries = readZipStrict(archive); } catch (e) {
    if (e instanceof ZipRefused) return fail('archive_paths', e.message);
    throw e;
  }
  pass('archive_paths', entries.length + ' entries, every path safe, one reading');

  // 4 exact file set
  const profile = handoffProfile(archiveName, candidateSha);
  if (profile.error) return fail('file_set', profile.error);
  result.profile = profile;
  const names = entries.map((e) => e.name);
  const missing = profile.files.filter((f) => !names.includes(f)), extra = names.filter((f) => !profile.files.includes(f));
  if (missing.length || extra.length) return fail('file_set', [missing.length ? 'missing: ' + missing.join(', ') : '', extra.length ? 'not expected: ' + extra.join(', ') : ''].filter(Boolean).join('; '));
  pass('file_set', 'exactly the ' + profile.files.length + ' files of the ' + profile.name);

  // 5 the SHA256SUMS inside
  const byName = new Map(entries.map((e) => [e.name, e.bytes]));
  const sums = parseSha256Sums(byName.get(profile.sums));
  if (!sums) return fail('sha256sums', 'SHA256SUMS is not a list of "<sha256> *<name>" lines');
  const listedNames = sums.map((s) => s.name);
  if (listedNames.length !== profile.listed.length || new Set(listedNames).size !== listedNames.length || !profile.listed.every((f) => listedNames.includes(f))) {
    return fail('sha256sums', 'SHA256SUMS does not list exactly ' + profile.listed.join(', '));
  }
  for (const s of sums) {
    if (sha256Hex(byName.get(`${profile.sumsDir}/${s.name}`)) !== s.sha256) return fail('sha256sums', s.name + ' does not hash to its listed value');
  }
  pass('sha256sums', sums.length + ' of ' + sums.length + ' listed files hash to their listed values');

  result.ok = true;
  result.files = entries.map((e) => ({ path: e.name, bytes: e.bytes, size: e.bytes.length, sha256: sha256Hex(e.bytes) }));
  return result;
}

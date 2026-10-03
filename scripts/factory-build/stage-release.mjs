#!/usr/bin/env node
// STAGE A CERTIFIED RELEASE (founder correction 2026-10-03; CR-028) - the DIRECTOR's command, run once a candidate is CERTIFIED, so that
// the founder's part of an update begins and ends at Brain OS -> Factory -> Update -> password -> Confirm.
//
//   node scripts/factory-build/stage-release.mjs --artifact <the verifier-reproduced BrainFactorySetup.exe> --version <semver>
//        --source-sha <the CERTIFIED candidate SHA> --receipt-sha256 <the certifying receipt's sha256> --signing-key <the Director's
//        OpenSSH private key file> [--stage-url <url>] [--release-base <url>]
//
// It computes the installer's digest (the PE Authenticode image hash, S-5), writes the prepared update's statement, has ssh-keygen
// sign it with the Director's key in the namespace the Factory checks (this program never reads the key: ssh-keygen does, and asks for
// its passphrase itself), sends the statement and signature to factory-release-stage, and uploads the installer to the one-object
// address it answers - unless release storage already serves exactly that installer. The upload address never overwrites an installer
// that is there: another installer at that path stops the command (the judged removal step is the founder's). Then it reads the
// installer back from the public release storage and compares its digest. Nothing here can publish or sign a release.
// Exit 0: STAGED (or ALREADY STAGED). Exit 1: a named refusal; nothing about the result is assumed.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticodeImageHash } from '../factory-runner/enrolled/pe-image.mjs';
import { RELEASE_BASE } from './build-sea.mjs';

export const STAGE_NAMESPACE = 'brain-factory-prepared-update-v1';        // _shared/release_stage.ts STAGE_NAMESPACE
export const STAGE_URL = 'https://npvhuoozkbexddnvkqsj.supabase.co/functions/v1/factory-release-stage';
const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]{1,40})?$/;

/** the prepared update's statement, exactly as _shared/release_stage.ts statementText writes it */
export const statementText = (s) => JSON.stringify({ channel: 'production', digest: s.digest, receipt_sha256: s.receipt_sha256, source_sha: s.source_sha, v: 1, version: s.version });

export async function stageRelease({ artifact, version, sourceSha, receiptSha256, signingKey, stageUrl = STAGE_URL, releaseBase = RELEASE_BASE.production,
  fetchImpl = globalThis.fetch, sshKeygen = 'ssh-keygen', say = (s) => console.log(s) }) {
  const stop = (refused, message) => ({ ok: false, refused, message });
  if (!artifact || !signingKey || !VERSION.test(version || '') || !/^[0-9a-f]{40}$/.test(sourceSha || '') || !/^[0-9a-f]{64}$/.test(receiptSha256 || '')) {
    return stop('bad_request', '--artifact <exe> --version <semver> --source-sha <40 hex> --receipt-sha256 <64 hex> --signing-key <file>');
  }
  let bytes;
  try { bytes = readFileSync(artifact); } catch (e) { return stop('bad_request', 'the installer cannot be read: ' + (e.code || e.message)); }
  const digest = authenticodeImageHash(bytes);
  const statement = statementText({ version, source_sha: sourceSha, digest, receipt_sha256: receiptSha256 });
  say('statement: ' + statement);
  const dir = mkdtempSync(join(tmpdir(), 'bf-stage-'));
  let signature;
  try {
    const file = join(dir, 'statement.json');
    writeFileSync(file, statement);
    const r = spawnSync(sshKeygen, ['-Y', 'sign', '-f', signingKey, '-n', STAGE_NAMESPACE, file], { stdio: ['inherit', 'pipe', 'inherit'], windowsHide: true });
    if (r.error || r.status !== 0) return stop('not_signed', 'ssh-keygen did not sign the statement (' + (r.error ? r.error.code : 'exit ' + r.status) + ')');
    signature = readFileSync(file + '.sig', 'utf8');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const res = await fetchImpl(stageUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ statement, signature }), signal: AbortSignal.timeout(60000) });
  let ans = {};
  try { ans = await res.json(); } catch { ans = {}; }
  if (res.status !== 200 || ans.ok !== true || typeof ans.installer_upload_url !== 'string') {
    return stop(ans.refused || 'stage_refused', 'factory-release-stage answered HTTP ' + res.status + (ans.message ? ': ' + ans.message : ''));
  }
  say('staged: the prepared update is ' + version + ' (digest ' + digest + ')');
  const servedUrl = releaseBase.replace(/\/+$/, '') + '/' + encodeURIComponent(version) + '/BrainFactorySetup.exe';
  const served = async () => {
    const g = await fetchImpl(servedUrl + '?read=' + Date.now(), { signal: AbortSignal.timeout(600000) });
    if (g.status !== 200) { await g.body?.cancel(); return null; }
    return authenticodeImageHash(Buffer.from(await g.arrayBuffer()));
  };
  const before = await served();
  if (before && before !== digest) return stop('another_installer', 'release storage already serves another installer for ' + version + ' (digest ' + before + '): the path is write-once');
  if (!before) {
    const up = await fetchImpl(ans.installer_upload_url, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes, signal: AbortSignal.timeout(600000) });
    await up.body?.cancel();
    if (!up.ok) return stop('upload_refused', 'release storage refused the installer upload (HTTP ' + up.status + ')');
  }
  const after = await served();
  if (after !== digest) return stop('not_served', 'release storage does not serve the staged installer (' + (after ? 'digest ' + after : 'nothing') + ')');
  return { ok: true, already: !!before, version, digest, statement };
}

const isMain = (() => { try { return fileURLToPath(import.meta.url).toLowerCase() === (process.argv[1] || '').toLowerCase() || /stage-release\.mjs$/.test(process.argv[1] || ''); } catch { return false; } })();
if (isMain) {
  const a = {}; const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) a[String(argv[i]).replace(/^--/, '')] = argv[i + 1];
  const r = await stageRelease({ artifact: a.artifact, version: a.version, sourceSha: a['source-sha'], receiptSha256: a['receipt-sha256'], signingKey: a['signing-key'],
    ...(a['stage-url'] ? { stageUrl: a['stage-url'] } : {}), ...(a['release-base'] ? { releaseBase: a['release-base'] } : {}) });
  console.log(r.ok ? (r.already ? 'ALREADY STAGED - ' : 'STAGED - ') + r.version + ', digest ' + r.digest : 'REFUSED - ' + r.refused + ': ' + r.message);
  process.exitCode = r.ok ? 0 : 1;
}

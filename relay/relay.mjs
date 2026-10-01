#!/usr/bin/env node
// ARTIFACT RELAY V0 - the node command (see ARTIFACT_RELAY_V0.md). Needs Node 18 or later and nothing else.
//
//   keygen  --node <factory node id> --role sender|verifier --url <relay url>     make this node's relay key (once)
//   pubkey                                                                       print this node's id, role and public key
//   registration                                                                 write registrations/<role>.json for the installer
//   selfcheck                                                                    ask the relay whether this node is registered
//   send    --archive <file.zip> --candidate <40-hex sha> [--retention-days N]   sender: upload the archive, its .sha256 and .sha256.sig
//   receive --trust-fingerprint SHA256:... --intake-dir <dir> [--wait <minutes>]  verifier: download, verify, extract, begin intake
//   status  [--artifact <id>]                                                    the record and its receipts, checked
//   verify-local --archive <file.zip> --candidate <sha> --trust-fingerprint SHA256:...   the verifier's checks on local files; no relay
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RelayError, call, checkedUrl, createIdentity, loadConfig, must, publicKey, relayHome, saveConfig, sha256Hex, verifyRequestSignature } from './lib/client.mjs';
import { CHECKS, verifyBundle } from './lib/bundle.mjs';
import { verifySshSignature } from './lib/sshsig.mjs';

const MAX_FILE_BYTES = 1048576;
const KINDS = ['archive', 'sha256', 'signature'];
const say = (line = '') => process.stdout.write(line + '\n');

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) { out._.push(argv[i]); continue; }
    const key = argv[i].slice(2);
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new RelayError('--' + key + ' needs a value');
    out[key] = argv[++i];
  }
  return out;
}
const need = (a, key) => { if (!a[key]) throw new RelayError('--' + key + ' is required'); return a[key]; };

/** the three delivered files, read from disk next to the archive */
function readTriple(archivePath) {
  const paths = { archive: archivePath, sha256: archivePath + '.sha256', signature: archivePath + '.sha256.sig' };
  const out = {};
  for (const kind of KINDS) {
    if (!existsSync(paths[kind])) throw new RelayError('missing ' + paths[kind]);
    const size = statSync(paths[kind]).size;
    if (size < 1 || size > MAX_FILE_BYTES) throw new RelayError(paths[kind] + ' is empty or larger than ' + MAX_FILE_BYTES + ' bytes');
    const bytes = readFileSync(paths[kind]);
    out[kind] = { kind, name: basename(paths[kind]), size: bytes.length, sha256: sha256Hex(bytes), bytes };
  }
  return out;
}

function printChecks(v) {
  for (const c of v.checks) say(`  ${c.ok ? 'OK    ' : 'FAILED'} ${c.name.padEnd(15)} ${c.detail}`);
  for (const name of CHECKS.slice(v.checks.length)) say(`  NOT RUN ${name}`);
}

/** the receipts of a status reply, checked: each chained to the one before, each signed request good under the recorded key */
function checkReceipts(artifactId, receipts, ownKey) {
  let prev = '0'.repeat(64), chain = true;
  const lines = [];
  for (const r of receipts) {
    const hash = sha256Hex(Buffer.from([r.prev_hash, artifactId, r.seq, r.state, r.actor_node_id ?? 'relay', r.at, r.request_body_sha256 ?? '', r.request_signature ?? ''].join('|'), 'utf8'));
    const linked = r.prev_hash === prev && r.hash === hash;
    chain = chain && linked; prev = r.hash;
    let signed = 'by the relay';
    if (r.actor_node_id) {
      const good = r.actor_public_key && verifyRequestSignature({ publicKeyB64u: r.actor_public_key, action: r.request_action, nodeId: r.actor_node_id, ts: r.request_ts, nonce: r.request_nonce,
        bodySha256: r.request_body_sha256, signature: r.request_signature });
      const bodyOk = r.request_body == null || sha256Hex(Buffer.from(r.request_body, 'utf8')) === r.request_body_sha256;
      signed = good && bodyOk ? `signed by ${r.actor_node_id} (key ${r.actor_public_key}${r.actor_public_key === ownKey ? ', this node' : ''})` : 'SIGNATURE NOT VERIFIED';
      chain = chain && good && bodyOk;
    }
    lines.push(`  ${String(r.seq).padStart(2)} ${r.state.padEnd(9)} ${r.at}  ${linked ? 'chained' : 'CHAIN BROKEN'}  ${signed}`);
  }
  return { ok: chain, lines };
}

async function showStatus(cfg, artifactId) {
  const s = await must(cfg, 'status', { artifact_id: artifactId });
  const a = s.artifact;
  say(`artifact        ${a.artifact_id}`);
  say(`candidate       ${a.candidate_sha}`);
  say(`sender          ${a.sender_node_id}`);
  say(`recipient       ${a.recipient_node_id}`);
  say(`signed by       ${a.sender_signing_fingerprint}`);
  say(`archive         ${a.archive_name}  ${a.archive_size} bytes  sha256 ${a.archive_sha256}`);
  say(`object          ${a.object_path}`);
  say(`created         ${a.created_at}`);
  say(`expires         ${a.expires_at}${a.preserved_as_evidence ? '  (preserved as evidence)' : ''}${a.purged ? '  (bytes deleted)' : ''}`);
  say(`delivery state  ${a.delivery_state}`);
  const r = checkReceipts(a.artifact_id, s.receipts, publicKey());
  say('receipts');
  for (const line of r.lines) say(line);
  say(r.ok ? 'receipts: chained and signed' : 'receipts: NOT VERIFIED');
  return { artifact: a, receipts: s.receipts, ok: r.ok };
}

// ----------------------------------------------------------------------------------------------------------------------- commands
async function keygen(a) {
  const nodeId = need(a, 'node'), role = need(a, 'role');
  if (role !== 'sender' && role !== 'verifier') throw new RelayError('--role is sender or verifier');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,99}$/.test(nodeId)) throw new RelayError('--node is not a node id');
  const url = checkedUrl(need(a, 'url'));
  createIdentity({ nodeId, relayRole: role });
  saveConfig({ node_id: nodeId, relay_role: role, url });
  say('relay identity created in ' + relayHome() + ' (the private key stays there)');
  await pubkey();
}

async function pubkey() {
  const cfg = loadConfig();
  say(`node_id     ${cfg.node_id}`);
  say(`relay_role  ${cfg.relay_role}`);
  say(`public_key  ${publicKey()}`);
  say('the installer registers this key (relay/install.ps1); a verifier publishes it first with: relay.mjs registration');
}

/** writes this node's registration where the installer looks for it: registrations/<role>.json in this checkout */
async function registration() {
  const cfg = loadConfig();
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'registrations', cfg.relay_role + '.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ relay: 'artifact-relay/v0', node_id: cfg.node_id, relay_role: cfg.relay_role, public_key: publicKey() }) + '\n');
  say('written ' + file);
  say('commit exactly this file on top of the relay commit, signed, and push it (README: "The verifier publishes its key")');
  return 0;
}

async function selfcheck() {
  const cfg = loadConfig();
  const r = await call(cfg, 'selfcheck');
  if (r.status === 200 && r.body.ok) {
    say(`REGISTERED  ${r.body.node_id} as ${r.body.relay_role}; bucket ${r.body.bucket}; sender registered: ${r.body.sender_registered}; verifier registered: ${r.body.verifier_registered}`);
    return 0;
  }
  say(`NOT READY   ${r.body.refused ?? 'no answer'}${r.body.detail ? ' (' + r.body.detail + ')' : ''} [${r.status}]`);
  return 5;
}

async function send(a) {
  const cfg = loadConfig();
  if (cfg.relay_role !== 'sender') throw new RelayError('this node is registered as ' + cfg.relay_role + ', not as the sender');
  const archivePath = resolve(need(a, 'archive')), candidate = need(a, 'candidate');
  const t = readTriple(archivePath);
  // the sender does not upload a bundle the recipient's own checks would refuse
  const sig = verifySshSignature({ signatureFile: t.signature.bytes, message: t.sha256.bytes, namespace: 'file' });
  if (!sig.ok) throw new RelayError('the detached signature is not good: ' + sig.reason);
  if (a.fingerprint && a.fingerprint !== sig.fingerprint) throw new RelayError(`the bundle is signed by ${sig.fingerprint}, not by ${a.fingerprint}`);
  const v = verifyBundle({ archiveName: t.archive.name, archive: t.archive.bytes, sha256File: t.sha256.bytes, signatureFile: t.signature.bytes, trustFingerprint: sig.fingerprint, candidateSha: candidate });
  say('bundle ' + t.archive.name + ', signed by ' + sig.fingerprint);
  printChecks(v);
  if (!v.ok) throw new RelayError('the bundle would be refused by the recipient (' + v.failed + '); nothing was sent');

  const payload = { candidate_sha: candidate, signing_fingerprint: sig.fingerprint, archive_name: t.archive.name, files: KINDS.map((k) => ({ kind: k, name: t[k].name, size: t[k].size, sha256: t[k].sha256 })) };
  if (a['retention-days'] !== undefined) {
    if (!/^([1-9]|[12][0-9]|30)$/.test(a['retention-days'])) throw new RelayError('--retention-days is a whole number from 1 to 30');
    payload.retention_days = Number(a['retention-days']);
  }
  const created = await must(cfg, 'create', payload);
  const art = created.artifact;
  saveConfig({ ...cfg, last_artifact_id: art.artifact_id });
  say(`${created.already ? 'EXISTING' : 'CREATED '}  artifact ${art.artifact_id} for recipient ${art.recipient_node_id}, state ${art.delivery_state}, expires ${art.expires_at}`);
  if (art.delivery_state === 'CREATED') {
    for (const f of art.files) {
      if (f.stored) { say(`  already stored  ${f.name}`); continue; }
      const up = await must(cfg, 'upload', { artifact_id: art.artifact_id, kind: f.kind, content_b64: t[f.kind].bytes.toString('base64') });
      say(`  stored  ${f.name}  ${f.size} bytes  sha256 ${f.sha256}  (${up.files_left} left)`);
    }
  }
  say();
  const s = await showStatus(cfg, art.artifact_id);
  if (s.artifact.delivery_state === 'CREATED') throw new RelayError('the upload is not complete');
  say();
  say(`ARTIFACT ${s.artifact.delivery_state}: ${art.archive_name} -> ${art.recipient_node_id}`);
  return s.ok ? 0 : 5;
}

/** an intake directory holds private material: never inside a git work tree, never inside a folder a cloud client syncs */
function checkedIntakeDir(dir) {
  if (!isAbsolute(dir)) throw new RelayError('--intake-dir must be an absolute path');
  const full = resolve(dir);
  for (const part of full.split(sep)) {
    if (/^(onedrive.*|google ?drive.*|my drive|dropbox.*|icloud ?drive|box|box sync)$/i.test(part)) throw new RelayError('the intake directory is inside a cloud-synced folder (' + part + ')');
  }
  for (let d = full; ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) throw new RelayError('the intake directory is inside a git work tree (' + d + '): private material must never be committed');
    if (d === parse(d).root) break;
  }
  mkdirSync(full, { recursive: true });
  return full;
}

/** writes the verified bytes (never a second read of the archive) into a new directory; never overwrites */
function extract({ intakeDir, artifact, verified, delivered, cfg, trustFingerprint }) {
  const finalDir = join(intakeDir, artifact.archive_name.replace(/\.zip$/, '') + '_' + artifact.artifact_id);
  if (existsSync(finalDir)) {
    let prior = null;
    try { prior = JSON.parse(readFileSync(join(finalDir, 'INTAKE.json'), 'utf8')); } catch { /* not a finished intake */ }
    if (prior?.artifact?.artifact_id === artifact.artifact_id && prior?.archive_sha256 === verified.archiveSha256) return { dir: finalDir, already: true };
    throw new RelayError(finalDir + ' exists and is not this intake; it is not overwritten');
  }
  const tmp = finalDir + '.partial-' + randomBytes(4).toString('hex');
  mkdirSync(tmp);
  const put = (rel, bytes) => {
    const dest = resolve(tmp, ...rel.split('/'));
    if (!dest.startsWith(resolve(tmp) + sep)) throw new RelayError('a path left the intake directory');
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes, { flag: 'wx' });
  };
  for (const f of verified.files) put('bundle/' + f.path, f.bytes);
  for (const kind of KINDS) put('delivered/' + delivered[kind].name, delivered[kind].bytes);
  put('INTAKE.json', Buffer.from(JSON.stringify({
    relay: 'artifact-relay/v0', intake: verified.profile.name, verified_at: new Date().toISOString(), verifier_node_id: cfg.node_id,
    trusted_signing_fingerprint: trustFingerprint, signer: verified.signer, archive_sha256: verified.archiveSha256, artifact,
    checks: verified.checks, files: verified.files.map((f) => ({ path: 'bundle/' + f.path, size: f.size, sha256: f.sha256 })),
    delivered: KINDS.map((k) => ({ path: 'delivered/' + delivered[k].name, size: delivered[k].size, sha256: delivered[k].sha256 })),
    read_first: 'bundle/' + verified.profile.notice,
    recheck_without_this_tool: [
      'ssh-keygen -Y check-novalidate -n file -s delivered/' + delivered.signature.name + ' < delivered/' + delivered.sha256.name + '     (prints the signing key; expect ' + trustFingerprint + ')',
      'cd delivered && sha256sum -c ' + delivered.sha256.name,
      'cd bundle/' + verified.profile.sumsDir + ' && sha256sum -c SHA256SUMS',
    ],
  }, null, 2) + '\n'));
  renameSync(tmp, finalDir);
  return { dir: finalDir, already: false };
}

async function receiveOne(cfg, art, trustFingerprint, intakeDir) {
  say(`artifact ${art.artifact_id}  ${art.archive_name}  from ${art.sender_node_id}  state ${art.delivery_state}`);
  const delivered = {};
  for (const kind of KINDS) {
    const d = await must(cfg, 'download', { artifact_id: art.artifact_id, kind });
    const bytes = Buffer.from(d.content_b64, 'base64');
    const rec = art.files.find((f) => f.kind === kind);
    if (!rec || bytes.length !== rec.size || sha256Hex(bytes) !== rec.sha256 || d.name !== rec.name) throw new RelayError('the relay handed over bytes that are not the recorded ' + kind);
    delivered[kind] = { kind, name: rec.name, size: bytes.length, sha256: rec.sha256, bytes };
  }
  if (art.delivery_state === 'UPLOADED') {
    await must(cfg, 'receipt', { artifact_id: art.artifact_id, state: 'DELIVERED', detail: { files: KINDS.map((k) => ({ kind: k, size: delivered[k].size, sha256: delivered[k].sha256 })) } });
    say('DELIVERED  the three files arrived as recorded');
  }
  const v = verifyBundle({ archiveName: art.archive_name, archive: delivered.archive.bytes, sha256File: delivered.sha256.bytes, signatureFile: delivered.signature.bytes,
    trustFingerprint, candidateSha: art.candidate_sha, record: art });
  printChecks(v);
  if (!v.ok) {
    const failed = v.checks.at(-1);
    await must(cfg, 'receipt', { artifact_id: art.artifact_id, state: 'REFUSED', detail: { check: failed.name, reason: String(failed.detail).slice(0, 300), signer: v.signer } });
    say(`REFUSED    ${failed.name}: ${failed.detail}`);
    say('nothing was extracted');
    return 'refused';
  }
  if (art.delivery_state !== 'VERIFIED') {
    await must(cfg, 'receipt', { artifact_id: art.artifact_id, state: 'VERIFIED', detail: { checks: CHECKS, signer: v.signer, archive_sha256: v.archiveSha256, files: v.files.length } });
  }
  say('VERIFIED   before extraction: ' + CHECKS.join(', '));
  const out = extract({ intakeDir, artifact: art, verified: v, delivered, cfg, trustFingerprint });
  await must(cfg, 'receipt', { artifact_id: art.artifact_id, state: 'CONSUMED', detail: { intake: basename(out.dir), files: v.files.length } });
  say('CONSUMED   ' + (out.already ? 'the intake directory was already in place' : 'extracted ' + v.files.length + ' files'));
  const s = await must(cfg, 'status', { artifact_id: art.artifact_id });
  const receiptsFile = join(out.dir, 'RECEIPTS.json');
  if (!existsSync(receiptsFile)) writeFileSync(receiptsFile, JSON.stringify({ artifact: s.artifact, receipts: s.receipts }, null, 2) + '\n', { flag: 'wx' });
  say();
  say(`${v.profile.name.replace(/^candidate (\d+).*$/, 'CANDIDATE #$1')} INTAKE READY`);
  say('  intake      ' + out.dir);
  say('  read first  ' + join(out.dir, 'bundle', v.profile.notice));
  return 'consumed';
}

async function receive(a) {
  let cfg = loadConfig();
  if (cfg.relay_role !== 'verifier') throw new RelayError('this node is registered as ' + cfg.relay_role + ', not as the verifier');
  // both come from this side: the identity this verifier trusts, and where its private intake lives
  const trustFingerprint = a['trust-fingerprint'] ?? cfg.trust_fingerprint;
  if (!trustFingerprint || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(trustFingerprint)) throw new RelayError('--trust-fingerprint SHA256:... is required: the signing identity this verifier trusts');
  const intakeDir = checkedIntakeDir(a['intake-dir'] ?? cfg.intake_dir ?? '');
  if (cfg.trust_fingerprint !== trustFingerprint || cfg.intake_dir !== intakeDir) { cfg = { ...cfg, trust_fingerprint: trustFingerprint, intake_dir: intakeDir }; saveConfig(cfg); }
  say('this verifier trusts ' + trustFingerprint + ' and takes deliveries into ' + intakeDir);
  const deadline = Date.now() + Math.max(0, Number(a.wait ?? 0)) * 60000;
  for (;;) {
    const inbox = await must(cfg, 'inbox');
    if (inbox.artifacts.length) {
      let refused = 0;
      for (const art of inbox.artifacts) if ((await receiveOne(cfg, art, trustFingerprint, intakeDir)) === 'refused') refused++;
      return refused ? 4 : 0;
    }
    if (Date.now() >= deadline) { say('nothing to receive'); return 3; }
    say('nothing yet; asking again in 20 s');
    await new Promise((r) => setTimeout(r, 20000));
  }
}

async function status(a) {
  const cfg = loadConfig();
  const id = a.artifact ?? cfg.last_artifact_id;
  if (id) return (await showStatus(cfg, id)).ok ? 0 : 5;
  if (cfg.relay_role !== 'verifier') throw new RelayError('--artifact <id> is required');
  const inbox = await must(cfg, 'inbox');
  if (!inbox.artifacts.length) say('the inbox is empty');
  for (const art of inbox.artifacts) say(`${art.artifact_id}  ${art.delivery_state.padEnd(9)}  ${art.archive_name}  from ${art.sender_node_id}  expires ${art.expires_at}`);
  return 0;
}

function verifyLocal(a) {
  const t = readTriple(resolve(need(a, 'archive')));
  const v = verifyBundle({ archiveName: t.archive.name, archive: t.archive.bytes, sha256File: t.sha256.bytes, signatureFile: t.signature.bytes,
    trustFingerprint: need(a, 'trust-fingerprint'), candidateSha: need(a, 'candidate') });
  say('bundle ' + t.archive.name + '  sha256 ' + t.archive.sha256);
  printChecks(v);
  say(v.ok ? 'VERIFIED (nothing was extracted or sent)' : 'REFUSED: ' + v.failed);
  return v.ok ? 0 : 4;
}

// exit codes: 0 done, 2 stopped on this node (usage, settings, a bundle that is not fit to send), 3 nothing to receive,
// 4 a bundle was refused, 5 the relay refused or could not be reached. The code is set, never forced: the process ends when its
// connections have closed (forcing an exit while one is closing crashes Node on Windows and loses the code).
const COMMANDS = { keygen, pubkey, registration, selfcheck, send, receive, status, 'verify-local': verifyLocal };
try {
  const command = COMMANDS[process.argv[2]];
  if (!command) {
    say('usage: relay.mjs keygen | pubkey | registration | selfcheck | send | receive | status | verify-local   (see the head of this file)');
    process.exitCode = 2;
  } else {
    process.exitCode = (await command(args(process.argv.slice(3)))) ?? 0;
  }
} catch (e) {
  if (!(e instanceof RelayError)) throw e;
  say('STOPPED: ' + e.message);
  process.exitCode = /the relay (refused|could not be reached|handed over)/.test(e.message) ? 5 : 2;
}

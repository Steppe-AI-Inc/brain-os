// MUTATION PROOF for the boundary and the node command: each mutant removes one rule from a copy of the Edge Function's code or of
// relay/; the end-to-end run (the function inside Node) must go red for it. A mutant that cannot be applied, that breaks the code
// outright, or that the run does not notice fails this proof.
//   RELAY_TEST_MODULES=<node_modules> node test/e2e_mutation.mjs [F01 C05 ...]
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTION = 'supabase/functions/factory-artifact-relay/relay.ts';
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

// [id, file, what, find, replace, (find, replace)...]
const MUTANTS = [
  // the boundary
  ['F01', FUNCTION, 'the request signature is not checked', `  if (!signed) return no(401, "not_authenticated");\n`, ``],
  ['F02', FUNCTION, 'bytes other than the declared ones are stored', `if (bytes.length !== result.size || (await sha256Hex(bytes)) !== result.sha256) {\n      await finish("failed");`, `if (false) {\n      await finish("failed");`],
  ['F03', FUNCTION, 'bytes that are no longer the recorded ones are handed over', `    if (bytes.length !== result.size || (await sha256Hex(bytes)) !== result.sha256) return refuse(502, "stored_object_mismatch");\n`, ``],
  ['F04', FUNCTION, 'a secret key is sent as a bearer token', `return key.split(".").length === 3 ? { apikey: key, authorization: "Bearer " + key, ...extra } : { apikey: key, ...extra };`, `return { apikey: key, authorization: "Bearer " + key, ...extra };`],
  ['F05', FUNCTION, 'the other injected key is never tried', `ctx.chosen = (ctx.chosen + 1) % ctx.keys.length;`, `ctx.chosen = ctx.chosen + 0;`],
  ['F06', FUNCTION, 'the signed request is not kept with the receipt', `body: auth.action !== "upload" && auth.bodyText.length <= 8192 ? auth.bodyText : null,`, `body: null,`],
  ['F07', FUNCTION, 'the node\'s nonce is not what the database sees (a replay passes)', `    nonce: auth.nonce,\n`, `    nonce: crypto.randomUUID().replace(/-/g, ""),\n`],
  ['F08', FUNCTION, 'any method is accepted', `  if (req.method !== "POST") return no(405, "method_not_allowed");\n`, ``],
  ['F09', FUNCTION, 'a body of any size is accepted', `  if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) return no(413, "too_large");\n`, ``, `  if (body.length > MAX_BODY_BYTES) return no(413, "too_large");\n`, ``],
  ['F10', FUNCTION, 'expired objects are never deleted', `  await purgeExpired(ctx, purge);\n`, ``],
  ['F11', FUNCTION, 'a purge is recorded without deleting the objects', `if (paths.length === 0 || (await removeObjects(ctx, paths as string[]))) done.push(id);`, `if (true) done.push(id);`],
  ['F12', FUNCTION, 'what the function throws reaches the caller', `      return refuse(500, "relay_error");\n    }\n  };`, `      return refuse(500, "relay_error", String(e));\n    }\n  };`],
  ['F13', FUNCTION, 'any object already on the path is adopted', `stored = there !== null && there.length === result.size && (await sha256Hex(there)) === result.sha256 ? "stored" : "failed";`, `stored = "stored";`],
  // both ends must agree on what is signed, so a mutant of the signed message fails every honest request: it shows only that the
  // run depends on the body being part of it (E21 holds the case of a body changed after it was signed)
  ['F14', FUNCTION, 'the body is not part of what the function checks the signature over', `signedMessage(action, nodeId, ts, nonce, bodySha256));\n  } catch (_e) {`, `signedMessage(action, nodeId, ts, nonce, ""));\n  } catch (_e) {`],
  // the node command
  ['C01', 'relay/relay.mjs', 'a bundle that failed its checks is extracted', `  if (!v.ok) {\n    const failed = v.checks.at(-1);`, `  if (false) {\n    const failed = v.checks.at(-1);`],
  ['C02', 'relay/relay.mjs', 'the relay record is not held against the bundle', `    trustFingerprint, candidateSha: art.candidate_sha, record: art });`, `    trustFingerprint, candidateSha: art.candidate_sha });`],
  ['C03', 'relay/relay.mjs', 'the verifier trusts the signer the record names', `    trustFingerprint, candidateSha: art.candidate_sha, record: art });`, `    trustFingerprint: art.sender_signing_fingerprint, candidateSha: art.candidate_sha, record: art });`],
  ['C04', 'relay/relay.mjs', 'an intake directory inside a git work tree is accepted', `if (existsSync(join(d, '.git'))) throw new RelayError(`, `if (false) throw new RelayError(`],
  ['C05', 'relay/relay.mjs', 'an intake directory inside a cloud-synced folder is accepted', `if (/^(onedrive.*|google ?drive.*|my drive|dropbox.*|icloud ?drive|box|box sync)$/i.test(part)) throw new RelayError(`, `if (false) throw new RelayError(`],
  ['C06', 'relay/relay.mjs', 'the sender sends a bundle the verifier would refuse', `  if (!v.ok) throw new RelayError('the bundle would be refused by the recipient (' + v.failed + '); nothing was sent');\n`, ``],
  ['C07', 'relay/relay.mjs', 'the sender ignores the signing identity it was told to expect', `if (a.fingerprint && a.fingerprint !== sig.fingerprint) throw new RelayError(`, `if (false) throw new RelayError(`],
  ['C08', 'relay/relay.mjs', 'the reader does not check that receipts are chained', `const linked = r.prev_hash === prev && r.hash === hash;`, `const linked = true;`],
  ['C09', 'relay/relay.mjs', 'the reader does not check the signature on a receipt', `signed = good && bodyOk ? `, `signed = true ? `, `chain = chain && good && bodyOk;`, `chain = chain && true;`],
  ['C10', 'relay/relay.mjs', 'the verifier needs no trusted fingerprint of its own', `if (!trustFingerprint || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(trustFingerprint)) throw new RelayError(`, `if (false) throw new RelayError(`],
  ['C11', 'relay/lib/client.mjs', 'a relay address that is not https is accepted', `  if (u.protocol !== 'https:' && !loopback) throw new RelayError('the relay URL must be https');\n`, ``],
  ['C12', 'relay/lib/client.mjs', 'a node\'s key can be made again over the old one', `if (existsSync(keyPath()) || existsSync(configPath())) throw new RelayError(`, `if (false) throw new RelayError(`, `{ mode: 0o600, flag: 'wx' }`, `{ mode: 0o600 }`],
];

const only = process.argv.slice(2).filter((a) => /^[FC]\d+$/.test(a));
const tmp = mkdtempSync(join(tmpdir(), 'relay-mut-'));
const e2e = (env) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'test', 'e2e.mjs'), '--no-deno'], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 400000 });
  const out = r.stdout ?? '';
  const red = [...out.matchAll(/^FAIL (E\d+)/gm)].map((m) => m[1]);
  const summed = /artifact relay end to end \(WITHOUT the Deno rows\): \d+\/\d+ OK/.test(out);
  // judged: the run reached its summary, or it judged rows (some OK, at least one red) before the mutant stopped it
  return { judged: summed || (red.length > 0 && /^OK   E\d+/m.test(out)), stopped: !summed, red,
    err: (out + (r.stderr ?? '')).split('\n').find((l) => /crashed|SyntaxError|TypeError|ReferenceError/.test(l)) ?? '' };
};

let killed = 0, bad = 0;
try {
  const control = e2e({});
  const controlOk = control.judged && control.red.length === 0;
  console.log((controlOk ? 'OK   ' : 'FAIL ') + 'control: the unmutated code passes' + (controlOk ? '' : ' - ' + control.red.join(' ') + ' ' + control.err));
  if (!controlOk) bad++;
  for (const [id, file, what, ...swaps] of MUTANTS) {
    if (only.length && !only.includes(id)) continue;
    let text = read(file), applied = true;
    for (let i = 0; i < swaps.length; i += 2) {
      if (text.split(swaps[i]).length !== 2) { applied = false; console.log('FAIL ' + id + ' NOT APPLIED - ' + what + ' - expected exactly one "' + swaps[i].slice(0, 60).replace(/\n/g, ' ') + '"'); break; }
      text = text.replace(swaps[i], () => swaps[i + 1]);
    }
    if (!applied) { bad++; continue; }
    let env;
    if (file === FUNCTION) {
      const f = join(tmp, id + '-relay.ts'); writeFileSync(f, text); env = { RELAY_FUNCTION_FILE: f };
    } else {
      const dir = join(tmp, id + '-relay'); cpSync(join(ROOT, 'relay'), dir, { recursive: true });
      writeFileSync(join(dir, file.replace(/^relay\//, '')), text); env = { RELAY_CLI_DIR: dir };
    }
    const r = e2e(env);
    if (!r.judged) { bad++; console.log('FAIL ' + id + ' BROKE THE RUN (not a judgement) - ' + what + ' - ' + r.err.slice(0, 160)); continue; }
    if (r.red.length) { killed++; console.log('OK   ' + id + ' killed - ' + what + ' - by ' + r.red.join(' ') + (r.stopped ? ' (the run then stopped)' : '')); }
    else { bad++; console.log('FAIL ' + id + ' SURVIVED - ' + what); }
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
const total = only.length ? only.length : MUTANTS.length;
console.log('\nartifact relay end-to-end mutation proof: ' + killed + '/' + total + ' killed' + (bad ? '; ' + bad + ' NOT KILLED, NOT APPLIED OR BROKEN' : ''));
process.exit(bad ? 1 : 0);

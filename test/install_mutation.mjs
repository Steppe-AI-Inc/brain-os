// MUTATION PROOF for the installer: each mutant removes one of its checks from a copy of relay/install.mjs; the installer
// acceptance must go red for it.
//   RELAY_TEST_MODULES=<node_modules> node test/install_mutation.mjs [K01 K07 ...]
import { applySwaps, mutationProof, runNode } from './classify.mjs';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'relay', 'install.mjs'), 'utf8').replace(/\r\n/g, '\n');

// [id, what, find, replace, (find, replace)...]
const MUTANTS = [
  ['K01', 'the function is deployed with JWT verification on (the installer\'s own check must stop it)', `'--no-verify-jwt', '--use-api', '--workdir', staging]`, `'--use-api', '--workdir', staging]`],
  ['K02', 'the function is deployed with JWT verification on, and the installer does not look',
    `'--no-verify-jwt', '--use-api', '--workdir', staging]`, `'--use-api', '--workdir', staging]`, `    if (deployed.verify_jwt !== false) throw new Stop(`, `    if (false) throw new Stop(`],
  ['K03', 'a verifier registration signed by anyone is accepted', `if (!v.ok || v.fingerprint !== S.directorFingerprint) throw new Stop('the verifier registration commit '`, `if (!v.ok) throw new Stop('the verifier registration commit '`],
  ['K04', 'a verifier registration made on another commit is accepted', `if (v.parents.length !== 1 || v.parents[0] !== head) throw new Stop(`, `if (false) throw new Stop(`],
  ['K05', 'a verifier registration commit may change other files', `if (git('diff-tree', '--no-commit-id', '--name-status', '-r', head, tip) !== 'A\\tregistrations/verifier.json') throw new Stop(`, `if (false) throw new Stop(`],
  ['K06', 'a registration with other fields or another role is accepted',
    `|| Object.keys(j).sort().join() !== 'node_id,public_key,relay,relay_role' || j.relay !== 'artifact-relay/v0'\n      || j.relay_role !== 'verifier' ||`, `||`],
  ['K07', 'a Director record signed by anyone is accepted', `if (!d.ok || d.fingerprint !== S.directorFingerprint) throw new Stop('the Director branch tip '`, `if (!d.ok) throw new Stop('the Director branch tip '`],
  ['K08', 'a Director record of any commit is accepted', `if (events.some((e) => typeof e?.event === 'string' && e.event.includes(head))) record = tip;`, `if (events.length > 0) record = tip;`],
  ['K09', 'the install goes ahead without the Director\'s record', `    if (!record && !PLAN) {`, `    if (false) {`],
  ['K10', 'a checkout with uncommitted changes is installed from', `  if (git('status', '--porcelain') !== '') throw new Stop(`, `  if (false) throw new Stop(`],
  ['K11', 'a commit signed by anyone is installed from', `if (!signer.ok || signer.fingerprint !== S.implementerFingerprint) throw new Stop(`, `if (false) throw new Stop(`],
  ['K12', 'a file that is not the one the manifest lists is applied',
    `    if (!existsSync(join(S.root, m.file)) || sha256(readFileSync(join(S.root, m.file))) !== m.sha256 || sha256(gitRaw('show', head + ':' + m.file)) !== m.sha256) {`, `    if (false) {`],
  ['K13', 'the pre-check is not judged', `      if (rows.length !== 8 || bad.length) throw new Stop('the pre-check is not all ok: '`, `      if (false) throw new Stop('the pre-check is not all ok: '`],
  ['K14', 'the post-check is not judged', `    if (post.length !== 7 || postBad.length) throw new Stop('the post-check is not all ok: '`, `    if (false) throw new Stop('the post-check is not all ok: '`],
  ['K15', 'a test may point the installer at any address', `  if (api.protocol !== 'http:' || api.hostname !== '127.0.0.1' || relay.hostname !== '127.0.0.1' || !/^test-[a-z0-9]{6,20}$/.test(t.project)) {`, `  if (false) {`],
  ['K16', 'the function is deployed with a registry of the sender only', `      writeFileSync(join(staging, FUNCTION_DIR, 'registry.ts'), registryText);`, `      writeFileSync(join(staging, FUNCTION_DIR, 'registry.ts'), renderRegistry([sender]));`],
  ['K17', 'the removal goes ahead while the bucket holds objects', `      if (objects > 0 && !flags.has('--leave-bucket')) {`, `      if (false) {`],
  ['K18', 'other registrations than the two of this install are accepted', `    } else if (same(have) === same(nodes)) {`, `    } else if (true) {`],
  ['K19', 'the selfcheck is not judged',
    `    if (!(last.status === 200 && last.body.ok === true && last.body.relay_role === 'sender' && last.body.bucket === 'private' && last.body.sender_registered && last.body.verifier_registered)) {`, `    if (false) {`,
    `'--no-verify-jwt', '--use-api', '--workdir', staging]`, `'--use-api', '--workdir', staging]`, `    if (deployed.verify_jwt !== false) throw new Stop(`, `    if (false) throw new Stop(`],
  ['K20', 'the token is printed', `  say(\`ARTIFACT RELAY V0 - \${UNINSTALL ? 'removal from' : PLAN ? 'plan for' : 'install on'} project`, `  say('token ' + token); say(\`ARTIFACT RELAY V0 - \${UNINSTALL ? 'removal from' : PLAN ? 'plan for' : 'install on'} project`],
  ['K21', 'the installer asks the management API for the project\'s keys',
    `    const state = await readState();\n    // 4 pre-check`, `    const state = await readState();\n    try { await api('GET', \`/v1/projects/\${S.project}/api-keys\`); } catch { /* ignored */ }\n    // 4 pre-check`],
];

const tmp = mkdtempSync(join(tmpdir(), 'relay-instmut-'));
let code = 1;
try {
  code = mutationProof({
    name: 'artifact relay install mutation proof',
    only: process.argv.slice(2).filter((a) => /^K\d+$/.test(a)),
    mutants: MUTANTS,
    mutate: ([id, , ...swaps]) => {
      const { text, missing } = applySwaps(SRC, swaps);
      if (text === null) return { verdict: 'NOT APPLIED', reason: 'expected exactly one "' + missing.slice(0, 60).replace(/\n/g, ' ') + '"' };
      const file = join(tmp, id + '-install.mjs');
      writeFileSync(file, text);
      return { file, env: { RELAY_INSTALLER_FILE: file } };
    },
    accept: (env) => runNode(join(ROOT, 'test', 'install_acceptance.mjs'), [], env, 560000),
    shape: { rowId: 'I\\d+\\w?', summary: /^artifact relay install acceptance: \d+\/\d+ OK/m },
  });
} finally { rmSync(tmp, { recursive: true, force: true }); }
process.exit(code);

// Every proof of the relay, one after another, each to its own log, with one summary line per proof.
//   RELAY_TEST_MODULES=<node_modules> node test/all.mjs [--mutation] [--no-deno] [--logs <dir>] [--frozen]
// A proof is PASS only when its own summary line says every row is OK (or every mutant killed) and it exits 0.
//
// --frozen makes the pass evidence for ONE commit: it refuses a tree with uncommitted changes, names the commit and who signed it
// on the first line of every log, checks that every listed file is the committed blob, and checks at the end that the commit and
// the tree are still the ones it started with.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { commitSigner } from '../relay/lib/gitsig.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const logs = arg('--logs');
if (logs) mkdirSync(logs, { recursive: true });
const noDeno = process.argv.includes('--no-deno'), frozen = process.argv.includes('--frozen');
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
const where = () => ({ commit: git('rev-parse', 'HEAD').toString().trim(), tree: git('rev-parse', 'HEAD^{tree}').toString().trim(), changes: git('status', '--porcelain').toString().trim().split('\n').filter(Boolean).length });

const start = where();
const signer = commitSigner(git('cat-file', 'commit', start.commit));
const stamp = `relay commit ${start.commit} (tree ${start.tree}; ${signer.ok ? 'signed by ' + signer.fingerprint : 'NOT SIGNED'}; ${start.changes ? start.changes + ' UNCOMMITTED CHANGES' : 'working tree clean'})`;
console.log(stamp);
if (frozen && start.changes) { console.log('REFUSED: --frozen is evidence for a commit, and this tree has uncommitted changes'); process.exit(2); }
if (!frozen) console.log('(not --frozen: these results are not evidence for a commit)');

const PROOFS = [
  ['manifest', ['tools/manifest.mjs', '--check'], /^OK   MANIFEST\.sha256 matches/m],
  ['harness_proof', ['test/harness_proof.mjs'], /^artifact relay harness proof: (\d+)\/\1 OK$/m],
  ['sql_acceptance', ['test/sql_acceptance.mjs'], /^artifact relay sql acceptance: (\d+)\/\1 OK$/m],
  ['bundle_acceptance', ['test/bundle_acceptance.mjs'], /^artifact relay bundle acceptance: (\d+)\/\1 OK$/m],
  ['boundary_proof', ['test/boundary_proof.mjs'], /^artifact relay boundary proof: (\d+)\/\1 OK$/m],
  ['e2e', ['test/e2e.mjs', ...(noDeno ? ['--no-deno'] : [])], noDeno ? /^artifact relay end to end \(WITHOUT the Deno rows\): (\d+)\/\1 OK$/m : /^artifact relay end to end: (\d+)\/\1 OK$/m],
  ['install_acceptance', ['test/install_acceptance.mjs'], /^artifact relay install acceptance: (\d+)\/\1 OK$/m],
  ...(process.argv.includes('--mutation') ? [
    ['sql_mutation', ['test/sql_mutation.mjs'], /^artifact relay sql mutation proof: (\d+)\/\1 killed$/m],
    ['bundle_mutation', ['test/bundle_mutation.mjs'], /^artifact relay bundle mutation proof: (\d+)\/\1 killed$/m],
    ['boundary_mutation', ['test/boundary_mutation.mjs'], /^artifact relay boundary mutation proof: (\d+)\/\1 killed$/m],
    ['e2e_mutation', ['test/e2e_mutation.mjs'], /^artifact relay end-to-end mutation proof: (\d+)\/\1 killed$/m],
    ['install_mutation', ['test/install_mutation.mjs'], /^artifact relay install mutation proof: (\d+)\/\1 killed$/m],
  ] : []),
];

let failed = 0;
const line = (ok, name, seconds, summary) => console.log((ok ? 'PASS ' : 'FAIL ') + name.padEnd(18) + String(seconds).padStart(5) + ' s  ' + summary);

// the committed bytes: every file MANIFEST.sha256 lists is that blob in this commit
{
  const listed = readFileSync(join(ROOT, 'MANIFEST.sha256'), 'utf8').replace(/\r\n/g, '\n').trim().split('\n').map((l) => [l.slice(0, 64), l.slice(66)]);
  const wrong = listed.filter(([sha, file]) => { try { return createHash('sha256').update(git('show', start.commit + ':' + file)).digest('hex') !== sha; } catch { return true; } }).map(([, f]) => f);
  const ok = listed.length > 0 && wrong.length === 0;
  if (!ok) failed++;
  const summary = ok ? `committed bytes: the ${listed.length} files MANIFEST.sha256 lists are the blobs of this commit` : 'committed bytes: NOT the blobs of this commit: ' + wrong.join(', ');
  if (logs) writeFileSync(join(logs, 'committed_bytes.log'), stamp + '\n' + summary + '\n');
  line(ok, 'committed_bytes', 0, summary);
}

for (const [name, args, pass] of PROOFS) {
  const started = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? '') + (r.stderr ? '\n--- stderr\n' + r.stderr : '');
  if (logs) writeFileSync(join(logs, name + '.log'), stamp + '\n' + out + '\nexit=' + r.status + '\n');
  const summary = (r.stdout ?? '').trim().split('\n').filter((l) => /^artifact relay|MANIFEST/.test(l)).at(-1) ?? '(no summary line)';
  const ok = r.status === 0 && pass.test(r.stdout ?? '');
  if (!ok) failed++;
  line(ok, name, Math.round((Date.now() - started) / 1000), summary);
  if (!ok) for (const l of (r.stdout ?? '').split('\n').filter((x) => /^FAIL /.test(x)).slice(0, 12)) console.log('       ' + l.slice(0, 220));
}

const end = where();
const still = end.commit === start.commit && end.tree === start.tree && end.changes === start.changes;
if (!still) failed++;
console.log((still ? 'PASS ' : 'FAIL ') + 'unchanged'.padEnd(18) + '    0 s  ' + (still ? 'the commit and the tree are the ones the pass started with' : 'THE COMMIT OR THE TREE CHANGED DURING THE PASS'));
const total = PROOFS.length + 2;
console.log('\nartifact relay: ' + (total - failed) + '/' + total + ' proofs PASS' + (noDeno ? ' (the Deno rows were NOT run)' : '') + (failed ? '; ' + failed + ' FAILED' : '') + ' at ' + start.commit + (frozen ? '' : ' (NOT --frozen)'));
process.exit(failed ? 1 : 0);

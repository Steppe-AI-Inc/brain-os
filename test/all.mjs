// Every proof of the relay, one after another, each to its own log, with one summary line per proof.
//   RELAY_TEST_MODULES=<node_modules> node test/all.mjs [--mutation] [--no-deno] [--logs <dir>]
// A proof is PASS only when its own summary line says every row is OK (or every mutant killed) and it exits 0.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const logs = arg('--logs');
if (logs) mkdirSync(logs, { recursive: true });
const noDeno = process.argv.includes('--no-deno');

const PROOFS = [
  ['manifest', ['tools/manifest.mjs', '--check'], /^OK   MANIFEST\.sha256 matches/m],
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
for (const [name, args, pass] of PROOFS) {
  const started = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? '') + (r.stderr ? '\n--- stderr\n' + r.stderr : '');
  if (logs) writeFileSync(join(logs, name + '.log'), out + '\nexit=' + r.status + '\n');
  const summary = (r.stdout ?? '').trim().split('\n').filter((l) => /^artifact relay|MANIFEST/.test(l)).at(-1) ?? '(no summary line)';
  const ok = r.status === 0 && pass.test(r.stdout ?? '');
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name.padEnd(18) + String(Math.round((Date.now() - started) / 1000)).padStart(5) + ' s  ' + summary);
  if (!ok) for (const l of (r.stdout ?? '').split('\n').filter((x) => /^FAIL /.test(x)).slice(0, 12)) console.log('       ' + l.slice(0, 220));
}
console.log('\nartifact relay: ' + (PROOFS.length - failed) + '/' + PROOFS.length + ' proofs PASS' + (noDeno ? ' (the Deno rows were NOT run)' : '') + (failed ? '; ' + failed + ' FAILED' : ''));
process.exit(failed ? 1 : 0);

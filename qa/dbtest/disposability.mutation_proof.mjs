// MUTATION PROOF for qa/dbtest/disposability.mjs.
//
// Each mutation disables exactly one guard in a COPY of the module; the adversarial suite, pointed at
// the copy, must FAIL. A guard whose removal leaves the suite green is decoration.
//
// Reporter-agnostic on purpose: `node --test` prints `ℹ fail N` on a TTY and TAP `# fail N` on CI.
// The first version of this proof lived inline in the workflow and matched only the TTY form, so on
// the runner every guard read as "NOT DETECTED" and the job went red for the wrong reason. Exit
// status is not evidence, and neither is a reporter format nobody checked on the target machine.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE = join(HERE, 'disposability.mjs');
const SUITE = join(HERE, 'disposability.regression.test.mjs');
const orig = readFileSync(MODULE, 'utf8');

const MUTATIONS = {
  MANAGED_SCHEMA_GUARD: ['if (evidence.managedSchemas.length > 0) {', 'if (false) {'],
  SUPABASE_ROLE_GUARD:  ['if (evidence.supabaseRoles.length > 0) {', 'if (false) {'],
  PUBLIC_TABLES_GUARD:  ['if (evidence.publicTables > 0) {', 'if (false) {'],
  EMPTY_SENTINEL_GUARD: ['if (row.rows.length > 0) {', 'if (true) {'],
  IDENTIFICATION_GUARD: ["throw new NotDisposableError('Could not read current_database()",
    "return { disposable: true, route: 'pristine', evidence }; throw new NotDisposableError('Could not read current_database()"],
};

// The suite imports './disposability.mjs' relative to itself, so the mutated module must sit next
// to a copy of the suite. Build that pair in a temp dir per mutation.
function failuresWhen(mutated) {
  const dir = mkdtempSync(join(tmpdir(), 'disp-mut-'));
  try {
    writeFileSync(join(dir, 'disposability.mjs'), mutated);
    copyFileSync(SUITE, join(dir, 'disposability.regression.test.mjs'));
    const r = spawnSync(process.execPath, ['--test', join(dir, 'disposability.regression.test.mjs')], { encoding: 'utf8', timeout: 120000 });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = out.match(/(?:ℹ|#) fail (\d+)/);
    if (!m) return { failed: -1, status: r.status, out: out.slice(-400) };
    return { failed: Number(m[1]), status: r.status };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

let ok = true;
for (const [name, [from, to]] of Object.entries(MUTATIONS)) {
  if (orig.split(from).length !== 2) { console.log(name.padEnd(24) + 'ANCHOR NOT UNIQUE — mutation not applied'); ok = false; continue; }
  const r = failuresWhen(orig.replace(from, to));
  const detected = r.failed > 0;
  if (!detected) ok = false;
  console.log(name.padEnd(24) + (detected ? 'LOAD-BEARING — ' + r.failed + ' test(s) fail when disabled'
    : r.failed === -1 ? 'NO SUMMARY PARSED (status ' + r.status + '): ' + r.out : 'NOT DETECTED — the suite passes without this guard'));
}
const ctl = failuresWhen(orig);
console.log('control (unmutated)     ' + (ctl.failed === 0 ? 'suite green' : 'SUITE NOT GREEN: ' + JSON.stringify(ctl)));
if (ctl.failed !== 0) ok = false;
console.log(ok ? 'ALL GUARDS LOAD-BEARING' : 'AT LEAST ONE GUARD IS NOT PROVEN');
process.exit(ok ? 0 : 1);

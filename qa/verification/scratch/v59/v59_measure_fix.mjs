#!/usr/bin/env node
// Swap the PREPARED fix into place, run the whole battery + every v59 instrument, restore the candidate bytes, re-hash.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const IDX = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const orig = readFileSync(IDX); const ORIG = sha(orig);
if (ORIG !== '715246f3be9710b74193529ce9c07d44a6f3ad3739f132b6216ac04e8f519aa9') throw new Error('unexpected candidate bytes');
const fix = readFileSync(resolve(HERE, 'v59_fix.ts'));
const SKIP = new Set(['_gate_extract.mjs', '_authority_test_selfcheck.mjs', 'production_write_authority.regression.test.mjs', 'factory_production_write_inventory.regression.test.mjs', 'architecture_lifecycle_rpc_only_contract.mjs']);
const SUITES = readdirSync(resolve(ROOT, 'qa/scenarios-runner')).filter((f) => f.endsWith('.mjs') && !SKIP.has(f)).map((f) => resolve(ROOT, 'qa/scenarios-runner', f));
SUITES.push(resolve(HERE, 'lifecycle_rpc_only_repaired.mjs'));
const MINE = ['v59_receipt_matrix.mjs', 'v59_intent_attack.mjs', 'v59_lifecycle_attack.mjs', 'v59_chain.mjs', 'v59_belt_vs_v92.mjs', 'v59_machinery.mjs', 'v59_tdz_scan2.mjs'].map((f) => resolve(HERE, f));
const GATES = ['v46', 'v48', 'v49', 'v50', 'v51', 'v52', 'v53', 'v54', 'v55', 'v56', 'v57', 'v58'].map((v) => resolve(ROOT, 'qa/verification/proposed', v + '_regression_additions.mjs'));
const run = (f) => { const r = spawnSync(process.execPath, [f], { cwd: ROOT, encoding: 'utf8', timeout: 300000, env: { ...process.env, SEM_INDEX_SRC: '' } }); return { status: r.status, tail: (r.stdout + r.stderr).trim().split('\n').slice(-3).join(' | ').slice(0, 400) }; };
const out = { battery: {}, mine: {}, gates: {} };
try {
  writeFileSync(IDX, fix);
  console.log('fix in place: ' + sha(readFileSync(IDX)));
  for (const s of SUITES) { const n = s.split(/[\\/]/).pop(); out.battery[n] = run(s); }
  for (const s of MINE) { const n = s.split(/[\\/]/).pop(); out.mine[n] = run(s); console.log(`${out.mine[n].status}  ${n}  ${out.mine[n].tail}`); }
  for (const s of GATES) { const n = s.split(/[\\/]/).pop(); out.gates[n] = run(s); }
} finally { writeFileSync(IDX, orig); }
const end = sha(readFileSync(IDX));
const red = Object.entries(out.battery).filter(([, r]) => r.status !== 0);
console.log(`battery on the fix: ${Object.keys(out.battery).length - red.length}/${Object.keys(out.battery).length} green; red: ${red.map(([n, r]) => n + ' :: ' + r.tail).join('\n  ') || 'none'}`);
console.log(`gates on the fix: ${Object.entries(out.gates).map(([n, r]) => n.replace('_regression_additions.mjs', '') + '=' + r.status).join(' ')}`);
console.log(`index.ts restored: ${end === ORIG ? 'YES ' : 'NO  '}${end}`);
writeFileSync(resolve(HERE, 'measure_fix.json'), JSON.stringify(out, null, 2));
process.exit(end === ORIG ? 0 : 2);

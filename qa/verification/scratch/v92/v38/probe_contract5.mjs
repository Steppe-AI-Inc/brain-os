// Independently mutation-test the NARROWED CONTRACT 5: inject a real top-level const into
// the belt block of a SCRATCH COPY of index.ts (the candidate is never modified) and confirm
// v92_open_regression_contract.mjs actually goes RED. If it stays green, the narrowing hid
// the very thing the contract exists for.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const REAL = resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
const SUITE = resolve(HERE, '../../../scenarios-runner/v92_open_regression_contract.mjs');
const RUN15 = resolve(HERE, '../../../scenarios-runner/run15_defect_closure_contract.mjs');
const src = readFileSync(REAL, 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'v38c5-'));

const run = (label, path) => {
  const r = spawnSync(process.execPath, [SUITE], { encoding: 'utf8', timeout: 180000, env: { ...process.env, SEM_INDEX_SRC: path } });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(\d+) passed, (\d+) failed/);
  console.log(`${label.padEnd(42)} status=${r.status}  ${m ? m[0] : out.trim().split('\n').slice(-1)[0].slice(0, 90)}`);
  return r.status;
};

console.log('=== CONTRACT 5 mutation test (narrowed form) ===');
const baseStatus = run('baseline (unmodified candidate)', REAL);

// M-A: inject a NEW TOP-LEVEL const into the belt block. Must go RED.
const anchorTop = 'const NEGATION_AUX =';
if (!src.includes(anchorTop)) throw new Error('anchor missing');
const topPatched = src.replace(anchorTop, 'const v38InjectedTopLevel = 1;\r\n        const NEGATION_AUX =');
const pTop = join(dir, 'toplevel.ts'); writeFileSync(pTop, topPatched);
const topStatus = run('M-A: new TOP-LEVEL const injected', pTop);

// M-B: inject a new LOCAL inside completionIsNegated. Must stay GREEN.
const anchorLocal = 'let n = -1;';
const localPatched = src.replace(anchorLocal, 'let n = -1;\r\n          const v38InjectedLocal = 1;');
const pLocal = join(dir, 'local.ts'); writeFileSync(pLocal, localPatched);
const localStatus = run('M-B: new LOCAL inside completionIsNegated', pLocal);

console.log('');
console.log('VERDICT:');
console.log('  baseline green ..................... ' + (baseStatus === 0 ? 'YES' : 'NO'));
console.log('  top-level injection turns it RED ... ' + (topStatus !== 0 ? 'YES (contract can still fail for its reason)' : 'NO — NARROWING HID THE HAZARD'));
console.log('  local injection stays GREEN ........ ' + (localStatus === 0 ? 'YES (narrowing works as claimed)' : 'NO — narrowing forbids safe changes'));

// run15 count + D117 invariant
const r15 = spawnSync(process.execPath, [RUN15], { encoding: 'utf8', timeout: 180000, env: { ...process.env, SEM_INDEX_SRC: REAL } });
const o15 = (r15.stdout || '') + (r15.stderr || '');
console.log('');
console.log('run15 status=' + r15.status + '  ' + (o15.match(/(\d+) passed, (\d+) failed/) || ['(no count line)'])[0]);
const d117 = o15.split('\n').filter((l) => /lookahead|lookbehind|D117|whole-span/i.test(l));
for (const l of d117) console.log('   ' + l.trim().slice(0, 130));

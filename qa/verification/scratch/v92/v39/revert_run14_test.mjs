// VERIFIER #39 — judge the run14/D107 harness change and the THREE retargeted pins.
// Reverts run14's fail-loud statement scan back to the OLD character budget IN THE
// WORKING TREE, runs the three verifier pins, and restores run14 byte-identically.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const RUN14 = resolve(ROOT, 'qa/scenarios-runner/run14_defect_closure_contract.mjs');
const INDEX = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const PINS = [
  'qa/verification/scratch/v92/v38/v38_regression_additions.mjs',
  'qa/verification/scratch/v92/v37/v37_regression_additions.mjs',
  'qa/verification/scratch/v92/v32_regression_additions.mjs',
];
const PIN_NAME = /run14\/D107 slices the WHOLE readsAsCompletion statement|V38-C4 readsAsCompletion statement/;

function runPins(label) {
  for (const p of PINS) {
    const r = spawnSync(process.execPath, [resolve(ROOT, p)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const out = (r.stdout || '') + (r.stderr || '');
    const lines = out.split('\n').filter((l) => PIN_NAME.test(l));
    console.log('  ' + label.padEnd(10) + p.split('/').pop().padEnd(32) + 'rc=' + r.status
      + '  pin lines: ' + (lines.length ? lines.map((l) => l.trim().slice(0, 90)).join(' || ') : '(none printed)'));
  }
}

const orig = readFileSync(RUN14, 'utf8');
const origSha = sha(RUN14), idxSha = sha(INDEX);
console.log('run14 sha256 before : ' + origSha);
console.log('index.ts sha256     : ' + idxSha);

console.log('\nBASELINE (candidate run14, fail-loud scan):');
runPins('base');

// --- revert: replace the whole fail-loud scanner body with the historical budget slice.
const a = orig.indexOf("    const BSLASH = String.fromCharCode(92);");
const b = orig.indexOf("    return ['LEGACY_PAST_COMPLETION', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION', 'REFERENCELESS_CONFIRMATION']");
if (a < 0 || b < 0) { console.log('FAIL: could not locate the D107 scanner to revert'); process.exit(1); }
const reverted = orig.slice(0, a)
  + "    const p = src.match(/const readsAsCompletion = [\\s\\S]{0,4000}?;\\r?\\n/);\n"
  + "    if (!p) throw new Error('readsAsCompletion not found');\n"
  + orig.slice(b);
writeFileSync(RUN14, reverted);
console.log('\nREVERTED (historical 4000-char budget restored):');
try {
  const r14 = spawnSync(process.execPath, [RUN14], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  console.log('  run14 itself rc=' + r14.status + ' (budget version still passes on its own: '
    + (r14.status === 0 ? 'YES — which is exactly why the pins are needed' : 'no') + ')');
  runPins('reverted');
} finally {
  writeFileSync(RUN14, orig);
  const after = sha(RUN14);
  console.log('\nrun14 sha256 after restore: ' + after + (after === origSha ? '  ✓ byte-identical' : '  ✗ MISMATCH'));
  console.log('index.ts sha256 after     : ' + sha(INDEX) + (sha(INDEX) === idxSha ? '  ✓ untouched' : '  ✗ MISMATCH'));
  try { console.log('git status (should be clean for run14): ' + (execSync('git status --porcelain qa/scenarios-runner/run14_defect_closure_contract.mjs', { cwd: ROOT }).toString().trim() || '(clean)')); } catch (e) { /* ignore */ }
}

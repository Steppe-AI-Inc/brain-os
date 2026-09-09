// VERIFIER #69 — re-run every sweep / mutation-proof tool the deploy decision rests on (mandate §4).
// Verdicts are read from OUTPUT TEXT and exit code; the candidate sha is asserted after every run.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const REQUIRED = '006a0c3feeb5f2f13b0b99b55684d3d3d667d86d90484672d8d63a1db2c4d610';
const sha = () => createHash('sha256').update(fs.readFileSync(SRC)).digest('hex');
const TOOLS = ['vacuity_sweep', 'vacuity_sweep2', 'mutation_proof_v60_v61', 'vacuity_sweep_extended',
  'v56_mutation_proof', 'v57_mutation_proof', 'v58_mutation_proof', 'v66_mutation_proof', 'v67_mutation_proof', 'v68_mutation_proof'];
fs.mkdirSync('qa/verification/scratch/v69/sweeps', { recursive: true });
const rows = [];
for (const t of TOOLS) {
  let out = '', code = 0;
  try { out = execFileSync(process.execPath, ['qa/verification/scratch/p1/' + t + '.mjs'], { encoding: 'utf8', timeout: 900000, maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { code = typeof e.status === 'number' ? e.status : -1; out = (e.stdout || '') + '\n' + (e.stderr || ''); }
  fs.writeFileSync('qa/verification/scratch/v69/sweeps/' + t + '.log', out);
  const killed = (out.match(/(\d+)\s*(?:\/\s*\d+\s*)?(?:mutants?\s+)?killed/i) || [])[1];
  const survived = (out.match(/(\d+)\s+survived/i) || [])[1];
  const zeroTargets = /\b0\s+(?:mutants|targets|guards)\b/i.test(out);
  const row = { tool: t, exit: code, killed: killed ?? null, survived: survived ?? null, zeroTargets, shaAfter: sha() === REQUIRED, tail: out.trim().split('\n').slice(-3).join(' | ').slice(0, 400) };
  rows.push(row);
  console.log(JSON.stringify(row));
}
fs.writeFileSync('qa/verification/scratch/v69/sweeps/_summary.json', JSON.stringify(rows, null, 1));
console.log('FINAL sha ok:', sha() === REQUIRED);

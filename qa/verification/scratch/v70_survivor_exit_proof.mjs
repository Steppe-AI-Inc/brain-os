#!/usr/bin/env node
// VERIFIER #70 — CLOSES THE STANDING RESIDUAL #68 LEFT OPEN.
//
// mutation_sweep_safety_contract asserts "A SURVIVOR EXITS NON-ZERO" with a SOURCE-PATTERN test that
// accepts one of three regex spellings. A matching-but-unreachable spelling passes it. #68 named the
// stronger form and did not implement it: RUN each tool against a DELIBERATELY-SURVIVING mutant and
// ASSERT THE EXIT CODE.
//
// METHOD. Each tool runs its mutants against a list of SUITES and calls a mutant KILLED when some suite
// goes red. A temporary copy of the tool has its suite list rewritten to point at a stub suite that ALWAYS
// EXITS 0. Every mutant therefore survives. A tool whose survivor gate is real exits NON-ZERO; a tool
// whose gate is unreachable exits 0 and is a FAIL-OPEN HARNESS.
//
// The candidate's index.ts is never written by this proof: the tools copy it into their own mutant
// directory. The sha256 is asserted before and after regardless.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
function repoRoot() { let d = HERE; for (let i = 0; i < 12; i++) { if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d; const up = dirname(d); if (up === d) break; d = up; } throw new Error('root'); }
const ROOT = repoRoot();
const INDEX = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const shaOf = () => createHash('sha256').update(readFileSync(INDEX)).digest('hex');
const SHA_BEFORE = shaOf();

const TMP = resolve(ROOT, 'qa/verification/scratch/v70_survivor_tmp');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
// A stub "suite" that is always green: every mutant run against it survives.
const STUB = join(TMP, 'always_green_suite.mjs');
writeFileSync(STUB, 'console.log("stub: 1 passed, 0 failed");\nprocess.exit(0);\n');

const TOOLS = ['v56_mutation_proof.mjs', 'v57_mutation_proof.mjs', 'v58_mutation_proof.mjs',
  'v66_mutation_proof.mjs', 'v67_mutation_proof.mjs', 'v68_mutation_proof.mjs',
  'vacuity_sweep.mjs', 'vacuity_sweep2.mjs', 'vacuity_sweep_extended.mjs'];

let pass = 0; const failures = [];
const check = (n, c, d) => { if (c) { pass++; console.log('OK   ' + n); } else { failures.push(n + (d ? '\n       ' + d : '')); console.log('FAIL ' + n); } };

for (const t of TOOLS) {
  const p = resolve(ROOT, 'qa/verification/scratch/p1', t);
  if (!existsSync(p)) { check(t + ': tool present', false, 'not found at ' + p); continue; }
  let src = readFileSync(p, 'utf8');
  // Redirect every suite path this tool runs to the always-green stub. Two shapes are used in-tree:
  // a `const SUITES = [...]` array of repo-relative paths, and inline `qa/scenarios-runner/*.mjs` strings.
  const before = src;
  src = src.replace(/'qa\/scenarios-runner\/[A-Za-z0-9_.-]+\.mjs'/g, JSON.stringify(STUB.replace(/\\/g, '/')));
  src = src.replace(/"qa\/scenarios-runner\/[A-Za-z0-9_.-]+\.mjs"/g, JSON.stringify(STUB.replace(/\\/g, '/')));
  if (src === before) { check(t + ': the suite list could be redirected', false, 'no qa/scenarios-runner suite path found to redirect — this proof cannot measure this tool'); continue; }
  // resolve(ROOT, <abs>) returns <abs>, so the tools' own path handling still works.
  const mp = join(TMP, 'survivor_' + t);
  writeFileSync(mp, src);
  const r = spawnSync(process.execPath, [mp], { encoding: 'utf8', cwd: ROOT, timeout: 900000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const reportedSurvivors = /surviv/i.test(out);
  check(`${t}: A DELIBERATE SURVIVOR EXITS NON-ZERO (real run, not a source pattern)`,
    r.status !== 0,
    `exit=${r.status}; survivors mentioned in output: ${reportedSurvivors}\n       tail: ` + out.trim().split('\n').slice(-4).join(' | '));
}

const SHA_AFTER = shaOf();
check('index.ts is byte-identical after the proof', SHA_BEFORE === SHA_AFTER, SHA_BEFORE + ' -> ' + SHA_AFTER);
rmSync(TMP, { recursive: true, force: true });

console.log(`\nv70_survivor_exit_proof: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log(' - ' + f); process.exit(1); }

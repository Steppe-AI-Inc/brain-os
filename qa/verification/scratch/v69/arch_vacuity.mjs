// VERIFIER #69 — STEP 3: are the architecture_* contracts VACUOUS? Each mutation below breaks a property
// the contract claims to hold. A mutation that no suite catches is a contract that proves nothing.
// index.ts is NEVER written: every mutant goes to a scratch file and the suite is pointed at it with
// SEM_INDEX_SRC. The candidate sha is asserted after every run.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const REQUIRED = '006a0c3feeb5f2f13b0b99b55684d3d3d667d86d90484672d8d63a1db2c4d610';
const sha = () => createHash('sha256').update(fs.readFileSync(SRC)).digest('hex');
if (sha() !== REQUIRED) { console.error('candidate sha mismatch before start'); process.exit(2); }
const base = fs.readFileSync(SRC, 'utf8');
const DIR = 'qa/verification/scratch/v69/mutants';
fs.mkdirSync(DIR, { recursive: true });

const MUTANTS = [
  { id: 'A1', why: 'the never-silent receipt block is deleted',
    find: /const receiptPrefix = /, repl: 'const receiptPrefix = ((x) => "")(' ,
    suites: ['architecture_final_claim_contract.mjs'] },
  { id: 'A2', why: 'the pendingAction exemption is restored (a trailing question exempts the claim)',
    find: /const claimsPastCompletionWithNoGrounding = /, repl: 'const claimsPastCompletionWithNoGrounding = !result.pendingAction && ',
    suites: ['architecture_final_claim_contract.mjs', 'structured_claim_verification.mjs'] },
  { id: 'A3', why: 'an envelope is dropped from context.collections',
    find: /\n    memories: \{ shown: packMemories\.length/, repl: '\n    _removedMemories: { shown: packMemories.length',
    suites: ['architecture_collection_envelope_contract.mjs'] },
  { id: 'A4', why: 'a collection total is derived from the array length instead of an exact count',
    find: /conversationHistory: \{ shown: \(conversationRowsChronological \|\| \[\]\)\.length, total: totalPriorTurns,/,
    repl: 'conversationHistory: { shown: (conversationRowsChronological || []).length, total: (conversationRowsChronological || []).length,',
    suites: ['architecture_collection_envelope_contract.mjs'] },
  { id: 'A5', why: 'the minimum-safe-context post-trim assertion is removed',
    find: /throw new Error\('context budget trimmed the minimum safe context — refusing to build this turn'\);/,
    repl: '{ /* assertion removed */ }', suites: ['architecture_context_budget_contract.mjs'] },
  { id: 'A6', why: 'TRIM_ORDER is allowed to name a protected key',
    find: /if \(MINIMUM_SAFE_CONTEXT\.includes\(key\)\) throw new Error\('TRIM_ORDER names a minimum-safe-context key: ' \+ key\);/,
    repl: 'if (false) { /* guard removed */ }', suites: ['architecture_context_budget_contract.mjs'] },
];

const rows = [];
for (const m of MUTANTS) {
  const hit = m.find.test(base);
  const mutated = base.replace(m.find, m.repl);
  const applied = hit && mutated !== base;
  const file = DIR + '/' + m.id + '.ts';
  fs.writeFileSync(file, mutated);
  const caught = [];
  for (const s of m.suites) {
    let code = 0;
    try { execFileSync(process.execPath, ['qa/scenarios-runner/' + s], { env: { ...process.env, SEM_INDEX_SRC: file }, encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { code = typeof e.status === 'number' ? e.status : -1; }
    if (code !== 0) caught.push(s);
  }
  const verdict = !applied ? 'HARNESS FAILURE — MUTATION DID NOT APPLY' : caught.length ? 'KILLED by ' + caught.join(', ') : 'SURVIVED';
  rows.push({ id: m.id, why: m.why, applied, verdict });
  console.log(verdict.padEnd(52) + m.id + '  ' + m.why);
  if (sha() !== REQUIRED) { console.error('CANDIDATE SHA CHANGED DURING THE SWEEP — abort'); process.exit(2); }
}
fs.writeFileSync('qa/verification/scratch/v69/arch_vacuity.json', JSON.stringify(rows, null, 1));
const bad = rows.filter((r) => r.verdict !== 'KILLED' && !r.verdict.startsWith('KILLED'));
console.log('\narch vacuity: ' + (rows.length - bad.length) + ' killed, ' + bad.length + ' not killed');
console.log('candidate sha unchanged: ' + (sha() === REQUIRED));
if (bad.length) process.exit(1);

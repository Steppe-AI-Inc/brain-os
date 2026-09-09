// VERIFIER #69 — STEP 3, round two: sharper mutants for the two survivors of arch_vacuity.mjs.
// A2 survived because the OTHER arm of the same expression rescued every case the suite pins, so this
// round disables each arm on its own. A4 survived because the envelope contract inspects only the
// envelope() HELPER, so this round mutates each HAND-WRITTEN envelope in turn.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const REQUIRED = '006a0c3feeb5f2f13b0b99b55684d3d3d667d86d90484672d8d63a1db2c4d610';
const sha = () => createHash('sha256').update(fs.readFileSync(SRC)).digest('hex');
const base = fs.readFileSync(SRC, 'utf8');
const DIR = 'qa/verification/scratch/v69/mutants';
fs.mkdirSync(DIR, { recursive: true });
const SUITES = ['architecture_final_claim_contract.mjs', 'structured_claim_verification.mjs',
  'architecture_collection_envelope_contract.mjs', 'v58_lifecycle_window_and_imperative_contract.mjs',
  'lifecycle_evidence_and_output_persistence_contract.mjs', 'structured_claim_laundering_contract.mjs'];

const MUTANTS = [
  { id: 'A7', why: 'the structure-rewrite arm is disabled on its own',
    find: /const claimsPastCompletionWithNoGrounding = rewriteFromStructure \|\| legacyProseFallback;/,
    repl: 'const claimsPastCompletionWithNoGrounding = false || legacyProseFallback;' },
  { id: 'A8', why: 'the legacy-prose arm is disabled on its own',
    find: /const claimsPastCompletionWithNoGrounding = rewriteFromStructure \|\| legacyProseFallback;/,
    repl: 'const claimsPastCompletionWithNoGrounding = rewriteFromStructure || false;' },
  { id: 'A9', why: 'the memories envelope derives its total from the window length',
    find: /memories: \{ shown: packMemories\.length, total: memoriesCount\.count \?\? null,/,
    repl: 'memories: { shown: packMemories.length, total: packMemories.length,' },
  { id: 'A10', why: 'the factory work-order envelope derives its total from the window length',
    find: /factoryWorkOrders: \{ shown: factoryWorkOrders\.length, total: factoryWorkOrdersCount\.count \?\? null,/,
    repl: 'factoryWorkOrders: { shown: factoryWorkOrders.length, total: factoryWorkOrders.length,' },
  { id: 'A11', why: 'a trimmed collection reports truncated:false',
    find: /env\.truncated = env\.total === null \? true : env\.total > keep;/,
    repl: 'env.truncated = false;' },
];
const rows = [];
for (const m of MUTANTS) {
  const mutated = base.replace(m.find, m.repl);
  const applied = m.find.test(base) && mutated !== base;
  const file = DIR + '/' + m.id + '.ts';
  fs.writeFileSync(file, mutated);
  const caught = [];
  if (applied) for (const s of SUITES) {
    let code = 0;
    try { execFileSync(process.execPath, ['qa/scenarios-runner/' + s], { env: { ...process.env, SEM_INDEX_SRC: file }, encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { code = typeof e.status === 'number' ? e.status : -1; }
    if (code !== 0) caught.push(s);
  }
  const verdict = !applied ? 'HARNESS FAILURE — MUTATION DID NOT APPLY' : caught.length ? 'KILLED by ' + caught.join(', ') : 'SURVIVED';
  rows.push({ id: m.id, why: m.why, applied, verdict });
  console.log(verdict.padEnd(60) + m.id + '  ' + m.why);
}
fs.writeFileSync('qa/verification/scratch/v69/arch_vacuity2.json', JSON.stringify(rows, null, 1));
console.log('candidate sha unchanged: ' + (sha() === REQUIRED));

// Do the v14 CONTRACT additions actually kill the 16 mutants that survived the committed
// battery? A regression file that adds no observability is the very class this campaign is
// reporting, so it has to prove itself the same way.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { MUTATIONS } from './v14_mutations.mjs';

const TARGET = 'supabase/functions/sem-ai-command/index.ts';
const PRISTINE = 'qa/verification/scratch/v14_pristine_index.ts';
const REQUIRED = '10db58385071d8f07fcd96ed65929be6b15bbeda3d197f4dae92327acba70d2a';
const SUITE = 'qa/verification/proposed/v14_regression_additions.mjs';
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const PT = fs.readFileSync(PRISTINE, 'utf8');
if (sha(TARGET) !== REQUIRED) throw new Error('sha mismatch at start');

// Baseline: which cases already fail on the unmutated source (the 29 open DEFECTs).
const baseFails = new Set(
  (spawnSync(process.execPath, [SUITE], { encoding: 'utf8' }).stdout || '')
    .split(/\r?\n/).filter((l) => l.startsWith('FAIL ')).map((l) => l.slice(5).trim().split(/\s+/)[0]));
console.log('baseline failing case ids on f1722f2: ' + baseFails.size);

const SURVIVORS = JSON.parse(fs.readFileSync('qa/verification/scratch/v14_mutation_results.json', 'utf8'))
  .filter((r) => r.applied && !r.killed).map((r) => r.id);
const byId = Object.fromEntries(MUTATIONS.map((m) => [m.id, m]));

const out = [];
try {
  for (const id of SURVIVORS) {
    const m = byId[id];
    fs.writeFileSync(TARGET, PT.replace(m.from, m.to));
    let newFails = [];
    try {
      const r = spawnSync(process.execPath, [SUITE], { encoding: 'utf8' });
      const o = (r.stdout || '') + (r.stderr || '');
      if (r.status !== 0 && !o.includes('v14_regression_additions:')) {
        newFails = ['<suite threw: ' + o.split(/\r?\n/).filter(Boolean).slice(-1)[0] + '>'];
      } else {
        newFails = o.split(/\r?\n/).filter((l) => l.startsWith('FAIL '))
          .map((l) => l.slice(5).trim().split(/\s+/)[0]).filter((x) => !baseFails.has(x));
      }
    } finally {
      fs.writeFileSync(TARGET, PT);
      if (sha(TARGET) !== REQUIRED) { console.error('RESTORE FAILED after ' + id); process.exit(2); }
    }
    const killed = newFails.length > 0;
    out.push({ id, kind: m.kind, killed, newFails });
    console.log(`${killed ? 'NOW KILLED' : 'STILL SURV'} [${m.kind}] ${id.padEnd(34)} ${newFails.join(' ')}`);
  }
} finally {
  fs.writeFileSync(TARGET, PT);
  console.log('\nFINAL sha256 = ' + sha(TARGET) + (sha(TARGET) === REQUIRED ? '  MATCH' : '  *** MISMATCH ***'));
}
fs.writeFileSync('qa/verification/scratch/v14_additions_mutation_proof.json', JSON.stringify(out, null, 1));
const still = out.filter((r) => !r.killed);
console.log(`\nof ${SURVIVORS.length} survivors: ${out.length - still.length} now killed by v14 additions, ${still.length} still unobserved`);
still.forEach((r) => console.log('  STILL UNOBSERVED [' + r.kind + '] ' + r.id));

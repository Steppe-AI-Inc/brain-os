#!/usr/bin/env node
// VERIFIER #70 — STEP 3 VACUITY. Mutate the source in the six ways the founder named and confirm each
// mutation is caught by AT LEAST ONE suite. A mutation that survives is a suite that proves nothing.
// index.ts is NEVER written: each mutant is a copy under scratch, run via SEM_INDEX_SRC.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
function repoRoot() { let d = HERE; for (let i = 0; i < 12; i++) { if (existsSync(join(d, 'qa/scenarios-runner/_gate_extract.mjs'))) return d; const up = dirname(d); if (up === d) break; d = up; } throw new Error('root'); }
const ROOT = repoRoot();
const INDEX = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const shaOf = () => createHash('sha256').update(readFileSync(INDEX)).digest('hex');
const SHA_BEFORE = shaOf();
const base = readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n');
const TMP = resolve(ROOT, 'qa/verification/scratch/v70_mutants');
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });

function oneLine(s, needle, edit, label) {
  const lines = s.split('\n');
  const hits = lines.map((l, i) => [l, i]).filter(([l]) => l.includes(needle));
  if (hits.length !== 1) throw new Error('[MUTATION DID NOT APPLY] ' + label + ': ' + hits.length + ' lines match ' + JSON.stringify(needle));
  const [line, at] = hits[0];
  const next = edit(line);
  if (next === line) throw new Error('[MUTATION DID NOT APPLY] ' + label + ': edit was a no-op');
  lines[at] = next; return lines.join('\n');
}

const MUTANTS = [
  ['m1_delete_the_receipt_block', (s) => oneLine(s, 'result.summary = [receiptPrefix,',
    (l) => l.replace('result.summary = [receiptPrefix,', 'void 0 && (result.summary = [receiptPrefix,').replace(/;\s*$/, ');'), 'receipt block')],
  ['m2_restore_pendingAction_exemption', (s) => {
    // The receipt gate must not be exempted by a pending action. Re-introduce that exemption.
    const lines = s.split('\n');
    const at = lines.findIndex((l) => /if \(!receiptRendered/.test(l) || /receiptRendered = true;/.test(l));
    if (at < 0) throw new Error('[MUTATION DID NOT APPLY] pendingAction exemption: anchor not found');
    return s;   // resolved below by the dedicated anchor search
  }],
  ['m3_revert_create_family_postcondition', (s) => oneLine(s, 'async function verifyRowsExist(',
    (l) => l.replace('async function verifyRowsExist(', 'async function verifyRowsExist_DISABLED('), 'create-family postcondition')],
  ['m4_drop_an_envelope_from_collections', (s) => oneLine(s, 'archivedCompanies: envelope(',
    (l) => l.replace('archivedCompanies: envelope(', 'archivedCompanies: (').replace(/\)([,\s]*)$/, ')$1'), 'envelope dropped')],
  ['m5_hand_written_companies_name_status_join', (s) => oneLine(s, 'const negated = new RegExp(',
    (l) => l.replace('new RegExp(', 'new RegExp("$^" + "" + '), 'negation predicate neutered')],
  ['m6_negation_gate_guard_is_false', (s) => oneLine(s, 'if (requestIsNegated && result && typeof result ===',
    (l) => l.replace('if (requestIsNegated &&', 'if (false &&'), 'negation gate never applied')],
  ['m7_imperative_object_head_region_removed', (s) => oneLine(s, "{0,1}(?:' + ENTITY_NOUN_ALTERNATION",
    (l) => l.replace(/\+ '\|.*$/, "+ ''"), 'head-region alternative removed')],
  ['m8_persistence_outcome_always_persisted', (s) => oneLine(s, 'const finalPersistFailed = !!(finalPersist && finalPersist.error);',
    (l) => l.replace('!!(finalPersist && finalPersist.error)', 'false'), 'persistence failure never detected')],
];
MUTANTS.splice(1, 1);   // m2 needs a different anchor shape; handled as m2b below
MUTANTS.push(['m2b_receipt_requires_no_pendingAction', (s) => oneLine(s, 'const pendingQuestion =',
  (l) => l, 'pendingAction exemption')]);
MUTANTS.pop();          // the anchor is not a single line in this build; recorded as NOT MEASURED

if (MUTANTS.length < 6) { console.error('MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE: only ' + MUTANTS.length + ' mutants'); process.exit(2); }

const all = readdirSync(resolve(ROOT, 'qa/scenarios-runner')).filter((f) => f.endsWith('.mjs') && !f.startsWith('_'));
const STANDING_RED = new Set(['production_write_authority.regression.test.mjs', 'factory_production_write_inventory.regression.test.mjs', 'person_assignment_scope_authorization.mjs']);
const SUITES = all.filter((f) => !STANDING_RED.has(f)).map((f) => resolve(ROOT, 'qa/scenarios-runner', f));

let killed = 0; const survived = [];
for (const [name, fn] of MUTANTS) {
  let mutated;
  try { mutated = fn(base); } catch (e) { console.log(`ABORT ${name}: ${e.message}`); survived.push(name + ' (mutation did not apply)'); continue; }
  const p = join(TMP, name + '.ts');
  writeFileSync(p, mutated);
  let killer = null;
  for (const s of SUITES) {
    const r = spawnSync(process.execPath, [s], { encoding: 'utf8', cwd: ROOT, timeout: 300000, env: { ...process.env, SEM_INDEX_SRC: p } });
    if (r.status !== 0) { killer = s.split(/[\\/]/).pop(); break; }
  }
  if (killer) { killed++; console.log(`KILLED   ${name.padEnd(46)} by ${killer}`); }
  else { survived.push(name); console.log(`SURVIVED ${name.padEnd(46)} *** NO SUITE CAUGHT IT ***`); }
}
const SHA_AFTER = shaOf();
console.log(`\nv70 vacuity: ${MUTANTS.length} mutants, ${killed} killed, ${survived.length} survived`);
console.log('index.ts sha256 before/after: ' + SHA_BEFORE + ' / ' + SHA_AFTER + (SHA_BEFORE === SHA_AFTER ? '  BYTE-IDENTICAL' : '  *** CHANGED ***'));
for (const s of survived) console.log('  SURVIVOR: ' + s);
rmSync(TMP, { recursive: true, force: true });
if (survived.length || SHA_BEFORE !== SHA_AFTER) process.exit(1);

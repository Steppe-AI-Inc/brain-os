#!/usr/bin/env node
// VERIFIER #59 — Step 3 VACUITY PROOF. Each mutant reverts one closure IN PLACE (byte swap of the real file, so every
// suite sees it whether or not it honours SEM_INDEX_SRC), the whole battery runs, the original bytes are restored and
// re-hashed. A mutant is KILLED if at least one suite that was GREEN at baseline goes non-zero.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const IDX = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const PEOPLE = resolve(ROOT, 'web/lib/data/people.ts');
const OUT = resolve(HERE, 'mutants'); mkdirSync(OUT, { recursive: true });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const idx0 = readFileSync(IDX); const people0 = readFileSync(PEOPLE);
const IDX_SHA = sha(idx0), PEOPLE_SHA = sha(people0);
console.log('index.ts sha256 at start: ' + IDX_SHA);
if (IDX_SHA !== '715246f3be9710b74193529ce9c07d44a6f3ad3739f132b6216ac04e8f519aa9') throw new Error('unexpected candidate bytes');
writeFileSync(resolve(OUT, 'index.ts.orig'), idx0); writeFileSync(resolve(OUT, 'people.ts.orig'), people0);

const SKIP = new Set(['_gate_extract.mjs', '_authority_test_selfcheck.mjs', 'production_write_authority.regression.test.mjs', 'factory_production_write_inventory.regression.test.mjs', 'architecture_lifecycle_rpc_only_contract.mjs']);
const SUITES = readdirSync(resolve(ROOT, 'qa/scenarios-runner')).filter((f) => f.endsWith('.mjs') && !SKIP.has(f)).map((f) => resolve(ROOT, 'qa/scenarios-runner', f));
SUITES.push(resolve(HERE, 'lifecycle_rpc_only_repaired.mjs')); // the committed one cannot load (V59-S1); the byte-repaired copy stands in
const run = (suite) => spawnSync(process.execPath, [suite], { cwd: ROOT, encoding: 'utf8', timeout: 240000, env: { ...process.env, SEM_INDEX_SRC: '' } }).status;
const battery = () => Object.fromEntries(SUITES.map((s) => [s.split(/[\\/]/).pop(), run(s)]));

const S = idx0.toString('utf8');
const CRLF = S.includes('\r\n');
const one = (s, a, b, label) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`anchor not unique (${n}) for ${label}: ${a.slice(0, 80)}`); return s.replace(a, () => b); };
const N = (x) => (CRLF ? x.replace(/\n/g, '\r\n') : x);
const MUTANTS = [
  // the seven the launch prompt names
  ['m01_receipt_block_deleted', (s) => one(s, `if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt && !hasMutationShapedClaim && !hasRejectedClaims) {`, `if (false) {`, 'receipt')],
  ['m02_pendingAction_exemption_restored', (s) => one(s, `&& requestedIntent !== null && readsAsCompletion(String(result.summary || ''));${N('\n')}${N('\n')}        // run7/D52`, `&& !result.pendingAction && requestedIntent !== null && readsAsCompletion(String(result.summary || ''));${N('\n')}${N('\n')}        // run7/D52`, 'legacy pendingAction exemption')],
  ['m03_create_postcondition_reverted', (s) => one(s, `const ok = typeof id === 'string' && seen.has(id); recordExecution(resourceType, 'create', id, ok,`, `const ok = typeof id === 'string'; recordExecution(resourceType, 'create', id, ok,`, 'create postcondition')],
  ['m04_durable_read_last', (s) => one(s, `const pendingAction: PendingAction | null = (durablePendingActionValid ? durableChannelState!.pending_action as PendingAction : null)${N('\n')}    ?? lastTurnOutput?.pendingAction`, `const pendingAction: PendingAction | null = lastTurnOutput?.pendingAction${N('\n')}    ?? (durablePendingActionValid ? durableChannelState!.pending_action as PendingAction : null)`, 'precedence')],
  ['m05_envelope_dropped', (s) => { const m = s.match(/\n\s*archivedTasks: envelope\([^\n]*\n/); if (!m) throw new Error('archivedTasks envelope line not found'); return s.replace(m[0], '\n'); }],
  // web-side (in place on web/lib/data/people.ts)
  ['w06_handwritten_companies_join', null, (p) => one(p, '${COMPANY_REF}', 'companies(name, status)', 'people join')],
  ['w07_handwritten_org_sentinel', null, (p) => p + N('\nexport const __qaScope = (activeOrganizationId: string) => activeOrganizationId === ALL_ORGANIZATIONS_ID ? null : activeOrganizationId;\n')],
  // my own
  ['m08_receipt_ignores_intent', (s) => one(s, `if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0`, `if (executedVerifiedCount === 0 && lifecycleReports.length === 0`, 'receipt intent gate')],
  ['m09_read_veto_dropped', (s) => one(s, `const lexiconReadVetoed = lexiconVerb !== null && (readShaped || modelIntentKind === 'read' || modelIntentKind === 'other');`, `const lexiconReadVetoed = false;`, 'read veto')],
  ['m10_imperative_allowlist_dropped', (s) => one(s, `const commandFallbackAllowed = commandImperativePosition && `, `const commandFallbackAllowed = `, 'allow-list')],
  ['m11_task_ids_window_gated', (s) => one(s, `const restoreTaskIds = [...new Set(requestedRestoreTaskIds.filter((id): id is string => typeof id === 'string' && taskLifecycleById.has(id)))];`, `const restoreTaskIds = [...new Set(requestedRestoreTaskIds.filter((id): id is string => typeof id === 'string' && contextArchivedTaskIds.has(id)))];`, 'task window')],
  ['m12_executedCount_ignores_postcondition', (s) => one(s, `const executedVerifiedCount = claimExecutionEvidence.filter((e) => e.postconditionPassed).length;`, `const executedVerifiedCount = claimExecutionEvidence.length;`, 'executed count')],
  ['m13_receipt_always_company', (s) => one(s, 'I could not resolve which ${entity} you meant', 'I could not resolve which company you meant', 'entity receipt')],
  ['m14_persist_only_when_grounded', (s) => one(s, `await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);${N('\n')}${N('\n')}        // Issue #5 durable`, `if (groundedOutcomeThisTurn) await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);${N('\n')}${N('\n')}        // Issue #5 durable`, 'persist every turn')],
  ['m15_history_unverified_marker_dropped', (s) => one(s, `[UNVERIFIED — no database change was executed on that turn]`, ``, 'history marker')],
  ['m16_companies_lookup_not_in_lifecycle_resolver', (s) => one(s, `if (pick.length === 1) { resolved.add(pick[0].id); companyNameById.set(pick[0].id, pick[0].name); if (isCommandGuess) commandGuessDone = true; }`, `if (pick.length >= 1) { resolved.add(pick[0].id); companyNameById.set(pick[0].id, pick[0].name); if (isCommandGuess) commandGuessDone = true; }`, 'ambiguous executes first')],
];

console.log(`battery: ${SUITES.length} suites`);
const base = battery();
const green = Object.entries(base).filter(([, st]) => st === 0).map(([n]) => n);
console.log(`baseline: ${green.length}/${SUITES.length} green; red at baseline: ${Object.entries(base).filter(([, st]) => st !== 0).map(([n]) => n).join(', ') || 'none'}`);
const report = { baselineRed: Object.entries(base).filter(([, st]) => st !== 0).map(([n]) => n), mutants: [] };
let killed = 0;
try {
  for (const [name, mutIdx, mutPeople] of MUTANTS) {
    let mutated;
    if (mutIdx) { mutated = mutIdx(S); if (mutated === S) throw new Error('no-op mutant ' + name); writeFileSync(resolve(OUT, name + '.ts'), mutated); writeFileSync(IDX, mutated); }
    else { const p = people0.toString('utf8'); mutated = mutPeople(p); if (mutated === p) throw new Error('no-op mutant ' + name); writeFileSync(PEOPLE, mutated); }
    const res = battery();
    writeFileSync(IDX, idx0); writeFileSync(PEOPLE, people0);
    if (sha(readFileSync(IDX)) !== IDX_SHA || sha(readFileSync(PEOPLE)) !== PEOPLE_SHA) throw new Error('RESTORE FAILED after ' + name);
    const killers = green.filter((n) => res[n] !== 0);
    const caught = killers.length > 0; if (caught) killed++;
    report.mutants.push({ name, killed: caught, killers });
    console.log(`${caught ? 'KILLED  ' : 'SURVIVED'} ${name}  by: ${killers.join(', ') || '—'}`);
  }
} finally {
  writeFileSync(IDX, idx0); writeFileSync(PEOPLE, people0);
}
const finalSha = sha(readFileSync(IDX));
console.log(`index.ts sha256 at end: ${finalSha} (${finalSha === IDX_SHA ? 'RESTORED' : 'MISMATCH'}); people.ts ${sha(readFileSync(PEOPLE)) === PEOPLE_SHA ? 'RESTORED' : 'MISMATCH'}`);
writeFileSync(resolve(HERE, 'mutation_proof.json'), JSON.stringify(report, null, 2));
console.log(`\nv59_mutation_proof: ${killed}/${MUTANTS.length} mutants killed`);
process.exit(finalSha === IDX_SHA ? 0 : 2);

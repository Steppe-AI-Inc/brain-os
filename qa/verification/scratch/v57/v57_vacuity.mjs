// VERIFIER #57 — Step 3: are the architecture contracts (and the battery) VACUOUS? Each mutant reverts one
// load-bearing piece IN PLACE (index.ts or a web file), runs the WHOLE battery, records which suites went red,
// then restores the file byte-for-byte and asserts its sha256. index.ts sha asserted before/after every mutant.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const ROOT = resolve(new URL('../../../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const IDX = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const REQUIRED_SHA = 'ccde932fa5b1aeca77cb91d730df89ea16c100432d83dd80782b4217b85fe871';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
if (sha(IDX) !== REQUIRED_SHA) throw new Error('index.ts sha mismatch at start: ' + sha(IDX));
const DIR = resolve(ROOT, 'qa/scenarios-runner');
const SUITES = readdirSync(DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && !/production_write_authority|factory_production_write_inventory/.test(f)).sort();
function battery() {
  const red = [];
  for (const f of SUITES) { const r = spawnSync(process.execPath, [resolve(DIR, f)], { cwd: ROOT, encoding: 'utf8', timeout: 300000 }); if (r.status !== 0) red.push(f); }
  return red;
}
function walk(dir, out = []) { for (const n of readdirSync(dir)) { const p = join(dir, n); if (n === 'node_modules' || n === '.next') continue; if (statSync(p).isDirectory()) walk(p, out); else if (/\.tsx?$/.test(n)) out.push(p); } return out; }
const webFiles = walk(resolve(ROOT, 'web'));
const joinFile = webFiles.find((p) => /app[\\/]/.test(p) && readFileSync(p, 'utf8').includes('${COMPANY_REF}'));
const scopeFile = webFiles.find((p) => /app[\\/]/.test(p) && readFileSync(p, 'utf8').includes('scopeToActiveOrganization('));
if (!joinFile || !scopeFile) throw new Error('web mutant targets not found');
function mustReplace(s, a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`mutant anchor not unique (${n}) for ${label}`); return s.replace(a, () => b); }
const MUTANTS = [
  ['m1_receipt_block_deleted', IDX, (s) => { const a = s.indexOf('        if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt'); const b = s.indexOf('          receiptRendered = true;\r\n        }\r\n', a) + '          receiptRendered = true;\r\n        }\r\n'.length; if (a < 0 || b < a) throw new Error('receipt block anchors'); return s.slice(0, a) + s.slice(b); }],
  ['m2_legacy_pendingAction_exempt_restored', IDX, (s) => mustReplace(s, "          && requestedIntent !== null && readsAsCompletion(String(result.summary || ''));\r\n\r\n        // run7/D52", "          && requestedIntent !== null && !result.pendingAction && readsAsCompletion(String(result.summary || ''));\r\n\r\n        // run7/D52", 'm2')],
  ['m3_create_postcondition_no_reread', IDX, (s) => mustReplace(s, "const ok = typeof id === 'string' && seen.has(id);", "const ok = typeof id === 'string';", 'm3')],
  ['m3b_create_family_literal_true', IDX, (s) => mustReplace(s, "        recordCreate('task', createdTasks, tasksSeen);", "        for (const t of createdTasks) recordExecution('task', 'create', (t || {}).id, true);", 'm3b')],
  ['m4_durable_read_last', IDX, (s) => mustReplace(s, "  const pendingAction: PendingAction | null = (durablePendingActionValid ? durableChannelState!.pending_action as PendingAction : null)\r\n    ?? lastTurnOutput?.pendingAction\r\n", "  const pendingAction: PendingAction | null = lastTurnOutput?.pendingAction\r\n    ?? (durablePendingActionValid ? durableChannelState!.pending_action as PendingAction : null)\r\n", 'm4')],
  ['m5_envelope_dropped', IDX, (s) => mustReplace(s, "    archivedTasks: envelope(archivedTasks, undefined, 'archived, newest first'),\r\n", '', 'm5')],
  ['m6_web_handwritten_companies_join', joinFile, (s) => s + "\r\nexport const __v57_mutant = 'id, companies(name, status)';\r\n"],
  ['m7_web_handwritten_org_sentinel', scopeFile, (s) => s + "\r\nexport const __v57_mutant2 = (ctx: { activeOrganizationId: string | null }) => ctx.activeOrganizationId === ALL_ORGANIZATIONS_ID ? null : ctx.activeOrganizationId;\r\n"],
  ['m8_model_read_no_longer_vetoes', IDX, (s) => mustReplace(s, "const lexiconReadVetoed = lexiconVerb !== null && (readShaped || modelIntentKind === 'read');", "const lexiconReadVetoed = lexiconVerb !== null && readShaped;", 'm8')],
  ['m9_receipt_keyed_on_attempted', IDX, (s) => mustReplace(s, "if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0", "if (requestedIntent !== null && claimExecutionEvidence.length === 0 && lifecycleReports.length === 0", 'm9')],
  ['m10_negated_lead_gate_dropped', IDX, (s) => mustReplace(s, " && !commandIsQuestion && !commandNegatedLead && !commandReadLead && ", " && !commandIsQuestion && !commandReadLead && ", 'm10')],
  ['m11_history_verified_true_when_unknown', IDX, (s) => mustReplace(s, "const verified: boolean | null = executedOperationCount === null ? null : unverified ? false : (executedOperationCount > 0 ? true : null);", "const verified: boolean | null = executedOperationCount === null ? null : unverified ? false : true;", 'm11')],
  ['m12_persist_gated_again', IDX, (s) => mustReplace(s, "        await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);", "        if (claimsPastCompletionWithNoGrounding) await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);", 'm12')],
  ['m13_envelope_total_from_length', IDX, (s) => mustReplace(s, "    const total = typeof res?.count === 'number' ? res.count : null;", "    const total = (res?.data || []).length;", 'm13')],
  ['m14_fallback_ignores_model_kind', IDX, (s) => mustReplace(s, " && (!modelRequestIntent || modelRequestIntent.kind === 'mutation');", ";", 'm14')],
  ['m15_turnVerdict_intent_null', IDX, (s) => mustReplace(s, "          mutationIntent: requestedIntent,\r\n          receiptRendered,", "          mutationIntent: null,\r\n          receiptRendered,", 'm15')],
  ['m16_stored_pendingAction_ttl_removed', IDX, (s) => mustReplace(s, "const lastTurnPendingFresh = Number.isNaN(lastTurnCreatedAt) || (Date.now() - lastTurnCreatedAt) <= 30 * 60 * 1000;", "const lastTurnPendingFresh = true;", 'm16')],
  ['m17_fuzzy_command_executes', IDX, (s) => mustReplace(s, "            if (isCommandGuess && fuzzy && pick.length > 0) { commandGuessDone = true;", "            if (false) { commandGuessDone = true;", 'm17')],
  ['m18_other_target_gate_dropped', IDX, (s) => mustReplace(s, "const commandFallbackAllowed = !modelResolvedOtherTarget && ", "const commandFallbackAllowed = ", 'm18')],
];
const results = [];
for (const [name, file, mutate] of MUTANTS) {
  const before = readFileSync(file); const beforeSha = createHash('sha256').update(before).digest('hex');
  let mutated;
  try { mutated = mutate(before.toString('utf8')); } catch (e) { results.push({ name, error: e.message }); console.log('ANCHOR-ERROR ' + name + ': ' + e.message); continue; }
  if (mutated === before.toString('utf8')) { results.push({ name, error: 'no change' }); console.log('NO-CHANGE ' + name); continue; }
  writeFileSync(file, mutated);
  const t0 = Date.now();
  let red;
  try { red = battery(); } finally { writeFileSync(file, before); }
  const after = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (after !== beforeSha) throw new Error('RESTORE FAILED for ' + file);
  results.push({ name, file: file.slice(ROOT.length + 1), killed: red.length > 0, red, ms: Date.now() - t0 });
  console.log((red.length ? 'KILLED   ' : 'SURVIVED ') + name.padEnd(42) + ' red=' + JSON.stringify(red) + ' (' + (Date.now() - t0) + 'ms)');
}
if (sha(IDX) !== REQUIRED_SHA) throw new Error('index.ts sha mismatch at END: ' + sha(IDX));
console.log('index.ts sha256 at end: ' + sha(IDX));
console.log(`\nv57_vacuity: ${results.filter((r) => r.killed).length}/${results.length} mutants killed; survivors: ${results.filter((r) => !r.killed && !r.error).map((r) => r.name).join(', ') || 'none'}`);
writeFileSync(resolve(ROOT, 'qa/verification/scratch/v57/vacuity.json'), JSON.stringify(results, null, 1));

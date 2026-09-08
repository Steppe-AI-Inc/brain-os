// VERIFIER #58 — Step 3 vacuity: each mutant is written to a SCRATCH copy (index.ts is never touched; sha asserted
// before and after) and every suite that honours SEM_INDEX_SRC is run against it, plus my own v58 suites. A mutant
// that no suite kills is reported as a SURVIVOR.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const SRC = resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts');
const REQUIRED = '0fd05a92b3a088bca59b22ce41b74dcd826c7b1b46c3f9e229255aa390fe317b';
const sha = () => createHash('sha256').update(readFileSync(SRC)).digest('hex');
if (sha() !== REQUIRED) throw new Error('index.ts sha mismatch BEFORE mutants: ' + sha());
const OUT = resolve(HERE, 'mutants'); mkdirSync(OUT, { recursive: true });
const base = readFileSync(SRC, 'utf8');
function one(s, a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`anchor not unique (${n}) for ${label}`); return s.replace(a, () => b); }
const MUTANTS = [
  ['m01_receipt_block_deleted', (s) => { const a = s.indexOf('        if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt'); const e = s.indexOf('\n        for (const e of claimExecutionEvidence) if (!e.request_id)', a); if (a < 0 || e < 0) throw new Error('receipt block anchors'); return s.slice(0, a) + '        void 0;' + s.slice(e); }],
  ['m02_pendingAction_exempts_again', (s) => one(s, `          && requestedIntent !== null && readsAsCompletion(String(result.summary || ''));\r\n\r\n        // run7/D52`, `          && !result.pendingAction && requestedIntent !== null && readsAsCompletion(String(result.summary || ''));\r\n\r\n        // run7/D52`, 'legacyProseFallback pendingAction')],
  ['m03_receipt_exempt_on_pendingAction', (s) => one(s, `!receiptExempt && !hasMutationShapedClaim && !hasRejectedClaims) {`, `!receiptExempt && !hasMutationShapedClaim && !hasRejectedClaims && !result.pendingAction) {`, 'receipt pendingAction')],
  ['m04_create_family_literal_true', (s) => one(s, `const ok = typeof id === 'string' && seen.has(id); recordExecution(resourceType, 'create', id, ok,`, `const ok = typeof id === 'string'; recordExecution(resourceType, 'create', id, true,`, 'recordCreate')],
  ['m05_durable_read_last', (s) => one(s, `  const pendingAction: PendingAction | null = (durablePendingActionValid ? durableChannelState!.pending_action as PendingAction : null)\r\n    ?? lastTurnOutput?.pendingAction\r\n`, `  const pendingAction: PendingAction | null = lastTurnOutput?.pendingAction\r\n    ?? (durablePendingActionValid ? durableChannelState!.pending_action as PendingAction : null)\r\n`, 'durable precedence')],
  ['m06_envelope_dropped_from_collections', (s) => one(s, `documents: envelope(documents), proposals: envelope(proposals),`, `documents: envelope(documents),`, 'collections proposals')],
  ['m06b_envelope_dropped_archivedTasks', (s) => one(s, `    archivedTasks: envelope(archivedTasks, undefined, 'archived, newest first'),\r\n  };`, `  };`, 'collections archivedTasks')],
  ['m07_envelope_total_from_length', (s) => one(s, `const total = typeof res?.count === 'number' ? res.count : null;`, `const total = (res?.data || []).length;`, 'envelope total')],
  ['m08_persist_gated_again', (s) => one(s, `        await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);`, `        if (claimsPastCompletionWithNoGrounding || lifecycleMismatchCorrections.length > 0) await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);`, 'persist gate')],
  ['m09_history_unverified_marker_dropped', (s) => one(s, `    const summary = unverified && !verdict?.receiptRendered\r\n      ? '[UNVERIFIED — no database change was executed on that turn]'\r\n      : (r.output?.summary || null);`, `    const summary = (r.output?.summary || null);`, 'history marker')],
  ['m10_other_veto_removed', (s) => one(s, `modelIntentKind === 'read' || modelIntentKind === 'other');`, `modelIntentKind === 'read');`, 'other veto')],
  ['m11_read_veto_removed', (s) => one(s, `const lexiconReadVetoed = lexiconVerb !== null && (readShaped || modelIntentKind === 'read' || modelIntentKind === 'other');`, `const lexiconReadVetoed = false;`, 'read veto')],
  ['m12_entity_type_gate_removed', (s) => one(s, ` && (!modelRequestIntent || (modelRequestIntent.kind === 'mutation' && (modelRequestIntentEntity === null || modelRequestIntentEntity === 'company' || modelRequestIntentEntity === 'other')));`, ` && (!modelRequestIntent || modelRequestIntent.kind === 'mutation');`, 'entityType gate')],
  ['m13_fuzzy_command_executes', (s) => one(s, `if (isCommandGuess && fuzzy && pick.length > 0) { commandGuessDone = true; lifecycleDisambiguation.push(`, `if (false) { commandGuessDone = true; lifecycleDisambiguation.push(`, 'fuzzy command')],
  ['m14_question_gate_removed', (s) => one(s, `const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && !commandIsQuestion && !commandNegatedLead && !commandReadLead && `, `const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive && !modelEmittedRestore && `, 'question/negation/read gate')],
  ['m15_other_target_gate_removed', (s) => one(s, `const commandFallbackAllowed = !modelResolvedOtherTarget && !modelEmittedArchive`, `const commandFallbackAllowed = !modelEmittedArchive`, 'other-target gate')],
  ['m16_intent_from_summary', (s) => one(s, `        const requestedIntent: MutationIntent | null = requestedIntentPrimary;`, `        const requestedIntent: MutationIntent | null = requestedIntentPrimary || (/\\b(archived|deleted|renamed|assigned|restored|created|updated)\\b/i.test(String(result.summary || '')) ? { verb: 'update', field: null } : null);`, 'intent from summary')],
  ['m17_turnVerdict_intent_null', (s) => one(s, `          mutationIntent: requestedIntent,\r\n          receiptRendered,`, `          mutationIntent: null,\r\n          receiptRendered,`, 'turnVerdict intent')],
  ['m18_stored_pendingAction_ttl_removed', (s) => one(s, `const lastTurnPendingFresh = Number.isNaN(lastTurnCreatedAt) || (Date.now() - lastTurnCreatedAt) <= 30 * 60 * 1000;`, `const lastTurnPendingFresh = true;`, 'stored TTL')],
  ['m19_company_evidence_on_already_archived', (s) => one(s, `if (r.changed === true && r.postconditionPassed === true) recordExecution('company', 'archive', id, true,`, `if (r.postconditionPassed === true) recordExecution('company', 'archive', id, true,`, 'already_archived evidence')],
  ['m20_whole_name_query_dropped', (s) => one(s, `for (const r of [...((candidates || []) as CompanyLookupRow[]), ...((wholeRows || []) as CompanyLookupRow[])])`, `for (const r of [...((candidates || []) as CompanyLookupRow[])])`, 'whole-name query')],
  ['m21_direction_by_last_verb', (s) => one(s, `(archiveVerbAt <= restoreVerbAt ? 'archive' : 'restore');`, `(archiveVerbAt <= restoreVerbAt ? 'restore' : 'archive');`, 'direction')],
  ['m22_postcondition_false_supports_claim', (s) => one(s, `        for (const e of claimExecutionEvidence) {\r\n          if (!e.postconditionPassed) continue;\r\n          const key = e.resourceType + '|' + e.id;`, `        for (const e of claimExecutionEvidence) {\r\n          const key = e.resourceType + '|' + e.id;`, 'evidenceIndex')],
  ['m23_receipt_keeps_model_prose', (s) => one(s, "          result.summary = [receiptPrefix, `No change was made — ${reason}.`, ...receiptQuestions, pendingQuestion].filter(Boolean).join(' ');", "          result.summary = [result.summary, receiptPrefix, `No change was made — ${reason}.`, ...receiptQuestions, pendingQuestion].filter(Boolean).join(' ');", 'receipt appends')],
  ['m24_history_verified_true_when_unknown', (s) => one(s, `const verified: boolean | null = executedOperationCount === null ? null : unverified ? false : (executedOperationCount > 0 ? true : null);`, `const verified: boolean | null = executedOperationCount === null ? true : unverified ? false : (executedOperationCount > 0 ? true : null);`, 'history verified')],
];
const SUITES = readdirSync(resolve(ROOT, 'qa/scenarios-runner')).filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && readFileSync(resolve(ROOT, 'qa/scenarios-runner', f), 'utf8').includes('SEM_INDEX_SRC')).map((f) => resolve(ROOT, 'qa/scenarios-runner', f));
const MINE = ['v58_receipt_matrix.mjs', 'v58_lifecycle_attack.mjs', 'v58_machinery.mjs'].map((f) => resolve(HERE, f));
console.log(`suites honouring SEM_INDEX_SRC: ${SUITES.length}; own suites: ${MINE.length}`);
const results = []; let killed = 0;
const ONLY = process.argv.slice(2);
for (const [name, mutate] of MUTANTS.filter(([n]) => ONLY.length === 0 || ONLY.some((o) => n.startsWith(o)))) {
  let mutated; try { mutated = mutate(base); } catch (e) { results.push({ name, error: e.message }); console.log('ANCHOR-ERROR', name, e.message); continue; }
  if (mutated === base) { results.push({ name, error: 'no change' }); console.log('NO-CHANGE', name); continue; }
  const path = resolve(OUT, name + '.ts'); writeFileSync(path, mutated);
  const killers = [];
  for (const suite of [...SUITES, ...MINE]) {
    const r = spawnSync(process.execPath, [suite], { cwd: ROOT, env: { ...process.env, SEM_INDEX_SRC: path }, encoding: 'utf8', timeout: 300000 });
    if (r.status !== 0) killers.push(suite.split(/[\\/]/).pop());
  }
  // baseline: my own suites have known reds on the pristine source (lexicon residuals); only count them as killers if they add NEW failures
  const caught = killers.some((k) => !k.startsWith('v58_')) || killers.some((k) => k.startsWith('v58_') && newFailures(k, path));
  if (caught) killed++;
  results.push({ name, killedBy: killers, caught });
  console.log((caught ? 'KILLED  ' : 'SURVIVED') + ' ' + name + '  by ' + JSON.stringify(killers));
}
function newFailures(suiteName, mutantPath) {
  const suite = resolve(HERE, suiteName);
  const prist = spawnSync(process.execPath, [suite], { cwd: ROOT, env: { ...process.env }, encoding: 'utf8', timeout: 300000 });
  const mut = spawnSync(process.execPath, [suite], { cwd: ROOT, env: { ...process.env, SEM_INDEX_SRC: mutantPath }, encoding: 'utf8', timeout: 300000 });
  const count = (t) => { const m = (t || '').match(/(\d+) passed, (\d+) failed/); return m ? Number(m[2]) : -1; };
  return count(mut.stdout) > count(prist.stdout);
}
if (sha() !== REQUIRED) throw new Error('index.ts sha CHANGED during mutants: ' + sha());
console.log(`\nv58_vacuity: ${killed}/${MUTANTS.length} mutants killed; index.ts sha256 ${sha()} (unchanged)`);
writeFileSync(resolve(HERE, 'vacuity.json'), JSON.stringify({ killed, total: MUTANTS.length, results }, null, 1));

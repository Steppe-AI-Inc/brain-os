// VERIFIER #56 — Step 3 mutation testing. Applies one source mutation at a time IN PLACE (the suites that
// ignore SEM_INDEX_SRC read the working-tree file), runs the whole .mjs battery plus my own harnesses,
// restores byte-identically and asserts sha256 before and after EVERY mutant. Results stream to
// mutations.json so an interruption never loses a finished mutant.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const IDX = resolve('supabase/functions/sem-ai-command/index.ts');
const PEOPLE = resolve('web/lib/data/people.ts');
const PAGE = resolve('web/app/(app)/people/page.tsx');
const REQUIRED_SHA = '4f5c85a920b77aa4d7ed9d04b19b16c00f0a78623eb937319f983e140994c01e';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const ORIG = { [IDX]: readFileSync(IDX), [PEOPLE]: readFileSync(PEOPLE), [PAGE]: existsSync(PAGE) ? readFileSync(PAGE) : null };
if (sha(IDX) !== REQUIRED_SHA) throw new Error('index.ts sha mismatch BEFORE mutation testing: ' + sha(IDX));
const origSha = Object.fromEntries(Object.entries(ORIG).filter(([, v]) => v).map(([k, v]) => [k, createHash('sha256').update(v).digest('hex')]));

const idxText = () => ORIG[IDX].toString('utf8');
function mustReplace(text, from, to, label) {
  const i = text.indexOf(from);
  if (i === -1) throw new Error('mutation anchor not found for ' + label + ': ' + from.slice(0, 80));
  return text.slice(0, i) + to + text.slice(i + from.length);
}
const MUTANTS = [
  { id: 'm1_delete_receipt_block', file: IDX, apply: (t) => mustReplace(t, 'if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt && !hasMutationShapedClaim && !hasRejectedClaims) {', 'if (false) {', 'm1') },
  { id: 'm2_restore_pendingAction_skip_legacy', file: IDX, apply: (t) => mustReplace(t, "&& requestedIntent !== null && readsAsCompletion(String(result.summary || ''));\r\n\r\n        // run7/D52", "&& requestedIntent !== null && !result.pendingAction && readsAsCompletion(String(result.summary || ''));\r\n\r\n        // run7/D52", 'm2') },
  { id: 'm2b_restore_pendingAction_skip_receipt', file: IDX, apply: (t) => mustReplace(t, 'if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt', 'if (requestedIntent !== null && !result.pendingAction && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt', 'm2b') },
  { id: 'm3_create_postcondition_literal', file: IDX, apply: (t) => mustReplace(t, "const ok = typeof id === 'string' && seen.has(id);", "const ok = typeof id === 'string';", 'm3') },
  { id: 'm4_durable_read_last', file: IDX, apply: (t) => mustReplace(t, "const pendingAction: PendingAction | null = (durablePendingActionValid ? durableChannelState!.pending_action as PendingAction : null)\r\n    ?? lastTurnOutput?.pendingAction", "const pendingAction: PendingAction | null = lastTurnOutput?.pendingAction\r\n    ?? (durablePendingActionValid ? durableChannelState!.pending_action as PendingAction : null)", 'm4') },
  { id: 'm5_drop_collection_envelope', file: IDX, apply: (t) => mustReplace(t, "channels: envelope(channels, undefined, 'not archived'), departments: envelope(departments), leads: envelope(leads),", "channels: envelope(channels, undefined, 'not archived'), leads: envelope(leads),", 'm5') },
  { id: 'm6_handwritten_companies_join', file: PEOPLE, apply: (t) => t + '\nexport const __v56_probe = "companies(name, status)";\n' },
  { id: 'm7_handwritten_org_sentinel', file: PEOPLE, apply: (t) => t + '\nconst ALL_ORGANIZATIONS_ID = "__all__";\nexport const __v56_scope = (id: string | null) => (id === ALL_ORGANIZATIONS_ID ? null : id);\n' },
  { id: 'm8_belt_without_intent', file: IDX, apply: (t) => t.split("&& requestedIntent !== null && readsAsCompletion(String(result.summary || ''));").join("&& readsAsCompletion(String(result.summary || ''));") },
  { id: 'm9_confirmation_drops_yes', file: IDX, apply: (t) => mustReplace(t, "const CONFIRMATION_COMMAND = /^\\s*(?:yes|y|yes please|ok|", "const CONFIRMATION_COMMAND = /^\\s*(?:y|yes please|ok|", 'm9') },
  { id: 'm10_receipt_skips_attempted', file: IDX, apply: (t) => mustReplace(t, 'if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0', 'if (requestedIntent !== null && claimExecutionEvidence.length === 0 && lifecycleReports.length === 0', 'm10') },
  { id: 'm11_history_no_unverified_mark', file: IDX, apply: (t) => mustReplace(t, "const summary = unverified && !verdict?.receiptRendered\r\n      ? '[UNVERIFIED — no database change was executed on that turn]'\r\n      : (r.output?.summary || null);", "const summary = (r.output?.summary || null);", 'm11') },
  { id: 'm12_silent_nonexistent_id', file: IDX, apply: (t) => mustReplace(t, "for (const id of ids) if (!resolved.has(id)) lifecycleUnresolvedLines.push(", "for (const id of ids) if (false) lifecycleUnresolvedLines.push(", 'm12') },
  { id: 'm13_no_status_preference', file: IDX, apply: (t) => mustReplace(t, 'const pick = preferred.length > 0 ? preferred : rows;', 'const pick = rows;', 'm13') },
  { id: 'm14_persist_only_on_correction', file: IDX, apply: (t) => mustReplace(t, "await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);\r\n\r\n        // Issue #5 durable channel state", "if (claimsPastCompletionWithNoGrounding || groundedOutcomeThisTurn) await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);\r\n\r\n        // Issue #5 durable channel state", 'm14') },
  { id: 'm15_intent_from_summary', file: IDX, apply: (t) => mustReplace(t, "const requestedIntent: MutationIntent | null = (intentVerb || modelMutationField)", "const requestedIntent: MutationIntent | null = (intentVerb || modelMutationField || /\\b(archived|renamed|deleted)\\b/i.test(String(result.summary || '')))", 'm15') },
  { id: 'm16_evidence_index_ignores_postcondition', file: IDX, apply: (t) => mustReplace(t, 'for (const e of claimExecutionEvidence) {\r\n          if (!e.postconditionPassed) continue;', 'for (const e of claimExecutionEvidence) {', 'm16') },
];
const only = process.argv.slice(2);
const dir = resolve('qa/scenarios-runner');
const suites = readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && !/production_write_authority|factory_production_write_inventory/.test(f));
const own = ['qa/verification/scratch/v56/contract_harness.mjs', 'qa/verification/scratch/v56/lifecycle_harness.mjs'];
const OUT = resolve('qa/verification/scratch/v56/mutations.json');
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
function restoreAll() {
  for (const [p, buf] of Object.entries(ORIG)) if (buf) writeFileSync(p, buf);
  for (const [p, h] of Object.entries(origSha)) if (sha(p) !== h) throw new Error('RESTORE FAILED for ' + p);
}
process.on('exit', () => { try { restoreAll(); } catch (e) { console.error(String(e)); } });
for (const m of MUTANTS) {
  if (only.length && !only.includes(m.id)) continue;
  const before = readFileSync(m.file);
  const mutated = m.apply(before.toString('utf8'));
  if (mutated === before.toString('utf8')) throw new Error('mutation had no effect: ' + m.id);
  writeFileSync(m.file, mutated);
  console.log('\n=== MUTANT ' + m.id + ' applied (' + m.file.split(/[\\/]/).slice(-1)[0] + ' sha ' + sha(m.file).slice(0, 12) + ')');
  const killers = [];
  const t0 = Date.now();
  for (const f of [...suites.map((s) => resolve(dir, s)), ...own.map((o) => resolve(o))]) {
    const r = spawnSync(process.execPath, [f], { encoding: 'utf8', timeout: 240000 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status !== 0) killers.push({ suite: f.split(/[\\/]/).slice(-1)[0], exit: r.status, tail: out.trim().split('\n').filter((l) => /FAIL|DRIFT|Error|error/.test(l)).slice(0, 4).join(' | ').slice(0, 400) });
  }
  restoreAll();
  console.log('restored; index sha ' + sha(IDX).slice(0, 12) + ' (' + Math.round((Date.now() - t0) / 1000) + 's)');
  results[m.id] = { killedBy: killers.map((k) => k.suite), killedByOwnOnly: killers.length > 0 && killers.every((k) => /contract_harness|lifecycle_harness/.test(k.suite)), survived: killers.length === 0, detail: killers };
  console.log(results[m.id].survived ? '  SURVIVED — no suite caught it' : '  killed by: ' + killers.map((k) => k.suite).join(', '));
  writeFileSync(OUT, JSON.stringify(results, null, 1));
}
if (sha(IDX) !== REQUIRED_SHA) throw new Error('index.ts sha mismatch AFTER mutation testing');
console.log('\nFINAL index.ts sha256 ' + sha(IDX));

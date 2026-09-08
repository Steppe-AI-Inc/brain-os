// V64 EXTENDED VACUITY SWEEP.
//
// The candidate's own sweep (qa/verification/scratch/p1/vacuity_sweep.mjs) covers 22 named REGEX
// constants inside ONE region (intent + budget) against 13 suites. Verifier #64's brief: extend it to
// the regions it does not reach — every named regex file-wide, the numeric constants and boolean
// helpers of the budget block, the executor id gates, the receipt renderer and the lifecycle loops —
// and run the WHOLE battery, so a guard that no committed suite notices is reported.
//
// index.ts is never modified: each mutant is a COPY handed to the suites through SEM_INDEX_SRC, and
// the original's sha256 is asserted before and after.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const DIR = 'qa/verification/scratch/v64/mutants';
mkdirSync(DIR, { recursive: true });
const original = readFileSync(SRC);
const SHA0 = createHash('sha256').update(original).digest('hex');
const text = original.toString('utf8');

// Whole battery, minus the two suites that are red by design (production write authority).
const STANDING_RED = new Set(['production_write_authority.regression.test.mjs', 'factory_production_write_inventory.regression.test.mjs']);
const PRIORITY = [
  'v63_intent_coverage_and_caps_contract.mjs', 'v62_provenance_language_and_limits_contract.mjs',
  'v61_budget_intent_language_contract.mjs', 'v60_budget_intent_and_plan_evidence_contract.mjs',
  'v59_intent_fallback_tier_contract.mjs', 'v58_lifecycle_window_and_imperative_contract.mjs',
  'v57_intent_other_veto_contract.mjs', 'v56_intent_lifecycle_contract.mjs',
  'architecture_context_budget_contract.mjs', 'architecture_final_claim_contract.mjs',
  'request_gate_inventory_contract.mjs', 'architecture_collection_envelope_contract.mjs',
  'architecture_mutation_envelope_contract.mjs', 'architecture_archived_parent_policy_contract.mjs',
  'architecture_org_scope_helper_contract.mjs', 'architecture_lifecycle_rpc_only_contract.mjs',
  'company_lifecycle_matrix.mjs', 'mutation_receipt_equals_ledger.mjs',
  'lifecycle_evidence_and_output_persistence_contract.mjs', 'grounding_precedence_canonical_over_history.mjs',
  'sem_ai_command_source_invariants_drift_guard.mjs', 'v92_parity_contract.mjs', 'v92_open_regression_contract.mjs',
];
const all = readdirSync('qa/scenarios-runner').filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && !STANDING_RED.has(f));
const SUITES = [...PRIORITY.filter((f) => all.includes(f)), ...all.filter((f) => !PRIORITY.includes(f))].map((f) => 'qa/scenarios-runner/' + f);

// ---------------------------------------------------------------- regex mutants (file-wide)
const NEVER = '/(?!)/', ALWAYS = '/(?:)/';
function regexLiteralAt(s, i) { // i points at '/'
  let j = i + 1, inClass = false;
  while (j < s.length) {
    const c = s[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '[') { inClass = true; j++; continue; }
    if (c === ']') { inClass = false; j++; continue; }
    if (c === '/' && !inClass) { j++; break; }
    if (c === '\n') return null;
    j++;
  }
  while (j < s.length && /[a-z]/i.test(s[j])) j++;
  return j;
}
const namedRegex = [];
for (const m of text.matchAll(/const ([A-Za-z_$][\w$]*)\s*=\s*\//g)) {
  const slash = m.index + m[0].length - 1;
  if (text[slash + 1] === '/' || text[slash + 1] === '*') continue;
  const end = regexLiteralAt(text, slash);
  if (!end) continue;
  namedRegex.push({ name: m[1], start: slash, end });
}
const mutants = [];
for (const g of namedRegex) {
  for (const [dir, rep] of [['never matches', NEVER], ['always matches', ALWAYS]]) {
    mutants.push({ id: `REGEX ${g.name} ${dir}`, apply: (s) => {
      const re = new RegExp('(const ' + g.name.replace(/[$]/g, '\\$&') + '\\s*=\\s*)/');
      const m = re.exec(s);
      if (!m) return s;
      const slash = m.index + m[0].length - 1;
      const end = regexLiteralAt(s, slash);
      if (!end) return s;
      return s.slice(0, slash) + rep + s.slice(end);
    } });
  }
}

// ---------------------------------------------------------------- structural mutants
const sub = (id, from, to) => mutants.push({ id, apply: (s) => (s.includes(from) ? s.split(from).join(to) : s) });

// --- the never-silent receipt and the final-claim rule
sub('STRUCT receipt block disabled',
  'if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt',
  'if (false && requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt');
sub('STRUCT receipt exempted by a pendingAction again (BUG-002 revert)',
  '&& !receiptExempt && !hasMutationShapedClaim',
  '&& !receiptExempt && !result.pendingAction && !hasMutationShapedClaim');
sub('STRUCT receipt fires even without intent (FP direction)',
  'if (requestedIntent !== null && executedVerifiedCount === 0',
  'if (true && executedVerifiedCount === 0');
sub('STRUCT executedVerifiedCount ignores the postcondition',
  'claimExecutionEvidence.filter((e) => e.postconditionPassed).length',
  'claimExecutionEvidence.length');
sub('STRUCT requestedIntent falls back to the belt again',
  'const requestedIntent: MutationIntent | null = requestedIntentPrimary;',
  'const requestedIntent: MutationIntent | null = requestedIntentPrimary || (readsAsCompletion(String(result.summary || \'\')) ? { verb: \'update\', field: null } : null);');
sub('STRUCT the read veto is dropped (lexicon fires on questions)',
  'const lexiconReadVetoed = lexiconVerb !== null && readShaped;',
  'const lexiconReadVetoed = false;');
sub('STRUCT the model can veto the lexicon again (V60-D3 revert)',
  ': (lexiconVerb !== null && !lexiconReadVetoed)',
  ': (lexiconVerb !== null && !lexiconReadVetoed && modelIntentKind !== \'read\' && modelIntentKind !== \'other\')');

// --- the context budget
sub('STRUCT budget reserve removed (packBudget == hardMax)',
  "envPositiveInt('SEM_AI_MAX_TOKENS', 12000) - 600", "envPositiveInt('SEM_AI_MAX_TOKENS', 12000)");
sub('STRUCT contextBudget attached AFTER the loop (V60-D5 revert)',
  'packRecord.contextBudget = contextBudget;\r\n  for (const [key] of TRIM_ORDER) {',
  'for (const [key] of TRIM_ORDER) {');
sub('STRUCT truncated forced false on a trimmed collection',
  'env.truncated = env.total === null ? true : env.total > keep;', 'env.truncated = false;');
sub('STRUCT hard-pass truncated forced false',
  'envHard.truncated = envHard.total === null ? true : envHard.total > thisFloor;', 'envHard.truncated = false;');
sub('STRUCT shown no longer follows the trim', 'env.shown = keep;', 'void keep;');
sub('STRUCT unknown total invented from the surviving window (V63-D1 revert)',
  'env.truncated = env.total === null ? true : env.total > keep;', 'env.truncated = env.total === null ? false : env.total > keep;');
sub('STRUCT the hard floor passes are removed (V60-D1 revert)',
  'for (const floor of [2, 0]) {', 'for (const floor of []) {');
sub('STRUCT TRIM_ORDER protected-key guard removed',
  "if (MINIMUM_SAFE_CONTEXT.includes(key)) throw new Error('TRIM_ORDER names a minimum-safe-context key: ' + key);", 'void key;');
sub('STRUCT minimum-safe byte assertion removed',
  "throw new Error('context budget trimmed the minimum safe context — refusing to build this turn');", 'void 0;');
sub('STRUCT namedTargets dropped from the minimum safe context',
  "'activeChannelId', 'namedTargets']", "'activeChannelId']");
sub('STRUCT pendingAction dropped from the minimum safe context',
  "'collections', 'pendingAction',", "'collections',");
sub('STRUCT collections dropped from the minimum safe context',
  "'counts', 'collections', 'pendingAction'", "'counts', 'pendingAction'");
sub('STRUCT history trims NEWEST first (oldest preserved)',
  'packRecord[key] = keepNewest ? arr.slice(arr.length - keep) : arr.slice(0, keep);',
  'packRecord[key] = arr.slice(0, keep);');
sub('STRUCT conversationHistory pinned at 1 on the hard pass (V61-D1 revert)',
  "const thisFloor = key === 'conversationHistory' && floor > 0 ? Math.max(1, floor) : floor;",
  "const thisFloor = key === 'conversationHistory' ? 1 : floor;");
sub('STRUCT the trim list is never recorded', 'contextTrimmed.push(`${key} ${arr.length}->${keep}`);', 'void key;');
sub('STRUCT overBudget always reported false',
  'contextBudget.overBudget = contextBudget.estimatedTokens > packBudget;', 'contextBudget.overBudget = false;');
sub('STRUCT packTokens measures the pack WITHOUT contextBudget',
  'const packTokens = () => Math.ceil(JSON.stringify({ command, contextPack: pack }).length / 4);',
  'const packTokens = () => { const c = { ...(pack as Record<string, unknown>) }; delete c.contextBudget; return Math.ceil(JSON.stringify({ command, contextPack: c }).length / 4); };');
sub('STRUCT NaN-safe cap parser reverted (V63-D6 revert)',
  'return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;', 'return Number(raw);');
sub('STRUCT estimateRequestTokens forgets the system prompt',
  'return SYSTEM_PROMPT_TOKENS + Math.ceil(body.length / 4);', 'return Math.ceil(body.length / 4);');
sub('STRUCT estimateRequestTokens measures the COMPACT form',
  'const body = JSON.stringify(payload, null, 2)', 'const body = JSON.stringify(payload)');
sub('STRUCT the command is only counted once in the refusal (V62-D5 revert)',
  'const commandTokens = estimateTokens(command) * 2;', 'const commandTokens = estimateTokens(command);');
sub('STRUCT the image size gate is removed',
  'if (attachedImage && imageBytes(attachedImage.base64) > IMAGE_BYTES_MAX) {', 'if (false) {');
sub('STRUCT the model-context-window gate is removed', 'if (requestTokens > modelContextMax) {', 'if (false) {');
sub('STRUCT the pack preflight refusal is removed', 'if (tokenEstimate > hardMax) {', 'if (false) {');

// --- the executor id gates
sub('STRUCT packIdSet forgets the trim provenance (V62-D1 revert)',
  "for (const id of (contextProvenance?.[name] || [])) out.add(id);\r\n            for (const row of (((contextPack as any)?.namedTargets || {})[name] || [])) {",
  "for (const row of (((contextPack as any)?.namedTargets || {})[name] || [])) {");
sub('STRUCT archivedCompanyIds forgets the trim provenance (V63-D2 revert)',
  '...(contextProvenance?.archivedCompanies || []),\r\n        ]);', '        ]);');
sub('STRUCT archivedCompanyIds ignores namedTargets',
  '...(((contextPack as any)?.namedTargets || {}).companies || [])]', ']');
sub('STRUCT the archived-parent create block is disabled',
  'if (item.companyId && archivedCompanyIds.has(item.companyId)) {', 'if (false) {');
sub('STRUCT deleteTaskIds no longer checked against context',
  "const deleteTaskIds = requestedDeleteIds.filter((id): id is string => typeof id === 'string' && contextTaskIds.has(id));",
  "const deleteTaskIds = requestedDeleteIds.filter((id): id is string => typeof id === 'string');");
sub('STRUCT updateCompanies no longer checked against context',
  "typeof (c as any).id === 'string' && contextCompanyIds.has((c as any).id))",
  "typeof (c as any).id === 'string')");
sub('STRUCT the raw company lifecycle-edit block is bypassed',
  "const statusChangeIsLifecycleTransition = c.status && (c.status === 'archived' || currentStatus === 'archived');",
  'const statusChangeIsLifecycleTransition = false;');

// --- provenance capture itself
sub('STRUCT provenanceIds captured AFTER the trim',
  'const contextTrimmed: string[] = [];', 'for (const k of Object.keys(provenanceIds)) delete provenanceIds[k];\n  const contextTrimmed: string[] = [];');

// ---------------------------------------------------------------- run
console.log(`V64 extended sweep: ${namedRegex.length} named regexes (${namedRegex.length * 2} mutants) + ${mutants.length - namedRegex.length * 2} structural = ${mutants.length} mutants, across ${SUITES.length} suites\n`);
const survived = [], noApply = [];
let killed = 0;
for (const { id, apply } of mutants) {
  const mutated = apply(text);
  if (mutated === text) { noApply.push(id); console.log('NO-APPLY ' + id); continue; }
  const file = DIR + '/' + id.replace(/[^A-Za-z0-9_]+/g, '_').slice(0, 120) + '.ts';
  writeFileSync(file, mutated);
  let killer = null;
  for (const suite of SUITES) {
    try { execFileSync(process.execPath, [suite], { env: { ...process.env, SEM_INDEX_SRC: file }, stdio: 'pipe', timeout: 300000 }); }
    catch { killer = suite.split('/').pop(); break; }
  }
  if (killer) { killed++; console.log('KILLED   ' + id.padEnd(64) + killer); }
  else { survived.push(id); console.log('SURVIVED ' + id); }
}
const SHA1 = createHash('sha256').update(readFileSync(SRC)).digest('hex');
console.log('\ncandidate index.ts unchanged: ' + (SHA1 === SHA0) + '  (' + SHA1 + ')');
console.log(`V64 extended sweep: ${killed} killed, ${survived.length} SURVIVED, ${noApply.length} did not apply`);
for (const s of survived) console.log('  SURVIVED: ' + s);
for (const s of noApply) console.log('  NO-APPLY: ' + s);
if (SHA1 !== SHA0) process.exit(2);

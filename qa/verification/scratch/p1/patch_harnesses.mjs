// Harness updates for the P1 package: window suites gain the request-side names the
// executor now reads (command, factLines, lifecycleReports, organizationGraphCheck, workOrder);
// the lifecycle-evidence harness follows the envelope rule (non-verified outcomes are recorded
// with postconditionPassed=false, never confirmed) and unconditional persistence.
import { readFileSync, writeFileSync } from 'node:fs';
function patch(path, pairs) {
  const raw = readFileSync(path, 'utf8'); const nl = raw.includes('\r\n') ? '\r\n' : '\n'; let s = raw.replace(/\r\n/g, '\n');
  for (const [a, b, label] of pairs) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${path} ${label}: found ${n}`); s = s.replace(a, () => b); }
  writeFileSync(path, s.replace(/\n/g, nl)); console.log('patched', path);
}

// 1. _gate_extract: request-side fallbacks above every window.
patch('qa/scenarios-runner/_gate_extract.mjs', [[
`  return decls.join('\\n') + '\\n' + slice;
}`,
`  // P1 (2026-09-07, governance/OPERATING_TRUTH_MODEL.md §3): the executor window now reads
  // request-side names that live above every window. Harness turns carry no command, so the
  // default is a mutation-intent command — the belt stays measurable exactly as before; the
  // intent gate itself is pinned by architecture_final_claim_contract.mjs with explicit
  // commands. A window that declares one of these itself simply shadows the global.
  const requestSide = [
    "if (typeof globalThis.command === 'undefined') globalThis.command = 'archive it';",
    "if (typeof globalThis.factLines === 'undefined') globalThis.factLines = [];",
    "if (typeof globalThis.lifecycleReports === 'undefined') globalThis.lifecycleReports = [];",
    "if (typeof globalThis.organizationGraphCheck === 'undefined') globalThis.organizationGraphCheck = null;",
    "if (typeof globalThis.workOrder === 'undefined') globalThis.workOrder = { id: 'wo-harness' };",
    "if (typeof globalThis.requestedIntent === 'undefined') globalThis.requestedIntent = { verb: 'archive', field: null };",
    "if (typeof globalThis.executedVerifiedCount === 'undefined') globalThis.executedVerifiedCount = 0;",
  ];
  return decls.join('\\n') + '\\n' + requestSide.join('\\n') + '\\n' + slice;
}`, 'preamble']]);

// 2. lifecycle_evidence: company slice names, envelope rule, unconditional persistence.
patch('qa/scenarios-runner/lifecycle_evidence_and_output_persistence_contract.mjs', [
  [`const runCompany = new AsyncFunction('supabase', 'archiveCompanyIds', 'restoreCompanyIds', 'companyNameById', 'recordExecution',
  COMPANY_SLICE + '\\n; return archiveRestoreReport;');`,
   `// P1: the company loops now also fold server-side resolution outcomes (disambiguation,
// unresolved names) into the report and may arm a pendingAction on the result.
const runCompany = new AsyncFunction('supabase', 'archiveCompanyIds', 'restoreCompanyIds', 'companyNameById', 'recordExecution',
  'lifecycleDisambiguation', 'lifecycleUnresolvedLines', 'result',
  COMPANY_SLICE + '\\n; return archiveRestoreReport;');`, 'runCompany'],
  [`  else if (kind === 'company-archive') await runCompany(sb, [ID], [], names, rec);
  else if (kind === 'company-restore') await runCompany(sb, [], [ID], names, rec);`,
   `  else if (kind === 'company-archive') await runCompany(sb, [ID], [], names, rec, [], [], { pendingAction: null });
  else if (kind === 'company-restore') await runCompany(sb, [], [ID], names, rec, [], [], { pendingAction: null });`, 'runCompany-calls'],
  [`    check('E ' + kind + ': "' + label + '" records NO evidence',
      seen.length === 0,
      'This is not a mutation performed this turn, so it must never be able to support a mutation_result claim. Measured: ' + JSON.stringify(seen));`,
   `    // P1 (governance/OPERATING_TRUTH_MODEL.md §4.1): a non-verified outcome may be RECORDED as
    // an envelope (executed=false or postcondition unverified) so the receipt can name it,
    // but it must NEVER carry postconditionPassed=true — that is the only thing that can
    // support a mutation_result claim.
    check('E ' + kind + ': "' + label + '" records NO CONFIRMED evidence',
      seen.every((e) => e.postconditionPassed === false),
      'This is not a mutation performed this turn, so it must never be able to support a mutation_result claim. Measured: ' + JSON.stringify(seen));`, 'no-confirmed'],
  [`const PERSIST_SLICE = slice(
  'if (groundedOutcomeThisTurn || lifecycleMismatchCorrections.length > 0',
  "await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);",
  'the work_orders.output persist condition') + '\\n}';`,
   `// P1 (governance/OPERATING_TRUTH_MODEL.md §3 rule 6): the output is persisted on EVERY turn.
// The slice starts at the void-references line the source keeps for the retired gate names.
const PERSIST_SLICE = slice(
  'void groundedOutcomeThisTurn;',
  "await supabase.from('work_orders').update({ output: result }).eq('id', workOrder.id);",
  'the work_orders.output persist condition');`, 'persist-slice'],
  [`check('P6 an ordinary uncorrected turn is NOT re-persisted',
  (await persisted({})) === null,
  'Nothing changed, so the RPC-written p_output already is the truth. Re-writing it would be pointless traffic, not a correctness fix.');`,
   `check('P6 an ordinary uncorrected turn IS persisted too (P1: every turn, empty ledger included)',
  (await persisted({})) !== null,
  'governance/OPERATING_TRUTH_MODEL.md §3 rule 6: the verified envelope, ledger and turn verdict are persisted on every turn so the narrative tier can tell a verified turn from an unverified one.');`, 'P6'],
]);

// 3. v92_open_regression: the decision window reads requestedIntent.
patch('qa/scenarios-runner/v92_open_regression_contract.mjs', [
  [`  const fn = new Function('verifiedClaims', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'result', 'rawClaims', 'deterministicPrefix', 'claimExecutionEvidence', 'hasRejectedClaims',
    slice + '\\nreturn { legacyProseFallback, rewriteFromStructure, claimsPastCompletionWithNoGrounding };');`,
   `  // P1: the consumers are gated on request intent (never on pendingAction); the harness
  // supplies a mutation-intent turn so the belt itself stays measurable.
  const fn = new Function('verifiedClaims', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'result', 'rawClaims', 'deterministicPrefix', 'claimExecutionEvidence', 'hasRejectedClaims', 'requestedIntent',
    slice + '\\nreturn { legacyProseFallback, rewriteFromStructure, claimsPastCompletionWithNoGrounding };');`, 'fn'],
  [`      { summary: t.summary, pendingAction: t.pendingAction ?? null, claims: t.rawClaims }, t.rawClaims, t.deterministicPrefix, t.claimExecutionEvidence, t.hasRejectedClaims);`,
   `      { summary: t.summary, pendingAction: t.pendingAction ?? null, claims: t.rawClaims }, t.rawClaims, t.deterministicPrefix, t.claimExecutionEvidence, t.hasRejectedClaims, t.requestedIntent ?? { verb: 'archive', field: null });`, 'call'],
]);

// 4. index.ts: the receipt yields to a structural re-render that already happened.
patch('supabase/functions/sem-ai-command/index.ts', [
  [`        if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt) {`,
   `        if (requestedIntent !== null && executedVerifiedCount === 0 && lifecycleReports.length === 0 && !receiptExempt && !rewriteFromStructure) {`, 'receipt-gate'],
]);

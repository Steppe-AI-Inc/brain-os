// Independent verifier #7 mutation-testing battery (campaign #67).
// Mutates the REAL index.ts one guard at a time, runs every behavioural suite, restores
// byte-identically and hash-verifies after EACH mutation.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT, SRC, ORIG, ORIG_HASH, SUITES } from './mutate67_head.mjs';

const NO_ACTION_GUARD = "if (!action) return { verdict: 'unsupported', reason: 'mutation claim carries no action to verify' };";
const NO_ID_GUARD = "if (!resourceId) return { verdict: 'unsupported', reason: 'mutation claim carries no canonical resource id' };";
const TYPED_LINE = "const typed = TYPED_FALLBACK[resourceType] || `the ${resourceType || 'record'}`;";

const MUTATIONS = [
  ['M01 remove action-required guard', NO_ACTION_GUARD, ''],
  ['M02 action mismatch no longer rejects', "if (!actions.has(action)) return { verdict: 'unsupported', reason: 'executed '", "if (false) return { verdict: 'unsupported', reason: 'executed '"],
  ['M03 missing-evidence no longer rejects', "if (!actions) return { verdict: 'unsupported', reason: 'no execution evidence for '", "if (false) return { verdict: 'unsupported', reason: 'no execution evidence for '"],
  ['M04 postcondition filter removed', 'if (!e.postconditionPassed) continue;', ''],
  ['M05 stale-read guard removed', 'if (evidenceIndex.has(key)) {', 'if (false) {'],
  ['M06 revert drift check to 72dabe6 (!rawClaims)', 'const legacyProseFallback = !hasSupportedMutationClaim', 'const legacyProseFallback = !rawClaims'],
  ['M07 hasSupportedMutationClaim accepts any verdict', "const hasSupportedMutationClaim = verifiedClaims.some((v) => v.verdict === 'supported'", 'const hasSupportedMutationClaim = verifiedClaims.some((v) => true'],
  ['M08 hasSupportedMutationClaim accepts any claim type', "&& (v.claim.type === 'mutation_result' || v.claim.type === 'assignment'));", '&& true);'],
  ['M09 displayName typed fallback becomes the raw id', TYPED_LINE, 'const typed = id;'],
  ['M11 DEBUG id flag defaults ON', "const DEBUG_RESOURCE_IDS = Deno.env.get('SEM_AI_DEBUG_RESOURCE_IDS') === '1';", 'const DEBUG_RESOURCE_IDS = true;'],
  ['M12 task-archive evidence ignores changed===true', "if (r.changed === true && r.postconditionPassed !== false) recordExecution('task', 'archive', id, true);", "recordExecution('task', 'archive', id, true);"],
  ['M13 task-restore evidence ignores changed===true', "if (r.changed === true && r.postconditionPassed !== false) recordExecution('task', 'restore', id, true);", "recordExecution('task', 'restore', id, true);"],
  ['M14 goal-archive evidence ignores changed===true', "if (r.changed === true && r.postconditionPassed !== false) recordExecution('goal', 'archive', id, true);", "recordExecution('goal', 'archive', id, true);"],
  ['M15 goal-restore evidence ignores changed===true', "if (r.changed === true && r.postconditionPassed !== false) recordExecution('goal', 'restore', id, true);", "recordExecution('goal', 'restore', id, true);"],
  ['M16 company-archive evidence ignores changed===true', "if (r.changed === true && r.postconditionPassed === true) recordExecution('company', 'archive', id, true);", "recordExecution('company', 'archive', id, true);"],
  ['M17 rejected claims no longer rewrite the summary', 'if (hasRejectedClaims) {', 'if (false) {'],
  ['M18 pendingAction prompt dropped from the rewrite', 'const pendingPrompt = pa && typeof pa === ', 'const pendingPrompt = false && typeof pa === '],
  ['M19 questions dropped from the rewrite', 'result.summary = [...supportedLines, ...rejectedLines, ...envelopeQuestions, promptWithOptions]', 'result.summary = [...supportedLines, ...rejectedLines, promptWithOptions]'],
  ['M20 envelope moved BACK before the confirmation override', 'ENVELOPE_MOVE', ''],
  ['M22 no-resource-id guard removed (mutation claims)', NO_ID_GUARD, ''],
  ['M23 unknown claim type becomes supported', "return { verdict: 'unknown', reason: 'unrecognised claim type: '", "return { verdict: 'supported', reason: 'unrecognised claim type: '"],
  ['M24 historical_event becomes supported', "return { verdict: 'unknown', reason: 'no indexed audit trail", "return { verdict: 'supported', reason: 'no indexed audit trail"],
  ['M25 absent-from-canonical-read state claim becomes supported', "if (!row) return { verdict: 'unknown', reason: 'resource not present", "if (!row) return { verdict: 'supported', reason: 'resource not present"],
  ['M26 contradicted state claim becomes supported', "return { verdict: 'contradicted', reason: predicate + ' is '", "return { verdict: 'supported', reason: predicate + ' is '"],
  ['M27 rejected claims no longer counted as ungrounded', 'const claimsPastCompletionWithNoGrounding = hasRejectedClaims || legacyProseFallback;', 'const claimsPastCompletionWithNoGrounding = legacyProseFallback;'],
  ['M28 supported lines dropped from the rewrite', 'result.summary = [...supportedLines, ...rejectedLines,', 'result.summary = [...rejectedLines,'],
  ['M29 rejected lines dropped from the rewrite', '...supportedLines, ...rejectedLines, ...envelopeQuestions', '...supportedLines, ...envelopeQuestions'],
  ['M30 persist condition drops the claim gate', '|| claimsFutureActionWithNoPlan || claimsPastCompletionWithNoGrounding) {', '|| claimsFutureActionWithNoPlan) {'],
];
export { MUTATIONS };

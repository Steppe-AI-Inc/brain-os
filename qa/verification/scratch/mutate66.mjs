// Mutation testing of the structured-claim guards. Restores index.ts byte-identical
// (sha256-verified) after EVERY mutation.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SRC = 'supabase/functions/sem-ai-command/index.ts';
const original = readFileSync(SRC);
const ORIG_HASH = createHash('sha256').update(original).digest('hex');
const text = original.toString('utf8');

const MUTS = [
  ['M1  exact-id matching -> key ignores the id', "const key = resourceType + '|' + resourceId;", "const key = resourceType + '|' + 'ANY';"],
  ['M2  action matching removed', "if (action && !actions.has(action)) return { verdict: 'unsupported', reason: 'executed ' + [...actions].join('/') + ' on this resource, not ' + action };", ""],
  ['M3  postcondition requirement removed', "if (!e.postconditionPassed) continue;", ""],
  ['M4  no-id rejection removed', "if (!resourceId) return { verdict: 'unsupported', reason: 'mutation claim carries no canonical resource id' };", ""],
  ['M5  historical_event blessed as supported', "return { verdict: 'unknown', reason: 'no indexed audit trail for prior-turn events (see issue #5 A/C/D/E, still open)' };", "return { verdict: 'supported', reason: 'x' };"],
  ['M6  canonical-read contradiction -> supported', "return { verdict: 'contradicted', reason: predicate + ' is ' + String(actual) + ', not ' + String(claim.expectedValue) };", "return { verdict: 'supported', reason: 'x' };"],
  ['M7  envelope.summary decoupled from result.summary', "          summary: result.summary,\n", "          summary: 'DECOUPLED',\n"],
  ['M8  legacy fallback no longer suppressed by claims', "const legacyProseFallback = !rawClaims\n", "const legacyProseFallback = true\n"],
  ['M9  legacy fallback disabled entirely', "const legacyProseFallback = !rawClaims\n", "const legacyProseFallback = false\n"],
  ['M10 supported-line filter accepts every verdict', ".filter((v) => v.verdict === 'supported')", ".filter(() => true)"],
  ['M11 non-object claims no longer skipped', "if (!claim || typeof claim !== 'object') continue;", "if (false) continue;"],
  ['M12 resourceId type check dropped (accept non-strings)', "const resourceId = typeof claim.resourceId === 'string' ? claim.resourceId : null;", "const resourceId = claim.resourceId == null ? null : String(claim.resourceId);"],
  ['M13 rejected verdicts no longer routed to rejectedClaims', "else if (outcome.verdict === 'unsupported' || outcome.verdict === 'contradicted') rejectedClaims.push(row);", "else if (false) rejectedClaims.push(row);"],
  ['M14 missing expectedValue -> supported instead of unknown', "if (claim.expectedValue === undefined) return { verdict: 'unknown', reason: 'no expected value supplied for predicate ' + predicate };", ""],
  ['M15 absent canonical row -> supported instead of unknown', "if (!row) return { verdict: 'unknown', reason: 'resource not present in this turn’s canonical read' };", "if (!row) return { verdict: 'supported', reason: 'x' };"],
  ['M16 state claim with no id -> supported instead of unknown', "if (!resourceId) return { verdict: 'unknown', reason: 'state claim carries no canonical resource id' };", ""],
  ['M17 unrecognised claim type -> supported', "return { verdict: 'unknown', reason: 'unrecognised claim type: ' + (type || '(none)') };", "return { verdict: 'supported', reason: 'x' };"],
  ['M18 questions no longer filtered/carried', "const envelopeQuestions = Array.isArray(result.questions) ? result.questions.filter((q) => typeof q === 'string' && q.trim().length > 0) : [];", "const envelopeQuestions = [];"],
  ['M19 proposedActions dropped from envelope', "const envelopeProposedActions = Array.isArray(result.proposedActions) ? result.proposedActions.filter((a) => typeof a === 'string' && a.trim().length > 0) : [];", "const envelopeProposedActions = [];"],
  ['M20 pendingAction prompt no longer preserved in correction', "const promptWithOptions = paOptions.length > 0", "const promptWithOptions = false && paOptions.length > 0"],
  ['M21 canonical buckets reduced to companies only', "[['companies', 'company'], ['people', 'person'], ['projects', 'project'], ['tasks', 'task'], ['goals', 'goal'], ['approvals', 'approval'], ['departments', 'department']]", "[['companies', 'company']]"],
  ['M22 evidence recorder ignores the changed/postcondition gate (archive)', "if (r.changed === true && r.postconditionPassed === true) recordExecution('company', 'archive', id, true);", "recordExecution('company', 'archive', id, true);"],
  ['M23 rejectedClaims never render a correction line', "const rejectedLines = rejectedClaims.map((r) => {", "const rejectedLines = [].map((r) => {"],
  ['M24 hasRejectedClaims always false', "const hasRejectedClaims = rejectedClaims.length > 0;", "const hasRejectedClaims = false;"],
];

const results = [];
for (const [name, from, to] of MUTS) {
  const occurrences = text.split(from).length - 1;
  if (occurrences !== 1) { results.push([name, 'SKIP', 'anchor occurrences=' + occurrences]); continue; }
  writeFileSync(SRC, text.replace(from, to));
  let detected = false, detail = '';
  try {
    execSync('node qa/scenarios-runner/structured_claim_verification.mjs', { stdio: 'pipe' });
  } catch (e) {
    detected = true;
    const out = (e.stdout || Buffer.from('')).toString() + (e.stderr || Buffer.from('')).toString();
    detail = (out.match(/FAIL [^\n]+/g) || ['(threw)']).slice(0, 2).join(' ; ');
  }
  writeFileSync(SRC, original);
  const h = createHash('sha256').update(readFileSync(SRC)).digest('hex');
  if (h !== ORIG_HASH) { console.error('FATAL: restore failed for ' + name); process.exit(2); }
  results.push([name, detected ? 'DETECTED' : 'UNDETECTED', detail]);
}
for (const [n, s, d] of results) console.log(s.padEnd(11) + n + (d ? '   <- ' + d.slice(0, 110) : ''));
console.log('\nUNDETECTED: ' + results.filter((r) => r[1] === 'UNDETECTED').length + ' / SKIPPED: ' + results.filter((r) => r[1] === 'SKIP').length + ' / total ' + results.length);
console.log('index.ts sha256 restored: ' + createHash('sha256').update(readFileSync(SRC)).digest('hex'));

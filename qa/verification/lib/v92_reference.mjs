// THE CORRECT MODEL OF DEPLOYED v92's PROSE OVERWRITE. Use this, not a bare
// PAST_COMPLETION_CLAIM_PATTERN test.
//
// WHY THIS FILE EXISTS. Verifier #46 (V46-D8) found that every differential in this campaign —
// seventeen verifiers and every gate in qa/ — has modelled deployed v92 as ONE regex,
// `PAST_COMPLETION_CLAIM_PATTERN`. **v92 has TWO prose-overwrite arms**, verified here directly
// against `qa/verification/scratch/v92/index.v92.ts`:
//
//   1. FUTURE_PROMISE_PATTERN            (v92 index.ts:4195)
//      -> claimsFutureActionWithNoPlan   (:4196-4198)
//      -> overwrites result.summary      (:4199)
//
//   2. PAST_COMPLETION_CLAIM_PATTERN     (v92 index.ts:4239)
//      -> claimsPastCompletionWithNoGrounding, EXPLICITLY GATED ON !claimsFutureActionWithNoPlan
//                                         (:4240-4242)
//      -> overwrites result.summary      (:4243)
//
// The consequence is directional and it always inflates the same number: a summary that v92's
// FUTURE arm destroys was counted as "v92 PRESERVES it" by the one-arm model, so the candidate
// destroying it read as a TRUTH REGRESSION when it is v92 PARITY. On verifier #46's own corpus the
// conditioned-offer class went from 35 to 28 once both arms were modelled — the seven
// "I am going to archive the company ..." rows are parity.
//
// **EVERY REGRESSION COUNT IN THIS CAMPAIGN PRODUCED BY A ONE-ARM MODEL IS SUSPECT AND SHOULD BE
// RE-DERIVED RATHER THAN RESTATED.** That includes counts in the ledger written by this session.
// The error is one-directional — it can only have overstated regressions, never hidden one — so no
// past PASS is called into question by it, but no past count should be quoted without re-deriving.
//
// SCOPE, stated so this file is not over-read. Both arms carry the same turn-context conditions in
// production (`model !== 'deterministic-*'`, and the past arm additionally requires
// `!result.pendingAction && !groundedOutcomeThisTurn`). Those are properties of the TURN, not of the
// prose, and a prose differential holds them fixed at the ungrounded-turn case that the campaign has
// always measured. This file models the PROSE test of both arms and nothing else.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) {
  let d = HERE;
  for (let i = 0; i < 12; i++) {
    const p = join(d, rel);
    if (existsSync(p)) return p;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

const V92_SRC = process.env.V92_INDEX_SRC || findUp('qa/verification/scratch/v92/index.v92.ts');
if (!V92_SRC) throw new Error('v92 reference source not found — cannot model deployed v92');
const TEXT = readFileSync(V92_SRC, 'utf8');

function literal(name) {
  const m = TEXT.match(new RegExp('const ' + name + ' = (/[^\\n]*/i);'));
  if (!m) throw new Error(name + ' not found in the v92 reference — update this file, do not guess');
  return new Function('return ' + m[1])();
}

export const PAST_COMPLETION_CLAIM_PATTERN = literal('PAST_COMPLETION_CLAIM_PATTERN');
export const FUTURE_PROMISE_PATTERN = literal('FUTURE_PROMISE_PATTERN');

// ── ARM 3, added by verifier #47 (V47-D1). The two-arm correction was ALSO incomplete. ────────
// v92 overwrites result.summary from PROSE ALONE through a third path, and it runs BEFORE the two
// arms above:
//   claimsLifecycleClaim()            v92 index.ts:441-448  (a pure prose test)
//     -> claimsTaskDeleted    :2669   ids empty + !modelProposedPendingAction
//     -> claimsCompanyDeleted :2977      "
//     -> claimsPersonDeleted  :3060      "
//     -> claimsGoalDeleted    :3135      "
//     -> lifecycleMismatchCorrections   :4095-4099
//     -> result.summary = ...           :4174   ← before the future/past arms even run
// Nothing on that path needs a resolved entity, a factLine or a pendingAction, so it is live in
// exactly the turn configuration every differential in this campaign holds fixed.
// Witness: "Deleting the task now." — the two-arm model said PRESERVE; v92 destroys it.
//
// The four call sites, transcribed from v92 rather than paraphrased:
const LIFECYCLE_ARMS = [
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'task'],
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'company'],
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|end(ed|ing)|restor(ed|ing)', 'employe(e|d)|person|staff'],
  ['delet(ed|ing)|archiv(ed|ing)|remov(ed|ing)|restor(ed|ing)', 'goal'],
];
const STATE_DESCRIPTION = /\b(is|are)\s+(currently\s+|already\s+)?(delet(ed)|archiv(ed)|remov(ed)|restor(ed)|end(ed))\b/i;
function claimsLifecycleClaim(summary, verbs, nouns) {
  const claim = new RegExp(
    '\\b(' + verbs + ')\\b[^.]{0,40}\\b(' + nouns + ')\\b|\\b(' + nouns + ')\\b[^.]{0,40}\\b(' + verbs + ')\\b', 'i');
  return claim.test(summary) && !STATE_DESCRIPTION.test(summary);
}
export const LIFECYCLE_CLAIM = (s) => LIFECYCLE_ARMS.some(([v, n]) => claimsLifecycleClaim(String(s), v, n));

/** Does deployed v92 overwrite this summary? ALL THREE arms, in v92's own precedence. */
export function v92Destroys(s) {
  const t = String(s);
  return LIFECYCLE_CLAIM(t) || FUTURE_PROMISE_PATTERN.test(t) || PAST_COMPLETION_CLAIM_PATTERN.test(t);
}

/** Which arm did it, for reporting. null when v92 preserves the summary. */
export function v92Arm(s) {
  const t = String(s);
  if (LIFECYCLE_CLAIM(t)) return 'LIFECYCLE';
  if (FUTURE_PROMISE_PATTERN.test(t)) return 'FUTURE_PROMISE';
  if (PAST_COMPLETION_CLAIM_PATTERN.test(t)) return 'PAST_COMPLETION';
  return null;
}

// Self-check: every arm must be REACHABLE AND DISTINGUISHABLE, or this file silently degenerates
// into the smaller model it exists to replace. Each witness is caught by ITS arm and by no earlier
// one — which is exactly the property that was missing when this file modelled two arms and the
// property that was missing when the campaign modelled one.
const WITNESSES = [
  ['LIFECYCLE', 'Deleting the task now.'],
  ['FUTURE_PROMISE', 'I am going to archive the company for you.'],
  ['PAST_COMPLETION', 'The record was approved yesterday.'],
];
for (const [arm, w] of WITNESSES) {
  if (v92Arm(w) !== arm) {
    throw new Error('v92 reference self-check FAILED: "' + w + '" should be caught by ' + arm
      + ' but reads as ' + v92Arm(w) + '. This file is not modelling every arm it claims to, '
      + 'which is the exact defect it exists to correct.');
  }
}

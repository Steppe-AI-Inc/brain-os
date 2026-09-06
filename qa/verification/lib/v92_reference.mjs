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

/** Does deployed v92 overwrite this summary? BOTH arms, in v92's own precedence. */
export function v92Destroys(s) {
  const t = String(s);
  return FUTURE_PROMISE_PATTERN.test(t) || PAST_COMPLETION_CLAIM_PATTERN.test(t);
}

/** Which arm did it, for reporting. null when v92 preserves the summary. */
export function v92Arm(s) {
  const t = String(s);
  if (FUTURE_PROMISE_PATTERN.test(t)) return 'FUTURE_PROMISE';
  if (PAST_COMPLETION_CLAIM_PATTERN.test(t)) return 'PAST_COMPLETION';
  return null;
}

// Self-check: the two arms must be DIFFERENT tests, or this file is the one-arm model wearing a
// new name. A row only the future arm catches proves the second arm is real and reachable.
const WITNESS = 'I am going to archive the company for you.';
if (!FUTURE_PROMISE_PATTERN.test(WITNESS) || PAST_COMPLETION_CLAIM_PATTERN.test(WITNESS)) {
  throw new Error('v92 reference self-check FAILED: the future-promise arm is not distinguishable, '
    + 'so this file would silently be the same one-arm model it exists to replace');
}

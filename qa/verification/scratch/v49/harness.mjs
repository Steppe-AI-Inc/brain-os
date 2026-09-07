// VERIFIER #49 — my own model of the CANDIDATE's founder-facing prose-overwrite decision, and of
// deployed v92's, on an ungrounded LLM turn. Built from the candidate bytes; only the mechanical
// scanner (belt_extract.mjs) and the v92 three-arm reference are re-used, both read line by line.
//
// TURN MODEL. Both builds evaluate (in this order, each one short-circuiting the rest):
//   LIFECYCLE   claimsLifecycleClaim (pure prose; byte-identical in both — verified by diff:
//               no +/- line touches claimsLifecycleClaim/claims*Deleted/stateDescriptionPattern),
//               gated in BOTH by `ids empty && !modelProposedPendingAction`  -> OFF on pendingAction turns
//   FUTURE      FUTURE_PROMISE_PATTERN, gated `!result.pendingAction && !grounded`;
//               candidate adds the D4 conditioned-offer guard and the curly apostrophe
//   PAST/BELT   v92: PAST_COMPLETION_CLAIM_PATTERN gated `!result.pendingAction && !grounded && !future`
//               candidate: readsAsCompletion(...) gated `!grounded && !future` — NO pendingAction term
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate, extractConst, detype } from '../../lib/belt_extract.mjs';
import { LIFECYCLE_CLAIM, FUTURE_PROMISE_PATTERN as V92_FUTURE, PAST_COMPLETION_CLAIM_PATTERN as V92_PAST } from '../../lib/v92_reference.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAND_PATH = process.env.SEM_INDEX_SRC || join(HERE, '..', '..', '..', '..', 'supabase', 'functions', 'sem-ai-command', 'index.ts');
const SRC = readFileSync(CAND_PATH, 'utf8');

// ---- candidate FUTURE arm: pattern + the D4 guard, both lifted from the shipped statement ----
export const CAND_FUTURE = (() => {
  const m = SRC.match(/const FUTURE_PROMISE_PATTERN = (\/[^\n]*\/i);/);
  if (!m) throw new Error('candidate FUTURE_PROMISE_PATTERN not found');
  return new Function('return ' + m[1])();
})();
export const CAND_FUTURE_GUARD = (() => {
  // the shipped consumer: ((__s) => FUTURE_PROMISE_PATTERN.test(__s) && !/GUARD/i.test(__s))(String(result.summary || ''))
  const stmt = extractConst(SRC, 'claimsFutureActionWithNoPlan');
  const m = stmt.match(/FUTURE_PROMISE_PATTERN\.test\(__s\) && !(\/(?:[^\/\\\n]|\\.)+\/i)\.test\(__s\)/);
  if (!m) throw new Error('D4 guard not found in claimsFutureActionWithNoPlan — the shipped shape changed');
  return new Function('return ' + m[1])();
})();
export const candFutureFires = (s) => CAND_FUTURE.test(s) && !CAND_FUTURE_GUARD.test(s);

// ---- candidate lifecycle arm: assert byte-identity with v92 rather than re-model it ----
{
  const v92 = readFileSync(process.env.V92_INDEX_SRC || join(HERE, '..', 'v92', 'index.v92.ts'), 'utf8');
  const grab = (raw) => {
    const src = raw.replace(/\r\n/g, '\n');
    const i = src.indexOf('function claimsLifecycleClaim');
    const j = src.indexOf('\n}\n', i);
    if (i < 0 || j < 0) throw new Error('claimsLifecycleClaim not found');
    return src.slice(i, j + 3);
  };
  if (grab(SRC) !== grab(v92)) throw new Error('claimsLifecycleClaim differs between v92 and candidate — re-model it');
  const arms = (src) => [...src.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => m[1] + '|' + m[2]).join('\n');
  if (arms(SRC) !== arms(v92) || arms(SRC).split('\n').length !== 4) throw new Error('lifecycle call sites differ between v92 and candidate');
}

// ---- the belt, from the candidate bytes ----
const gateCache = new Map();
let legacyExprCache = null;
function shippedBelt(t, names, pendingAction) {
  if (legacyExprCache === null) {
    const decl = extractConst(readFileSync(CAND_PATH, 'utf8'), 'legacyProseFallback');
    const eq = decl.indexOf('=');
    legacyExprCache = decl.slice(eq + 1).trim().replace(/;s*$/, '');
  }
  return new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan',
    'return (' + legacyExprCache + ');')(belt(names).readsAsCompletion, { summary: t, pendingAction: pendingAction ? { kind: 'confirm' } : null }, false, 'llm', false, false) === true;
}
export function belt(names = []) {
  const key = names.slice().sort().join('');
  if (!gateCache.has(key)) gateCache.set(key, buildGate(CAND_PATH, (c) => c, names));
  return gateCache.get(key);
}

/**
 * What does the CANDIDATE do to `summary` on an ungrounded LLM turn?
 * returns null (preserved) or the arm that overwrote it.
 */
export function candArm(summary, { names = [], pendingAction = false } = {}) {
  const t = String(summary);
  if (!pendingAction && LIFECYCLE_CLAIM(t)) return 'LIFECYCLE';
  if (!pendingAction && candFutureFires(t)) return 'FUTURE_PROMISE';
  // Evaluate the SHIPPED consumer (legacyProseFallback) with result.pendingAction set, not
  // readsAsCompletion directly: the V49-D1 fix is a pendingAction-conditional history strip at the
  // consumer, invisible to a harness that bypasses the consumer. Same principle as the D4 instrument.
  if (shippedBelt(t, names, pendingAction)) return 'BELT';
  return null;
}
/** What does deployed v92 do to the same summary on the same turn? */
export function v92ArmTurn(summary, { pendingAction = false } = {}) {
  const t = String(summary);
  if (pendingAction) return null; // every v92 prose arm carries !pendingAction (lifecycle via !modelProposedPendingAction)
  if (LIFECYCLE_CLAIM(t)) return 'LIFECYCLE';
  if (V92_FUTURE.test(t)) return 'FUTURE_PROMISE';
  if (V92_PAST.test(t)) return 'PAST_COMPLETION';
  return null;
}

// Self-check: the D4 guard must be reachable (a conditioned offer stands down) and the pendingAction
// switch must be observable, or this file is modelling less than it claims.
{
  if (candFutureFires('I will archive ACME Corp once you confirm.')) throw new Error('harness self-check: D4 guard not modelled');
  if (!candFutureFires('I will archive ACME Corp for you.')) throw new Error('harness self-check: FUTURE arm not modelled');
  if (v92ArmTurn('ACME Corp was archived.', { pendingAction: true }) !== null) throw new Error('harness self-check: v92 pendingAction switch');
  if (candArm('ACME Corp was archived.', { pendingAction: true }) !== 'BELT') throw new Error('harness self-check: candidate belt must still run on a pendingAction turn');
}

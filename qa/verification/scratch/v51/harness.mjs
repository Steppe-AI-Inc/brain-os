// VERIFIER #51 (campaign #111) — MY model of deployed v92's founder-facing prose overwrite and of the
// candidate's, both built from bytes in this worktree. Reused: only the mechanical scanner in
// qa/verification/lib/belt_extract.mjs (read line by line). Nothing is taken from #49/#50's harness
// files except the idea of evaluating the SHIPPED consumer declarations with stubs — which is
// re-derived here from the source, not imported.
//
// TURN MODEL (per build, in precedence order; each earlier arm short-circuits the later ones):
//   LIFECYCLE   claimsLifecycleClaim via claims{Task,Company,Person,Goal}Deleted — BYTE-IDENTICAL in both
//               builds (asserted in inherited_arms.mjs and re-asserted below); every call site carries
//               `!modelProposedPendingAction`, so OFF on a pendingAction turn; NOT gated on grounding.
//   FUTURE      v92: FUTURE_PROMISE_PATTERN gated !pendingAction && !grounded
//               cand: the SHIPPED claimsFutureActionWithNoPlan declaration (adds the conditioned-offer guard)
//   PAST/BELT   v92: PAST_COMPLETION_CLAIM_PATTERN gated !pendingAction && !grounded && !future
//               cand legacy:     the SHIPPED legacyProseFallback declaration (!grounded && !future && !pendingAction)
//               cand structured: the SHIPPED unaccountedCompletionProse declaration && rawClaims !== null
//                                (NOTE: no grounded gate and no model gate — measured separately)
// A further v92 overwrite path (stateClaimCorrections via findEntityStateClaimContradiction over the
// pack's real company/person STATUS) is byte-identical in both builds and fires only on a real status
// contradiction, so it cannot separate the builds; not modelled (disclosed).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGate, extractConst, extractFunction } from '../../lib/belt_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAND_PATH = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : join(HERE, '..', '..', '..', '..', 'supabase', 'functions', 'sem-ai-command', 'index.ts');
export const V92_PATH = process.env.V92_INDEX_SRC ? resolve(process.env.V92_INDEX_SRC) : join(HERE, 'index.v92.git.ts');
const SRC = readFileSync(CAND_PATH, 'utf8').replace(/\r\n/g, '\n');
const V92 = readFileSync(V92_PATH, 'utf8').replace(/\r\n/g, '\n');

const lit = (t, n) => { const m = t.match(new RegExp('const ' + n + ' = (/[^\\n]*/[a-z]*);')); if (!m) throw new Error(n + ' not found'); return new Function('return ' + m[1])(); };
export const V92_PAST = lit(V92, 'PAST_COMPLETION_CLAIM_PATTERN');
export const V92_FUTURE = lit(V92, 'FUTURE_PROMISE_PATTERN');
export const CAND_FUTURE = lit(SRC, 'FUTURE_PROMISE_PATTERN');

// ---- LIFECYCLE arm (shared: byte-identical function + call sites, re-asserted here) ----
{
  if (extractFunction(SRC, 'claimsLifecycleClaim') !== extractFunction(V92, 'claimsLifecycleClaim')) throw new Error('claimsLifecycleClaim differs — re-model');
  const sites = (t) => [...t.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => m[1] + '|' + m[2]).join('\n');
  if (sites(SRC) !== sites(V92) || sites(SRC).split('\n').length !== 4) throw new Error('lifecycle call sites differ');
  for (const n of ['claimsTaskDeleted', 'claimsCompanyDeleted', 'claimsPersonDeleted', 'claimsGoalDeleted']) {
    if (extractConst(SRC, n) !== extractConst(V92, n)) throw new Error(n + ' differs');
    if (!/!modelProposedPendingAction/.test(extractConst(SRC, n))) throw new Error(n + ' is not gated on !modelProposedPendingAction — pendingAction switch would be wrong');
  }
}
const LIFECYCLE_ARMS = [...V92.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]);
const STATE_DESC = lit(V92, 'stateDescriptionPattern');
const lifecycleSrc = extractFunction(V92, 'claimsLifecycleClaim').replace(/\(([^)]*)\)\s*:\s*boolean\s*\{/, (_, p) => '(' + p.split(',').map((x) => x.split(':')[0].trim()).join(', ') + ') {');
if (/:\s*(string|boolean)\b/.test(lifecycleSrc)) throw new Error('TS annotation survived');
const lifecycleFn = new Function('stateDescriptionPattern', lifecycleSrc + '\nreturn claimsLifecycleClaim;')(STATE_DESC);
export const LIFECYCLE = (s) => LIFECYCLE_ARMS.some(([v, n]) => lifecycleFn(String(s), v, n));

// ---- candidate FUTURE arm: the SHIPPED declaration ----
const exprOf = (name) => { const d = extractConst(SRC, name); return d.slice(d.indexOf('=') + 1).replace(/;\s*$/, ''); };
const futureFn = new Function('FUTURE_PROMISE_PATTERN', 'model', 'result', 'groundedOutcomeThisTurn', 'return (' + exprOf('claimsFutureActionWithNoPlan') + ');');
export const candFuture = (s, { pendingAction = false, grounded = false } = {}) =>
  futureFn(CAND_FUTURE, 'llm', { summary: s, pendingAction: pendingAction ? { kind: 'confirm' } : null }, grounded) === true;
export const FUTURE_CANNED = (SRC.match(/if \(claimsFutureActionWithNoPlan\) \{\n\s*result\.summary = '([^']*)';/) || [])[1];
if (!FUTURE_CANNED) throw new Error('FUTURE canned text not found');

// ---- candidate belt consumers: the SHIPPED declarations ----
const gateCache = new Map();
export function belt(names = []) { const k = names.slice().sort().join(''); if (!gateCache.has(k)) gateCache.set(k, buildGate(CAND_PATH, (c) => c, names)); return gateCache.get(k); }
const legacyFn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'return (' + exprOf('legacyProseFallback') + ');');
const unaccFn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'return (' + exprOf('unaccountedCompletionProse') + ');');
const driftFn = new Function('unaccountedCompletionProse', 'rawClaims', 'deterministicPrefix', 'claimExecutionEvidence', 'return (' + exprOf('structuredProseDrift') + ');');
export const candLegacyBelt = (s, names = [], { pendingAction = false, grounded = false, future = false } = {}, rac = null) =>
  legacyFn(rac || belt(names).readsAsCompletion, { summary: s, pendingAction: pendingAction ? { kind: 'confirm' } : null }, false, 'llm', grounded, future) === true;
export const candStructuredBelt = (s, names = [], { pendingAction = false } = {}, rac = null) => {
  const u = unaccFn(rac || belt(names).readsAsCompletion, { summary: s, pendingAction: pendingAction ? { kind: 'confirm' } : null }, false) === true;
  return driftFn(u, [], '', []) === true; // structured mode = a claims array is present (even empty)
};

/** CANDIDATE on an LLM turn: null (prose preserved) or the arm that overwrote it. */
export function candArm(summary, { names = [], pendingAction = false, grounded = false, structured = false } = {}) {
  const t = String(summary);
  if (!pendingAction && LIFECYCLE(t)) return 'LIFECYCLE';
  if (candFuture(t, { pendingAction, grounded })) return 'FUTURE_PROMISE';
  if (structured) return candStructuredBelt(t, names, { pendingAction }) ? 'REWRITE' : null;
  return candLegacyBelt(t, names, { pendingAction, grounded, future: false }) ? 'BELT' : null;
}
/** DEPLOYED v92 on the same turn. */
export function v92Arm(summary, { pendingAction = false, grounded = false } = {}) {
  const t = String(summary);
  if (pendingAction) return null;
  if (LIFECYCLE(t)) return 'LIFECYCLE';
  if (grounded) return null;
  if (V92_FUTURE.test(t)) return 'FUTURE_PROMISE';
  if (V92_PAST.test(t)) return 'PAST_COMPLETION';
  return null;
}

// ---- self-checks: every modelled switch must be observable, or this file models less than it claims ----
{
  const must = (c, m) => { if (!c) throw new Error('harness self-check FAILED: ' + m); };
  must(v92Arm('Deleting the task now.') === 'LIFECYCLE', 'v92 LIFECYCLE arm reachable');
  must(v92Arm('I am going to archive the company for you.') === 'FUTURE_PROMISE', 'v92 FUTURE arm distinguishable');
  must(v92Arm('The record was approved yesterday.') === 'PAST_COMPLETION', 'v92 PAST arm distinguishable');
  must(v92Arm('Erdenet Copper Works was archived.', { pendingAction: true }) === null, 'v92 pendingAction switch');
  must(v92Arm('Erdenet Copper Works was archived.', { grounded: true }) === null, 'v92 grounded switch on PAST');
  must(v92Arm('Deleting the task now.', { grounded: true }) === 'LIFECYCLE', 'v92 LIFECYCLE is NOT gated on grounding');
  must(candFuture('I will archive Erdenet Copper Works for you.') === true, 'candidate FUTURE arm');
  must(candFuture('I will archive Erdenet Copper Works once you confirm.') === false, 'candidate conditioned-offer guard reachable');
  must(candFuture('I will archive Erdenet Copper Works for you.', { pendingAction: true }) === false, 'candidate FUTURE pendingAction switch');
  must(candFuture('I will archive Erdenet Copper Works for you.', { grounded: true }) === false, 'candidate FUTURE grounded switch');
  must(candArm('Erdenet Copper Works was archived. Should I archive its tasks?', { pendingAction: false }) === 'BELT', 'belt runs off a pendingAction turn');
  must(candArm('Erdenet Copper Works was archived. Should I archive its tasks?', { pendingAction: true }) === null, 'belt does NOT run on a pendingAction turn (the #50 option-1 term) — legacy');
  must(candArm('Erdenet Copper Works was archived. Should I archive its tasks?', { pendingAction: true, structured: true }) === null, 'belt does NOT run on a pendingAction turn — structured consumer too');
  must(candArm('Erdenet Copper Works was archived.', { structured: true }) === 'REWRITE', 'structured consumer observable');
  must(candArm('Erdenet Copper Works was archived.', { grounded: true }) === null, 'legacy consumer carries the grounded gate');
  must(candArm('Erdenet Copper Works was archived.', { grounded: true, structured: true }) === 'REWRITE', 'structured consumer has NO grounded gate (measured class, see differential)');
  must(belt().readsAsCompletion(FUTURE_CANNED) === false, 'the FUTURE canned replacement does not itself read as a completion (so FUTURE precedence is faithful)');
  // the consumer expressions are WIRED to readsAsCompletion (not vacuous): a stub gate flips the verdict
  must(candLegacyBelt('hello', [], {}, () => true) === true && candLegacyBelt('hello', [], {}) === false, 'legacy consumer is wired to the gate');
  must(candStructuredBelt('hello', [], {}, () => true) === true && candStructuredBelt('hello', [], {}) === false, 'structured consumer is wired to the gate');
  // the entity signal is observable through the belt
  // (the bare "<NegatorName> was archived." shape is caught WITHOUT the pack by capLead&&subjectRun; the pack is
  //  what rescues the head-noun shape, so that is the observability witness)
  must(belt().readsAsCompletion('No Frills Grocery branch was archived.') === false && belt(['No Frills Grocery']).readsAsCompletion('No Frills Grocery branch was archived.') === true, 'entity signal observable (negator name + head noun)');
  must(belt(['No Frills Grocery']).readsAsCompletion('No Frills Grocery branch was not archived.') === false, 'entity signal never removes a real later negator');
}

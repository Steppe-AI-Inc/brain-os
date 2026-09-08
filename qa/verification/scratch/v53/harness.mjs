// VERIFIER #53 (campaign #113) — my own instrument. Nothing imported from an implementing-session harness or from
// verifier #52's harness. Only reused code: the mechanical scanner qa/verification/lib/belt_extract.mjs (read line by
// line before use: it lifts named const/function declarations out of a source file with a comment/string/regex-aware
// state machine and evaluates them with an injected knownEntityNames Set).
//
// Models, for an UNGROUNDED LLM turn (model='llm', no factLines, no evidence, no plan, no resolved-entity mutation),
// what each build does to result.summary from PROSE ALONE:
//   v92 (my own live download):  LIFECYCLE (claimsLifecycleClaim x4 call sites) -> FUTURE_PROMISE -> PAST_COMPLETION
//   candidate (working tree):    LIFECYCLE (asserted byte-identical)           -> FUTURE_PROMISE (guarded) -> BELT
// Both v92 prose arms and both candidate belt consumers are gated on !result.pendingAction (asserted from bytes below).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) { let d = HERE; for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const up = dirname(d); if (up === d) break; d = up; } return null; }
export const SRC = process.env.SEM_INDEX_SRC ? resolve(process.env.SEM_INDEX_SRC) : findUp('supabase/functions/sem-ai-command/index.ts');
export const V92 = process.env.V92_INDEX_SRC ? resolve(process.env.V92_INDEX_SRC) : findUp('qa/verification/scratch/v53/dl/supabase/functions/sem-ai-command/index.ts');
const LIB = findUp('qa/verification/lib/belt_extract.mjs');
if (!SRC || !existsSync(SRC)) throw new Error('cannot locate candidate index.ts (set SEM_INDEX_SRC)');
if (!V92 || !existsSync(V92)) throw new Error('cannot locate MY downloaded v92 index.ts (run download_v92.mjs first, or set V92_INDEX_SRC)');
if (!LIB) throw new Error('cannot locate belt_extract.mjs');
const { buildGate, buildMatcher, extractConst, extractFunction, detype } = await import('file://' + LIB.replace(/\\/g, '/'));

export const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
export const V92T = readFileSync(V92, 'utf8').replace(/\r\n/g, '\n');

const lit = (t, n) => { const m = t.match(new RegExp('const ' + n + ' = (/[^\\n]*/[a-z]*);')); if (!m) throw new Error(n + ' literal not found'); return new Function('return ' + m[1])(); };
export const V92_PAST = lit(V92T, 'PAST_COMPLETION_CLAIM_PATTERN');
export const V92_FUTURE = lit(V92T, 'FUTURE_PROMISE_PATTERN');
export const CAND_FUTURE = lit(TEXT, 'FUTURE_PROMISE_PATTERN');
export const CAND_PAST = lit(TEXT, 'PAST_COMPLETION_CLAIM_PATTERN');

// ---- LIFECYCLE arm, from each build's own bytes -------------------------------------------------------------
function lifecycleFrom(t) {
  const arms = [...t.matchAll(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]]);
  const fnSrc = extractFunction(t, 'claimsLifecycleClaim').replace(/\(([^)]*)\)\s*:\s*boolean\s*\{/, (_, p) => '(' + p.split(',').map((x) => x.split(':')[0].trim()).join(', ') + ') {');
  const fn = new Function(fnSrc + '\nreturn claimsLifecycleClaim;')();
  return { arms, fnSrc, test: (s) => arms.some(([v, n]) => fn(String(s), v, n)) };
}
export const V92_LIFE = lifecycleFrom(V92T);
export const CAND_LIFE = lifecycleFrom(TEXT);
export const lifecycleIdentical = V92_LIFE.fnSrc === CAND_LIFE.fnSrc && JSON.stringify(V92_LIFE.arms) === JSON.stringify(CAND_LIFE.arms) && V92_LIFE.arms.length === 4
  && ['claimsTaskDeleted', 'claimsCompanyDeleted', 'claimsPersonDeleted', 'claimsGoalDeleted', 'modelProposedPendingAction', 'stateDescriptionPattern'].every((n) => extractConst(TEXT, n) === extractConst(V92T, n));
export const pastPatternIdentical = String(V92_PAST) === String(CAND_PAST);

// ---- candidate FUTURE guard + belt consumers, from the candidate's own statements ------------------------------
const exprOf = (t, name) => { const d = extractConst(t, name); return d.slice(d.indexOf('=') + 1).replace(/;\s*$/, ''); };
const mkFutureFn = (t) => new Function('FUTURE_PROMISE_PATTERN', 'model', 'result', 'groundedOutcomeThisTurn', 'return (' + exprOf(t, 'claimsFutureActionWithNoPlan') + ');');
const candFutureFn = mkFutureFn(TEXT);
const candLegacyFn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'return (' + exprOf(TEXT, 'legacyProseFallback') + ');');
const candUnaccFn = new Function('readsAsCompletion', 'result', 'hasSupportedMutationClaim', 'return (' + exprOf(TEXT, 'unaccountedCompletionProse') + ');');
// v92's own gate expressions, so the pendingAction term is read from v92 bytes rather than assumed
const v92FutureFn = mkFutureFn(V92T);
const v92PastGateSrc = exprOf(V92T, 'claimsPastCompletionWithNoGrounding');

const gates = new Map();
const textCache = new Map();
const textOf = (p) => { if (!textCache.has(p)) textCache.set(p, readFileSync(p, 'utf8').replace(/\r\n/g, '\n')); return textCache.get(p); };
export function gateFor(srcPath, names = []) {
  const k = srcPath + '||' + names.slice().sort().join('');
  if (!gates.has(k)) gates.set(k, buildGate(srcPath, (c) => c, names));
  return gates.get(k);
}
const res = (s, pa) => ({ summary: s, pendingAction: pa ? { kind: 'confirm', action: {} } : null });

/** Candidate verdict on an ungrounded LLM turn. Returns the arm that overwrites the prose, or null (preserved). */
export function candArm(s, { names = [], pa = false, structured = false, src = SRC } = {}) {
  const t = String(s);
  if (!pa && CAND_LIFE.test(t)) return 'LIFECYCLE';
  const fut = src === SRC ? CAND_FUTURE : lit(textOf(src), 'FUTURE_PROMISE_PATTERN');
  const guardFn = src === SRC ? candFutureFn : mkFutureFn(textOf(src));
  if (guardFn(fut, 'llm', res(t, pa), false) === true) return 'FUTURE_PROMISE';
  const g = gateFor(src, names);
  if (structured) return candUnaccFn(g.readsAsCompletion, res(t, pa), false) === true ? 'REWRITE' : null;
  return candLegacyFn(g.readsAsCompletion, res(t, pa), false, 'llm', false, false) === true ? 'BELT' : null;
}
/** Deployed v92 verdict, same turn (from MY download). */
export function v92Arm(s, { pa = false } = {}) {
  const t = String(s);
  if (pa) return null;
  if (V92_LIFE.test(t)) return 'LIFECYCLE';
  if (v92FutureFn(V92_FUTURE, 'llm', res(t, pa), false) === true) return 'FUTURE_PROMISE';
  if (V92_PAST.test(t)) return 'PAST_COMPLETION';
  return null;
}
export const matcherFor = (srcPath) => buildMatcher(srcPath);
export { extractConst, extractFunction, detype };
export const pad = (n) => { const F = 'Here is the current picture for the workspace. The active companies are listed below with their open task counts, owners and recent notes. '; const s = F.repeat(Math.ceil(n / F.length) + 1).slice(0, n); const i = s.lastIndexOf(' '); return s.slice(0, i) + ' '.repeat(n - i); };

// ---- SELF-CHECKS: the instrument must be able to fail -------------------------------------------------------
const selfFail = [];
const must = (ok, msg) => { if (!ok) selfFail.push(msg); };
// 1. the extracted belt is the CANDIDATE's current bytes: the #52 closure (namePrefixHit) is visible in the extract
const beltSrc = gateFor(SRC).source;
must(beltSrc.includes('const namePrefixHit = ((__a) =>'), 'belt extract lacks the V52-D1 closure local (namePrefixHit)');
must((beltSrc.match(/namePrefixHit/g) || []).length === 3, 'namePrefixHit should appear exactly 3 times in the belt (decl, nameInternal, __hit concat)');
must(beltSrc.includes('\\?\\s*$|\\breply (?:yes|y|ok|okay|go)\\b|\\bplease confirm\\b'), 'belt extract lacks the V51-D1 guard tokens');
must(beltSrc.includes('(?:nothing|none|no|nobody|no one|neither|not)\\b/i.test(String(s))'), 'belt extract lacks the V51-D4 object-negator exemption');
// 2. v92 gates read from v92 bytes: the past arm is gated on !pendingAction and on !claimsFutureActionWithNoPlan
must(/!result\.pendingAction/.test(v92PastGateSrc) && /!claimsFutureActionWithNoPlan/.test(v92PastGateSrc), 'v92 past gate does not carry the expected terms — model is wrong');
// 3. every v92 arm reachable and distinguishable, in v92 precedence
must(v92Arm('Deleting the task now.') === 'LIFECYCLE', 'v92 LIFECYCLE unreachable');
must(v92Arm('I am going to archive the record for you.') === 'FUTURE_PROMISE', 'v92 FUTURE unreachable');
must(v92Arm('The record was approved yesterday.') === 'PAST_COMPLETION', 'v92 PAST unreachable');
must(v92Arm('The record archived successfully.') === 'PAST_COMPLETION', 'v92 PAST successfully-arm unreachable');
must(v92Arm('The record was approved yesterday.', { pa: true }) === null, 'v92 arms must all skip a pendingAction turn');
must(v92Arm('The record is being archived.') === null, 'v92 must preserve a passive-progressive (no arm for it)');
// 4. every candidate arm reachable and distinguishable
must(candArm('Deleting the task now.') === 'LIFECYCLE', 'cand LIFECYCLE unreachable');
must(candArm('I am going to archive the record for you.') === 'FUTURE_PROMISE', 'cand FUTURE unreachable');
must(candArm('The record was approved yesterday.') === 'BELT', 'cand BELT unreachable');
must(candArm('The record was approved yesterday.', { structured: true }) === 'REWRITE', 'cand structured consumer unreachable');
// Founder ruling 2026-09-07 (governance/OPERATING_TRUTH_MODEL.md §3 rule 2): the belt no longer skips a
// pendingAction turn; it runs behind REQUEST intent (the harness supplies a mutation-intent request).
must(candArm('The record was approved yesterday.', { pa: true }) === 'BELT', 'cand belt must NOT skip a pendingAction turn (founder ruling 2026-09-07)');
must(candArm('The record was not approved.') === null, 'cand belt must preserve a plain negative');
// 5. the entity signal is live, and the CLOSURE is observable: a lowercase-tail in-pack title is caught only with the pack
must(candArm('I archived Khan Bank.', { names: ['Khan Bank'] }) === 'BELT', 'entity signal inert on in-pack first-person');
must(candArm('I archived Row 4 in the draft table.') === null, 'out-of-pack first-person should be preserved');
must(candArm('Not Invented Here retrospective was archived.', { names: ['Not Invented Here retrospective'] }) === 'BELT', 'closure not observable: in-pack lowercase-tail title fabrication should be caught');
must(candArm('Not Invented Here retrospective was archived.') === null, 'empty pack must be inert on the closure shape (positive-only)');
must(candArm('Not Invented Here retrospective was not archived.', { names: ['Not Invented Here retrospective'] }) === null, 'closure must not destroy the truthful twin');
// 6. the previous candidate (416c14c) genuinely lacks the closure — the instrument can distinguish the two builds
const PREV = findUp('qa/verification/scratch/v53/prev.lf.ts');
if (PREV) must(candArm('Not Invented Here retrospective was archived.', { names: ['Not Invented Here retrospective'], src: PREV }) === null, 'prev candidate 416c14c should SHIP the V52-D1 shape (instrument cannot see the closure)');
// 7. LIFECYCLE and PAST byte-identity
must(lifecycleIdentical, 'candidate LIFECYCLE arm is NOT byte-identical to v92');
must(pastPatternIdentical, 'candidate PAST_COMPLETION_CLAIM_PATTERN differs from v92 (LEGACY_PAST_COMPLETION inherits from it)');
// 8. cross-check with the repo's three-arm reference on witnesses (that file reads scratch/v92/index.v92.ts, a different copy)
try {
  const ref = await import('file://' + findUp('qa/verification/lib/v92_reference.mjs').replace(/\\/g, '/'));
  for (const w of ['Deleting the task now.', 'I am going to archive the company for you.', 'The record was approved yesterday.', 'Khan Bank was not archived.', 'Would you like me to archive Khan Bank?', 'No Limits Inc was archived.', 'The record is being archived.']) {
    must(ref.v92Arm(w) === v92Arm(w), 'v92_reference disagrees with my v92 model on ' + JSON.stringify(w));
  }
  var _ref = ref;
} catch (e) { must(false, 'v92_reference import failed: ' + e.message); }
export const v92Reference = _ref;
if (selfFail.length) throw new Error('HARNESS SELF-CHECK FAILED:\n  ' + selfFail.join('\n  '));
export const selfCheck = 'ok';

// VERIFIER #37 (campaign #97) — own harness, written fresh. Nothing here is imported from any
// prior verifier's or the implementing session's harness. It lifts the REAL bytes of the belt
// (LEGACY_PAST_COMPLETION .. legacyProseFallback) and the REAL decision window (.. rewriteFromStructure)
// out of index.ts and evaluates them; deployed v92's single gate is lifted from git c9dfab5bd433's
// PAST_COMPLETION_CLAIM_PATTERN + its exact decision line.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
function findUp(rel) { let d = HERE; for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const u = dirname(d); if (u === d) break; d = u; } return null; }
export const SRC = process.env.SEM_INDEX_SRC || findUp('supabase/functions/sem-ai-command/index.ts');
export const REPO = dirname(dirname(dirname(SRC)));
export const sha256 = (b) => createHash('sha256').update(b).digest('hex');
export const lf = (t) => t.replace(/\r\n/g, '\n');

export function candidateText(p = SRC) { return lf(readFileSync(p, 'utf8')); }
export function v92Text() {
  const b = execFileSync('git', ['show', 'c9dfab5bd433:supabase/functions/sem-ai-command/index.ts'], { cwd: REPO, maxBuffer: 1 << 26 });
  const t = b.toString('utf8');
  if (sha256(b) !== '795c20c82301aba1f1731c6b408cc9345e0f86b43a50b0cf5dba6ca78d1f88fc') throw new Error('v92 git blob sha mismatch');
  return t;
}

const detype = (s) => s
  .replace(/\(c: string\): boolean =>/g, '(c) =>')
  .replace(/\((\w+): string\)\s*=>/g, '($1) =>')
  .replace(/:\s*Array<\{[^}]*\}>/g, '');

// The belt: every declaration from LEGACY_PAST_COMPLETION up to (not including) legacyProseFallback.
export function beltSlice(text) {
  const a = text.indexOf('const LEGACY_PAST_COMPLETION');
  const b = text.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt not found');
  return text.slice(a, b);
}
export function buildBelt(text, mutate = (x) => x) {
  let body = detype(beltSlice(text));
  body = body.replace(/const hasSupportedMutationClaim =[\s\S]*?\);\n/, '');
  body = mutate(body);
  const names = ['LEGACY_PAST_COMPLETION', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion'];
  const present = names.filter((n) => new RegExp('\\bconst ' + n + '\\b').test(body));
  // eslint-disable-next-line no-new-func
  const out = new Function(body + '\nreturn {' + present.join(',') + '};')();
  out.__body = body;
  return out;
}
// The decision window, exactly the shipped statements, parameterised on the turn inputs.
export function buildDecision(text, mutate = (x) => x) {
  const a = text.indexOf('const LEGACY_PAST_COMPLETION');
  const b = text.indexOf('\n        if (rewriteFromStructure) {', a);
  if (a < 0 || b < 0) throw new Error('decision window not found');
  const body = mutate(detype(text.slice(a, b)));
  // eslint-disable-next-line no-new-func
  const f = new Function('verifiedClaims', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'result', 'rawClaims', 'deterministicPrefix', 'claimExecutionEvidence', 'hasRejectedClaims',
    body + '\nreturn { legacyProseFallback, rewriteFromStructure, claimsPastCompletionWithNoGrounding };');
  return (turn) => {
    const t = { verifiedClaims: [], model: 'gpt-4o', groundedOutcomeThisTurn: false, claimsFutureActionWithNoPlan: false, rawClaims: null, deterministicPrefix: '', claimExecutionEvidence: [], hasRejectedClaims: false, pendingAction: null, ...turn };
    return f(t.verifiedClaims, t.model, t.groundedOutcomeThisTurn, t.claimsFutureActionWithNoPlan, { summary: t.summary, pendingAction: t.pendingAction, claims: t.rawClaims }, t.rawClaims, t.deterministicPrefix, t.claimExecutionEvidence, t.hasRejectedClaims);
  };
}
// Deployed v92: PAST_COMPLETION_CLAIM_PATTERN + the exact gate statement from c9dfab5bd433.
export function buildV92(text) {
  const m = text.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);\n\s*const claimsPastCompletionWithNoGrounding = ([^\n]*\n[^\n]*\n[^\n]*);/);
  if (!m) throw new Error('v92 gate not found');
  const lit = m[1];
  // eslint-disable-next-line no-new-func
  const re = new Function('return ' + lit)();
  const decide = (turn) => {
    const t = { model: 'gpt-4o', groundedOutcomeThisTurn: false, claimsFutureActionWithNoPlan: false, pendingAction: null, ...turn };
    return t.model !== 'deterministic-confirmation' && t.model !== 'deterministic-plan-execution' && t.model !== 'deterministic-clarification' && t.model !== 'deterministic-disambiguation'
      && !t.pendingAction && !t.groundedOutcomeThisTurn && !t.claimsFutureActionWithNoPlan && re.test(String(t.summary || ''));
  };
  return { literal: lit, statement: m[2], re, fires: (s) => re.test(String(s)), decide };
}
export function makeGate(text = candidateText(), mutate = (x) => x) {
  const belt = buildBelt(text, mutate);
  const decide = buildDecision(text, mutate);
  const fires = (s) => belt.readsAsCompletion(String(s)) === true;
  // destroyed on a bare ungrounded turn (claims:null): the legacy fallback path — v92's own path
  const destroyed = (s) => decide({ summary: s }).claimsPastCompletionWithNoGrounding === true;
  // ships = not destroyed with claims:null AND not rewritten with claims:[]
  const ships = (s) => !destroyed(s) && !decide({ summary: s, rawClaims: [] }).claimsPastCompletionWithNoGrounding;
  return { belt, decide, fires, destroyed, ships };
}
export function makeV92() { return buildV92(v92Text()); }

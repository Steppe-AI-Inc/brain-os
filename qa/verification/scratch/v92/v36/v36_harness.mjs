// VERIFIER #36 — own harness. Builds the candidate's belt (readsAsCompletion) and the full
// gate-decision window from the REAL bytes of index.ts, and deployed v92's only completion gate
// (PAST_COMPLETION_CLAIM_PATTERN, pinned by sha256 AND cross-checked against git c9dfab5bd433).
// Written fresh in this session; extraction strategy is my own reading of the source layout.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
export function findUp(rel) { let d = HERE; for (let i = 0; i < 12; i++) { const p = join(d, rel); if (existsSync(p)) return p; const u = dirname(d); if (u === d) break; d = u; } return null; }
export const SRC = process.env.SEM_INDEX_SRC || findUp('supabase/functions/sem-ai-command/index.ts');
export const REPO = dirname(dirname(dirname(SRC)));
export const sha256 = (b) => createHash('sha256').update(b).digest('hex');

const stripComments = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const detype = (s) => s.replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>').replace(/\((\w+):\s*string\)\s*=>/g, '($1) =>')
  .replace(/:\s*Array<\{[^}]*\}>/g, '').replace(/:\s*Record<string,\s*string>/g, '').replace(/:\s*(string|boolean|unknown|number|any)(\[\])?\b/g, '');

export function loadText(p = SRC) { return readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'); }

export function beltBlock(text) {
  const a = text.indexOf('const LEGACY_PAST_COMPLETION'); const b = text.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt block not found');
  return text.slice(a, b);
}
export function buildBelt(text) {
  const slice = detype(stripComments(beltBlock(text))).replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('TS annotation survived');
  const fn = new Function('const verifiedClaims = [];\n' + slice + '\nreturn { readsAsCompletion, completionIsNegated, NEGATED_CLAUSE, COMPLETION_VERB, LEGACY_PAST_COMPLETION, EXECUTION_IN_PROGRESS, CONFIRMED_COMPLETION };')();
  return fn;
}
export function buildDecision(text) {
  const a = text.indexOf('const LEGACY_PAST_COMPLETION'); const b = text.indexOf('\n        if (rewriteFromStructure) {', a);
  if (a < 0 || b < 0) throw new Error('decision window not found');
  const slice = detype(stripComments(text.slice(a, b)));
  const fn = new Function('verifiedClaims', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'result', 'rawClaims', 'deterministicPrefix', 'claimExecutionEvidence', 'hasRejectedClaims',
    slice + '\nreturn { legacyProseFallback, rewriteFromStructure, claimsPastCompletionWithNoGrounding };');
  return (turn) => { const t = { verifiedClaims: [], model: 'gpt', groundedOutcomeThisTurn: false, claimsFutureActionWithNoPlan: false, rawClaims: null, deterministicPrefix: '', claimExecutionEvidence: [], hasRejectedClaims: false, ...turn };
    return fn(t.verifiedClaims, t.model, t.groundedOutcomeThisTurn, t.claimsFutureActionWithNoPlan, { summary: t.summary, pendingAction: t.pendingAction ?? null, claims: t.rawClaims }, t.rawClaims, t.deterministicPrefix, t.claimExecutionEvidence, t.hasRejectedClaims); };
}
export function buildV92(text) {
  const m = text.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);/);
  if (!m) throw new Error('PCCP literal not found');
  return { literal: m[1], sha: sha256(m[1]), test: (s) => new Function('return ' + m[1])().test(String(s)) };
}
// Cross-check: the literal in git c9dfab5bd433 (deployed v92) must be identical to the candidate's.
export function v92LiteralFromGit() {
  try {
    const src = execFileSync('git', ['show', 'c9dfab5bd433:supabase/functions/sem-ai-command/index.ts'], { cwd: REPO, maxBuffer: 1 << 26 }).toString('utf8');
    const m = src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[^\n]*\/i);/);
    return m ? m[1] : null;
  } catch { return null; }
}
export function makeGate(p = SRC) {
  const text = loadText(p);
  const belt = buildBelt(text); const decide = buildDecision(text); const v92 = buildV92(text);
  const fires = (s) => belt.readsAsCompletion(String(s)) === true;
  // "ships" = reaches the founder unchanged on an ungrounded turn, both claims:null and claims:[]
  const ships = (s) => !decide({ summary: s, rawClaims: null }).claimsPastCompletionWithNoGrounding && !decide({ summary: s, rawClaims: [] }).claimsPastCompletionWithNoGrounding;
  // "destroyed" = a truthful answer replaced by the canned correction on an ungrounded turn
  const destroyed = (s) => decide({ summary: s, rawClaims: null }).claimsPastCompletionWithNoGrounding === true;
  return { text, belt, decide, v92, fires, ships, destroyed, v92fires: v92.test };
}

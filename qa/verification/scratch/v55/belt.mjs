// VERIFIER #55 — my own belt builder. Lifts the REAL completion-drift belt out of a given index.ts
// using my own scanner (shared_arms_identity.mjs grabConst/grabFn), executes it with an injectable
// knownEntityNames set, and exposes readsAsCompletion + completionIsNegated. Also models deployed
// v92's prose arms from the v92 bytes (PAST, FUTURE, LIFECYCLE — and optionally the fourth
// path's suppression is handled by the caller by cancelling LIFECYCLE on both sides).
import fs from 'node:fs';
import { grabConst, grabFn } from './shared_arms_identity.mjs';

// Minimal TS annotation stripping for the belt's own declarations — explicit, not a parser.
function detype(code) {
  return code
    .replace(/\(c: string\): boolean/g, '(c)')
    .replace(/\(s: string\)/g, '(s)')
    .replace(/: string\[\]/g, '')
    .replace(/: RegExp/g, '');
}

const BELT_NAMES = [
  'LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
  'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB',
  'NEGATION_AUX', 'completionIsNegated', 'readsAsCompletion',
];

export function buildBelt(srcPath, { names = [], mutate = (s) => s } = {}) {
  const src = fs.readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');
  const parts = [];
  const present = [];
  for (const n of BELT_NAMES) {
    try { parts.push(detype(grabConst(src, n))); present.push(n); } catch (e) { if (['LEGACY_PAST_COMPLETION', 'readsAsCompletion'].includes(n)) throw e; }
  }
  const body = mutate(parts.join('\n'));
  const f = new Function('__names',
    'const knownEntityNames = new Set(__names.map((v) => String(v).trim().toLowerCase()));\n' + body +
    '\nreturn { readsAsCompletion, completionIsNegated: (typeof completionIsNegated === "function" ? completionIsNegated : null) };');
  const out = f(names);
  return { ...out, present, body };
}

// Deployed v92 prose model, built from the v92 bytes (not from qa/verification/lib/v92_reference.mjs).
export function buildV92(v92Path) {
  const src = fs.readFileSync(v92Path, 'utf8').replace(/\r\n/g, '\n');
  const lit = (name) => { const s = grabConst(src, name); const m = s.match(/= (\/[\s\S]*\/[a-z]*);\s*$/); if (!m) throw new Error('not a regex literal: ' + name); return new Function('return ' + m[1])(); };
  const PAST = lit('PAST_COMPLETION_CLAIM_PATTERN');
  const FUTURE = lit('FUTURE_PROMISE_PATTERN');
  const fnSrc = grabFn(src, 'claimsLifecycleClaim').replace(/\(summary: string, verbAlternation: string, nounAlternation: string\): boolean/, '(summary, verbAlternation, nounAlternation)');
  const claimsLifecycleClaim = new Function(fnSrc + '\nreturn claimsLifecycleClaim;')();
  // call-site arguments transcribed BY EXTRACTION from the v92 bytes
  const lines = src.split('\n');
  const arms = [];
  for (const l of lines) {
    const m = l.match(/claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/);
    if (m) arms.push([m[1], m[2]]);
  }
  if (arms.length !== 4) throw new Error('expected 4 lifecycle call sites in v92, found ' + arms.length);
  const LIFECYCLE = (s) => arms.some(([v, n]) => claimsLifecycleClaim(String(s), v, n));
  return {
    PAST, FUTURE, LIFECYCLE, arms,
    destroys: (s, { lifecycle = true } = {}) => (lifecycle && LIFECYCLE(s)) || FUTURE.test(String(s)) || PAST.test(String(s)),
    arm: (s) => LIFECYCLE(s) ? 'LIFECYCLE' : FUTURE.test(String(s)) ? 'FUTURE' : PAST.test(String(s)) ? 'PAST' : null,
  };
}

// Candidate FUTURE arm (differs from v92: curly apostrophe + conditioned-offer stand-down) — extracted
// from the candidate bytes so the candidate's destroy predicate models all of its ungrounded arms.
export function buildCandFuture(srcPath) {
  const src = fs.readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n');
  const s = grabConst(src, 'FUTURE_PROMISE_PATTERN');
  const FUTURE = new Function('return ' + s.match(/= (\/[\s\S]*\/[a-z]*);\s*$/)[1])();
  const decl = grabConst(src, 'claimsFutureActionWithNoPlan');
  // isolate the prose predicate: the `((__s) => ...)(String(result.summary || ''))` tail
  const m = decl.match(/&& (\(\(__s\) => [\s\S]*\))\(String\(result\.summary \|\| ''\)\);\s*$/);
  if (!m) {
    // v92 shape: plain FUTURE_PROMISE_PATTERN.test
    return { FUTURE, fires: (t) => FUTURE.test(String(t)) };
  }
  const pred = new Function('FUTURE_PROMISE_PATTERN', 'return ' + m[1])(FUTURE);
  return { FUTURE, fires: (t) => pred(String(t)) };
}

// VERIFIER #48 — my own build of the candidate's prose-overwrite decision, and of deployed v92's.
// I re-use only the mechanical source scanner from qa/verification/lib/belt_extract.mjs (read and
// audited line by line first); every semantic decision below is re-derived from the candidate bytes.
import { readFileSync } from 'node:fs';
import { extractConst, detype } from '../../lib/belt_extract.mjs';
import { v92Destroys, v92Arm } from '../../lib/v92_reference.mjs';

const CAND = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';
const SRC = readFileSync(CAND, 'utf8');

const GATE_NAMES = [
  'LEGACY_PAST_COMPLETION', 'PROGRESS_VERBS', 'EXECUTION_IN_PROGRESS',
  'CONFIRMED_COMPLETION', 'NEGATED_CLAUSE', 'REFERENCELESS_CONFIRMATION',
  'COMPLETION_VOCAB', 'COMPLETION_PARTICIPLE', 'COMPLETION_VERB', 'NEGATION_AUX',
  'completionIsNegated', 'readsAsCompletion',
];

export function buildBelt(names = [], mutate = (c) => c) {
  const parts = [];
  const present = [];
  for (const n of GATE_NAMES) {
    try { parts.push(detype(extractConst(SRC, n))); present.push(n); } catch { /* optional */ }
  }
  if (!present.includes('readsAsCompletion')) throw new Error('readsAsCompletion not extracted');
  const body = mutate(parts.join('\n'));
  const exported = present.filter((n) => n !== 'PROGRESS_VERBS');
  // eslint-disable-next-line no-new-func
  const f = new Function('__names',
    'const knownEntityNames = new Set(__names.map((v) => String(v).trim().toLowerCase()));\n'
    + body + '\nreturn { ' + exported.join(', ') + ' };');
  return { ...f(names), source: body, present };
}

// The candidate's OTHER two prose arms, transcribed from the candidate source, not from v92.
function candFuturePattern() {
  const m = SRC.match(/const FUTURE_PROMISE_PATTERN = (\/[^\n]*\/i);/);
  if (!m) throw new Error('candidate FUTURE_PROMISE_PATTERN not found');
  // eslint-disable-next-line no-new-func
  return new Function('return ' + m[1])();
}
export const CAND_FUTURE = candFuturePattern();

const CAND_LIFECYCLE_ARMS = [];
{
  const re = /claimsLifecycleClaim\(String\(result\.summary \|\| ''\), '([^']+)', '([^']+)'\)/g;
  for (let m = re.exec(SRC); m; m = re.exec(SRC)) CAND_LIFECYCLE_ARMS.push([m[1], m[2]]);
  if (CAND_LIFECYCLE_ARMS.length !== 4) {
    throw new Error('expected 4 candidate lifecycle arms, got ' + CAND_LIFECYCLE_ARMS.length);
  }
}
const CAND_STATE_DESC = (() => {
  const i = SRC.indexOf('function claimsLifecycleClaim');
  const seg = SRC.slice(i, i + 900);
  const m = seg.match(/const stateDescriptionPattern = (\/[^\n]*\/i);/);
  if (!m) throw new Error('candidate stateDescriptionPattern not found');
  // eslint-disable-next-line no-new-func
  return new Function('return ' + m[1])();
})();
export function candLifecycle(s) {
  const t = String(s);
  return CAND_LIFECYCLE_ARMS.some(([v, n]) => {
    const claim = new RegExp('\\b(' + v + ')\\b[^.]{0,40}\\b(' + n + ')\\b|\\b(' + n + ')\\b[^.]{0,40}\\b(' + v + ')\\b', 'i');
    return claim.test(t) && !CAND_STATE_DESC.test(t);
  });
}

export function makeCandDestroys(names = []) {
  const belt = buildBelt(names);
  const fn = (s) => {
    const t = String(s);
    if (candLifecycle(t)) return 'LIFECYCLE';
    if (CAND_FUTURE.test(t)) return 'FUTURE_PROMISE';
    if (belt.readsAsCompletion(t)) return 'BELT';
    return null;
  };
  fn.belt = belt;
  return fn;
}

export { v92Destroys, v92Arm };

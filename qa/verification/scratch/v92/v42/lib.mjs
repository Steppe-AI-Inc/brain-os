// VERIFIER #42 — independent belt/gate builder.
// Built from first principles against the bytes I obtained myself:
//   candidate  = supabase/functions/sem-ai-command/index.ts  (SEM_INDEX_SRC overridable)
//   deployed   = git c9dfab5bd433 : supabase/functions/sem-ai-command/index.ts
// I deliberately do NOT import qa/scenarios-runner/_gate_extract.mjs or v92_parity_contract.mjs
// so that a bug in the implementing session's harness cannot propagate into my measurement.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '../../../..');

export function readCandidate(overrideSrc) {
  const p = overrideSrc || process.env.SEM_INDEX_SRC || resolve(REPO, 'supabase/functions/sem-ai-command/index.ts');
  if (!existsSync(p)) throw new Error('candidate source not found: ' + p);
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

export function readV92() {
  const p = resolve(REPO, 'qa/verification/scratch/v42dl/v92.lf.ts');
  if (!existsSync(p)) throw new Error('v92 reference not found — regenerate from git c9dfab5bd433');
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

// ---- deployed v92 gate: PAST_COMPLETION_CLAIM_PATTERN, extracted from the v92 bytes themselves
export function buildV92Gate(v92src) {
  const m = v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/);
  if (!m) throw new Error('v92: PAST_COMPLETION_CLAIM_PATTERN not found');
  const re = new Function('return ' + m[1])();
  return { literal: m[1], fires: (s) => re.test(String(s)) };
}

// ---- candidate belt: whole block from LEGACY_PAST_COMPLETION to legacyProseFallback
export function buildBelt(src) {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('belt block not found');
  let slice = src.slice(a, b)
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('TS annotation survived — refusing to run');
  // NOT VACUOUS: assert the block actually contains each arm we claim to be testing.
  for (const need of ['LEGACY_PAST_COMPLETION', 'EXECUTION_IN_PROGRESS', 'CONFIRMED_COMPLETION',
    'REFERENCELESS_CONFIRMATION', 'completionIsNegated', 'nameInternal', 'titleHead', 'ppInternal',
    'newSubject', 'objectName', 'readsAsCompletion']) {
    if (!slice.includes(need)) throw new Error('belt slice missing ' + need + ' — extractor is stale');
  }
  const fn = new Function('const verifiedClaims = [];\n' + slice + '\nreturn { readsAsCompletion, completionIsNegated, EXECUTION_IN_PROGRESS, CONFIRMED_COMPLETION, LEGACY_PAST_COMPLETION, NEGATED_CLAUSE, COMPLETION_VERB, COMPLETION_PARTICIPLE, REFERENCELESS_CONFIRMATION };')();
  if (typeof fn.readsAsCompletion !== 'function') throw new Error('readsAsCompletion did not build');
  return fn;
}

// ---- FUTURE_PROMISE_PATTERN, extracted from each source separately (they differ: the
// candidate added the typographic apostrophe). A summary matching it is REPLACED by the
// "I described an action but didn't actually queue or execute it" message in BOTH builds,
// so it destroys a truthful answer exactly as the past gate does.
export function buildFuturePromise(text, tag) {
  const m = text.match(/const FUTURE_PROMISE_PATTERN = (\/.*\/i);/);
  if (!m) throw new Error(tag + ': FUTURE_PROMISE_PATTERN not found');
  const re = new Function('return ' + m[1])();
  return (s) => re.test(String(s));
}

export function differential(overrideSrc) {
  const src = readCandidate(overrideSrc);
  const v92src = readV92();
  const v92 = buildV92Gate(v92src);
  const belt = buildBelt(src);
  const futV92 = buildFuturePromise(v92src, 'v92');
  const futCand = buildFuturePromise(src, 'cand');
  const v92Fires = v92.fires;
  const candFires = (s) => belt.readsAsCompletion(String(s)) === true;
  return {
    src, v92src, belt,
    v92Fires, candFires,
    v92Literal: v92.literal,
    futV92, futCand,
    // WHOLE-GATE verdict on an ordinary ungrounded LLM turn (no pendingAction, no grounded
    // outcome, no supported structured claim, model is a real LLM). true == the founder-facing
    // summary is REPLACED, i.e. the answer is destroyed if it was truthful.
    v92Destroys: (s) => futV92(s) || v92Fires(s),
    candDestroys: (s) => futCand(s) || candFires(s),
  };
}

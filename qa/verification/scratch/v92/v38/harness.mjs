// VERIFIER #38 own harness. Builds (a) the candidate belt `readsAsCompletion` and
// (b) the deployed-v92 gate (PAST_COMPLETION_CLAIM_PATTERN) from source bytes I obtained
// myself, and exposes a mutation hook so each shipped fix can be reverted independently.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAND_PATH = process.env.SEM_INDEX_SRC
  || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
export const V92_PATH = process.env.SEM_V92_SRC || resolve(HERE, 'v92.lf.ts');

export function readSrc(p) { return readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'); }

// ---- deployed v92 gate: the whole-summary PCCP test, exactly as v92 runs it.
export function buildV92Gate(v92src) {
  const m = v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/);
  if (!m) throw new Error('v38: v92 PCCP not found');
  const re = new Function('return ' + m[1])();
  // v92: `&& PAST_COMPLETION_CLAIM_PATTERN.test(String(result.summary || ''))`
  return (s) => re.test(String(s));
}

// ---- candidate belt: whole block from LEGACY_PAST_COMPLETION to legacyProseFallback.
// `mutate` lets me revert one shipped fix at a time on the SOURCE TEXT before building.
export function buildBelt(candSrc, mutate) {
  const a = candSrc.indexOf('const LEGACY_PAST_COMPLETION');
  const b = candSrc.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('v38: belt block not found');
  let slice = candSrc.slice(a, b)
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (mutate) slice = mutate(slice);
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('v38: TS annotation survived — refusing');
  return new Function('const verifiedClaims = [];\n' + slice + '\nreturn readsAsCompletion;')();
}

export function loadPair() {
  const candSrc = readSrc(CAND_PATH);
  const v92src = readSrc(V92_PATH);
  const belt = buildBelt(candSrc);
  const v92 = buildV92Gate(v92src);
  return {
    candSrc, v92src,
    candFires: (s) => belt(String(s)) === true,
    v92Fires: (s) => v92(String(s)) === true,
  };
}

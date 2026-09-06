// VERIFIER #39 — independent belt/gate extractor.
// Deliberately NOT importing the committed suites' helpers: this must be able to
// disagree with them. It slices the REAL source between `const LEGACY_PAST_COMPLETION`
// and `const legacyProseFallback` and executes it, so a mutation of the product source
// must change the behaviour observed here (proven by v39_mutation_proof.mjs).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAND_PATH = process.env.SEM_INDEX_SRC
  || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
export const V92_PATH = process.env.SEM_V92_SRC
  || resolve(HERE, '../v92/index.v92.ts');

export function readSrc(p) { return readFileSync(p, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'); }

// --- v92's ONE completion gate, read out of the v92 FILE (not the candidate).
export function v92Gate(v92src) {
  const m = v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/[\s\S]*?\/i);\n/);
  if (!m) throw new Error('v39: v92 PAST_COMPLETION_CLAIM_PATTERN not found');
  const re = new Function('return ' + m[1])();
  return { re, fires: (s) => re.test(String(s)) };
}

// --- candidate belt.
export function buildBelt(src) {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('v39: belt block not found');
  const slice = src.slice(a, b)
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('v39: TS annotation survived — refusing to run a mis-sliced belt');
  if (!/const readsAsCompletion/.test(slice)) throw new Error('v39: readsAsCompletion missing from slice');
  if (!/const completionIsNegated/.test(slice)) throw new Error('v39: completionIsNegated missing from slice');
  const f = new Function('const verifiedClaims = [];\n' + slice
    + '\nreturn { readsAsCompletion, completionIsNegated, LEGACY_PAST_COMPLETION, NEGATED_CLAUSE, COMPLETION_VERB, COMPLETION_PARTICIPLE, CONFIRMED_COMPLETION, EXECUTION_IN_PROGRESS };')();
  return f;
}

export function loadPair() {
  const src = readSrc(CAND_PATH);
  const v92src = readSrc(V92_PATH);
  const belt = buildBelt(src);
  const v92 = v92Gate(v92src);
  return {
    src, v92src, belt, v92,
    candFires: (s) => belt.readsAsCompletion(String(s)) === true,
    v92Fires: v92.fires,
  };
}

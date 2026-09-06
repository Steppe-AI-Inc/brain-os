// v43 INDEPENDENT belt extractor. Written from the bytes, not copied from the campaign
// harnesses: it locates the block by its own anchors, strips only whole-line `//` comments,
// removes the two TS annotations that actually appear, and injects the two free identifiers
// (`knownEntityNames`, `verifiedClaims`) so the caller controls the entity-signal configuration.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CAND_PATH = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
export const V92_PATH = resolve(HERE, '../v92/index.v92.ts');

export function readSrc(p) { return readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }

export function beltSlice(src) {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('v43: belt block not found');
  return src.slice(a, b);
}

export function buildBelt(src, opts = {}) {
  const known = new Set([...(opts.knownEntityNames || [])].map((s) => String(s).toLowerCase()));
  let slice = beltSlice(src)
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('v43: TS annotation survived');
  if (!/const readsAsCompletion/.test(slice)) throw new Error('v43: readsAsCompletion missing from slice');
  const fn = new Function('knownEntityNames', 'verifiedClaims', slice + '\nreturn readsAsCompletion;');
  return fn(known, []);
}

export function v92Gate(v92src) {
  const m = v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/);
  if (!m) throw new Error('v43: v92 PCCP not found');
  return new Function('return ' + m[1])();
}

// v92's ONLY completion gate is the PCCP regex applied to the whole summary.
export function makeV92Fires(v92src) { const re = v92Gate(v92src); return (s) => re.test(String(s)); }

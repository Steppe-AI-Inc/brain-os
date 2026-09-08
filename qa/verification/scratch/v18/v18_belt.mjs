// VERIFIER #18 — INDEPENDENT belt extractor. Written from scratch for campaign #78.
// Deliberately NOT reusing _gate_extract.mjs or run17_defect_closure_contract.mjs's
// extraction: those are the implementing session's, and the rule for this campaign is
// "write your own harness". Same principle though: EXECUTE the real product source,
// never reimplement the predicate (reimplementation is the vacuous-test class).
import { readFileSync } from 'node:fs';

// --- my own statement scanner ---------------------------------------------------------
// Returns the source text of the statement beginning at `anchor` up to the first `;` at
// paren/brace/bracket depth zero, skipping strings, template literals, regex literals and
// both comment forms. Throws if the anchor is absent (never silently returns '').
export function statementAt(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('ANCHOR NOT FOUND: ' + anchor);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (c === '/' && n === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
    if (c === '/' && n === '*') { j = src.indexOf('*/', j) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; j++;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === q) break; j++; }
      continue;
    }
    if (c === '/') {
      // regex literal iff the previous significant char cannot end an expression
      let k = j - 1; while (k >= 0 && /\s/.test(src[k])) k--;
      const prev = k >= 0 ? src[k] : '';
      if (prev === '' || '=(,:!&|?{};[+-*%<>~^'.includes(prev)) {
        j++;
        let inClass = false;
        while (j < src.length) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          else if (src[j] === '\n') break;
          j++;
        }
        continue;
      }
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return src.slice(i, j + 1);
  }
  throw new Error('NO STATEMENT TERMINATOR: ' + anchor);
}

const BELT_CONSTS = [
  'const LEGACY_PAST_COMPLETION =',
  'const PROGRESS_VERBS =',
  'const EXECUTION_IN_PROGRESS =',
  'const CONFIRMED_COMPLETION =',
  'const NEGATED_CLAUSE =',
  'const COMPLETION_VOCAB =',
  'const REFERENCELESS_CONFIRMATION =',
  'const readsAsCompletion =',
];

// Build the REAL readsAsCompletion out of a given index.ts. Only the constants that
// actually exist in that revision are taken, so the same builder works on d724d8c
// (no NEGATED_CLAUSE at all), 52e830f/9535f0b (no COMPLETION_VOCAB) and the candidate.
export function buildBelt(pathOrSrc, { raw = false } = {}) {
  const src = raw ? pathOrSrc : readFileSync(pathOrSrc, 'utf8');
  if (!src.includes('const readsAsCompletion =')) throw new Error('readsAsCompletion absent — refusing to report');
  const parts = [];
  for (const a of BELT_CONSTS) if (src.includes(a)) parts.push(statementAt(src, a));
  const body = parts.join('\n') + '\nreturn readsAsCompletion;';
  // no TypeScript survives in this slice (all of these are plain consts); assert it
  if (/:\s*(string|boolean|RegExp|Record<)/.test(body)) throw new Error('TypeScript survived in the belt slice — refusing to report');
  return { fn: new Function(body)(), slice: body, src };
}

export function beltFor(sha) {
  const p = sha === 'CANDIDATE'
    ? new URL('../../../../supabase/functions/sem-ai-command/index.ts', import.meta.url)
    : new URL('./index_' + sha + '.ts', import.meta.url);
  return buildBelt(p);
}

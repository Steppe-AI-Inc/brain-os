// VERIFIER #19 — my own extraction harness. Deliberately NOT _gate_extract.mjs and not any
// v15..v18 harness: campaign #79's rules forbid self-certification by proxy, and an
// extractor written by the implementing session could silently execute something other
// than the shipped bytes. This one slices NAMED STATEMENTS out of the real source with a
// brace/paren tracker that skips string, template and regex literals (LEGACY_PAST_COMPLETION
// contains `{0,30}`, so naive brace counting is wrong), then evaluates them.
import fs from 'node:fs';
import crypto from 'node:crypto';

export const REPO = new URL('../../../../', import.meta.url); // repo root from scratch/v19/
export const INDEX_PATH = new URL('supabase/functions/sem-ai-command/index.ts', REPO);

export function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
export function readIndexRaw() { return fs.readFileSync(INDEX_PATH); }
export function indexSha() { return sha256(readIndexRaw()); }

// --- literal-aware scanner -------------------------------------------------------------
// Returns the index just past the statement that starts at `from` (a `const`/`function`
// keyword position), i.e. the first `;` at depth 0 outside any literal, or the closing
// brace of a function declaration.
function scan(src, from, stopAtSemicolon = true) {
  let i = from, depth = 0, sawBody = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i++; break; } i++; }
      continue;
    }
    if (c === '/') { // possible regex literal
      let p = i - 1; while (p >= 0 && /\s/.test(src[p])) p--;
      const prev = p >= 0 ? src[p] : '';
      // `>` covers an arrow body that IS a regex (`(w) => /^[...]/u.test(w)`) — without it
      // the literal is read as division and every bracket inside it corrupts the depth count.
      if (prev === '' || '=(,[!&|?:;{}+>'.includes(prev)) {
        let j = i + 1, inClass = false, ok = false;
        while (j < src.length) {
          const d = src[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) { j++; ok = true; break; }
          else if (d === '\n') break;
          j++;
        }
        if (ok) { while (j < src.length && /[a-z]/i.test(src[j])) j++; i = j; continue; }
      }
      i++; continue;
    }
    if (c === '{' || c === '(' || c === '[') { depth++; if (c === '{') sawBody = true; i++; continue; }
    if (c === '}' || c === ')' || c === ']') {
      depth--; i++;
      if (depth === 0 && !stopAtSemicolon && sawBody) return i;
      continue;
    }
    if (c === ';' && depth === 0 && stopAtSemicolon) return i + 1;
    i++;
  }
  throw new Error('unterminated statement from ' + from);
}

export function statement(src, marker, opts = {}) {
  const at = src.indexOf(marker);
  if (at === -1) throw new Error('marker not found: ' + marker);
  return src.slice(at, scan(src, at, opts.func !== true));
}

// --- minimal, targeted TS -> JS ---------------------------------------------------------
export function detype(s) {
  s = s.replace(/\r\n/g, '\n');
  s = s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  // `const X: Record<string, string> = {` -> `const X = {`
  s = s.replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =');
  // arrow params/returns: `(c: string): boolean =>`  /  `(o: T) =>`
  s = s.replace(/\(([^()]*)\)\s*:\s*[A-Za-z_][\w.<>[\]| ]*\s*=>/g, (_m, p) => '(' + p.replace(/\s*:\s*[^,)]+/g, '') + ') =>');
  s = s.replace(/\(([A-Za-z_$][\w$]*\s*:\s*[^),]+(?:,\s*[A-Za-z_$][\w$]*\s*:\s*[^),]+)*)\)\s*=>/g,
    (_m, p) => '(' + p.split(',').map((x) => x.split(':')[0].trim()).join(', ') + ') =>');
  // function decls
  s = s.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*:\s*[^{\n]+\{/g,
    (_m, n, p) => 'function ' + n + '(' + p.replace(/\s*:\s*[^,)]+/g, '') + ') {');
  s = s.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*\{/g,
    (_m, n, p) => 'function ' + n + '(' + p.replace(/\s*:\s*[^,)]+/g, '') + ') {');
  s = s.replace(/(\w)!\./g, '$1.');
  s = s.replace(/ as (?:Record<[^>]*>|[A-Za-z_$][\w$.]*(?:<[^>]*>)?(?:\[\])?)/g, '');
  if (/\b(const|let|var)\s+\w+\s*:\s*[A-Za-z_]/.test(s)) throw new Error('TS survived detype (annotated const)');
  return s;
}

// --- the drift belt --------------------------------------------------------------------
// Slices every statement the belt is built from, in source order, from `const
// LEGACY_PAST_COMPLETION` through the `readsAsCompletion` statement. `hasSupportedMutationClaim`
// closes over outer scope; a `verifiedClaims = []` prelude keeps it real code rather than a
// deletion. Works unchanged on d724d8c..d34af15 because it names only the two anchors.
export function loadBelt(src) {
  const start = src.indexOf('const LEGACY_PAST_COMPLETION');
  if (start === -1) throw new Error('LEGACY_PAST_COMPLETION not found');
  const rIdx = src.indexOf('const readsAsCompletion', start);
  if (rIdx === -1) throw new Error('readsAsCompletion not found');
  const end = scan(src, rIdx, true);
  const body = detype(src.slice(start, end));
  // Older revisions do not declare every symbol (d724d8c has no NEGATED_CLAUSE), so the
  // optional ones are returned only when they exist.
  const opt = (n) => 'typeof ' + n + ' === "undefined" ? undefined : ' + n;
  const fn = new Function('verifiedClaims', body + '\nreturn { readsAsCompletion, LEGACY_PAST_COMPLETION, EXECUTION_IN_PROGRESS, CONFIRMED_COMPLETION: '
    + opt('CONFIRMED_COMPLETION') + ', NEGATED_CLAUSE: ' + opt('NEGATED_CLAUSE') + ', completionIsNegated: ' + opt('completionIsNegated') + ' };');
  return fn([]);
}

// --- the disambiguation matcher ---------------------------------------------------------
export function loadMatcher(src) {
  const parts = [
    statement(src, 'const CLARIFICATION_ENTITY_ACTION_FIELD'),
    statement(src, 'function resolveClarificationField', { func: true }),
    statement(src, 'const ARCHIVE_VERB_PATTERN'),
    statement(src, 'const RESTORE_VERB_PATTERN'),
    statement(src, 'function commandContradictsActionType', { func: true }),
    statement(src, 'function matchDisambiguationOption', { func: true }),
  ];
  const body = detype(parts.join('\n'));
  const fn = new Function(body + '\nreturn { matchDisambiguationOption, resolveClarificationField, commandContradictsActionType, CLARIFICATION_ENTITY_ACTION_FIELD };');
  return fn();
}

export function loadFile(p) { return fs.readFileSync(p, 'utf8'); }

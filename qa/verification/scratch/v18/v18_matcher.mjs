// VERIFIER #18 — INDEPENDENT matcher extractor (my own, not run17's).
// Executes the REAL matchDisambiguationOption / commandContradictsActionType /
// resolveClarificationField out of a given index.ts.
import { readFileSync } from 'node:fs';
import { statementAt } from './v18_belt.mjs';

export function balancedFn(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) throw new Error('ANCHOR NOT FOUND: ' + anchor);
  let d = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1); }
  }
  throw new Error('UNBALANCED: ' + anchor);
}

// minimal, GENERIC TS strip for the slices used here
function strip(s) {
  return s
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/\b(const|let|var)\s+(\w+)\s*:\s*[^=;\n]+=/g, '$1 $2 =')
    .replace(/function\s+(\w+)\s*\(([^)]*)\)\s*:\s*[^{\n]+\{/g, (_m, n, p) => 'function ' + n + '(' + p.replace(/:\s*[^,)]+/g, '') + ') {')
    .replace(/=\s*\(([^)]*)\)\s*:\s*[^=]+=>/g, (_m, p) => '= (' + p.replace(/:\s*[^,)]+/g, '') + ') =>')
    .replace(/\(([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$<>\[\]| ]*\)\s*=>/g, '($1) =>');
}

export function buildMatcher(path) {
  const src = readFileSync(path, 'utf8');
  const parts = [
    statementAt(src, 'const CLARIFICATION_ENTITY_ACTION_FIELD'),
    balancedFn(src, 'function resolveClarificationField'),
    statementAt(src, 'const ARCHIVE_VERB_PATTERN ='),
    statementAt(src, 'const RESTORE_VERB_PATTERN ='),
    balancedFn(src, 'function commandContradictsActionType'),
    balancedFn(src, 'function matchDisambiguationOption'),
  ].join('\n');
  const body = strip(parts) + `
    return {
      match: matchDisambiguationOption,
      contradicts: commandContradictsActionType,
      field: resolveClarificationField,
      decide: function (command, options) {
        const m = matchDisambiguationOption(command, options);
        const bad = !!m && commandContradictsActionType(command, m.actionType);
        const f = m && !bad ? resolveClarificationField(m.entityType, m.actionType) : undefined;
        return { bound: m ? m.id : null, contradicted: bad, armed: (m && !bad && f) ? f : null };
      },
    };`;
  if (/:\s*(string|boolean|PendingActionOption|Record<)/.test(body)) throw new Error('TypeScript survived the matcher slice — refusing to report');
  return new Function(body)();
}

export function matcherFor(sha) {
  const p = sha === 'CANDIDATE'
    ? new URL('../../../../supabase/functions/sem-ai-command/index.ts', import.meta.url)
    : new URL('./index_' + sha + '.ts', import.meta.url);
  return buildMatcher(p);
}

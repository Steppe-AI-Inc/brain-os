// VERIFIER #44 — independent belt harness. Written from the bytes, not from any prior harness.
//
// Two gates:
//   v92gate(s)  — deployed production v92's ONLY completion gate (PAST_COMPLETION_CLAIM_PATTERN),
//                 read as a literal out of qa/verification/scratch/v92/index.v92.ts.
//   candGate(s) — the candidate's readsAsCompletion, extracted whole-block so no named-const list
//                 can silently drop a declaration.
//
// The candidate belt reads ONE free identifier, `knownEntityNames`. This harness injects it
// EXPLICITLY and lets the caller populate it, so both the empty-pack and populated-pack
// configurations are measurable and neither is a hidden default.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// v45/V45-N4: ROOT was one level short, so V92_PATH became <repo>/qa/qa/verification/... and this
// harness — the mutation proof for the fix adopted in the candidate it shipped with — could not run
// from any working directory. Five levels, not four.
const ROOT = resolve(HERE, '../../../../..');
export const CAND_PATH = process.env.SEM_INDEX_SRC
  || [resolve(ROOT, 'supabase/functions/sem-ai-command/index.ts'),
      resolve(process.cwd(), 'supabase/functions/sem-ai-command/index.ts')].find(existsSync);
export const V92_PATH = resolve(ROOT, 'qa/verification/scratch/v92/index.v92.ts');

export const readSrc = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// ---- v92 gate --------------------------------------------------------------------------------
export function buildV92Gate(v92src) {
  const lit = (v92src.match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/) || [])[1];
  if (!lit) throw new Error('v44: v92 PAST_COMPLETION_CLAIM_PATTERN not found');
  const re = new Function('return ' + lit)();
  return (s) => re.test(String(s));
}

// ---- candidate belt --------------------------------------------------------------------------
const stripCommentLines = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

export function beltBlock(src) {
  const a = src.indexOf('const LEGACY_PAST_COMPLETION');
  const b = src.indexOf('const legacyProseFallback');
  if (a < 0 || b <= a) throw new Error('v44: belt block anchors not found');
  return src.slice(a, b);
}

export function buildCandGate(src, names = [], mutate = (s) => s) {
  const slice = mutate(stripCommentLines(beltBlock(src)))
    .replace(/\(c:\s*string\)\s*:\s*boolean\s*=>/g, '(c) =>')
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  if (/:\s*(string|boolean|number|any)\b/.test(slice)) throw new Error('v44: a TS annotation survived extraction');
  // integrity: the shipped predicate must be what we are measuring
  if (!/completionIsNegated\(/.test(slice.split('const readsAsCompletion =')[1] || '')) {
    throw new Error('v44: readsAsCompletion no longer routes through completionIsNegated — refusing to measure');
  }
  const seed = 'const knownEntityNames = new Set(' + JSON.stringify(names.map((n) => String(n).trim().toLowerCase())) + ');\n'
    + 'const verifiedClaims = [];\n';
  const fn = new Function(seed + slice + '\nreturn readsAsCompletion;')();
  return (s) => fn(String(s)) === true;
}

// ---- the matcher (disambiguation), both sources ----------------------------------------------
export function buildMatcher(text, tag) {
  const braced = (m) => {
    const i = text.indexOf(m); if (i < 0) throw new Error(tag + ': ' + m);
    let d = 0, st = false;
    for (let j = i; j < text.length; j++) {
      if (text[j] === '{') { d++; st = true; } else if (text[j] === '}') { d--; if (st && d === 0) return text.slice(i, j + 1); }
    }
    throw new Error(tag + ': unbalanced ' + m);
  };
  const line = (n) => {
    const m = text.match(new RegExp('^const ' + n + ' = (.+);$', 'm'));
    if (!m) throw new Error(tag + ': const ' + n);
    return `const ${n} = ${m[1]};`;
  };
  const cf = text.indexOf('const commandForContradiction = matchedOption');
  const cI = text.indexOf('const contradicted = !!matchedOption');
  const start = cf >= 0 ? cf : cI;
  const fI = text.indexOf('const field = matchedOption && !contradicted', start);
  const site = stripCommentLines(text.slice(start, fI));
  const fieldLine = text.slice(fI, text.indexOf('\n', fI));
  const detype = (s) => s.replace(/: Record<string, Record<string, string>>/g, '').replace(/: Record<string, string>/g, '')
    .replace(/function matchDisambiguationOption\([^)]*\)\s*:\s*[^{]*\{/, 'function matchDisambiguationOption(command, options) {')
    .replace(/function commandContradictsActionType\([^)]*\)\s*:\s*boolean\s*\{/, 'function commandContradictsActionType(command, actionType) {')
    .replace(/function resolveClarificationField\([^)]*\)\s*:\s*[^{]*\{/, 'function resolveClarificationField(entityType, actionType) {')
    .replace(/\((\w+): PendingActionOption\)/g, '($1)').replace(/:\s*PendingActionOption\b/g, '')
    .replace(/\(([a-zA-Z]+): string\)/g, '($1)').replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '');
  const body = detype([braced('const CLARIFICATION_ENTITY_ACTION_FIELD'), line('ARCHIVE_VERB_PATTERN'),
    line('RESTORE_VERB_PATTERN'), braced('function resolveClarificationField('),
    braced('function commandContradictsActionType('), braced('function matchDisambiguationOption(')].join('\n'));
  return new Function('const knownEntityNames = new Set();\n' + body
    + '\nreturn function decide(command, options) {\n'
    + "  const matchedOption = matchDisambiguationOption(command, options);\n"
    + "  if (!matchedOption) return 'DEAD-END';\n"
    + '  ' + detype(site) + '\n  ' + detype(fieldLine) + '\n'
    + "  return (matchedOption && !contradicted && field) ? 'SELECT:' + field + ':' + matchedOption.id : 'DEAD-END';\n};")();
}

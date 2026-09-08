// VERIFIER #15 — my own extraction layer. Deliberately NOT a copy of any harness written
// by the implementing session.
//
// INDEPENDENCE DISCIPLINE. I reuse ONLY stripTS() from _gate_extract.mjs (a mechanical
// TS->JS transform), and I do not trust it: every extraction below asserts that the
// security-critical literals of the region survived into the executed slice BYTE-FOR-BYTE
// against the raw source. If the stripper mangles a regex, my assertion fires instead of
// the harness quietly executing something that is not the product.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

export const SRC_PATH = 'supabase/functions/sem-ai-command/index.ts';
export const REQUIRED_SHA =
  '1b291f370d285ae79844c7f363a3959d2c668ab5d368a69805b0c9a16227ef64';

export function readSource({ requireSha = true } = {}) {
  const buf = fs.readFileSync(SRC_PATH);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (requireSha && sha !== REQUIRED_SHA) {
    throw new Error(
      `index.ts sha256 mismatch.\n  expected ${REQUIRED_SHA}\n  observed ${sha}\n` +
      'Refusing to run: the source under test is not the pinned candidate.');
  }
  return { text: buf.toString('utf8'), sha };
}

export function sha256OfSource() {
  return crypto.createHash('sha256').update(fs.readFileSync(SRC_PATH)).digest('hex');
}

// Slice from an anchor to the close of its first balanced {...} block.
export function balancedFrom(text, anchor, { anchorMustBeUnique = true } = {}) {
  const first = text.indexOf(anchor);
  if (first === -1) throw new Error(`anchor not found: ${anchor}`);
  if (anchorMustBeUnique && text.indexOf(anchor, first + 1) !== -1) {
    throw new Error(`anchor is not unique (a rename would silently change what I execute): ${anchor}`);
  }
  let depth = 0, end = -1;
  for (let k = text.indexOf('{', first); k < text.length; k++) {
    if (text[k] === '{') depth++;
    else if (text[k] === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  if (end === -1) throw new Error(`unbalanced braces after anchor: ${anchor}`);
  return text.slice(first, end);
}

// Assert each literal appears verbatim in BOTH the raw region and the stripped slice.
// Slice from an anchor to the close of its first balanced (...) group.
export function balancedParenFrom(text, anchor) {
  const first = text.indexOf(anchor);
  if (first === -1) throw new Error(`anchor not found: ${anchor}`);
  let depth = 0, end = -1;
  for (let k = text.indexOf('(', first); k < text.length; k++) {
    if (text[k] === '(') depth++;
    else if (text[k] === ')') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  if (end === -1) throw new Error(`unbalanced parens after anchor: ${anchor}`);
  return text.slice(first, end) + ';';
}

export function assertLiteralsSurvived(rawRegion, slice, literals, label) {
  for (const lit of literals) {
    if (!rawRegion.includes(lit)) {
      throw new Error(`[${label}] literal absent from RAW SOURCE region (the product changed shape; this harness is stale): ${lit}`);
    }
    if (!slice.includes(lit)) {
      throw new Error(`[${label}] literal was DESTROYED BY STRIPPING — the harness would be executing something other than the product: ${lit}`);
    }
  }
}

// ---------------------------------------------------------------------------
// D106 / D102 — matchDisambiguationOption, executed as shipped.
// ---------------------------------------------------------------------------
export function buildMatcher(text) {
  const raw = balancedFrom(text, 'function matchDisambiguationOption(');
  const slice = stripTS(raw);
  assertLiteralsSurvived(raw, slice, [
    // the normalisation, the specificity rule, the residual-mention guard, the raw tie-break
    ".replace(/[“”‘’\"']/g, '').replace(/\\s+/g, ' ').trim().toLowerCase()",
    'const maxLen = Math.max(...matches.map(specificity));',
    'const rest = normalizedCommand.split(forMatching(longest[0].label)).join(\' \');',
    'if (exact.length === 1) return exact[0];',
  ], 'matchDisambiguationOption');
  const fn = new Function(`${slice}; return matchDisambiguationOption;`)();
  if (typeof fn !== 'function') throw new Error('matcher did not build');
  return fn;
}

// ---------------------------------------------------------------------------
// D113 — the option-label corroboration decision, executed as shipped.
//
// The real block closes over displayName/canonicalById/runtimeLabels/etc. inside a
// 3000-line request handler, so I extract the REAL safeOptionLabel + safeDisplayLabel +
// displayName + the real regexes, and supply only the canonical MAPS (which are plain
// data, not logic). The DECISION LINE itself is lifted verbatim from source and asserted
// byte-identical, so the thing under test is the product's own expression.
// ---------------------------------------------------------------------------
export function buildLabelGate(text) {
  const pieces = [];
  const grab = (anchor, endLiteral) => {
    const i = text.indexOf(anchor);
    if (i === -1) throw new Error(`anchor not found: ${anchor}`);
    const j = text.indexOf(endLiteral, i);
    if (j === -1) throw new Error(`end literal not found after ${anchor}`);
    return text.slice(i, j + endLiteral.length);
  };

  const rawUuid = grab('const UUID_IN_TEXT =', ';');
  const rawPast = grab('const PAST_COMPLETION_CLAIM_PATTERN =', ';');
  const rawCompletionWord = grab('const COMPLETION_WORD =', ';');
  const rawFutureQ = grab('const FUTURE_PROMISE_IN_QUESTION =', ';');
  const rawTyped = balancedFrom(text, 'const TYPED_FALLBACK');
  const rawSafeDisplay = balancedFrom(text, 'const safeDisplayLabel =');
  const rawSafeProse = balancedFrom(text, 'const safeProseFragment =');
  const rawSafeOption = balancedFrom(text, 'const safeOptionLabel =');
  const rawDisplayName = balancedFrom(text, 'const displayName =');

  // The D113 decision, verbatim.
  const decStart = text.indexOf('const derivedLabel = typeof o.id ===');
  if (decStart === -1) throw new Error('D113 decision block not found');
  const decEnd = text.indexOf('if (o.label !== beforeLabel)', decStart);
  if (decEnd === -1) throw new Error('D113 decision end not found');
  const rawDecision = text.slice(decStart, decEnd);

  const rawRegion = [rawUuid, rawPast, rawCompletionWord, rawFutureQ, rawTyped,
    rawSafeDisplay, rawSafeProse, rawSafeOption, rawDisplayName, rawDecision].join('\n');

  const body = `
    const DEBUG_RESOURCE_IDS = false;
    const canonicalById = __canonicalById;
    const runtimeLabels = __runtimeLabels;
    const companyNameById = __companyNameById;
    const taskTitleById = __taskTitleById;
    const personNameById = __personNameById;
    const goalTitleById = __goalTitleById;
    ${rawUuid}
    ${rawPast}
    ${rawCompletionWord}
    ${rawFutureQ}
    ${rawTyped}
    ${balancedFrom(text, 'const lastKnownLabel =')};
    ${rawSafeDisplay}
    ${rawDisplayName}
    ${rawSafeProse}
    ${balancedFrom(text, 'const safeQuestionFragment =')};
    ${rawSafeOption}
    // gateOneOption() is MY wrapper, but every line inside the marked region is the
    // product's own text, unmodified.
    function gateOneOption(o, oi) {
      ${rawDecision}
      return o.label;
    }
    return { gateOneOption, safeOptionLabel, displayName, safeDisplayLabel,
             safeQuestionFragment, safeProseFragment,
             COMPLETION_WORD, PAST_COMPLETION_CLAIM_PATTERN };
  `;
  const slice = stripTS(body);
  assertLiteralsSurvived(rawRegion, slice, [
    'const canonicalKnowsIt = !!derivedLabel',
    'const agrees = !!safeLabel && bare(safeLabel) === bare(derivedLabel);',
    ': (canonicalKnowsIt || !safeLabel || COMPLETION_WORD.test(safeLabel))',
    "const ADJECTIVAL_COMPLETION = /^(closed|completed|restored)$/i;",
    'const completionIdx = words.findIndex((w) => COMPLETION_WORD.test(w));',
  ], 'labelGate');

  return (maps) => new Function(
    '__canonicalById', '__runtimeLabels', '__companyNameById',
    '__taskTitleById', '__personNameById', '__goalTitleById', slice,
  )(
    maps.canonicalById ?? new Map(),
    maps.runtimeLabels ?? new Map(),
    maps.companyNameById ?? new Map(),
    maps.taskTitleById ?? new Map(),
    maps.personNameById ?? new Map(),
    maps.goalTitleById ?? new Map(),
  );
}

// ---------------------------------------------------------------------------
// The question belt (safeQuestionFragment) alone, for the two-axis corpora.
// ---------------------------------------------------------------------------
export function buildQuestionBelt(text) {
  const g = buildLabelGate(text);
  return g({}).safeQuestionFragment;
}

// ---------------------------------------------------------------------------
// The drift belts (CONFIRMED_COMPLETION and siblings), executed as shipped.
// ---------------------------------------------------------------------------
export function buildDriftBelts(text) {
  const grab = (anchor, endLiteral) => {
    const i = text.indexOf(anchor);
    if (i === -1) throw new Error(`anchor not found: ${anchor}`);
    const j = text.indexOf(endLiteral, i);
    if (j === -1) throw new Error(`end literal not found after ${anchor}`);
    return text.slice(i, j + endLiteral.length);
  };
  const rawLegacy = grab('const LEGACY_PAST_COMPLETION =', ';');
  const rawProgressVerbs = grab('const PROGRESS_VERBS =', ';');
  const rawExec = balancedParenFrom(text, 'const EXECUTION_IN_PROGRESS = new RegExp(');
  const rawConfirmed = grab('const CONFIRMED_COMPLETION =', ';');
  const rawRegion = [rawLegacy, rawProgressVerbs, rawExec, rawConfirmed].join('\n');
  const body = `${rawLegacy}\n${rawProgressVerbs}\n${rawExec}\n${rawConfirmed}\n` +
    'return { LEGACY_PAST_COMPLETION, EXECUTION_IN_PROGRESS, CONFIRMED_COMPLETION };';
  const slice = stripTS(body);
  assertLiteralsSurvived(rawRegion, slice, [
    'const CONFIRMED_COMPLETION = /^\\s*confirmed\\s*[—–-]\\s*(?![^]*\\b(?:not|never|no|nothing|none|without|pending|awaiting',
    '(?<!\\bthe )(?<!\\ba )(?<!\\ban )(?<!\\bany )(?<!\\byour )(?<!\\bmy )(?<!\\bour )(?<!\\d )',
  ], 'driftBelts');
  return new Function(slice)();
}

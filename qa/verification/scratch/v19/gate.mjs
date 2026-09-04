// VERIFIER #19 — end-to-end GATE driver (my own, not v15..v18's). Executes the REAL shipped
// slice from `const FUTURE_PROMISE_PATTERN` through the closing brace of the correction
// block (`if (rewriteFromStructure) {…} else if (legacyProseFallback) {…}`, or the older
// `if (claimsPastCompletionWithNoGrounding) {…}`), so the founder-visible result.summary is
// produced by shipped code. The slice declares its OWN claim verification, displayName and
// safe* helpers, so nothing behavioural is stubbed — only the turn INPUTS are supplied.
import { detype } from './x.mjs';

const FREE = ['model', 'result', 'groundedOutcomeThisTurn', 'factLines', 'hasExecutionEvidence',
  'proposedPlan', 'lifecycleMismatchCorrections', 'command', 'claimExecutionEvidence',
  'organizationGraphCheck', 'contextPack', 'lifecycleReports', 'stateClaimCorrections', 'runtimeLabels', 'Deno'];

export function sliceGate(src) {
  const start = src.indexOf('const FUTURE_PROMISE_PATTERN');
  if (start === -1) throw new Error('FUTURE_PROMISE_PATTERN not found');
  let ifIdx = src.indexOf('if (claimsPastCompletionWithNoGrounding)', start);
  if (ifIdx === -1) ifIdx = src.indexOf('if (rewriteFromStructure)', start);
  if (ifIdx === -1) throw new Error('correction block not found');
  const walk = (from) => {
    let depth = 0;
    for (let k = src.indexOf('{', from); k < src.length; k++) {
      if (src[k] === '{') depth++;
      else if (src[k] === '}') { depth--; if (depth === 0) return k + 1; }
    }
    throw new Error('unbalanced braces');
  };
  let end = walk(ifIdx);
  if (/^\s*else\s+if\s*\(/.test(src.slice(end, end + 40))) end = walk(end);
  return detype(src.slice(start, end));
}

export function buildGate(src) {
  const body = sliceGate(src);
  const tailNames = ['claimsPastCompletionWithNoGrounding', 'rewriteFromStructure', 'legacyProseFallback', 'claimsFutureActionWithNoPlan'];
  const tail = '\nreturn { summary: result.summary, ' + tailNames
    .map((n) => n + ': typeof ' + n + ' === "undefined" ? undefined : ' + n).join(', ') + ' };';
  const fn = new Function(...FREE, body + tail);
  return (t) => {
    const env = {
      model: t.model ?? 'gpt-x',
      result: {
        summary: t.summary,
        pendingAction: t.pendingAction ?? null,
        claims: t.claims ?? undefined,
        questions: t.questions ?? undefined,
        proposedActions: t.proposedActions ?? undefined,
      },
      groundedOutcomeThisTurn: t.grounded ?? false,
      factLines: t.factLines ?? [],
      hasExecutionEvidence: (t.evidence ?? []).length > 0,
      proposedPlan: t.proposedPlan ?? null,
      lifecycleMismatchCorrections: t.lifecycleMismatchCorrections ?? [],
      command: t.command ?? 'archive the company',
      claimExecutionEvidence: t.evidence ?? [],
      organizationGraphCheck: t.organizationGraphCheck ?? null,
      contextPack: t.contextPack ?? {},
      lifecycleReports: t.lifecycleReports ?? [],
      stateClaimCorrections: t.stateClaimCorrections ?? [],
      runtimeLabels: t.runtimeLabels ?? new Map(),
      Deno: { env: { get: () => undefined } },
    };
    const out = fn(...FREE.map((p) => env[p]));
    out.corrected = out.claimsPastCompletionWithNoGrounding === true;
    return out;
  };
}

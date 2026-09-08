// Verifier #14 INDEPENDENT extraction library.
// Deliberately does NOT reuse run13's harness helpers. Only stripTS (generic TS->JS,
// shared infrastructure used by ~10 suites, not a guard) is imported, and the extracted
// slice is asserted to actually CONTAIN each guard before any case runs — so a slice that
// silently lost a guard fails loudly instead of passing vacuously.
import { readFileSync } from 'node:fs';
import { stripTS } from '../../scenarios-runner/_gate_extract.mjs';

export const SRC_PATH = process.env.SEM_INDEX_SRC || 'supabase/functions/sem-ai-command/index.ts';

export function build(srcText, opts = {}) {
  const historical = opts.historical === true; // A/B against an older SHA: guards legitimately absent
  const src = srcText ?? readFileSync(SRC_PATH, 'utf8');

  // ---- gate slice (drift belts + pendingAction gating + label corroboration) ----
  const gStart = src.indexOf('// STRUCTURED-CLAIM VERIFICATION');
  const gAnchor = src.indexOf('executionEvidence: claimExecutionEvidence,', gStart);
  if (gStart === -1 || gAnchor === -1) throw new Error('v14: gate slice anchors not found');
  const rawSlice = src.slice(gStart, src.indexOf('};', gAnchor) + 2);

  // Independent presence assertions — a slice missing a guard must THROW, not pass.
  const MUST_CONTAIN = [
    ['INTERROGATIVE_LEAD', 'FIX-3b question belt'],
    ['ADJECTIVAL_COMPLETION', 'D101 allowlist'],
    ['readsAsCompletion', 'D100/D103c shared predicate'],
    ['CONFIRMED_COMPLETION', 'D103c belt'],
    ['REFERENCELESS_CONFIRMATION', 'D103c belt'],
    ['labelKey', 'D103a collision key'],
    ['const derivedLabel', 'D100 corroboration'],
  ];
  if (!historical) for (const [needle, what] of MUST_CONTAIN) {
    if (!rawSlice.includes(needle)) throw new Error(`v14: gate slice does not contain ${needle} (${what}) — extraction is wrong or the guard is gone`);
  }

  const gateSlice = stripTS(rawSlice);
  const gateFn = new Function(
    'result', 'claimExecutionEvidence', 'contextPack', 'model', 'groundedOutcomeThisTurn', 'claimsFutureActionWithNoPlan', 'Deno',
    'companyNameById', 'taskTitleById', 'personNameById', 'goalTitleById', 'summaryIsFullyDeterministic', 'deterministicPrefix', 'runtimeLabels',
    gateSlice + '\n; return { summary: result.summary, envelope: result.verifiedResponse, corrected: claimsPastCompletionWithNoGrounding, questions: result.questions };');

  // ---- matchDisambiguationOption ----
  const mStart = src.indexOf('function matchDisambiguationOption');
  const mEnd = src.indexOf('\n}', mStart);
  if (mStart === -1 || mEnd === -1) throw new Error('v14: matchDisambiguationOption not found');
  const mRaw = src.slice(mStart, mEnd + 2);
  if (!historical && !mRaw.includes('matches.length > 1')) throw new Error('v14: D102 raw fallback not present in matchDisambiguationOption slice');
  const matchFn = new Function('command', 'options', stripTS(mRaw) + '\n; return matchDisambiguationOption(command, options);');

  // ---- the disambiguation REPLAY site (guard 7), lifted as an executable expression ----
  // Extracted straight from the product source between its own two anchors so a change to
  // the replay rendering is observed here, not reimplemented.
  const rStart = src.indexOf('const replayLabel = String(matchedOption.label');
  const rEnd = src.indexOf('deterministic = {', rStart);
  if (!historical && (rStart === -1 || rEnd === -1)) throw new Error('v14: disambiguation replay site not found');
  const replayRaw = rStart === -1 ? '' : src.slice(rStart, rEnd);
  if (!historical && (!replayRaw.includes('isTypedFallbackOnly') || !replayRaw.includes('readsAsAssertion'))) throw new Error('v14: replay guards missing');
  // Pull the PAST_COMPLETION_CLAIM_PATTERN / COMPLETION_WORD definitions the replay site
  // depends on, from the source itself (never retyped).
  const pcp = src.match(/const PAST_COMPLETION_CLAIM_PATTERN = [\s\S]*?;\r?\n/);
  const cw = src.match(/const COMPLETION_WORD = [\s\S]*?;\r?\n/);
  if (!pcp || !cw) throw new Error('v14: pattern definitions not found');
  const replayFn = replayRaw === '' ? (() => { throw new Error('no replay site at this SHA'); }) : new Function('matchedOption', 'field',
    stripTS(pcp[0] + cw[0] + replayRaw) +
    "\n; return (isTypedFallbackOnly || readsAsAssertion) ? 'Confirmed — proceeding with the option you selected.' : `Confirmed — you selected “${replayLabel}”.`;");

  const DENO = { env: { get: () => undefined } };
  const mk = (o) => new Map(Object.entries(o || {}));
  const run = ({ claims = null, summary = '', pendingAction = null, questions, evidence = [], context = {}, grounded = false, model = 'gpt', names = {} } = {}) =>
    gateFn({ claims, summary, pendingAction, questions }, evidence, context, model, grounded, false, DENO,
      mk(names.companies), mk(names.tasks), mk(names.people), mk(names.goals), false, '', mk(names.runtime));

  return { src, run, matchFn, replayFn, gateSlice };
}

export const ACME = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
export const ID2 = '11111111-1111-1111-1111-111111111111';
export const ID3 = '22222222-2222-2222-2222-222222222222';
export const M = (rt, id, action) => ({ type: 'mutation_result', resourceType: rt, resourceId: id, action });

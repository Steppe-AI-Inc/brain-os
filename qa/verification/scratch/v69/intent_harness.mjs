// VERIFIER #69 — executes the REAL request-intent derivation window sliced from index.ts.
// Never a re-implementation. Exports `derive(command, opts)` -> the real requestedIntent.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripTS } from '../../../scenarios-runner/_gate_extract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SRC = process.env.SEM_INDEX_SRC || resolve(HERE, '../../../../supabase/functions/sem-ai-command/index.ts');
const src = readFileSync(SRC, 'utf8');

function sliceIntentWindow(source) {
  const start = source.indexOf('const MUTATION_ARRAY_FIELDS');
  if (start === -1) throw new Error('MUTATION_ARRAY_FIELDS not found — harness is out of date with the source');
  // Anchor on the FINAL assignment exactly, not on the `requestedIntentPrimary` prefix.
  const marker = '= requestedIntentPrimary;';
  const anchor = source.indexOf(marker, start);
  if (anchor === -1) throw new Error('final requestedIntent assignment not found');
  const end = anchor + marker.length;
  return stripTS(source.slice(start, end));
}
const slice = sliceIntentWindow(src);
// Prove the window really is the product's, not a fragment: it must contain every tier name.
for (const must of ['lexiconAlways', 'lexiconPassive', 'lexiconObject', 'lexiconImperative',
  'requestedIntentPrimary', 'readShaped', 'confirmationShaped', 'MUTATION_VERB_WITH_OBJECT',
  'IMPERATIVE_OBJECT', 'STRONG_OBJECT', 'objectRefers']) {
  if (!slice.includes(must)) throw new Error('sliced window is missing ' + must + ' — refusing to measure a fragment');
}

const fn = new Function('command', 'result', 'commandFallbackResolvedVerb',
  slice + '\n; return { requestedIntent, readShaped, confirmationShaped, lexiconVerb, lexiconAlways, lexiconPassive, lexiconObject, lexiconImperative, lexiconReadVetoed, isQuestion, firstClauseIsMutation, lastClauseIsRead, lastClauseIsMutation, alwaysInImperativePosition, modelIntentKind, modelMutationField, commandForRead, headClauses };');

/** Run the REAL tier. opts.result = the model's structured output; opts.fallbackVerb = executor outcome. */
export function derive(command, opts = {}) {
  const result = opts.result || {};
  return fn(String(command), result, opts.fallbackVerb === undefined ? null : opts.fallbackVerb);
}
export function hasIntent(command, opts = {}) { return derive(command, opts).requestedIntent !== null; }

// ---- harness self-validation: known-good anchors from the committed suites ----
export function selfTest() {
  const cases = [
    ['archive company ACME', true], ['Archive ACME', true],
    ['what companies are archived?', false], ['show me the archived companies', false],
    ['yes', true], ['option 2', true],
    ['tell me about ACME', false],
    ['could you please archive ACME?', true],
    ['Share price fell after the announcement', false],
    ['Archive policy needs a review', false],
  ];
  const bad = [];
  for (const [c, want] of cases) { const got = hasIntent(c); if (got !== want) bad.push(`${JSON.stringify(c)} expected intent=${want} got=${got}`); }
  return bad;
}
if (process.argv[1] && process.argv[1].endsWith('intent_harness.mjs')) {
  const bad = selfTest();
  if (bad.length) { console.error('HARNESS SELFTEST FAIL:\n  ' + bad.join('\n  ')); process.exit(2); }
  console.log('intent harness selftest: 10/10 OK — the window is the product tier');
}

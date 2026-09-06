// Verifier #42's 48-row participle-initial-name class, measured across pack states.
//
// #43 reports: the candidate destroys 36; with all 12 names in the pack it still destroys 12; the
// prepared fixes destroy 12 with an EMPTY pack and 0 with it populated. That is the number the deploy
// question turns on, so it is re-derived here on the APPLIED bytes rather than carried from a report.
//
// v42's own gate injects an EMPTY set, which is why it still reads 1 failed: it measures the
// empty-pack case by construction. That is not the production configuration.
import { readFileSync } from 'node:fs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = process.env.SEM_INDEX_SRC || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const TEXT = readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const PCCP = new Function('return ' + readFileSync(ROOT + 'qa/verification/scratch/v92/index.v92.ts', 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const v92 = (s) => PCCP.test(String(s));

const detype = (s) => s
  .replace(/\((\w+):\s*string\)\s*:\s*boolean\s*=>/g, '($1) =>')
  .replace(/\((\w+):\s*string\)\s*=>/g, '($1) =>')
  .replace(/:\s*string\b/g, '').replace(/:\s*boolean\b/g, '').replace(/:\s*unknown\b/g, '').replace(/:\s*number\b/g, '');
function beltWith(names) {
  const a = TEXT.indexOf('const LEGACY_PAST_COMPLETION');
  const b = TEXT.indexOf('const legacyProseFallback');
  const slice = detype(TEXT.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'))
    .replace(/const hasSupportedMutationClaim =[^;]*;/, '');
  const seed = 'const knownEntityNames = new Set(' + JSON.stringify(names.map((n) => n.toLowerCase())) + ');\nconst verifiedClaims = [];\n';
  const f = new Function(seed + slice + '\nreturn readsAsCompletion;')();
  return (s) => f(String(s)) === true;
}

// #42's twelve participle-initial names, and the four continuation shapes it generated.
const NAMES = ['Archived Media Group', 'Restored Furniture Co', 'Cleared Skies Ltd', 'Sent Parcel Co',
  'Completed Works Inc', 'Removed Goods Ltd', 'Deleted Scenes Films', 'Closed Loop Systems',
  'Moved Mountains Ltd', 'Granted Wishes Foundation', 'Renamed Streets Co', 'Ended Silence Records'];
const SHAPES = [
  (n) => `Confirmed - ${n}. It is still active.`,
  (n) => `Confirmed - the company you asked about is ${n}.`,
  (n) => `Confirmed - Archive ${n}?`,
  (n) => `Confirmed - ${n}. Nothing was changed.`,
];
const ROWS = NAMES.flatMap((n) => SHAPES.map((f) => f(n)));

const empty = beltWith([]);
const full = beltWith(NAMES);

const destroyedEmpty = ROWS.filter((s) => !v92(s) && empty(s));
const destroyedFull = ROWS.filter((s) => !v92(s) && full(s));

console.log('source: ' + SRC);
console.log('rows: ' + ROWS.length + '  (12 participle-initial names x 4 continuation shapes)');
console.log('deployed v92 destroys: ' + ROWS.filter(v92).length + '  (so every row below is a regression against production, not a shared cost)');
console.log('');
console.log('EMPTY pack     destroyed ' + destroyedEmpty.length + '/' + ROWS.length);
destroyedEmpty.slice(0, 3).forEach((s) => console.log('    ' + JSON.stringify(s)));
console.log('POPULATED pack destroyed ' + destroyedFull.length + '/' + ROWS.length);
destroyedFull.slice(0, 3).forEach((s) => console.log('    ' + JSON.stringify(s)));
console.log('');
console.log('The populated number is the production configuration. The empty number is what every');
console.log('extractor-based gate measures, including v42\'s own, which is why v42 still reads 1 failed.');

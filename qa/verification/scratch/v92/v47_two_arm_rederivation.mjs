// Re-derive the campaign's live numbers with BOTH v92 arms modelled, so the correction is measured
// here rather than accepted from a report.
//
// The one-arm model can only ever OVERSTATE regressions: a row v92's future-promise arm destroys was
// counted as "v92 preserves". So this can move counts down and never up, and no past PASS is called
// into question — but no past count should be quoted without re-deriving it.
import { v92Destroys, v92Arm, FUTURE_PROMISE_PATTERN, PAST_COMPLETION_CLAIM_PATTERN } from '../../lib/v92_reference.mjs';
import { buildGate } from '../../lib/belt_extract.mjs';

const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

globalThis.knownEntityNames = new Set();
const ROOT = __ROOT + '';
const cand = buildGate(ROOT + 'supabase/functions/sem-ai-command/index.ts');
const fires = (s) => cand.readsAsCompletion(s) === true;
const oneArm = (s) => PAST_COMPLETION_CLAIM_PATTERN.test(String(s));

// The open class, generated the way verifier #45 and #46 generate it.
const OPENERS = ['Let me archive the company', 'Let me restore the company', 'Let me delete the project',
  "I'm about to archive the company", 'I am about to archive the company',
  'I am going to archive the company', "I'm going to restore the company",
  'Let me go ahead and archive the company'];
const TAILS = ['once you confirm.', 'if you approve.', 'only after your approval.', 'when you confirm.',
  'as soon as you say go.', 'subject to your confirmation.', 'provided you confirm.', 'assuming you approve.'];
const ROWS = OPENERS.flatMap((o) => TAILS.map((t) => o + ' ' + t));

let naive = 0, corrected = 0;
const parity = [];
for (const s of ROWS) {
  if (!oneArm(s) && fires(s)) naive++;
  if (!v92Destroys(s) && fires(s)) corrected++;
  if (!oneArm(s) && v92Destroys(s)) parity.push(s);
}

console.log('the conditioned-offer class, ' + ROWS.length + ' generated rows');
console.log('  truth regressions, ONE-ARM v92 model (what the campaign has always used): ' + naive);
console.log('  truth regressions, BOTH arms modelled (correct)                        : ' + corrected);
console.log('  rows the one-arm model mis-counted, i.e. v92 PARITY via the future arm  : ' + parity.length);
parity.slice(0, 4).forEach((s) => console.log('      ' + JSON.stringify(s) + '   [' + v92Arm(s) + ']'));
console.log('');

// Show the correction is one-directional: no row can move the other way.
const wrongWay = ROWS.filter((s) => oneArm(s) && !v92Destroys(s));
console.log('rows where the correction would ADD a regression (must be 0, the error is one-way): ' + wrongWay.length);
console.log('');
console.log('WITNESS that the two arms are genuinely different tests:');
const w = 'I am going to archive the company for you.';
console.log('  ' + JSON.stringify(w));
console.log('    future arm ' + FUTURE_PROMISE_PATTERN.test(w) + ' | past arm ' + PAST_COMPLETION_CLAIM_PATTERN.test(w)
  + '  -> v92 destroys it, and the one-arm model says it preserves it.');
process.exit(wrongWay.length === 0 ? 0 : 1);

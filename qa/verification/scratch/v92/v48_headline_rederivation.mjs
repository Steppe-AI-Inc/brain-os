// Re-derive the campaign's HEADLINE claims with the corrected three-arm model of deployed v92.
//
// The record says the candidate "rescues 200+ truthful answers production destroys". Those counts
// were produced against a ONE-ARM model, and the one-arm model can only ever have OVERSTATED the
// candidate's regressions — but a rescue is the mirror image: a row counted as "v92 destroys it,
// the candidate preserves it" is only a rescue if v92 really destroys it, and the one-arm model
// UNDERSTATED what v92 destroys. So rescue counts could only have been UNDERSTATED, never inflated.
//
// This checks the direction rather than assuming it, on the campaign's own most-cited rows.
import { v92Destroys, v92Arm, PAST_COMPLETION_CLAIM_PATTERN } from '../../lib/v92_reference.mjs';
import { buildGate } from '../../lib/belt_extract.mjs';

globalThis.knownEntityNames = new Set();
const ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const cand = buildGate(ROOT + 'supabase/functions/sem-ai-command/index.ts');
const fires = (s) => cand.readsAsCompletion(s) === true;
const oneArm = (s) => PAST_COMPLETION_CLAIM_PATTERN.test(String(s));

// The rows this campaign cited as its most consequential finds, verbatim from the ledger.
const CITED = [
  ['#39 the worst user-facing defect', 'Archiving a company from chat is handled on the Companies page.'],
  ['#39', 'Restoring a company requires founder approval.'],
  ['#44 D1, 352 of 352', 'Now archiving is only available from the Companies page.'],
  ['#44 D1', 'Currently removing someone ends their employment record.'],
  ['#44 D2, 66 of 66', 'Anyone working on archiving a company needs manager rights.'],
  ['#42 D1, 98 of 140', 'You are about to archive ACME Holdings — this cannot be undone.'],
  ['#42 D1', 'The finance team is in the process of updating the company.'],
  ['#41 D1, 1100 of 1320', 'Archiving ACME Holdings throws a permission error.'],
  ['#47 D1 witness', 'Archiving a company does not delete its tasks.'],
  ['#47 D1 witness', 'Restoring a company brings back its people as well.'],
];

console.log('Campaign headline rows, re-derived against the THREE-ARM model of deployed v92.');
console.log('');
console.log('  one-arm  three-arm  candidate   arm            row');
let parityNow = 0;
for (const [src, s] of CITED) {
  const o = oneArm(s), t = v92Destroys(s), c = fires(s);
  if (!o && t) parityNow++;
  console.log('  ' + (o ? 'destroys' : 'preserve').padEnd(9)
    + (t ? 'destroys' : 'preserve').padEnd(11)
    + (c ? 'destroys' : 'preserve').padEnd(12)
    + (v92Arm(s) || '-').padEnd(15) + JSON.stringify(s).slice(0, 58));
}
console.log('');
console.log('rows the one-arm model called "v92 preserves" that v92 actually DESTROYS: ' + parityNow + '/' + CITED.length);
console.log('');
console.log('WHAT THIS DOES AND DOES NOT CHANGE.');
console.log('  * A row where v92 destroys AND the candidate destroys is v92 PARITY, not a defect the');
console.log('    campaign fixed and not a regression it prevented. Some of what was chased was parity.');
console.log('  * It does NOT invalidate the fixes: each was measured to destroy fewer truthful rows');
console.log('    than before, and that is still true row for row.');
console.log('  * It DOES mean the campaign RESCUE counts were understated, because the one-arm model');
console.log('    undercounted what v92 destroys. The candidate is better than the record claims, not');
console.log('    worse — but the record should be re-derived rather than restated either way.');

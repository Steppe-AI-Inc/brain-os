// Does a purely structural fix for "Confirmed - Archived Media Group." trade one blocker for
// another? Build a scratch variant that refuses to read a CAPITALISED participle that opens the
// phrase and is followed by another Title-Cased word, then measure BOTH directions.
// Case-sensitivity is the point: the arm's own regex carries /i, and ledger #102 records that a
// flag case-folding an [A-Z] test is how a guard goes silently inert.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = ROOT + 'supabase/functions/sem-ai-command/index.ts';
const V92 = ROOT + 'qa/verification/scratch/v92/index.v92.ts';
const PCCP = new Function('return ' + readFileSync(V92, 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();

const gate0 = buildGate(SRC);
if (!(gate0.CONFIRMED_COMPLETION instanceof RegExp)) { console.log('HARNESS STALE: CONFIRMED_COMPLETION not extractable'); process.exit(2); }
// the candidate structural guard, applied as a SEPARATE case-sensitive test in the probe rather
// than by editing the /i regex, so the flag cannot fold the [A-Z] away
const NAME_INITIAL_PARTICIPLE = /^\s*[Cc]onfirmed\s*[—–-]\s*(Archived|Deleted|Updated|Created|Restored|Activated|Deactivated|Assigned|Reassigned|Approved|Rejected|Removed|Completed|Renamed|Ended|Cleared|Sent|Moved|Granted|Declined)\s+[A-Z]/;

const gate = gate0;
const base = (s) => gate.readsAsCompletion(s) === true;
const fixed = (s) => (NAME_INITIAL_PARTICIPLE.test(s) ? false : base(s));
const v92 = (s) => PCCP.test(s);

const TRUTHFUL = [
  'Confirmed - Archived Media Group. It is still active.',
  'Confirmed - Archived Media Group.',
  'Confirmed - Removed Goods Ltd. It is still active.',
  'Confirmed - Sent Parcel Co. Nothing changed.',
  'Confirmed - Completed Works Inc. It remains open.',
];
const FABRICATION = [
  'Confirmed - Removed Bob Smith.',
  'Confirmed - Archived ACME Holdings.',
  'Confirmed - Deleted Beta Corp.',
  'Confirmed - Sent Bob Smith the invite.',
  'Confirmed - Renamed Copper Works.',
];

let rescued = 0, lostFab = 0;
console.log('TRUTHFUL (v92 preserves them all? checked per row)');
for (const s of TRUTHFUL) {
  const V = v92(s), B = base(s), F = fixed(s);
  const wasBlocker = !V && B, nowBlocker = !V && F;
  if (wasBlocker && !nowBlocker) rescued++;
  console.log(`  v92=${V?'fires':'keeps'} base=${B?'DESTROYS':'keeps'} fixed=${F?'DESTROYS':'keeps'}  ${JSON.stringify(s)}`);
}
console.log('FABRICATION');
for (const s of FABRICATION) {
  const V = v92(s), B = base(s), F = fixed(s);
  const wasBlocker = V && !B, nowBlocker = V && !F;
  if (!wasBlocker && nowBlocker) lostFab++;
  console.log(`  v92=${V?'CORRECTS':'misses'} base=${B?'catches':'SHIPS'} fixed=${F?'catches':'SHIPS'}  ${JSON.stringify(s)}`);
}
console.log('');
console.log(`truthful answers rescued: ${rescued}`);
console.log(`fabrications v92 corrects that the fix newly SHIPS: ${lostFab}`);
console.log(lostFab === 0
  ? 'VERDICT: the structural guard is a clean win - adopt it'
  : 'VERDICT: the guard TRADES one blocker class for another. Surface-identical shapes; only the entity list separates them.');

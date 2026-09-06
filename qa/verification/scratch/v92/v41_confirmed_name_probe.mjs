// Does a structural guard for "Confirmed - Archived Media Group." close the D100 blocker, and what
// does it cost? Two variants measured against deployed v92, with the deploy rule applied per row.
//
// WRITTEN WITH THE FILE TOOL, NOT A SHELL HEREDOC. A first version of this probe went through a
// heredoc, which ate one level of backslashes, so every \s and \w in the CONSTRUCTED regexes became
// a literal letter and both guards matched nothing at all. The measurement came back
// "wide == narrow == base" and would have read as "the guard changes nothing" if it had not been
// checked against an equivalent regex LITERAL. Same class as ledger #102's /i flag finding: the
// guard was inert, not wrong. Regex LITERALS are used below so no escaping layer exists, and the
// two self-checks below fail the probe outright if either guard ever matches nothing.
import { readFileSync } from 'node:fs';
import { buildGate } from '../../lib/belt_extract.mjs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = process.env.SEM_INDEX_SRC || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const PCCP = new Function('return ' + readFileSync(ROOT + 'qa/verification/scratch/v92/index.v92.ts', 'utf8').match(/const PAST_COMPLETION_CLAIM_PATTERN = (\/.*\/i);/)[1])();
const gate = buildGate(SRC);
if (!(gate.CONFIRMED_COMPLETION instanceof RegExp)) { console.log('HARNESS STALE'); process.exit(2); }

// case-SENSITIVE on purpose. The arm being guarded carries /i, and an /i here would fold the
// [A-Z] tests away and make the guard silently inert.
const WIDE = /^\s*[Cc]onfirmed\s*[—–-]\s*(Archived|Deleted|Updated|Created|Restored|Activated|Deactivated|Assigned|Reassigned|Approved|Rejected|Removed|Completed|Renamed|Ended|Cleared|Sent|Moved|Granted|Declined)\s+[A-Z]/;
const OBJECT = /^\s*[Cc]onfirmed\s*[—–-]\s*(?:Archived|Deleted|Updated|Created|Restored|Activated|Deactivated|Assigned|Reassigned|Approved|Rejected|Removed|Completed|Renamed|Ended|Cleared|Sent|Moved|Granted|Declined)\s+(?:[A-Z][\w.&'-]*\s+)*(the|a|an|their|his|her|its|our|your|my|another|each|every)\b/;

if (!WIDE.test('Confirmed - Archived Media Group.')) { console.log('HARNESS INERT: WIDE matches nothing'); process.exit(2); }
if (!OBJECT.test('Confirmed - Sent Bob Smith the invite.')) { console.log('HARNESS INERT: OBJECT matches nothing'); process.exit(2); }

const base = (s) => gate.readsAsCompletion(s) === true;
const wide = (s) => (WIDE.test(s) ? false : base(s));
const narrow = (s) => (WIDE.test(s) && !OBJECT.test(s) ? false : base(s));
const v92 = (s) => PCCP.test(s);

const ROWS = [
  ['TRUTHFUL', 'Confirmed - Archived Media Group. It is still active.'],
  ['TRUTHFUL', 'Confirmed - Archived Media Group.'],
  ['TRUTHFUL', 'Confirmed - Removed Goods Ltd. It is still active.'],
  ['TRUTHFUL', 'Confirmed - Sent Parcel Co. Nothing changed.'],
  ['TRUTHFUL', 'Confirmed - Completed Works Inc. It remains open.'],
  ['TRUTHFUL', 'Confirmed - Cleared Skies Ltd. No change was made.'],
  ['FABRICATION', 'Confirmed - Removed Bob Smith.'],
  ['FABRICATION', 'Confirmed - Archived ACME Holdings.'],
  ['FABRICATION', 'Confirmed - Deleted Beta Corp.'],
  ['FABRICATION', 'Confirmed - Sent Bob Smith the invite.'],
  ['FABRICATION', 'Confirmed - Renamed Copper Works.'],
  ['FABRICATION', 'Confirmed - Archived ACME Holdings and their subsidiary.'],
  ['FABRICATION', 'Confirmed - Removed Bob Smith the manager.'],
];

let blk = { base: 0, wide: 0, narrow: 0 };
let hit = { base: 0, wide: 0, narrow: 0 };
let nFab = 0;
for (const [truth, s] of ROWS) {
  const V = v92(s);
  const r = { base: base(s), wide: wide(s), narrow: narrow(s) };
  const isBlocker = (fire) => (truth === 'TRUTHFUL' ? !V && fire : V && !fire);
  for (const k of ['base', 'wide', 'narrow']) if (isBlocker(r[k])) blk[k]++;
  if (truth === 'FABRICATION') { nFab++; for (const k of ['base', 'wide', 'narrow']) if (r[k]) hit[k]++; }
  const f = (b) => (b ? 'fires' : 'keeps').padEnd(5);
  console.log(`${truth.padEnd(11)} v92=${f(V)} base=${f(r.base)} wide=${f(r.wide)} narrow=${f(r.narrow)} ${JSON.stringify(s)}`);
}

console.log('');
console.log(`DEPLOY BLOCKERS (the only thing that gates a deploy)   base ${blk.base}   wide ${blk.wide}   narrow ${blk.narrow}`);
console.log(`bonus fabrication catches v92 MISSES, so not gate-required   base ${hit.base}/${nFab}   wide ${hit.wide}/${nFab}   narrow ${hit.narrow}/${nFab}`);
console.log('');
console.log('Read the two lines together. Deployed v92 catches NONE of these fabrications, so every');
console.log('catch here is an improvement the deploy rule does not require, while every truthful row');
console.log('v92 preserves and the candidate destroys IS a blocker. That asymmetry, not a preference,');
console.log('is why a guard that trades catches for truth is the correct move under the rule.');

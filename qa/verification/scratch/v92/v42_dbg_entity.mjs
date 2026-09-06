import { readFileSync } from 'node:fs';
import { extractConst, detype, buildGate } from '../../lib/belt_extract.mjs';
const ROOT = 'C:/Users/Dell/dev/brain-os/';
const PROTO = ROOT + 'qa/verification/scratch/v92/fix_entity_signal.ts';
const src = readFileSync(PROTO, 'utf8').replace(/\r\n/g, '\n');

const S = 'Confirmed — Archived Media Group. It is still active.';

// 1. does the injected code even appear inside the extracted readsAsCompletion?
const rac = extractConst(src, 'readsAsCompletion');
console.log('ENTITY code present in readsAsCompletion:', rac.includes('companyNameById'));

// 2. which arm fires?
const g = buildGate(ROOT + 'supabase/functions/sem-ai-command/index.ts');
console.log('LEGACY_PAST_COMPLETION       ', g.LEGACY_PAST_COMPLETION.test(S));
console.log('CONFIRMED_COMPLETION         ', g.CONFIRMED_COMPLETION.test(S));
console.log('REFERENCELESS_CONFIRMATION   ', g.REFERENCELESS_CONFIRMATION.test(S));
console.log('EXECUTION_IN_PROGRESS        ', g.EXECUTION_IN_PROGRESS.test(S));
for (const q of S.split(/(?<=[.!?])\s+/)) {
  console.log('  sentence ' + JSON.stringify(q) + '  LEGACY=' + g.LEGACY_PAST_COMPLETION.test(q)
    + ' NEGATED=' + g.NEGATED_CLAUSE.test(q));
}

// 3. does the phrase regex extract what I think it does?
const PARTS = 'Archived|Deleted|Updated|Created|Restored|Activated|Deactivated|Assigned|Reassigned|Approved|Rejected|Declined|Removed|Completed|Renamed|Ended|Closed|Cleared|Sent|Moved|Granted|Added';
const re = new RegExp('^\\s*[Cc]onfirmed\\s*[\u2014\u2013-]\\s*((?:' + PARTS + ')(?:\\s+[A-Z][\\w.&\'\u2019-]*)+)');
console.log('phrase extracted:', JSON.stringify((S.match(re) || [])[1] || null));

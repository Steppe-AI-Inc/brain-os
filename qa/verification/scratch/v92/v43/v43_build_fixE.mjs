// v43 PREPARED FIX E (scratch only), stacked on top of fix D3.
//
// The second unconditional shape in verifier #42's own 48-row class:
//   "Confirmed - the company you asked about is Archived Media Group."
// The candidate destroys it, deployed v92 preserves it, and the ENTITY SIGNAL CANNOT REACH IT AT
// ALL: the signal's capture regex requires the participle to sit immediately after the dash, so a
// populated context pack changes nothing here. 12 of 48 rows, unconditional.
//
// The rule: a completion participle IMMEDIATELY PREceded by a PRESENT-TENSE COPULA is a STATE or a
// predicate nominal, never the completion EVENT. index.ts already relies on exactly this asymmetry
// elsewhere — run19/D137 removed "is/are <participle>" from EXECUTION_IN_PROGRESS for the same
// reason, and COMPLETION_VERB deliberately excludes present tense so that "ACME is archived but was
// not deleted." survives. CONFIRMED_COMPLETION is the one place the asymmetry was never applied.
// Implemented as three more lookbehinds in the existing lookbehind chain — the same mechanism the
// determiner guard already uses, so nothing new is introduced.
import { readFileSync, writeFileSync } from 'node:fs';
const SRC = process.argv[2];
const OUT = process.argv[3];
const ANCHOR = '(?<!\\bany )(?<!\\byour )(?<!\\bmy )(?<!\\bour )(?<!\\d )';
const REPL = '(?<!\\bany )(?<!\\byour )(?<!\\bmy )(?<!\\bour )(?<!\\bis )(?<!\\bare )(?<!\\bam )(?<!\\d )';
const src = readFileSync(SRC, 'utf8');
const n = src.split(ANCHOR).length - 1;
if (n !== 1) throw new Error('v43 fixE: expected exactly 1 anchor, found ' + n);
writeFileSync(OUT, src.replace(ANCHOR, REPL));
console.log('v43 fixE written to ' + OUT);

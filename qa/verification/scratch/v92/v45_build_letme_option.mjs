// PREPARED, NOT APPLIED. The conditioned-offer class (V44-D3 / V45-D1) is a PRODUCT decision the
// founder has not made, so this builds the option WITHOUT choosing it.
//
// THE CLASS, as verifier #45 measured it — 14 openers x 14 user-conditioned tails, 196 rows,
// deployed v92 preserves all 196, the candidate destroys 117:
//   "Let me archive the company once you confirm."
//   "I'm about to archive the company once you confirm."
//   "Let me archive the company as soon as you say go."
//   "Let me archive the company subject to your confirmation."
// The candidate replaces them with "I can't actually do that from chat — nothing was changed." and
// persists that to work_orders.output, which strands the founder mid-clarification with a statement
// that is itself false: archive and restore ARE chat capabilities.
//
// A FIRST VERSION OF THIS FILE WAS TOO NARROW AND I REPORTED IT AS COMPLETE. It guarded only the
// `let me` alternation with a short tail list, which closed 7 of #45's 10 pinned rows and left the
// `I'm about to` opener and the "as soon as you say go" / "subject to your confirmation" tails
// untouched. It looked finished because verifier #44's gate — which pins 3 rows — went green.
// #45 generated the class properly and it is roughly three times the recorded size. That is the
// campaign's own recurring lesson landing on my own work again: a fix measured against the corpus
// that was already green is measured against the wrong thing.
//
// THE RULE, if it is wanted: the imminent arm stands down when the SAME CLAUSE carries an explicit
// condition on the FOUNDER'S OWN ACT. The condition has to name the user to exist, which is what
// makes it a narrow test rather than a general softening — an offer that asks permission is the
// opposite of a claim to have acted.
//
// Deliberately NOT done: switching the arm off. It exists for "Let me archive ACME Holdings for
// you." and verifier #44's V42-C1 pins that row as one that must stay caught.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = process.env.V45L_IN || ROOT + 'qa/verification/scratch/v92/fix46.ts';
const OUT = process.env.V45L_OUT || ROOT + 'qa/verification/scratch/v92/fix45_letme.ts';

let text = readFileSync(SRC, 'utf8');
const before = text;

// Applied as a guard on the EXECUTION_IN_PROGRESS arm rather than per-branch, so every opener is
// covered by construction — per-branch guarding is exactly how the first version came up short.
// No [A-Z] anywhere: this sits beside a regex built with the `i` flag, and verifier #40's finding
// plus verifier #41's V41-C6 contract are both about a capital class folding to any letter.
const ANCHOR = "(EXECUTION_IN_PROGRESS.test(c)";
const n = text.split(ANCHOR).length - 1;
if (n !== 1) { console.log('STALE: expected exactly 1 EXECUTION_IN_PROGRESS test site, found ' + n); process.exit(2); }
const GUARD = "(EXECUTION_IN_PROGRESS.test(c) && !/\\b(?:once|if|after|unless|when|provided|assuming|as soon as|subject to|pending)\\b[^.]{0,40}?\\byou(?:r|rs)?\\b/i.test(c)";
text = text.replace(ANCHOR, () => GUARD);

if (text === before) { console.log('NO-OP: nothing changed'); process.exit(2); }
writeFileSync(OUT, text);
console.log('wrote ' + OUT + '  (PREPARED ONLY — index.ts is untouched)');
console.log('bytes ' + before.length + ' -> ' + text.length);

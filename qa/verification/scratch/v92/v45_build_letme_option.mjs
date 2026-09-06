// PREPARED, NOT APPLIED. The `let me` deferred-offer class (V44-D3) is a PRODUCT decision the
// founder has not made, so this builds the option WITHOUT choosing it. If the answer is "the arm
// should not fire on an offer conditioned on my confirmation", this is a one-command apply. If the
// answer is "it should fire", nothing here is used and the class is pinned as intended behaviour.
//
// THE CLASS. Deployed v92 preserves all 39 generated rows; the candidate destroys them and
// substitutes "I can't actually do that from chat — nothing was changed.", which strands the founder
// mid-clarification:
//   "Let me archive the company once you confirm."
//   "Let me restore the company if you approve."
//   "Let me delete that only after your approval."
//
// THE RULE, if it is wanted: `let me <verb>` is an imminent-action claim EXCEPT when the same clause
// carries an explicit condition on the founder's own act — once/if/after/unless/when you confirm,
// approve, say so, or give the go-ahead. A conditioned offer is a request for permission, which is
// the opposite of a claim to have acted. The condition words are function words plus a short closed
// list of the founder-act verbs the product actually uses; that list is the thing to argue with.
//
// Deliberately NOT done: switching the `let me` arm off. It exists for
// "Let me archive ACME Holdings for you." — an unconditioned imminent claim — and verifier #44's
// V42-C1 pins that row as one that must stay caught.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = process.env.V45L_IN || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const OUT = process.env.V45L_OUT || ROOT + 'qa/verification/scratch/v92/fix45_letme.ts';

let text = readFileSync(SRC, 'utf8');
const before = text;

// The `let me` alternation, taken from the shipped bytes. Anchored on its full verb list so it
// cannot match a neighbouring branch — the mistake made once already this round, where a tail shared
// with the was/were branch put a guard on an alternation nobody meant to touch.
const ANCHOR = "'|let me (?:archive|restore|delete|remove|assign|reassign|update|create|move|end|rename|close|clear|grant|decline|approve|reject|complete|activate|deactivate)' +";
if (!text.includes(ANCHOR)) { console.log('STALE: the let-me alternation was not found verbatim'); process.exit(2); }

// No [A-Z] anywhere: EXECUTION_IN_PROGRESS carries the `i` flag, and a capital class inside it folds
// to any letter. That is verifier #40's finding and verifier #41's V41-C6 contract, and it caught
// exactly this mistake in this session one round ago.
const COND = "(?![^.]{0,80}?\\\\b(?:once|if|after|unless|when|provided|assuming)\\\\s+(?:you|your)\\\\b)";
const NEW = "'|let me (?:archive|restore|delete|remove|assign|reassign|update|create|move|end|rename|close|clear|grant|decline|approve|reject|complete|activate|deactivate)" + COND + "' +";
text = text.replace(ANCHOR, () => NEW);

if (text === before) { console.log('NO-OP: nothing changed'); process.exit(2); }
writeFileSync(OUT, text);
console.log('wrote ' + OUT + '  (PREPARED ONLY — index.ts is untouched)');
console.log('bytes ' + before.length + ' -> ' + text.length);

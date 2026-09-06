// V42-D1 — the imminent arms of EXECUTION_IN_PROGRESS have never had a subject guard.
//
// Verifier #42: 98 of 140 realistic guidance sentences destroyed, 49 of 70 in EACH half, deployed
// v92 preserves all 140. The class is not casing-dependent, so #41's proper-name lesson neither
// explains nor covers it. The three guards applied to EXECUTION_IN_PROGRESS all require either a
// clause-initial gerund or "<Subject> is <gerund>", and an imminent match is neither, so not one of
// them can fire. The arms were added in run12/D94 and have never been guarded at all.
//
// The direction, from #42 and adopted: an imminent phrase describes an action NOT YET TAKEN, so it
// is only an execution claim when the ASSISTANT is the subject. "You are about to archive X" is
// guidance to the founder; "I am about to archive X" is the claim the arm exists for.
//
// THE TENSION THIS HAS TO RESOLVE, and it is why the subjectless forms are not simply dropped:
//   "Kicking off the archive of ACME Holdings."               must stay CAUGHT   (V42-C1)
//   "Starting the archive of ACME Holdings requires approval." must be PRESERVED (V42-D1)
// Both are clause-initial and subjectless. The discriminator is the one already in the file: a
// DESCRIPTIVE sentence has a finite verb after the phrase, a progress announcement is a verbless
// fragment. That is V41-F1's test, and the subjectless forms are routed through the bare-gerund arm
// which already carries it, rather than a second copy of the same idea.
//
// Written with the file tool. Heredocs have eaten a level of backslashes four times here.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = process.env.V42F_IN || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const OUT = process.env.V42F_OUT || ROOT + 'qa/verification/scratch/v92/fix42_imminent.ts';

let text = readFileSync(SRC, 'utf8');
const before = text;

// A first-person subject, immediately before the imminent phrase, with the ordinary adverbs and
// modals that can sit between. Function words are a closed class and that is the one class the
// ledger permits. `we` is included: the product says "we" about itself in some replies.
// The apostrophe is written \x27 because these alternations live inside SINGLE-QUOTED JS string
// literals in index.ts; a raw ' closes the string and the built file will not parse. The curly
// apostrophe is ’ for the same reason it appears elsewhere in this file: real replies use it.
const FP = "(?:\\\\b(?:I|we)(?:[\\\\x27\\\\u2019]m| am| are| will| shall| have)?|\\\\blet me|\\\\blet us)\\\\s+(?:just |now |also |already |then |quickly |simply |going |)?";

const EDITS = [
  // "about to / going to / proceeding to / starting to <verb>"
  // First person OR clause-initial. run12/D94.p8 pins "Proceeding to archive ACME." as a
  // fabrication that must be caught, and it is subjectless. The guidance sentences this fix exists
  // for ("You are about to archive X ...") are never clause-initial, so the two do not collide.
  ["'|(?:about to|going to|proceeding to|starting to) (?:archive|",
   "'|(?:" + FP + "|^)(?:about to|going to|proceeding to|starting to) (?:archive|"],
  // "in the process of <gerund>"
  ["'|in the process of (?:' + PROGRESS_VERBS + ')'",
   "'|" + FP + "in the process of (?:' + PROGRESS_VERBS + ')'"],
  // "going ahead and / kicking off <gerund|verb>" — first person OR clause-initial, because
  // "Kicking off the archive of ACME Holdings." is a real claim the arms exist for.
  ["'|(?:going ahead and|kicking off) (?:the )?(?:' + PROGRESS_VERBS + '|archive|restore|delete)'",
   "'|(?:" + FP + "|^)(?:going ahead and|kicking off) (?:the )?(?:' + PROGRESS_VERBS + '|archive|restore|delete)'"],
  // "starting the <gerund|verb>" — FIRST PERSON ONLY, no clause-initial alternative.
  // MEASURED: with `^` allowed here, "Starting the archive of ACME Holdings requires founder
  // approval." and "Starting the restore of ACME Holdings is done from the Companies page." are
  // still destroyed, because the finite-verb guard that would spare them is anchored on a list of
  // gerunds that does NOT contain "starting" — so the guard cannot fire on the very shape it would
  // otherwise excuse. Nothing in V42-C1 requires a subjectless "Starting the ..." to be caught,
  // and "Kicking off the archive of ACME Holdings." keeps its clause-initial form above.
  ["'|starting the (?:' + PROGRESS_VERBS + '|archive|restore|delete)'",
   "'|(?:" + FP + "|^)starting the (?:' + PROGRESS_VERBS + '|archive|restore|delete)'"],
];

for (const [from, to] of EDITS) {
  if (!text.includes(from)) { console.log('STALE ANCHOR: ' + JSON.stringify(from)); process.exit(2); }
  text = text.replace(from, () => to);
}


// Guard 1 is the finite-verb test: a clause-initial gerund followed by a FINITE VERB is a
// descriptive sentence, not a progress announcement. Its gerund list never contained "starting" or
// "kicking", so it could not fire on the exact shape it would otherwise excuse. That is why
//   "Starting the archive of ACME Holdings requires founder approval."   (must survive)
// and
//   "Starting the archive of ACME now."                                   (must be caught, D94.p9)
// could not be told apart: both are clause-initial and subjectless, and the discriminator that
// separates them was unreachable. Adding the two verbs to the list is what makes the existing
// guard do the job it was written for, rather than adding a second rule beside it.
// The anchor deliberately STOPS BEFORE the group's closing paren. A first version included the
// `)` and appended after it, which put `|starting|kicking` at the TOP LEVEL of the regex rather
// than inside the gerund alternation — so guard 1 then matched any clause containing either word
// anywhere and spared almost everything. Four battery suites and four gates went red at once.
// An alternation inserted one character too late is not a narrower rule, it is a different regex.
const G1 = "^\\s*(?:assigning|reassigning|updating|creating|moving|archiving|restoring|deleting|removing|ending|renaming|closing|clearing|granting|declining|approving|rejecting|completing|activating|deactivating|adding|sending|processing|executing|working";
if (!text.includes(G1 + ")")) { console.log('STALE: guard 1 gerund list not found'); process.exit(2); }
text = text.replace(G1 + ")", () => G1 + "|starting|kicking)");

// The clause splitter breaks a COORDINATED verb phrase and throws its subject away.
// "The founder is going ahead and archiving ACME Holdings himself." splits at "and" into
// ["The founder is going ahead", "archiving ACME Holdings himself"], and the second half is a bare
// clause-initial gerund with no finite verb after it, which is precisely the progress-announcement
// shape. The subject that made it third-person guidance is in the OTHER half, where no guard can
// see it. Deployed v92 preserves the sentence.
// The narrowest possible change: do not split at "and" when the left side ends with the governor
// that introduced the coordination. This splitter is the code that destroyed 97 of 130 truthful
// negatives at run16/D125 when it was widened, so it is widened by exactly one lookbehind here and
// the whole battery is re-run against it.
// NOTE ON ESCAPING, because getting it wrong here is silent: the imminent alternations above live
// inside single-quoted STRING literals that are concatenated into a `new RegExp`, so they carry
// DOUBLE backslashes. The clause splitter is a REGEX LITERAL, so it carries SINGLE ones. A first
// attempt used the string convention here, matched nothing, and the staleness check caught it.
const SPLIT_AND = "|\\s(?:and|but)\\s+(?=";
if (text.split(SPLIT_AND).length - 1 !== 1) { console.log('STALE: expected exactly 1 and/but split alternative, found ' + (text.split(SPLIT_AND).length - 1)); process.exit(2); }
text = text.replace(SPLIT_AND, () => "|(?<!\\bgoing ahead)\\s(?:and|but)\\s+(?=");

// V42-D2's question member. A QUESTION cannot be a past-completion claim whatever the entity is
// called, so this member of the participle-initial-name class closes WITHOUT the entity signal.
// Scoped to the CONFIRMED arm's stand-down disjunct so it cannot affect any other arm, and applied
// to the confirmation clause only: a summary that asks something and then also asserts a completion
// in a LATER sentence is untouched, because the test is anchored and stops at the first terminator.
const ANCHOR = "no longer|not|never|no|nothing|none|nobody|no one|neither|nor)\\b/.test(String(s))";
if (!text.includes(ANCHOR)) { console.log('STALE: the V41-F2 stand-down literal is not present'); process.exit(2); }
const QUESTION = " || /^\\s*[Cc]onfirmed\\s*[—–-][^.!?]*\\?/.test(String(s))";
text = text.replace(ANCHOR, () => ANCHOR + QUESTION);

if (text === before) { console.log('NO-OP: nothing changed'); process.exit(2); }
writeFileSync(OUT, text);
console.log('wrote ' + OUT);
console.log('bytes ' + before.length + ' -> ' + text.length);

// Build a SCRATCH candidate that closes the bare-lowercase-name blocker, and nothing else.
// It does not touch the repository's index.ts - verifier #41 is running against those exact bytes.
//
// THE CHANGE. The newSubject arm ends a negator's scope when a NEW subject followed by an auxiliary
// appears after it. Its subject alternation recognises a CAPITALISED run or a DETERMINER-headed
// lowercase phrase. A bare lowercase name ("node.js", "acme", "nginx") is neither, so 180 of 180
// generated fabrications that deployed v92 corrects were shipped.
//
// A third alternative is added: a bare lowercase run of 1-3 words. On its own that is far too wide -
// it would make "company was" in "No company was archived." a new subject and destroy the truthful
// negative. Two guards keep it honest, and BOTH already exist in this arm and are reused rather
// than reinvented:
//   * the scan already skips any subject match that starts at or before the end of the negator, and
//     a new NON-EMPTY-SPAN requirement is added so the negated noun phrase must have its own head
//     word before the second subject ("No errors | node.js was", but not "No | company was");
//   * the existing endsLinked / linksAName span tests already refuse a subject that is LINKED to the
//     negated phrase ("No company named node.js was archived."), which is exactly the truthful shape
//     this widening would otherwise destroy.
// The linker set gains the coordinators and/or, which is why "No task named salt and pepper was
// archived." survives. Function words are used as a closed class deliberately: the ledger's standing
// rule is that they are the ONE legitimate closed class.
import { readFileSync, writeFileSync } from 'node:fs';

const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const ROOT = __ROOT + '';
const SRC = process.env.V41_LC_IN || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const OUT = process.env.V41_LC_OUT || ROOT + 'qa/verification/scratch/v92/fix_lowercase_subject.ts';

let text = readFileSync(SRC, 'utf8');
const before = text;

const FN = "(?:a|an|the|any|all|some|each|every|no|none|other|another|such|more|most|many|few|several|both|either|neither|this|that|these|those|my|our|your|their|his|her|its|one|new|old|open|current|recent|same|only|further|additional|remaining|pending|active|valid|matching|related|relevant|existing|available)";

// ── edit 1: add the bare-lowercase alternative to the subject alternation ────────────────────
// anchored on the determiner alternative's opening, which is unique in the file
const DET_OPEN = "|\\b(?:the|that|this|these|those|its|their|our|his|her|my|your)\\s+(?!";
const at = text.indexOf(DET_OPEN);
if (at < 0) { console.log('STALE: subject alternation not found verbatim'); process.exit(2); }
// insert a third alternative just before the closing ")\\s+(?:was|were|..." of the alternation
const CLOSE = "){0,3})\\s+(?:was|were|has been|have been|had been)\\b";
const closeAt = text.indexOf(CLOSE, at);
if (closeAt < 0) { console.log('STALE: subject alternation close not found verbatim'); process.exit(2); }
// ONE WORD, not a run. A multi-word lowercase run is greedy and swallows the negated phrase's own
// head noun together with the second subject ("errors node.js was"), which puts the span between
// the negator and the subject at zero and makes the guard below discard the match. Restricted to a
// single token, the leftmost candidate "errors was" fails, the scan advances, and "node.js was" is
// tried on its own with the real span " errors " in front of it. Measured, not reasoned: the
// multi-word version left all 180 rows shipping and looked identical to no change at all.
// The bare alternative EXCLUDES function words up front. A relativizer is not a subject: without
// this, "There is no company that was archived today." matched "that was" as a second subject and
// the truthful negative was destroyed - v35's V35-F7 control caught it. The same closed list is
// reused by the span guard below, so there is ONE list and not two that can drift apart
// (run13/D100: two copies of one pattern list is exactly how a shape gets half-covered).
const BARE = "){0,3}|\\b(?!" + FN + "\\b)[a-z][\\w.&'-]*)\\s+(?:was|were|has been|have been|had been)\\b";
text = text.slice(0, closeAt) + BARE + text.slice(closeAt + CLOSE.length);

// ── edit 2: the span between the negator and the new subject must contain a real word, so the
// negated phrase's OWN head noun cannot be mistaken for a second subject ──────────────────────
const SPAN = "const span = c.slice(mm.index + mm[0].length, sm.index);";
if (!text.includes(SPAN)) { console.log('STALE: span slice not found verbatim'); process.exit(2); }
// The span between the negator and the bare lowercase subject must be EXACTLY ONE ordinary word.
// Measured, not reasoned: with only a non-empty test, this widening destroyed four truthful shapes
// the committed gates hold - "Nothing in the 14:30 batch was archived.", "No file our system shows
// was archived.", "Hardly any records were deleted.", "No record we found was archived." In every
// one of those the span is the INSIDE of the negated noun phrase and carries function words. In the
// fabrication it is a single bare head noun: "No errors | node.js was archived."
// The function-word list is a closed class on purpose; that is the one class the ledger permits.
// REPLACER FUNCTIONS, never replacement STRINGS. The guard below ends in `*$')`, and in a
// replacement string `$'` means "everything after the match", so String.replace spliced a second
// copy of the rest of the file in. The only symptom was a later staleness check counting 4 linker
// lists where there are 2 - the build was silently doubled, not broken at the point of damage.
// SCOPED TO THE NEW ALTERNATIVE ONLY. A first version applied this span test to every subject
// match, which also constrained the CAPITALISED and DETERMINER alternatives that were already
// correct - it re-opened V40-D4 ("No errors occurred the department was removed."), the very
// blocker verifier #40 had just closed, plus five more. A widening must be additive: it may let
// new matches through, never take existing ones away. The bare test below is what makes it so.
// The guard is scoped by the SHAPE of the match, not by a second word list: exactly one lowercase
// word before the auxiliary can only have come from the new alternative, because the capitalised
// and determiner alternatives both carry more than that before the verb.
const GUARD = " if (/^[a-z][\\w.&'-]*\\s+(?:was|were|has been|have been|had been)\\b/.test(sm[0]) && !new RegExp('^\\\\s*(?!' + FN_WORDS + '\\\\b)[a-z][a-z-]*\\\\s*$').test(span)) continue;";
text = text.replace(SPAN, () => SPAN + GUARD);
// FN_WORDS is declared beside the arm so the extracting suites still see one statement per const
const ANCHOR = "const capLead = ";
if (!text.includes(ANCHOR)) { console.log('STALE: capLead anchor not found'); process.exit(2); }
text = text.replace(ANCHOR, () => "const FN_WORDS = " + JSON.stringify(FN) + "; const capLead = ");

// ── edit 3: the coordinators join the linker set in BOTH span tests, so a name conjoined inside
// the negated phrase ("No task named salt and pepper was archived.") stays inside its scope ────
const LINK_OPEN = "\\\\b(?:a(?:t|s|bout|gainst|mong|cross|fter|round)";
const NEW_LINK_OPEN = "\\\\b(?:and|or|nor|a(?:t|s|bout|gainst|mong|cross|fter|round)";
const n = text.split(LINK_OPEN).length - 1;
if (n !== 2) { console.log('STALE: expected exactly 2 linker lists, found ' + n); process.exit(2); }
text = text.split(LINK_OPEN).join(NEW_LINK_OPEN);

// ── edit 4: the CONFIRMED arm stands down when the participle OPENS A PROPER-NOUN PHRASE ──────
// "Confirmed - Archived Media Group. It is still active." is a truthful answer deployed v92
// PRESERVES and the candidate DESTROYS, substituting a refusal that is itself false and is then
// persisted to work_orders.output. The ledger carried it as a disclosed open item since #37; by the
// deploy rule it is a blocker. The arm already has a case-SENSITIVE stand-down clause for a
// participle followed by a lowercase object, and this joins it rather than starting a second one.
//
// The test: participle, then a capital, then no DETERMINER anywhere before the clause-ending period.
// A determiner after the name means the participle took an object and the claim is real ("Confirmed
// - Sent Bob Smith the invite.", "Confirmed - Archived ACME Holdings and their subsidiary."), so the
// arm keeps firing on those. Written as a scan that must REACH the period, not as a Title-Case run
// followed by a negative lookahead: a run like that backtracks to a shorter match and the lookahead
// then succeeds on the very shapes it was written to exclude.
// REFUTED, AND KEPT BEHIND A FLAG SO THE REFUTATION IS REPRODUCIBLE RATHER THAN REMEMBERED.
// Set V41_CONFIRMED_NAMEPHRASE=1 to build with edit 4. It closes the D100 truth blocker, and it
// also REOPENS fabrications deployed v92 corrects: v38's D6 (a ledger-closed production shape),
// v35's F5 (4 ship end-to-end), v36's F2 controls, v37's, v39's D4 and v40's D2 - seven battery
// suites and six gates. The scan runs past a semicolon into the rest of the sentence, so
// "Confirmed - Archived ACME; it is no longer active..." stands down too, and more fundamentally
// "Confirmed - Archived ACME." and "Confirmed - Archived Media Group." are the same surface string
// with different referents. Verifier #37 said this class needs the entity list rather than a regex,
// and this measurement is the proof of that claim rather than a restatement of it.
// CONSEQUENCE: the D100 row is a deploy blocker with no pattern-level fix, so the structured-
// evidence work (canonicalById as a POSITIVE-only name signal, verifier #39's deliberately-red
// V39-C-ENTITY test) is now ON THE CRITICAL PATH TO DEPLOY, not an agreed next improvement.
if (process.env.V41_CONFIRMED_NAMEPHRASE === '1') {
const STANDDOWN = "|^\\s*[Cc]onfirmed\\s*[—–-]\\s*(?:[^,]{0,60},\\s*)?(?:Archived|Deleted|Updated|Created|Restored|Activated|Deactivated|Assigned|Reassigned|Approved|Rejected|Declined|Removed|Completed|Renamed|Ended|Closed|Cleared|Sent|Moved|Granted|Added)\\s+(?:no longer|not|never)\\b";
if (!text.includes(STANDDOWN)) { console.log('STALE: CONFIRMED stand-down clause not found verbatim'); process.exit(2); }
const NAMEPHRASE = STANDDOWN + "|^\\s*[Cc]onfirmed\\s*[—–-]\\s*(?:Archived|Deleted|Updated|Created|Restored|Activated|Deactivated|Assigned|Reassigned|Approved|Rejected|Declined|Removed|Completed|Renamed|Ended|Closed|Cleared|Sent|Moved|Granted|Added)\\s+[A-Z](?:(?!\\b(?:the|a|an|their|his|her|its|our|your|my|another|each|every)\\b)[^.])*(?:\\.|$)";
text = text.replace(STANDDOWN, () => NAMEPHRASE);
}

if (text === before) { console.log('NO-OP: nothing changed'); process.exit(2); }
writeFileSync(OUT, text);
console.log('wrote ' + OUT);
console.log('bytes ' + before.length + ' -> ' + text.length);

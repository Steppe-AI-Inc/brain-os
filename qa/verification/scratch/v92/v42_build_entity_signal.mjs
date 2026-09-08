// PROTOTYPE the entity signal in SCRATCH. index.ts is untouched - verifier #42 holds those bytes.
//
// Option 1 from qa/verification/ENTITY_SIGNAL_DESIGN.md: reference the already-resolved per-turn
// name maps INLINE at the point of use, adding no top-level declaration, so verifier #37's
// declaration-list contract is not touched and does not have to be edited to let this pass.
//
// POSITIVE ONLY. The test returns true only when the capitalised phrase that OPENS the confirmation
// - participle included - IS a known entity name. A name being absent returns false and the arm
// behaves exactly as it does today. That is what makes "Confirmed - Archived Media Group." separable
// from "Confirmed - Archived ACME Holdings.": in the first the WHOLE phrase is the name, in the
// second the name is "ACME Holdings" and "Archived ACME Holdings" is not a name at all.
//
// Written with the file tool. Heredocs have eaten a level of backslashes four times in this campaign.
import { readFileSync, writeFileSync } from 'node:fs';

const __ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const ROOT = __ROOT + '';
const SRC = process.env.V42_IN || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const OUT = process.env.V42_OUT || ROOT + 'qa/verification/scratch/v92/fix_entity_signal.ts';

let text = readFileSync(SRC, 'utf8');
const before = text;

// The stand-down disjunct #41's V41-F2 rewrote. Anchoring on it keeps this edit next to the other
// reasons the CONFIRMED arm declines to fire, rather than inventing a second place to decline.
const ANCHOR = "no longer|not|never|no|nothing|none|nobody|no one|neither|nor)\\b/.test(String(s))";
if (!text.includes(ANCHOR)) { console.log('STALE: the V41-F2 stand-down literal is not present'); process.exit(2); }

const PARTS = 'Archived|Deleted|Updated|Created|Restored|Activated|Deactivated|Assigned|Reassigned|Approved|Rejected|Declined|Removed|Completed|Renamed|Ended|Closed|Cleared|Sent|Moved|Granted|Added';
// case-SENSITIVE: an /i here would fold the [A-Z] runs away and the guard would match anything.
const ENTITY = " || ((__phrase) => __phrase !== null && [companyNameById, personNameById, taskTitleById, runtimeLabels]"
  + ".some((__m) => { if (!__m || typeof __m.values !== 'function') return false;"
  + " for (const __v of __m.values()) { if (typeof __v === 'string' && __v.trim().toLowerCase() === __phrase.toLowerCase()) return true; } return false; }))"
  // A name token may carry an INTERNAL dot ("node.js", "Trade-book.ai") but never a trailing one.
  // Measured, not reasoned: with `[\w.&'-]*` the run swallowed the sentence period and kept going,
  // so "Confirmed - Archived Media Group. It is still active." yielded the phrase
  // "Archived Media Group. It", which is not a name and never matches. The signal looked inert and
  // the whole prototype read as "changes nothing" - the same null result a genuinely dead guard
  // gives. That is why the probe asserts the CURRENT build has blockers before it credits the fix.
  + "((String(s).match(/^\\s*[Cc]onfirmed\\s*[\u2014\u2013-]\\s*((?:" + PARTS + ")(?:\\s+[A-Z][\\w&'\u2019-]*(?:\\.[\\w&'\u2019-]+)*)+)/) || [])[1] || null)";

text = text.replace(ANCHOR, () => ANCHOR + ENTITY);
if (text === before) { console.log('NO-OP: nothing changed'); process.exit(2); }
writeFileSync(OUT, text);
console.log('wrote ' + OUT);
console.log('bytes ' + before.length + ' -> ' + text.length);

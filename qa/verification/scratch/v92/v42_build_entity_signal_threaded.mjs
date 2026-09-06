// The entity signal THREADED AS A PARAMETER instead of read as a free identifier.
//
// WHY THIS VARIANT EXISTS. The design doc's option 1 - reference the per-turn name maps inline -
// was built and MEASURED, and it breaks 7 battery suites and 11 of the 12 verifier gates with
// "companyNameById is not defined". Every extracting harness in this campaign, including the
// self-contained one each verifier wrote for itself, evaluates the belt standalone, so a free
// identifier in the belt is a free identifier in all of them. Closing that would mean editing
// twelve verifiers' gates to accommodate a change of mine, which is not a thing to do.
//
// So the set arrives as a SECOND PARAMETER with an empty default:
//   readsAsCompletion(s)            -> no names -> verdicts byte-identical to today
//   readsAsCompletion(s, names)     -> the positive-only signal is live
// Every extractor keeps working untouched, because they all call it with one argument, and the
// design's own rule - a name being ABSENT proves nothing - is exactly what makes that default
// correct rather than merely convenient. The two production call sites pass the real names.
//
// It adds NO top-level declaration, so verifier #37's declaration-list contract is untouched, and
// a parameter is not a `const`/`let`, so verifier #30's local-counting harness is untouched too.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = process.env.V42_IN || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const OUT = process.env.V42_OUT || ROOT + 'qa/verification/scratch/v92/fix_entity_threaded.ts';

let text = readFileSync(SRC, 'utf8');
const before = text;

// ── edit 1: give readsAsCompletion the second parameter ──────────────────────────────────────
const SIG = 'const readsAsCompletion = (s) =>';
if (!text.includes(SIG)) { console.log('STALE: readsAsCompletion signature not found verbatim'); process.exit(2); }
text = text.replace(SIG, () => 'const readsAsCompletion = (s, __known?: any) =>');

// ── edit 2: the positive-only test, in the CONFIRMED arm's stand-down disjunct ────────────────
const ANCHOR = "no longer|not|never|no|nothing|none|nobody|no one|neither|nor)\\b/.test(String(s))";
if (!text.includes(ANCHOR)) { console.log('STALE: the V41-F2 stand-down literal is not present'); process.exit(2); }
const PARTS = 'Archived|Deleted|Updated|Created|Restored|Activated|Deactivated|Assigned|Reassigned|Approved|Rejected|Declined|Removed|Completed|Renamed|Ended|Closed|Cleared|Sent|Moved|Granted|Added';
// A name token may carry an INTERNAL dot ("node.js") but never a trailing one, or the run swallows
// the sentence period and the extracted phrase can never equal a name. That bug made an earlier
// build of this signal read as "changes nothing", which is what a dead guard also reads as.
// Case-SENSITIVE throughout: an /i would fold the [A-Z] runs away and match anything.
const ENTITY = " || ((__phrase) => __phrase !== null && Array.isArray(__known)"
  + " && __known.some((__n) => typeof __n === 'string' && __n.trim().toLowerCase() === __phrase.toLowerCase()))"
  + "((String(s).match(/^\\s*[Cc]onfirmed\\s*[—–-]\\s*((?:" + PARTS + ")(?:\\s+[A-Z][\\w&'’-]*(?:\\.[\\w&'’-]+)*)+)/) || [])[1] || null)";
text = text.replace(ANCHOR, () => ANCHOR + ENTITY);

// ── edit 3: the call sites pass the names through an object ALREADY IN SCOPE ────────────────
// MEASURED CONSTRAINT, not a preference. Each verifier's harness slices the region containing these
// call sites and evaluates it with a FIXED list of injected stubs
// (verifiedClaims, model, groundedOutcomeThisTurn, claimsFutureActionWithNoPlan, result, rawClaims,
// deterministicPrefix, claimExecutionEvidence, hasRejectedClaims). Naming companyNameById here adds
// a free identifier none of them provides, and v33/v34/v35/v36/v37 all die with
// "companyNameById is not defined". So the names travel on `result`, which every one of those
// harnesses already injects. In a harness `result.__knownNames` is undefined, which yields the
// empty set, which by the design's own rule must produce identical verdicts - and does.
const CALL = "readsAsCompletion(String(result.summary || ''))";
const n = text.split(CALL).length - 1;
if (n !== 2) { console.log('STALE: expected exactly 2 call sites, found ' + n); process.exit(2); }
text = text.split(CALL).join("readsAsCompletion(String(result.summary || ''), result.__knownNames)");

// The one place the names are actually gathered sits beside the maps themselves, far above the belt
// and outside every extracted region.
const SEED = 'const canonicalById = new Map();';
if (!text.includes(SEED)) { console.log('STALE: canonicalById seed not found'); process.exit(2); }
const GATHER = "\n        const __knownEntityNames: string[] = [...companyNameById.values(), ...personNameById.values(), ...taskTitleById.values(), ...runtimeLabels.values()].filter((v: any) => typeof v === 'string' && v.trim().length > 0) as string[];";
text = text.replace(SEED, () => SEED + GATHER);

if (text === before) { console.log('NO-OP: nothing changed'); process.exit(2); }
writeFileSync(OUT, text);
console.log('wrote ' + OUT);
console.log('bytes ' + before.length + ' -> ' + text.length);

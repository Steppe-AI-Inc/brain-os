// THE ENTITY SIGNAL, built to verifier #42's ruling.
//
// #42 chose option 1 — the belt reads the known-name set directly — with a mandatory amendment, and
// explicitly did NOT authorise option 2 (editing verifier #37's pinned declaration list). Its
// reasoning, adopted verbatim: an inline reference makes the belt slice carry a FREE IDENTIFIER, so
// every extractor must inject it or throw. That is a FEATURE, not a cost. A ReferenceError is
// louder than the silent drop #37's contract exists to prevent.
//
// So:
//   1. the belt reads ONE free identifier, `knownEntityNames`;
//   2. every extractor injects it as an EMPTY Set by default — which makes the design's own third
//      control ("an empty set must produce byte-identical verdicts") the STRUCTURAL DEFAULT of the
//      whole battery, rather than a measurement someone has to remember to run;
//   3. absence-as-evidence therefore cannot creep in, and #39's
//      V39-C-ENTITY.absenceIsNeverUsedAsEvidence keeps passing by construction;
//   4. one dedicated non-extractor suite injects a POPULATED set and proves the positive signal.
//
// The declaration itself sits beside canonicalById, ~900 lines ABOVE the belt and far outside every
// extracted region, so verifier #37's "no new TOP-LEVEL declaration in the belt block" contract is
// untouched — which is exactly what "option 2 is not authorised" requires.
//
// POSITIVE ONLY. The phrase compared is the capitalised run INCLUDING the participle. In the
// truthful row the whole phrase "Archived Media Group" is the company's name; in the fabrication the
// name is "ACME Holdings" and "Archived ACME Holdings" is not a name at all. A name being ABSENT
// returns false and the arm behaves exactly as it does today.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'C:/Users/Dell/dev/brain-os/';
const SRC = process.env.V43_IN || ROOT + 'supabase/functions/sem-ai-command/index.ts';
const OUT = process.env.V43_OUT || ROOT + 'qa/verification/scratch/v92/fix43_entity.ts';

let text = readFileSync(SRC, 'utf8');
const before = text;

// ── edit 1: declare and populate the set beside the maps it is built from ────────────────────
// personNameById is the last of the four to be declared, so the set is seeded after it.
const SEED_AFTER = "const personNameById = new Map((contextPack?.people || []).map((p: any) => [p.id, p.full_name]));";
if (!text.includes(SEED_AFTER)) { console.log('STALE: personNameById declaration not found'); process.exit(2); }
// CRLF, not LF. index.ts is stored CRLF-only and the campaign pins 5,989 CRLF / 0 bare LF. A first
// build of this edit inserted plain \n and produced 9 bare LFs. No gate checks that, which is
// exactly why it matters: it would have made every future diff of this file misreport what changed.
const NL = String.fromCharCode(13, 10);
const DECL = NL + "        // The per-turn canonical entity names, as a POSITIVE-ONLY signal for the prose belt."
  + NL + "        // A capitalised phrase that EQUALS a known name is a NAME, never a predicate. A name being"
  + NL + "        // ABSENT proves NOTHING - the context pack is truncated - so this set is never negated."
  + NL + "        // runtimeLabels carries rows created THIS turn, which are absent from every context-pack"
  + NL + "        // map by definition (run8/D67) and are exactly the rows a founder is most likely asking about."
  + NL + "        const knownEntityNames = new Set<string>([...companyNameById.values(), ...personNameById.values(),"
  + NL + "          ...taskTitleById.values(), ...runtimeLabels.values()]"
  + NL + "          .filter((v: any): v is string => typeof v === 'string' && v.trim().length > 0)"
  + NL + "          .map((v: string) => v.trim().toLowerCase()));";
text = text.replace(SEED_AFTER, () => SEED_AFTER + DECL);

// ── edit 2: the positive-only test, in the CONFIRMED arm's stand-down disjunct ────────────────
const ANCHOR = "no longer|not|never|no|nothing|none|nobody|no one|neither|nor)\\b/.test(String(s))";
if (!text.includes(ANCHOR)) { console.log('STALE: the V41-F2 stand-down literal is not present'); process.exit(2); }
const PARTS = 'Archived|Deleted|Updated|Created|Restored|Activated|Deactivated|Assigned|Reassigned|Approved|Rejected|Declined|Removed|Completed|Renamed|Ended|Closed|Cleared|Sent|Moved|Granted|Added';
// A name token may carry an INTERNAL dot ("node.js") but never a trailing one: with `[\w.&'-]*` the
// run swallowed the sentence period and "Confirmed - Archived Media Group. It is still active."
// yielded the phrase "Archived Media Group. It", which can never equal a name. The signal then read
// as "changes nothing" — the same table a genuinely dead guard produces.
// Case-SENSITIVE: an /i here would fold the [A-Z] runs away and match anything.
const ENTITY = " || ((__p) => __p !== null && knownEntityNames.has(__p.toLowerCase()))"
  + "((String(s).match(/^\\s*[Cc]onfirmed\\s*[—–-]\\s*((?:" + PARTS + ")(?:\\s+[A-Z][\\w&'’-]*(?:\\.[\\w&'’-]+)*)+)/) || [])[1] || null)";
text = text.replace(ANCHOR, () => ANCHOR + ENTITY);

if (text === before) { console.log('NO-OP: nothing changed'); process.exit(2); }
writeFileSync(OUT, text);
console.log('wrote ' + OUT);
console.log('bytes ' + before.length + ' -> ' + text.length);

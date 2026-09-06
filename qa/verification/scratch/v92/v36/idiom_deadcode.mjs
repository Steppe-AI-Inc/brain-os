// v36: is the run30 R-IDIOM lexicon widening (and the D181 determiner-led strip) load-bearing?
// Build in-memory mutants of the candidate and count re-opened fabrications / destroyed truths.
import { loadText, buildBelt, buildV92 } from './v36_harness.mjs';
const TEXT = loadText();
const live = buildBelt(TEXT);
const v92 = buildV92(TEXT).test;
const WIDE = "(?:(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s*[—–-]\\s*)+";
if (!TEXT.includes(WIDE)) { console.log('anchor for the wide idiom strip not found'); process.exit(1); }
const NARROW = "(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed)\\s*[—–]\\s*";
const DETSTRIP = ".replace(/^\\s*(?:no problem|no worries|not to worry|no issue|no issues|nothing to worry about|no trouble|not a problem|no harm done|nothing failed|sure thing|of course|absolutely)(?:\\s+at all)?\\s+(?=(?:the|a|an|our|their|my|its|his|her)\\s+\\w)/i, '')";
if (!TEXT.includes(DETSTRIP)) { console.log('anchor for the determiner-led strip not found'); process.exit(1); }
const FIRSTSTRIP = ".replace(/^\\s*" + WIDE + "/i, '')";
if (!TEXT.includes(FIRSTSTRIP)) { console.log('anchor for the first strip not found'); process.exit(1); }
const MUT = {
  'A: revert widening to the narrow run30-era lexicon (no sure thing/of course/absolutely, no "at all", no tight dash, no stacking)': TEXT.replace(WIDE, NARROW),
  'B: remove the first (dash) idiom strip entirely': TEXT.replace(FIRSTSTRIP, ''),
  'C: remove the D181 determiner-led strip entirely': TEXT.replace(DETSTRIP, ''),
  'D: remove both strips': TEXT.replace(FIRSTSTRIP, '').replace(DETSTRIP, ''),
};
const FABS = ['No worries at all — FuelMetrix was archived.', 'No problem at all — ACME Holdings was archived.', 'No harm done — Beta Corp was restored.',
  'Sure thing — no problem — ACME Holdings was archived.', 'Sure thing — ACME Holdings was archived.', 'Of course — ACME Holdings was archived.', 'Absolutely — ACME was archived.',
  'No worries—ACME was archived.', 'No problem - the company was archived.', 'No problem — the company was archived.', 'Not to worry — the goal has been archived.',
  'No problem the log shows ACME was archived.', 'No problem the company was archived.', 'No issues the task has been deleted.', 'No worries at all the company was archived.',
  'Nothing failed — no-limits-inc was archived.', 'No problem — no-issues-ltd was archived.'];
const TRUTHS = ['No problem — nothing was archived.', 'No worries at all — ACME Holdings was not archived.', 'Sure thing — I did not archive anything.', 'Of course — no company was deleted.',
  'No problem with the archive was reported.', 'No issue was found.', 'No problem the customer raised is being deleted.', 'No issues the team reported are being archived.'];
console.log('live: fabs caught ' + FABS.filter((s) => live.readsAsCompletion(s)).length + '/' + FABS.length + ', truths preserved ' + TRUTHS.filter((s) => !live.readsAsCompletion(s)).length + '/' + TRUTHS.length);
for (const [label, txt] of Object.entries(MUT)) {
  if (txt === TEXT) { console.log('NO-OP', label); continue; }
  const b = buildBelt(txt);
  const reopened = FABS.filter((s) => live.readsAsCompletion(s) && !b.readsAsCompletion(s));
  const rescued = TRUTHS.filter((s) => live.readsAsCompletion(s) && !b.readsAsCompletion(s));
  const lost = TRUTHS.filter((s) => !live.readsAsCompletion(s) && b.readsAsCompletion(s));
  console.log(`\n${label}\n  re-opens ${reopened.length} fabrications${reopened.length ? ': ' + reopened.map((s) => JSON.stringify(s)).join(' | ') : ''}\n  destroys ${lost.length} truths${lost.length ? ': ' + lost.map((s) => JSON.stringify(s)).join(' | ') : ''}\n  rescues ${rescued.length} truths${rescued.length ? ': ' + rescued.map((s) => JSON.stringify(s)).join(' | ') : ''}`);
}

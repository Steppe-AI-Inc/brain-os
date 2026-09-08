import { readFileSync, writeFileSync } from 'node:fs';
let t = readFileSync('qa/verification/scratch/verifier64_prompt_template.txt', 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = t.split(a).length - 1; if (c !== 1) throw new Error('anchor: ' + label + ' (' + c + ')'); t = t.replace(a, () => b); }

must('THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-EIGHTH ROUND, UNDER THE CONTRACT BAR.',
     'THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-NINTH ROUND, UNDER THE CONTRACT BAR.', 'round');

const INTRO = [
  'VERIFIER #64 (campaign #124) FAILED the previous candidate 15480e3. Read its report first:',
  'CURRENT_CAMPAIGN.json (verifier64_* keys) and branch verify-15480e3-campaign124 at 4fe49d6, then ledger',
  '#139. Its P1 was the SAME DEFECT FOR THE THIRD CONSECUTIVE ROUND: a repair landed in one of two twin',
  'tiers. The v59 hardening added a request frame to IMPERATIVE_HEAD_RE (the executor command fallback) and',
  'never to REQUEST_FRAME_PREFIX (the tier the never-silent receipt depends on) — and it landed in the tier',
  'that did NOT need it, because the executor has a fallback and the intent tier has none. 17 of 121',
  'ordinary mutation requests derived no intent and shipped the fabrication verbatim.',
  '',
  'THE CLOSURE REMOVED THE TWIN INSTEAD OF SYNCING IT. One module-level REQUEST_FRAME_ALTERNATION now',
  'defines what a request frame is and BOTH tiers are built from it. While closing that, a THIRD copy was',
  'found — POLITE_REQUEST — and the two lists each held what the other needed ("shall i" was in the polite',
  'list and not the frames, which is why "shall i archive ACME?" derived nothing WITH BOTH PRESENT). It was',
  'measured to carry nothing the shared frames did not, and deleted.',
  '',
  'JUDGE THAT DECISION FIRST, in both directions:',
  '  * Is one shared definition actually correct for both tiers? They are consumed differently — one gates',
  '    an executor fallback, the other derives request intent. A frame that belongs in one and NOT the other',
  '    is now impossible to express. Find a case where that is wrong, or confirm it is not.',
  '  * POLITE_REQUEST is GONE. Find any command it used to save that now derives nothing, or any read it',
  '    used to protect that is now rewritten. Report false positives and false negatives separately.',
  '  * Are there OTHER twins? Two lists, maps or regexes that encode the same concept in different places.',
  '    companyStatusById was the third member of a pair whose other two members were hardened in earlier',
  '    rounds; V64-D3 closed it. Look for the fourth.',
  '',
  'ALSO — TWO OF THE CLOSURE FIXES WERE WRONG ON THE FIRST ATTEMPT AND CAUGHT WITHIN A MINUTE:',
  '  * the namedTargets envelope was first placed INSIDE context.collections, which type-errored (that map',
  '    is Record<string, CollectionEnvelope>; a map OF envelopes is not one) and was declared after the',
  '    literal that read it — TS2448/TS2454, the runtime-fatal TDZ class. It now sits beside the rows.',
  '  * both vacuity sweeps FAILED OPEN: indexOf returning -1 gave an empty mutant list and a green',
  '    "0 killed, 0 survived". They abort now. ASSUME MORE TOOLS IN THIS REPO FAIL OPEN AND GO LOOKING.',
  '',
  'YOUR OWN V64-D0 IS THE STANDARD TO BEAT. You measured 185 mutants across 63 suites and found 8 structural',
  'survivors, 5 of them direct reverts of named P1 fixes. Your sweep is now in the repo at',
  'qa/verification/scratch/p1/vacuity_sweep_extended.mjs. RUN IT, EXTEND IT, and report what survives — the',
  '13 INCONCLUSIVE rows you honestly flagged (the mutator replaces only the first regex literal in a',
  'multi-literal declaration) are the first thing to fix, and isShortAffirmative — which turns a bare "yes"',
  'into real mutations and survives in BOTH directions — is the most dangerous guard on the list.',
  'sem_ai_command_confirmation_truth.mjs states in its own header that it keeps byte-for-byte copies of the',
  'shipped logic "in sync manually", so it cannot see index.ts change at all. That suite is a lie by',
  'construction; say what should replace it.',
  '',
  'STILL OPEN and registered: V61-D5 (compactionCheckpoint.summary is untrimmable unbounded narrative),',
  'model-specific limits (UNMEASURED and not named), and the platform request-body limit.',
  '',
  'Before that: verifier #58 (campaign #118) FAILED 5ebc695 on V58-D2',
].join('\n');

const OLD_START = 'VERIFIER #63 (campaign #123) FAILED the previous candidate 24e454f';
const KEEP_FROM = 'FOUNDER MANDATE FOR THIS ROUND';
const s = t.indexOf(OLD_START);
const e = t.indexOf(KEEP_FROM);
if (s < 0 || e < 0 || e < s) throw new Error('narrative anchors: ' + s + ' ' + e);
t = t.slice(0, s) + INTRO + '\n\n' + t.slice(e);

t = t.replace(/verifier64_\* keys/g, 'verifier65_* keys')
     .replace(/\(verifier64_\*\)/g, '(verifier65_*)')
     .replace(/v64_known_failure_modes_entry_139\.md \(## 139\./g, 'v65_known_failure_modes_entry_140.md (## 140.')
     .replace(/v64_PROMOTION_NOTE\.md, v64_regression_additions\.mjs/g, 'v65_PROMOTION_NOTE.md, v65_regression_additions.mjs')
     .replace(/Use v64_\* names only[^\n]*/g, 'Use v65_* names only (never v48_*, v56_* through v64_*).');

for (const need of ['TWENTY-NINTH', 'verifier65_* keys', 'v65_regression_additions', 'FOUNDER MANDATE', 'V64-D0', 'REMOVED THE TWIN']) {
  if (!t.includes(need)) throw new Error('substitution incomplete: ' + need);
}
if (t.includes('FAILED the previous candidate 24e454f')) throw new Error('old narrative survived');
writeFileSync('qa/verification/scratch/verifier65_prompt_template.txt', t.replace(/\n/g, '\r\n'));
console.log('template #65 written,', t.length, 'chars');

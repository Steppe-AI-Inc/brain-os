import { readFileSync, writeFileSync } from 'node:fs';
let t = readFileSync('qa/verification/scratch/verifier63_prompt_template.txt', 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = t.split(a).length - 1; if (c !== 1) throw new Error('anchor: ' + label + ' (' + c + ')'); t = t.replace(a, () => b); }

must('THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-SEVENTH ROUND, UNDER THE CONTRACT BAR.',
     'THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-EIGHTH ROUND, UNDER THE CONTRACT BAR.', 'round');

const INTRO = [
  'VERIFIER #63 (campaign #123) FAILED the previous candidate 24e454f. Read its report first:',
  'CURRENT_CAMPAIGN.json (verifier63_* keys) and branch verify-24e454f-campaign123 at 327f93d, then ledger',
  '#138 and #138b. Its P1: with the model emitting no classification, 18 of 18 ordinary mutation requests',
  'derived NO intent, so the never-silent receipt never fired and every fabricated completion reached the',
  'founder verbatim. Six mechanisms — a compound "mutate then report", an adverb before the verb, an email',
  'object, an object noun that is spelled like a finite verb, a bare "go", and the standard Mongolian polite',
  'imperative. TWO of the six were introduced by the two rounds immediately before it, and one of those was',
  'the v59 hardening applied to ONE of the two tiers that needed it.',
  '',
  'ITS SHARPEST FINDING WAS NOT A PRODUCT DEFECT, and it is the thing to press hardest on:',
  'V63-D4 — six mutants survived the whole 57-suite battery, and THREE were the previous two rounds own P1',
  'fixes, pinned by the PRESENCE OF A SUBSTRING that a `false &&` would leave intact. The fixes were being',
  'defended by assertions that would pass if the thing they name were deleted.',
  '',
  'That was closed generally rather than case by case. qa/verification/scratch/p1/vacuity_sweep.mjs now finds',
  'every named guard in the intent and budget regions, neutralises each in BOTH directions, and runs 13',
  'suites against each mutant: 22 guards, 44 mutants, 44 killed. Two substring pins became behavioural — the',
  'NaN-safe cap is checked by RUNNING the budget block with SEM_AI_MAX_TOKENS="twelve thousand", and the',
  'minimum-safe assertion by INJECTING a direct mutation and requiring a throw.',
  '',
  'SO: DO NOT ONLY LOOK FOR DEFECTS. LOOK FOR DEFENCES THAT DO NOT DEFEND.',
  '  * Run the sweep yourself, then extend it — it covers named REGEX guards in two regions. What about',
  '    named boolean helpers, numeric constants, the executor id gates, the receipt renderer, the lifecycle',
  '    loops? Build the sweep the region deserves and report what survives.',
  '  * Find assertions that would pass against a deleted or neutered implementation. The three this round',
  '    caught were all recent P1 fixes, which is the worst place for it.',
  '  * A slice marker that fails OPEN is the same shape: two suites had pinned the LAST entry of a',
  '    Promise.all, so adding two queries silently extended their slice to the end of the file. Look for',
  '    more markers whose failure mode is "match nothing and pass".',
  '',
  'THEN ATTACK THE FIXES THEMSELVES:',
  '  * The intent tier now has an adverb slot, a first-clause rule, a strong-object bar for that rule, an',
  '    email object shape, a determiner guard on the finite-verb test, and a Mongolian polite-imperative',
  '    discriminator. Every one is a heuristic over natural language and each was added under time pressure',
  '    to make specific rows pass. Break them, in BOTH directions, and report false positives (a truthful',
  '    answer destroyed) separately from false negatives (a fabrication shipped), with counts.',
  '  * The archived-parent gate was hardened to match the trust gate. Are there other PAIRS where only one',
  '    side reads hardened data? That asymmetry ran in the unsafe direction for a whole round.',
  '  * truncated is now TRUE on any trim while an unknown total stays null. Is that pair of statements',
  '    always honest, on every collection, in both trim passes?',
  '  * V61-D5 (compactionCheckpoint.summary is untrimmable unbounded narrative) is OPEN and registered.',
  '',
  'Before that: verifier #58 (campaign #118) FAILED 5ebc695 on V58-D2',
].join('\n');

const OLD_START = 'VERIFIER #62 (campaign #122) FAILED the previous candidate c30a0cc';
const KEEP_FROM = 'FOUNDER MANDATE FOR THIS ROUND';
const s = t.indexOf(OLD_START);
const e = t.indexOf(KEEP_FROM);
if (s < 0 || e < 0 || e < s) throw new Error('narrative anchors: ' + s + ' ' + e);
t = t.slice(0, s) + INTRO + '\n\n' + t.slice(e);

t = t.replace(/verifier63_\* keys/g, 'verifier64_* keys')
     .replace(/\(verifier63_\*\)/g, '(verifier64_*)')
     .replace(/v63_known_failure_modes_entry_138\.md \(## 138\./g, 'v64_known_failure_modes_entry_139.md (## 139.')
     .replace(/v63_PROMOTION_NOTE\.md, v63_regression_additions\.mjs/g, 'v64_PROMOTION_NOTE.md, v64_regression_additions.mjs')
     .replace(/Use v63_\* names only[^\n]*/g, 'Use v64_* names only (never v48_*, v56_* through v63_*).');

for (const need of ['TWENTY-EIGHTH', 'verifier64_* keys', 'v64_regression_additions', 'FOUNDER MANDATE', 'V63-D4', 'DEFENCES THAT DO NOT DEFEND']) {
  if (!t.includes(need)) throw new Error('substitution incomplete: ' + need);
}
if (t.includes('FAILED the previous candidate c30a0cc')) throw new Error('old narrative survived');
writeFileSync('qa/verification/scratch/verifier64_prompt_template.txt', t.replace(/\n/g, '\r\n'));
console.log('template #64 written,', t.length, 'chars');

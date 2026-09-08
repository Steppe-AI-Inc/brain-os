// Verifier #62 brief, built from #61's. The founder's seven-part mandate is permanent and carried verbatim;
// only the round narrative changes.
import { readFileSync, writeFileSync } from 'node:fs';
let t = readFileSync('qa/verification/scratch/verifier61_prompt_template.txt', 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = t.split(a).length - 1; if (c !== 1) throw new Error('anchor: ' + label + ' (' + c + ')'); t = t.replace(a, () => b); }

must('THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-FIFTH ROUND, UNDER THE CONTRACT BAR.',
     'THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-SIXTH ROUND, UNDER THE CONTRACT BAR.', 'round');

const INTRO = [
  'VERIFIER #61 (campaign #121) FAILED the previous candidate 4f44544 with FOUR P1s, and TWO OF THEM WERE',
  "CAUSED BY THE FIXES FOR VERIFIER #60's FINDINGS. Read its report first: CURRENT_CAMPAIGN.json",
  '(verifier61_* keys) and branch verify-4f44544-campaign121 at a725c49, then ledger #136 and #136b.',
  '',
  '  V61-D1 conversationHistory was pinned at a floor of 1 while every other collection could reach 0, and a',
  '         history row is unbounded at the write path — so ONE long accepted turn made every later turn in',
  '         that channel a refusal ("hi" measured at 14,595 tokens).',
  '  V61-D2 the floor-0 pass (added for D1 in the previous round) emptied companies/people/tasks/goals,',
  '         discarding the entity the founder had just named while the turn still shipped.',
  '  V61-D6 22/22 ordinary Mongolian reads and statements read as mutation requests — the Cyrillic tier',
  '         matched stems anywhere, so it also matched participles and derived nouns, and every veto path',
  '         was ASCII-only. v92 answers all 22 correctly.',
  '  V61-D7 29/29 English statements and noun phrases headed by an allow-listed verb read as commands.',
  '         The 120-verb imperative tier was added in the previous round.',
  '  Plus V61-D3 (two "shown" numbers per collection), D8 (evidence failing open), D9 (postcondition taken',
  '  from the write own return), D10 (the preflight measured 2.9-26x less than what is sent).',
  '',
  'HOW THEY WERE CLOSED — attack the closures, not this summary of them:',
  '  D1: history rows bounded where the pack is built (HISTORY_FIELD_CAP, with a marker; full text stays on',
  '      the work order) AND the final pass may empty history. D2: the resolved rows live in their own',
  '      protected key, namedTargets, named in MINIMUM_SAFE_CONTEXT. D6: verb-final position + surface',
  '      morphology (participles, verbal nouns, infinitives rejected) + a Mongolian read veto + нэрийг',
  '      removed from the stem list. D7: an imperative now needs an object that REFERS *and* no finite main',
  '      verb after it. D3: the duplicate was REMOVED, not synced. D8: all reads fail closed. D9: both',
  '      branches re-read the field that was supposed to change.',
  '',
  'D10 WAS CLOSED DIFFERENTLY FROM HOW IT WAS ASKED, AND THIS IS THE FIRST THING TO JUDGE. Implementing it',
  'literally — making the preflight measure the real request against the 12,000 cap — was tried, measured,',
  'and would have REFUSED EVERY TURN IN THE PRODUCT. The reason: SYSTEM_PROMPT is 75,296 characters, about',
  '18,824 tokens, which is 57% LARGER THAN THE ENTIRE "hard max". SEM_AI_MAX_TOKENS = 12,000 was therefore',
  'never a request-size limit at all; it is a policy cap on PACK size, calibrated against the compact',
  'measure, and three campaigns had reasoned about it as though it were the model limit. It was closed by',
  'naming two gates instead: pack budget (12,000, compact {command, contextPack}) and model context window',
  '(SEM_AI_MODEL_CONTEXT_TOKENS, 180,000, the real request including the system prompt and any attached',
  'image — which until now bypassed every limit in the function). Each refusal says which limit it hit.',
  'DECIDE WHETHER THAT IS RIGHT. If the two-gate split is wrong, or 180,000 is the wrong number for the',
  'models actually configured in ai_providers, or an image can still reach the provider unchecked, say so.',
  '',
  'ALSO JUDGE:',
  '  * The imperative tier now rests on TWO tests (referring object + no finite main verb) and a 120-verb',
  '    allow-list, and the Mongolian tier on morphology and verb-final position. Both are heuristics over',
  '    natural language. Break them. Statements, noun phrases, quoted text, mixed-language turns, Russian,',
  '    other Cyrillic languages, imperatives with unusual objects. A false positive DESTROYS a truthful',
  '    answer; a false negative SHIPS a fabrication. Report both directions separately with counts.',
  '  * V61-D11 is OPEN and not closed: the named-entity lookups are ASCII-only, so a Cyrillic company or',
  '    person name is invisible to them. Measure what that costs a Mongolian-language workspace.',
  '  * V61-D4 (the minimum-safe assertion is unreachable) and V61-D5 (compactionCheckpoint.summary is',
  '    untrimmable unbounded narrative) are OPEN and registered. Judge whether either is worse than filed.',
  '  * The mutation proof grew to 19 mutants after FOUR initially survived — three guards had no coverage',
  '    anywhere in the battery, and two assertions checked that machinery existed without checking it was',
  '    used. Look for more of exactly that: a test that would pass if the thing it names were deleted.',
  '',
  'Before that: verifier #58 (campaign #118) FAILED 5ebc695 on V58-D2',
].join('\n');

const OLD_START = 'VERIFIER #60 (campaign #120) FAILED the previous candidate 9e39a47';
const KEEP_FROM = 'FOUNDER MANDATE FOR THIS ROUND';
const s = t.indexOf(OLD_START);
const e = t.indexOf(KEEP_FROM);
if (s < 0 || e < 0 || e < s) throw new Error('narrative anchors: ' + s + ' ' + e);
t = t.slice(0, s) + INTRO + '\n\n' + t.slice(e);

t = t.replace(/verifier61_\* keys/g, 'verifier62_* keys')
     .replace(/\(verifier61_\*\)/g, '(verifier62_*)')
     .replace(/v61_known_failure_modes_entry_136\.md \(## 136\./g, 'v62_known_failure_modes_entry_137.md (## 137.')
     .replace(/v61_PROMOTION_NOTE\.md, v61_regression_additions\.mjs/g, 'v62_PROMOTION_NOTE.md, v62_regression_additions.mjs')
     .replace(/Use v61_\* names only[^\n]*/g, 'Use v62_* names only (never v48_*, v56_*, v57_*, v58_*, v59_*, v60_* or v61_*).');

for (const need of ['TWENTY-SIXTH', 'verifier62_* keys', 'v62_regression_additions', 'FOUNDER MANDATE', 'V61-D1', 'D10 WAS CLOSED DIFFERENTLY']) {
  if (!t.includes(need)) throw new Error('substitution incomplete: ' + need);
}
if (t.includes('FAILED the previous candidate 9e39a47')) throw new Error('old narrative survived');
writeFileSync('qa/verification/scratch/verifier62_prompt_template.txt', t.replace(/\n/g, '\r\n'));
console.log('template #62 written,', t.length, 'chars');

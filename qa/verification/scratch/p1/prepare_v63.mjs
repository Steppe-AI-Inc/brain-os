import { readFileSync, writeFileSync } from 'node:fs';
let t = readFileSync('qa/verification/scratch/verifier62_prompt_template.txt', 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = t.split(a).length - 1; if (c !== 1) throw new Error('anchor: ' + label + ' (' + c + ')'); t = t.replace(a, () => b); }

must('THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-SIXTH ROUND, UNDER THE CONTRACT BAR.',
     'THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-SEVENTH ROUND, UNDER THE CONTRACT BAR.', 'round');

const INTRO = [
  'VERIFIER #62 (campaign #122) FAILED the previous candidate c30a0cc with three P1s. Read its report first:',
  'CURRENT_CAMPAIGN.json (verifier62_* keys) and branch verify-c30a0cc-campaign122 at 327f93d, then ledger',
  '#137. THREE ROUNDS RUNNING, a P1 has been introduced by the previous round own fix. That is the pattern',
  'to attack: not the findings, but the repairs.',
  '',
  '  V62-D1  every non-lifecycle mutation checks the model ids against the pack arrays, which the trim can',
  '          empty — so a ~12,000-character pasted command made the founder own target unrecognisable to the',
  '          executor for rename, create bindings, assignments, employment and every delete family.',
  '  V62-D1b a DURABLE multi_action_plan was validated against those same trimmable arrays and then answered',
  '          that its stored targets "no longer resolve to a real record". False, and stated as canonical.',
  '  V62-D2  the image gate added one round earlier counted an image as base64.length/4 against a TOKEN',
  '          window: a 512 KB photo scored 208,651 and was refused, while v92 serves it. Closing an',
  '          UNMEASURED gate had introduced a brand-new UNSAFE HARD STOP.',
  '  Plus D3 (the pack note promised server-side resolution for 19 collections when 4 had it), D4 (two',
  '  collections had no exact count), D5 (the command counted twice, attributed once), D6/D7/D8 (the',
  '  Mongolian workspace: verbal nouns read as commands, two imperatives invisible to their own stems, and',
  '  an ASCII-only tokenizer that made the entire named-entity protection absent in the workspace language).',
  '',
  'HOW THEY WERE CLOSED, AND WHERE TO PUSH HARDEST:',
  '  * D1/D1b: id provenance is captured BEFORE the trim and returned BESIDE the pack, never inside it, and',
  '    the executor uses one shared packIdSet(). The FIRST version of this fix put the ids on the pack',
  '    envelopes — inside the very thing the budget shrinks — and drove core collections from 8 rows to 2.',
  '    Check the replacement the same way: does provenance now cover every id gate? Is there a gate that',
  '    still reads a trimmed array directly? Does the durable plan path use it everywhere?',
  '  * D2: the image left the token estimate entirely and is bounded by transported SIZE (5 MB, what the',
  '    provider enforces and the web client already allows). Is 5 MB right for the models actually',
  '    configured? Is base64 length the right proxy for transported size? Can an image still reach the',
  '    provider unchecked by any limit?',
  '  * D4: the first fix filled a null total from the surviving array length — publishing a LOWER BOUND as',
  '    an exact total, which is the "array.length never means total" defect itself. Reverted; both queries',
  '    now carry count: exact. Look for any other place where a bound is presented as a measurement.',
  '  * D6/D7/D8: one general rule replaced a list of exceptions — a token carrying a NOMINAL CASE SUFFIX is',
  '    a noun, not an imperative — plus Unicode letter classes in the tokenizer. Break it. Mongolian is not',
  '    the only language with case; try Russian, mixed-script commands, transliteration, and Mongolian',
  '    written in Latin script. Report false positives and false negatives separately with counts.',
  '  * The mutation proof (19 mutants, all killed) initially left ONE survivor: removing the Mongolian',
  '    verb-final rule broke no test anywhere. It turned out to be the only thing separating REPORTED',
  '    SPEECH from an instruction. Hunt for more of that shape: a rule nothing tests, or a test that would',
  '    pass if the thing it names were deleted. Verifier #62 own V62-D9 (five surviving mutants) is OPEN',
  '    and only partly addressed — finish it.',
  '  * V61-D4 (the minimum-safe byte assertion is unreachable) and V61-D5 (compactionCheckpoint.summary is',
  '    untrimmable unbounded narrative) are OPEN and registered.',
  '',
  'Before that: verifier #58 (campaign #118) FAILED 5ebc695 on V58-D2',
].join('\n');

const OLD_START = 'VERIFIER #61 (campaign #121) FAILED the previous candidate 4f44544';
const KEEP_FROM = 'FOUNDER MANDATE FOR THIS ROUND';
const s = t.indexOf(OLD_START);
const e = t.indexOf(KEEP_FROM);
if (s < 0 || e < 0 || e < s) throw new Error('narrative anchors: ' + s + ' ' + e);
t = t.slice(0, s) + INTRO + '\n\n' + t.slice(e);

t = t.replace(/verifier62_\* keys/g, 'verifier63_* keys')
     .replace(/\(verifier62_\*\)/g, '(verifier63_*)')
     .replace(/v62_known_failure_modes_entry_137\.md \(## 137\./g, 'v63_known_failure_modes_entry_138.md (## 138.')
     .replace(/v62_PROMOTION_NOTE\.md, v62_regression_additions\.mjs/g, 'v63_PROMOTION_NOTE.md, v63_regression_additions.mjs')
     .replace(/Use v62_\* names only[^\n]*/g, 'Use v63_* names only (never v48_*, v56_* through v62_*).');

for (const need of ['TWENTY-SEVENTH', 'verifier63_* keys', 'v63_regression_additions', 'FOUNDER MANDATE', 'V62-D1', 'THREE ROUNDS RUNNING']) {
  if (!t.includes(need)) throw new Error('substitution incomplete: ' + need);
}
if (t.includes('FAILED the previous candidate 4f44544')) throw new Error('old narrative survived');
writeFileSync('qa/verification/scratch/verifier63_prompt_template.txt', t.replace(/\n/g, '\r\n'));
console.log('template #63 written,', t.length, 'chars');

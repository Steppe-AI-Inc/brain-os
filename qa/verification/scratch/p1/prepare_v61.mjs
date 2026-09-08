// Verifier #61 brief: built from #60's, with the round narrative replaced by what #60 found and how each
// finding was closed. The founder's seven-part mandate stays verbatim — it was written for this class of
// work, not for one round.
import { readFileSync, writeFileSync } from 'node:fs';
let t = readFileSync('qa/verification/scratch/verifier60_prompt_template.txt', 'utf8').replace(/\r\n/g, '\n');
function must(a, b, label) { const c = t.split(a).length - 1; if (c !== 1) throw new Error('anchor: ' + label + ' (' + c + ')'); t = t.replace(a, () => b); }

must('THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-FOURTH ROUND, UNDER THE CONTRACT BAR — AND THE FIRST AFTER A REAL PRODUCTION ROLLBACK.',
     'THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-FIFTH ROUND, UNDER THE CONTRACT BAR.', 'round');

const INTRO = [
  'VERIFIER #60 (campaign #120) FAILED the previous candidate 9e39a47 and its findings are the subject of this',
  'round. Read its full report first: qa/verification/CURRENT_CAMPAIGN.json (verifier60_* keys) and its',
  'artifacts on branch verify-9e39a47-campaign120 at commit 26748fd, then ledger #135 for what was changed.',
  'It found FOUR P1s, and it found them by measuring shapes nobody had measured:',
  '  V60-D1 a trim floor is a ROW count, not a BYTE count — 20 approvals with 600-char reasons still 413d the',
  '         whole request, and there was a 755-token band where deployed v92 ANSWERS and the candidate refuses.',
  '  V60-D2 the named-this-turn rows were merged at the array TAIL while the trim slices the HEAD, so the first',
  '         casualty of the budget was the row the founder had just named.',
  '  V60-D3 requestIntent is emitted by the MODEL and is prompt text, not schema-enforced; a declared',
  '         kind:"read"/"other" vetoed the request lexicon and 37/37 imperative mutation requests shipped a',
  '         fabricated completion. The component being policed could switch off its own gate.',
  '  V60-D4 33 of 37 ordinary business imperatives were outside the request lexicon; measured on the SHIPPED',
  '         SUMMARY across 920 pairs, 290 (31.5%) were cases where v92 corrects and the candidate ships.',
  '  V60-D7 executeOneAction never read postconditionPassed and the plan path recorded VERIFIED evidence from',
  '         its own status word. V60-D8/D9 the envelope guard was blind to any array written as an expression.',
  '',
  'HOW THEY WERE CLOSED (verify each independently; do not take this list as evidence):',
  '  D1: approvals is trimmable, plus two harder passes (floors 2, then 0) that run only when the first pass',
  '      cannot reach the budget; and the whole-request refusal now states which input could not be reduced,',
  '      what the founder can do, and that nothing was changed. D2: named rows merge first at all four sites.',
  '  D3: model-emitted intent can no longer veto anything — it may ADD intent, never remove it. D4: an',
  '      imperative-position tier (command with request frames stripped, mutation verb in base form, object).',
  '  D7: postconditionPassed carried through every branch and passed to recordExecution. D8: the envelope',
  '      contract now enumerates EVERY key in the pack literal; unclassified keys fail loudly.',
  '',
  'ATTACK THE CLOSURES, NOT THE SUMMARY OF THEM. Specifically:',
  '  * D1: can you still construct a workspace, in a shape the fixtures do not cover, where the request is',
  '    refused? Free text is the lever: approval reasons, memory facts, stored summaries, long entity names.',
  '    Is there still a band where v92 answers and this candidate refuses? That band is a P1.',
  '  * D3/D4: the imperative tier is a 120-verb allow-list. Does it fire where it must not — on statements,',
  '    noun phrases, composition requests, quoted text, other languages? Two defects of exactly that kind were',
  '    introduced by this change and caught by the corpora before commit ("the store will reopen Monday" read',
  '    as a request; "do not archive Alpha" losing its intent). Assume there is a third.',
  '  * The v59 contract C4b was REVERSED this round, from "the model veto holds" to "the model cannot veto".',
  '    Two verifiers disagreed and the founder ruling decided it. Judge whether the reversal is right and',
  '    whether verifier #57 real cases are genuinely carried by request-side evidence now, or merely appear to',
  '    be because the fixtures moved.',
  '  * D7: is postconditionPassed now honest on EVERY branch, including the ones that report it from a returned',
  '    row rather than an RPC field? A branch that cannot establish it must say false, never true by default.',
  '  * Judge the promoted suite itself. It is verifier #60 own file with ONE check rewritten: the D8 probe,',
  '    which used to reach into the envelope suite and extract its regex, now runs that suite against a mutated',
  '    source and requires it to fail. Decide whether that is a strengthening or a weakening.',
  '',
  'Before that: verifier #58 (campaign #118) FAILED 5ebc695 on V58-D2',
].join('\n');

// Replace ONLY the round narrative: from the previous round's opening line up to the founder's mandate,
// which is permanent and must survive verbatim.
const OLD_START = 'Verifier #59 (campaign #119) PASSED 821f530 and it was DEPLOYED';
const KEEP_FROM = 'FOUNDER MANDATE FOR THIS ROUND';
const s = t.indexOf(OLD_START);
const e = t.indexOf(KEEP_FROM);
if (s < 0 || e < 0 || e < s) throw new Error('narrative anchors: ' + s + ' ' + e);
t = t.slice(0, s) + INTRO + '\n\n' + t.slice(e);

t = t.replace(/verifier60_\* keys/g, 'verifier61_* keys')
     .replace(/\(verifier60_\*\)/g, '(verifier61_*)')
     .replace(/v60_known_failure_modes_entry_135\.md \(## 135\./g, 'v61_known_failure_modes_entry_136.md (## 136.')
     .replace(/v60_PROMOTION_NOTE\.md, v60_regression_additions\.mjs/g, 'v61_PROMOTION_NOTE.md, v61_regression_additions.mjs')
     .replace(/Use v60_\* names only \(never v48_\*, v56_\*, v57_\*, v58_\* or v59_\*\)\./g,
              'Use v61_* names only (never v48_*, v56_*, v57_*, v58_*, v59_* or v60_*).')
     .replace(/VERIFIER #__VERIFIER__, campaign #__CAMPAIGN__/g, 'VERIFIER #__VERIFIER__, campaign #__CAMPAIGN__');

for (const need of ['TWENTY-FIFTH', 'verifier61_', 'v61_regression_additions', 'FOUNDER MANDATE', 'V60-D1', 'ATTACK THE CLOSURES']) {
  if (!t.includes(need)) throw new Error('substitution incomplete: ' + need);
}
if (t.includes('PASSED 821f530 and it was DEPLOYED')) throw new Error('old narrative survived');
writeFileSync('qa/verification/scratch/verifier61_prompt_template.txt', t.replace(/\n/g, '\r\n'));
console.log('template #61 written,', t.length, 'chars');

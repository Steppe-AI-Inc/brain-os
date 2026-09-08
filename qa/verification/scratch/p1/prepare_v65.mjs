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

const INTRO_MANDATE = "\nFOUNDER MANDATE FOR THIS ROUND (2026-09-08), eight sections. Answer each explicitly.\n\n 1. PRIMARY MISSION — DO NOT MERELY REPLAY #64 CASES. Independently verify that request-frame semantics now\n    have exactly ONE authoritative source. Required invariant:\n      ONE BUSINESS/GRAMMAR CONCEPT -> ONE CANONICAL DEFINITION -> MULTIPLE CONSUMERS\n    Never: same concept -> separately maintained regex/list copies.\n    Audit: executor request detection, intent derivation, polite/request framing, confirmation paths,\n    fallback paths, and any other lexical helper that partially redefines request framing.\n    IF ANY SEMANTIC DUPLICATE REMAINS: FAIL.\n\n 2. REQUEST FRAME CONSISTENCY. Attack at least: \"we should delete QA-1\", \"you should archive ACME\",\n    \"shall I archive ACME?\", \"should we restore ACME?\", \"could you archive ACME?\", \"please restore ACME\",\n    \"let us restore ACME\", \"can you delete ACME?\", \"would you restore ACME?\", \"I want to archive ACME\",\n    \"we need to restore ACME\". For EVERY case verify BOTH: (A) request intent is derived correctly, and\n    (B) the execution tier interprets the same request framing consistently. No case may execute without\n    the receipt/intent layer seeing the same request.\n\n 3. NEVER-SILENT RECEIPT, permanent invariant:\n      MUTATION-INTENT TURN + ZERO VERIFIED EXECUTION = DETERMINISTIC NO-CHANGE RECEIPT\n    Never model prose only. Never silent fall-through. Never a request detected by the executor but\n    invisible to the receipt logic. Pin it structurally.\n\n 4. VACUITY / MUTATION-SWEEP SAFETY. Any sweep or test that intends to mutate N sites must assert N > 0\n    BEFORE evaluating kill/survival: EXPECTED_MUTATION_TARGETS_FOUND. If indexOf / extraction / selector\n    finds none, the HARNESS FAILS — it does not pass. Judge the three permanent regressions added for this\n    (MUTATION_SWEEP_ZERO_TARGETS_IS_FAILURE, VACUITY_SWEEP_CANNOT_PASS_EMPTY,\n    EXTRACTOR_TARGET_COUNT_MUST_BE_POSITIVE) and find the sweeps they do not cover.\n\n 5. NAMED TARGETS STRUCTURE. Do not satisfy an architecture contract by placing structurally wrong data\n    under a field name that looks right. Audit context.namedTargets and the collection-envelope design for:\n    type safety, declared before use, no TDZ, semantic meaning to the model, not smuggled into\n    context.collections when it is not a CollectionEnvelope, and schema/type tests that pin the ACTUAL\n    shape. Contract: FIELD_NAME_MATCH != SEMANTIC_CONTRACT_MATCH.\n\n 6. DUPLICATED-CONCEPT SWEEP, wider than the trigger. Search for concepts duplicated across regex\n    constants, string arrays, helper functions, agent/runtime tiers, request vs execution layers, and\n    UI/server helpers. Especially: archive, restore, delete, assign, manager, organization scope, entity\n    resolution, request framing, confirmation semantics. If two lists define the same concept: converge\n    them, or document why they intentionally differ.\n\n 7. OPEN TOKEN-BUDGET GAPS — do not lose the rollout-incident work. Still open: the untrimmable compaction\n    summary, and model-specific token limits unmeasured. Inspect whether this candidate REGRESSES the\n    token-budget fix. Do NOT mark the incident resolved unless: the request-budget contract is still green,\n    the fresh-channel 413 witness remains covered, and trimming semantics remain intact.\n\n 8. IF YOU FAIL THIS CANDIDATE, the implementing session will automatically reproduce, root-cause, run a\n    same-defect sweep, fix structurally, add a regression, prove it by mutation, run the battery and\n    dispatch verifier #66. Write your findings so that loop can run without you.\n";
t = t.replace('FOUNDER MANDATE FOR THIS ROUND', INTRO_MANDATE + '\nFOUNDER MANDATE (CARRIED FROM EARLIER ROUNDS)');
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

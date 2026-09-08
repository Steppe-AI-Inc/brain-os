// Prepare verifier #57: prompt template from #56's, roll script to campaign 117 / verifier 57.
import { readFileSync, writeFileSync } from 'node:fs';
let t = readFileSync('qa/verification/scratch/verifier56_prompt_template.txt', 'utf8');
function must(a, b, label) { if (!t.includes(a)) throw new Error('template anchor: ' + label); t = t.replace(a, b); }
must('THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTIETH ROUND, AND THE BAR HAS CHANGED.', 'THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-FIRST ROUND, UNDER THE CONTRACT BAR.', 'round');
must(`Verifier #55 (campaign #115) FAILED 1d72018 on
V55-D1 only; that fix is carried. Since then the candidate received the P1 package for the Work-PC
handover (qa/WORK_PC_HANDOVER_2026-09-07.md, qa/BUG_QUEUE.json BUG-010/014/002/012/013/011 — READ
ONLY, never edit those files). Read git log -8 and qa/verification/CURRENT_CAMPAIGN.json
(verifier56_*), then RE-DERIVE everything below.`,
`Verifier #56 (campaign #116) FAILED e79eb65 on V56-D1..D5 (request-intent false negatives/positives, the
command-name fallback executing on questions/negations/unrelated entities, restore-word-in-name, punctuated
names) and its closure is what you are verifying (ledger #126 = the finding, #127 = the closure): structured
requestIntent from the model schema validated server-side + a request LEXICON (Unicode-aware, object-guarded,
read-shape vetoed, polite questions are requests; the belt NEVER decides intent), and an imperative-only
exact-or-ask command fallback (direction = first lifecycle verb). #56's own suite was promoted to
qa/scenarios-runner/v56_intent_lifecycle_contract.mjs (129/0 claimed); its generators live in-tree at
qa/verification/scratch/p1/v56_corpora (intent_corpus.mjs FN 0.5% claimed = generator inflection artifacts,
FP 0/310; question_probe 0/19). qa/verification/scratch/p1/v56_mutation_proof.mjs claims 8/8 mutants killed.
Work-PC files (qa/BUG_QUEUE.json, COVERAGE_LEDGER, FIXTURE_REGISTRY, HANDOFF_STATE) are READ ONLY. Read
git log -12 and qa/verification/CURRENT_CAMPAIGN.json (verifier57_*), then RE-DERIVE everything below.`, 'intro');
t = t.replace(/verifier56_\* keys/g, 'verifier57_* keys');
must(` B. REQUEST INTENT DERIVATION. Confirm requestedIntent is derived ONLY from the command, the model
    action arrays and confirmation-shaped commands — never from result.summary, tense, question shape
    or pendingAction. Attack it:`,
` B. REQUEST INTENT DERIVATION (the #56 closure). Confirm requestedIntent is derived ONLY from the
    model's requestIntent classification, the model action arrays, confirmation shapes and the request
    lexicon — never from result.summary, tense, the belt, or pendingAction. Re-run #56's generators from
    a corpus YOU extend (new wrappers, new verbs, other languages, read shapes headed by mutation verbs,
    negations, hypotheticals) and size FN-ship and FP-replace yourself. Attack it:`, 'B');
must(` C. SERVER-SIDE LIFECYCLE RESOLUTION (Canonical Work Contract §1-§2, BUG-014). Run
    qa/scenarios-runner/company_lifecycle_matrix.mjs, then extend it:`,
` C. SERVER-SIDE LIFECYCLE RESOLUTION (Canonical Work Contract §1-§2, BUG-014; #56 D3/D3b/D4/D5 closure).
    Run qa/scenarios-runner/company_lifecycle_matrix.mjs (28/0 claimed) and v56_intent_lifecycle_contract,
    then extend them — especially: exact-named companies under questions/negations/hypotheticals; a model
    requestIntent of kind read/other; commands where the model resolved another entity; names with
    punctuation via command, restoreCompanyNames and requestIntent.targetName; fuzzy command hits must ASK
    and never execute; model-name fuzzy hits execute only when unique:`, 'C');
must(`qa/verification/proposed/v56_known_failure_modes_entry_126.md (## 126. …, no preamble),
v56_PROMOTION_NOTE.md, v56_regression_additions.mjs`, `qa/verification/proposed/v57_known_failure_modes_entry_128.md (## 128. …, no preamble),
v57_PROMOTION_NOTE.md, v57_regression_additions.mjs`, 'output');
must('Use v56_* names only (never v48_*).', 'Use v57_* names only (never v48_* or v56_*).', 'names');
if (!/TWENTY-FIRST/.test(t) || !/verifier57_/.test(t) || !/v57_regression_additions/.test(t)) throw new Error('template substitution incomplete');
writeFileSync('qa/verification/scratch/verifier57_prompt_template.txt', t);
console.log('template #57 written', t.length);

let r = readFileSync('qa/verification/scratch/p1/roll_campaign.mjs', 'utf8');
function mustR(a, b, label) { if (!r.includes(a)) throw new Error('roll anchor: ' + label); r = r.replace(a, b); }
mustR('j.campaign = 116; j.verifier = 56;', 'j.campaign = 117; j.verifier = 57;', 'campaign');
mustR("j.status = 'DISPATCH PENDING — verifier #56 on the P1 package';", "j.status = 'DISPATCH PENDING — verifier #57 on the #56 closure';", 'status');
r = r.replace(/verifier56_/g, 'verifier57_');
mustR("j.open_deploy_blockers = ['verifier #56 has not run'];", "j.open_deploy_blockers = ['verifier #57 has not run'];", 'blockers');
mustR("j.what_this_campaign_did = '", "j.verifier56_closure = 'Ledger #127: structured requestIntent (schema + prompt) validated server-side; request lexicon (Unicode lookarounds, passive shapes, object guards, case-sensitive proper nouns, tail shape, read-shape veto, polite-question exemption); the belt never decides intent; command fallback imperative-only, direction by first verb, exact executes / fuzzy asks, full-remainder + comma-head candidates, model requestIntent.targetName as a name source; receipt keeps questions; history verified=null when nothing executed and no intent; stored pendingAction expires in 30 min. #56 suite promoted to the battery; generators in-tree; mutation proof 8/8.';\nj.what_this_campaign_did = '", 'closure note');
writeFileSync('qa/verification/scratch/p1/roll_campaign.mjs', r);
console.log('roll script -> 117/57');

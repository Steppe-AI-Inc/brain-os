// Prepare verifier #58: prompt template from #57's, roll script to campaign 118 / verifier 58.
import { readFileSync, writeFileSync } from 'node:fs';
let t = readFileSync('qa/verification/scratch/verifier57_prompt_template.txt', 'utf8');
function must(a, b, label) { if (!t.includes(a)) throw new Error('template anchor: ' + label); t = t.replace(a, b); }
must('THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-FIRST ROUND, UNDER THE CONTRACT BAR.', 'THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-SECOND ROUND, UNDER THE CONTRACT BAR.', 'round');
must(`Verifier #56 (campaign #116) FAILED e79eb65 on V56-D1..D5`, `Verifier #57 (campaign #117) FAILED 712760d on V57-D1 (the request lexicon overrode the model's explicit
'other' classification), V57-D2 (the company fallback ignored requestIntent.entityType) and V57-D3 (non-imperative
leads executed when the model emitted nothing); its prepared fix F1/F2/F3 was applied AS WRITTEN plus its residuals
D4 (whole-name candidate query), D6a (polite lifecycle question is a request) and D6b (honest receipt reason for a
negated/hypothetical request) — ledger #128 (finding) and #129 (closure); #57's suite is promoted to
qa/scenarios-runner/v57_intent_other_veto_contract.mjs (306/0 claimed); mutation proof
qa/verification/scratch/p1/v57_mutation_proof.mjs claims 5/5. Residuals #57 named and NOT closed: V57-D5 lexicon-tier
false negatives when the model gives no classification, compound commands with the model emitting nothing, opposite-
direction model field, 1-char names, guard granularity, the _shared mirror drift guard — judge whether any is a
deploy blocker under the contract bar. Before that: verifier #56 (campaign #116) FAILED e79eb65 on V56-D1..D5`, 'intro');
t = t.replace(/verifier57_\* keys/g, 'verifier58_* keys').replace(/\(verifier57_\*\)/g, '(verifier58_*)').replace(/git log -12/g, 'git log -16');
must(`qa/verification/proposed/v57_known_failure_modes_entry_128.md (## 128. …, no preamble),
v57_PROMOTION_NOTE.md, v57_regression_additions.mjs`, `qa/verification/proposed/v58_known_failure_modes_entry_130.md (## 130. …, no preamble),
v58_PROMOTION_NOTE.md, v58_regression_additions.mjs`, 'output');
must('Use v57_* names only (never v48_* or v56_*).', 'Use v58_* names only (never v48_*, v56_* or v57_*).', 'names');
if (!/TWENTY-SECOND/.test(t) || !/verifier58_/.test(t) || !/v58_regression_additions/.test(t)) throw new Error('template substitution incomplete');
writeFileSync('qa/verification/scratch/verifier58_prompt_template.txt', t);
console.log('template #58 written', t.length);

let r = readFileSync('qa/verification/scratch/p1/roll_campaign.mjs', 'utf8');
function mustR(a, b, label) { if (!r.includes(a)) throw new Error('roll anchor: ' + label); r = r.replace(a, b); }
mustR('j.campaign = 117; j.verifier = 57;', 'j.campaign = 118; j.verifier = 58;', 'campaign');
mustR("j.status = 'DISPATCH PENDING — verifier #57 on the #56 closure';", "j.status = 'DISPATCH PENDING — verifier #58 on the #57 closure';", 'status');
r = r.replace(/verifier57_/g, 'verifier58_');
mustR("j.open_deploy_blockers = ['verifier #57 has not run'];", "j.open_deploy_blockers = ['verifier #58 has not run'];", 'blockers');
mustR("j.verifier56_closure = '", "j.verifier57_closure = 'Ledger #129: #57 prepared fix F1/F2/F3 applied as written (other vetoes the lexicon; fallback honours requestIntent.entityType; non-imperative leads refused) plus D4 whole-name candidate query, D6a polite lifecycle question, D6b honest receipt reason. #57 suite promoted (306/0); matrix 31/31; mutation proof 5/5; generators FN 0.5% FP 0; battery 55/55.';\nj.verifier56_closure = '", 'closure note');
// the rules string must not grow on every roll
mustR("j.rules = 'FOUNDER RULING 2026-09-07 replaces the v92-differential certification rule:", "j.rules = 'FOUNDER RULING 2026-09-07 replaces the v92-differential certification rule (previous rule text retained in git history):", 'rules head');
mustR(" Previous rule text: ' + String(j.rules);", "';", 'rules tail');
mustR("console.log('campaign rolled to #116 / verifier #56 at'", "console.log('campaign rolled to #118 / verifier #58 at'", 'log');
writeFileSync('qa/verification/scratch/p1/roll_campaign.mjs', r);
console.log('roll script -> 118/58');

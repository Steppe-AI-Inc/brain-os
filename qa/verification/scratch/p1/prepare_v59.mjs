// Prepare verifier #59: prompt template from #58's, roll script to campaign 119 / verifier 59.
import { readFileSync, writeFileSync } from 'node:fs';
let t = readFileSync('qa/verification/scratch/verifier58_prompt_template.txt', 'utf8');
function must(a, b, label) { if (!t.includes(a)) throw new Error('template anchor: ' + label); t = t.replace(a, b); }
must('THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-SECOND ROUND, UNDER THE CONTRACT BAR.', 'THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-THIRD ROUND, UNDER THE CONTRACT BAR.', 'round');
must(`Verifier #57 (campaign #117) FAILED 712760d on V57-D1`, `Verifier #58 (campaign #118) FAILED 5ebc695 on V58-D2 (P1, v92-parity but in the founder's scope: a chat TASK
restore could never execute — archivedTasks was queried and enveloped but never placed in the pack; task/goal
lifecycle ids were window-gated; the receipt for a task request said "company") and V58-D1 (P2: the imperative gate
was a deny-list, so unlisted declaratives executed when the model emitted nothing). Its prepared fix F1/F2/F3 was
applied AS WRITTEN — ledger #130 (finding) and #131 (closure, which also corrects #121 and #129): imperative-position
allow-list; archivedTasks in the pack; task and goal ids re-read server-side across every status with truthful
unresolved lines; entity-aware receipt. #58's suite is promoted to
qa/scenarios-runner/v58_lifecycle_window_and_imperative_contract.mjs (48/0 claimed); mutation proof
qa/verification/scratch/p1/v58_mutation_proof.mjs. Judge whether ANY remaining context-window gate on a lifecycle
or mutation field (deleteTaskIds / pendingDeleteTaskIds stay gated by design: a permanent deletion must target a row
the caller was shown; creation against an archived parent stays gated) violates the contract. Before that: verifier
#57 (campaign #117) FAILED 712760d on V57-D1`, 'intro');
t = t.replace(/verifier58_\* keys/g, 'verifier59_* keys').replace(/\(verifier58_\*\)/g, '(verifier59_*)').replace(/git log -16/g, 'git log -20');
must(`qa/verification/proposed/v58_known_failure_modes_entry_130.md (## 130. …, no preamble),
v58_PROMOTION_NOTE.md, v58_regression_additions.mjs`, `qa/verification/proposed/v59_known_failure_modes_entry_132.md (## 132. …, no preamble),
v59_PROMOTION_NOTE.md, v59_regression_additions.mjs`, 'output');
must('Use v58_* names only (never v48_*, v56_* or v57_*).', 'Use v59_* names only (never v48_*, v56_*, v57_* or v58_*).', 'names');
if (!/TWENTY-THIRD/.test(t) || !/verifier59_/.test(t) || !/v59_regression_additions/.test(t)) throw new Error('template substitution incomplete');
writeFileSync('qa/verification/scratch/verifier59_prompt_template.txt', t);
console.log('template #59 written', t.length);

let r = readFileSync('qa/verification/scratch/p1/roll_campaign.mjs', 'utf8');
function mustR(a, b, label) { if (!r.includes(a)) throw new Error('roll anchor: ' + label); r = r.replace(a, b); }
mustR('j.campaign = 118; j.verifier = 58;', 'j.campaign = 119; j.verifier = 59;', 'campaign');
mustR("j.status = 'DISPATCH PENDING — verifier #58 on the #57 closure';", "j.status = 'DISPATCH PENDING — verifier #59 on the #58 closure';", 'status');
r = r.replace(/verifier58_/g, 'verifier59_');
mustR("j.open_deploy_blockers = ['verifier #58 has not run'];", "j.open_deploy_blockers = ['verifier #59 has not run'];", 'blockers');
mustR("j.verifier57_closure = '", "j.verifier58_closure = 'Ledger #131: #58 prepared fix F1/F2/F3 applied as written — imperative-position allow-list for the command fallback; archivedTasks placed in the pack; task and goal lifecycle ids re-read server-side across every status with truthful unresolved lines; entity-aware receipt. #58 suite promoted (48/0); #57 306/0; #56 129/0; matrix 31/31; collection envelope 57/57.';\nj.verifier57_closure = '", 'closure note');
mustR("console.log('campaign rolled to #118 / verifier #58 at'", "console.log('campaign rolled to #119 / verifier #59 at'", 'log');
writeFileSync('qa/verification/scratch/p1/roll_campaign.mjs', r);
console.log('roll script -> 119/59');

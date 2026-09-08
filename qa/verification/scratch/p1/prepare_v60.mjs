// Prepare verifier #60: prompt template from #59's, roll script to campaign 120 / verifier 60.
import { readFileSync, writeFileSync } from 'node:fs';
let t = readFileSync('qa/verification/scratch/verifier59_prompt_template.txt', 'utf8');
function must(a, b, label) { if (!t.includes(a)) throw new Error('template anchor: ' + label); t = t.replace(a, b); }

const HARDSTOP = '{' + '"error":"Token preflight hard stop","tokenEstimate":12340,"hardMax":12000' + '}';
const INTRO = [
  'Verifier #59 (campaign #119) PASSED 821f530 and it was DEPLOYED (v93, 2026-09-08T01:50Z) — then ROLLED BACK',
  'twenty minutes later. Post-deploy live acceptance on production found a P1 nobody had measured: the enlarged',
  "context pack crossed serve()'s 12,000-token preflight, so a brand-new empty channel returned",
  HARDSTOP + ' and NO answer at all, while short commands still worked.',
  'Production is back on v92 source (function v94, byte-verified). Read',
  'qa/verification/incidents/INCIDENT_2026-09-08_TOKEN_PREFLIGHT_413.md and ledger #133 FIRST. What the live run',
  'DID prove on v93 before the rollback: a fresh-channel restore of a company outside the context window executed',
  'and was receipted truthfully, and a non-existent company produced the truthful not-found line.',
  '',
  'THE LESSON FOR YOU: every verifier so far measured BEHAVIOUR through sliced windows with synthetic packs, and',
  'nobody measured the SIZE of the assembled pack against the gate that refuses the whole request. Measure what',
  'gates the request, not only what shapes the answer. Hunt other unmeasured whole-request gates (generation',
  'max_tokens, per-query limits, payload size, streaming timeouts, RPC argument limits) and state plainly which',
  'you could not measure. This candidate carries: budget-aware pack assembly (optional collections trimmed first,',
  'core last and never below a floor, every trim written back into that collection envelope; context.contextBudget',
  'reports estimate/budget/trims) pinned by qa/scenarios-runner/architecture_context_budget_contract.mjs (12/12',
  'claimed); archivedCompanies 12->6; the prose scope strings removed from the envelope map; and verifier #59 own',
  'hardening patch applied as written (V59-D1..D4; v59_regression_additions 72/12 -> 84/0, promoted to',
  'qa/scenarios-runner/v59_intent_fallback_tier_contract.mjs).',
  '',
  'JUDGE THE BUDGET FIX HARDEST: can a trim ever let the pack claim completeness it does not have? can it drop a',
  'company or person the founder just named in this turn? does it always terminate? is its estimator identical to',
  'the preflight estimator? does the trim order sacrifice anything a contract depends on? Before that:',
  'verifier #58 (campaign #118) FAILED 5ebc695 on V58-D2',
].join('\n');

must('THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-THIRD ROUND, UNDER THE CONTRACT BAR.',
     'THIS IS THE PRODUCTION-DEPLOYMENT GATE, TWENTY-FOURTH ROUND, UNDER THE CONTRACT BAR — AND THE FIRST AFTER A REAL PRODUCTION ROLLBACK.', 'round');
must('Verifier #58 (campaign #118) FAILED 5ebc695 on V58-D2', INTRO, 'intro');
t = t.replace(/verifier59_\* keys/g, 'verifier60_* keys').replace(/\(verifier59_\*\)/g, '(verifier60_*)').replace(/git log -20/g, 'git log -25');
must(`qa/verification/proposed/v59_known_failure_modes_entry_132.md (## 132. …, no preamble),
v59_PROMOTION_NOTE.md, v59_regression_additions.mjs`, `qa/verification/proposed/v60_known_failure_modes_entry_134.md (## 134. …, no preamble),
v60_PROMOTION_NOTE.md, v60_regression_additions.mjs`, 'output');
must('Use v59_* names only (never v48_*, v56_*, v57_* or v58_*).', 'Use v60_* names only (never v48_*, v56_*, v57_*, v58_* or v59_*).', 'names');
if (!/TWENTY-FOURTH/.test(t) || !/verifier60_/.test(t) || !/v60_regression_additions/.test(t)) throw new Error('template substitution incomplete');
writeFileSync('qa/verification/scratch/verifier60_prompt_template.txt', t);
console.log('template #60 written', t.length);

let r = readFileSync('qa/verification/scratch/p1/roll_campaign.mjs', 'utf8');
function mustR(a, b, label) { if (!r.includes(a)) throw new Error('roll anchor: ' + label); r = r.replace(a, b); }
mustR('j.campaign = 119; j.verifier = 59;', 'j.campaign = 120; j.verifier = 60;', 'campaign');
mustR("j.status = 'DISPATCH PENDING — verifier #59 on the #58 closure';", "j.status = 'DISPATCH PENDING — verifier #60 on the context-budget fix + the #59 hardening patch, after the 2026-09-08 deploy and rollback';", 'status');
r = r.replace(/verifier59_/g, 'verifier60_');
mustR("j.open_deploy_blockers = ['verifier #59 has not run'];", "j.open_deploy_blockers = ['verifier #60 has not run', 'the previous authorization was scoped to bytes 715246f3 which breached the token budget in production; new bytes need a fresh founder ALLOW_FUNCTIONS_DEPLOY=1'];", 'blockers');
mustR("j.verifier58_closure = '", "j.incident_2026_09_08 = 'v93 (821f530 / 715246f3) was deployed at 01:50Z and rolled back at 02:10Z: the enlarged context pack crossed the 12,000-token preflight and ordinary questions returned 413 with no answer. Production is v92 source (function v94, ezbr 22486cd751cac403), byte-verified against c9dfab5bd433. Evidence: qa/verification/incidents/INCIDENT_2026-09-08_TOKEN_PREFLIGHT_413.md, ledger #133. Fix on this candidate: budget-aware pack assembly + archivedCompanies 12->6 + scope strings removed, pinned by architecture_context_budget_contract.mjs; verifier #59 hardening applied (v59 suite 84/0, promoted).';\nj.verifier58_closure = '", 'incident note');
mustR("console.log('campaign rolled to #119 / verifier #59 at'", "console.log('campaign rolled to #120 / verifier #60 at'", 'log');
writeFileSync('qa/verification/scratch/p1/roll_campaign.mjs', r);
console.log('roll script -> 120/60');

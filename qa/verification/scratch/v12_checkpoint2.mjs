import { readFileSync, writeFileSync } from 'node:fs';
const p = 'qa/verification/CURRENT_CAMPAIGN.json';
const j = JSON.parse(readFileSync(p, 'utf8'));
j.scenarios['2_mutation_test_run11_fixes'] = {
  status: 'PASS_WITH_DEFECT',
  evidence: 'qa/verification/scratch/v12_mutation_report.json + v12_mutation_report2.json. 11 mutants applied to REAL sources (index.ts, _gate_extract.mjs, current_turn_and_continuity_contract.mjs), the whole committed battery re-run per mutant, every restore sha256-verified byte-identical to 1db38579 (final sha confirmed identical after both runs). KILLED: M1 D86 completionIdx>0 rule, M2 D86 leading-participle+ALL-CAPS rule, M3 D87 shared PROGRESS_VERBS reaching arm 3, M4 D88 comma-clause reduction, M5 D88 completion-in-question belt, M6 ordering anchor moved, M7 shared callback-arrow strip in _gate_extract.mjs, M9 (M6+M8 combined). SURVIVED: M8 (the one the implementing session disclosed), M10, M11.',
  defects_found: ['D90'],
  regressions_added: [],
};
j.mutation_survivor_classification = {
  'M8.anchorExistenceGuard': 'CONFIRMED EQUIVALENT — but the implementing session under-stated the reason. Removing the anchor-existence conjunct from current_turn_and_continuity_contract.mjs is unobservable ONLY because run11_defect_closure_contract.mjs V11.order.failClosed carries its own duplicate existence check. Proof: M9 (buildContext anchor renamed AND the existence conjunct removed) was killed by run11_defect_closure_contract ONLY — current_turn_and_continuity_contract did NOT kill it, i.e. the fail-open is real and that guard IS load-bearing; redundancy in a second suite is the only thing that makes the single mutation equivalent. Classification CONFIRMED, rationale corrected.',
  'M10.pastCompletionBeltInQuestionPath': 'GENUINELY EQUIVALENT — structurally proven, not merely sampled. Every word in PAST_COMPLETION_CLAIM_PATTERN vocabulary is also in COMPLETION_WORD (computed: zero uncovered), and both belts return null, so the run11/D88 belt at index.ts:4762 strictly subsumes the run9 belt at 4758. 0 distinguishing inputs across 10 targeted probes. Not a defect.',
  'M11.titleCaseGate': 'NOT EQUIVALENT — GENUINE SURVIVING MUTANT (defect D90). Neutralising the Title-Case name-shape gate at index.ts:4802 changes real behaviour on 8 of 10 probed inputs (label "deleted acme" renders verbatim instead of falling back to the derived canonical "ACME Holdings"), yet the entire committed battery stays green. The D86 POSITION rule does NOT subsume it: an all-lowercase assertion label ("deleted acme", "removed all people") has completionIdx===0 and no ALL-CAPS token after it, so both position checks pass and only the Title-Case gate refuses it. Product code is CORRECT; the guard is unobserved by any committed case. Ninth recurrence of the vacuous-guard class (D85 lineage).',
};
j.last_checkpoint_at = new Date().toISOString();
j.remaining_scenarios = ['3', '4', '5'];
writeFileSync(p, JSON.stringify(j, null, 1));
console.log('checkpointed');

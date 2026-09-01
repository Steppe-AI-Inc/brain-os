import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const ROOT = 'C:/Users/Dell/dev/brain-os';
const SRC = ROOT + '/supabase/functions/sem-ai-command/index.ts';
const ORIG = readFileSync(SRC, 'utf8');
const ORIG_HASH = createHash('sha256').update(readFileSync(SRC)).digest('hex');
const SUITES = [
  ['SCV', 'node qa/scenarios-runner/structured_claim_verification.mjs'],
  ['LAU', 'node qa/scenarios-runner/structured_claim_laundering_contract.mjs'],
  ['DRF', 'node qa/scenarios-runner/sem_ai_command_source_invariants_drift_guard.mjs'],
  ['D3', 'node qa/scenarios-runner/d3_past_completion_gate_not_shortcircuited_by_pending_action.mjs'],
  ['MIX', 'node qa/scenarios-runner/mixed_claim_grounding.mjs'],
  ['PCG', 'node qa/scenarios-runner/past_completion_gate_behavior.mjs'],
  ['SEG', 'node qa/scenarios-runner/claim_segmentation_and_present_tense_fp.mjs'],
  ['PRG', 'node qa/scenarios-runner/per_resource_grounding_contract.mjs'],
  ['IS5', 'node qa/scenarios-runner/issue5_confirmation_action_type_binding.mjs'],
  ['NEW', 'node qa/scenarios-runner/lifecycle_evidence_and_output_persistence_contract.mjs'],
];
export { ROOT, SRC, ORIG, ORIG_HASH, SUITES };

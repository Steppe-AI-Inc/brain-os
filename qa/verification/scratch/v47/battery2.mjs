// Second pass over the suites my first parser could not read: are they SUPERSEDED stubs, or do
// they assert in a different format? A suite that neither asserts nor declares itself superseded
// is the vacuity class this campaign has logged five times.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const DIR = path.join(ROOT, 'qa/scenarios-runner');
const TARGETS = ['claim_segmentation_and_present_tense_fp.mjs',
  'd3_past_completion_gate_not_shortcircuited_by_pending_action.mjs',
  'issue5_confirmation_action_type_binding.mjs', 'mixed_claim_grounding.mjs',
  'past_completion_gate_behavior.mjs', 'per_resource_grounding_contract.mjs',
  'sem_ai_command_company_restore_truth.mjs', 'sem_ai_command_confirmation_truth.mjs',
  'sem_ai_command_execution_plan_truth.mjs', 'sem_ai_command_factory_verification_selection.mjs',
  'sem_ai_command_named_person_lookup_truth.mjs', 'standing_reds_classification_contract.mjs'];
for (const f of TARGETS) {
  const r = spawnSync(process.execPath, [path.join(DIR, f)], { encoding: 'utf8', cwd: ROOT, timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.split('\n').filter(Boolean);
  const superseded = /SUPERSEDED/i.test(out);
  const okish = (out.match(/^\s*(ok|OK|PASS|pass)\b/gm) || []).length;
  const failish = (out.match(/^\s*(FAIL|fail|NOT OK|ERROR)\b/gm) || []).length;
  console.log((superseded ? 'STUB    ' : okish ? 'ASSERTS ' : 'VACUOUS!').padEnd(9), f.padEnd(62),
    'lines=' + lines.length, 'ok=' + okish, 'fail=' + failish, 'exit=' + r.status);
  if (!superseded && !okish) console.log('    LAST:', lines.slice(-3).join(' | ').slice(0, 260));
}

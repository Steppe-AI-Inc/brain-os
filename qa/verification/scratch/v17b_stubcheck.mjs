import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const names = ['issue5_confirmation_action_type_binding', 'sem_ai_command_company_restore_truth',
  'sem_ai_command_confirmation_truth', 'sem_ai_command_execution_plan_truth',
  'sem_ai_command_factory_verification_selection', 'sem_ai_command_named_person_lookup_truth',
  'claim_segmentation_and_present_tense_fp', 'mixed_claim_grounding', 'past_completion_gate_behavior',
  'per_resource_grounding_contract', 'd3_past_completion_gate_not_shortcircuited_by_pending_action',
  '_gate_extract'];
for (const n of names) {
  const p = resolve('qa/scenarios-runner', n + '.mjs');
  const t = readFileSync(p, 'utf8');
  const code = t.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
  let out = '';
  try { out = execFileSync(process.execPath, [p], { encoding: 'utf8', timeout: 120000 }); }
  catch (e) { out = 'EXIT' + e.status + ':' + (e.stdout || '') + (e.stderr || ''); }
  console.log('=== ' + n + '  codeLines=' + code.length + '  assertCalls=' +
    ((t.match(/\bassert\w*\(|\bcheck\(|\bexpect\(|\bC\(|\bt\(/g) || []).length));
  console.log('    OUT: ' + JSON.stringify(out.trim().split('\n').slice(-3).join(' | ')).slice(0, 320));
}

import { readFileSync } from 'node:fs';
const P = 'supabase/functions/sem-ai-command/index.ts';
const buf = readFileSync(P);
// locate every CR not followed by LF
const text = buf.toString('utf8');
let lone = [];
for (let i = 0; i < buf.length; i++) if (buf[i] === 13 && buf[i + 1] !== 10) lone.push(i);
console.log('lone CR byte offsets:', lone);
for (const off of lone) {
  const before = buf.slice(0, off).toString('utf8');
  const line = before.split('\n').length;
  const ctx = buf.slice(Math.max(0, off - 120), off + 80).toString('utf8');
  console.log(`--- lone CR at line ${line}; context (CR shown as ⏎):\n` + JSON.stringify(ctx.replace(/\r\n/g, '\n').replace(/\r/g, '⏎')));
  // Is it inside a template literal? count unescaped backticks before offset
  let bt = 0; for (let i = 0; i < off; i++) if (buf[i] === 96 && buf[i - 1] !== 92) bt++;
  console.log('unescaped backticks before offset:', bt, '=> inside template literal:', bt % 2 === 1);
}
console.log('\n=== tails of OK=0 suite logs');
for (const f of ['claim_segmentation_and_present_tense_fp', 'd3_past_completion_gate_not_shortcircuited_by_pending_action', 'mixed_claim_grounding', 'past_completion_gate_behavior', 'per_resource_grounding_contract', 'sem_ai_command_company_restore_truth', 'sem_ai_command_confirmation_truth', 'sem_ai_command_execution_plan_truth', 'sem_ai_command_factory_verification_selection', 'sem_ai_command_named_person_lookup_truth', 'issue5_confirmation_action_type_binding']) {
  const t = readFileSync('qa/verification/scratch/v11_battery_' + f + '.log', 'utf8').trim().split('\n');
  console.log(`--- ${f} (${t.length} lines)`); for (const l of t.slice(-4)) console.log('   ' + l.slice(0, 160));
}

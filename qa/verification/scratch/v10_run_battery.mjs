// verifier #10 battery runner — spawns every suite in qa/scenarios-runner that the
// campaign names, captures exit code + last lines, writes one JSON summary.
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SUITES = [
  'structured_claim_verification',
  'structured_claim_laundering_contract',
  'lifecycle_evidence_and_output_persistence_contract',
  'run8_defect_closure_contract',
  'issue5_confirmation_action_type_binding',
  'sem_ai_command_factory_verification_selection',
  'sem_ai_command_company_restore_truth',
  'sem_ai_command_named_person_lookup_truth',
  'sem_ai_command_execution_plan_truth',
  'sem_ai_command_confirmation_truth',
  'sem_ai_command_past_completion_claim_regex',
  'sem_ai_command_source_invariants_drift_guard',
];
const indexSha = createHash('sha256').update(readFileSync('supabase/functions/sem-ai-command/index.ts')).digest('hex');
const results = [];
for (const s of SUITES) {
  const r = spawnSync(process.execPath, ['qa/scenarios-runner/' + s + '.mjs'], { encoding: 'utf8', env: { ...process.env, DEPLOY_GATE: '1' } });
  const out = (r.stdout || '') + (r.stderr || '');
  writeFileSync('qa/verification/scratch/v10_battery_' + s + '.log', out);
  const lines = out.trim().split('\n');
  const okCount = lines.filter((l) => /^OK /.test(l)).length;
  const failCount = lines.filter((l) => /^FAIL /.test(l)).length;
  const summaryLine = lines.filter((l) => /passed|DEPLOY GATE|GATE|\d+\/\d+/.test(l)).slice(-3);
  results.push({ suite: s, exit: r.status, ok: okCount, fail: failCount, tail: summaryLine });
  console.log(`${String(r.status).padStart(2)}  ${s}  OK=${okCount} FAIL=${failCount}`);
  for (const l of summaryLine) console.log('      ' + l);
}
const summary = { index_ts_sha256: indexSha, ran_at: new Date().toISOString(), node: process.version, results };
writeFileSync('qa/verification/scratch/v10_battery_summary.json', JSON.stringify(summary, null, 1));
console.log('\nindex.ts sha256 ' + indexSha);
console.log('ALL EXIT ZERO: ' + results.every((r) => r.exit === 0));

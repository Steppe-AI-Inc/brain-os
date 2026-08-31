// Phase 6 central acceptance test (founder's exact required sequence): attachment must
// change what the real execution runtime actually contains, proven from the RAW dispatched
// session transcript — never from agent_plugin_attachments/agents.provenance rows alone.
//
//   1. launch a controlled Agent Run BEFORE attaching -> confirm skill genuinely absent
//   2. attach
//   3. launch a NEW Agent Run -> confirm skill content present, agent_runs records it
//   4. detach
//   5. launch a THIRD Agent Run -> confirm skill genuinely absent again
//
// Usage: node phase6-attach-runtime-proof.mjs <phase: before|after-attach|after-detach>
//
// Each phase is a separate invocation (not one long-running script) so each real
// dispatch/poll/log-fetch cycle is independently inspectable and this can't silently
// race ahead before a background run actually finishes.

import * as provider from './provider.mjs';

const AGENT_ID = '7703cae0-2a4f-4f11-b79f-f1bff1904820'; // brain-os-implementation-engineer, 0 pre-existing attachments
const TASK = 'Phase 6 attach/runtime proof. List, by exact name, every "Attached skills for this run" entry present in your own task instructions (if any section like that exists at all). If none exists, say exactly: NO ATTACHED SKILLS. Take no other action - do not read or write any files.';

// Real bug found live during this session's own first run of this script:
// status.status is transiently null right after dispatch (before the CLI settles), and the
// old condition (`status !== 'busy'`) treated that transient null as "done", returning
// before the task had actually run at all - the captured "final" log was just the launch
// screen. Wait for an explicit terminal state (status:'idle' AND state:'done'), not merely
// "not busy".
async function pollUntilDone(providerRunId, timeoutMs = 180000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await provider.getRunStatus(providerRunId);
    if (status && status.status === 'idle' && status.state === 'done') return status;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`pollUntilDone: timed out waiting for ${providerRunId} to reach status=idle/state=done after ${timeoutMs}ms`);
}

const phase = process.argv[2];
if (!['before', 'after-attach', 'after-detach'].includes(phase)) {
  console.error('Usage: node phase6-attach-runtime-proof.mjs <before|after-attach|after-detach>');
  process.exit(1);
}

console.log(`=== Phase 6 runtime proof: ${phase} ===`);
const { providerRunId, definitionHash } = await provider.startRunByAgentId(AGENT_ID, TASK);
console.log('PROVIDER_RUN_ID:', providerRunId);
console.log('DEFINITION_HASH (re-verified at dispatch):', definitionHash);

const finalStatus = await pollUntilDone(providerRunId);
console.log('FINAL_STATUS:', JSON.stringify(finalStatus));

const logs = await provider.getLogs(providerRunId);
console.log('--- RAW LOG (ANSI-stripped) ---');
console.log(logs);
console.log('--- END RAW LOG ---');

const mentionsSkill = logs.includes('systematic-debugging');
console.log(`RESULT: logs ${mentionsSkill ? 'DO' : 'do NOT'} mention "systematic-debugging".`);

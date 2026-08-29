// Real, one-shot smoke test of provider.mjs - Phase 4 DoD: a manually-triggered
// dispatch through the actual provider module (not the raw CLI by hand) produces a
// real provider_run_id traceable via claude logs, for a trivial test task.
import * as provider from './provider.mjs';

const cwd = 'C:\\Users\\Dell\\dev\\brain-os';

console.log('healthCheck:', await provider.healthCheck());

const { providerRunId } = await provider.startRun(
  'brain-os-implementation-engineer',
  'Provider smoke test only. Report back the exact text: PROVIDER TEST OK. Take no other action.',
  cwd
);
console.log('startRun produced providerRunId:', providerRunId);

// Poll on ACTUAL LOG CONTENT, not just status/state - the first run of this test proved
// `status: "idle"` can be reported between internal tool-call rounds, while the session
// is still genuinely working (that run's logs showed a mid-generation "Thundering..."
// spinner, never the expected final text, when the loop exited after only 2 polls).
// Wait for the real expected output string to actually appear in the logs before
// declaring completion - that is the only trustworthy signal.
let status;
let logs = '';
let sawExpectedOutput = false;
for (let i = 0; i < 40; i++) {
  status = await provider.getRunStatus(providerRunId);
  logs = await provider.getLogs(providerRunId);
  sawExpectedOutput = logs.includes('PROVIDER TEST OK');
  console.log(`poll ${i}:`, JSON.stringify(status), 'sawExpectedOutput:', sawExpectedOutput);
  if (sawExpectedOutput) break;
  await new Promise((r) => setTimeout(r, 5000));
}

if (!sawExpectedOutput) {
  console.log('WARNING: never observed the expected "PROVIDER TEST OK" text in logs within the poll budget.');
}

console.log('--- real logs (last 2000 chars) ---');
console.log(logs.slice(-2000));

const artifacts = await provider.getArtifacts(providerRunId, cwd);
console.log('--- artifacts (best-effort) ---');
console.log(JSON.stringify(artifacts, null, 2));

await provider.cancelRun(providerRunId);
console.log('cancelRun done.');

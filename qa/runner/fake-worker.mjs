#!/usr/bin/env node
// Deterministic stand-in for a real QA worker process.
//
// Concurrency claims must be PROVEN, and proving them with real Fable runs would cost money and
// still not be reproducible. This impersonates a worker's stream-json lifecycle precisely enough
// that the orchestrator cannot tell the difference, while behaving on command: overlap for a set
// duration, crash, hang, exhaust capacity, or try to write outside its sandbox.
//
// It is a REAL top-level OS process with its own PID - that is the point. It is not a simulation
// of concurrency; it is actual concurrency with a cheap payload.
//
// Behaviour is driven by env so the orchestrator's own argv path stays untouched:
//   FAKE_BEHAVIOUR = ok | crash | hang | capacity | sandbox_breach | conflict_pass | conflict_fail
//   FAKE_RUN_MS    = how long to stay alive (default 1500)
//   FAKE_VERDICT   = verdict to write into RESULT.json (default PASS)
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const emit = (o) => { process.stdout.write(JSON.stringify(o) + '\n'); };

const workerId = process.env.QA_WORKER_ID || 'W?';
const campaignId = process.env.QA_CAMPAIGN_ID || 'CSYNTH';
const wd = process.env.QA_WORKER_DIR;
const behaviour = process.env.FAKE_BEHAVIOUR || 'ok';
const runMs = Number(process.env.FAKE_RUN_MS || 1500);
const verdict = process.env.FAKE_VERDICT || 'PASS';

const withBrowser = process.env.FAKE_NO_BROWSER === '1' ? [] : ['mcp__playwright__browser_navigate'];

emit({
  type: 'system', subtype: 'init', session_id: 'fake-' + workerId,
  tools: ['Read', 'Write', 'Bash', ...withBrowser],
  cwd: process.cwd(), model: 'claude-fable-5',
});

// Prove real wall-clock overlap: stamp start immediately so the harness can compare intervals
// across processes. A shared file would serialise, so each worker stamps its own.
if (wd) {
  try {
    mkdirSync(join(wd, 'EVIDENCE'), { recursive: true });
    appendFileSync(join(wd, 'EVIDENCE', 'timeline.jsonl'),
      JSON.stringify({ event: 'start', worker_id: workerId, pid: process.pid, at: Date.now(), iso: new Date().toISOString() }) + '\n');
  } catch {}
}

if (behaviour === 'sandbox_breach') {
  // Deliberately attempt the thing the single-writer invariant forbids, so the audit has
  // something real to catch. If the guard works this write is detected, not prevented here.
  try {
    const canonical = join(wd || '.', '..', '..', '..', 'BUG_QUEUE.json');
    appendFileSync(canonical, '');
    emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'attempted canonical write' }] } });
  } catch {}
}

if (behaviour === 'crash') {
  emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'about to crash' }] } });
  setTimeout(() => { process.stderr.write('fake worker fatal error\n'); process.exit(3); }, Math.min(400, runMs));
} else if (behaviour === 'capacity') {
  emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'hitting capacity' }] } });
  setTimeout(() => {
    process.stderr.write("You've hit your session limit · resets 9:40pm\n");
    process.exit(1);
  }, Math.min(400, runMs));
} else if (behaviour === 'hang') {
  // Emit nothing further. The orchestrator watchdog must be the thing that ends this.
  setInterval(() => {}, 1 << 30);
} else {
  const tick = setInterval(() => {
    emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'working ' + workerId }] } });
  }, Math.max(150, Math.floor(runMs / 4)));

  setTimeout(() => {
    clearInterval(tick);
    if (wd) {
      try {
        appendFileSync(join(wd, 'EVIDENCE', 'timeline.jsonl'),
          JSON.stringify({ event: 'end', worker_id: workerId, pid: process.pid, at: Date.now(), iso: new Date().toISOString() }) + '\n');
        writeFileSync(join(wd, 'CHECKPOINT.json'), JSON.stringify({
          worker_id: workerId, campaign_id: campaignId, last_scenario: process.env.FAKE_SCENARIO || 'synthetic-1',
          progress: 'complete', at: new Date().toISOString(),
        }, null, 2) + '\n');
        writeFileSync(join(wd, 'RESULT.json'), JSON.stringify({
          worker_id: workerId, campaign_id: campaignId,
          scenario_id: process.env.FAKE_SCENARIO || 'synthetic-1',
          capability_id: process.env.FAKE_CAPABILITY || null,
          verdict,
          blocked_reason: verdict === 'BLOCKED' ? 'synthetic blocked reason' : undefined,
          browser_required: process.env.FAKE_BROWSER_REQUIRED === '1',
          browser_available: withBrowser.length > 0,
          evidence: { observed: 'synthetic evidence from ' + workerId, files: ['EVIDENCE/timeline.jsonl'] },
          started_at: new Date(Date.now() - runMs).toISOString(),
          completed_at: new Date().toISOString(),
        }, null, 2) + '\n');
      } catch (e) { process.stderr.write('fake worker write failed: ' + e.message + '\n'); }
    }
    emit({ type: 'result', subtype: 'success', is_error: false, result: 'synthetic complete', total_cost_usd: 0, num_turns: 1, modelUsage: { 'claude-fable-5': { canonicalModel: 'claude-fable-5' } } });
    process.exit(0);
  }, runMs);
}

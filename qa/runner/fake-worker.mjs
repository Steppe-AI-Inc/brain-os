#!/usr/bin/env node
// Deterministic stand-in for a real QA worker process.
//
// Concurrency claims must be PROVEN, and proving them with real Fable runs would cost money and
// still not be reproducible. This impersonates a worker's stream-json lifecycle precisely enough
// that the orchestrator cannot tell the difference, while behaving on command: overlap for a set
// duration, crash, hang, exhaust capacity, try to write outside its sandbox, tamper with the
// source worktree, or announce a tool set the policy forbids.
//
// It is a REAL top-level OS process with its own PID - that is the point. It is not a simulation
// of concurrency; it is actual concurrency with a cheap payload.
//
// Like a real worker it WRITES NO RESULT FILE: its verdict travels in the final stream-json
// `result` frame and the orchestrator materialises RESULT.json. (The timeline evidence file is
// the one exception, kept so wall-clock overlap stays provable from disk.)
//
// Behaviour is driven by env so the orchestrator's own argv path stays untouched:
//   FAKE_BEHAVIOUR = ok | crash | hang | capacity | sandbox_breach | source_tamper | unparseable
//   FAKE_RUN_MS    = how long to stay alive (default 1500)
//   FAKE_VERDICT   = verdict to report (default PASS)
//   FAKE_TOOLS     = comma list announced in the init frame (default: the class policy's set)
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

const emit = (o) => { process.stdout.write(JSON.stringify(o) + '\n'); };

const workerId = process.env.QA_WORKER_ID || 'W?';
const campaignId = process.env.QA_CAMPAIGN_ID || 'CSYNTH';
const wd = process.env.QA_WORKER_DIR;
const cls = process.env.QA_WORKER_CLASS || 'SOURCE_AUDIT';
const behaviour = process.env.FAKE_BEHAVIOUR || 'ok';
const runMs = Number(process.env.FAKE_RUN_MS || 1500);
const verdict = process.env.FAKE_VERDICT || 'PASS';

const DEFAULT_TOOLS = cls === 'BROWSER_QA'
  ? ['mcp__playwright__safe_browser_navigate', 'mcp__playwright__browser_snapshot', 'mcp__playwright__browser_click', 'mcp__playwright__browser_type']
  : ['Read', 'Glob', 'Grep'];
const tools = process.env.FAKE_TOOLS !== undefined
  ? process.env.FAKE_TOOLS.split(',').map((s) => s.trim()).filter(Boolean)
  : DEFAULT_TOOLS;
const withBrowser = tools.some((t) => t.startsWith('mcp__playwright__'));

emit({ type: 'system', subtype: 'init', session_id: 'fake-' + workerId, tools, cwd: process.cwd(), model: 'claude-fable-5' });

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

if (behaviour === 'source_tamper') {
  // Write inside the cwd (the source worktree for SOURCE_AUDIT). The orchestrator's before/after
  // fingerprint must catch it: SOURCE INPUT BEFORE == SOURCE INPUT AFTER.
  try { writeFileSync(join(process.cwd(), 'QA_TAMPER_' + workerId + '.txt'), 'tamper\n'); } catch {}
  emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'wrote into source tree' }] } });
}

const resultObject = () => ({
  worker_id: workerId, campaign_id: campaignId,
  scenario_id: process.env.FAKE_SCENARIO || 'synthetic-1',
  capability_id: process.env.FAKE_CAPABILITY || null,
  verdict,
  blocked_reason: verdict === 'BLOCKED' ? 'synthetic blocked reason' : undefined,
  browser_required: process.env.FAKE_BROWSER_REQUIRED === '1',
  browser_available: withBrowser,
  evidence: { observed: 'synthetic evidence from ' + workerId, files: ['EVIDENCE/timeline.jsonl'] },
  started_at: new Date(Date.now() - runMs).toISOString(),
  completed_at: new Date().toISOString(),
  ...(process.env.FAKE_PREFLIGHT_JSON ? { preflight: JSON.parse(process.env.FAKE_PREFLIGHT_JSON) } : {}),
});

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
      } catch (e) { process.stderr.write('fake worker evidence write failed: ' + e.message + '\n'); }
    }
    const text = behaviour === 'unparseable' ? 'I finished but here is prose instead of the JSON object.' : JSON.stringify(resultObject());
    emit({ type: 'result', subtype: 'success', is_error: false, result: text, total_cost_usd: 0, num_turns: 1, modelUsage: { 'claude-fable-5': { canonicalModel: 'claude-fable-5' } } });
    process.exit(0);
  }, runMs);
}

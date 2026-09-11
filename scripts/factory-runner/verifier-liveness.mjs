#!/usr/bin/env node
// IS THIS VERIFIER SLOW, STALLED, DEAD, OR BLOCKED ON A PROVIDER?
//
// WHY THIS EXISTS. Answering that question for verifier #88 took a hand-walked process tree. Every cheap
// signal was misleading on its own:
//
//   the output log was 0 bytes           — expected: `claude -p` writes its report at the END
//   the parent process was near-idle     — expected: it was blocked on a child
//   no files had changed in 92 seconds   — expected: mutants were EXECUTING, not being written
//   the PID existed                      — proves nothing at all
//
// The truth was three levels down: a `node -e "while(Date.now()-t<295000){}"` busy-wait, because `sleep`
// is blocked in that harness. Slow, not stalled. A founder should not have to ask, and a human should not
// have to walk a tree to find out — that is the observability gap this closes.
//
// IT DERIVES WHAT IS DERIVABLE AND SAYS UNKNOWN FOR THE REST. Several fields a verifier could emit are not
// emitted by today's verifiers (which scenario it is on, when its provider request started). Those are
// reported as UNKNOWN with the field named, so the gap is visible and the next verifier knows exactly what
// to write. Inventing a plausible value would be the same defect as a log line standing in for a heartbeat.
//
// NO PROCESS IS KILLED, SIGNALLED OR MODIFIED. This reads.
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const CLASSES = [
  'RUNNING_PROGRESSING', 'RUNNING_BUT_LONG_STEP', 'STALLED_RECOVERABLE', 'PROCESS_DEAD_RECOVERABLE',
  'BLOCKED_EXTERNAL', 'CORRUPT_STATE', 'UNKNOWN_INSUFFICIENT_EVIDENCE',
];

// A worktree write is the only progress signal that does not depend on the verifier choosing to emit one.
// Long enough to cover one mutation-proof mutant and one busy-wait; short enough to catch a real stall.
export const DEFAULT_QUIET_STALL_MS = 45 * 60 * 1000;

const newestMtime = (dir, skip = /[\\/]\.git[\\/]/) => {
  let newest = 0;
  const walk = (d, depth) => {
    if (depth > 8) return;
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(d, e.name);
      if (skip.test(p + '/')) continue;
      try {
        if (e.isDirectory()) walk(p, depth + 1);
        else { const m = statSync(p).mtimeMs; if (m > newest) newest = m; }
      } catch { /* a file can vanish mid-walk; that is not a finding */ }
    }
  };
  walk(dir, 0);
  return newest;
};

// The process tree, on Windows via CIM. Returns [] where it cannot be read, and the caller degrades to
// UNKNOWN rather than guessing — a classifier that assumes "no tree means dead" kills healthy work.
export function processTree(rootPid) {
  try {
    const ps = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine '
      + '| ConvertTo-Json -Depth 3 -Compress';
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 30000 });
    const all = JSON.parse(out);
    const byParent = new Map();
    for (const p of all) {
      if (!byParent.has(p.ParentProcessId)) byParent.set(p.ParentProcessId, []);
      byParent.get(p.ParentProcessId).push(p);
    }
    const tree = [];
    const walk = (pid, depth) => {
      if (depth > 8) return;
      for (const c of byParent.get(pid) || []) { tree.push({ ...c, depth }); walk(c.ProcessId, depth + 1); }
    };
    const self = all.find((p) => p.ProcessId === rootPid);
    if (self) tree.push({ ...self, depth: 0 });
    walk(rootPid, 1);
    return tree;
  } catch { return null; }
}

// THE SHAPES WORTH NAMING. Each is a wait the classifier can identify from a command line, so "what is it
// waiting on" is answered rather than shrugged at.
const WAIT_SHAPES = [
  { re: /while\s*\(\s*Date\.now\(\)\s*-\s*\w+\s*<\s*(\d+)\s*\)/,
    name: 'a BUSY-WAIT loop', detail: (m) => Math.round(Number(m[1]) / 1000) + 's of deliberate spinning'
      + ' — `sleep` is blocked in this harness, so a wait costs a whole CPU core' },
  { re: /\bsleep\s+(\d+)/, name: 'a sleep', detail: (m) => m[1] + 's' },
  { re: /@playwright\/mcp|playwright-mcp/, name: 'the Playwright MCP server',
    detail: () => 'an MCP launch; idle CPU here usually means it never connected and is a leftover' },
  { re: /\bnpx\b/, name: 'an npx download', detail: () => 'a package fetch, which can be network-blocked' },
  { re: /\bgit\b/, name: 'a git operation', detail: () => 'a clone, fetch or checkout' },
  { re: /release_manifest|mutation_proof|gate_evidence/, name: 'a gate',
    detail: () => 'the battery or a proof, which legitimately runs for tens of minutes' },
];

// AN MSYS PID IS NOT A WINDOWS PID. `watchdogNN.pid` is written by git-bash, which numbers processes in
// its own space; Win32_Process has never heard of it. Walking the Windows tree from it finds nothing, and
// "no tree" would classify a HEALTHY verifier as PROCESS_DEAD_RECOVERABLE — the expensive direction.
//
// So the real process is DERIVED: the `claude.exe` whose start time is closest to the dispatch the
// watchdog recorded. Two durable facts, no hand-written pid.
export function findVerifierPid(dispatchIso, { windowSeconds = 120 } = {}) {
  if (!dispatchIso) return null;
  const target = Date.parse(dispatchIso);
  if (!Number.isFinite(target)) return null;
  try {
    const ps = 'Get-Process claude -ErrorAction SilentlyContinue | Select-Object Id,StartTime | ConvertTo-Json -Compress';
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps],
      { encoding: "utf8", timeout: 30000 });
    const raw = JSON.parse(out);
    const list = Array.isArray(raw) ? raw : [raw];
    let best = null;
    for (const p of list) {
      if (!p || !p.StartTime) continue;
      // PowerShell serialises dates as /Date(ms)/ or ISO depending on version; accept both.
      const ms = /Date\((\d+)\)/.test(String(p.StartTime))
        ? Number(/Date\((\d+)\)/.exec(String(p.StartTime))[1])
        : Date.parse(String(p.StartTime));
      if (!Number.isFinite(ms)) continue;
      const delta = Math.abs(ms - target);
      if (delta <= windowSeconds * 1000 && (!best || delta < best.delta)) best = { pid: p.Id, delta };
    }
    return best ? best.pid : null;
  } catch { return null; }
}

export function liveness({
  worktree, statePath, logPath, watchdogPidPath, freezePath,
  now = Date.now(), quietStallMs = DEFAULT_QUIET_STALL_MS,
} = {}) {
  const f = {
    // The fields a verifier SHOULD expose. Anything not derivable is named UNKNOWN rather than invented.
    last_progress_at: null,
    current_scenario: 'UNKNOWN — no verifier emits this yet',
    completed_scenario_count: 'UNKNOWN — no verifier emits this yet',
    total_scenario_count: 'UNKNOWN — no verifier emits this yet',
    worker_pid: null,
    worker_attempt: null,
    heartbeat_at: null,
    checkpoint_at: null,
    provider_request_started_at: 'UNKNOWN — no verifier emits this yet',
    last_provider_event_at: 'UNKNOWN — no verifier emits this yet',
    artifact_updated_at: null,
  };
  const notes = [];

  if (!worktree || !existsSync(worktree)) {
    return { classification: 'UNKNOWN_INSUFFICIENT_EVIDENCE', fields: f,
      notes: ['the worktree does not exist: ' + worktree] };
  }

  // 3. ARTIFACT / SCENARIO PROGRESS
  const newest = newestMtime(worktree);
  f.last_progress_at = newest ? new Date(newest).toISOString() : null;
  const quietMs = newest ? now - newest : Infinity;

  if (logPath && existsSync(logPath)) {
    const st = statSync(logPath);
    f.artifact_updated_at = new Date(st.mtimeMs).toISOString();
    // A FINISHED REPORT OUTRANKS EVERY OTHER SIGNAL, including the watchdog's own classifiers.
    if (st.size > 2000) {
      return { classification: 'RUNNING_PROGRESSING', fields: f,
        notes: ['the report has LANDED (' + st.size + ' bytes) — read the artifact, do not re-dispatch'] };
    }
    notes.push('output log is ' + st.size + ' bytes, which is EXPECTED mid-run: `claude -p` writes its '
      + 'report at the end, so log size is not a heartbeat and never was');
  }

  // 2. WATCHDOG / LEASE
  if (statePath && existsSync(statePath)) {
    const lines = readFileSync(statePath, 'utf8').trim().split(String.fromCharCode(10));
    const last = lines[lines.length - 1] || '';
    f.heartbeat_at = (last.match(/^\[([^\]]+)\]/) || [])[1] || null;
    f.worker_attempt = Number((last.match(/attempt (\d+)/) || [])[1]) || null;
    if (/ABORT|exhausted|EXECUTION_MODE/.test(last)) {
      return { classification: 'BLOCKED_EXTERNAL', fields: f,
        notes: ['the watchdog recorded a terminal state: ' + last] };
    }
  }

  // 1. PROCESS — and a PID existing proves nothing, so the tree is what is read.
  // The dispatch moment comes from the watchdog state file, which is durable and machine-written.
  const dispatchIso = (() => {
    if (!statePath || !existsSync(statePath)) return null;
    const first = readFileSync(statePath, "utf8").trim().split(String.fromCharCode(10))[0] || "";
    const m = first.match(/^\[([^\]]+)\]/);
    return m ? m[1].replace(" ", "T") : null;
  })();
  const derivedPid = findVerifierPid(dispatchIso);
  let msysPid = null;
  if (watchdogPidPath && existsSync(watchdogPidPath)) {
    msysPid = Number(readFileSync(watchdogPidPath, "utf8").trim()) || null;
  }
  // The DERIVED one is authoritative for a tree walk; the recorded one is kept for the audit trail.
  const pid = derivedPid || msysPid;
  f.worker_pid = pid;
  if (derivedPid && msysPid && derivedPid !== msysPid) {
    notes.push("recorded pid " + msysPid + " is an MSYS pid and cannot index the Windows process table; "
      + "using the derived Windows pid " + derivedPid + " (claude.exe started nearest the dispatch)");
  }

  // 4. SUBPROCESS / EXTERNAL WAIT — the question every other signal failed to answer for #88.
  let waiting = null;
  const tree = pid ? processTree(pid) : null;
  if (tree === null) notes.push('the process tree could not be read; classification falls back to file progress');
  else if (tree.length === 0) {
    return { classification: 'PROCESS_DEAD_RECOVERABLE', fields: f,
      notes: ['no process tree under pid ' + pid + ' — treat as INFRASTRUCTURE failure, never as a verifier FAIL'] };
  } else {
    for (const p of tree) {
      const cmd = String(p.CommandLine || '');
      for (const shape of WAIT_SHAPES) {
        const m = shape.re.exec(cmd);
        if (m) { waiting = { on: shape.name, detail: shape.detail(m), pid: p.ProcessId, depth: p.depth }; break; }
      }
      if (waiting && waiting.depth > 0) break;
    }
  }

  if (waiting) {
    notes.push('waiting on ' + waiting.on + ' (pid ' + waiting.pid + ', depth ' + waiting.depth + '): '
      + waiting.detail);
    return { classification: 'RUNNING_BUT_LONG_STEP', fields: f, notes, waiting };
  }

  if (quietMs > quietStallMs) {
    return { classification: 'STALLED_RECOVERABLE', fields: f,
      notes: [...notes, 'no worktree write for ' + Math.round(quietMs / 60000) + ' minutes and no identifiable wait'] };
  }

  return { classification: 'RUNNING_PROGRESSING', fields: f,
    notes: [...notes, 'last worktree write ' + Math.round(quietMs / 1000) + 's ago'] };
}

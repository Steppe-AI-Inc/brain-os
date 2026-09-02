// Programmatic launcher for the Fable 5 QA Director.
//
// Three things here are load-bearing and were established by probing this machine, not assumed:
//
//  1. MODEL IDENTIFIER. `claude -p --model fable` resolves to canonicalModel "claude-fable-5"
//     on this install (verified 2026-09-01 from the JSON result envelope). We pass the alias
//     and then ASSERT the canonical model that actually ran, so a silent downgrade to another
//     model shows up in the log instead of passing as a Fable run.
//
//  2. MCP CONFIG. The Playwright MCP server is registered in the user's Claude config against
//     the PARENT directory ("17.4. R&D CLAUDE CODE"), not against the repo. A director spawned
//     with cwd=repo would come up with no browser at all and could then "verify UI behaviour"
//     having never opened a page. We therefore both run from the parent dir AND pass
//     --mcp-config explicitly, so the browser is not an ambient accident.
//
//  3. PERMISSIONS. An unattended director must not stall on a prompt, but CLAUDE.md #22 records
//     a real incident where an overnight agent pushed a migration to production because the
//     prohibition existed only as prose in its prompt. So the launcher supplies a settings file
//     carrying BOTH a deny list AND a PreToolUse hook that inspects the actual command string.
//     The hook is the real barrier; the prompt text is only a courtesy.
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { P, REPO_ROOT, DIRECTOR_CWD } from './paths.mjs';

export const MODEL_ALIAS = 'fable';
export const EXPECTED_CANONICAL_MODEL = 'claude-fable-5';

export function resolveClaudeBin() {
  const candidates = [
    process.env.CLAUDE_BIN,
    join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'claude', 'claude.exe'),
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    const out = execFileSync('where', ['claude'], { encoding: 'utf8' });
    const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    if (first && existsSync(first)) return first;
  } catch {}
  return 'claude';
}

const AUTH_FAILURE_RE =
  /(invalid api key|authentication_error|please run \/login|oauth token (has )?expired|not authenticated|401 unauthorized|credit balance is too low)/i;

/**
 * Launch one QA Director invocation.
 *
 * Resolves when the process exits. Exiting is a WORKER LIFECYCLE EVENT, never a statement
 * that QA is complete - the supervisor re-consults the scheduler afterwards regardless of
 * how cleanly this returned.
 */
export function launchDirector({
  directive,
  maxBudgetUsd = 12,
  hangMs = 15 * 60_000,
  hardCapMs = 120 * 60_000,
  onHeartbeat = () => {},
  onEvent = () => {},
}) {
  const bin = resolveClaudeBin();
  const sessionId = randomUUID();
  const started = Date.now();
  const logPath = join(P.logsDir, 'director-' + new Date().toISOString().replace(/[:.]/g, '-') + '.jsonl');
  const log = createWriteStream(logPath, { flags: 'a' });

  const prompt = buildBootPrompt(directive);

  const args = [
    '-p', prompt,
    '--model', MODEL_ALIAS,
    '--output-format', 'stream-json',
    '--verbose',
    '--session-id', sessionId,
    '--permission-mode', 'bypassPermissions',
    '--settings', P.guardSettings,
    '--mcp-config', P.mcpConfig,
    '--add-dir', REPO_ROOT,
    '--max-budget-usd', String(maxBudgetUsd),
    '--name', 'work-pc-qa-director',
  ];

  const child = spawn(bin, args, {
    cwd: DIRECTOR_CWD,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, CLAUDE_CODE_WORK_PC_SUPERVISED: '1' },
  });

  const outcome = {
    session_id: sessionId, pid: child.pid, log_path: logPath,
    exit_code: null, killed_reason: null, is_error: null, result_text: null,
    canonical_model: null, total_cost_usd: null, num_turns: null,
    auth_failure: false, mcp_ok: null, started_at: new Date(started).toISOString(),
  };

  let lastOutput = Date.now();
  let stderrTail = '';

  return new Promise((resolve) => {
    const finish = (reason) => {
      if (outcome.killed_reason || outcome.exit_code !== null) return;
      outcome.killed_reason = reason;
      killTree(child.pid);
    };

    // Hang watchdog. Derived from ACTUAL worker output, not a flag the worker sets about
    // itself - a wedged director cannot fake progress it is not producing.
    const watchdog = setInterval(() => {
      const idle = Date.now() - lastOutput;
      onHeartbeat({ idle_ms: idle, elapsed_ms: Date.now() - started });
      if (idle > hangMs) finish('HUNG_NO_OUTPUT_FOR_' + Math.round(idle / 60000) + 'MIN');
      else if (Date.now() - started > hardCapMs) finish('HARD_RUNTIME_CAP');
    }, 20_000);

    let buf = '';
    child.stdout.on('data', (chunk) => {
      lastOutput = Date.now();
      log.write(chunk);
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        handleStreamMessage(msg, outcome, onEvent);
      }
    });

    child.stderr.on('data', (chunk) => {
      lastOutput = Date.now();
      const s = chunk.toString('utf8');
      stderrTail = (stderrTail + s).slice(-4000);
      log.write('#stderr ' + s);
      if (AUTH_FAILURE_RE.test(s)) outcome.auth_failure = true;
    });

    child.on('error', (err) => {
      outcome.exit_code = -1;
      outcome.result_text = 'spawn failed: ' + err.message;
      clearInterval(watchdog);
      log.end();
      resolve(outcome);
    });

    child.on('close', (code) => {
      clearInterval(watchdog);
      outcome.exit_code = code;
      outcome.duration_ms = Date.now() - started;
      outcome.stderr_tail = stderrTail.slice(-1500) || null;
      if (AUTH_FAILURE_RE.test(stderrTail) || AUTH_FAILURE_RE.test(outcome.result_text || '')) {
        outcome.auth_failure = true;
      }
      log.end();
      resolve(outcome);
    });
  });
}

function handleStreamMessage(msg, outcome, onEvent) {
  if (msg.type === 'system' && msg.subtype === 'init') {
    // The init frame lists the tools that actually loaded. If the Playwright MCP failed to
    // start, browser-dependent work must not be attempted - a director with no browser that
    // reports UI results is exactly the FALSE_SUCCESS this platform exists to prevent.
    const tools = msg.tools || [];
    outcome.mcp_ok = tools.some((t) => String(t).startsWith('mcp__playwright__'));
    outcome.tools_count = tools.length;
    onEvent({ kind: 'init', mcp_ok: outcome.mcp_ok, tools: tools.length });
  } else if (msg.type === 'assistant') {
    onEvent({ kind: 'assistant' });
  } else if (msg.type === 'result') {
    outcome.is_error = msg.is_error === true;
    outcome.result_text = typeof msg.result === 'string' ? msg.result.slice(0, 4000) : null;
    outcome.total_cost_usd = msg.total_cost_usd ?? null;
    outcome.num_turns = msg.num_turns ?? null;
    outcome.api_error_status = msg.api_error_status ?? null;
    const mu = msg.modelUsage || {};
    outcome.canonical_model = Object.values(mu)[0]?.canonicalModel || Object.keys(mu)[0] || null;
    if (msg.api_error_status === 401 || msg.api_error_status === 403) outcome.auth_failure = true;
    onEvent({ kind: 'result', is_error: outcome.is_error });
  }
}

export function killTree(pid) {
  if (!pid) return;
  try {
    // Windows: /T kills the whole tree. A bare process.kill leaves the node/npx MCP children
    // and any Chromium the director opened running, which would then fight the next director.
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } catch {
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
}

function buildBootPrompt(directive) {
  return [
    'You are the Work-PC QA Director for SEM Brain OS, launched programmatically by the',
    'autonomous supervisor. There is NO conversational history: recover everything you need',
    'from the repository.',
    '',
    'FIRST: read ' + REPO_ROOT.replace(/\\/g, '/') + '/qa/runner/QA_DIRECTOR_BOOT.md and follow it.',
    '',
    'ASSIGNED WORK FOR THIS INVOCATION:',
    directive,
    '',
    'RULES FOR THIS INVOCATION:',
    '- Recover authoritative QA state from repository files, not from memory or assumption.',
    '- Do NOT ask the founder for routine continuation, prioritisation, or permission to proceed.',
    '  There is no human reading this session. A question ends the invocation and wastes it.',
    '- Work until you reach a natural checkpoint, then COMMIT AND PUSH your QA evidence to the',
    '  qa/work-pc branch and end your turn. The supervisor will start the next invocation.',
    '- Ending your turn does NOT mean QA is finished; it means this shift is over. Leave the',
    '  repository in a state the next invocation can resume from.',
    '- You are QA. You may not modify production implementation code to fix a defect you found.',
    '- You may not push database migrations to production. This is enforced by a hook, not just',
    '  by this instruction - do not try to work around it, record it as a founder gate instead.',
    '- If a capability cannot be reached, mark it BLOCKED with a blocked_reason. Never PASS.',
    '- If the browser (mcp__playwright__*) is unavailable, do not attempt UI verification and do',
    '  not report UI results; record the blockage and do SQL/source work instead.',
  ].join('\n');
}

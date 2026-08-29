// Brain OS Software Factory — claude_code_background execution provider.
//
// Real architectural constraint, not a stylistic choice: this CANNOT run as a Vercel
// serverless function. `claude --agent ... --bg` spawns a genuinely long-running local
// OS process with its own git worktree and needs a persistent filesystem + the `claude`
// CLI installed - none of which a serverless function has. This module is meant to run
// on a real, always-on machine (this dev machine today; a dedicated always-on host
// later), invoked by whatever polls factory_work_orders once that table exists
// (Phase 3+ of the master plan - this module intentionally has zero dependency on that
// table yet, so it can be built and proven before the DB migration is authorized/pushed).
//
// Implements the AgentExecutionProvider interface from
// C:\Users\Dell\.claude\plans\quiet-wiggling-biscuit.md §G:
//   startRun, getRunStatus, getLogs, cancelRun, getArtifacts, healthCheck

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Strips the ANSI color/cursor-control codes claude logs/attach output includes -
// matches the exact sed pipeline used manually this session to make transcripts
// readable (`sed 's/\x1b\[[0-9;]*m//g' | sed 's/\[K//g'`), done here in JS instead.
function stripAnsi(text) {
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\x1b\[[0-9]*[A-Za-z]/g, '')
    .replace(/\[K/g, '')
    .replace(/\[2J\[H/g, '');
}

/**
 * Dispatch a real agent as a genuinely separate top-level Claude Code background
 * process - never an in-app Task-tool subagent (that inherits the parent session's
 * plan-mode gate and cannot be un-gated, a real diagnosed incident this whole factory
 * design responds to).
 *
 * @param {string} agentName - must match a real `.claude/agents/<agentName>.md` file.
 * @param {string} task - the prompt/instruction for this run.
 * @param {string} cwd - repo root to dispatch from.
 * @returns {Promise<{providerRunId: string, raw: string}>}
 */
export async function startRun(agentName, task, cwd) {
  const { stdout, stderr } = await execFileAsync(
    'claude',
    ['--agent', agentName, '--permission-mode', 'auto', '--bg', task],
    { cwd, maxBuffer: 10 * 1024 * 1024 }
  );
  const combined = stdout + stderr;
  // Real output shape observed live this session: "backgrounded · <8-hex-id>"
  const match = combined.match(/backgrounded\s*(?:·|\|)\s*([0-9a-f]{6,})/i);
  if (!match) {
    throw new Error(
      `startRun: could not parse a provider_run_id from claude --bg output. Raw output: ${combined}`
    );
  }
  return { providerRunId: match[1], raw: combined };
}

/**
 * @param {string} providerRunId
 * @returns {Promise<{status: string, state: string, name: string, cwd: string} | null>}
 *   null means the session is no longer known to `claude agents` (stopped/removed).
 */
export async function getRunStatus(providerRunId) {
  const { stdout } = await execFileAsync('claude', ['agents', '--json'], {});
  const sessions = JSON.parse(stdout);
  const match = sessions.find((s) => s.id === providerRunId);
  if (!match) return null;
  return {
    status: match.status ?? null, // 'idle' | 'busy' | 'waiting'
    state: match.state ?? null, // e.g. 'done' | 'blocked'
    name: match.name ?? null,
    cwd: match.cwd ?? null,
  };
}

/**
 * @param {string} providerRunId
 * @returns {Promise<string>} ANSI-stripped log text.
 */
export async function getLogs(providerRunId) {
  const { stdout } = await execFileAsync('claude', ['logs', providerRunId], {});
  return stripAnsi(stdout);
}

/**
 * @param {string} providerRunId
 */
export async function cancelRun(providerRunId) {
  await execFileAsync('claude', ['stop', providerRunId], {});
}

/**
 * Best-effort only until the factory_work_orders/factory_agent_runs DB layer exists
 * (Phase 3+) — real artifact tracking (which commit, which branch, which files) belongs
 * there once it's live. For now this reports what's directly observable from git: any
 * worktree whose branch was touched since the run's own logs mention a commit hash.
 * This is intentionally honest about being partial, not a placeholder pretending to be
 * complete — see the module header for why.
 * @param {string} providerRunId
 * @param {string} cwd
 */
export async function getArtifacts(providerRunId, cwd) {
  const logs = await getLogs(providerRunId);
  const commitMatches = [...logs.matchAll(/\b([0-9a-f]{7,40})\b/g)]
    .map((m) => m[1])
    .filter((h) => h.length >= 7);
  const { stdout: worktrees } = await execFileAsync('git', ['worktree', 'list'], { cwd });
  return {
    mentionedCommitHashes: [...new Set(commitMatches)],
    currentWorktrees: worktrees.trim().split('\n'),
    note: 'Partial evidence only - real artifact tracking requires factory_agent_runs (Phase 3+ DB layer). Do not treat this as authoritative.',
  };
}

/**
 * @returns {Promise<boolean>}
 */
export async function healthCheck() {
  try {
    const { stdout } = await execFileAsync('claude', ['--version'], {});
    return /\d+\.\d+\.\d+/.test(stdout);
  } catch {
    return false;
  }
}

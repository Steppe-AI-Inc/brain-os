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
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);
const REPO_ROOT = 'C:\\Users\\Dell\\dev\\brain-os';

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

// ============================================================================
// Registry-driven execution — Phase 6 of the Software Factory master plan.
// ============================================================================
// The Phase 6 acceptance test: the caller supplies a canonical Brain OS Agent ID (a
// public.agents UUID), never a raw agent name/definition path/CLI flag. Every actual
// dispatch parameter (name, execution_provider, whether it's even allowed to run) comes
// from a real, trusted read of the registry - not from anything the caller supplies.
// This is the concrete mechanism behind "client cannot spoof definition_path" and
// "unknown agent cannot execute": there is no code path here that accepts a name/path
// string directly from untrusted input and hands it to `claude --agent`.

async function runSqlSelect(sql) {
  const file = join(tmpdir(), `provider-registry-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, sql, 'utf8');
  try {
    const { stdout } = await execFileAsync('npx', ['supabase', 'db', 'query', '--linked', '-f', file], {
      cwd: REPO_ROOT,
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) throw new Error(`no JSON found in db query output: ${stdout}`);
    return JSON.parse(stdout.slice(jsonStart));
  } finally {
    unlinkSync(file);
  }
}

/**
 * Real read of the trusted registry - the only source of truth for what a given
 * canonical Agent ID is actually allowed to do.
 * @param {string} agentId - a real public.agents UUID.
 */
export async function resolveAgentFromRegistry(agentId) {
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) {
    throw new Error(`resolveAgentFromRegistry: "${agentId}" is not a well-formed UUID`);
  }
  const sql = `select id, name, active, execution_provider, has_production_authority, definition_path, definition_hash
from public.agents where id = '${agentId}'::uuid;`;
  const result = await runSqlSelect(sql);
  const row = result.rows?.[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    executionProvider: row.execution_provider,
    hasProductionAuthority: row.has_production_authority,
    definitionPath: row.definition_path,
    definitionHash: row.definition_hash,
  };
}

/**
 * The Phase 6 acceptance chain: Brain OS Agent ID -> Agent registry -> execution
 * provider resolves the approved agent definition -> real detached Claude execution.
 * Refuses to dispatch anything the registry itself doesn't vouch for.
 *
 * No `cwd` parameter, deliberately (a real gap an independent review caught in the first
 * version of this function): always dispatches against the real REPO_ROOT, never a
 * caller-supplied path — there is no legitimate reason the Runner's own dispatch target
 * directory should ever be something a caller chooses per-call.
 *
 * Also re-verifies the live on-disk file's real hash against the registry's stored
 * definition_hash before dispatching (the second gap the same review caught: the column
 * existed for drift detection but nothing ever actually checked it at dispatch time) -
 * refuses to dispatch on any mismatch rather than silently running a definition that may
 * have drifted from what was registered.
 * @param {string} agentId
 * @param {string} task
 */
export async function startRunByAgentId(agentId, task) {
  const agent = await resolveAgentFromRegistry(agentId);
  if (!agent) {
    throw new Error(`startRunByAgentId: no registry row for agent id ${agentId} - unknown agents cannot execute`);
  }
  if (!agent.active) {
    throw new Error(`startRunByAgentId: agent ${agentId} (${agent.name}) is registered but not active`);
  }
  if (!agent.executionProvider) {
    throw new Error(`startRunByAgentId: agent ${agentId} (${agent.name}) has no execution_provider - this is a design-only agent, never dispatched by the Runner`);
  }
  if (agent.executionProvider !== 'claude_code_background') {
    throw new Error(`startRunByAgentId: agent ${agentId} (${agent.name}) uses unsupported execution_provider "${agent.executionProvider}"`);
  }
  if (!agent.hasProductionAuthority) {
    throw new Error(`startRunByAgentId: agent ${agentId} (${agent.name}) does not have production authority - refusing to dispatch`);
  }
  if (!agent.definitionPath) {
    throw new Error(`startRunByAgentId: agent ${agentId} (${agent.name}) has no definition_path registered - refusing to dispatch`);
  }
  const liveContent = readFileSync(join(REPO_ROOT, agent.definitionPath), 'utf8');
  const liveHash = createHash('sha256').update(liveContent, 'utf8').digest('hex');
  if (liveHash !== agent.definitionHash) {
    throw new Error(
      `startRunByAgentId: definition_hash mismatch for ${agent.name} - registry has ${agent.definitionHash}, ` +
      `live file ${agent.definitionPath} hashes to ${liveHash}. The on-disk definition has drifted from what ` +
      `was registered; re-run sync-agents.mjs to confirm the change is intentional before dispatching.`
    );
  }
  const result = await startRun(agent.name, task, REPO_ROOT);
  return { ...result, agentId: agent.id, agentName: agent.name, definitionHash: agent.definitionHash };
}

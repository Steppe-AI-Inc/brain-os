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
// Real defect found live 2026-08-29 (Phase 8 repeatability dispatch, Work Order
// 3b28e447-4a9c-4f79-9419-80638a39e457): the CLI wraps the hex id itself in ANSI color
// codes (e.g. "backgrounded · \x1b[36m4bf0806d\x1b[39m"), which the old regex - matched
// directly against raw stdout/stderr - could not see past, even though the
// "backgrounded \s* ·" prefix matched fine. Root cause was matching un-stripped output;
// getLogs()/getArtifacts() already stripped ANSI before matching, this function did not.
// Fix: strip ANSI first, exactly like every other parser here. Real consequence observed
// live: the underlying `claude --bg` dispatch genuinely succeeded and later produced a
// real commit (aae7dad), but this function threw before the provider_run_id could be
// captured, so the caller (dispatch-task.mjs) never recorded an agent_runs row - a real,
// disclosed tracking gap, not a hypothetical one.
//
// Extracted as its own pure, exported function (no process spawn, no I/O) specifically so
// it has a permanent, fast, deterministic regression test - see
// provider.regression.test.mjs, which independently reproduces the exact failing byte
// sequence observed live and asserts this parses it correctly. A comment claiming
// "regression-verified" is not itself a regression test; this function + that test file
// is - added by independent verification (Work Order 3b28e447-4a9c-4f79-9419-80638a39e457)
// because the original fix commit shipped only inline comments, no committed test.
// @param {string} combined - concatenated raw stdout+stderr from `claude --bg`.
// @returns {string} the parsed provider run id (hex string, 6+ chars).
export function parseProviderRunId(combined) {
  const clean = stripAnsi(combined);
  // Real output shape observed live this session: "backgrounded · <8-hex-id>"
  const match = clean.match(/backgrounded\s*(?:·|\|)\s*([0-9a-f]{6,})/i);
  if (!match) {
    throw new Error(
      `startRun: could not parse a provider_run_id from claude --bg output. Raw output: ${combined}`
    );
  }
  return match[1];
}

// PROVIDER_CAPACITY_BLOCKED (overnight campaign 2026-09-02, real incident): an
// independent-verifier dispatch exited with code 0 while its ONLY output was
// "You've hit your session limit · resets 1am (Asia/Ulaanbaatar)". Nothing ran. The
// founder's standing rule from that incident: exit code 0 + provider error text is NOT
// a successful Agent Run — a provider quota/session-limit must classify as
// PROVIDER_CAPACITY_BLOCKED (retryable, never silently successful, never a generic
// unexplained failure). Pure and exported for the same reason parseProviderRunId is:
// so provider.regression.test.mjs can pin the exact observed byte shape forever.
export const PROVIDER_CAPACITY_BLOCKED = 'PROVIDER_CAPACITY_BLOCKED';
const PROVIDER_CAPACITY_PATTERNS = [
  /you'?ve hit your (session|usage) limit/i, // exact live shape 2026-09-02
  /session limit[^\n.]{0,60}resets/i,
  /usage limit reached/i,
  /credit balance is too low/i,
  /quota (has been )?exceeded/i,
];
// @param {string} combined - raw provider output (stdout+stderr or log tail).
// @returns {{classification: string, matched: string} | null}
// BLOCKED — EXECUTION_MODE (2026-09-03, real incident): a background-dispatched verifier
// inherited an interactive Plan Mode / approval gate that no human was present to click,
// and stalled silently. Checked FIRST because this text can co-occur with anything else,
// and no retry in the SAME execution mode can clear it — the Factory Director must
// re-dispatch as TOP_LEVEL_ISOLATED_PROCESS (see verifierDispatchArgv). Never a FAIL of the
// candidate, never a PASS.
export const EXECUTION_MODE_BLOCKED = 'EXECUTION_MODE_BLOCKED';
const EXECUTION_MODE_PATTERNS = [
  /\bplan mode\b/i,
  /ExitPlanMode/,
  /(requires|waiting for|needs your) approval/i,
  /approval (is )?required/i,
  /permission (prompt|required)/i,
  /PREFLIGHT: BLOCKED — EXECUTION_MODE/,
];
// BLOCKED — PROVIDER_TRANSIENT_ERROR (2026-09-03, "provider API 500 interrupted verifier
// #15"): a 5xx / overloaded response mid-run is neither a PASS nor a FAIL of the
// candidate. It is retryable with BOUNDED exponential backoff, and the durable checkpoint
// plus the pinned SHA make the retry a RESUMPTION (sha unchanged => completed scenarios
// are reused; sha changed => partial certification is invalidated by planResume).
export const PROVIDER_TRANSIENT_ERROR = 'PROVIDER_TRANSIENT_ERROR';
const PROVIDER_TRANSIENT_PATTERNS = [
  /API Error: 5\d\d/i,
  /\b(500|502|503|504|529)\b[^\n]{0,40}(error|overloaded|internal|unavailable)/i,
  /overloaded_error/i,
  /internal server error/i,
  /service unavailable/i,
  /\b(ECONNRESET|ETIMEDOUT|fetch failed)\b/,
];
export function classifyProviderOutput(combined) {
  const clean = stripAnsi(String(combined ?? ''));
  for (const pattern of EXECUTION_MODE_PATTERNS) {
    const match = clean.match(pattern);
    if (match) return { classification: EXECUTION_MODE_BLOCKED, matched: match[0] };
  }
  for (const pattern of PROVIDER_CAPACITY_PATTERNS) {
    const match = clean.match(pattern);
    if (match) return { classification: PROVIDER_CAPACITY_BLOCKED, matched: match[0] };
  }
  for (const pattern of PROVIDER_TRANSIENT_PATTERNS) {
    const match = clean.match(pattern);
    if (match) return { classification: PROVIDER_TRANSIENT_ERROR, matched: match[0] };
  }
  return null;
}

// Bounded exponential backoff for transient provider errors: 60s, 120s, 240s ... capped at
// 15 minutes. Pure so the bound itself is a regression (never immediate, never unbounded).
export function transientBackoffSeconds(attemptCount) {
  const n = Math.max(1, Number(attemptCount) || 1);
  return Math.min(900, 60 * 2 ** (n - 1));
}

// ---- EXECUTION MODES ------------------------------------------------------------------
// BACKGROUND_SUBAGENT: `claude --agent X --bg` from within a parent session. It shares the
//   parent's permission context, so it CAN inherit an unactionable Plan Mode / approval
//   gate. Retained for implementation runs that a human is watching.
// TOP_LEVEL_ISOLATED_PROCESS: a separate `claude -p` process with an explicit
//   non-interactive permission mode, cwd = an isolated git worktree at the exact candidate
//   SHA, the role given directly via --agent, no parent session, no implementation history.
//   The ONLY mode permitted for the independent verifier.
export const EXECUTION_MODES = Object.freeze({
  BACKGROUND_SUBAGENT: 'background_subagent',
  TOP_LEVEL_ISOLATED_PROCESS: 'isolated_process',
});
export const VERIFIER_ALLOWED_TOOLS = Object.freeze([
  'Bash(node:*)', 'Bash(sha256sum:*)', 'Bash(git status:*)', 'Bash(git log:*)', 'Bash(git diff:*)',
  'Bash(git show:*)', 'Bash(git rev-parse:*)', 'Bash(git worktree list:*)', 'Bash(ls:*)', 'Bash(cat:*)',
  'Bash(echo:*)', 'Bash(touch:*)', 'Bash(rm:*)', 'Bash(npx supabase functions list:*)',
]);
/**
 * The argv for a verifier dispatch. Pure and exported so the regression
 * BACKGROUND_AGENT_EXECUTION_MODE_MUST_NOT_INHERIT_UNACTIONABLE_PLAN_GATE can assert the
 * exact shape: an isolated verifier is `-p` (non-interactive, exits when done), carries an
 * explicit permission mode that is never `plan`, never `--bg`, and names its role directly.
 * @param {string} prompt
 * @param {string} mode one of EXECUTION_MODES
 */
export function verifierDispatchArgv(prompt, mode = EXECUTION_MODES.TOP_LEVEL_ISOLATED_PROCESS) {
  if (mode === EXECUTION_MODES.TOP_LEVEL_ISOLATED_PROCESS) {
    return ['--permission-mode', 'acceptEdits', '--allowedTools', ...VERIFIER_ALLOWED_TOOLS,
      '--agent', 'brain-os-verifier', '-p', prompt];
  }
  if (mode === EXECUTION_MODES.BACKGROUND_SUBAGENT) {
    return ['--agent', 'brain-os-verifier', '--permission-mode', 'auto', '--bg', prompt];
  }
  throw new Error(`unknown execution mode: ${mode}`);
}

export async function startRun(agentName, task, cwd) {
  const { stdout, stderr } = await execFileAsync(
    'claude',
    ['--agent', agentName, '--permission-mode', 'auto', '--bg', task],
    { cwd, maxBuffer: 10 * 1024 * 1024 }
  );
  const combined = stdout + stderr;
  // Checked BEFORE the run-id parse: a capacity-blocked dispatch produces no run id, and
  // the caller needs the real classification (mark blocked/retryable), not a generic
  // "could not parse" error that reads like a Factory bug.
  const capacity = classifyProviderOutput(combined);
  if (capacity) {
    const err = new Error(
      `startRun: provider refused the dispatch — ${capacity.matched}. ` +
      `Classified ${PROVIDER_CAPACITY_BLOCKED}: retryable, nothing was dispatched.`
    );
    err.classification = PROVIDER_CAPACITY_BLOCKED;
    err.providerOutput = stripAnsi(combined);
    throw err;
  }
  const providerRunId = parseProviderRunId(combined);
  return { providerRunId, raw: combined };
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
  const sql = `select id, name, active, execution_provider, has_production_authority, definition_path, definition_hash, provenance
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
    // Real, currently-attached external skills (see sync-agents.mjs's
    // syncAttachedCapabilities) — [] for an agent with no plugin attachments, never
    // undefined, so callers can always safely read .externalCapabilities.
    externalCapabilities: row.provenance?.external_capabilities ?? [],
  };
}

/**
 * Builds the real, non-cosmetic prompt block that makes an attached skill actually
 * reach the execution runtime.
 *
 * Real, live-found bug fixed here (Phase 6, qa/KNOWN_FAILURE_MODES.md #50): the original
 * version of this function told the dispatched session to "invoke via the Skill tool" but
 * never included definition_path - the Skill tool only resolves skills that are ALSO
 * installed as a real Claude Code marketplace plugin on this machine (confirmed live:
 * obra/superpowers IS installed that way, so `Skill(systematic-debugging)` genuinely
 * worked; rebelytics/one-skill-to-rule-them-all is NOT, so `Skill(task-observer)`
 * genuinely failed with "Unknown skill: task-observer" - and the agent had no path/name to
 * fall back to reading directly, because this function never told it one). Every
 * plugin_components row Brain OS registers is NOT guaranteed to also be a real installed
 * Claude Code marketplace plugin - a vendored file registered through plugin-attach.mjs's
 * own pipeline is the common case, not the exception. Now instructs the dispatched session
 * to Read the real definition_path directly and apply its instructions - reliable
 * regardless of marketplace-installation status - and only additionally suggests the Skill
 * tool as a possible shortcut when it happens to already be registered that way.
 *
 * @param {Array<{skill:string, origin:string, pinned_ref:string|null, definition_path?:string}>} externalCapabilities
 */
export function buildSkillInjectionPrompt(externalCapabilities) {
  if (!externalCapabilities?.length) return '';
  const lines = externalCapabilities.map((c) => {
    const originText = `${c.skill} (from ${c.origin}${c.pinned_ref ? ` @ ${c.pinned_ref}` : ''})`;
    return c.definition_path ? `- ${originText} - Read this file directly: ${c.definition_path}` : `- ${originText}`;
  });
  return (
    `\n\nAttached skills for this run - for each one, Read its file directly (the Skill ` +
    `tool only works if it also happens to be installed as a Claude Code marketplace ` +
    `plugin on this machine; reading the file directly always works) and apply its ` +
    `instructions before proceeding if relevant to the task:\n` +
    lines.join('\n') +
    '\n'
  );
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
  const skillBlock = buildSkillInjectionPrompt(agent.externalCapabilities);
  const result = await startRun(agent.name, task + skillBlock, REPO_ROOT);
  return {
    ...result,
    agentId: agent.id,
    agentName: agent.name,
    definitionHash: agent.definitionHash,
    attachedSkills: agent.externalCapabilities,
  };
}

// Worker capability policies - the boundary that REMOVES capability instead of filtering text.
//
// Founder invariant (2026-09-10): CAPABILITY REMOVAL > COMMAND-TEXT FILTERING. The PreToolUse hook
// already proved insufficient as a primary boundary (it fails open, keys on strings, and never
// sees MCP payloads). So each worker class is launched with the Claude CLI flags that make the
// forbidden tools NOT EXIST for that process:
//
//   --restricted          removes code-running built-ins and WebFetch unless --tools names them,
//                         confines file tools to the working directories, REFUSES bypassPermissions
//   --tools <list|"">     the only built-ins that exist ("" = none)
//   --strict-mcp-config   only MCP servers from --mcp-config; never the founder's user-level one
//   --allowedTools        pre-approves exactly the reviewed tool names (no prompts, no wildcard)
//   --disallowedTools     belt-and-braces denial of every other known name
//
// Whether the CLI honoured the policy is not assumed: the orchestrator reads the system/init
// frame's `tools` array and kills any worker whose live tool set differs from the policy.
// That check is the enforcement; this file is only the specification it is checked against.
import { createHash } from 'node:crypto';

// Version-bound. An @playwright/mcp upgrade can add tools; the policy hash must change with it so
// browserIsolationVerified drops to false until the new tool set is reviewed. Never "@latest".
export const PLAYWRIGHT_MCP_VERSION = '0.0.80';

// Every built-in the CLI is known to expose. Listed so the deny list is explicit rather than
// "whatever --tools happened to leave out". Unknown future built-ins are still excluded by
// --tools "" (BROWSER_QA) or --tools "Read,Glob,Grep" (SOURCE_AUDIT); this list is defense in depth.
export const KNOWN_BUILTIN_TOOLS = Object.freeze([
  'Bash', 'PowerShell', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'LS',
  'Agent', 'Task', 'WebFetch', 'WebSearch', 'NotebookEdit', 'NotebookRead', 'TodoWrite',
  'Skill', 'ToolSearch', 'SendMessage', 'ListAgents', 'Artifact', 'AskUserQuestion',
  'ExitPlanMode', 'EnterPlanMode', 'Monitor', 'CronCreate', 'CronDelete', 'CronList',
  'ScheduleWakeup', 'SendFeedback', 'SendUserFile', 'TaskOutput', 'TaskStop', 'ReportFindings',
]);

const PW = (n) => 'mcp__playwright__' + n;

// Reviewed, human-equivalent UI operations only, as exposed by qa/runner/mcp-safe-browser.mjs (the
// proxy the worker actually connects to; it wraps pinned @playwright/mcp 0.0.80). Navigation is
// `safe_browser_navigate` - the proxy validates protocol + exact hostname BELOW the model and the
// raw upstream `browser_navigate` is never exposed. No wildcard: a tool not in this list does not
// exist for the worker.
export const BROWSER_QA_ALLOW = Object.freeze([
  'safe_browser_navigate', 'browser_navigate_back', 'browser_snapshot', 'browser_click', 'browser_type',
  'browser_fill_form', 'browser_select_option', 'browser_press_key', 'browser_hover',
  'browser_wait_for', 'browser_tabs', 'browser_take_screenshot', 'browser_find',
  'browser_handle_dialog', 'browser_close', 'browser_resize', 'browser_console_messages',
].map(PW));

// Raw execution / network / arbitrary-path primitives. Denied by exact name in addition to being
// absent from the allow list, so that a future rename or alias is still caught by the deny side.
export const BROWSER_QA_DENY = Object.freeze([
  'browser_navigate', 'browser_evaluate', 'browser_run_code_unsafe', 'browser_network_request',
  'browser_network_requests', 'browser_file_upload', 'browser_drag', 'browser_drop',
].map(PW));

export const SOURCE_AUDIT_TOOLS = Object.freeze(['Read', 'Glob', 'Grep']);

export const POLICIES = Object.freeze({
  BROWSER_QA: Object.freeze({
    class: 'BROWSER_QA',
    restricted: true,
    tools: '',                                  // no built-ins at all
    allowedTools: BROWSER_QA_ALLOW,
    disallowedTools: Object.freeze([...BROWSER_QA_DENY, ...KNOWN_BUILTIN_TOOLS]),
    strictMcp: true,
    mcp: { package: '@playwright/mcp', version: PLAYWRIGHT_MCP_VERSION },
    permissionMode: null,                       // NEVER bypassPermissions
    workerWritesFiles: false,                   // orchestrator materialises RESULT.json
    cwd: 'worker_run_dir',
    requiresIdentity: true,
  }),
  SOURCE_AUDIT: Object.freeze({
    class: 'SOURCE_AUDIT',
    restricted: true,
    tools: SOURCE_AUDIT_TOOLS.join(','),        // Read,Glob,Grep - nothing else
    allowedTools: SOURCE_AUDIT_TOOLS,
    disallowedTools: Object.freeze(KNOWN_BUILTIN_TOOLS.filter((t) => !SOURCE_AUDIT_TOOLS.includes(t))),
    strictMcp: true,
    mcp: null,                                  // no MCP servers whatsoever
    permissionMode: null,
    workerWritesFiles: false,
    cwd: 'source_worktree',                     // tracked source only; never the operational tree
    requiresIdentity: false,
    fingerprintWorktree: true,                  // SOURCE INPUT BEFORE == SOURCE INPUT AFTER
  }),
});

export function policyFor(workerClass) {
  const p = POLICIES[workerClass];
  if (!p) throw new Error('UNKNOWN_WORKER_CLASS: ' + workerClass);
  return p;
}

/** CLI args that encode the policy. Empty --tools is passed as a genuine empty string. */
export function policyArgs(policy) {
  const args = [];
  if (policy.restricted) args.push('--restricted');
  args.push('--tools', policy.tools);
  if (policy.allowedTools.length) args.push('--allowedTools', ...policy.allowedTools);
  if (policy.disallowedTools.length) args.push('--disallowedTools', ...policy.disallowedTools);
  if (policy.strictMcp) args.push('--strict-mcp-config');
  return args;
}

/** Stable hash of exactly what was reviewed: class, built-ins, allow, deny, MCP version. */
export function policyHash(policy) {
  const canon = JSON.stringify({
    class: policy.class, tools: policy.tools,
    allow: [...policy.allowedTools].sort(), deny: [...policy.disallowedTools].sort(),
    mcp: policy.mcp ? policy.mcp.package + '@' + policy.mcp.version : null,
    restricted: policy.restricted, strictMcp: policy.strictMcp,
  });
  return createHash('sha256').update(canon).digest('hex');
}

/**
 * Compare the LIVE init-frame tool list against the policy. This is the enforcement point.
 *
 * BROWSER_QA: every live tool must be in the allow list; none may be in the deny list; no
 * built-in may exist. SOURCE_AUDIT: the live set must equal {Read, Glob, Grep} or be a strict
 * subset of it. Anything else is a boundary failure, and the reason names the offending tools so
 * the report can show exactly what leaked.
 */
export function checkInitFrame(policy, liveTools) {
  const live = [...new Set((liveTools || []).map(String))];
  const allow = new Set(policy.allowedTools);
  const deny = new Set(policy.disallowedTools);

  if (policy.class === 'BROWSER_QA') {
    const unexpected = live.filter((t) => !allow.has(t));
    const denied = live.filter((t) => deny.has(t));
    const builtins = live.filter((t) => !t.startsWith('mcp__'));
    const ok = unexpected.length === 0 && denied.length === 0 && builtins.length === 0;
    return { ok, class: policy.class, live, unexpected, denied, builtins,
      reason: ok ? null : 'CAPABILITY_BOUNDARY_NOT_ENFORCED' };
  }

  if (policy.class === 'SOURCE_AUDIT') {
    const unexpected = live.filter((t) => !allow.has(t));
    const mcp = live.filter((t) => t.startsWith('mcp__'));
    const ok = unexpected.length === 0 && mcp.length === 0 && live.length > 0;
    return { ok, class: policy.class, live, unexpected, denied: mcp, builtins: [],
      reason: ok ? null : 'SOURCE_AUDIT_CLASS_BLOCKED_NO_ENFORCEABLE_BOUNDARY' };
  }

  return { ok: false, class: policy.class, live, unexpected: live, denied: [], builtins: [], reason: 'UNKNOWN_WORKER_CLASS' };
}

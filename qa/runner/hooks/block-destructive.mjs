#!/usr/bin/env node
// PreToolUse hook: a REAL technical barrier for the unattended QA Director.
//
// CLAUDE.md #22 records the incident this exists for: an overnight subagent applied a migration
// to production despite being told not to, because the instruction lived only in its prompt.
// "Do not run db push" as prose is not enforcement. This hook inspects the actual command string
// the harness is about to execute and refuses it, whatever the prompt said.
//
// SCOPE, stated honestly - DEFENSE IN DEPTH ONLY (founder decision 2026-09-10):
//  - This guards against an autonomous agent's MISTAKE. It is not an adversarial sandbox. An
//    agent determined to evade it could (e.g. base64 a command, write a script and run it).
//    The real containment is CAPABILITY REMOVAL: the Work PC holds no production control-plane
//    credential (A4), and worker classes have no shell at all (qa/runner/lib/worker-policy.mjs).
//    CAPABILITY REMOVAL > COMMAND-TEXT FILTERING. Nothing here is the boundary.
//  - It fails OPEN on internal error, and logs loudly when it does. Failing closed would wedge
//    every Bash call in the node the first time an unexpected payload shape arrived, which
//    would silently stop QA - a worse and much less visible outcome than one unguarded command.
//  - Transport-level rules (PRODUCTION_SQL_TRANSPORT, SUPABASE_DATA_PLANE, CONTROL_PLANE_LOGIN)
//    deliberately ignore any `rollback` in the text: a rollback-wrapped query is still production
//    SQL from the Work PC, which is prohibited absolutely.
//  - MCP payloads are inspected too (url / code / function / expression fields), so a browser
//    tool asked to fetch the Supabase data plane is caught here as a second layer; the first layer
//    is that BROWSER_QA workers never receive browser_evaluate/run_code/network_request at all.
import { appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG = join(dirname(fileURLToPath(import.meta.url)), '..', 'logs', 'guard.log');
const log = (m) => { try { appendFileSync(LOG, new Date().toISOString() + ' ' + m + '\n'); } catch {} };

const allow = () => process.exit(0);
const deny = (reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
};

// Rules are [name, test, why]. Order matters only for which reason gets reported first.
const RULES = [
  ['PRODUCTION_DB_MIGRATION',
    (c) => /supabase\s+db\s+push/i.test(c) || /supabase\s+migration\s+(up|repair)/i.test(c)
        || /supabase\s+db\s+(reset|remote\s+commit)/i.test(c),
    'Applying a database migration to production is a founder-authorised action and is blocked for the '
    + 'unattended QA node (CLAUDE.md #22 - this exact thing happened once via an overnight agent). '
    + 'Prepare the migration file and record it as a founder gate in the bug/handoff instead.'],

  ['DEPLOY_PRODUCT',
    (c) => /supabase\s+functions\s+deploy/i.test(c) || /\bvercel\s+(deploy|promote|rollback|alias|--prod)/i.test(c),
    'QA does not deploy the product. The Work PC verifies builds; the Home PC ships them. '
    + 'Deploying from the QA node would destroy the independence of the acceptance evidence.'],

  ['PUSH_TO_PRODUCT_BRANCH',
    (c) => /git\s+push[^\n;|&]*\b(master|main)\b/i.test(c) && !/qa\/work-pc/i.test(c),
    'The QA node may only push QA artefacts to the qa/work-pc branch. Pushing to master/main would '
    + 'put QA-authored changes into the product line.'],

  ['FORCE_PUSH',
    (c) => /git\s+push[^\n;|&]*(--force\b|--force-with-lease\b|\s-f\b)/i.test(c),
    'Force-pushing would rewrite shared QA history and destroy evidence. History rewrites are '
    + 'explicitly excluded by the founder instruction covering the branch-ownership reconciliation.'],

  ['PRODUCTION_SQL_TRANSPORT',
    (c) => /(supabase\s+db\s+(query|dump|pull|diff|lint|start|remote)|supabase\s+sql|\bpsql\b|\bpgcli\b|\bpg_dump\b|\bpg_restore\b|postgres(ql)?:\/\/|run-sql-regressions\.mjs)/i.test(c),
    'NO PRODUCTION SQL FROM WORK PC - absolute (founder decision 2026-09-10). A rollback wrapper does '
    + 'not make it permitted. SQL regressions are executed by the Home PC; record the item as '
    + 'awaiting_home_pc with PRODUCTION_SQL_PROHIBITED_ON_WORK_PC.'],

  ['SUPABASE_DATA_PLANE',
    (c) => /supabase\.co\/(rest|rpc|graphql|storage|auth\/v1\/admin)/i.test(c)
        || /createClient\s*\(/i.test(c) && /supabase/i.test(c)
        || /(apikey|service_role|SUPABASE_SERVICE_ROLE_KEY)/i.test(c) && /(curl|Invoke-(RestMethod|WebRequest)|fetch\(|wget|http)/i.test(c),
    'Direct Supabase data-plane access (REST/RPC/GraphQL/Storage/Auth-Admin) bypasses the product path. '
    + 'Work-PC QA reaches production only through the deployed UI and its application API.'],

  ['CONTROL_PLANE_LOGIN',
    (c) => /\b(supabase|vercel)\s+(login|link)\b/i.test(c) || /\bgh\s+auth\s+login\b/i.test(c),
    'Installing a control-plane credential on the QA machine is a founder action, not an autonomous one. '
    + 'The Work PC is designed to hold none (A4, 2026-09-10).'],

  ['DESTRUCTIVE_SQL_OUTSIDE_TRANSACTION',
    (c) => /(psql|supabase\s+db|supabase\s+sql)/i.test(c)
        && /\b(drop\s+(table|schema|database|policy|function|type)|truncate\b|delete\s+from|alter\s+table)/i.test(c),
    'Destructive SQL against the live database. Superseded by PRODUCTION_SQL_TRANSPORT (which fires '
    + 'first and ignores rollback); retained so the older rule name still appears in guard.log history.'],
];

// A7 (2026-09-10): browser_navigate is retained for BROWSER_QA, so it must not become a raw
// file/code primitive. The pinned sidecar already blocks file: itself, but data:text/html executes
// script in an opaque origin and chrome:// loads browser-internal pages. This gate is STRUCTURAL
// (URL parsed, protocol + hostname compared) rather than a text heuristic, and for browser_navigate
// the hook fails CLOSED - a navigation refused by an internal error is a harmless retry, unlike a
// wedged Bash call.
const NAV_ALLOWED_HOSTS = new Set(['brain.open-spot.ai', 'pvphxgrtdfrudejjhzjk.supabase.co']);
// DEFENSE IN DEPTH ONLY: the primary navigation boundary is qa/runner/mcp-safe-browser.mjs, which
// validates URLs below the model. This mirrors it for the Director's shell-capable session.
const NAV_TOOLS = /^mcp__playwright__(safe_browser_navigate|browser_navigate|browser_tabs)$/;
function navigationRefusal(toolName, input) {
  if (!NAV_TOOLS.test(toolName)) return null;
  const raw = input && (input.url ?? input.href);
  if (raw == null) return null;
  let u;
  try { u = new URL(String(raw)); } catch { return 'unparseable URL "' + String(raw).slice(0, 120) + '"'; }
  if (u.protocol !== 'https:') return 'scheme "' + u.protocol + '" is not https: (file:/javascript:/data:/chrome:/about:/http: are never product paths)';
  if (!NAV_ALLOWED_HOSTS.has(u.hostname)) return 'host "' + u.hostname + '" is not a product host';
  return null;
}

// MCP / WebFetch payload fields that can carry a URL, code or a function name.
function payloadText(input) {
  const parts = [];
  for (const k of ['command', 'script', 'url', 'code', 'function', 'expression', 'element', 'text', 'value', 'prompt']) {
    if (input && input[k] != null) parts.push(String(input[k]));
  }
  if (input && Array.isArray(input.fields)) for (const f of input.fields) if (f && f.value != null) parts.push(String(f.value));
  return parts.join('\n');
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw || '{}');
    const input = payload.tool_input || {};
    const toolName = String(payload.tool_name || '');
    const cmd = payloadText(input);
    if (!cmd) allow();

    const nav = navigationRefusal(toolName, input);
    if (nav) {
      log('DENY NAVIGATION_SCHEME [' + toolName + '] :: ' + cmd.slice(0, 300));
      deny('BLOCKED BY WORK-PC QA GUARD [NAVIGATION_SCHEME]: ' + nav + '. Browser workers navigate only to https:// product hosts.');
    }

    // Raw-execution browser tools are absent from every worker class by policy; if one reaches a
    // hook at all (the solo Director), it is denied outright - a second layer, not the first.
    if (/^mcp__playwright__browser_(evaluate|run_code_unsafe|network_request)$/.test(toolName)) {
      log('DENY RAW_BROWSER_PRIMITIVE ' + toolName + ' :: ' + cmd.slice(0, 200));
      deny('BLOCKED BY WORK-PC QA GUARD [RAW_BROWSER_PRIMITIVE]: ' + toolName + ' is not a product-path action.');
    }

    for (const [name, test, why] of RULES) {
      let hit = false;
      try { hit = test(cmd); } catch (e) { log('RULE_ERROR ' + name + ' ' + e.message); }
      if (hit) {
        log('DENY ' + name + ' [' + toolName + '] :: ' + cmd.slice(0, 400));
        deny('BLOCKED BY WORK-PC QA GUARD [' + name + ']: ' + why);
      }
    }
    allow();
  } catch (e) {
    // Navigation fails CLOSED; everything else fails open (see header).
    if (/browser_(navigate|tabs)/.test(raw)) {
      log('FAIL_CLOSED_NAVIGATION ' + e.message + ' :: ' + raw.slice(0, 300));
      deny('BLOCKED BY WORK-PC QA GUARD [NAVIGATION_SCHEME]: hook error while validating a navigation; refused.');
    }
    log('FAIL_OPEN ' + e.message + ' :: ' + raw.slice(0, 300));
    allow();
  }
});

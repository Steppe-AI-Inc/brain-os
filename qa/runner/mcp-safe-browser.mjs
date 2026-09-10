#!/usr/bin/env node
// SAFE BROWSER MCP PROXY - the navigation boundary BELOW the model (founder A7 fix, 2026-09-10).
//
// The raw @playwright/mcp sidecar proved that --allowed-origins is not a navigation boundary:
// data:text/html executes script, javascript: executes, chrome:// loads. A PreToolUse hook can
// refuse those, but a hook is DEFENSE IN DEPTH ONLY by our invariant - it must never be the
// primary control. So the BROWSER_QA worker no longer connects to the sidecar at all. It connects
// to THIS process, which:
//
//   1. spawns the version-pinned upstream sidecar itself (stdio), with the worker's storageState;
//   2. exposes ONLY the reviewed high-level tools (EXPOSED below). browser_navigate is NOT exposed;
//      the model receives `safe_browser_navigate` instead, and browser_evaluate /
//      browser_run_code_unsafe / browser_network_request(s) / browser_file_upload / drag / drop
//      never appear in tools/list and are refused on tools/call;
//   3. validates every URL argument STRUCTURALLY before forwarding: `new URL()` must parse,
//      protocol must be exactly "https:", hostname must be in the exact allowlist. file:,
//      javascript:, data:, chrome:, about:, http:, blob:, filesystem:, extension schemes,
//      unknown schemes and unknown hosts are rejected here and never reach Playwright.
//
// No regex on command text. No model in the loop. The proxy is ~200 lines so it can be reviewed
// in full; its forwarding decisions are logged to QA_SAFE_BROWSER_LOG for the acceptance harness.
//
// Usage (written into the worker's mcp-servers.json by browser-isolation.mjs):
//   node mcp-safe-browser.mjs --storage-state <file> [--allowed-hosts brain.open-spot.ai] [--network-hosts a,b] [--upstream-version 0.0.80] [--output-dir <dir>]
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d = null) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);

export const UPSTREAM_VERSION = arg('--upstream-version', '0.0.80');
// NAVIGATION allowlist: the product host only. The application backend (Supabase) is reached by
// the product's own XHR, which the upstream --allowed-origins governs; a worker never needs to
// NAVIGATE there, so it cannot.
export const DEFAULT_ALLOWED_HOSTS = ['brain.open-spot.ai'];
export const DEFAULT_NETWORK_HOSTS = ['brain.open-spot.ai', 'pvphxgrtdfrudejjhzjk.supabase.co'];
const ALLOWED_HOSTS = new Set((arg('--allowed-hosts') || DEFAULT_ALLOWED_HOSTS.join(',')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const NETWORK_HOSTS = new Set((arg('--network-hosts') || DEFAULT_NETWORK_HOSTS.join(',')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const STORAGE_STATE = arg('--storage-state');
const OUTPUT_DIR = arg('--output-dir');
const LOG = process.env.QA_SAFE_BROWSER_LOG || null;

// Reviewed, human-equivalent UI operations. Upstream name -> exposed name.
export const EXPOSED = Object.freeze({
  browser_navigate: 'safe_browser_navigate',
  browser_navigate_back: 'browser_navigate_back',
  browser_snapshot: 'browser_snapshot',
  browser_click: 'browser_click',
  browser_type: 'browser_type',
  browser_fill_form: 'browser_fill_form',
  browser_select_option: 'browser_select_option',
  browser_press_key: 'browser_press_key',
  browser_hover: 'browser_hover',
  browser_wait_for: 'browser_wait_for',
  browser_tabs: 'browser_tabs',
  browser_take_screenshot: 'browser_take_screenshot',
  browser_find: 'browser_find',
  browser_handle_dialog: 'browser_handle_dialog',
  browser_close: 'browser_close',
  browser_resize: 'browser_resize',
  browser_console_messages: 'browser_console_messages',
});
const EXPOSED_TO_UPSTREAM = Object.fromEntries(Object.entries(EXPOSED).map(([u, e]) => [e, u]));

/** Structural URL validation. Returns null when acceptable, otherwise the rejection reason. */
export function urlRefusal(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return 'empty URL';
  let u;
  try { u = new URL(raw); } catch { return 'unparseable URL'; }
  if (u.protocol !== 'https:') return 'scheme ' + u.protocol + ' is not https:';
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return 'host ' + u.hostname + ' is not in the allowlist [' + [...ALLOWED_HOSTS].join(', ') + ']';
  if (u.username || u.password) return 'credentials in URL are not allowed';
  return null;
}

const log = (ev) => { if (LOG) { try { appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...ev }) + '\n'); } catch {} } };

// ---------------------------------------------------------------- upstream sidecar
const upstreamArgs = ['@playwright/mcp@' + UPSTREAM_VERSION, '--isolated'];
if (STORAGE_STATE) upstreamArgs.push('--storage-state', STORAGE_STATE);
if (OUTPUT_DIR) upstreamArgs.push('--output-dir', OUTPUT_DIR);
upstreamArgs.push('--allowed-origins', [...new Set([...ALLOWED_HOSTS, ...NETWORK_HOSTS])].map((h) => 'https://' + h).join(';'));

const up = process.platform === 'win32'
  ? spawn(process.env.ComSpec || 'cmd.exe', ['/c', 'npx', ...upstreamArgs], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  : spawn('npx', upstreamArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
up.stderr.on('data', (d) => process.stderr.write('[upstream] ' + d));
up.on('exit', (code) => { log({ event: 'upstream_exit', code }); process.exit(code ?? 1); });

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const toUpstream = (msg) => up.stdin.write(JSON.stringify(msg) + '\n');

// Requests we rewrite on the way back (tools/list) are tracked by id.
const rewriteToolsList = new Set();

function reject(id, text) {
  send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: true } });
}

function handleClientMessage(msg) {
  if (msg.method === 'tools/list' && msg.id !== undefined) { rewriteToolsList.add(msg.id); toUpstream(msg); return; }
  if (msg.method === 'tools/call' && msg.id !== undefined) {
    const name = msg.params && msg.params.name;
    const args = (msg.params && msg.params.arguments) || {};
    const upstreamName = EXPOSED_TO_UPSTREAM[name];
    if (!upstreamName) {
      log({ event: 'rejected', tool: name, reason: 'TOOL_NOT_EXPOSED' });
      reject(msg.id, 'REJECTED_BY_SAFE_BROWSER_WRAPPER [TOOL_NOT_EXPOSED]: "' + name + '" is not exposed to QA workers. Available: ' + Object.values(EXPOSED).join(', '));
      return;
    }
    // Every URL-bearing argument is validated, whatever the tool (navigate, tabs, future additions).
    for (const [k, v] of Object.entries(args)) {
      if (/^(url|href)$/i.test(k)) {
        const why = urlRefusal(v);
        if (why) {
          log({ event: 'rejected', tool: name, reason: 'NAVIGATION_REFUSED', url: String(v).slice(0, 200), why });
          reject(msg.id, 'REJECTED_BY_SAFE_BROWSER_WRAPPER [NAVIGATION_REFUSED]: ' + why + '. Only https:// URLs on ' + [...ALLOWED_HOSTS].join(' / ') + ' are reachable. Attempted: ' + String(v).slice(0, 200));
          return;
        }
      }
    }
    log({ event: 'forwarded', tool: name, upstream: upstreamName, url: typeof args.url === 'string' ? args.url.slice(0, 200) : undefined });
    toUpstream({ ...msg, params: { ...msg.params, name: upstreamName } });
    return;
  }
  toUpstream(msg);
}

function handleUpstreamMessage(msg) {
  if (msg.id !== undefined && rewriteToolsList.has(msg.id) && msg.result && Array.isArray(msg.result.tools)) {
    rewriteToolsList.delete(msg.id);
    const tools = [];
    for (const t of msg.result.tools) {
      const exposed = EXPOSED[t.name];
      if (!exposed) continue;
      tools.push(exposed === t.name ? t : {
        ...t, name: exposed,
        description: 'Navigate to an https:// URL on ' + [...ALLOWED_HOSTS].join(' or ') + ' only. Any other scheme or host is rejected by the QA safe-browser wrapper before the browser sees it. ' + (t.description || ''),
      });
    }
    log({ event: 'tools_list', upstream_count: msg.result.tools.length, exposed: tools.map((t) => t.name) });
    send({ ...msg, result: { ...msg.result, tools } });
    return;
  }
  send(msg);
}

function lineReader(stream, onMessage) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      onMessage(msg);
    }
  });
}

lineReader(process.stdin, handleClientMessage);
lineReader(up.stdout, handleUpstreamMessage);
process.stdin.on('end', () => { try { up.stdin.end(); } catch {} setTimeout(() => process.exit(0), 200); });
log({ event: 'start', upstream_version: UPSTREAM_VERSION, allowed_hosts: [...ALLOWED_HOSTS], network_hosts: [...NETWORK_HOSTS], storage_state: STORAGE_STATE ? 'set' : 'none' });

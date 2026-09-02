// Network, repository and deployed-build probes.
//
// Every probe here is BOUNDED and non-fatal. The supervisor must survive a flaky office
// connection, an expired CLI token and a detached HEAD without stopping QA or - worse -
// recording a product capability as FAIL because the network was down. Network loss is an
// environment condition, never a test result.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, P, QA_BRANCH } from './paths.mjs';

const pexec = promisify(execFile);

async function run(cmd, args, { timeout = 30_000, cwd = REPO_ROOT } = {}) {
  try {
    const { stdout } = await pexec(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return { ok: true, out: stdout.trim() };
  } catch (err) {
    return { ok: false, out: (err.stdout || '').trim(), err: (err.stderr || err.message || '').trim() };
  }
}

const ENDPOINTS = [
  ['github', 'https://api.github.com/'],
  ['supabase', 'https://pvphxgrtdfrudejjhzjk.supabase.co/auth/v1/health'],
  ['app', 'https://brain.open-spot.ai/'],
];

export async function checkNetwork() {
  const checks = {};
  await Promise.all(ENDPOINTS.map(async ([name, url]) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10_000);
    try {
      const res = await fetch(url, { method: 'GET', signal: ac.signal, redirect: 'manual' });
      checks[name] = { ok: true, status: res.status };
    } catch (e) {
      checks[name] = { ok: false, error: String(e.name === 'AbortError' ? 'timeout' : e.message).slice(0, 120) };
    } finally { clearTimeout(t); }
  }));
  // Any one reachable endpoint means we have internet. Requiring all three would let a single
  // service's outage masquerade as "no network" and idle the whole node.
  const ok = Object.values(checks).some((c) => c.ok);
  return { ok, checks };
}

export async function repoState() {
  const fetched = await run('git', ['fetch', '--quiet', 'origin'], { timeout: 90_000 });
  const master = await run('git', ['rev-parse', 'origin/master']);
  const qaRemote = await run('git', ['rev-parse', 'origin/' + QA_BRANCH]);
  const local = await run('git', ['rev-parse', 'HEAD']);
  const branch = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = await run('git', ['status', '--porcelain']);
  return {
    fetch_ok: fetched.ok,
    fetch_error: fetched.ok ? null : (fetched.err || '').slice(0, 300),
    origin_master_sha: master.ok ? master.out : null,
    origin_qa_sha: qaRemote.ok ? qaRemote.out : null,
    local_head_sha: local.ok ? local.out : null,
    branch: branch.ok ? branch.out : null,
    // Only QA-owned paths count as dirty for the supervisor's purposes; untracked scratch from
    // other tracks in this repo is not the supervisor's business to police.
    dirty_qa_files: (dirty.out || '').split(/\r?\n/).filter((l) => /\s(qa\/)/.test(l)).length,
  };
}

// The Supabase CLI is NOT a PATH binary on this Work PC - it resolves only through npx
// (verified 2026-09-01: `Get-Command supabase` finds nothing, `npx supabase --version` returns
// 2.116.0). A supervisor calling a bare `supabase` would fail every probe silently and fall
// back to the recorded build forever, which is exactly the stale-provenance trap CLAUDE.md #1
// warns about. So the invoker is resolved explicitly.
// Two further Windows/Node specifics, both found by running this rather than reasoning about it:
//  - Node 24 refuses to execFile a .cmd shim (spawn EINVAL, the batch-argument-injection
//    hardening), so `npx.cmd` cannot be invoked directly.
//  - npx has already unpacked a real supabase.exe into its cache. Using that is both faster and
//    immune to the .cmd problem, with `cmd.exe /c npx` kept as the fallback for a pruned cache.
function resolveSupabase() {
  if (process.env.QA_SUPABASE_BIN && existsSync(process.env.QA_SUPABASE_BIN)) {
    return { cmd: process.env.QA_SUPABASE_BIN, pre: [], how: 'env QA_SUPABASE_BIN' };
  }
  const cacheRoot = join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  if (existsSync(cacheRoot)) {
    try {
      for (const d of readdirSync(cacheRoot)) {
        const exe = join(cacheRoot, d, 'node_modules', '@supabase', 'cli-windows-x64', 'bin', 'supabase.exe');
        if (existsSync(exe)) return { cmd: exe, pre: [], how: 'npx cache binary' };
      }
    } catch {}
  }
  return { cmd: process.env.ComSpec || 'cmd.exe', pre: ['/c', 'npx', '--yes', 'supabase@latest'], how: 'cmd.exe /c npx' };
}

const SUPABASE = resolveSupabase();
export const supabaseInvoker = SUPABASE.how;
const PROJECT_REF = 'pvphxgrtdfrudejjhzjk';

// npx re-resolves the package on every call, so the probe is cached. Re-probing every 60s poll
// would add minutes of pointless network work per hour and tell us nothing new.
let buildCache = { at: 0, value: null };
const BUILD_TTL_MS = 5 * 60_000;

/**
 * Establish what is actually DEPLOYED. Deliberately does not trust the repo: CLAUDE.md #1
 * treats local code, master and the deployed artefact as three separate things.
 */
export async function deployedBuild({ force = false } = {}) {
  if (!force && buildCache.value && Date.now() - buildCache.at < BUILD_TTL_MS) return buildCache.value;

  const out = { edge_function_version: null, edge_function_sha: null, source: null, error: null };

  const fn = await run(SUPABASE.cmd, [...SUPABASE.pre, 'functions', 'list', '--project-ref', PROJECT_REF], { timeout: 180_000 });
  if (fn.ok) {
    try {
      // Output is JSON ({"functions":[...]}), not the table an older CLI printed.
      const jsonLine = fn.out.split(/\r?\n/).find((l) => l.trim().startsWith('{'));
      const parsed = JSON.parse(jsonLine);
      const f = (parsed.functions || []).find((x) => x.slug === 'sem-ai-command');
      if (f) {
        out.edge_function_version = f.version ?? null;
        out.edge_function_sha = f.ezbr_sha256 ?? null;
        out.edge_function_status = f.status ?? null;
        out.edge_function_updated_at = f.updated_at ? new Date(f.updated_at).toISOString() : null;
        out.source = 'supabase functions list (live)';
      } else {
        out.error = 'sem-ai-command not present in functions list';
      }
    } catch (e) {
      out.error = ('could not parse functions list: ' + e.message).slice(0, 200);
    }
  } else {
    out.error = (fn.err || 'supabase CLI unavailable via npx').slice(0, 200);
  }

  if (!out.source && existsSync(P.buildUnderTest)) {
    try {
      const b = JSON.parse(readFileSync(P.buildUnderTest, 'utf8'));
      out.edge_function_version = b.edge_function_version ?? out.edge_function_version;
      out.deployed_product_sha = b.deployed_product_sha ?? null;
      // Named explicitly so a reader never mistakes a remembered value for a re-verified one.
      out.source = 'qa/BUILD_UNDER_TEST.json (FALLBACK - not independently re-verified this cycle)';
    } catch {}
  }

  buildCache = { at: Date.now(), value: out };
  return out;
}

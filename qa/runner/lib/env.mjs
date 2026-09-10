// Network, repository and deployed-build probes.
//
// Every probe here is BOUNDED and non-fatal. The supervisor must survive a flaky office
// connection and a detached HEAD without stopping QA or - worse - recording a product capability
// as FAIL because the network was down. Network loss is an environment condition, never a test
// result.
//
// Founder decision 2026-09-10 (A4): the Work PC holds NO production control-plane credential.
// `supabase functions list`, `vercel inspect` and every other authenticated CLI call have been
// REMOVED from this path. Build provenance comes only from: the Home-PC structured handoff in
// qa/BUILD_UNDER_TEST.json, product-exposed build metadata when the product ships it, and
// existing non-secret evidence. UNKNOWN stays UNKNOWN - it is not solved by installing another
// long-lived credential on the QA machine.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
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

// Kept as an exported constant so callers that log "how was supabase invoked" get an honest
// answer rather than a missing symbol.
export const supabaseInvoker = 'NONE - control-plane CLI removed from the Work-PC path (founder decision 2026-09-10, A4)';

export const PROVENANCE_SOURCES = Object.freeze({
  HOME_PC_HANDOFF: 'qa/BUILD_UNDER_TEST.json (Home-PC structured handoff; not re-verified from this seat)',
  PRODUCT_EXPOSED: 'product-exposed build metadata (not shipped yet - Home-PC item)',
});

// Product-exposed build identity does not exist today (no /api/version, no build id, no commit
// meta - see BUILD_UNDER_TEST._web_sha_note). The probe is here so that the moment the product
// ships one, this seat picks it up without a code change and without a credential.
const PRODUCT_VERSION_URL = 'https://brain.open-spot.ai/api/version';

async function productExposedBuild() {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8_000);
  try {
    const res = await fetch(PRODUCT_VERSION_URL, { signal: ac.signal, redirect: 'manual' });
    if (res.status !== 200) return { present: false, status: res.status };
    const j = await res.json().catch(() => null);
    if (!j || typeof j !== 'object') return { present: false, status: 200, error: 'non-JSON' };
    return { present: true, status: 200, web_sha: j.commit || j.sha || j.web_sha || null, raw_keys: Object.keys(j).slice(0, 10) };
  } catch (e) {
    return { present: false, error: String(e.name === 'AbortError' ? 'timeout' : e.message).slice(0, 120) };
  } finally { clearTimeout(t); }
}

let buildCache = { at: 0, value: null };
const BUILD_TTL_MS = 5 * 60_000;

/**
 * Establish what is DEPLOYED, from credential-free sources only. Deliberately does not trust the
 * repo: CLAUDE.md #1 treats local code, master and the deployed artefact as three separate things.
 * Every field says where it came from; nothing here is "live-verified" unless the product itself
 * exposed it.
 */
export async function deployedBuild({ force = false } = {}) {
  if (!force && buildCache.value && Date.now() - buildCache.at < BUILD_TTL_MS) return buildCache.value;

  const out = {
    edge_function_version: null, edge_function_sha: null, deployed_product_sha: null, web_sha: 'UNKNOWN',
    source: null, provenance_sources: [], error: null,
    control_plane_credential: 'ABSENT_BY_POLICY',
  };

  if (existsSync(P.buildUnderTest)) {
    try {
      const b = JSON.parse(readFileSync(P.buildUnderTest, 'utf8'));
      out.edge_function_version = b.edge_function_version ?? null;
      out.edge_function_sha = b.edge_function_sha ?? null;
      out.edge_function_status = b.edge_function_status ?? null;
      out.edge_function_updated_at = b.edge_function_updated_at ?? null;
      out.deployed_product_sha = b.deployed_product_sha ?? null;
      out.web_sha = b.web_sha || 'UNKNOWN';
      out.evidence_label_required = b.evidence_label_required || null;
      out.source = PROVENANCE_SOURCES.HOME_PC_HANDOFF;
      out.provenance_sources.push('HOME_PC_HANDOFF');
    } catch (e) {
      out.error = ('could not read BUILD_UNDER_TEST.json: ' + e.message).slice(0, 200);
    }
  } else {
    out.error = 'qa/BUILD_UNDER_TEST.json absent';
  }

  const product = await productExposedBuild();
  out.product_exposed_build = product;
  if (product.present && product.web_sha) {
    out.web_sha = product.web_sha;
    out.provenance_sources.push('PRODUCT_EXPOSED');
    out.source = (out.source ? out.source + ' + ' : '') + 'product-exposed build metadata (live)';
  }

  buildCache = { at: Date.now(), value: out };
  return out;
}

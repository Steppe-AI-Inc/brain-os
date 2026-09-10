// Per-worker browser isolation for parallel QA - computed LIVE, never unlocked by a file.
//
// The founder rule is explicit: if true browser-context isolation cannot be PROVEN, parallel
// browser mutation is blocked and only non-conflicting/read-only parallel work continues.
// Never fake concurrency.
//
// Isolation here means four things at once, and a unique storageState filename proves none of
// them on its own: PROCESS (real PID), BROWSER PROFILE (own --user-data-dir), AUTH IDENTITY (own
// synthetic account created through the product's invite flow - never a copy of the founder
// session) and TENANT (own synthetic org). All workers run as one Windows user, so nothing on
// disk separates them; what separates them is that a browser worker has NO tool that can read a
// file at all (worker-policy.mjs) and the sidecar MCP process is the only thing that ever opens
// the storageState.
//
// Founder decision 2026-09-10: the founder session is NEVER exported, duplicated, copied or
// seeded into any worker. Bootstrap of a synthetic identity is a founder/Home-PC action through
// the real invite + OTP path; the Work PC holds no mailbox, no cookies, no Auth Admin key.
// An expired synthetic session is BLOCKED_QA_AUTH, not a reason to reach for the founder's.
//
// `browserIsolationVerified` is derived every time it is asked for, from the live machine,
// runner code, tool policy, MCP version and identity set. A proof record from an earlier pilot is
// history: it is honoured only while its binding hash still equals the one computed now.
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { RUNNER_DIR, REPO_ROOT } from './paths.mjs';
import { workerDir } from './worker-lease.mjs';
import { POLICIES, policyHash, PLAYWRIGHT_MCP_VERSION, BROWSER_QA_ALLOW, BROWSER_QA_DENY } from './worker-policy.mjs';

export const AUTH_DIR = join(RUNNER_DIR, '.auth');
export const PROOF_PATH = join(RUNNER_DIR, 'BROWSER_ISOLATION_PROOF.json');

export const APP_ORIGIN = 'https://brain.open-spot.ai';
export const SUPABASE_ORIGIN = 'https://pvphxgrtdfrudejjhzjk.supabase.co';
export const DEFAULT_ALLOWED_ORIGINS = [APP_ORIGIN, SUPABASE_ORIGIN];

const FOUNDER_RE = /founder|holding[_-]?admin|hr[_-]?finance|super[_-]?admin|default|owner/i;
const IDENTITY_RE = /^qa-[a-z0-9][a-z0-9-]{1,40}$/;

export class FounderIdentityRefused extends Error {
  constructor(id) { super('FOUNDER_IDENTITY_REFUSED: ' + id + ' - the founder session is never exported, copied or seeded into a worker'); this.code = 'FOUNDER_IDENTITY_REFUSED'; }
}

/** Validate an identity id. Founder-shaped ids throw; malformed ids throw. */
export function assertSyntheticIdentity(identityId) {
  const id = String(identityId || '');
  if (!id) throw new Error('IDENTITY_REQUIRED');
  if (FOUNDER_RE.test(id)) throw new FounderIdentityRefused(id);
  if (!IDENTITY_RE.test(id)) throw new Error('IDENTITY_ID_MALFORMED: ' + id + ' (expected qa-<slug>)');
  return id;
}

/** Path of a synthetic identity's storageState. Never the founder's; never read by this module. */
export function storageStatePathFor(identityId) {
  return join(AUTH_DIR, assertSyntheticIdentity(identityId) + '.json');
}

/** Presence only. Contents are never opened here - the sidecar process is the only reader. */
export function identityStatus(identityId) {
  try {
    const path = storageStatePathFor(identityId);
    return { identity_id: identityId, present: existsSync(path), path };
  } catch (e) {
    return { identity_id: identityId, present: false, refused: e.code || 'INVALID_IDENTITY', error: e.message };
  }
}

/**
 * Per-worker Playwright MCP sidecar config. Version-pinned; isolated; own profile; the worker's
 * own synthetic identity; origins confined to the product. Throws rather than degrade on any
 * founder-shaped identity.
 */
export function writeSidecarConfig(campaignId, workerId, { identityId, allowedOrigins = DEFAULT_ALLOWED_ORIGINS } = {}) {
  const id = assertSyntheticIdentity(identityId);
  const storageState = storageStatePathFor(id);
  if (!existsSync(storageState)) {
    const err = new Error('BLOCKED_QA_AUTH: no bootstrapped session for ' + id + ' (founder/Home-PC bootstrap via the product invite + OTP path required)');
    err.code = 'BLOCKED_QA_AUTH'; throw err;
  }
  const wd = workerDir(campaignId, workerId);
  mkdirSync(wd, { recursive: true });

  // @playwright/mcp 0.0.80 refuses --user-data-dir together with --isolated ("Browser userDataDir
  // is not supported in isolated mode" - found by the Phase A real probe, 2026-09-10). --isolated
  // is the stronger choice: the profile lives only in the sidecar process's memory, seeded from
  // the worker's own storageState, and nothing is written to disk that another worker could read.
  // Profile identity for the isolation binding is therefore the worker's run directory.
  const args = [
    '@playwright/mcp@' + PLAYWRIGHT_MCP_VERSION,
    '--isolated',
    '--storage-state', storageState,
    '--allowed-origins', allowedOrigins.join(';'),
  ];
  const cfg = {
    _doc: 'Sidecar Playwright MCP for parallel QA worker ' + workerId + ' as synthetic identity ' + id
      + '. Pinned version, in-memory isolated profile (--isolated), own storageState, origins confined to '
      + 'the product. The worker model has no file tool and cannot read this file or the storageState it names.',
    _identity: id,
    _mcp_version: PLAYWRIGHT_MCP_VERSION,
    mcpServers: { playwright: { type: 'stdio', command: 'npx', args, env: {} } },
  };
  const path = join(wd, 'mcp-servers.json');
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
  return { path, profileDir: wd, profileMode: 'in-memory-isolated', identityId: id, storageStatePath: storageState, allowedOrigins };
}

/**
 * Is THIS SET of browser items isolated from each other and from the founder? Per item: a
 * present, non-founder, unique identity; a unique profile; a present, unique org scope; policy
 * BROWSER_QA. Unknown → false with a per-item reason.
 */
export function verifyBrowserIsolation(items = []) {
  const browserItems = items.filter((i) => i && i.requires_browser);
  const reasons = [];
  const seenId = new Map(), seenOrg = new Map(), seenProfile = new Map();
  for (const it of browserItems) {
    const key = it.scenario_id || it.id || '?';
    const idst = identityStatus(it.identity_id);
    if (idst.refused) { reasons.push({ item: key, reason: idst.refused }); continue; }
    if (!idst.present) { reasons.push({ item: key, reason: 'BLOCKED_QA_AUTH', identity: it.identity_id }); continue; }
    if (seenId.has(it.identity_id)) { reasons.push({ item: key, reason: 'SHARED_IDENTITY', with: seenId.get(it.identity_id) }); continue; }
    seenId.set(it.identity_id, key);
    if (!it.org_scope) { reasons.push({ item: key, reason: 'ORG_SCOPE_UNKNOWN' }); continue; }
    if (seenOrg.has(it.org_scope)) { reasons.push({ item: key, reason: 'SHARED_ORG', with: seenOrg.get(it.org_scope) }); continue; }
    seenOrg.set(it.org_scope, key);
    // --isolated keeps the profile in the sidecar's memory; its identity is the worker run dir.
    const profile = it.profile_dir || (it.worker_id && it.campaign_id ? workerDir(it.campaign_id, it.worker_id) : null);
    if (!profile) { reasons.push({ item: key, reason: 'PROFILE_UNKNOWN' }); continue; }
    if (seenProfile.has(profile)) { reasons.push({ item: key, reason: 'SHARED_PROFILE', with: seenProfile.get(profile) }); continue; }
    seenProfile.set(profile, key);
    if ((it.worker_class || 'BROWSER_QA') !== 'BROWSER_QA') { reasons.push({ item: key, reason: 'WRONG_WORKER_CLASS' }); continue; }
  }
  return { verified: browserItems.length > 0 && reasons.length === 0, browser_item_count: browserItems.length, reasons };
}

const BOUND_FILES = ['orchestrator.mjs', 'browser-isolation.mjs', 'lanes.mjs', 'worker-policy.mjs', 'config.mjs', 'source-worktree.mjs'];

function runnerSha() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true }).trim(); } catch { return 'UNKNOWN'; }
}
function codeHash() {
  const h = createHash('sha256');
  for (const f of BOUND_FILES) { try { h.update(f + '\n' + readFileSync(join(RUNNER_DIR, 'lib', f), 'utf8') + '\n'); } catch { h.update(f + '\nMISSING\n'); } }
  return h.digest('hex');
}

/**
 * Everything the proof is bound to. Identities are named, never their contents; the hash of a
 * storageState would itself be derived from a secret and must not enter git.
 */
export function computeIsolationBinding({ identities = [], orgScopes = [], profilePaths = [], timestamp = null } = {}) {
  const facts = {
    machine: hostname() + '/' + (safeUser()),
    runner_sha: runnerSha(),
    code_hash: codeHash(),
    mcp_version: PLAYWRIGHT_MCP_VERSION,
    allow: [...BROWSER_QA_ALLOW].sort(),
    deny: [...BROWSER_QA_DENY].sort(),
    policy_hash: policyHash(POLICIES.BROWSER_QA),
    identities: [...identities].sort(),
    org_scopes: [...orgScopes].sort(),
    profile_paths: [...profilePaths].map((p) => resolve(p)).sort(),
    proof_timestamp: timestamp,
  };
  const binding_hash = createHash('sha256').update(JSON.stringify(facts)).digest('hex');
  return { binding_hash, facts: { ...facts, allow_count: facts.allow.length, deny_count: facts.deny.length } };
}
function safeUser() { try { return userInfo().username; } catch { return 'unknown'; } }

export function readProofRecord() {
  try { return JSON.parse(readFileSync(PROOF_PATH, 'utf8')); } catch { return null; }
}

/**
 * The live answer. True only when: the items are isolated now, a proof record exists, every
 * negative axis in it PASSED, and its binding hash equals the hash computed from the machine,
 * code, policy and identity set right now. Any drift → false, with the reason.
 */
export function browserIsolationVerified(items = []) {
  const live = verifyBrowserIsolation(items);
  if (!live.verified) return { verified: false, reason: live.browser_item_count ? 'ITEMS_NOT_ISOLATED' : 'NO_BROWSER_ITEMS', detail: live };
  const proof = readProofRecord();
  if (!proof) return { verified: false, reason: 'NO_ISOLATION_PROOF_RECORD', detail: live };
  const axes = proof.negative_axes || {};
  const failedAxes = Object.entries(axes).filter(([, v]) => v !== 'PASS').map(([k]) => k);
  if (!Object.keys(axes).length || failedAxes.length) return { verified: false, reason: 'NEGATIVE_AXES_NOT_ALL_PASS', failed_axes: failedAxes };
  const ids = items.filter((i) => i.requires_browser).map((i) => i.identity_id);
  const orgs = items.filter((i) => i.requires_browser).map((i) => i.org_scope);
  const profiles = items.filter((i) => i.requires_browser).map((i) => i.profile_dir || workerDir(i.campaign_id, i.worker_id));
  const now = computeIsolationBinding({ identities: ids, orgScopes: orgs, profilePaths: profiles, timestamp: proof.proof_timestamp || null });
  if (now.binding_hash !== proof.binding_hash) return { verified: false, reason: 'BINDING_DRIFT', expected: proof.binding_hash, computed: now.binding_hash };
  return { verified: true, reason: 'LIVE_BINDING_MATCHES_PROOF', binding_hash: now.binding_hash };
}

/**
 * Scheduling context for lanes.mjs. Re-derived per batch: a synthetic session can expire, the
 * code can change, an MCP upgrade can land - all of which must drop the answer to false.
 */
export function schedulingContext(items = []) {
  const v = browserIsolationVerified(items);
  return { browserIsolationVerified: v.verified === true, browserIsolation: v };
}

/** Human-readable status for SUPERVISOR_STATE - no secrets, no paths to secrets' contents. */
export function isolationStatusSummary() {
  const proof = readProofRecord();
  return {
    browser_isolation_verified: false,
    reason: proof ? 'PROOF_RECORD_PRESENT_BUT_VERIFICATION_IS_PER_BATCH' : 'NO_ISOLATION_PROOF_RECORD',
    detail: 'Isolation = PROCESS + BROWSER PROFILE + AUTH IDENTITY + TENANT, computed live per batch against '
      + 'a binding hash (machine, runner SHA, code hash, @playwright/mcp ' + PLAYWRIGHT_MCP_VERSION + ', exact '
      + 'tool allow/deny lists, identity ids, org scopes, per-worker in-memory profile identities). The founder session is never '
      + 'exported or seeded. Synthetic identities are bootstrapped by the founder/Home PC through the '
      + 'product invite + OTP path; an expired one is BLOCKED_QA_AUTH.',
    consequence: 'Parallel BROWSER work is BLOCKED until Phase D positive+negative acceptance writes a proof whose binding matches live.',
    mcp_version: PLAYWRIGHT_MCP_VERSION,
    policy_hash: policyHash(POLICIES.BROWSER_QA),
  };
}

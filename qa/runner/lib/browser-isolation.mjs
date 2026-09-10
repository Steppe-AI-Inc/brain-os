// Per-worker browser isolation for parallel QA.
//
// The founder rule is explicit: if true browser-context isolation cannot be PROVEN, parallel
// browser mutation is blocked and only non-conflicting/read-only parallel work continues.
// Never fake concurrency. So isolation is a COMPUTED FACT here, not a configuration wish -
// `proveBrowserIsolation()` returns false with a reason unless the preconditions actually hold.
//
// Why this matters concretely: two workers sharing one Chrome profile share the org selector,
// the active route, the current chat channel and the login context. Worker A switching orgs
// would silently change what Worker B is looking at, and B would then report a scoping defect
// that A caused. That is a fabricated bug - the worst possible output of a QA system.
//
// The mechanism exists in @playwright/mcp (verified 2026-09-10 against --help):
//   --isolated              keep the browser profile in memory
//   --user-data-dir <path>  separate on-disk profile per worker
//   --storage-state <path>  seed an isolated session with saved auth
//
// The blocker is auth, not isolation: an isolated context starts logged OUT, and Brain OS QA is
// almost entirely authenticated surface. Without an exported storageState, an isolated worker
// can reach the login page and nothing else.
import { writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RUNNER_DIR } from './paths.mjs';
import { workerDir } from './worker-lease.mjs';

// Deliberately outside the repo tree and gitignored by location: a storageState file contains
// live session cookies. It must never be committed, logged, or copied into evidence.
export const STORAGE_STATE_PATH = join(RUNNER_DIR, '.auth', 'founder-storage-state.json');

export function storageStateStatus() {
  if (!existsSync(STORAGE_STATE_PATH)) {
    return { present: false, reason: 'NO_STORAGE_STATE_EXPORT', path: STORAGE_STATE_PATH };
  }
  try {
    const st = statSync(STORAGE_STATE_PATH);
    const ageMs = Date.now() - st.mtimeMs;
    return { present: true, path: STORAGE_STATE_PATH, age_ms: ageMs, size: st.size };
  } catch (e) {
    return { present: false, reason: 'UNREADABLE_STORAGE_STATE', detail: String(e.message).slice(0, 160) };
  }
}

/**
 * Per-worker MCP config: its own in-memory profile, its own user-data-dir, seeded with the
 * exported founder session so it is isolated AND authenticated.
 */
export function writeWorkerMcpConfig(campaignId, workerId) {
  const wd = workerDir(campaignId, workerId);
  const profileDir = join(wd, '.browser-profile');
  mkdirSync(profileDir, { recursive: true });

  const args = ['@playwright/mcp@latest', '--isolated', '--user-data-dir', profileDir];
  const ss = storageStateStatus();
  if (ss.present) args.push('--storage-state', STORAGE_STATE_PATH);

  const cfg = {
    _doc: 'Per-worker Playwright MCP config for parallel QA worker ' + workerId + '. Isolated profile so '
      + 'one worker cannot change another worker org selector, route, channel or login context.',
    _authenticated: ss.present,
    mcpServers: { playwright: { type: 'stdio', command: 'npx', args, env: {} } },
  };
  const path = join(wd, 'mcp-servers.json');
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
  return { path, profileDir, authenticated: ss.present };
}

/**
 * Can parallel workers each hold an independent, authenticated browser?
 *
 * Returns proven:false with an actionable reason rather than throwing, because the correct
 * response is to degrade to non-browser parallel work - not to stop the campaign.
 */
export function proveBrowserIsolation() {
  const ss = storageStateStatus();
  if (!ss.present) {
    return {
      proven: false,
      reason: 'AUTHENTICATED_ISOLATION_NOT_ACHIEVABLE',
      detail: 'Isolation flags exist (--isolated / --user-data-dir / --storage-state, verified against '
        + '@playwright/mcp --help on 2026-09-10), but no exported storageState is present at '
        + STORAGE_STATE_PATH + '. An isolated browser context therefore starts LOGGED OUT, and almost '
        + 'every Brain OS QA surface is authenticated. Sharing the one authenticated profile instead '
        + 'would let one worker change another worker org selector, route or channel - which manufactures '
        + 'false defects.',
      consequence: 'Parallel BROWSER work is BLOCKED. Non-browser parallel work proceeds normally.',
      unblock: 'One-time: export the authenticated founder session to ' + STORAGE_STATE_PATH
        + ' (gitignored). Work PC cannot produce it from the MCP tool surface - httpOnly session cookies '
        + 'are not readable via browser_evaluate - so this needs a founder/Home-PC action or a Playwright '
        + 'script run with a real browser context.',
      storage_state: ss,
    };
  }
  return {
    proven: true,
    reason: 'ISOLATED_AUTHENTICATED_PROFILES_AVAILABLE',
    detail: 'Each worker receives --isolated with its own --user-data-dir, seeded from an exported '
      + 'storageState. Org selector, route, channel and login context are per-worker.',
    storage_state: { present: true, age_ms: ss.age_ms },
  };
}

/**
 * Scheduling context for lanes.mjs. Kept as a function so the decision is re-derived every batch
 * rather than cached at boot - a storageState could appear (or expire) mid-campaign.
 */
export function schedulingContext() {
  const p = proveBrowserIsolation();
  return { browserIsolationProven: p.proven, browserIsolation: p };
}

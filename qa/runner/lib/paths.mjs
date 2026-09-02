// Path resolution for the Work-PC autonomous QA supervisor.
// Everything is derived from this file's own location so the supervisor works
// regardless of the cwd it is launched from (Task Scheduler does not guarantee one).
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const RUNNER_DIR = resolve(here, '..');
export const REPO_ROOT = resolve(here, '..', '..', '..');
export const QA_DIR = join(REPO_ROOT, 'qa');

// The Playwright MCP server is registered against the PARENT directory in the user's
// Claude config, not against the repo. A director launched with cwd=REPO_ROOT would
// therefore start with no browser at all - and would happily report "UI verified"
// having tested nothing. The launcher uses this as cwd and --add-dir's the repo.
export const DIRECTOR_CWD = resolve(REPO_ROOT, '..');

export const P = {
  supervisorState: join(RUNNER_DIR, 'SUPERVISOR_STATE.json'),
  bootDoc:         join(RUNNER_DIR, 'QA_DIRECTOR_BOOT.md'),
  lease:           join(RUNNER_DIR, '.supervisor.lock'),
  logsDir:         join(RUNNER_DIR, 'logs'),
  mcpConfig:       join(RUNNER_DIR, 'mcp-servers.json'),
  guardSettings:   join(RUNNER_DIR, 'qa-director-settings.json'),
  computeCoverage: join(RUNNER_DIR, 'compute-coverage.mjs'),

  bugQueue:        join(QA_DIR, 'BUG_QUEUE.json'),
  capabilities:    join(QA_DIR, 'CAPABILITY_INVENTORY.json'),
  coverage:        join(QA_DIR, 'COVERAGE_LEDGER.json'),
  handoff:         join(QA_DIR, 'HANDOFF_STATE.json'),
  buildUnderTest:  join(QA_DIR, 'BUILD_UNDER_TEST.json'),
  fixesDir:        join(QA_DIR, 'home-pc-handoff', 'fixes'),
};

export const QA_BRANCH = 'qa/work-pc';

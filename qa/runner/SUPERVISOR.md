# Work-PC Autonomous QA Supervisor

**The contract: turn on the Work PC → do nothing → QA continues.**

The founder never types "continue". A Fable invocation ending is a *worker lifecycle event*,
not a statement that the QA program is complete — the supervisor re-consults the scheduler and
launches the next invocation for as long as unfinished work exists (and by design, exploratory
QA means work always exists).

## Processes

```
Windows Task Scheduler (logon + 30-min self-heal sweep)
  └─ start-supervisor.cmd
       └─ node supervisor.mjs            ← singleton (lease-guarded), state machine
            └─ claude -p --model fable   ← QA Director, launched per shift
                 └─ Playwright MCP browser, SQL probes, evidence commits
```

## Files

| File | Role |
|---|---|
| `supervisor.mjs` | Long-running state machine. `--once` one cycle, `--dry-run` no director launch. |
| `lib/paths.mjs` | All path resolution (repo root, director cwd, state files). |
| `lib/state.mjs` | Atomic read/write of `SUPERVISOR_STATE.json`; corrupt state is preserved, not crashed on. |
| `lib/lease.mjs` | Exclusive leadership. TTL 90s; takeover only on dead PID or stale lease, always logged. |
| `lib/scheduler.mjs` | Priority order: retests by severity → EXPECTED_FAIL-on-CLOSED reconciliation → campaign queue → orphan FAIL/FLAKY → NOT_TESTED (high-risk first) → exploratory. No idle branch exists. |
| `lib/director.mjs` | Programmatic Fable launcher. Asserts `claude-fable-5` actually ran; watches stream output as heartbeat; kills the process tree on hang or hard cap. |
| `lib/config.mjs` | Regenerates `mcp-servers.json` + `qa-director-settings.json` on every boot (absolute paths must never go stale silently). |
| `lib/env.mjs` | Bounded probes: network, git, deployed build (`supabase functions list` via the npx-cached exe). |
| `hooks/block-destructive.mjs` | PreToolUse guard — the *real* technical barrier from CLAUDE.md §22. 13-case behavioural test on record. |
| `CAMPAIGN_QUEUE.json` | Named suites the coverage ledger can't express (50/100/200-turn runs etc.). |
| `autonomy-acceptance.mjs` | Acceptance tests C, D, E, F, G; writes `AUTONOMY_ACCEPTANCE.json`. |
| `install-autostart.ps1` | Task Scheduler registration (install / `-Verify` / `-Uninstall`). |

## Machine facts this build depends on (probed, not assumed)

- `claude -p --model fable` resolves to **`claude-fable-5`** (asserted per run from the result envelope).
- Playwright MCP is registered against the **parent** directory in the user config, not the repo —
  so the launcher runs the director from the parent dir **and** passes `--mcp-config` explicitly,
  and the init frame is checked for `mcp__playwright__*` before browser work is trusted.
- The Supabase CLI is **not on PATH**; it resolves via the npx cache
  (`…\npm-cache\_npx\…\supabase.exe`), with `cmd.exe /c npx` as fallback. Node 24 refuses to
  spawn `.cmd` shims directly (EINVAL hardening).
- `supabase functions list` outputs **JSON**, and is the authoritative deployed-build probe
  (version + `ezbr_sha256`).

## Safety model (honest scope)

The director runs `--permission-mode bypassPermissions` — required for unattended operation —
inside two technical barriers: a `permissions.deny` list and the PreToolUse hook, which blocks
production DB migrations, product deploys, pushes to master/main, force-pushes, and destructive
SQL without `rollback`. This guards against an autonomous agent's *mistake*; it is not an
adversarial sandbox, and it fails open (loudly, into `logs/guard.log`) rather than wedging all
work on an unexpected payload. Credential-level containment remains a founder decision.

Failure behaviour: network loss → `WAITING_FOR_NETWORK` + bounded backoff, never a FAIL verdict;
auth loss → `BLOCKED_CLAUDE_AUTH`, retried on backoff, auto-resumes once login works; abnormal
director exit → `RECOVERING`, with the next director instructed to re-read fixture/DB state
before repeating any mutation; retry ceiling → `PAUSED_RESOURCE_LIMIT` with work left QUEUED,
never PASS. Uncommitted `qa/` evidence left by a dead director is swept into a supervisor
checkpoint commit — on `qa/work-pc` only, never another branch.

## Operations

```powershell
# install / verify / remove auto-start (founder-gated; see below)
powershell -ExecutionPolicy Bypass -File qa\runner\install-autostart.ps1
powershell -ExecutionPolicy Bypass -File qa\runner\install-autostart.ps1 -Verify
powershell -ExecutionPolicy Bypass -File qa\runner\install-autostart.ps1 -Uninstall

# run manually (foreground)
node qa\runner\supervisor.mjs
# one observation cycle without launching a director
node qa\runner\supervisor.mjs --once --dry-run
# acceptance suite
node qa\runner\autonomy-acceptance.mjs
```

Observability: `SUPERVISOR_STATE.json` (live state + heartbeat), `logs/supervisor.log`
(transitions), `logs/director-*.jsonl` (full stream of every shift), `logs/guard.log` (denials).

## Acceptance status

C, D, E, F, G: **PASS** (see `AUTONOMY_ACCEPTANCE.json`). A and H are exercised against the
live supervisor and recorded there. B (reboot) is **NOT_EXECUTED**: the scheduled-task
registration was refused by the session's permission layer — installing a logon-persistent
autonomous agent is a machine-level change the founder performs once:

```
powershell -ExecutionPolicy Bypass -File qa\runner\install-autostart.ps1
```

Until B passes, the platform classification is **PARTIALLY VERIFIED**, not
FULLY AUTONOMOUS WORK-PC QA NODE — per the founder's own definition of done.

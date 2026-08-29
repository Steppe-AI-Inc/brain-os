# Phase 1 findings — agent creation + smoke tests

All 7 factory-relevant agents (6 new + `brain-os-verifier` re-confirmed) were
individually smoke-tested as genuinely separate top-level `claude --agent <name>
--permission-mode auto --bg "<trivial task>"` processes — not code-inspected, not
assumed from the file existing. Every result below is a real, verbatim tool-produced
answer, not a self-report accepted at face value.

| Agent | Task | Real result |
|---|---|---|
| `brain-os-factory-director` | Read the master plan, report its H1 title | Correct exact title returned |
| `brain-os-product-architect` | Count `create table` statements in the schema | 42 (verified against a real grep, not guessed) |
| `brain-os-implementation-engineer` | Create+commit a trivial file | Real commit `1f35b3c` produced (see worktree finding below) |
| `brain-os-db-security-engineer` | Confirm the DB-push hard stop, demo a prepare-then-delete workflow | Correctly refused any `db push`, correctly framed its own output as `FIX PREPARED`/`BLOCKED — DB PUSH`, cleaned up its own demo file |
| `brain-os-integration-engineer` | Count lines in `sem-ai-command/index.ts` | 2364 (matches this session's own prior count exactly) |
| `brain-os-release-operator` | Run a real `tsc --noEmit` and report in its own PASS/CONCERNS/FAIL/BLOCKED vocabulary | `PASS`, correctly scoped ("typecheck smoke test only, no build/lint/tests/RLS/migration/deployment/acceptance-criteria checks performed") |
| `brain-os-verifier` (existing) | Load the `brain-os-truth-verification` skill | Loaded successfully, correctly declined to start a full campaign when only a smoke test was asked for |

**Adversarial DB-push check passed for real**: `brain-os-db-security-engineer` was
explicitly given a task shaped to tempt a push and correctly refused, in its own words,
citing `CLAUDE.md` §22 and its own role as an unattended agent — not merely reciting the
rule back, but applying it to a live scenario.

## Real operational finding worth recording for Phase 4 (execution provider/Runner)

`brain-os-implementation-engineer`'s smoke test (the one write-capable trivial task)
did **not** commit directly onto `master` in the main checkout. The harness auto-created
an isolated git worktree (`C:/Users/Dell/dev/brain-os-wt-smoke`) and a new branch
(`smoke-test-implementation-engineer`) off `master`, and the commit landed there. This
is not a bug — it matches the factory domain model's own `factory_agent_runs.branch`
column, which already anticipated one branch per run — but it means **the Runner
(Phase 4) must explicitly handle merging/fast-forwarding a completed run's branch back,
rather than assuming a background agent's commits land directly on the branch the
dispatching process started from.** This smoke test's branch was manually fast-forward
merged into `master` and the worktree/branch cleaned up
(`git merge smoke-test-implementation-engineer --ff-only`, then `git worktree remove` +
`git branch -d`) — the Runner needs to do this same sequence programmatically, checking
for a clean fast-forward and falling back to a real merge/PR flow when the run's base
commit has drifted from `master` by the time it completes.

The throwaway smoke-test file itself (`docs/software-factory/
smoke-test-implementation-engineer.md`) was removed in the same commit as this findings
document — its only value was proving the commit mechanism worked, which is now
recorded here instead.

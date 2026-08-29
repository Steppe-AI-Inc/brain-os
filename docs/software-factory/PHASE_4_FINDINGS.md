# Phase 4 Findings — Execution Provider

Real `AgentExecutionProvider` implementation (`scripts/factory-runner/provider.mjs`),
plain Node ESM wrapping the `claude` CLI via `child_process.execFile`. Implements
`startRun/getRunStatus/getLogs/cancelRun/getArtifacts/healthCheck` per the master plan's
§G interface. Deliberately has zero dependency on `factory_work_orders` since that table
doesn't exist yet (Phase 6+ DB layer, not yet authorized/pushed) — this module can be
built and proven standalone.

## Architectural constraint

Cannot run as a Vercel serverless function. `claude --agent ... --bg` spawns a genuinely
long-running local OS process with its own git worktree, needs a persistent filesystem
and the `claude` CLI installed — none of which a serverless function provides. Must run
on a real, always-on machine (this dev machine today; a dedicated always-on host later).

## Real bug found and fixed during smoke testing

First smoke-test run (`providerRunId: ecda605d`) mechanically "succeeded" (no crashes,
real provider_run_id produced, polling completed, `cancelRun` ran clean) but the
captured log evidence showed the dispatched task still mid-generation ("Thundering…"
spinner) rather than having produced its expected output. Root cause: `startRun` called
`execFileAsync('claude', [...args including a multi-word task string...], { shell: true
})`. Node's own deprecation warning names the exact defect: *"Passing args to a child
process with shell option true can lead to security vulnerabilities, as the arguments
are not escaped, only concatenated."* The multi-word task prompt was being mangled by
shell tokenization — confirmed directly: a re-run with `shell: true` still present (a
sed-based first-pass fix missed this one call site among five) dispatched a session
whose received prompt was reduced to the single word `"Provider"`, which the agent
correctly treated as too ambiguous to act on and returned a clarifying question instead
of executing.

**Fix**: removed `shell: true` from all `execFileAsync` calls in `provider.mjs`
(`execFile` resolves `claude`/`git` via PATH without a shell wrapper on this platform;
no shell means no re-tokenization of argv, so a multi-word prompt with punctuation
passes through intact).

## Second real finding: `status` alone is not a trustworthy completion signal

The same first smoke-test run exited its polling loop as soon as `getRunStatus` reported
`status: "idle"`, after only ~2 polls (~3-6s) — but the session was still genuinely
working. `state` also never showed `"done"` the way every earlier manual Phase 1-3 smoke
test in this session consistently did once a task actually finished (the proven pattern
observed live via `claude agents --json` was `"status": "idle", "state": "done"`).
**Fix**: `test-provider.mjs`'s polling loop now waits for the actual expected output
string to appear in real log content (`getLogs(...).includes('PROVIDER TEST OK')`),
not `status`/`state` alone — the only signal proven trustworthy.

## Real, clean re-run (after both fixes)

```
healthCheck: true
startRun produced providerRunId: f17e413a
poll 0: {"status":null,"state":"working",...} sawExpectedOutput: false
poll 1: {"status":"busy","state":"working",...} sawExpectedOutput: true
--- real logs ---
❯ Provider smoke test only. Report back the exact text: PROVIDER TEST OK. Take no other action.
● PROVIDER TEST OK
✻ Brewed for 2s · done 6:14 PM
```

Full, unmangled task text reached the dispatched `brain-os-implementation-engineer`
session; it genuinely executed and produced the exact expected output; `getLogs`
captured the real completion evidence live via the provider module itself (not the raw
CLI invoked by hand). `cancelRun` (`claude stop f17e413a`) ran only after this was
confirmed, cleanly tearing down the now-finished session.

## Known limitation, honestly flagged

`getArtifacts` is explicitly best-effort (grep-scans log text for commit-hash-shaped
strings, lists current worktrees) — real artifact tracking requires the `factory_
agent_runs`/`factory_artifacts` DB layer (Phase 6+, gated on founder DB-push
authorization). Not a blocker for Phase 4's DoD (a trivial test task producing a real,
traceable `provider_run_id` with genuine completion evidence) — the trivial smoke-test
task deliberately made no commits.

## Non-blocking observation for Phase 7 (Verifier/Playwright wiring)

The dispatched session's own banner showed `⚠ 1 MCP server needs authentication · run
/mcp` (the Playwright MCP registration). Did not block or deadlock this run (unlike the
earlier `.mcp.json`-in-repo finding) since `brain-os-implementation-engineer` never
invoked it. Worth resolving before Phase 7 wires Playwright into `brain-os-verifier`
specifically — noted here so it isn't lost, not treated as urgent now.

## DoD — met

*"A manually-triggered (not yet UI-triggered) dispatch produces a real `provider_run_id`
traceable via `claude logs`, for a trivial test task."* — met via `provider_run_id
f17e413a`, independently re-checkable at any time via `claude logs f17e413a` while the
session remained alive, real completion evidence captured through the provider module's
own `getLogs` function, not a hand-run CLI command.

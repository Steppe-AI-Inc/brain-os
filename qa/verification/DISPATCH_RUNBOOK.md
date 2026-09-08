# Verifier dispatch runbook (learned the hard way, campaigns #68–#70)

How to dispatch a `brain-os-verifier` as a background CLI session so it can actually
execute its scenarios. Three campaigns paid for these lessons; do not rediscover them.

## The working invocation

```bash
claude --permission-mode acceptEdits \
  --allowedTools "Bash(node:*)" "Bash(sha256sum:*)" "Bash(git status:*)" "Bash(git log:*)" "Bash(git diff:*)" "Bash(git show:*)" "Bash(npx supabase functions list:*)" \
  --agent brain-os-verifier -p "$(cat prompt.txt)" < /dev/null
```

1. **`permissionMode: auto` in the agent's frontmatter does NOT grant Bash in `-p`
   (print) mode.** Campaigns #68 attempt 2 and #69 attempt 2 both ran static-only
   because every `node`/`npx` call was refused. The fix is explicit `--allowedTools`
   with narrow command patterns — probe-verified 2026-09-02 (`Bash(node:*)` unlocks
   node; nothing else is implicitly granted).
2. **Keep the allowlist narrow** (BACKGROUND_AGENT_EXECUTION_MODE_MUST_NOT_INHERIT_
   UNACTIONABLE_PLAN_GATE's companion rule: fix the gate, never broaden generally).
   In particular do NOT grant `Bash(npx supabase db query:*)` casually — `db query`
   executes arbitrary SQL including writes. Grant it only for campaigns that genuinely
   need live DB reads, and say so in the campaign record.
3. **Never pass `--permission-mode acceptEdits` ALONE** thinking the agent's own mode
   fills the rest in — it overrides the agent frontmatter and you get edits-only.
4. **`-p` needs the prompt after the flags and stdin redirected** (`< /dev/null`);
   otherwise: "Input must be provided either through stdin or as a prompt argument".
5. **Exit code 0 + provider error text is NOT a successful run.** "You've hit your
   session limit" with exit 0 happened three times (verifier #8 attempt 1, #9
   attempt 1, and the original incident). Classify PROVIDER_CAPACITY_BLOCKED, record
   the attempt in the campaign file's attempts[], re-dispatch after reset. The Factory
   runner's `classifyProviderOutput()` (scripts/factory-runner/provider.mjs) is the
   canonical detector; regression: provider.regression.test.mjs.
6. **Tell the verifier to checkpoint scenario-by-scenario into
   qa/verification/CURRENT_CAMPAIGN.json and to write the checkpoint FIRST if it hits
   a capacity limit** — a blocked attempt with a checkpoint resumes; one without
   restarts from zero.
7. Verifier working-tree writes stay under `qa/verification/**` (plus new suite files
   under `qa/scenarios-runner/` when the campaign explicitly allows it).

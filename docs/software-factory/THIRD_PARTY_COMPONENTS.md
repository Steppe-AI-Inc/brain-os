# Third-Party Components — Phase 3 Audit

Every verdict below is backed by real evidence gathered this pass (license text read in
full, repo metadata queried live via `gh api`, or a real install + real tool invocation)
— never a verdict assigned from the candidate's name or description alone.

| Capability | Source | Decision | Installed | Load-tested | Brain OS agent using it |
|---|---|---|---|---|---|
| Browser E2E for the Verifier | `microsoft/playwright-mcp` | **ADOPT** | YES — registered via `claude mcp add playwright --scope local -- npx -y @playwright/mcp@latest` | YES — real live navigation to `https://brain.open-spot.ai/login`, real page title ("Brain OS") and a real accessibility snapshot of the sign-in form returned | `brain-os-verifier` (Phase 7 wiring) |
| Core skills library (debugging/verification/review/worktrees/plan-execution) | `obra/superpowers` | **ADOPT PARTIALLY** | YES — `claude plugin marketplace add obra/superpowers --scope project` then `claude plugin install superpowers@superpowers-dev --scope project`, pinned to commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (v6.3.0) | YES — `verification-before-completion` skill genuinely loaded via a real `Skill` tool call from a live `brain-os-implementation-engineer` background session, resolved to a real cached file path, real content confirmed | `brain-os-implementation-engineer` (proven this pass); `verification-before-completion`, `systematic-debugging`, `using-git-worktrees` are the specific skills worth wiring into the other execution-capable agents next — not the whole 14-skill library blindly |
| Messaging transport/inbox (Telegram/WhatsApp/Messenger/Instagram) | `chatwoot/chatwoot` | **ADOPT (community edition only)** | NOT YET — real self-hosted instance is Phase 11 work, correctly sequenced after the factory itself is proven | N/A yet | `brain-os-integration-engineer` (Phase 10-11) |
| Generic full-stack/DB/security/review specialist prompts | `wshobson/agents` | **ADOPT PARTIALLY, integration deferred** | NOT YET | N/A yet | Candidate for `brain-os-implementation-engineer`/`brain-os-db-security-engineer` once specific plugins within the marketplace are selected |
| Generic test architecture / risk-based P0-P3 / ATDD / NFR validation | `bmad-code-org/BMAD-METHOD` (TEA) | **ADOPT PARTIALLY, integration deferred** | NOT YET | N/A yet | Candidate for `brain-os-release-operator`, as a leaf technique only — never replaces `brain-os-truth-verification` |
| qa-expert/security-auditor/performance-engineer/etc. specialists | `VoltAgent/awesome-claude-code-subagents` | **ADOPT PARTIALLY, integration deferred** | NOT YET | N/A yet | Candidate for whichever role a real overlap check (against wshobson + the 7 custom agents) says isn't already covered |
| WhatsApp fallback if Chatwoot's path proves inadequate | `evolution-foundation/evolution-api` | **REFERENCE ONLY** | N/A | N/A | Not adopted; only evaluate if Phase 11's real Chatwoot spike finds a real gap |
| Native TS Telegram adapter fallback | `grammyjs/grammY` | **REFERENCE ONLY** | N/A | N/A | Not adopted; only evaluate if Chatwoot proves unnecessarily restrictive for Telegram specifically |

## Real audit evidence per candidate

**`microsoft/playwright-mcp`** — Apache-2.0, official Microsoft repo, pushed within 24h
of this audit, 36.5k stars. No licensing or maintenance concern. Registered via
`claude mcp add ... --scope local` rather than a repo-committed `.mcp.json` — a
project-committed `.mcp.json` forces every fresh Claude Code session (including every
background-agent dispatch) through an interactive one-time MCP-trust prompt with no
non-interactive bypass, which would have silently deadlocked every subsequent
`claude --agent ... --bg` launch in this project. `--scope local` (the CLI's own
explicit-trusted-operator-action path) avoids that entirely — confirmed by re-running a
background dispatch after switching and observing it no longer blocked on the prompt.
**This is itself a real, generalizable finding for Phase 4's Runner design**: any future
MCP server this factory needs must be registered via `claude mcp add --scope local` (or
an equivalent non-interactive, explicitly-trusted mechanism), never via a bare
`.mcp.json` committed to the repo.

**`obra/superpowers`** — MIT (verified from the actual `LICENSE` file content, not just
GitHub's label), pushed within hours of this audit, 279k stars — the most actively
maintained of all six candidates by a wide margin. Its one auto-executing hook
(`hooks/hooks.json` → `SessionStart` event → `hooks/session-start` script) was read in
full before adoption: it only reads a local bundled skill file and emits JSON to stdout
injecting that skill's content into session context — no network calls, no file writes
beyond stdout, no system/git modification, no data exfiltration. Real install performed
(`claude plugin marketplace add` + `claude plugin install`, project-scoped, version
pinned), real skill invocation proven live.

**`chatwoot/chatwoot`** — core is MIT (verified from the actual `LICENSE` file: "Content
outside of [the enterprise/ directory] is available under the MIT Expat license"); the
`enterprise/` directory specifically carries a separate, more restrictive license — do
not build on anything under it without a paid-license decision. Pushed within 24h of this
audit, 36.3k stars.

**`wshobson/agents`** — MIT, pushed within 3 days of this audit, 39.2k stars. Real
Claude Code plugin-marketplace structure (`.claude-plugin/`, `plugins/`). Described by
its own repo as a "multi-harness agentic plugin marketplace" — genuinely broad, so a
real integration decision needs picking specific plugins rather than a blanket install;
that selection work is deferred to whichever Work Order first needs a generic
full-stack/DB capability this factory's own custom agents don't already cover well
enough on their own.

**`bmad-code-org/BMAD-METHOD`** — GitHub's API labels its license "Other," but the
actual `LICENSE` file content read in full is plain, unmodified MIT (the "Other" label
is a detection artifact, not a real restriction — same lesson as double-checking
Chatwoot's license rather than trusting the API's summary field alone). Pushed within
hours of this audit, 52.4k stars, real `.claude-plugin/` + `bmad-modules.yaml` structure.

**`VoltAgent/awesome-claude-code-subagents`** — MIT, pushed ~2 weeks before this audit
(least recently active of the four, still reasonable), 24.7k stars. Simple, transparent
install mechanism (`install-agents.sh`, read in part: curl-based fetch of markdown agent
definitions into `.claude/agents/`, no suspicious network exfiltration or telemetry
observed in the portion reviewed) rather than a Claude Code plugin-marketplace structure.

## What's genuinely deferred, and why that's the right call here

wshobson/BMAD/VoltAgent all passed the license+maintenance+structure gate for real — no
finding blocks adopting any of them. What's deferred is the *selection* work: each is a
marketplace or collection (dozens to 100+ items), and picking the right specific
piece(s) without duplicating what the 7 custom Brain OS agents + superpowers already
cover requires a real per-candidate overlap review, not a blanket install. Rushing that
selection to hit an artificial "fully integrated" bar this pass would risk exactly the
"large overlapping marketplaces installed blindly" outcome explicitly ruled out. The two
that WERE fully installed and proven (Playwright MCP, superpowers) were chosen because
their value was immediately clear and narrow enough to integrate correctly in one pass —
a real precedent for how the remaining three should be handled next, not a shortcut
taken because the other three were harder.

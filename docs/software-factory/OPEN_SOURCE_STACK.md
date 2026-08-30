# Open-Source Stack — Software Factory Component Audit

Live audit performed 2026-08-30 against each repository's current upstream state (not training
knowledge). **Governing principle**: Brain OS's own Factory Director is the single production
orchestration authority; Brain OS Postgres (`canonical_work_orders`/`tasks`/`agents`/
`agent_runs`/approvals/verification/release state) is the exclusive canonical business truth.
Every component below is a *capability* the Factory Director may invoke — none may become a
competing orchestrator or a competing source of truth for Work Order status, Task status, agent
authority, approval state, verification state, or release state. "Do not install everything":
of 11 audited components, 4 earn ADOPT AS PROVIDER, 3 earn ADOPT SKILLS ONLY, 4 are REFERENCE.
AutoGen (`microsoft/autogen`) was excluded from this audit — already decided REJECT, upstream in
maintenance mode.

## Summary table

| Component | Upstream repo | License | Decision |
|---|---|---|---|
| Durable workflow/runtime engine | temporalio/sdk-typescript | MIT | ADOPT AS PROVIDER (optional, underneath Factory Director) |
| Agent framework reference | google/adk-js | Apache-2.0 | REFERENCE |
| Tool protocol | modelcontextprotocol/typescript-sdk | Apache-2.0 / MIT | ADOPT AS PROVIDER |
| Cross-agent interop protocol | a2aproject/A2A | Apache-2.0 | REFERENCE |
| Secondary coding-agent provider | All-Hands-AI/OpenHands | MIT | ADOPT SKILLS ONLY (contained prototype only) |
| Benchmark/alternative coding provider | SWE-agent/mini-swe-agent | MIT | ADOPT AS PROVIDER |
| Engineering skills library | obra/superpowers | MIT | ADOPT SKILLS ONLY (partially adopted already) |
| Specialist prompt collection | wshobson/agents | MIT | ADOPT SKILLS ONLY (selection deferred) |
| Specialist subagent catalog | VoltAgent/awesome-claude-code-subagents | MIT | ADOPT SKILLS ONLY (lowest priority) |
| Multi-language agent framework | microsoft/agent-framework | MIT | REFERENCE |
| Graph-based multi-agent library | langchain-ai/langgraphjs | MIT | REFERENCE / bounded provider experiment only |

**Orchestration authority constraint (binding)**: none of the above ever becomes a second
orchestrator. Temporal, if adopted, is invoked *by* the Factory Director purely for crash-safe
execution — it may persist workflow checkpoints/retries, but every canonical status read/write
still goes through Brain OS's own RPCs (`create_factory_work_order`, `create_factory_task`,
`complete_agent_run`, `complete_work_order`), never through Temporal's own state. LangGraph and
Microsoft Agent Framework stay reference-only or, at most, a contained execution-provider
experiment for one bounded task — neither is a path to orchestrating the factory.

---

## 1. temporalio/sdk-typescript

- **Exact upstream URL**: https://github.com/temporalio/sdk-typescript
- **License**: MIT
- **Version/tag/commit**: v1.23.0 (2026-08-26); actively released weekly/biweekly
- **Purpose**: crash-safe replay/retry semantics for long-running Work Order execution
- **Decision**: ADOPT AS PROVIDER — optional durable-runtime engine underneath the Factory
  Director, contingent on the Phase 2 spike proving real worker-restart/no-duplicate-side-effect
  semantics
- **Installed?**: NOT YET — spike only, local dev server, no production wiring
- **Local location**: (planned) `scripts/factory-runner/temporal-spike/`
- **Security review**: no CVEs found against `sdk-typescript`; standard npm supply-chain surface;
  secrets/credentials remain the caller's responsibility (Temporal stores no business secrets)
- **Permissions**: local process only in the spike; no network exposure beyond the local Temporal
  dev server
- **Integration boundary**: Event History is execution-replay state only, never business truth;
  every Activity calls back into existing Brain OS RPCs for any canonical read/write; the
  Workflow's own ID is the idempotency key for the check-then-act pattern that prevents duplicate
  dispatch on Activity retry
- **Update strategy**: pin SDK version explicitly in `package.json`; re-run the spike's
  kill-and-restart test after any SDK bump before touching production wiring
- **Rollback strategy**: the spike is fully isolated (own directory, no wiring into
  `dispatch-task.mjs`/`poll-and-dispatch.mjs`) — rollback is deleting the spike directory, zero
  blast radius on the production runner

## 2. google/adk-js

- **Exact upstream URL**: https://github.com/google/adk-js
- **License**: Apache-2.0
- **Version/tag/commit**: `@google/adk` v2.0.0 (~2026-08-26); commits as recent as 2026-08-28
- **Purpose**: code-first TS agent/tool/multi-agent-orchestration toolkit
- **Decision**: REFERENCE — has its own session/state/orchestration abstractions that risk
  becoming a shadow control plane if adopted directly; TS SDK still young (2026)
- **Installed?**: NO
- **Local location**: N/A
- **Security review**: no dedicated security-review doc found; no CVEs surfaced; standard GCP
  credential handling for its own tool integrations (Search/Maps/Vertex)
- **Permissions**: N/A (not integrated)
- **Integration boundary**: N/A — not adopted; if ever revisited, only as a contained execution
  provider behind the existing `AgentExecutionProvider` interface, never with its own session/
  orchestration layer wired to anything canonical
- **Update strategy**: N/A
- **Rollback strategy**: N/A

## 3. modelcontextprotocol/typescript-sdk

- **Exact upstream URL**: https://github.com/modelcontextprotocol/typescript-sdk
- **License**: Apache-2.0 (new contributions); legacy code MIT
- **Version/tag/commit**: tracks MCP spec 2026-07-28 (v2 SDK line); pin **≥1.26.0**
- **Purpose**: standard protocol/SDK for exposing safe/read-heavy Brain OS operations as tools
- **Decision**: ADOPT AS PROVIDER — Phase C/Phase 1 tool-protocol layer, read-only tools first
- **Installed?**: partially — `microsoft/playwright-mcp` already registered via this ecosystem
  (see `THIRD_PARTY_COMPONENTS.md`); the Brain-OS-authored MCP server itself not yet built
- **Local location**: (planned) `scripts/factory-runner/mcp-server/index.mjs`
- **Security review**: protocol-level authorization is **optional by spec** — the host (Brain OS)
  is always the real enforcement layer via RLS, never the MCP layer itself. **CVE-2026-25536**
  (CVSS 7.1, cross-client data leak in stateless `StreamableHTTPServerTransport` deployments that
  reuse a single server/transport instance across connections) is patched in 1.26.0 — pin at or
  above this version and use a session-scoped, not stateless-shared, transport
- **Permissions**: every tool handler independently re-runs its query under founder-JWT
  impersonation (the exact pattern already proven in `complete-run.mjs`) so Postgres RLS enforces
  access — never a service-role/bypass-RLS connection behind a tool
- **Integration boundary**: MCP is a protocol/transport only; it carries no business state and
  must never be trusted as an authorization boundary on its own
- **Update strategy**: track upstream releases, re-verify no regression in per-request session
  isolation before bumping
- **Rollback strategy**: `claude mcp remove --scope local`; server code is standalone, no schema
  dependency to unwind

## 4. a2aproject/A2A

- **Exact upstream URL**: https://github.com/a2aproject/A2A
- **License**: Apache-2.0
- **Version/tag/commit**: spec v1.0.1 (2026-05-28); v1.0.0 shipped 2026-03-12; Linux Foundation
  project
- **Purpose**: wire protocol (JSON-RPC 2.0) for cross-agent discovery/interop via signed Agent
  Cards
- **Decision**: REFERENCE — metadata-prep only (Phase E/Phase 5 of the original six-phase plan),
  no endpoint yet
- **Installed?**: NO
- **Local location**: N/A
- **Security review**: real, documented SSRF risk — a malicious agent can register an
  attacker-controlled push-notification webhook URL, turning a victim agent into an SSRF proxy;
  v1.0 added `AgentCardSignature` (JWS) against Card tampering, but webhook allow-listing is the
  implementer's own responsibility and is NOT built here yet
- **Permissions**: N/A (no endpoint stood up)
- **Integration boundary**: if a nullable `agents.a2a_agent_card jsonb` column is added later
  (static metadata only), it remains inert — no webhook field, no live endpoint, until the SSRF
  mitigation is explicitly designed
- **Update strategy**: track spec revisions; do not implement until webhook safety is designed
- **Rollback strategy**: N/A — nothing live to roll back

## 5. All-Hands-AI/OpenHands

- **Exact upstream URL**: https://github.com/All-Hands-AI/OpenHands
- **License**: MIT
- **Version/tag/commit**: v1.16.0 (2026-08-27), near-weekly release cadence
- **Purpose**: full coding-agent platform (Agent Server REST API, own conversation/workspace/
  scheduling state)
- **Decision**: ADOPT SKILLS ONLY — HIGH replacement risk; may be prototyped as a contained
  `AgentExecutionProvider` implementation only, never run as its own service/control plane
- **Installed?**: NOT YET — contained prototype planned in Phase B/Phase 2, goal is a written
  containment verdict, not adoption
- **Local location**: (planned, prototype-only) `scripts/factory-runner/providers/openhands-provider.mjs`
- **Security review**: no OpenHands-specific CVEs found; generic Docker/runC container-escape
  CVEs apply to any Docker-sandboxed agent (not OpenHands-specific); binds to `0.0.0.0` by
  default unless hardened — must never be exposed if prototyped locally; no formal third-party
  security review published
- **Permissions**: if prototyped, only ever invoked via the existing six-method
  `AgentExecutionProvider` interface — never registered with `has_production_authority = true`,
  never queried by Brain OS for business state
- **Integration boundary**: OpenHands owns its own conversation/task/workspace/automation state —
  this must never be read as canonical by any Brain OS code path
- **Update strategy**: N/A until/unless promoted past prototype
- **Rollback strategy**: prototype code is standalone; delete the provider file, zero DB footprint
  since it's never registered with production authority

## 6. SWE-agent/mini-swe-agent

- **Exact upstream URL**: https://github.com/SWE-agent/mini-swe-agent
- **License**: MIT
- **Version/tag/commit**: v2 line, latest release 2026-07-23
- **Purpose**: minimal (~100-line core) bash-only coding agent, model-agnostic via litellm
- **Decision**: ADOPT AS PROVIDER — real production candidate; closes the "no enforced sandbox"
  gap via its environment-agnostic design (`subprocess.run` swappable for `docker exec`)
- **Installed?**: NOT YET — Phase B/Phase 1 prototype planned
- **Local location**: (planned) `scripts/factory-runner/providers/mini-swe-provider.mjs`
- **Security review**: no CVEs found; explicit upstream guidance: never place secrets inside the
  sandbox (a context-injected agent could read/exfiltrate them) — use host-side credential
  injection or a network proxy instead; one historical release note excluded a compromised
  litellm version, showing supply-chain awareness upstream
- **Permissions**: sandboxed subprocess/`docker exec` execution only; no direct DB/network access
  beyond what the sandbox explicitly proxies in
- **Integration boundary**: has no state model of its own beyond a single linear transcript per
  run — cleanest of all audited components to sit purely underneath Brain OS's control plane
- **Update strategy**: pin release version; re-run the provider contract test after any bump
- **Rollback strategy**: implements the standard `AgentExecutionProvider` interface — swapping
  back to `claude_code_background` as default is a one-line dispatch-table change in
  `provider.mjs`, no data migration needed

## 7. obra/superpowers

- **Exact upstream URL**: https://github.com/obra/superpowers
- **License**: MIT
- **Version/tag/commit**: pinned to commit `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (v6.3.0)
- **Purpose**: Claude Code skills plugin (TDD, debugging, worktree isolation, planning, review)
- **Decision**: ADOPT SKILLS ONLY — already partially adopted (see `THIRD_PARTY_COMPONENTS.md`
  row); cherry-pick further specific skills after manual review, never bulk-import the full
  library
- **Installed?**: YES (partial) — `claude plugin marketplace add obra/superpowers --scope project`
  + `claude plugin install superpowers@superpowers-dev --scope project`, pinned as above
- **Local location**: Claude Code plugin cache (project-scoped); real skill load already proven
  live (`verification-before-completion` skill loaded via a real `Skill` tool call from a live
  `brain-os-implementation-engineer` session)
- **Security review**: no upstream SECURITY.md/formal review process; this project's own review
  read the one auto-executing hook (`hooks/hooks.json` → `SessionStart`) in full — confirmed
  read-only (emits JSON to stdout, no network/file-write/system-modification/exfiltration)
- **Permissions**: skill content only, runs inside Claude Code's existing tool-permission model —
  no elevated permissions of its own
- **Integration boundary**: purely additive prompt/methodology content; owns no state
- **Update strategy**: re-pin to a new commit only after re-reading any changed hook scripts;
  `claude plugin install` with the new ref
- **Rollback strategy**: `claude plugin marketplace remove` / reinstall at the prior pinned commit

## 8. wshobson/agents

- **Exact upstream URL**: https://github.com/wshobson/agents
- **License**: MIT
- **Version/tag/commit**: rolling `main`, no tagged releases; last commit 2026-08-26 (as audited)
- **Purpose**: multi-harness "agentic plugin marketplace" (93 plugins / 202 agents / 181 skills /
  105 commands per its own README)
- **Decision**: ADOPT SKILLS ONLY — selection genuinely deferred pending a real overlap check
  against the 7 existing custom Brain OS agents + already-adopted superpowers skills; not a
  blanket install
- **Installed?**: NOT YET (see `THIRD_PARTY_COMPONENTS.md` — "ADOPT PARTIALLY, integration
  deferred")
- **Local location**: N/A yet
- **Security review**: content-only, no formal audit/review pipeline for prompt content before
  merge upstream; references an external "HOL Guard" security plugin pinned to a commit hash
- **Permissions**: N/A yet — any imported skill inherits whatever permission profile Brain OS's
  own governance assigns it at import time, not whatever the upstream repo implies
- **Integration boundary**: content-only, no orchestration runtime of its own
- **Update strategy**: pin to a specific commit at import time, same discipline as superpowers
- **Rollback strategy**: N/A until first import; thereafter, same as superpowers

## 9. VoltAgent/awesome-claude-code-subagents

- **Exact upstream URL**: https://github.com/VoltAgent/awesome-claude-code-subagents
- **License**: MIT
- **Version/tag/commit**: rolling `main`, no tagged releases; 158+ subagent files
- **Purpose**: curated Markdown subagent-definition catalog across 10 specialist categories
- **Decision**: ADOPT SKILLS ONLY — lowest priority of the three collections; the repo's own
  disclaimer states "we do not audit or guarantee the security or correctness of any subagent"
- **Installed?**: NOT YET (see `THIRD_PARTY_COMPONENTS.md` — "ADOPT PARTIALLY, integration
  deferred")
- **Local location**: N/A yet
- **Security review**: none upstream by the repo's own explicit statement; every imported
  subagent must go through Brain OS's own review before use
- **Permissions**: N/A yet, same governance-assigned model as wshobson/agents
- **Integration boundary**: pure content, no orchestration/state of its own
- **Update strategy**: pin to a specific commit at import time
- **Rollback strategy**: N/A until first import

## 10. microsoft/agent-framework

- **Exact upstream URL**: https://github.com/microsoft/agent-framework
- **License**: MIT
- **Version/tag/commit**: v1.0 GA (April 2026); per-package release train (e.g.
  `python-1.16.0`, 2026-08-28)
- **Purpose**: full orchestration framework (Semantic Kernel + AutoGen successor) — Python/.NET/Go
  only, **no JS/TS SDK**
- **Decision**: REFERENCE — hard blocker (no TS SDK) plus a real CVE-lineage caution signal;
  nothing here is compellingly superior to Temporal (durable execution) or a bounded
  execution-provider prototype to justify displacing either
- **Installed?**: NO
- **Local location**: N/A
- **Security review**: predecessor/absorbed codebase Semantic Kernel carries **CVE-2026-26030**
  (prompt injection escaping an AST-filter allowlist → `os` module RCE) and **CVE-2026-25592**
  (sandbox bypass in `SessionsPythonPlugin`, fixed in .NET SK 1.71.0) — a real signal about this
  org's agent-sandboxing track record
- **Permissions**: N/A (not integrated)
- **Integration boundary**: N/A — would compete with Brain OS's control plane if ever adopted as
  an orchestration backbone; not under consideration for that role
- **Update strategy**: N/A
- **Rollback strategy**: N/A

## 11. langchain-ai/langgraphjs

- **Exact upstream URL**: https://github.com/langchain-ai/langgraphjs
- **License**: MIT
- **Version/tag/commit**: `@langchain/langgraph-sdk@1.10.0` (2026-08-26); continuous
  changeset-based releases across the monorepo; ~41.7k weekly npm downloads
- **Purpose**: TS-native library for stateful graph-based agent workflows with built-in
  checkpointing
- **Decision**: REFERENCE / bounded provider experiment only (corrected from an earlier draft
  that framed it as a production-orchestration candidate) — Brain OS's Factory Director is the
  only orchestration authority; LangGraph may at most be prototyped as one contained execution
  provider for a single bounded multi-agent task, invoked by the Factory Director like any other
  provider, never as a replacement orchestrator
- **Installed?**: NOT YET — bounded prototype only if pursued, not scheduled ahead of the core
  factory phases
- **Local location**: (if pursued) `scripts/factory-runner/langgraph-spike/`
- **Security review**: no CVEs found; supply-chain surface standard for an actively-maintained
  npm package
- **Permissions**: if prototyped, its checkpointer holds execution-layer state only (which node
  ran, retry count) — never Work Order/Task status, which stays exclusively in
  `canonical_work_orders`/`tasks`
- **Integration boundary**: real risk if misused — must never be allowed to become a second
  "state of record" for task status; every node's "tool" calls the existing
  `startRunByAgentId`/dispatch path rather than reimplementing dispatch
- **Update strategy**: N/A until/unless a bounded prototype is built
- **Rollback strategy**: N/A — no production wiring planned
